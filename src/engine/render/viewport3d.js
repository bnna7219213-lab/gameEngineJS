// Viewport3D：基于 SoftwareDevice 的视口。导出视口/编辑器所需的统一接口：
// setCamera / addMesh / resize / render / renderToRGBA8 / pick / project / ray（project↔ray 互逆）。
import { Mat4, Vec3, AABB } from '../core/math.js';
import { SoftwareDevice } from './rhi_software.js';
import { RenderAPI, vertexLayout } from './rhi.js';
import { buildPbrShader, orthoLightVP, renderShadowMap } from './pbr.js';
import { packLights } from './lights.js';

const vlayout = vertexLayout([{ name: 'position', type: 'f32x3' }, { name: 'normal', type: 'f32x3' }]);

export class Viewport3D {
  constructor(device, { width = 320, height = 240 } = {}) {
    this.device = device || new SoftwareDevice();
    this.width = width; this.height = height;
    if (!device) { this.owned = true; }
    this.meshes = new Map();
    this._nextId = 1;
    this.cam = { eye: [0, 0, 5], target: [0, 0, 0], up: [0, 1, 0], fovY: Math.PI / 3, near: 0.1, far: 100 };
    this.vp = Mat4.identity();
    this.view = Mat4.identity();
    this.proj = Mat4.identity();
    this.lights = [];
    this.ambient = [0.04, 0.05, 0.07];
    this.fog = null;
    this.shadowSize = 256;
    this.ibl = null; // { sh:9x3, avg:[r,g,b], intensity } 由 setIBL/bakeSkySH 设置
    this._pbr = buildPbrShader();
    this._litLayout = vertexLayout([{ name: 'position', type: 'f32x3' }, { name: 'normal', type: 'f32x3' }, { name: 'uv', type: 'f32x2' }]);
    this._ensureDevice();
  }
  async _ensureDevice() {
    if (this.device.api !== RenderAPI.Software && this.owned === undefined) return;
    if (this.device.width !== this.width || this.device.height !== this.height) this.device.resize(this.width, this.height);
    if (!this.device.fb) await this.device.init({ width: this.width, height: this.height });
  }

  setCamera(c) { Object.assign(this.cam, c); this._updateVP(); }
  _updateVP() {
    const aspect = this.width / this.height;
    const proj = Mat4.perspective(this.cam.fovY, aspect, this.cam.near, this.cam.far);
    const view = Mat4.lookAt(Vec3.of(...this.cam.eye), Vec3.of(...this.cam.target), Vec3.of(...this.cam.up));
    this.vp = proj.mul(view);
    this.proj = proj; this.view = view;
  }

  setLights(lights) { this.lights = lights || []; }
  setAmbient(a) { this.ambient = a || [0.04, 0.05, 0.07]; }
  setFog(fog) { this.fog = fog || null; }
  setIBL(ibl) { this.ibl = ibl || null; } // ibl={ sh, avg, intensity } 或 null 复位为平铺 ambient

  addMesh({ positions, normals, indices, albedo = [200, 200, 200], rough = 0.8, metal = 0, emissive = [0, 0, 0], transform = null } = {}) {
    const id = this._nextId++;
    const mesh = { id, positions, normals: normals || positions, indices: indices || new Uint32Array([]), albedo, rough, metal, emissive, transform, aabb: aabbOf(positions, transform) };
    this.meshes.set(id, mesh);
    return id;
  }
  removeMesh(id) { this.meshes.delete(id); }
  resize(w, h) { this.width = w; this.height = h; this.device.resize(w, h); this._updateVP(); }

  _shader(albedo) {
    return {
      js: {
        vs: (attr, uni) => {
          const h = uni.mvp.transformH([attr.position[0], attr.position[1], attr.position[2], 1]);
          return { pos: h, vary: { normal: attr.normal, color: uni.color || [0.8, 0.8, 0.8] } };
        },
        fs: (vary) => {
          const n = vary.normal; const l = [0.4, 0.8, 0.5];
          let nl = n[0] * l[0] + n[1] * l[1] + n[2] * l[2]; if (nl < 0) nl = -nl;
          const c = vary.color; const k = 0.3 + 0.7 * nl;
          return [Math.min(255, c[0] * k + 0), Math.min(255, c[1] * k), Math.min(255, c[2] * k), 255];
        },
      },
      // GLSL 对等（WebGL2 路径）：uniform 名与 setConstants 的 mvp/color 对齐，
      // 着色与 js 分支完全一致（ambient 0.3 + 0.7*|N·L|，L=[0.4,0.8,0.5]，红线 D：双写 parity 2/255）
      glsl: {
        vs: `#version 300 es
layout(location=0) in vec3 aPosition;
layout(location=1) in vec3 aNormal;
uniform mat4 mvp;
out vec3 vNormal;
void main(){ gl_Position = mvp * vec4(aPosition, 1.0); vNormal = aNormal; }`,
        fs: `#version 300 es
precision highp float;
in vec3 vNormal;
uniform vec3 color;
out vec4 o;
void main(){
  vec3 l = normalize(vec3(0.4, 0.8, 0.5));
  vec3 n = normalize(vNormal);
  float nl = dot(n, l); if (nl < 0.0) nl = -nl;
  float k = 0.3 + 0.7 * nl;
  o = vec4(color * k, 1.0);
}`,
      },
    };
  }

