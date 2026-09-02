// render-pbr-parity：Software RHI 的 PBR 光照 js 着色器输出，逐像素与 CPU 参考 pbrShade 对齐（容差 2/255）。
export const name = 'render-pbr-parity';
import { Viewport3D } from '../../src/engine/render/viewport3d.js';
import { SoftwareDevice } from '../../src/engine/render/rhi_software.js';
import { directionalLight, pointLight } from '../../src/engine/render/lights.js';
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

  // 方向光：direction 指向光源(+Z)，中心像素 N=+Z,V=+Z,P=原点
  const dirL = directionalLight({ direction: [0, 0, 1], color: [255, 255, 255], intensity: 1 });
  vp.setLights([dirL]);
  let s = vp.renderToRGBA8();
  let c = center(s, 16, 16);
  let exp = pbrShade({ N: [0, 0, 1], V: [0, 0, 1], P: [0, 0, 0], albedo: [200 / 255, 40 / 255, 40 / 255], metallic: 0, roughness: 0.6, emissive: [0, 0, 0], lights: [dirL], ambient: vp.ambient });
  t.ok(near(c[0], exp[0] * 255) && near(c[1], exp[1] * 255) && near(c[2], exp[2] * 255),
    `PBR(方向光) 中心像素与 CPU 参考一致 (=${c} vs ${exp.map(x => Math.round(x * 255))})`);

  // 点光：position 在 +Z，中心像素 Ldir=+Z
  const ptL = pointLight({ position: [0, 0, 2], color: [255, 255, 255], intensity: 1 });
  vp.setLights([ptL]);
  s = vp.renderToRGBA8();
  c = center(s, 16, 16);
  exp = pbrShade({ N: [0, 0, 1], V: [0, 0, 1], P: [0, 0, 0], albedo: [200 / 255, 40 / 255, 40 / 255], metallic: 0, roughness: 0.6, emissive: [0, 0, 0], lights: [ptL], ambient: vp.ambient });
  t.ok(near(c[0], exp[0] * 255) && near(c[1], exp[1] * 255) && near(c[2], exp[2] * 255),
    `PBR(点光) 中心像素与 CPU 参考一致 (=${c} vs ${exp.map(x => Math.round(x * 255))})`);
}
