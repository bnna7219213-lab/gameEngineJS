// 视口：把 Scene3D 渲染到 canvas（对应 python/ide 的 3D 视口）。
// 渲染路径：Scene3D → 图元几何 → Viewport3D(device) → RGBA8 → putImageData。
// device 为 WebGL2Device 时走 GPU 路径（P5 GPU 视口），null/SoftwareDevice 时走软渲染黄金参考；
// 两条路径经同一 Viewport3D 接口，输出均为 RGBA8，gizmo 2D 覆盖层零改动（红线 D：软件参考永不下线）。
// 网格映射 meshId→objId 支持视口点选；网格地面用线框三角形近似。
import { Viewport3D } from '../engine/render/viewport3d.js';
import { WebGL2Device } from '../engine/render/rhi_webgl2.js';
import { RenderAPI } from '../engine/render/rhi.js';
import { Mat4, Vec3 } from '../engine/core/math.js';

// 创建视口后端设备：webgl2 成功则返 WebGL2Device，否则回退 null（软渲染）。
// init 失败（无 GL 上下文/浏览器限制）一律安全回退，绝不抛错（红线 A）。
export async function createViewportDevice(backend) {
  if (backend === 'webgl2') {
    try {
      const d = new WebGL2Device();
      if (await d.init({ width: 64, height: 64 })) return d;
    } catch (e) { /* 回退 Software */ }
  }
  return null; // software / 后端不可用
}

export class ViewportPanel {
  constructor(ctx, canvas, opts = {}) {
    this.ctx = ctx; this.canvas = canvas;
    const isGPU = opts.device && opts.device.api === RenderAPI.WebGL2;
    this.backend = isGPU ? 'webgl2' : 'software';
    this.vp = new Viewport3D(opts.device || null, { width: canvas.width, height: canvas.height });
    this.cam = { theta: 0.7, phi: 0.5, dist: 9, target: [0, 0.5, 0] };
    this.showGrid = true;
    this.meshToObj = new Map();
    this.lastMs = 0; this.drawCalls = 0;
    this._applyCam();
  }
  _applyCam() {
    const c = this.cam;
    const eye = [
      c.target[0] + c.dist * Math.cos(c.phi) * Math.sin(c.theta),
      c.target[1] + c.dist * Math.sin(c.phi),
      c.target[2] + c.dist * Math.cos(c.phi) * Math.cos(c.theta),
    ];
    this.vp.setCamera({ eye, target: c.target, up: [0, 1, 0] });
    this.eye = eye;
  }
  resize() {
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(64, Math.floor(r.width)), h = Math.max(64, Math.floor(r.height));
    if (w !== this.canvas.width || h !== this.canvas.height) {
      this.canvas.width = w; this.canvas.height = h;
      this.vp.resize(w, h);
    }
  }
  // 把场景对象转为视口网格；mesh 组件缺失时跳过（空对象/灯光只画 gizmo 标记）
  // sceneOverride 用于 Play 模式：传入运行时快照场景，编辑场景不被改动（红线 F）
  syncScene(sceneOverride) {
    const s = sceneOverride || this.ctx.project.scene();
    this.vp.meshes.clear(); this.meshToObj.clear();
    if (!s) return;
    if (this.showGrid) this._addGrid();
    for (const o of s.objects.values()) {
      const mc = (o.components || {}).mesh;
      const tr = worldTransform(s, o);
      if (!mc) { this._addMarker(o, tr); continue; }
      const cg = mc.customGeo;
      const geo = cg ? {
        positions: new Float32Array(cg.positions),
        normals: new Float32Array(cg.normals),
        indices: new Uint32Array(cg.indices),
      } : primitive(mc.shape || 'cube');
      const id = this.vp.addMesh({
        positions: geo.positions, normals: geo.normals, indices: geo.indices,
        albedo: mc.albedo || [200, 200, 200], rough: mc.rough ?? 0.8, metal: mc.metal ?? 0,
        emissive: mc.emissive || [0, 0, 0], transform: tr,
      });
      this.meshToObj.set(id, o.id);
    }
  }
  _addGrid() {
    const N = 10, pos = [], nor = [], idx = [];
    let vi = 0;
    for (let i = -N; i <= N; i++) {
      // 两条细长三角形带近似网格线
      const t = 0.02;
      for (const [a, b, c, d] of [
        [[i, 0, -N], [i + t, 0, -N], [i + t, 0, N], [i, 0, N]],
        [[-N, 0, i], [-N, 0, i + t], [N, 0, i + t], [N, 0, i]],
      ]) {
        for (const p of [a, b, c, d]) { pos.push(...p); nor.push(0, 1, 0); }
        idx.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3); vi += 4;
      }
    }
    this.vp.addMesh({
      positions: new Float32Array(pos), normals: new Float32Array(nor),
      indices: new Uint32Array(idx), albedo: [70, 74, 88],
    });
  }
  _addMarker(obj, tr) {
    // 无 mesh 的对象画一个小十字（三条细盒）
    const p = tr.position, s = 0.25, t = 0.03;
    const geo = primitive('cube');
    for (const ax of [[s, t, t], [t, s, t], [t, t, s]]) {
      const id = this.vp.addMesh({
        positions: geo.positions, normals: geo.normals, indices: geo.indices,
        albedo: obj.components?.light ? [255, 230, 120] : [120, 160, 255],
        transform: { position: [...p], rotation: [0, 0, 0], scale: ax },
      });
      this.meshToObj.set(id, obj.id);
    }
  }
  render(sceneOverride) {
    const t0 = performance.now();
    this.syncScene(sceneOverride);
    this.drawCalls = this.vp.meshes.size;
    const rgba = this.vp.renderToRGBA8();
    const img = new ImageData(new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, this.vp.width * this.vp.height * 4), this.vp.width, this.vp.height);
    const g = this.canvas.getContext('2d');
    g.putImageData(img, 0, 0);
    this.lastMs = performance.now() - t0;
  }
  pick(sx, sy) {
    const hit = this.vp.pick(sx, sy);
    if (!hit) return null;
    return this.meshToObj.get(hit.id) ?? null;
  }
}

// 组合父链变换（行主序 M = T·R·S，世界 = parentWorld · local）
export function worldTransform(scene, obj) {
  let m = Mat4.compose(Vec3.of(...obj.transform.position), Vec3.of(...obj.transform.rotation), Vec3.of(...obj.transform.scale));
  let p = obj.parent;
  while (p) {
    const lp = Mat4.compose(Vec3.of(...p.transform.position), Vec3.of(...p.transform.rotation), Vec3.of(...p.transform.scale));
    m = lp.mul(m); p = p.parent;
  }
  const t = m.applyPoint(Vec3.of(0, 0, 0));
  // Viewport3D 只接受 TRS 近似；父级旋转缩放的精确矩阵由 worldMatrix 承担，
  // 这里用平移 + 本对象旋转缩放（编辑器常规层级足够；深度嵌套旋转为已知简化）。
  return {
    position: [t.x, t.y, t.z],
    rotation: [...obj.transform.rotation],
    scale: [...obj.transform.scale],
  };
}

// 图元几何：委派到 src/engine/render/primitives.js（D8 收编，消除重复实现）
import { primitive as primitiveImpl } from '../engine/render/primitives.js';
export function primitive(shape) {
  return primitiveImpl(shape || 'cube');
}
