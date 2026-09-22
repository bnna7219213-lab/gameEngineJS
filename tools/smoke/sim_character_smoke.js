export const name = 'sim_character';
// Q1 验收：角色控制器——台阶/滑墙/坡度/地面检测。
import { Vec3 } from '../../src/engine/core/math.js';
import { Shape, ShapeType, RigidBody, PhysicsWorld } from '../../src/engine/sim/world3d.js';
import { CharacterController } from '../../src/engine/sim/character.js';

const mkWorld = () => {
  const w = new PhysicsWorld();
  w.add(new RigidBody(new Shape(ShapeType.PLANE, { normal: [0, 1, 0], d: 0 }), { static: true }));
  return w;
};

export async function run(t) {
  // 平地行走：无碰撞直达
  {
    const w = mkWorld();
    const cc = new CharacterController(w, { pos: [0, 0.9, 0] });
    const d = cc.move([1, 0, 0]);
    t.near(cc.pos.x, 1, 1e-6, 'flat walk full delta');
    t.ok(cc.pos.y > 0, 'stays above plane');
  }
  // 撞墙滑动：+x 墙，斜向移动 → x 受阻、z 滑行
  {
    const w = mkWorld();
    w.add(new RigidBody(new Shape(ShapeType.BOX, { half: [0.5, 5, 5] }), { static: true, pos: [2.5, 5, 0] }));
    const cc = new CharacterController(w, { pos: [0, 0.9, 0], r: 0.4 });
    cc.move([3, 0, 1]);
    t.ok(cc.pos.x < 2.5, `wall blocks x: ${cc.pos.x.toFixed(2)}`);
    t.ok(cc.pos.z > 0.3, `slides along wall z=${cc.pos.z.toFixed(2)}`);
  }
  // 台阶：0.3 高台可上
  {
    const w = mkWorld();
    w.add(new RigidBody(new Shape(ShapeType.BOX, { half: [2, 0.15, 2] }), { static: true, pos: [3, 0.15, 0] }));
    const cc = new CharacterController(w, { pos: [0, 0.9, 0], r: 0.4, stepHeight: 0.4 });
    cc.move([2, 0, 0]);
    t.ok(cc.pos.x > 1.8, `step climbed x=${cc.pos.x.toFixed(2)}`);
    t.ok(cc.pos.y >= 0.9, `kept height y=${cc.pos.y.toFixed(2)}`);
  }
  // 高墙（超步高）不可上
  {
    const w = mkWorld();
    w.add(new RigidBody(new Shape(ShapeType.BOX, { half: [2, 1, 2] }), { static: true, pos: [3, 1, 0] }));
    const cc = new CharacterController(w, { pos: [0, 0.9, 0], r: 0.4, stepHeight: 0.4 });
    cc.move([2.2, 0, 0]);
    t.ok(cc.pos.x < 1.6, `tall wall stops: ${cc.pos.x.toFixed(2)}`);
  }
  // 陡坡滑落（45°>slopeLimit 不判地面，位移投影后仍下滑趋势——本用例验证不获得 grounded）
  {
    const w = new PhysicsWorld();
    const ramp = new RigidBody(new Shape(ShapeType.BOX, { half: [5, 0.5, 5] }), { static: true, pos: [0, 0, 0] });
    ramp.rot = ramp.rot.constructor.fromAxisAngle([0, 0, 1], -Math.PI / 4);
    w.add(ramp);
    const cc = new CharacterController(w, { pos: [0, 4, 0], slopeLimitDeg: 30 });
    cc.move([0, -5, 0]); // 落到斜面
    t.eq(cc.grounded, false, '45° slope not walkable at 50° limit');
  }
  // 确定性
  {
    const mk = () => {
      const w = mkWorld();
      const cc = new CharacterController(w, { pos: [0, 0.9, 0] });
      cc.move([1.234, 0, 0.567]);
      return cc.pos.toArray().map(v => v.toFixed(6)).join(',');
    };
    t.eq(mk(), mk(), 'deterministic move');
  }
}
