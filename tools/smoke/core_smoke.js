export const name = 'core';
import { Vec3, Vec4, Mat4, Quat, Color, AABB, Frustum, Rng, clamp, lerp } from '../../src/engine/core/math.js';
import { Rng as Rng2 } from '../../src/engine/core/math.js';
import { stringifyStable, safeParse } from '../../src/engine/core/json.js';
import { toQ16, fromQ16, fnv1a, hashFloat } from '../../src/engine/core/determinism.js';
import { CVarRegistry } from '../../src/engine/core/cvar.js';

export async function run(t) {
  // 向量
  const a = Vec3.of(1, 2, 3), b = Vec3.of(4, 5, 6);
  t.eq(a.add(b).v ? 0 : 0, 0); // noop guard
  t.near(a.add(b).x, 5); t.near(a.add(b).y, 7); t.near(a.add(b).z, 9);
  t.near(Vec3.dot(a, b), 32);
  t.near(Vec3.cross(a, b).x, -3); t.near(Vec3.cross(a, b).y, 6); t.near(Vec3.cross(a, b).z, -3);

  // 矩阵：行主序 + 复合顺序（先 B 后 A）
  const T = Mat4.translation(1, 2, 3), S = Mat4.scale(2, 2, 2);
  const m = T.mul(S); // 先缩放后平移
  const p = m.transformPoint(Vec3.of(1, 1, 1));
  t.near(p.x, 3); t.near(p.y, 4); t.near(p.z, 5);

  // perspective / lookAt 与 NDC z∈[-1,1]
  const proj = Mat4.perspective(Math.PI / 3, 1.333, 0.1, 100);
  t.eq(proj.m[14], -1); // 末行 (0,0,-1,0)：w_clip = -z_view
  const view = Mat4.lookAt(Vec3.of(0, 0, 5), Vec3.of(0, 0, 0), Vec3.of(0, 1, 0));
  const vp = proj.mul(view);
  const f = Frustum.fromViewProj(vp);
  t.ok(f.intersects(new AABB(Vec3.of(-1, -1, -1), Vec3.of(1, 1, 1))), 'origin in frustum');
  t.ok(!f.intersects(new AABB(Vec3.of(-1, -1, 20), Vec3.of(1, 1, 22))), 'behind camera culled');

  // 四元数 slerp 端点
  const q1 = Quat.fromEuler(0, 0, 0), q2 = Quat.fromEuler(0, Math.PI / 2, 0);
  const qs = Quat.slerp(q1, q2, 0); t.near(qs.w, 1, 1e-5);

  // 颜色
  const c = Color.fromRGB8(255, 128, 0); t.eq(c.toRGBA8()[0], 255); t.eq(c.toRGBA8()[1], 128);

  // 确定性 Rng：同种子同序列
  const r1 = new Rng2(42), r2 = new Rng2(42);
  for (let i = 0; i < 5; i++) t.near(r1.next(), r2.next());

  // json 稳定序列化（键序无关）
  const j1 = stringifyStable({ b: 1, a: 2 }); const j2 = stringifyStable({ a: 2, b: 1 });
  t.eq(j1, j2);
  t.eq(safeParse('{bad', null), null);

  // 定点
  t.eq(toQ16(1.5), 98304); t.near(fromQ16(toQ16(0.25)), 0.25, 1e-4);
  t.eq(fnv1a('hi'), fnv1a('hi'));

  // CVar
  const reg = new CVarRegistry(); reg.register('r_width', 800); t.eq(reg.get('r_width'), 800);
  reg.set('r_width', 1024); t.eq(reg.get('r_width'), 1024);
  t.eq(clamp(5, 0, 1), 1); t.near(lerp(0, 10, 0.5), 5);
}
