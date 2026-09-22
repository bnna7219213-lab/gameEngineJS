export const name = 'sim_raycast_convex';
import { Shape, ShapeType, RigidBody, PhysicsWorld } from '../../src/engine/sim/world3d.js';
import { Vec3 } from '../../src/engine/core/math.js';

export async function run(t) {
  const w = new PhysicsWorld();
  // 创建一个简单的四面体作为 Convex
  const verts = [
    [0, 1, 0],
    [-1, -1, 1],
    [1, -1, 1],
    [0, -1, -1]
  ];
  const convex = w.add(new RigidBody(new Shape(ShapeType.CONVEX, { verts }), { pos: [0, 0, 5], static: true }));
  
  // 从正面命中
  const h1 = w.raycast([0, 0, 0], [0, 0, 1]);
  t.ok(h1 && h1.body === convex, 'hits convex');
  t.ok(h1.t > 0 && h1.t < 5, `hit at t=${h1.t}`);
  
  // 从侧面未命中
  const h2 = w.raycast([0, 2, 0], [0, 0, 1]);
  t.eq(h2, null, 'misses convex');
}
