export const name = 'sim_raycast';
// Q1 验收：raycast 全形状最近命中 + 边界。
import { Shape, ShapeType, RigidBody, PhysicsWorld } from '../../src/engine/sim/world3d.js';

export async function run(t) {
  const w = new PhysicsWorld();
  const sphere = w.add(new RigidBody(new Shape(ShapeType.SPHERE, { r: 1 }), { pos: [5, 0, 0], static: true }));
  const box = w.add(new RigidBody(new Shape(ShapeType.BOX, { half: [1, 1, 1] }), { pos: [10, 0, 0], static: true }));
  w.add(new RigidBody(new Shape(ShapeType.PLANE, { normal: [0, 1, 0], d: -2 }), { static: true })); // y=-2 平面
  // 最近命中球
  const h1 = w.raycast([0, 0, 0], [1, 0, 0]);
  t.ok(h1 && h1.body === sphere, 'nearest = sphere');
  t.near(h1.t, 4, 1e-6);
  // 从球后方命中盒
  const h2 = w.raycast([6.5, 0, 0], [1, 0, 0]);
  t.ok(h2 && h2.body === box, 'past sphere hits box');
  t.near(h2.t, 2.5, 1e-6);
  // 向下命中平面
  const h3 = w.raycast([0, 5, 0], [0, -1, 0]);
  t.ok(h3, 'hits plane');
  t.near(h3.t, 7, 1e-6, 'plane at y=-2');
  t.near(h3.normal.y, 1, 1e-9);
  // 内部出发（球心内）
  const h4 = w.raycast([5, 0, 0], [1, 0, 0]);
  t.ok(h4, 'from inside sphere exits');
  // maxDist 截断
  t.eq(w.raycast([0, 0, 0], [1, 0, 0], 3), null, 'maxDist truncates');
  // 旋转盒 raycast
  const w2 = new PhysicsWorld();
  const rb = new RigidBody(new Shape(ShapeType.BOX, { half: [1, 2, 1] }), { pos: [0, 0, 10], static: true });
  w2.add(rb);
  const h5 = w2.raycast([0, 0, 0], [0, 0, 1]);
  t.near(h5.t, 9, 1e-6, 'tall box z-half=1');
  const h6 = w2.raycast([0, 1.5, 0], [0, 0, 1]);
  t.near(h6.t, 9, 1e-6, 'within y extent');
  t.eq(w2.raycast([0, 2.5, 0], [0, 0, 1]), null, 'above y extent misses');
  // CAPSULE raycast
  const w3 = new PhysicsWorld();
  const cap = w3.add(new RigidBody(new Shape(ShapeType.CAPSULE, { r: 0.5, halfH: 1 }), { pos: [0, 0, 5], static: true }));
  const h7 = w3.raycast([0, 0, 0], [0, 0, 1]);
  t.ok(h7 && h7.body === cap, 'hits capsule');
  t.near(h7.t, 4.5, 0.01, 'dist to capsule surface');
}
