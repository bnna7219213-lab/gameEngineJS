// 图元收编 smoke：primitives.js 六类图元的顶点/索引数、边界、法线单位长、UV 完整、
// 与 action3d 历史三角数（cube=12、sphere(0.35,10,8)=160）一致。
import { cube, sphere, plane, cylinder, cone, torus, primitive } from '../../src/engine/render/primitives.js';

export const name = 'render_primitives_smoke.js';

function tris(g) { return g.indexCount / 3; }
function assertUnitNormals(t, g, label) {
  const n = g.normals;
  for (let i = 0; i < n.length; i += 3) {
    const L = Math.hypot(n[i], n[i + 1], n[i + 2]);
    t.ok(Math.abs(L - 1) < 1e-4, `${label} 法线单位长 [${i / 3}] (L=${L.toFixed(4)})`);
  }
}
function assertBounds(t, g, lo, hi, label) {
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  const p = g.positions;
  for (let i = 0; i < p.length; i += 3) for (let c = 0; c < 3; c++) { mn[c] = Math.min(mn[c], p[i + c]); mx[c] = Math.max(mx[c], p[i + c]); }
  for (let c = 0; c < 3; c++) {
    t.ok(Math.abs(mn[c] - lo[c]) < 1e-3 && Math.abs(mx[c] - hi[c]) < 1e-3, `${label} 边界 [${c}] (${mn[c].toFixed(3)}..${mx[c].toFixed(3)})`);
  }
}

export async function run(t) {
  // cube
  const c = cube(1);
  t.eq(c.vertexCount, 24, 'cube 顶点数');
  t.eq(tris(c), 12, 'cube 三角形数=12（与 action3d 一致）');
  assertBounds(t, c, [-0.5, -0.5, -0.5], [0.5, 0.5, 0.5], 'cube');
  assertUnitNormals(t, c, 'cube');
  t.eq(c.uvs.length, c.vertexCount * 2, 'cube UV 完整');

  // sphere
  const s = sphere(0.5, 16, 12);
  t.eq(s.vertexCount, 17 * 13, 'sphere 顶点数');
  t.eq(tris(s), 16 * 12 * 2, 'sphere 三角形数');
  assertUnitNormals(t, s, 'sphere');
  let maxR = 0; for (let i = 0; i < s.positions.length; i += 3) maxR = Math.max(maxR, Math.hypot(s.positions[i], s.positions[i + 1], s.positions[i + 2]));
  t.near(maxR, 0.5, 1e-4, 'sphere 半径≈0.5');

  // sphere 默认参数须与 action3d 历史(0.35,10,8)产生 160 三角
  const sa = sphere(0.35, 10, 8);
  t.eq(tris(sa), 160, 'sphere(0.35,10,8)=160 三角（action3d 兼容）');

  // plane
  const pl = plane(10);
  t.eq(tris(pl), 2, 'plane 三角形数=2');
  assertBounds(t, pl, [-5, 0, -5], [5, 0, 5], 'plane');
  assertUnitNormals(t, pl, 'plane');

  // cylinder
  const cy = cylinder(0.5, 1, 20);
  assertBounds(t, cy, [-0.5, -0.5, -0.5], [0.5, 0.5, 0.5], 'cylinder');
  assertUnitNormals(t, cy, 'cylinder');
  t.ok(tris(cy) >= 40, 'cylinder 含侧面+两盖');

  // cone
  const co = cone(0.5, 1, 20);
  assertBounds(t, co, [-0.5, -0.5, -0.5], [0.5, 0.5, 0.5], 'cone');
  assertUnitNormals(t, co, 'cone');
  t.ok(tris(co) >= 40, 'cone 含侧面+底盖');

  // torus
  const to = torus(0.5, 0.2, 32, 16);
  t.eq(to.vertexCount, 33 * 17, 'torus 顶点数');
  t.eq(tris(to), 32 * 16 * 2, 'torus 三角形数');
  assertUnitNormals(t, to, 'torus');

  // 派发器 primitive()
  const p = primitive('cube'); t.eq(tris(p), 12, "primitive('cube')=12");
  t.eq(tris(primitive('sphere')), 16 * 12 * 2, "primitive('sphere')");
  t.eq(tris(primitive('plane')), 2, "primitive('plane')");
  t.ok(tris(primitive('cylinder')) > 0, "primitive('cylinder')");
  t.ok(tris(primitive('cone')) > 0, "primitive('cone')");
  t.eq(tris(primitive('torus')), 32 * 16 * 2, "primitive('torus')");
  t.eq(tris(primitive('unknown-shape')), 12, 'primitive 未知回退为 cube');
}