  render() {
    if (this.lights.length > 0) return this._renderLit();
    return this._renderUnlit();
  }

  _renderUnlit() {
    if (!this.device.fb) this.device.init({ width: this.width, height: this.height });
    this._updateVP();
    this.device.beginFrame();
    this.device.beginPass({ clearColor: [18, 18, 26, 255] });
    for (const mesh of this.meshes.values()) {
      const vb = this.device.createBuffer({ data: packInterleaved(mesh.positions, mesh.normals) });
      const ib = this.device.createBuffer({ data: mesh.indices });
      const sh = this.device.createShader(this._shader(mesh.albedo));
      const pipe = this.device.createPipeline({ shader: sh, vertexLayout: vlayout });
      const world = mesh.transform ? Mat4.compose(Vec3.of(...(mesh.transform.position || [0, 0, 0])), Vec3.of(...(mesh.transform.rotation || [0, 0, 0])), Vec3.of(...(mesh.transform.scale || [1, 1, 1]))) : Mat4.identity();
      this.device.setPipeline(pipe);
      this.device.setVertexBuffer(vb);
      this.device.setIndexBuffer(ib);
      this.device.setConstants({ mvp: this.vp.mul(world), color: mesh.albedo.map(x => x / 255) });
      this.device.drawIndexed(mesh.indices.length);
    }
    this.device.endPass();
    this.device.endFrame();
  }

  _renderLit() {
    const dev = this.device;
    if (!dev.fb) dev.init({ width: this.width, height: this.height });
    this._updateVP();
    dev.beginFrame();
    dev.beginPass({ clearColor: [18, 18, 26, 255] });

    // 方向光阴影：CPU 参考预通行（红线 D：黄金参考先有），两后端共享同一深度图
    let swShadows = null;
    const glShadow = { on: 0, vp: null, bias: 0.0025, map: null };
    const dirLight = this.lights.find(L => L.type === 0 && L.shadow);
    if (dirLight) {
      const radius = dirLight.shadow.radius || 12;
      const lvp = orthoLightVP(dirLight.direction, [0, 0, 0], radius);
      const map = renderShadowMap(this._meshList(), lvp, this.shadowSize);
      swShadows = this.lights.map(L => (L.type === 0 && L.shadow) ? { map, size: this.shadowSize, vp: lvp, bias: L.shadow.bias || 0.0025 } : null);
      glShadow.on = 1; glShadow.vp = lvp; glShadow.bias = dirLight.shadow.bias || 0.0025; glShadow.map = map;
    }
    const pk = packLights(this.lights);
    let glShadowTex = null;
    if (dev.api === RenderAPI.WebGL2 && glShadow.on) {
      glShadowTex = dev.createTexture({ width: this.shadowSize, height: this.shadowSize, format: 'rgba32f', data: mapToRGBA32F(glShadow.map, this.shadowSize) });
    }

    const sh = dev.createShader(this._pbr);
    const pipe = dev.createPipeline({ shader: sh, vertexLayout: this._litLayout, depth: true, cull: 'none' });
    for (const mesh of this.meshes.values()) {
      const vb = dev.createBuffer({ data: packLit(mesh.positions, mesh.normals) });
      const ib = dev.createBuffer({ data: mesh.indices });
      const world = mesh.transform ? Mat4.compose(Vec3.of(...(mesh.transform.position || [0, 0, 0])), Vec3.of(...(mesh.transform.rotation || [0, 0, 0])), Vec3.of(...(mesh.transform.scale || [1, 1, 1]))) : Mat4.identity();
      dev.setPipeline(pipe);
      dev.setVertexBuffer(vb);
      dev.setIndexBuffer(ib);
      const albedo = (mesh.albedo || [200, 200, 200]).map(x => x / 255);
      const metallic = mesh.metal || 0;
      const roughness = mesh.rough == null ? 0.8 : mesh.rough;
      const emissive = (mesh.emissive || [0, 0, 0]).map(x => x / 255);
      const uni = {
        model: world, viewProj: this.vp, view: this.view, eye: this.cam.eye,
        ambient: this.ambient, lights: this.lights,
        albedo, metallic, roughness, emissive, fog: this.fog, shadows: swShadows,
        uLightCount: pk.count, uLightType: pk.type, uLightColor: pk.color,
        uLightPos: pk.pos, uLightDir: pk.dir, uLightParam: pk.param,
        ibl: this.ibl,
        uUseSH: this.ibl ? 1 : 0,
        uSH: this.ibl ? flattenSH(this.ibl.sh) : null,
        uSHAvg: this.ibl ? this.ibl.avg : [0, 0, 0],
        uIBLIntensity: this.ibl ? (this.ibl.intensity == null ? 1 : this.ibl.intensity) : 1,
      };
      if (dev.api === RenderAPI.WebGL2 && glShadow.on && glShadowTex) {
        dev.bindTexture(0, glShadowTex);
        uni.uShadowOn = 1; uni.uShadowMap = 0; uni.uLightVP = glShadow.vp; uni.uShadowBias = glShadow.bias; uni.uUseTex = 0;
      }
      dev.setConstants(uni);
      dev.drawIndexed(mesh.indices.length);
    }
    dev.endPass();
    dev.endFrame();
  }

