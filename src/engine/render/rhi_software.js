// SoftwareDevice：纯 CPU 光栅器（黄金参考后端）。实现 IRenderDevice 的最小可用子集：
// 顶点着色(js) → 齐次裁剪（近/远平面）→ 透视除法 → 视口变换 → 透视正确三角形光栅
// → 背面剔除 → 深度测试 → 片元着色(js) → RGBA8。
// 与 WebGL2 语义对齐（frontFace=CCW、cull=back 剔除背面、像素中心 +0.5、w∈[-w,w] 裁剪），
// 作为 parity 的黄金基准（红线 D）。
import { IRenderDevice, DeviceCaps, RenderAPI, layoutStride } from './rhi.js';
import { Mat4 } from '../core/math.js';
import { mat4FromColumnMajor } from './instance_buffer.js';

function normColor(c) {
  if (!c) return [0, 0, 0, 255];
  const m = Math.max(c[0] || 0, c[1] || 0, c[2] || 0, c[3] === undefined ? 1 : c[3]);
  return m <= 1 ? [c[0] * 255, c[1] * 255, c[2] * 255, (c[3] === undefined ? 1 : c[3]) * 255]
                : [c[0], c[1], c[2], c[3] === undefined ? 255 : c[3]];
}

function readAttr(vb, idx, layout) {
  const stride = layoutStride(layout) / 4;
  const base = idx * stride;
  const out = {};
  for (const it of layout) {
    const c = { f32: 1, f32x2: 2, f32x3: 3, f32x4: 4, u32: 1 }[it.type] || 1;
    const o = base + it.offset / 4;
    out[it.name] = c === 1 ? vb[o] : [vb[o], vb[o + 1], vb[o + 2], vb[o + 3]].slice(0, c);
  }
  return out;
}

export class SoftwareDevice extends IRenderDevice {
  constructor() {
    super(RenderAPI.Software);
    this.caps = new DeviceCaps({ api: 'software', maxMRT: 1, compute: true, indirect: false, maxTextureSize: 4096 });
    this.buffers = new Map(); this.textures = new Map(); this.shaders = new Map(); this.pipelines = new Map();
    this.rts = new Map();
    this._next = 1; this.fb = null; this.cur = null; this.vb = null; this.ib = null; this.uni = {};
    this._ibFmt = 'u32';
    this._activeFB = null;
    this.instVb = null; this.instStride = 16; this.instHasColor = false;
  }
  async init(opts = {}) {
    this.resize(opts.width || 64, opts.height || 64);
    if (!this.fb) this._makeFB(this.width, this.height);
    return true;
  }
  resize(w, h) { super.resize(w, h); if (this.fb) this._makeFB(w, h); }
  _makeFB(w, h) { this.fb = { w, h, rgba: new Uint8Array(w * h * 4), z: new Float32Array(w * h).fill(Infinity), float: false }; }

  createBuffer({ byteLength, data }) {
    const id = this._next++;
    const arr = data ? (data instanceof Float32Array ? data : new Float32Array(data))
                     : new Float32Array((byteLength || 4) / 4);
    this.buffers.set(id, arr); return { id };
  }
  writeBuffer(h, data, byteOffset = 0) {
    const arr = this.buffers.get(h.id);
    const src = data instanceof Float32Array ? data : new Float32Array(data);
    for (let i = 0; i < src.length; i++) arr[i + (byteOffset / 4 | 0)] = src[i];
  }
  createTexture({ width, height, format, data }) {
    const id = this._next++;
    const isFloat = format === 'rgba32f';
    const d = isFloat ? (data ? new Float32Array(data) : new Float32Array(width * height * 4))
                      : (data ? new Uint8Array(data) : new Uint8Array(width * height * 4));
    this.textures.set(id, { w: width, h: height, fmt: format, data: d, float: isFloat }); return { id };
  }
  createShader({ js }) { const id = this._next++; this.shaders.set(id, js || {}); return { id }; }
  createPipeline({ shader, vertexLayout, targets, depth, cull = 'none', blend = null, topology = 'triangles' } = {}) {
    const id = this._next++;
    this.pipelines.set(id, { shader, vertexLayout, targets, depth, cull, blend, topology });
    return { id };
  }
  // 离屏渲染目标：浮点(RGBA32F) 或 8-bit，供 HDR 中间缓冲与后处理链（黄金参考）。
  createRenderTarget({ textures, depth, samples = 1 } = {}) {
    const t = this.textures.get(textures[0].id) || textures[0];
    const isFloat = t.fmt === 'rgba32f';
    const fb = {
      w: t.w, h: t.h, float: isFloat,
      rgba: isFloat ? new Float32Array(t.w * t.h * 4) : new Uint8Array(t.w * t.h * 4),
      z: new Float32Array(t.w * t.h).fill(Infinity),
    };
    const rt = { id: this._next++, w: t.w, h: t.h, color: t.id, fb, depth: depth ? depth.id : null, samples: samples || 1 };
    this.rts.set(rt.id, rt); return rt;
  }

