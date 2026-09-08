// WebGPU 后端（L3，含 compute）。Node 下 init 返回 false → 降级到 WebGL2/Software。
import { IRenderDevice, DeviceCaps, RenderAPI } from './rhi.js';

export class WebGPUDevice extends IRenderDevice {
  constructor() { super(RenderAPI.WebGPU); this.caps = new DeviceCaps({ api: 'webgpu', maxMRT: 8, compute: false, indirect: false, storageTextures: false, maxTextureSize: 16384 }); this._dev = null; } // 诚实声明：当前仅 init 真实，计算/间接/存储纹理均为占位（红线 A）

  async init(opts = {}) {
    try {
      if (typeof navigator === 'undefined' || !navigator.gpu) return false;
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) return false;
      this._dev = await adapter.requestDevice();
      this.width = opts.width || 64; this.height = opts.height || 64;
      return true;
    } catch (e) { return false; }
  }
  // 计算/绘制接口在浏览器侧按需实现；Node 路径不会触达（已 fallback）。
  createBuffer({ data }) { const id = (this._next = (this._next || 0) + 1); this._bufs = this._bufs || new Map(); this._bufs.set(id, data); return { id }; }
  createTexture({ width, height, data }) { const id = (this._next = (this._next || 0) + 1); this._texs = this._texs || new Map(); this._texs.set(id, { width, height, data }); return { id }; }
  createShader({ wgsl }) { const id = (this._next = (this._next || 0) + 1); this._shaders = this._shaders || new Map(); this._shaders.set(id, wgsl); return { id }; }
  createPipeline() { const id = (this._next = (this._next || 0) + 1); return { id }; }
  dispatch() { return this; } // 占位：浏览器侧实现 compute pass
  snapshot() { return { width: this.width, height: this.height, rgba: new Uint8Array(this.width * this.height * 4) }; }
}
