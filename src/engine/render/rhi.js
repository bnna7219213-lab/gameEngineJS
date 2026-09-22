// RHI 抽象层 —— 对应 C++ engine/include/engine/rhi.h。
//
// 三条铁律（沿用 C++ 版红线）：
//   D) CPU 参考先行：任何 GPU 路径都先有 CPU 参考实现（SoftwareRHI / js shader），
//      GPU 结果必须与之在容差内一致；Software 端为黄金基准，永不下线。
//   E) 可选层缺失即降级，不崩溃：WebGPU 不可用 → WebGL2 → Software。
//   1) 每个后端独立可验证。
//
// 着色器双写：createShader 同时接受 glsl（WebGL2/WebGPU 用）与 js（Software 用）。
//   js.vs(attr, uni) -> { pos:[x,y,z,w], vary:{...} }
//   js.fs(vary, uni) -> 单目标时 [r,g,b,a]；MRT 时 [[r,g,b,a], ...]（顺序对应 pipeline.targets）

import { Vec3 } from '../core/math.js';

export const RenderAPI = {
  WebGPU: 'webgpu',
  WebGL2: 'webgl2',
  Software: 'software'
};

export const Format = {
  RGBA8: 'rgba8',
  RGBA16F: 'rgba16f',
  RGBA32F: 'rgba32f',
  RG16F: 'rg16f',
  R32F: 'r32f',
  Depth32F: 'depth32f',
  Depth24Stencil8: 'depth24s8'
};

export const BufferUsage = {
  Vertex: 1 << 0,
  Index: 1 << 1,
  Uniform: 1 << 2,
  Storage: 1 << 3,
  Indirect: 1 << 4,
  Readback: 1 << 5
};

export const TextureUsage = {
  Sampled: 1 << 0,
  RenderTarget: 1 << 1,
  Storage: 1 << 2,
  CopySrc: 1 << 3
};

export const Topology = { Triangles: 'triangles', Lines: 'lines', Points: 'points' };
export const CullMode = { None: 'none', Back: 'back', Front: 'front' };
export const IndexFormat = { U16: 'u16', U32: 'u32' };

// 后端能力声明：上层用它决定降级路径
export class DeviceCaps {
  constructor(o = {}) {
    this.api = o.api || RenderAPI.Software;
    this.maxTextureSize = o.maxTextureSize || 4096;
    this.maxMRT = o.maxMRT || 4;
    this.compute = !!o.compute;              // 是否有真实 compute（WebGPU / WebGL2 的 transform feedback 不算）
    this.indirect = !!o.indirect;            // 原生间接绘制
    this.storageTextures = !!o.storageTextures;
    this.floatRenderTargets = o.floatRenderTargets !== false;
    this.timestamp = !!o.timestamp;
    this.wireframe = !!o.wireframe;
  }
  toJSON() { return { ...this }; }
}

const UNSUPPORTED = (name) => {
  throw new Error(`[RHI] ${name}() 未被该后端实现`);
};

// 所有后端的统一接口。方法默认抛错，后端按需覆盖。
export class IRenderDevice {
  constructor(api) {
    this.api = api;
    this.caps = new DeviceCaps({ api });
    this.width = 0;
    this.height = 0;
    this.disposed = false;
  }

  async init(opts = {}) { UNSUPPORTED('init'); }
  resize(w, h) { this.width = w; this.height = h; }

  createBuffer(/* { byteLength, usage, data } */) { UNSUPPORTED('createBuffer'); }
  writeBuffer(/* handle, data, byteOffset */) { UNSUPPORTED('writeBuffer'); }
  readBuffer(/* handle */) { UNSUPPORTED('readBuffer'); }

  createTexture(/* { width, height, format, usage, data, levels } */) { UNSUPPORTED('createTexture'); }
  writeTexture(/* handle, data, rect */) { UNSUPPORTED('writeTexture'); }
  // 回读纹理为 RGBA8 字节（readback 用；软件/GL 都支持）
  readTexture(/* handle */) { UNSUPPORTED('readTexture'); }

  createShader(/* { name, glsl:{vs,fs,cs}, js:{vs,fs,cs} } */) { UNSUPPORTED('createShader'); }
  createPipeline(/* { shader, vertexLayout, targets, depth, cull, blend, topology } */) { UNSUPPORTED('createPipeline'); }
  createRenderTarget(/* { textures:[tex], depth } */) { UNSUPPORTED('createRenderTarget'); }

  beginFrame() {}
  beginPass(/* { targets, clearColor, clearDepth } */) { UNSUPPORTED('beginPass'); }
  setPipeline(/* p */) { UNSUPPORTED('setPipeline'); }
  setVertexBuffer(/* handle, stride */) { UNSUPPORTED('setVertexBuffer'); }
  setIndexBuffer(/* handle, format */) { UNSUPPORTED('setIndexBuffer'); }
  setConstants(/* obj */) { UNSUPPORTED('setConstants'); }
  bindTexture(/* slot, tex, sampler */) { UNSUPPORTED('bindTexture'); }
  bindStorage(/* slot, bufferOrTexture */) { UNSUPPORTED('bindStorage'); }
  draw(/* count, instanceCount, firstVertex */) { UNSUPPORTED('draw'); }
  drawIndexed(/* count, instanceCount, firstIndex */) { UNSUPPORTED('drawIndexed'); }
  drawIndirect(/* buffer, offsetBytes, drawCount */) { UNSUPPORTED('drawIndirect'); }
  endPass() { UNSUPPORTED('endPass'); }
  endFrame() { UNSUPPORTED('endFrame'); }

  // 计算：cs 为 js 内核函数（software）或 WGSL/GL 计算着色器（GPU）
  dispatch(/* cs, bindings, [gx,gy,gz] */) { UNSUPPORTED('dispatch'); }

