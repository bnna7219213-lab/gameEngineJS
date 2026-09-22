// render-normalmap：M10 法线贴图进 PBR。
//  - computeTangents：XY 平面 quad + 标准 uv → tangent=+X，手性 +1
//  - pbrShade 无 normalMap → 基线（与现状逐位一致）
//  - 平坦法线贴图 (0.5,0.5,1) → 输出与基线接近
//  - 扰动法线贴图 → 输出与平坦不同（法线确实被扰动）
export const name = 'render-normalmap';
import { computeTangents, perturbNormal, pbrShade } from '../../src/engine/render/pbr.js';

// XY 平面 quad（z=0），N=+Z，标准 uv
function quad() {
  const positions = new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]);
  const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
  const uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
  const indices = new Uint32Array([0, 1, 2, 0, 2, 3]);
  return { positions, normals, uvs, indices };
}

const L = { type: 0, direction: [0, 0, 1], color: [1, 1, 1], intensity: 1 };
const base = { N: [0, 0, 1], V: [0, 0, 1], P: [0, 0, 0], albedo: [0.8, 0.2, 0.2], metallic: 0, roughness: 0.6, lights: [L], ambient: [0.04, 0.05, 0.07] };

export async function run(t) {
  // 1) computeTangents：+X 切线，手性 +1
  const q = quad();
  const tan = computeTangents(q.positions, q.normals, q.uvs, q.indices);
  t.eq(tan.length, 16, 'tangent 数组长度 = 4 顶点 × 4 分量');
  for (let i = 0; i < 4; i++) {
    t.near(tan[i * 4], 1, 1e-5, `顶点${i} tangent.x = +1`);
    t.near(tan[i * 4 + 1], 0, 1e-5, `顶点${i} tangent.y = 0`);
    t.near(tan[i * 4 + 2], 0, 1e-5, `顶点${i} tangent.z = 0`);
    t.eq(tan[i * 4 + 3], 1, `顶点${i} 手性 w = +1`);
  }

  // 2) 基线：无 normalMap
  const c0 = pbrShade(base);

  // 3) 平坦法线贴图 (0.5,0.5,1) → 切空间法线≈(0,0,1) → 与基线接近
  const tangent = [1, 0, 0, 1];
  const cFlat = pbrShade({ ...base, normalMap: [0.5, 0.5, 1], tangent });
  for (let i = 0; i < 3; i++) t.near(cFlat[i], c0[i], 2 / 255, `平坦法线贴图输出≈基线 ch${i} (${cFlat[i]} vs ${c0[i]})`);

  // 4) 扰动法线贴图（法线偏向 +X）→ 输出与平坦不同
  const cBump = pbrShade({ ...base, normalMap: [0.9, 0.5, 0.5], tangent });
  t.ok(Math.abs(cBump[0] - cFlat[0]) > 1e-4 || Math.abs(cBump[1] - cFlat[1]) > 1e-4 || Math.abs(cBump[2] - cFlat[2]) > 1e-4,
    `扰动法线贴图改变输出 (${cBump} vs ${cFlat})`);

  // 5) perturbNormal 直接验证：平坦 texel → 几何法线不变；+X texel → 法线偏向切线
  const nFlat = perturbNormal([0, 0, 1], [0.5, 0.5, 1], tangent);
  t.ok(Math.abs(nFlat[2] - 1) < 1e-3, `平坦 texel 扰动后法线≈+Z (=${nFlat})`);
  const nX = perturbNormal([0, 0, 1], [0.75, 0.5, 0.75], tangent);
  t.ok(nX[0] > 0.3 && nX[2] > 0.3, `+X texel 扰动后法线偏向 +X (=${nX})`);

  // 6) 纹理对象形式（0..255 数据 + uv 采样）
  const tex = { w: 1, h: 1, data: new Uint8Array([128, 128, 255, 255]) };
  const cTex = pbrShade({ ...base, normalMap: tex, tangent, uv: [0, 0] });
  for (let i = 0; i < 3; i++) t.near(cTex[i], c0[i], 2 / 255, `纹理形式平坦贴图输出≈基线 ch${i}`);

  // 7) 无 tangent 时即便给了 normalMap 也不启用（回退安全）
  const cNoTan = pbrShade({ ...base, normalMap: [0.9, 0.5, 0.5] });
  for (let i = 0; i < 3; i++) t.eq(cNoTan[i], c0[i], `缺 tangent 时忽略 normalMap ch${i}`);
}