  beginFrame() { if (!this.fb) this._makeFB(this.width, this.height); this._activeFB = this.fb; }
  beginPass({ targets, clearColor } = {}) {
    if (!this.fb) this._makeFB(this.width, this.height);
    if (targets && targets[0]) { const rt = this.rts.get(targets[0].id); this._activeFB = rt ? rt.fb : this.fb; }
    else this._activeFB = this.fb;
    const fb = this._activeFB; const w = fb.w, h = fb.h;
    const c = clearColor || [0, 0, 0, 255];
    if (fb.float) {
      for (let i = 0; i < w * h; i++) { fb.rgba[i * 4] = c[0]; fb.rgba[i * 4 + 1] = c[1]; fb.rgba[i * 4 + 2] = c[2]; fb.rgba[i * 4 + 3] = c[3] === undefined ? 1 : c[3]; }
    } else {
      const cc = normColor(c);
      for (let i = 0; i < w * h; i++) { fb.rgba[i * 4] = cc[0]; fb.rgba[i * 4 + 1] = cc[1]; fb.rgba[i * 4 + 2] = cc[2]; fb.rgba[i * 4 + 3] = cc[3] || 255; }
    }
    fb.z.fill(Infinity);
  }
  setPipeline(p) { this.cur = this.pipelines.get(p.id); }
  setVertexBuffer(h) { this.vb = this.buffers.get(h.id); }
  setIndexBuffer(h, format = 'u32') { this.ib = this.buffers.get(h.id); this._ibFmt = format; }
  setConstants(o) { this.uni = o || {}; }
  bindTexture(slot, tex) { this.uni['tex' + slot] = this.textures.get(tex.id); }
  // 绑定逐实例属性缓冲（扁平 Float32Array：每实例 16 列主序矩阵 + 可选 4 颜色）。
  // layout: { strideFloats, hasColor }；设置后 drawIndexed/draw 的 instanceCount>1 即按实例循环。
  setInstanceBuffer(h, layout = {}) {
    this.instVb = (h && h.id != null) ? this.buffers.get(h.id) : null;
    this.instStride = layout.strideFloats || (this.instVb ? this.instVb.length : 16) || 16;
    this.instHasColor = !!layout.hasColor;
  }

