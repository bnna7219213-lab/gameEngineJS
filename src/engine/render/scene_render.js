// 统一渲染提交路径（P4 收口）：把「视锥剔除 → LOD → 实例化 → HDR 渲染 → 后处理(ACES+bloom)」
// 串成一张 RenderGraph。两后端（Software 黄金参考 / WebGL2）共用同一套可见集与 LOD 决策（红线 D），
// 仅在「绘制/后处理」节点按 device.api 分支到各自的 RHI 实现；GPU 结果须与 CPU 参考逐像素相等。
//
// 说明：后处理在 WebGL2 走 GLSL 全屏 pass（与 postfx.js 公式逐字节对齐），Software 走 CPU（postfx.js）。
// 浮点 HDR 中间缓冲：Software 现支持 rgba32f 离屏目标（见 rhi_software.js），WebGL2 启用 EXT_color_buffer_float。
import { Mat4, Vec3, AABB, Frustum } from '../core/math.js';
import { FrustumCuller, selectLOD } from './cull.js';
import { packInstanceBuffer } from './instance_buffer.js';
import { HiZBuffer } from './hiz.js';
import { RenderGraph } from './render_graph.js';
import { brightPass, separableBlur, combineBloom, tonemapACES, quantize8 } from './postfx.js';
import { jitter, resolveTAA } from './taa.js';
import { RenderAPI, vertexLayout } from './rhi.js';

// 场景几何属性布局（position / normal / uv）
const SCENE_LAYOUT = vertexLayout([{ name: 'position', type: 'f32x3' }, { name: 'normal', type: 'f32x3' }, { name: 'uv', type: 'f32x2' }]);

// 场景 pass 着色器：emissive 颜色直接来自 per-instance 颜色（线性 HDR，可 >1 触发 bloom）
const SCENE_VS_JS = (attr, uni) => {
  const m = attr.iModel.m, p = attr.position;
  const x = m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3];
  const y = m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7];
  const z = m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11];
  // 与 GLSL 路径一致：pos = uVP * (iModel * aPos)。行主序 vp.m 直接乘列向量。
  const vp = uni.uVP.m;
  const cx = vp[0] * x + vp[1] * y + vp[2] * z + vp[3];
  const cy = vp[4] * x + vp[5] * y + vp[6] * z + vp[7];
  const cz = vp[8] * x + vp[9] * y + vp[10] * z + vp[11];
  const cw = vp[12] * x + vp[13] * y + vp[14] * z + vp[15];
  return { pos: [cx, cy, cz, cw], vary: { color: attr.iColor || uni.uColor || [1, 1, 1] } };
};
const SCENE_FS_JS = (v) => [v.color[0], v.color[1], v.color[2], 1];

