// render-light-parity：多灯加性混合，RHI 输出与多灯 CPU 参考逐像素对齐。
export const name = 'render-light-parity';
import { Viewport3D } from '../../src/engine/render/viewport3d.js';
import { SoftwareDevice } from '../../src/engine/render/rhi_software.js';
import { directionalLight } from '../../src/engine/render/lights.js';
import { pbrShade } from '../../src/engine/render/pbr.js';

function plane() {
  const s = 1.0;
  const positions = new Float32Array([-s, -s, 0, s, -s, 0, s, s, 0, -s, -s, 0, s, s, 0, -s, s, 0]);
  const normals = new Float32Array(18); for (let i = 0; i < 6; i++) normals[i * 3 + 2] = 1;
  return { positions, normals, indices: new Uint32Array([0, 1, 2, 3, 4, 5]) };
}
function center(rgba, w, h) { const x = w >> 1, y = h >> 1; const i = (y * w + x) * 4; return [rgba[i], rgba[i + 1], rgba[i + 2]]; }
const near = (a, b) => Math.abs(a - b) <= 3;

export async function run(t) {
  const dev = new SoftwareDevice();
  const vp = new Viewport3D(dev, { width: 16, height: 16 });
  vp.setCamera({ eye: [0, 0, 3], target: [0, 0, 0], up: [0, 1, 0] });
  const p = plane();
  vp.addMesh({ positions: p.positions, normals: p.normals, indices: p.indices, albedo: [200, 40, 40], rough: 0.6, metal: 0 });

  const L1 = directionalLight({ direction: [0, 0, 1], color: [255, 255, 255], intensity: 1 });
  const L2 = directionalLight({ direction: [0.7, 0, 0.7], color: [255, 255, 255], intensity: 1 });

  // 单灯
  vp.setLights([L1]);
  const s1 = vp.renderToRGBA8();
  const c1 = center(s1, 16, 16);
  const exp1 = pbrShade({ N: [0, 0, 1], V: [0, 0, 1], P: [0, 0, 0], albedo: [200 / 255, 40 / 255, 40 / 255], metallic: 0, roughness: 0.6, lights: [L1], ambient: vp.ambient });
  t.ok(near(c1[0], exp1[0] * 255), `单灯 中心像素与参考一致 (=${c1[0]} vs ${Math.round(exp1[0] * 255)})`);

  // 双灯：应更亮且等于两灯叠加
  vp.setLights([L1, L2]);
  const s2 = vp.renderToRGBA8();
  const c2 = center(s2, 16, 16);
  const exp2 = pbrShade({ N: [0, 0, 1], V: [0, 0, 1], P: [0, 0, 0], albedo: [200 / 255, 40 / 255, 40 / 255], metallic: 0, roughness: 0.6, lights: [L1, L2], ambient: vp.ambient });
  t.ok(near(c2[0], exp2[0] * 255) && near(c2[1], exp2[1] * 255) && near(c2[2], exp2[2] * 255),
    `双灯 中心像素与参考一致 (=${c2} vs ${exp2.map(x => Math.round(x * 255))})`);
  t.ok(c2[0] > c1[0], `双灯中心比单灯亮 (=${c2[0]} vs ${c1[0]})`);
}
