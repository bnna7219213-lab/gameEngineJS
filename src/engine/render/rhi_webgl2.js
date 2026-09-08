// WebGL2 后端（P1 重写：真 RHI，取代「89 行玩具」）。
// 消费 vertexLayout（任意 interleaved 布局）、pipeline 声明的 uniforms/samplers、
// 真实纹理采样、渲染目标（MRT + depth）、光栅状态（topology/cull/blend/winding）。
// 行主序矩阵按 D2 用 uniformMatrix4fv(loc, true, m) 上传（即同一矩阵，消除 M^T 错位）。
// Node 下 init 返回 false → 自动降级 Software；浏览器下为可运行的生产级后端。
import { IRenderDevice, DeviceCaps, RenderAPI, Format, layoutStride } from './rhi.js';

// 顶点属性类型 → GL 顶点规格
const ATTR = {
  f32:   { size: 1, gl: 'FLOAT',         integer: false },
  f32x2: { size: 2, gl: 'FLOAT',         integer: false },
  f32x3: { size: 3, gl: 'FLOAT',         integer: false },
  f32x4: { size: 4, gl: 'FLOAT',         integer: false },
  u32:   { size: 1, gl: 'UNSIGNED_INT',  integer: true },
  u16:   { size: 1, gl: 'UNSIGNED_SHORT', integer: true },
};
const TOPO = { triangles: 'TRIANGLES', lines: 'LINES', points: 'POINTS' };
const BLEND_FACTOR = {
  zero: 'ZERO', one: 'ONE', srcAlpha: 'SRC_ALPHA', oneMinusSrcAlpha: 'ONE_MINUS_SRC_ALPHA',
  srcColor: 'SRC_COLOR', oneMinusSrcColor: 'ONE_MINUS_SRC_COLOR', dstAlpha: 'DST_ALPHA',
  oneMinusDstAlpha: 'ONE_MINUS_DST_ALPHA', dstColor: 'DST_COLOR', oneMinusDstColor: 'ONE_MINUS_DST_COLOR',
};
const FILTER = { nearest: 'NEAREST', linear: 'LINEAR' };
const WRAP = { clamp: 'CLAMP_TO_EDGE', repeat: 'REPEAT', mirror: 'MIRRORED_REPEAT' };

function normColor(c) {
  if (!c) return [0, 0, 0, 255];
  // 红线契约兼容：0..1 浮点（如 [0.2,0.4,0.6,1]）与 0..255（如 [16,18,28,255]）双约定
  const m = Math.max(c[0] || 0, c[1] || 0, c[2] || 0, c[3] === undefined ? 1 : c[3]);
  return m <= 1 ? [c[0] * 255, c[1] * 255, c[2] * 255, (c[3] === undefined ? 1 : c[3]) * 255] : [c[0], c[1], c[2], c[3] === undefined ? 255 : c[3]];
}

export class WebGL2Device extends IRenderDevice {
  constructor() {
    super(RenderAPI.WebGL2);
    this.caps = new DeviceCaps({ api: 'webgl2', maxMRT: 4, compute: false, indirect: false, maxTextureSize: 8192, floatRenderTargets: true });
    this._gl = null;
    this._next = 1;
    this._programs = new Map();
    this._bufs = new Map();
    this._texs = new Map();
    this._texMeta = new Map();
    this._progs = new Map();
    this._rts = new Map();
    this._cur = null; this._topology = null; this._vb = null; this._ib = null; this._ibFmt = null;
    this._instVb = null; this._instLayout = null; this._instBound = null;
  }

