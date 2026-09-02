// 后处理链 smoke（CPU 参考核心：ACES / brightPass / blur / combine / quantize）
import { aces, tonemapACES, brightPass, separableBlur, combineBloom, quantize8 } from '../../src/engine/render/postfx.js';

export const name = 'render_postfx_smoke.js';
export async function run(t) {
  // ACES tonemap
  t.near(aces(0), 0, 1e-6, 'aces(0)=0');
  t.ok(aces(1000) > 0.99 && aces(1000) < 1.1, '强 HDR 收敛到 ~1（ACES 略有过冲）');
  t.ok(aces(1) > 0.7 && aces(1) < 0.9, 'aces(1) ≈ 0.8（中段）');
  t.near(aces(-1), 0, 1e-6, '负 HDR 夹到 0');

  // 整图 tonemap 不改变 alpha
  const buf = new Float32Array([2, 0, 0, 1, 0, 5, 0, 0.5]);
  const out = tonemapACES(buf, 2, 1);
  t.eq(out[3], 1, 'alpha 保持');
  t.ok(out[0] > 0.8, '超亮红 tonemap 后仍亮');

  // brightPass：暗像素高光=0，亮像素保留
  const dim = new Float32Array([0.2, 0.2, 0.2, 1]);
  const bd = brightPass(dim, 1, 1, 1.0, 0.5);
  t.ok(bd[0] === 0 && bd[1] === 0 && bd[2] === 0, '暗像素高光=0');
  const br = new Float32Array([3, 3, 3, 1]);
  const bb = brightPass(br, 1, 1, 1.0, 0.5);
  t.near(bb[0], 3, 1e-5, '亮像素高光保留');

  // blur 能量近似守恒（中心单点亮、远离边缘 → 模糊后总和≈1）
  const N = 8;
  const img = new Float32Array(N * N * 4); img[(3 * N + 3) * 4] = 1;
  const bx = separableBlur(img, N, N, 2, 'x');
  const by = separableBlur(bx, N, N, 2, 'y');
  let sum = 0; for (let i = 0; i < by.length; i++) sum += by[i];
  t.ok(Math.abs(sum - 1) < 0.05, '模糊能量近似守恒');

  // combine bloom 叠加
  const base = new Float32Array([0.1, 0.1, 0.1, 1]);
  const bloom = new Float32Array([0.5, 0, 0, 1]);
  const comb = combineBloom(base, 1, 1, bloom, 1, 1, 1);
  t.near(comb[0], 0.6, 1e-5, 'bloom 叠加到基础色');

  // quantize 范围
  const q = quantize8(new Float32Array([2, 0, 0, 1]));
  t.ok(q[0] <= 255 && q[0] >= 0, '量化在 0..255');
}
