// 能力分级与降级矩阵 —— 对应 C++ engine/include/engine/capability.h。
// 四级能力：Level3 全功能 GPU / Level2 基础 GPU / Level1 仅光栅 / Level0 纯 CPU 参考。
// 原则（红线 E）：可选层缺失即降级，绝不崩溃。

import { RenderAPI } from '../render/rhi.js';
import { detectBackends } from '../render/rhi.js';

export const CapLevel = {
  L0_CPU_ONLY: 0,
  L1_RASTER: 1,
  L2_GPU_BASIC: 2,
  L3_GPU_FULL: 3
};

export const LEVEL_NAME = {
  0: 'L0_CPU_ONLY',
  1: 'L1_RASTER',
  2: 'L2_GPU_BASIC',
  3: 'L3_GPU_FULL'
};

// 每个特性声明其所需的最低能力等级
export const FEATURES = {
  SoftwareRHI: 0,
  DeferredPBR_CPU: 0,
  Lightmap: 0,
  MeshletCull_CPU: 0,
  HiZ_CPU: 0,
  ECS: 0,
  Physics3D: 0,
  WebGL2_Raster: 1,
  DeferredPBR_GPU: 1,
  TAA: 1,
  VRS: 2,
  VirtualTexturing: 2,
  IndirectDraw: 2,
  WebGPU_Compute: 3,
  DDGI_GPU: 3,
  ReSTIR_GPU: 3,
  NeuralMaterial_GPU: 3,
  MeshShading: 3
};

export class Capability {
  constructor(level, detail = {}) {
    this.level = level;
    this.detail = detail;
  }
  get name() { return LEVEL_NAME[this.level]; }
  supports(feature) {
    const need = FEATURES[feature];
    if (need === undefined) return false;
    return this.level >= need;
  }
  // 缺失则抛出可读错误（供 smoke 断言降级路径）
  require(feature) {
    if (!this.supports(feature)) {
      throw new Error(`[capability] ${feature} 需要 >= ${LEVEL_NAME[FEATURES[feature]]}，当前 ${this.name}`);
    }
    return true;
  }
  toJSON() { return { level: this.level, name: this.name, detail: this.detail }; }
}

export class CapabilityDetector {
  // 环境探测：优先 WebGPU，其次 WebGL2，最后 Software。
  static async detect(opts = {}) {
    const env = await detectBackends();
    const detail = { env, force: opts.force || null };
    if (opts.force === RenderAPI.Software) return new Capability(CapLevel.L0_CPU_ONLY, detail);
    if (env.webgpu && opts.force !== RenderAPI.WebGL2) {
      // WebGPU 是否带 compute 由适配器特性决定，这里保守按 L3（compute 是 WebGPU 标配）
      return new Capability(CapLevel.L3_GPU_FULL, detail);
    }
    if (env.webgl2) return new Capability(CapLevel.L2_GPU_BASIC, detail);
    return new Capability(CapLevel.L1_RASTER, detail);
  }
  // Node（无 navigator）下的等级：只有 Software
  static nodeLevel() {
    return new Capability(CapLevel.L0_CPU_ONLY, { env: { software: true, node: true } });
  }
}

// 依据能力等级给出渲染配置建议（供上层读取，避免到处 if）
export function renderConfigFor(cap) {
  return {
    backend: cap.level >= CapLevel.L3_GPU_FULL ? RenderAPI.WebGPU
      : cap.level >= CapLevel.L1_RASTER ? RenderAPI.WebGL2 : RenderAPI.Software,
    deferred: cap.supports('DeferredPBR_GPU'),
    taa: cap.supports('TAA'),
    vrs: cap.supports('VRS'),
    virtualTexturing: cap.supports('VirtualTexturing'),
    indirect: cap.supports('IndirectDraw'),
    gi: cap.supports('DDGI_GPU') ? 'ddgi-gpu' : cap.supports('Lightmap') ? 'lightmap-cpu' : 'none'
  };
}
