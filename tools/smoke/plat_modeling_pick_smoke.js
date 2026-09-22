// plat_modeling_pick smoke：顶点/边/面 CPU 射线拾取（v3 M-B）。
import { rayTriangle, pointToSegmentDist2D, MeshPicker } from '../../src/editor/modeling/pick.js';
import { cube } from '../../src/engine/render/primitives.js';

export const name = 'plat-modeling-pick';
export async function run(t) {
  // ---- rayTriangle（Möller–Trumbore）----
  // 三角形在原点 XY 平面，法线 +Z；射线从 +Z 向原点
  const a = [0, 0, 0], b = [1, 0, 0], c = [0, 1, 0];
  const hit = rayTriangle([0.25, 0.25, 5], [0, 0, -1], a, b, c);
  t.ok(hit != null && Math.abs(hit - 5) < 1e-5, '射线命中三角形，t≈5');
  t.eq(rayTriangle([2, 2, 5], [0, 0, -1], a, b, c), null, '射线偏离不命中');
  t.eq(rayTriangle([0.25, 0.25, 5], [0, 0, 1], a, b, c), null, '射线背离不命中');
  t.eq(rayTriangle([0.25, 0.25, 0], [1, 0, 0], a, b, c), null, '射线平行不命中');

  // ---- pointToSegmentDist2D ----
  t.eq(pointToSegmentDist2D(0, 5, -5, 0, 5, 0), 5, '点到线段中垂距离');
  t.eq(pointToSegmentDist2D(10, 0, -5, 0, 5, 0), 5, '点到线段端点外距离');
  t.eq(pointToSegmentDist2D(0, 0, -5, 0, 5, 0), 0, '点在线段上距离 0');

  // ---- MeshPicker：构造 cube + 固定相机 ----
  const mesh = cube(1); // 中心原点，边长1
  // 简单正交投影近似：世界坐标 -> 屏幕（俯视 -Z，无透视）
  const W = 64, H = 64, scale = 20;
  const project = (wp) => ({ x: W / 2 + wp[0] * scale, y: H / 2 - wp[1] * scale, z: wp[2] });
  const ray = (sx, sy) => ({ o: [(sx - W / 2) / scale, (H / 2 - sy) / scale, 10], d: [0, 0, -1] });

  const picker = new MeshPicker(mesh, null, project, ray);

  // 顶点拾取：cube 顶点 (0.5,0.5,0.5) 投影到 (W/2+10, H/2-10)
  const vIdx = picker.pickVertex(W / 2 + 10, H / 2 - 10, 8);
  t.ok(vIdx >= 0, '命中顶点');
  const vp = [mesh.positions[vIdx * 3], mesh.positions[vIdx * 3 + 1], mesh.positions[vIdx * 3 + 2]];
  t.ok(Math.abs(vp[0] - 0.5) < 1e-5 && Math.abs(vp[1] - 0.5) < 1e-5, '命中正确顶点坐标');
  t.eq(picker.pickVertex(2, 2, 8), -1, '远离顶点不命中（角落）');

  // 边拾取：顶部前边中点附近 (0, 0.5, 0.5) -> 屏幕 (W/2, H/2-10)
  const eHit = picker.pickEdge(W / 2, H / 2 - 10, 8);
  t.ok(eHit != null, '命中边');
  t.ok(eHit.a >= 0 && eHit.b >= 0, '边含两端点索引');

  // 面拾取：从正前方向 cube 正面中心发射线
  const fHit = picker.pickFace(W / 2, H / 2, 8);
  t.ok(fHit != null, '命中面');
  t.ok(fHit.t > 0, '面交点距离为正');
  t.ok(fHit.tri >= 0 && fHit.tri < mesh.indices.length / 3, '面索引合法');

  // 统一入口分派
  t.eq(picker.pick('VERT', W / 2 + 10, H / 2 - 10, 8).type, 'VERT', 'pick VERT 分派');
  t.ok(picker.pick('FACE', W / 2, H / 2) != null, 'pick FACE 分派');
  t.ok(picker.pick('EDGE', W / 2, H / 2 - 10) != null, 'pick EDGE 分派');

  // 非法模式抛错
  let threw = false;
  try { picker.pick('NOPE', 0, 0); } catch (e) { threw = /非法模式/.test(e.message); }
  t.ok(threw, '非法拾取模式抛可读错误');

  // invalidate 缓存
  picker.invalidate();
  t.eq(picker._world, null, 'invalidate 清空世界坐标缓存');
}
