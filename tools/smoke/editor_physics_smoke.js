// editor_physics smoke：rigidbody 组件 -> PhysicsWorld 绑定 + step 回写（v3 M-E / M9）。
import { PhysicsSession, shapeFromCollider, bodyFromObject } from '../../src/editor/physics_binding.js';
import { ShapeType } from '../../src/engine/sim/world3d.js';
import { Scene3D, GameObject3D } from '../../src/engine/platform/scene3d.js';

export const name = 'editor-physics';
function mk(name, comps, pos = [0, 0, 0]) {
  const o = new GameObject3D(name);
  o.components = comps; o.transform.position = [...pos];
  return o;
}

export async function run(t) {
  // ---- shapeFromCollider ----
  t.eq(shapeFromCollider({ shape: 'sphere', size: [2, 2, 2] }).type, ShapeType.SPHERE, 'sphere 形状');
  t.eq(shapeFromCollider({ shape: 'sphere', size: [2, 2, 2] }).r, 1, 'sphere 半径=size/2');
  t.eq(shapeFromCollider({ shape: 'box', size: [2, 4, 6] }).type, ShapeType.BOX, 'box 形状');
  t.eq(shapeFromCollider({ shape: 'box', size: [2, 4, 6] }).half[1], 2, 'box half=size/2');
  t.eq(shapeFromCollider(null).type, ShapeType.BOX, '无 collider 默认 box');

  // ---- bodyFromObject ----
  const obj = mk('ball', { rigidbody: { mass: 2, friction: 0.8, restitution: 0.9 }, collider3d: { shape: 'sphere', size: [1, 1, 1] } }, [0, 10, 0]);
  const body = bodyFromObject(obj);
  t.eq(body.mass, 2, '质量映射');
  t.eq(body.friction, 0.8, '摩擦映射');
  t.eq(body.restitution, 0.9, '恢复映射');
  t.ok(!body.static, '默认非静态');
  t.eq(body.pos.y, 10, '初始位置映射');

  // 静态刚体
  const ground = mk('ground', { rigidbody: { static: true }, collider3d: { shape: 'box', size: [10, 0.5, 10] } }, [0, 0, 0]);
  const gb = bodyFromObject(ground);
  t.ok(gb.static && gb.invMass === 0, '静态刚体 invMass=0');

  // ---- PhysicsSession：同步 + step + 回写 ----
  const scene = new Scene3D();
  scene.add(ground);
  const falling = mk('falling', { rigidbody: { mass: 1 }, collider3d: { shape: 'sphere', size: [1, 1, 1] } }, [0, 5, 0]);
  scene.add(falling);
  const noRb = mk('noRb', {}); scene.add(noRb);

  const session = new PhysicsSession(scene);
  t.eq(session.sync(), 2, 'sync 只收录带 rigidbody 的对象');

  const y0 = falling.transform.position[1];
  for (let i = 0; i < 30; i++) session.step(1 / 60); // 0.5s
  t.ok(falling.transform.position[1] < y0, '重力下落后回写 transform');
  t.ok(noRb.transform.position[1] === 0, '无 rigidbody 对象不动');

  // 落到地面静止（平面/盒支撑）—— 不应穿透到地面中心之下太多
  for (let i = 0; i < 300; i++) session.step(1 / 60); // 再 5s
  t.ok(falling.transform.position[1] > -1, '碰撞后不穿地（支撑在地面附近）');

  // 移除对象后 sync 清理
  scene.remove(falling.id);
  t.eq(session.sync(), 1, '移除对象后 sync 清理映射');

  // 回写旋转为合法欧拉（球落地可能翻滚）
  t.ok(Array.isArray(falling.transform.rotation) && falling.transform.rotation.length === 3, '回写旋转为欧拉三元组');
}