  // 呈现到画布；软件端把后台缓冲 blit 到 2D canvas
  present(/* canvas */) { UNSUPPORTED('present'); }
  // 取当前后台缓冲 RGBA8（测试与截图用）
  snapshot() { UNSUPPORTED('snapshot'); }

  destroy() { this.disposed = true; }
}

// 顶点属性布局项：{ name, type:'f32x3'|'f32x2'|'u32', offset }
export function vertexLayout(items) {
  let off = 0;
  const sizes = { f32: 4, f32x2: 8, f32x3: 12, f32x4: 16, u32: 4, u16: 2 };
  return items.map((it) => {
    const o = { ...it, offset: it.offset !== undefined ? it.offset : off };
    off += it.offset !== undefined ? sizes[it.type] || 4 : sizes[it.type] || 4;
    return o;
  });
}

// 交错顶点缓冲读写：按 layout 打包/解包
export function packVertices(layout, verts) {
  const stride = layoutStride(layout);
  const out = new Float32Array((verts.length * stride) / 4);
  let base = 0;
  for (const v of verts) {
    for (const it of layout) {
      const src = v[it.name];
      const o = base + it.offset / 4;
      if (Array.isArray(src)) {
        for (let k = 0; k < src.length; ++k) out[o + k] = src[k];
      } else {
        out[o] = src || 0;
      }
    }
    base += stride / 4;
  }
  return { data: out, stride, count: verts.length };
}

export function unpackVertices(layout, data, stride = layoutStride(layout)) {
  const n = data.length / (stride / 4);
  const out = new Array(n);
  const comps = { f32: 1, f32x2: 2, f32x3: 3, f32x4: 4, u32: 1, u16: 1 };
  for (let i = 0; i < n; ++i) {
    const v = {};
    for (const it of layout) {
      const c = comps[it.type] || 1;
      const o = (i * stride + it.offset) / 4;
      v[it.name] = c === 1 ? data[o] : Array.from(data.subarray(o, o + c));
    }
    out[i] = v;
  }
  return out;
}

export function layoutStride(layout) {
  let s = 0;
  for (const it of layout) s += { f32: 4, f32x2: 8, f32x3: 12, f32x4: 16, u32: 4, u16: 2 }[it.type] || 4;
  return s;
}

// ---------------------------------------------------------------- 工厂
// 降级链：WebGPU → WebGL2 → Software。pref 可强制指定；失败自动下探。
export async function createRenderDevice(pref = 'auto', opts = {}) {
  const order =
    pref === 'auto'
      ? [RenderAPI.WebGPU, RenderAPI.WebGL2, RenderAPI.Software]
      : [pref, RenderAPI.Software];
  const tried = [];
  for (const api of order) {
    try {
      const dev = await makeDevice(api);
      const ok = await dev.init(opts);
      if (ok) {
        dev.fallbackFrom = tried.length ? tried : undefined;
        return dev;
      }
      dev.destroy();
    } catch (e) {
      tried.push(`${api}:${e.message}`);
    }
  }
  throw new Error('[RHI] 所有后端均不可用: ' + JSON.stringify(tried));
}

async function makeDevice(api) {
  if (api === RenderAPI.WebGPU) {
    const mod = await import('./rhi_webgpu.js');
    return new mod.WebGPUDevice();
  }
  if (api === RenderAPI.WebGL2) {
    const mod = await import('./rhi_webgl2.js');
    return new mod.WebGL2Device();
  }
  const mod = await import('./rhi_software.js');
  return new mod.SoftwareDevice();
}

// 探测当前环境可用后端（不创建设备）
export async function detectBackends() {
  const out = { webgpu: false, webgl2: false, software: true, reasons: {} };
  if (typeof navigator === 'undefined') {
    out.reasons.webgpu = 'no navigator (node)';
    out.reasons.webgl2 = 'no navigator (node)';
    return out;
  }
  out.webgpu = !!(navigator.gpu && (await navigator.gpu.requestAdapter().catch(() => null)));
  if (!out.webgpu) out.reasons.webgpu = 'navigator.gpu 不可用或无适配器';
  try {
    const c = document.createElement('canvas');
    out.webgl2 = !!c.getContext('webgl2');
    if (!out.webgl2) out.reasons.webgl2 = 'getContext("webgl2") 返回 null';
  } catch (e) {
    out.reasons.webgl2 = String(e && e.message);
  }
  return out;
}

// 视口后端选择（P5 GPU 视口）：依据环境探测结果 + 显式偏好，选出实际使用的后端。
// 优先级：forceSoftware > forceGPU(需 webgl2 可用，否则回退) > 自动(webgl2 可用则优先 GPU)。
// 永远回退到 Software（黄金参考，红线 D），绝不返回未被探测到的后端。
export function pickViewportBackend(detect, opts = {}) {
  const webgl2 = !!(detect && detect.webgl2);
  if (opts.forceSoftware) return 'software';
  if (opts.forceGPU) return webgl2 ? 'webgl2' : 'software';
  return webgl2 ? 'webgl2' : 'software';
}

// 常用：把 RGBA8 数据写成 PPM（与 C++ 版 smoke 的落盘格式一致，便于肉眼比对）
export function writePPM(rgba, w, h) {
  const head = `P6\n${w} ${h}\n255\n`;
  const buf = Buffer.alloc(head.length + w * h * 3);
  buf.write(head, 0, 'ascii');
  let o = head.length;
  for (let i = 0; i < w * h; ++i) {
    buf[o++] = rgba[i * 4 + 0];
    buf[o++] = rgba[i * 4 + 1];
    buf[o++] = rgba[i * 4 + 2];
  }
  return buf;
}

export { Vec3 };