// GLSL 场景着色器（iModel 为 mat4 实例属性钉死在 location 3..6，iColor 在 7；
// 必须与 Software 端 _bindInstance 的 base=SCENE_LAYOUT.length(=3) 对齐，保证实例属性定位确定）
const SCENE_VS_GLSL = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec2 aUV;
layout(location=3) in mat4 iModel;
layout(location=7) in vec4 iColor;
uniform mat4 uVP;
out vec4 vColor;
void main(){
  vColor = iColor;
  gl_Position = uVP * iModel * vec4(aPos, 1.0);
}`;
const SCENE_FS_GLSL = `#version 300 es
precision highp float;
in vec4 vColor; out vec4 o;
void main(){ o = vec4(vColor.rgb, 1.0); }`;

// 后处理 pass（Fullscreen）。GLSL 与 postfx.js 完全一致（brightPass + 2D 三角核模糊 + combine + ACES + gamma）。
// R=4 与 postfx.separableBlur 半径对齐；2D 乘积核 == 串行 x/y 分离模糊（同核）。
const POST_VS_GLSL = `#version 300 es
layout(location=0) in vec3 aPos;
void main(){ gl_Position = vec4(aPos, 1.0); }`;
const POST_FS_GLSL = `#version 300 es
precision highp float;
out vec4 o;
uniform sampler2D uTex0;
uniform vec2 uTexSize;
uniform float uThreshold, uKnee, uExposure, uBloom;
vec3 aces(vec3 x, float e){
  x = max(vec3(0.0), x * e);
  return (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);
}
void main(){
  vec2 base = gl_FragCoord.xy;
  vec3 scene = texture(uTex0, base / uTexSize).rgb;
  float k = uThreshold + uKnee;
  float wsum = 0.0; vec3 acc = vec3(0.0);
  for (int ky = -4; ky <= 4; ky++) {
    for (int kx = -4; kx <= 4; kx++) {
      vec2 tuv = (base + vec2(float(kx), float(ky))) / uTexSize;
      vec3 cs = texture(uTex0, tuv).rgb;
      float ls = dot(cs, vec3(0.2126, 0.7152, 0.0722));
      float sk = ls < k ? max(0.0, ls - uThreshold) / uKnee : 1.0;
      vec3 bk = cs * sk;
      float wx = 1.0 - abs(float(kx)) / 5.0;
      float wy = 1.0 - abs(float(ky)) / 5.0;
      float w = wx * wy;
      acc += bk * w; wsum += w;
    }
  }
  vec3 blurred = acc / wsum;
  vec3 finalC = scene + blurred * uBloom;
  vec3 toned = aces(finalC, uExposure);
  vec3 g = pow(clamp(toned, 0.0, 1.0), vec3(1.0 / 2.2));
  o = vec4(g, 1.0);
}`;

export class SceneRenderer {
  constructor(device, { width = 96, height = 96 } = {}) {
    this.device = device;
    this.width = width; this.height = height;
    this.cam = { eye: [0, 0, 5], target: [0, 0, 0], up: [0, 1, 0], fovY: Math.PI / 3, near: 0.1, far: 100 };
    this.scene = { meshes: [] };
    this.postParams = { threshold: 1.0, knee: 0.5, exposure: 1.0, bloomIntensity: 0.6, radius: 4 };
    this._lastVisible = null;
    // Hi-Z 遮挡剔除 / TAA（统一提交路径的 P4 收口特性，默认关闭，按需开启）
    this.occlusion = false;        // 开启后 CPU 端做深度预pass 构建 HiZBuffer 并剔除被遮挡网格
    this.taa = false;              // 开启后逐帧 Halton 抖动 + 历史邻域 clamp 抗闪
    this.taaAlpha = 0.1;          // 历史混合权重
    this.taaScale = 1;            // 抖动像素幅度
    this._frame = 0;              // TAA 帧计数（Halton 索引）
    this._history = null;         // TAA 历史帧（Float32 RGBA）
    this._occlusionCulled = 0;    // 本帧被 Hi-Z 剔除的网格数
    this._graph = this.buildGraph(); // 统一提交路径（节点图），构建一次复用
  }
  // ---- 可选特性开关 ----
  setOcclusion(on) { this.occlusion = !!on; }
  setTAA(on, opts = {}) { this.taa = !!on; if (opts.alpha != null) this.taaAlpha = opts.alpha; if (opts.scale != null) this.taaScale = opts.scale; }
  resetTAA() { this._history = null; this._frame = 0; }
  setCamera(c) { Object.assign(this.cam, c); }
  setScene(s) { this.scene = s; }

  // 构建 RenderGraph（遮挡预pass → 剔除 → 绘制 → 后处理 → 呈现）。
  // prepass 节点仅在 occlusion 开启时构建 HiZBuffer，并写入 ctx.hiz 供 cull 节点复用。
  buildGraph() {
    const g = new RenderGraph();
    g.addNode('prepass', (ctx) => { this._prepare(ctx); });
    g.addNode('cull', (ctx) => { this._cull(ctx); });
    g.addNode('draw', (ctx) => { this._drawHDR(ctx); });
    g.addNode('post', (ctx) => { ctx.out = this._present(ctx); });
    g.addEdge('prepass', 'cull');
    g.addEdge('cull', 'draw');
    g.addEdge('draw', 'post');
    return g;
  }

  // 统一渲染入口：组装 ctx → 经 RenderGraph 同步执行（prepass→cull→draw→post），
  // 与 buildGraph() 保持同一套节点语义，确保遮挡/TAA 真正走统一提交路径。
  render() {
    const dev = this.device, W = this.width, H = this.height;
    const ctx = { device: dev, scene: this.scene, cam: this.cam, width: W, height: H };
    this._graph.runSync(ctx);
    return ctx.out;
  }

  // 准备阶段（CPU，两后端共用）：计算 vp / 视锥；TAA 抖动；occlusion 时做深度预pass 构建 HiZ
  _prepare(ctx) {
    const W = ctx.width, H = ctx.height;
    let proj = Mat4.perspective(this.cam.fovY, W / H, this.cam.near, this.cam.far);
    if (this.taa) {
      const j = jitter(this._frame, W, H, this.taaScale);
      const p = proj.clone();
      p.m[12] += j.x * 2 / W;  // NDC.x 偏移（子像素）
      p.m[13] -= j.y * 2 / H;  // NDC.y 偏移（屏幕 y 向下）
      proj = p;
      this._frame++;
    }
    const view = Mat4.lookAt(Vec3.of(...this.cam.eye), Vec3.of(...this.cam.target), Vec3.of(...this.cam.up));
    const vp = proj.mul(view);
    ctx.proj = proj; ctx.view = view; ctx.vp = vp;
    ctx.frustum = Frustum.fromViewProj(vp);
    if (this.occlusion) {
      const depth = this._depthPrepass(vp, W, H);
      const hz = new HiZBuffer(); hz.build(depth, W, H);
      ctx.hiz = hz; ctx.depth = depth;
    }
  }

  // 可见集规划（调用 _plan，重置本帧遮挡计数）
  _cull(ctx) {
    this._occlusionCulled = 0;
    ctx.draws = this._plan(ctx.vp, ctx.frustum, ctx.hiz);
    ctx.visibleCount = ctx.draws.length;
    this._lastVisible = ctx.draws;
  }

  // HDR 绘制：把可见集渲染进浮点 HDR 目标（两后端各自 RHI 实现）
  _drawHDR(ctx) {
    const dev = ctx.device, W = ctx.width, H = ctx.height;
    const hdrTex = dev.createTexture({ width: W, height: H, format: 'rgba32f', minFilter: 'nearest', magFilter: 'nearest' });
    const hdrRT = dev.createRenderTarget({ textures: [hdrTex] });
    dev.beginFrame();
    dev.beginPass({ targets: [hdrRT], clearColor: [0, 0, 0, 1] });
    for (const d of ctx.draws) this._drawMesh(dev, d, ctx.vp);
    dev.endPass();
    ctx.hdrTex = hdrTex; ctx.hdrRT = hdrRT;
  }

  // 后处理 + （可选）TAA 历史混合，返回呈现帧 { width, height, rgba }
  _present(ctx) {
    const dev = ctx.device, W = ctx.width, H = ctx.height;
    let out;
    if (dev.api === RenderAPI.Software) {
      const hdr = dev.readRenderTarget(ctx.hdrRT.id).rgba;
      out = this._cpuPost(hdr, W, H);
    } else {
      const presentTex = dev.createTexture({ width: W, height: H, minFilter: 'nearest', magFilter: 'nearest' });
      const presentRT = dev.createRenderTarget({ textures: [presentTex] });
      dev.beginPass({ targets: [presentRT], clearColor: [0, 0, 0, 0] });
      this._drawPostGL(dev, ctx.hdrTex, W, H);
      dev.endPass();
      out = dev.readTexture(presentTex).rgba;
    }
    dev.endFrame();
    if (this.taa) out = this._resolveTAA(out, W, H);
    return { width: W, height: H, rgba: out };
  }

  // TAA 历史混合：邻域 clamp 后按 alpha 与历史帧融合；维护 _history 供下一帧复用
  // 入参 out 为裸 RGBA 数组（与 _present 的 Software/GL 两条路径一致），返回解析后的裸 RGBA 数组
  _resolveTAA(out, W, H) {
    const n = W * H * 4;
    const cur = new Float32Array(n);
    for (let i = 0; i < n; i++) cur[i] = out[i];
    // 尺寸变化（如窗口 resize）时历史帧长度不匹配，丢弃过期历史，首帧回退到当前帧
    if (this._history && this._history.length !== n) this._history = null;
    const resolved = resolveTAA(this._history, cur, this.taaAlpha);
    this._history = resolved;
    const rgba = new Uint8Array(n);
    for (let i = 0; i < n; i++) rgba[i] = Math.max(0, Math.min(255, Math.round(resolved[i])));
    return rgba;
  }

  // CPU 深度预pass（遮挡参考核心）：仅渲染 occluder 网格，输出 [0,1] 最小深度缓冲(0 近 1 远)
  _depthPrepass(vp, W, H) {
    const depth = new Float32Array(W * H).fill(1);
    const m = vp.m;
    const meshes = this.scene.meshes || [];
    const instGroups = this.scene.instances || [];
    for (let mi = 0; mi < meshes.length; mi++) {
      const mesh = meshes[mi];
      if (!mesh.occluder) continue;
      const inst = instGroups.find((g) => g.mesh === mi);
      const matrices = inst ? inst.matrices : [mesh.transform || Mat4.identity()];
      const pos = mesh.positions, idx = mesh.indices;
      if (!pos || !idx) continue;
      const n = pos.length / 3;
      // 逐实例写入深度：实例化遮挡物(如多面墙)的每个实例都需进入 HiZ
      for (const mat of matrices) {
        const clipped = new Array(n);
        for (let v = 0; v < n; v++) {
          const wp = applyMat(mat.m, [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]]);
          const cw = m[12] * wp[0] + m[13] * wp[1] + m[14] * wp[2] + m[15];
          const cx = m[0] * wp[0] + m[1] * wp[1] + m[2] * wp[2] + m[3];
          const cy = m[4] * wp[0] + m[5] * wp[1] + m[6] * wp[2] + m[7];
          const cz = m[8] * wp[0] + m[9] * wp[1] + m[10] * wp[2] + m[11];
          clipped[v] = [cx, cy, cz, cw];
        }
        for (let t = 0; t < idx.length; t += 3) this._rasterDepth(clipped[idx[t]], clipped[idx[t + 1]], clipped[idx[t + 2]], depth, W, H);
      }
    }
    return depth;
  }

  // 透视正确的深度光栅化：在屏幕空间线性插值裁剪坐标(含 w)，再除 w 得 ndc.z→[0,1]，取最近(小)深度
  _rasterDepth(v0, v1, v2, depth, W, H) {
    if (v0[3] <= 0 || v1[3] <= 0 || v2[3] <= 0) return; // 任意顶点在近平裁剪面之后 → 跳过(不做裁剪，参考近似)
    const toScr = (v) => {
      const iw = 1 / v[3];
      const nx = v[0] * iw, ny = v[1] * iw;
      return [(nx * 0.5 + 0.5) * W, (1 - (ny * 0.5 + 0.5)) * H, v[2] * iw * 0.5 + 0.5];
    };
    const s0 = toScr(v0), s1 = toScr(v1), s2 = toScr(v2);
    let minX = Math.max(0, Math.floor(Math.min(s0[0], s1[0], s2[0])));
    let maxX = Math.min(W - 1, Math.ceil(Math.max(s0[0], s1[0], s2[0])));
    let minY = Math.max(0, Math.floor(Math.min(s0[1], s1[1], s2[1])));
    let maxY = Math.min(H - 1, Math.ceil(Math.max(s0[1], s1[1], s2[1])));
    if (minX > maxX || minY > maxY) return;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5, py = y + 0.5;
        const w0 = (s1[0] - s0[0]) * (py - s0[1]) - (s1[1] - s0[1]) * (px - s0[0]);
        const w1 = (s2[0] - s1[0]) * (py - s1[1]) - (s2[1] - s1[1]) * (px - s1[0]);
        const w2 = (s0[0] - s2[0]) * (py - s2[1]) - (s0[1] - s2[1]) * (px - s2[0]);
        const area = w0 + w1 + w2;
        if (Math.abs(area) < 1e-9) continue; // 仅剔除退化三角形（area 可正可负）
        const a = w0 / area, b = w1 / area, c = w2 / area;
        // 接受 CW / CCW 两种缠绕，仅剔除真正在三角形之外（同号判定）
        if (!((a >= 0 && b >= 0 && c >= 0) || (a <= 0 && b <= 0 && c <= 0))) continue;
        const cw = a * v0[3] + b * v1[3] + c * v2[3];
        if (cw <= 0) continue;
        // 引擎透视矩阵 ndc.z: 近→-1、远→+1（标准约定）；转为 0=近、1=远（与 HiZBuffer 约定一致）
        const nz = ((a * v0[2] + b * v1[2] + c * v2[2]) / cw) * 0.5 + 0.5;
        const idx = y * W + x;
        if (nz < depth[idx]) depth[idx] = nz;
      }
    }
  }

  // ---- 可见集规划（CPU，两后端共用）----
  _plan(vp, frustum, hiz) {
    const draws = [];
    const meshes = this.scene.meshes || [];
    const instGroups = this.scene.instances || [];
    for (let mi = 0; mi < meshes.length; mi++) {
      const mesh = meshes[mi];
      const baseAABB = mesh.aabb || computeAABB(mesh.positions);
      const inst = instGroups.find((g) => g.mesh === mi);
      let items;
      if (inst) items = inst.matrices.map((m, i) => ({ matrix: m, color: inst.colors ? inst.colors[i] : [1, 1, 1] }));
      else items = [{ matrix: mesh.transform || Mat4.identity(), color: mesh.color || [1, 1, 1] }];
      // 合并 AABB（所有实例）
      let uMin = [Infinity, Infinity, Infinity], uMax = [-Infinity, -Infinity, -Infinity];
      for (const it of items) { const [mn, mx] = transformAABB(baseAABB.min, baseAABB.max, it.matrix); uMin = min3(uMin, mn); uMax = max3(uMax, mx); }
      const box = new AABB(Vec3.of(uMin[0], uMin[1], uMin[2]), Vec3.of(uMax[0], uMax[1], uMax[2]));
      if (!frustum.intersects(box)) continue;
      // LOD（仅非实例化网格）
      let geom = mesh;
      if (!inst && mesh.lodVariants && mesh.lodVariants.length) {
        const d = camDist(this.cam, box);
        const lod = selectLOD(d, mesh.lodThresholds || [20, 50]);
        geom = mesh.lodVariants[Math.min(lod, mesh.lodVariants.length - 1)] || mesh;
      }
      // Hi-Z 遮挡（可选）：hiz 由 _prepare 的深度预pass 构建；物体最*近*点仍远于遮挡物最*近*点 ⇒ 整物体落在遮挡物之后 ⇒ 剔除。
      // 遮挡物本身免于被剔除——它们是深度参考，叠放遮挡物中靠后者也须保留以继续遮挡更远的物体。
      if (hiz && !mesh.occluder) {
        const ndc = projectBox(box, vp);
        if (hiz.isOccluded(ndc)) { this._occlusionCulled++; continue; }
      }
      const matrices = items.map((it) => it.matrix);
      const colors = new Float32Array(items.length * 4);
      items.forEach((it, i) => { colors[i * 4] = it.color[0]; colors[i * 4 + 1] = it.color[1]; colors[i * 4 + 2] = it.color[2]; colors[i * 4 + 3] = 1; });
      draws.push({ mesh: geom, matrices, colors });
    }
    return draws;
  }

  _drawMesh(dev, d, vp) {
    const mesh = d.mesh;
    const inter = packInterleaved(mesh.positions, mesh.normals, mesh.uvs);
    const vb = dev.createBuffer({ data: new Float32Array(inter) });
    const ib = dev.createBuffer({ data: mesh.indices });
    const inst = packInstanceBuffer(d.matrices, { colors: d.colors });
    const instH = dev.createBuffer({ data: inst.data });
    const instLayout = { base: SCENE_LAYOUT.length, hasColor: true, stride: inst.strideFloats * 4 };
    const desc = { glsl: { vs: SCENE_VS_GLSL, fs: SCENE_FS_GLSL }, js: { vs: SCENE_VS_JS, fs: SCENE_FS_JS } };
    const sh = dev.createShader(desc);
    const pipe = dev.createPipeline({ shader: sh, vertexLayout: SCENE_LAYOUT, depth: false, cull: 'none', topology: 'triangles', instanceLayout: instLayout });
    dev.setPipeline(pipe);
    dev.setVertexBuffer(vb);
    dev.setIndexBuffer(ib, 'u32');
    dev.setInstanceBuffer(instH, { strideFloats: inst.strideFloats, hasColor: inst.hasColor });
    dev.setConstants({ uVP: vp });
    dev.drawIndexed(mesh.indices.length, inst.count);
  }

  // CPU 后处理（Software / 黄金参考）
  _cpuPost(hdr, W, H) {
    const p = this.postParams;
    const bright = brightPass(hdr, W, H, p.threshold, p.knee);
    const bx = separableBlur(bright, W, H, p.radius, 'x');
    const by = separableBlur(bx, W, H, p.radius, 'y');
    const combined = combineBloom(hdr, W, H, by, W, H, p.bloomIntensity);
    const toned = tonemapACES(combined, W, H, p.exposure);
    return quantize8(toned);
  }
  // GPU 后处理（WebGL2 GLSL pass）
  _drawPostGL(dev, hdrTex, W, H) {
    const p = this.postParams;
    const quad = new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]);
    const ib = new Uint32Array([0, 1, 2, 0, 2, 3]);
    const vb = dev.createBuffer({ data: quad });
    const idx = dev.createBuffer({ data: ib });
    const sh = dev.createShader({ glsl: { vs: POST_VS_GLSL, fs: POST_FS_GLSL } });
    const pipe = dev.createPipeline({ shader: sh, vertexLayout: vertexLayout([{ name: 'position', type: 'f32x3' }]), depth: false });
    dev.setPipeline(pipe);
    dev.setVertexBuffer(vb);
    dev.setIndexBuffer(idx, 'u32');
    dev.bindTexture(0, hdrTex);
    dev.setConstants({ uTex0: 0, uTexSize: [W, H], uThreshold: p.threshold, uKnee: p.knee, uExposure: p.exposure, uBloom: p.bloomIntensity });
    dev.drawIndexed(6);
  }
}

// ---------- 辅助 ----------
function packInterleaved(positions, normals, uvs) {
  const n = positions.length / 3;
  const out = new Float32Array(n * 8);
  for (let i = 0; i < n; i++) {
    out[i * 8] = positions[i * 3]; out[i * 8 + 1] = positions[i * 3 + 1]; out[i * 8 + 2] = positions[i * 3 + 2];
    out[i * 8 + 3] = normals ? normals[i * 3] : 0; out[i * 8 + 4] = normals ? normals[i * 3 + 1] : 0; out[i * 8 + 5] = normals ? normals[i * 3 + 2] : 0;
    out[i * 8 + 6] = uvs ? uvs[i * 2] : 0; out[i * 8 + 7] = uvs ? uvs[i * 2 + 1] : 0;
  }
  return out;
}
function computeAABB(positions) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) for (let c = 0; c < 3; c++) { mn[c] = Math.min(mn[c], positions[i + c]); mx[c] = Math.max(mx[c], positions[i + c]); }
  return { min: mn, max: mx };
}
function applyMat(m, p) {
  return [m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3], m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7], m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11], m[12] * p[0] + m[13] * p[1] + m[14] * p[2] + m[15]];
}
function transformAABB(min, max, mat) {
  const m = mat.m; const cs = [];
  for (let i = 0; i < 8; i++) cs.push(applyMat(m, [i & 1 ? max[0] : min[0], i & 2 ? max[1] : min[1], i & 4 ? max[2] : min[2]]));
  const nmn = [Infinity, Infinity, Infinity], nmx = [-Infinity, -Infinity, -Infinity];
  for (const c of cs) for (let k = 0; k < 3; k++) { nmn[k] = Math.min(nmn[k], c[k]); nmx[k] = Math.max(nmx[k], c[k]); }
  return [nmn, nmx];
}
function min3(a, b) { return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])]; }
function max3(a, b) { return [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])]; }
function camDist(cam, box) {
  const cx = (box.min.x + box.max.x) / 2, cy = (box.min.y + box.max.y) / 2, cz = (box.min.z + box.max.z) / 2;
  return Math.hypot(cx - cam.eye[0], cy - cam.eye[1], cz - cam.eye[2]);
}
// 投影 AABB → NDC 盒 + 最远点深度(0..1)，供 Hi-Z 遮挡查询
function projectBox(box, vp) {
  const m = vp.m; const cs = [];
  for (let i = 0; i < 8; i++) {
    const w = applyMat(m, [i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z]);
    const iw = 1 / (w[3] || 1e-9);
    // 引擎透视矩阵 ndc.z: 近→-1、远→+1（标准约定）；转为 0=近、1=远（与 HiZBuffer 约定一致）
    cs.push([w[0] * iw, w[1] * iw, (w[2] * iw) * 0.5 + 0.5]);
  }
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const c of cs) { minX = Math.min(minX, c[0]); maxX = Math.max(maxX, c[0]); minY = Math.min(minY, c[1]); maxY = Math.max(maxY, c[1]); minZ = Math.min(minZ, c[2]); maxZ = Math.max(maxZ, c[2]); }
  return { minX, maxX, minY, maxY, minZ, maxZ };
}
