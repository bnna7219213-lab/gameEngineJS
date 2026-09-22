export const name = 'rhi-pbr-parity';
import { shadeGBuffer, shadeGBufferPass } from '../../src/engine/render/deferred_pbr.js';

export async function run(t) {
  // 手工构造一个 GBuffer（单像素面朝 +Z，受 +Z 方向光照）
  const w = 4, h = 4;
  const gb = {
    pos: new Float32Array(w * h * 3), nrm: new Float32Array(w * h * 3), alb: new Float32Array(w * h * 3),
    depth: new Float32Array(w * h).fill(Infinity), w, h,
  };
  gb.depth[0] = 0.5;
  gb.nrm[2] = 1; gb.alb[0] = 0.8; gb.alb[1] = 0.8; gb.alb[2] = 0.8;
  const lights = [{ pos: [0, 0, 5], color: [1, 1, 1], intensity: 1 }];
  const a = shadeGBuffer(gb, lights, [0, 0, 5]);
  const b = shadeGBufferPass(gb, lights, [0, 0, 5]);
  t.exact(a, b, 'CPU 参考着色 与 结构化 GPU 路径 逐字节一致');
  t.ok(a[0] > 0, '虽仅环境光+少量漫反射，像素非黑 (got ' + a[0] + ')');
  // 其余像素应为透明黑（depth=Inf 跳过）
  t.eq(a[5], 0); t.eq(a[6], 0); t.eq(a[7], 0);
}