  _meshList() {
    const out = [];
    for (const m of this.meshes.values()) out.push({ positions: m.positions, indices: m.indices, transform: m.transform });
    return out;
  }

  renderToRGBA8() { this.render(); return this.device.snapshot().rgba; }

  // 拾取：射线-网格 AABB（取最近）
  pick(screenX, screenY) {
    const r = this.ray(screenX, screenY);
    let best = null, bestT = Infinity;
    for (const mesh of this.meshes.values()) {
      const hit = rayAABB(r.o, r.d, mesh.aabb);
      if (hit != null && hit < bestT) { bestT = hit; best = mesh.id; }
    }
    return best != null ? { id: best, t: bestT } : null;
  }

  project(worldPos) {
    const p = this.vp.transformPoint(Vec3.of(worldPos[0], worldPos[1], worldPos[2]));
    const w = this.width, h = this.height;
    return { x: (p.x * 0.5 + 0.5) * w, y: (1 - (p.y * 0.5 + 0.5)) * h, z: p.z };
  }
  ray(screenX, screenY) {
    const ndcX = (screenX / this.width) * 2 - 1;
    const ndcY = 1 - (screenY / this.height) * 2;
    const inv = this.vp.invert();
    const near = inv.transformPoint(Vec3.of(ndcX, ndcY, 0));
    const far = inv.transformPoint(Vec3.of(ndcX, ndcY, 1));
    const o = [near.x, near.y, near.z];
    const d = [far.x - o[0], far.y - o[1], far.z - o[2]];
    const len = Math.hypot(...d); return { o, d: [d[0] / len, d[1] / len, d[2] / len] };
  }
}

function packInterleaved(positions, normals) {
  const n = positions.length / 3;
  const out = new Float32Array(n * 6);
  for (let i = 0; i < n; i++) {
    out[i * 6] = positions[i * 3]; out[i * 6 + 1] = positions[i * 3 + 1]; out[i * 6 + 2] = positions[i * 3 + 2];
    out[i * 6 + 3] = normals[i * 3]; out[i * 6 + 4] = normals[i * 3 + 1]; out[i * 6 + 5] = normals[i * 3 + 2];
  }
  return out;
}
function packLit(positions, normals) {
  const n = positions.length / 3;
  const out = new Float32Array(n * 8);
  for (let i = 0; i < n; i++) {
    out[i * 8] = positions[i * 3]; out[i * 8 + 1] = positions[i * 3 + 1]; out[i * 8 + 2] = positions[i * 3 + 2];
    out[i * 8 + 3] = normals[i * 3]; out[i * 8 + 4] = normals[i * 3 + 1]; out[i * 8 + 5] = normals[i * 3 + 2];
    out[i * 8 + 6] = 0; out[i * 8 + 7] = 0; // uv（无贴图时占位）
  }
  return out;
}
function mapToRGBA32F(map, size) {
  const out = new Float32Array(size * size * 4);
  for (let i = 0; i < size * size; i++) out[i * 4] = map[i];
  return out;
}
// 9 个 [r,g,b] 系数 → 27 长度扁平数组（GLSL uniform3fv 按 9 个 vec3 上传）
function flattenSH(sh) {
  const out = new Float32Array(27);
  for (let i = 0; i < 9; i++) { out[i * 3] = sh[i][0]; out[i * 3 + 1] = sh[i][1]; out[i * 3 + 2] = sh[i][2]; }
  return out;
}
function aabbOf(positions, transform) {
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    let x = positions[i], y = positions[i + 1], z = positions[i + 2];
    if (transform && transform.position) { x += transform.position[0]; y += transform.position[1]; z += transform.position[2]; }
    for (let c = 0; c < 3; c++) { const v = [x, y, z][c]; mn[c] = Math.min(mn[c], v); mx[c] = Math.max(mx[c], v); }
  }
  return new AABB(Vec3.of(mn[0], mn[1], mn[2]), Vec3.of(mx[0], mx[1], mx[2]));
}
function rayAABB(o, d, aabb) {
  const inv = [1 / (d[0] || 1e-12), 1 / (d[1] || 1e-12), 1 / (d[2] || 1e-12)];
  let tmin = -Infinity, tmax = Infinity;
  for (let i = 0; i < 3; i++) {
    const mn = i === 0 ? aabb.min.x : i === 1 ? aabb.min.y : aabb.min.z;
    const mx = i === 0 ? aabb.max.x : i === 1 ? aabb.max.y : aabb.max.z;
    let t1 = (mn - o[i]) * inv[i], t2 = (mx - o[i]) * inv[i];
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin > 0 ? tmin : (tmax > 0 ? tmax : null);
}