  async init(opts = {}) {
    try {
      if (typeof document === 'undefined') return false;
      const canvas = opts.canvas || document.createElement('canvas');
      this.width = canvas.width = opts.width || 64;
      this.height = canvas.height = opts.height || 64;
      const gl = canvas.getContext('webgl2', { antialias: false, depth: true, premultipliedAlpha: false });
      if (!gl) return false;
      this._gl = gl; this._canvas = canvas;
      // 浮点渲染目标（HDR 后处理）与浮点纹理线性采样所需扩展
      gl.getExtension('EXT_color_buffer_float');
      gl.getExtension('OES_texture_float_linear');
      this.fb = { w: this.width, h: this.height }; // 初始化哨兵，供 Viewport3D 的 !dev.fb 守护
      return true;
    } catch (e) { return false; }
  }

  _compile(type, src) {
    const gl = this._gl; const sh = gl.createShader(type);
    gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error('glsl compile: ' + gl.getShaderInfoLog(sh));
    return sh;
  }

  createShader({ glsl, js } = {}) {
    const gl = this._gl; const id = this._next++;
    if (!glsl || !glsl.vs || !glsl.fs) throw new Error('[WebGL2] createShader 需要 glsl.{vs,fs}');
    const vs = this._compile(gl.VERTEX_SHADER, glsl.vs);
    const fs = this._compile(gl.FRAGMENT_SHADER, glsl.fs);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(prog));
    gl.deleteShader(vs); gl.deleteShader(fs);
    this._programs.set(id, prog);
    return { id };
  }

  createPipeline({ shader, vertexLayout = null, targets = 1, depth = false, cull = 'none', blend = null, topology = 'triangles', uniforms, samplers, instanceLayout = null } = {}) {
    const id = this._next++; const prog = this._programs.get(shader.id);
    const p = { id, prog, vertexLayout, depth: !!depth, cull, blend, topology, targets, declUniforms: uniforms, declSamplers: samplers, instLayout: instanceLayout };
    this._reflect(p);
    this._progs.set(id, p);
    return { id };
  }

  // 反射程序 uniform：缓存 location 与类型；sampler 按名尾数字映射到 slot
  _reflect(p) {
    const gl = this._gl; gl.useProgram(p.prog);
    const n = gl.getProgramParameter(p.prog, gl.ACTIVE_UNIFORMS);
    const uniforms = new Map(); const samplers = new Map();
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p.prog, i);
      let name = info.name; if (name.endsWith('[0]')) name = name.slice(0, -3);
      const loc = gl.getUniformLocation(p.prog, info.name);
      const isSampler = info.type === gl.SAMPLER_2D || info.type === gl.SAMPLER_CUBE ||
        info.type === gl.INT_SAMPLER_2D || info.type === gl.UNSIGNED_INT_SAMPLER_2D;
      if (isSampler) {
        const m = name.match(/(\d+)$/); const slot = m ? parseInt(m[1], 10) : samplers.size;
        samplers.set(slot, { loc, name });
      } else {
        uniforms.set(name, { loc, type: info.type, size: info.size });
      }
    }
    p._uniforms = uniforms; p._samplers = samplers;
  }

  createBuffer({ byteLength, data, usage } = {}) {
    const gl = this._gl; const id = this._next++;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    const arr = data instanceof Float32Array || data instanceof Uint32Array || data instanceof Uint16Array
      ? data : new Float32Array(data || new Array((byteLength || 4) / 4).fill(0));
    gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
    this._bufs.set(id, buf);
    return { id };
  }
  writeBuffer(h, data, byteOffset = 0) {
    const gl = this._gl; const buf = this._bufs.get(h.id);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    const arr = data instanceof Float32Array ? data : new Float32Array(data);
    gl.bufferSubData(gl.ARRAY_BUFFER, byteOffset, arr);
  }

  createTexture({ width, height, format = 'rgba8', data = null, minFilter = 'nearest', magFilter = 'nearest', wrapS = 'clamp', wrapT = 'clamp' } = {}) {
    const gl = this._gl; const id = this._next++; const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    let internal = gl.RGBA8, type = gl.UNSIGNED_BYTE, fmt = gl.RGBA;
    if (format === 'rgba16f') { internal = gl.RGBA16F; type = gl.HALF_FLOAT; }
    else if (format === 'rgba32f') { internal = gl.RGBA32F; type = gl.FLOAT; }
    else if (format === 'depth32f') { internal = gl.DEPTH_COMPONENT32F; fmt = gl.DEPTH_COMPONENT; type = gl.FLOAT; }
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, width, height, 0, fmt, type, data || null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, FILTER[minFilter] || gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, FILTER[magFilter] || gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, WRAP[wrapS] || gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, WRAP[wrapT] || gl.CLAMP_TO_EDGE);
    this._texs.set(id, tex);
    this._texMeta.set(id, { w: width, h: height, fmt: format, sampler: { minFilter, magFilter, wrapS, wrapT } });
    return { id };
  }

  createRenderTarget({ textures, depth = null, samples = 1 } = {}) {
    const gl = this._gl; const id = this._next++;
    const t0 = textures[0]; const meta0 = this._texMeta.get(t0.id) || t0;
    const w = meta0.w, h = meta0.h;
    if (samples > 1) {
      // 多重采样：color/depth 走 multisample renderbuffer（fbo）；解析目标为 textures[0]（resolveFbo）
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      const colorRB = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, colorRB);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA8, w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, colorRB);
      const depthRb = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, depthRb);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT32F, w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthRb);
      const resolveFbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, resolveFbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this._texs.get(textures[0].id), 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      const rt = { id, fbo, resolveFbo, colorRB, depthRb, w, h, color: textures.map((t) => t.id), samples };
      this._rts.set(id, rt);
      return { id };
    }
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    const drawBufs = [];
    textures.forEach((t, i) => {
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, this._texs.get(t.id), 0);
      drawBufs.push(gl.COLOR_ATTACHMENT0 + i);
    });
    if (drawBufs.length > 1) gl.drawBuffers(drawBufs); else gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    let depthRb = null;
    if (depth) {
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this._texs.get(depth.id), 0);
    } else {
      depthRb = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, depthRb);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT32F, w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthRb);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const rt = { id, fbo, depthRb, w, h, color: textures.map((t) => t.id), samples: 1 };
    this._rts.set(id, rt);
    return { id };
  }

  // MSAA 解析：把多重采样 fbo blit 到解析纹理（调用方在 endPass 后调用，再 readTexture）
  resolveRenderTarget(id) {
    const gl = this._gl; const rt = this._rts.get(id);
    if (!rt || !rt.samples) return;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, rt.fbo);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, rt.resolveFbo);
    gl.blitFramebuffer(0, 0, rt.w, rt.h, 0, 0, rt.w, rt.h, gl.COLOR_BUFFER_BIT, gl.LINEAR);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  beginFrame() {}
  resize(w, h) {
    super.resize(w, h);
    if (this._gl && this._canvas) {
      this._canvas.width = w; this._canvas.height = h;
      this._gl.viewport(0, 0, w, h);
    }
  }
  beginPass({ targets, clearColor = [0, 0, 0, 255], clearDepth = 1 } = {}) {
    const gl = this._gl;
    let fbo = null, w = this.width, h = this.height;
    if (targets && targets[0]) { const rt = this._rts.get(targets[0].id); fbo = rt.fbo; w = rt.w; h = rt.h; }
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, w, h);
    const c = normColor(clearColor);
    gl.clearColor(c[0] / 255, c[1] / 255, c[2] / 255, c[3] / 255);
    gl.clearDepth(clearDepth);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  }

  setPipeline(p) {
    const gl = this._gl; const slot = this._progs.get(p.id);
    this._cur = slot; gl.useProgram(slot.prog);
    if (slot.depth) { gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true); }
    else gl.disable(gl.DEPTH_TEST);
    if (!slot.cull || slot.cull === 'none') gl.disable(gl.CULL_FACE);
    else { gl.enable(gl.CULL_FACE); gl.cullFace(slot.cull === 'front' ? gl.FRONT : gl.BACK); }
    gl.frontFace(gl.CCW);
    if (slot.blend) {
      const b = typeof slot.blend === 'object' ? slot.blend : { src: 'srcAlpha', dst: 'oneMinusSrcAlpha' };
      gl.enable(gl.BLEND);
      gl.blendFunc(BLEND_FACTOR[b.src] || gl.SRC_ALPHA, BLEND_FACTOR[b.dst] || gl.ONE_MINUS_SRC_ALPHA);
    } else gl.disable(gl.BLEND);
    this._topology = TOPO[slot.topology] || gl.TRIANGLES;
  }

  setVertexBuffer(h) { this._vb = this._bufs.get(h.id); }
  setIndexBuffer(h, format = 'u32') { this._ib = this._bufs.get(h.id); this._ibFmt = format === 'u16' ? this._gl.UNSIGNED_SHORT : this._gl.UNSIGNED_INT; }
  // 绑定逐实例属性缓冲（divisor=1）。layout 取 pipeline.instLayout（{ base, hasColor, stride }），
  // 调用方需保证 GLSL 中 in 变量 location 与 base 对齐（顶点属性之后接续）。
  setInstanceBuffer(h) { this._instVb = h && h.id != null ? this._bufs.get(h.id) : null; }

  setConstants(o) {
    if (!o) return; const gl = this._gl; const p = this._cur; if (!p) return;
    for (const k in o) {
      const u = p._uniforms && p._uniforms.get(k); if (!u) continue;
      const v = o[k];
      const arr = Array.isArray(v) || v instanceof Float32Array || v instanceof Int32Array;
      switch (u.type) {
        case gl.FLOAT: arr ? gl.uniform1fv(u.loc, v) : gl.uniform1f(u.loc, v); break;
        case gl.INT: arr ? gl.uniform1iv(u.loc, v) : gl.uniform1i(u.loc, v); break;
        case gl.FLOAT_VEC2: gl.uniform2fv(u.loc, v); break;
        case gl.FLOAT_VEC3: gl.uniform3fv(u.loc, v); break;
        case gl.FLOAT_VEC4: gl.uniform4fv(u.loc, v); break;
        case gl.FLOAT_MAT4: gl.uniformMatrix4fv(u.loc, true, v && v.m ? v.m : v); break; // D2: 行主序 → transpose=true；兼容 Mat4 对象或 Float32Array
        default: break;
      }
    }
  }

  bindTexture(slot, tex, sampler) {
    const gl = this._gl; const p = this._cur; if (!p) return;
    const glTex = this._texs.get(tex.id); const meta = this._texMeta.get(tex.id) || {};
    const s = sampler || meta.sampler || {};
    gl.activeTexture(gl.TEXTURE0 + slot);
    gl.bindTexture(gl.TEXTURE_2D, glTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, FILTER[s.minFilter] || gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, FILTER[s.magFilter] || gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, WRAP[s.wrapS] || gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, WRAP[s.wrapT] || gl.CLAMP_TO_EDGE);
    const sm = p._samplers && p._samplers.get(slot);
    if (sm) gl.uniform1i(sm.loc, slot);
  }

  _bindInstance(il) {
    const gl = this._gl; if (!il || !this._instVb) return;
    const stride = il.stride;
    gl.bindBuffer(gl.ARRAY_BUFFER, this._instVb);
    for (let k = 0; k < 4; k++) {
      const loc = il.base + k;
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, stride, k * 16);
      gl.vertexAttribDivisor(loc, 1);
    }
    if (il.hasColor) {
      const loc = il.base + 4;
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, stride, 64);
      gl.vertexAttribDivisor(loc, 1);
    }
  }
  _unbindInstance(il) {
    const gl = this._gl; if (!il) return;
    for (let k = 0; k < 4; k++) { const loc = il.base + k; gl.vertexAttribDivisor(loc, 0); gl.disableVertexAttribArray(loc); }
    if (il.hasColor) { const loc = il.base + 4; gl.vertexAttribDivisor(loc, 0); gl.disableVertexAttribArray(loc); }
  }

  drawIndexed(count, instanceCount = 1, first = 0) {
    const gl = this._gl; const p = this._cur; if (!p || !this._vb) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, this._vb);
    const layout = p.vertexLayout;
    const stride = layout ? layoutStride(layout) : 24;
    if (layout) {
      for (let i = 0; i < layout.length; i++) {
        const it = layout[i]; const spec = ATTR[it.type] || ATTR.f32;
        gl.enableVertexAttribArray(i);
        if (spec.integer) gl.vertexAttribIPointer(i, spec.size, gl[spec.gl], false, stride, it.offset);
        else gl.vertexAttribPointer(i, spec.size, gl[spec.gl], false, stride, it.offset);
      }
    }
    // 实例属性状态机：在两次绘制之间正确切换/解绑，避免上一管线的实例属性泄漏到后续 pass（如全屏后处理）
    const wantInst = this._instVb && p.instLayout;
    if (wantInst) {
      if (this._instBound !== p.instLayout) { this._unbindInstance(this._instBound); this._bindInstance(p.instLayout); this._instBound = p.instLayout; }
    } else if (this._instBound) {
      this._unbindInstance(this._instBound); this._instBound = null;
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._ib);
    if (wantInst && gl.drawElementsInstanced) gl.drawElementsInstanced(this._topology, count, this._ibFmt, first * 4, instanceCount);
    else gl.drawElements(this._topology, count, this._ibFmt, first * 4);
  }
  draw(count, instanceCount = 1, first = 0) {
    const gl = this._gl; const p = this._cur; if (!p || !this._vb) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, this._vb);
    const layout = p.vertexLayout;
    const stride = layout ? layoutStride(layout) : 24;
    if (layout) {
      for (let i = 0; i < layout.length; i++) {
        const it = layout[i]; const spec = ATTR[it.type] || ATTR.f32;
        gl.enableVertexAttribArray(i);
        if (spec.integer) gl.vertexAttribIPointer(i, spec.size, gl[spec.gl], false, stride, it.offset);
        else gl.vertexAttribPointer(i, spec.size, gl[spec.gl], false, stride, it.offset);
      }
    }
    const wantInst = this._instVb && p.instLayout;
    if (wantInst) {
      if (this._instBound !== p.instLayout) { this._unbindInstance(this._instBound); this._bindInstance(p.instLayout); this._instBound = p.instLayout; }
    } else if (this._instBound) {
      this._unbindInstance(this._instBound); this._instBound = null;
    }
    if (wantInst && gl.drawArraysInstanced) gl.drawArraysInstanced(this._topology, first, count, instanceCount);
    else gl.drawArrays(this._topology, first, count);
  }

  endPass() {}
  endFrame() {}

  readTexture(texHandle) {
    const gl = this._gl; const id = texHandle.id; const meta = this._texMeta.get(id); const glTex = this._texs.get(id);
    const w = meta.w, h = meta.h;
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, glTex, 0);
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const out = new Uint8Array(px.length); const row = w * 4;
    for (let y = 0; y < h; y++) out.set(px.subarray(y * row, (y + 1) * row), (h - 1 - y) * row);
    return { width: w, height: h, rgba: out };
  }

  snapshot() {
    const gl = this._gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const px = new Uint8Array(this.width * this.height * 4);
    gl.readPixels(0, 0, this.width, this.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const out = new Uint8Array(px.length); const row = this.width * 4;
    for (let y = 0; y < this.height; y++) out.set(px.subarray(y * row, (y + 1) * row), (this.height - 1 - y) * row);
    return { width: this.width, height: this.height, rgba: out };
  }
  present() { return null; } // WebGL2 直接绘制到初始化传入的 canvas，无需 blit
  destroy() { super.destroy(); this._gl = null; }
}
