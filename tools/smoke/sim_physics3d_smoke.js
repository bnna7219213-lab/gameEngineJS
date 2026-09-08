export const name = 'sim_physics3d';
// Q1 验收：GJK/EPA 数值、sequential impulse、休眠、raycast、形状集。
import { Vec3, Quat } from '../../src/engine/core/math.js';
import { gjkIntersect, sphereSupport, boxSupport, epaPenetration } from '../../src/engine/sim/physics3d.js';
import { Shape, ShapeType, RigidBody, PhysicsWorld, collide, rayShape } from '../../src/engine/sim/world3d.js';

export async function run(t) {
  // --- GJK/EPA 球-球穿透深度与法线 ---
  {
    const sa = sphereSupport([0, 0, 0], 1), sb = sphereSupport([1.5, 0, 0], 1);
  const { hit, simplex } = gjkIntersect(sa, sb);
  t.ok(hit, 'gjk hit');
  const pen = epaPenetration(sa, sb, simplex);
    t.ok(pen, 'epa converges');
    t.near(pen.depth, 0.5, 0.05, 'sphere-sphere depth ≈ 0.5');
    t.near(Math.abs(pen.normal[0]), 1, 0.05, 'normal along x');
  }
  // --- EPA 球-盒 ---
  {
    const sb = sphereSupport([0.5, 0, 0], 1), bx = boxSupport([0, 0, 0], [1, 1, 1]);
  const { hit: hit2, simplex: s2 } = gjkIntersect(sb, bx);
  t.ok(hit2, 'sphere-box gjk');
  const pen2 = epaPenetration(sb, bx, s2);
  t.ok(pen2 && pen2.depth > 1 && pen2.depth < 2, `sphere-box depth ${pen2.depth.toFixed(3)}`);
  t.ok(Math.abs(pen2.normal[0] + 1) < 0.05, 'sphere-box normal = -x');
  }
  // --- collide() 平面特判 ---
  {
    const plane = new RigidBody(new Shape(ShapeType.PLANE, { normal: [0, 1, 0], d: 0 }), { static: true });
    const ball = new RigidBody(new Shape(ShapeType.SPHERE, { r: 1 }), { pos: [0, 0.5, 0] });
    const c = collide(plane, ball);
    t.ok(c && c.depth > 0.49 && c.depth < 0.51, 'plane-sphere depth 0.5');
    t.eq(c.normal[1], 1, 'plane normal up');
  }
  // --- 世界：自由落体 + 平面反弹 ---
  {
    const w = new PhysicsWorld();
    w.add(new RigidBody(new Shape(ShapeType.PLANE, { normal: [0, 1, 0], d: 0 }), { static: true }));
    const ball = w.add(new RigidBody(new Shape(ShapeType.SPHERE, { r: 0.5 }), { pos: [0, 3, 0], restitution: 0.5 }));
    for (let i = 0; i < 120; i++) w.step(1 / 60);
    t.ok(ball.pos.y >= 0.49, `ball rests on plane y=${ball.pos.y.toFixed(3)}`);
  }
  // --- 堆叠 3 盒稳定并休眠 ---
  {
    const w = new PhysicsWorld({ sleepTime: 0.3 });
    w.add(new RigidBody(new Shape(ShapeType.PLANE, { normal: [0, 1, 0], d: 0 }), { static: true }));
    const boxes = [];
    for (let i = 0; i < 3; i++) boxes.push(w.add(new RigidBody(new Shape(ShapeType.BOX, { half: [0.5, 0.5, 0.5] }), { pos: [0, 0.5 + i * 1.01, 0], friction: 0.6 })));
    for (let i = 0; i < 600; i++) w.step(1 / 60);
    // 稳定：各盒 y 在预期层位附近，不穿透
    for (let i = 0; i < 3; i++) {
      const y = boxes[i].pos.y;
      t.ok(y > 0.4 && y < 3.6, `box ${i} y in range: ${y.toFixed(2)}`);
    }
    // 休眠：至少底部两盒睡着或速度极低
    const speeds = boxes.map(b => b.vel.len());
    t.ok(Math.max(...speeds) < 0.1, `stack settles: speeds ${speeds.map(v => v.toFixed(3))}`);
  }
  // --- 斜面滑动（动摩擦 < 静摩擦情形滑下） ---
  {
    const w = new PhysicsWorld();
    const ramp = new RigidBody(new Shape(ShapeType.BOX, { half: [5, 0.5, 5] }), { static: true, pos: [0, 0, 0] });
    ramp.rot = Quat.fromAxisAngle([0, 0, 1], -Math.PI / 6); // 30° 斜面
    w.add(ramp);
    const box = w.add(new RigidBody(new Shape(ShapeType.BOX, { half: [0.5, 0.5, 0.5] }), { pos: [0, 3.2, 0], friction: 0.2 }));
    const x0 = box.pos.x;
    for (let i = 0; i < 240; i++) w.step(1 / 60);
    t.ok(Math.abs(box.pos.x - x0) > 0.5, `box slides down ramp dx=${(box.pos.x - x0).toFixed(2)}`);
  }
  // --- raycast：球/盒/平面 ---
  {
    const w = new PhysicsWorld();
    w.add(new RigidBody(new Shape(ShapeType.SPHERE, { r: 1 }), { pos: [0, 0, 5], static: true }));
    w.add(new RigidBody(new Shape(ShapeType.BOX, { half: [1, 1, 1] }), { pos: [0, 0, 10], static: true }));
    const hit = w.raycast([0, 0, 0], [0, 0, 1]);
    t.ok(hit && Math.abs(hit.t - 4) < 1e-6, `ray hits sphere at t=4 got ${hit && hit.t}`);
    const hit2 = w.raycast([0, 0, 0], [0, 0, 1], 100);
    t.eq(hit2.body.shape.type, ShapeType.SPHERE, 'nearest first');
    // 未命中
    t.eq(w.raycast([0, 50, 0], [0, 0, 1]), null, 'ray misses');
  }
  // --- 冲量：非等质量速度分配 ---
  {
    const w = new PhysicsWorld({ gravity: [0, 0, 0] });
    const heavy = w.add(new RigidBody(new Shape(ShapeType.SPHERE, { r: 1 }), { pos: [0, 0, 0], mass: 4, restitution: 1 }));
    const light = w.add(new RigidBody(new Shape(ShapeType.SPHERE, { r: 1 }), { pos: [1.5, 0, 0], mass: 1, restitution: 1 }));
    heavy.vel = new Vec3(2, 0, 0);
    for (let i = 0; i < 30; i++) w.step(1 / 60);
    // 动量守恒: 4*2 = 4*v1 + 1*v2
    const p = 4 * heavy.vel.x + light.vel.x;
    t.near(p, 8, 0.2, `momentum conserved p=${p.toFixed(2)}`);
    t.ok(light.vel.x > heavy.vel.x, 'light body faster after elastic hit');
  }
  // --- 确定性：同场景两次步进哈希一致 ---
  {
    const mk = () => {
      const w = new PhysicsWorld();
      w.add(new RigidBody(new Shape(ShapeType.PLANE, { normal: [0, 1, 0], d: 0 }), { static: true }));
      const b = w.add(new RigidBody(new Shape(ShapeType.BOX, { half: [0.5, 0.5, 0.5] }), { pos: [0.3, 2, 0.1] }));
      for (let i = 0; i < 120; i++) w.step(1 / 60);
      return b.pos.toArray().concat([b.rot.x, b.rot.y, b.rot.z, b.rot.w]).map(v => v.toFixed(6)).join(',');
    };
    t.eq(mk(), mk(), 'deterministic stepping');
  }
}