  drawIndexed(count, instanceCount = 1) {
    const sh = this.shaders.get(this.cur.shader.id); const layout = this.cur.vertexLayout;
    if (!sh || !sh.vs || !sh.fs) return;
    const idxCount = count || (this.ib ? this.ib.length : 0);
    if (this.instVb && instanceCount >= 1) { this._instCount = instanceCount; this._drawInstanced(() => { const idx = this.ib; const n = idxCount; const out = []; for (let i = 0; i < n; i++) { const a = readAttr(this.vb, idx[i], layout); const av = Object.assign({}, a, this._instAttr()); const o = sh.vs(av, this.uni); out.push({ pos: o.pos, vary: o.vary || {} }); } return out; }); return; }
    const vsOut = [];
    for (let i = 0; i < idxCount; i++) {
      const idx = this.ib[i]; const attr = readAttr(this.vb, idx, layout);
      const o = sh.vs(attr, this.uni); vsOut.push({ pos: o.pos, vary: o.vary || {} });
    }
    this._raster(vsOut, sh);
  }
  draw(count, instanceCount = 1) {
    const sh = this.shaders.get(this.cur.shader.id); const layout = this.cur.vertexLayout;
    if (!sh || !sh.vs || !sh.fs) return;
    if (this.instVb && instanceCount >= 1) { this._instCount = instanceCount; this._drawInstanced(() => { const n = count || 0; const out = []; for (let i = 0; i < n; i++) { const a = readAttr(this.vb, i, layout); const av = Object.assign({}, a, this._instAttr()); const o = sh.vs(av, this.uni); out.push({ pos: o.pos, vary: o.vary || {} }); } return out; }); return; }
    const vsOut = [];
    for (let i = 0; i < (count || 0); i++) { const attr = readAttr(this.vb, i, layout); const o = sh.vs(attr, this.uni); vsOut.push({ pos: o.pos, vary: o.vary || {} }); }
    this._raster(vsOut, sh);
  }
  // 取当前实例的属性（每实例调用一次，由外层循环推进实例索引）
  _instAttr() {
    const ioff = this._instIdx * this.instStride;
    const a = { iModel: mat4FromColumnMajor(this.instVb, ioff) };
    if (this.instHasColor) a.iColor = [this.instVb[ioff + 16], this.instVb[ioff + 17], this.instVb[ioff + 18], this.instVb[ioff + 19]];
    return a;
  }
  _drawInstanced(buildFn) {
    const sh = this.shaders.get(this.cur.shader.id);
    for (let inst = 0; inst < this._instCount; inst++) { this._instIdx = inst; this._raster(buildFn(), sh); }
  }

  _raster(vsOut, sh) {
    const topo = this.cur.topology;
    if (topo === 'points') { for (const v of vsOut) this._point(v, sh); return; }
    if (topo === 'lines') { for (let i = 0; i + 1 < vsOut.length; i += 2) this._line(vsOut[i], vsOut[i + 1], sh); return; }
    for (let t = 0; t + 2 < vsOut.length; t += 3) {
      this._triClip(vsOut[t], vsOut[t + 1], vsOut[t + 2], sh, this.cur.cull);
    }
  }

