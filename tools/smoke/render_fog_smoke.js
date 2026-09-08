// render-fog：距离雾（exp）将受光像素向雾色混合；RHI 输出与 CPU 参考 pbrShade(fog) 对齐。
export const name = 'render-fog';
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
  const L = directionalLight({ direction: [0, 0, 1], color: [255, 255, 255], intensity: 1 });
  vp.setLights([L]);

  // 无雾
  const s0 = vp.renderToRGBA8();
  const c0 = center(s0, 16, 16);

  // exp 雾，密度大 → 中心像素(距相机 3) 大量混合雾色[白]
  const fog = { type: 'exp', density: 0.6, color: [1, 1, 1] };
  vp.setFog(fog);
  const s1 = vp.renderToRGBA8();
  const c1 = center(s1, 16, 16);
  const exp = pbrShade({ N: [0, 0, 1], V: [0, 0, 1], P: [0, 0, 0], albedo: [200 / 255, 40 / 255, 40 / 255], metallic: 0, roughness: 0.6, lights: [L], ambient: vp.ambient, fog, dist: 3 });
  t.ok(near(c1[0], exp[0] * 255) && near(c1[1], exp[1] * 255) && near(c1[2], exp[2] * 255),
    `exp 雾 中心像素与 CPU 参考一致 (=${c1} vs ${exp.map(x => Math.round(x * 255))})`);
  t.ok(c1[0] > c0[0], `雾使中心像素向白色雾色变亮 (=${c1[0]} vs ${c0[0]})`);
  vp.setFog(null);
}
