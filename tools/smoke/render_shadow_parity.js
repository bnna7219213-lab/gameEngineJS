// render-shadow-parity：方向光阴影 CPU 参考（正交 shadow map + 3×3 PCF）。
// 校验遮挡逻辑：接收面中心(正对光源方向被遮挡)阴影因子≈0，空旷处≈1。
// 该 CPU 参考是 WebGL2 与 Software 两后端共享的黄金基准（红线 D），GPU 路径在 parity 页验证。
export const name = 'render-shadow-parity';
import { renderShadowMap, sampleShadow, orthoLightVP } from '../../src/engine/render/pbr.js';
import { directionalLight } from '../../src/engine/render/lights.js';

function quadAt(z, x0, x1, y0, y1) {
  const p = new Float32Array([x0, y0, z, x1, y0, z, x1, y1, z, x0, y0, z, x1, y1, z, x0, y1, z]);
  const n = new Float32Array(18); for (let i = 0; i < 6; i++) n[i * 3 + 2] = 1;
  return { positions: p, indices: new Uint32Array([0, 1, 2, 3, 4, 5]) };
}

export async function run(t) {
  const L = directionalLight({ direction: [0, 0, 1], shadow: { radius: 4 } });
  const receiver = quadAt(0, -2, 2, -2, 2);
  const occluder = quadAt(0.5, -0.3, 0.3, -0.3, 0.3); // 位于接收面前方中心
  const lvp = orthoLightVP(L.direction, [0, 0, 0], 4);
  const map = renderShadowMap([receiver, occluder], lvp, 64);

  const fCenter = sampleShadow(map, 64, lvp, [0, 0, 0], 0.0025);
  const fClear = sampleShadow(map, 64, lvp, [1.5, 1.5, 0], 0.0025);
  t.ok(fCenter < 0.5, `接收面中心（被遮挡）阴影因子应很低 (=${fCenter.toFixed(2)})`);
  t.ok(fClear > 0.8, `无遮挡处阴影因子应≈1 (=${fClear.toFixed(2)})`);

  // 偏差：增大 bias 不应使已受光处误判为阴影
  const fBias = sampleShadow(map, 64, lvp, [1.5, 1.5, 0], 0.1);
  t.ok(fBias > 0.8, `大 bias 不误伤空旷处 (=${fBias.toFixed(2)})`);
}
