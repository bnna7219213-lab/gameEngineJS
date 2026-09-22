// pbr-math：GGX / Cook-Torrance 的 CPU 参考单元验证（红线 D 黄金参考的数学正确性）。
export const name = 'pbr-math';
import { pbrShade, distributionGGX, fogFactor } from '../../src/engine/render/pbr.js';
import { directionalLight, pointLight } from '../../src/engine/render/lights.js';

export async function run(t) {
  const N = [0, 0, 1], V = [0, 0, 1], P = [0, 0, 0];
  const L = { type: 0, direction: [0, 0, 1], color: [1, 1, 1], intensity: 1 };

  // 1) 纯漫反射：metallic=0, rough=1 → diffuse ≈ albedo/π（spec 极小）
  const c = pbrShade({ N, V, P, albedo: [0.5, 0, 0], metallic: 0, roughness: 1, emissive: [0, 0, 0], lights: [L], ambient: [0, 0, 0] });
  t.ok(Math.abs(c[0] - 0.5 / Math.PI) < 0.05, `rough=1 漫反射红通道≈albedo/π (=${c[0].toFixed(3)})`);
  t.ok(c[1] < 0.02 && c[2] < 0.02, `纯红反照率不应有 G/B (=${c[1].toFixed(3)},${c[2].toFixed(3)})`);

  // 2) 金属化：metallic=1 无漫反射，中性金属镜面应中性（R=G=B）
  const cm = pbrShade({ N, V, P, albedo: [0.5, 0.5, 0.5], metallic: 1, roughness: 0.3, emissive: [0, 0, 0], lights: [L], ambient: [0, 0, 0] });
  t.ok(Math.abs(cm[0] - cm[1]) < 0.02 && Math.abs(cm[1] - cm[2]) < 0.02, `中性金属镜面应中性 (=${cm.map(x => x.toFixed(2))})`);

  // 3) 能量守恒：白漫反射出射 ≤ 1
  const ch = pbrShade({ N, V, P, albedo: [1, 1, 1], metallic: 0, roughness: 1, emissive: [0, 0, 0], lights: [L], ambient: [0, 0, 0] });
  t.ok(ch[0] <= 1.0 && ch[0] >= 0.0, `漫反射白出射 ≤ 1 (=${ch[0].toFixed(3)})`);

  // 4) GGX 锐度：rough 越小 NDF 越尖
  const ndfSharp = distributionGGX(1.0, 0.05);
  const ndfRough = distributionGGX(1.0, 1.0);
  t.ok(ndfSharp > ndfRough, `rough 越小 NDF 越尖 (=${ndfSharp.toFixed(1)} vs ${ndfRough.toFixed(2)})`);

  // 5) 雾：exp 随距离增强
  t.ok(fogFactor({ type: 'exp', density: 0.05 }, 20) > fogFactor({ type: 'exp', density: 0.05 }, 5), 'exp 雾随距离增强');

  // 6) 点光衰减：近比远亮
  const pc1 = pbrShade({ N, V, P, albedo: [1, 1, 1], metallic: 0, roughness: 1, lights: [pointLight({ position: [0, 0, 1], intensity: 1 })], ambient: [0, 0, 0] });
  const pc2 = pbrShade({ N, V, P, albedo: [1, 1, 1], metallic: 0, roughness: 1, lights: [pointLight({ position: [0, 0, 10], intensity: 1 })], ambient: [0, 0, 0] });
  t.ok(pc1[0] > pc2[0], `点光：近比远亮 (=${pc1[0].toFixed(3)} vs ${pc2[0].toFixed(3)})`);

  // 7) 方向光方向约定：direction 指向光源；表面法线朝向光源则 ndl=1
  const dirL = directionalLight({ direction: [0, 0, 1], intensity: 2 });
  const cd = pbrShade({ N, V, P, albedo: [1, 1, 1], metallic: 0, roughness: 1, lights: [dirL], ambient: [0, 0, 0] });
  t.ok(cd[0] > 2 * ch[0] * 0.9, `direction=+Z、intensity=2 应比 intensity=1 更亮 (=${cd[0].toFixed(3)} vs ${ch[0].toFixed(3)})`);
}