  // 齐次裁剪空间顶点（含 w 与 vary），供裁剪插值
  _clipVert(p) { return { x: p.pos[0], y: p.pos[1], z: p.pos[2], w: p.pos[3] || 1, vary: p.vary }; }
  // 单平面 Sutherland-Hodgman：保留 nx*x+ny*y+nz*z+nw*w >= 0 的一侧
  _clipPlane(verts, nx, ny, nz, nw) {
    const out = [];
    const d = (v) => nx * v.x + ny * v.y + nz * v.z + nw * v.w;
    for (let i = 0; i < verts.length; i++) {
      const cur = verts[i], nxt = verts[(i + 1) % verts.length];
      const dc = d(cur), dn = d(nxt);
      if (dc >= 0) out.push(cur);
      if ((dc >= 0) !== (dn >= 0) && dn !== dc) out.push(this._lerpV(cur, nxt, dc / (dc - dn)));
    }
    return out;
  }
  _lerpV(a, b, t) {
    const v = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, w: a.w + (b.w - a.w) * t, vary: {} };
    for (const k in a.vary) {
      const ca = Array.isArray(a.vary[k]) ? a.vary[k] : [a.vary[k]];
      const cb = Array.isArray(b.vary[k]) ? b.vary[k] : [b.vary[k]];
      const o = []; for (let i = 0; i < ca.length; i++) o.push(ca[i] + (cb[i] - ca[i]) * t);
      v.vary[k] = o.length === 1 ? o[0] : o;
    }
    return v;
  }
  // 背面剔除（frontFace=CCW）：剔除后调用裁剪，再光栅化
  _triClip(a, b, c, sh, cull) {
    const v0 = this._clipVert(a), v1 = this._clipVert(b), v2 = this._clipVert(c);
    const area = (v1.x - v0.x) * (v2.y - v0.y) - (v1.y - v0.y) * (v2.x - v0.x); // NDC 空间有向面积（未翻转 y）
    if (cull === 'back' && area < 0) return;
    if (cull === 'front' && area > 0) return;
    let verts = this._clipPlane([v0, v1, v2], 0, 0, 1, 1);   // 近平面 z >= -w
    if (verts.length < 3) return;
    verts = this._clipPlane(verts, 0, 0, -1, 1);             // 远平面 z <= w
    if (verts.length < 3) return;
    for (let i = 0; i + 2 < verts.length; i += 3) this._rasterTri(verts[i], verts[i + 1], verts[i + 2], sh);
  }

  _rasterTri(a, b, c, sh) {
    const fb = this._activeFB; const w = fb.w, h = fb.h;
    const ndc = (v) => { const iw = 1 / (v.w || 1); return [v.x * iw, v.y * iw, v.z * iw, iw]; };
    const A = ndc(a), B = ndc(b), C = ndc(c);
    const toPix = (p) => [Math.round((p[0] * 0.5 + 0.5) * w), Math.round((1 - (p[1] * 0.5 + 0.5)) * h), p[2]];
    const Pa = toPix(A), Pb = toPix(B), Pc = toPix(C);
    const minX = Math.max(0, Math.min(Pa[0], Pb[0], Pc[0])), maxX = Math.min(w - 1, Math.max(Pa[0], Pb[0], Pc[0]));
    const minY = Math.max(0, Math.min(Pa[1], Pb[1], Pc[1])), maxY = Math.min(h - 1, Math.max(Pa[1], Pb[1], Pc[1]));
    const denom = (Pb[1] - Pc[1]) * (Pa[0] - Pc[0]) + (Pc[0] - Pb[0]) * (Pa[1] - Pc[1]);
    if (Math.abs(denom) < 1e-9) return;
    const keys = new Set();
    for (const k in a.vary) keys.add(k);
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const sx = x + 0.5, sy = y + 0.5; // 像素中心 +0.5（对齐 GL 栅格化语义）
      const w0 = ((Pb[1] - Pc[1]) * (sx - Pc[0]) + (Pc[0] - Pb[0]) * (sy - Pc[1])) / denom;
      const w1 = ((Pc[1] - Pa[1]) * (sx - Pc[0]) + (Pa[0] - Pc[0]) * (sy - Pc[1])) / denom;
      const w2 = 1 - w0 - w1;
      if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) continue;
      const iw = w0 * A[3] + w1 * B[3] + w2 * C[3];
      if (iw <= 0) continue;
      const z = (w0 * A[2] + w1 * B[2] + w2 * C[2]);
      const px = y * w + x;
      if (z >= fb.z[px]) continue;
      const vary = {};
      for (const k of keys) {
        const va = a.vary[k], vb = b.vary[k], vc = c.vary[k];
        const ca = Array.isArray(va) ? va : [va], cb = Array.isArray(vb) ? vb : [vb], cc = Array.isArray(vc) ? vc : [vc];
        const out = [];
        for (let ci = 0; ci < ca.length; ci++) out.push((w0 * ca[ci] * A[3] + w1 * cb[ci] * B[3] + w2 * cc[ci] * C[3]) / iw);
        vary[k] = out.length === 1 ? out[0] : out;
      }
      const col = sh.fs(vary, this.uni);
      fb.z[px] = z;
      const alpha = col[3] === undefined ? (fb.float ? 1 : 255) : col[3];
      if (fb.float) { fb.rgba[px * 4] = col[0]; fb.rgba[px * 4 + 1] = col[1]; fb.rgba[px * 4 + 2] = col[2]; fb.rgba[px * 4 + 3] = alpha; }
      else { fb.rgba[px * 4] = col[0] | 0; fb.rgba[px * 4 + 1] = col[1] | 0; fb.rgba[px * 4 + 2] = col[2] | 0; fb.rgba[px * 4 + 3] = alpha | 0; }
    }
  }
  _point(v, sh) {
    const ndc = v.pos; const iw = 1 / (ndc[3] || 1);
    const fb = this._activeFB;
    const x = Math.round((ndc[0] * iw * 0.5 + 0.5) * fb.w), y = Math.round((1 - (ndc[1] * iw * 0.5 + 0.5)) * fb.h);
    if (x < 0 || y < 0 || x >= fb.w || y >= fb.h) return;
    const col = sh.fs(v.vary, this.uni);
    const px = y * fb.w + x;
    const a = col[3] === undefined ? (fb.float ? 1 : 255) : col[3];
    if (fb.float) { fb.rgba[px * 4] = col[0]; fb.rgba[px * 4 + 1] = col[1]; fb.rgba[px * 4 + 2] = col[2]; fb.rgba[px * 4 + 3] = a; }
    else { fb.rgba[px * 4] = col[0] | 0; fb.rgba[px * 4 + 1] = col[1] | 0; fb.rgba[px * 4 + 2] = col[2] | 0; fb.rgba[px * 4 + 3] = a | 0; }
  }
  _line(a, b, sh) {
    const ndc = (v) => { const iw = 1 / (v.pos[3] || 1); return [v.pos[0] * iw, v.pos[1] * iw]; };
    const A = ndc(a), B = ndc(b);
    const fb = this._activeFB;
    const x0 = Math.round((A[0] * 0.5 + 0.5) * fb.w), y0 = Math.round((1 - (A[1] * 0.5 + 0.5)) * fb.h);
    const x1 = Math.round((B[0] * 0.5 + 0.5) * fb.w), y1 = Math.round((1 - (B[1] * 0.5 + 0.5)) * fb.h);
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps, x = Math.round(x0 + (x1 - x0) * t), y = Math.round(y0 + (y1 - y0) * t);
      if (x < 0 || y < 0 || x >= fb.w || y >= fb.h) continue;
      const vary = {}; for (const k in a.vary) { const ca = Array.isArray(a.vary[k]) ? a.vary[k] : [a.vary[k]]; const cb = Array.isArray(b.vary[k]) ? b.vary[k] : [b.vary[k]]; const o = ca.map((v, i) => v + (cb[i] - v) * t); vary[k] = o.length === 1 ? o[0] : o; }
      const col = sh.fs(vary, this.uni);
      const px = y * fb.w + x;
      const alpha = col[3] === undefined ? (fb.float ? 1 : 255) : col[3];
      if (fb.float) { fb.rgba[px * 4] = col[0]; fb.rgba[px * 4 + 1] = col[1]; fb.rgba[px * 4 + 2] = col[2]; fb.rgba[px * 4 + 3] = alpha; }
      else { fb.rgba[px * 4] = col[0] | 0; fb.rgba[px * 4 + 1] = col[1] | 0; fb.rgba[px * 4 + 2] = col[2] | 0; fb.rgba[px * 4 + 3] = alpha | 0; }
    }
  }

  endPass() {}
  endFrame() {}

  snapshot(targetId) {
    if (targetId != null) { const rt = this.rts.get(targetId); if (rt) return { width: rt.fb.w, height: rt.fb.h, rgba: rt.fb.rgba.slice() }; }
    if (!this.fb) this._makeFB(this.width, this.height);
    return { width: this.fb.w, height: this.fb.h, rgba: this.fb.rgba.slice() };
  }
  readRenderTarget(id) { const rt = this.rts.get(id); if (!rt) return null; return { width: rt.w, height: rt.h, rgba: rt.fb.rgba.slice(), float: rt.fb.float }; }
  resolveRenderTarget(id) { /* Software 不支持 MSAA 多重采样，直接无操作（优雅降级）*/ }
  present() { return this.fb.rgba.slice(); }
  destroy() { super.destroy(); this.fb = null; }
}
