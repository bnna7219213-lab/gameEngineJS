// plat_runtime_physics smoke：Q1 runtime 接线——Play 模式 GameRuntime.stepPhysics 走真物理世界。
// 验收（plan.md Q1 最后一项）：rigidbody 场景在 Play 会话中受重力/碰撞驱动并回写 transform；
// 无 rigidbody 场景保持旧简单重力行为（向后兼容，不回退 play_session_smoke）。
import { PlaySession } from '../../src/engine/platform/play_session.js';
import { GameRuntime } from '../../src/engine/platform/runtime.js';
import { Scene3D, GameObject3D } from '../../src/engine/platform/scene3d.js';

export const name = 'plat-runtime-physics';

function mk(name, comps, pos = [0, 0, 0]) {
  const o = new GameObject3D(name);
  o.components = comps; o.transform.position = [...pos];
  return o;
}

export async function run(t) {
  // ---- 1. 有 rigidbody 的场景：真物理（重力下落 + 地面支撑）----
  const s = new Scene3D();
  const ground = mk('ground', { rigidbody: { static: true }, collider3d: { shape: 'box', size: [10, 0.5, 10] } }, [0, 0, 0]);
  const ball = mk('ball', { rigidbody: { mass: 1 }, collider3d: { shape: 'sphere', size: [1, 1, 1] } }, [0, 5, 0]);
  s.add(ground); s.add(ball);
  const ps = new PlaySession(s, { compileScripts: false });
  ps.start();
  await ps.runtime.initPhysics();
  t.ok(ps.runtime._physics, '含 rigidbody 场景初始化物理会话');
  t.eq(ps.runtime._physics.map.size, 2, '两个刚体注册');
  for (let i = 0; i < 120; i++) ps.step(16.6); // 2 秒
  const y = ps.snapshot.get(ball.id).transform.position[1];
  t.ok(y > 0.2 && y < 1.2, '球落地静止在地面附近（y=' + y.toFixed(3) + '，球半径 0.5）');
  t.eq(ps.snapshot.get(ground.id).transform.position[1], 0, '静态地面不动');
  ps.stop();

  // ---- 2. 无 rigidbody 场景：回退简单重力（行为不回退）----
  const s2 = new Scene3D();
  const plain = mk('plain', { mesh: { shape: 'cube' } }, [0, 5, 0]);
  s2.add(plain);
  const ps2 = new PlaySession(s2, { compileScripts: false });
  ps2.start();
  await ps2.runtime.initPhysics();
  t.eq(ps2.runtime._physics, null, '无 rigidbody 场景不建物理会话');
  for (let i = 0; i < 60; i++) ps2.step(16.6);
  const y2 = ps2.snapshot.get(plain.id).transform.position[1];
  t.ok(y2 < 5 && y2 >= 0, '简单重力仍生效（y=' + y2.toFixed(2) + '）');
  ps2.stop();

  // ---- 3. 动态 spawn 的刚体补注册 ----
  const s3 = new Scene3D();
  const g3 = mk('g', { rigidbody: { static: true }, collider3d: { shape: 'box', size: [10, 0.5, 10] } });
  s3.add(g3);
  const ps3 = new PlaySession(s3, { compileScripts: false });
  ps3.start();
  await ps3.runtime.initPhysics();
  ps3.runtime.spawn('drop', { position: [0, 8, 0], components: { rigidbody: { mass: 1 }, collider3d: { shape: 'sphere', size: [1, 1, 1] } } });
  // spawn 后同步进 runtime.entities（spawn 直接 push entities）；给动态注册一帧机会
  await new Promise(r => setTimeout(r, 20));
  for (let i = 0; i < 180; i++) ps3.step(16.6);
  const drop = [...ps3.snapshot.objects.values()].find(o => o.name === 'drop');
  t.ok(drop, '动态 spawn 实体存在');
  t.ok(drop.transform.position[1] < 8, '动态刚体受物理驱动下落（y=' + drop.transform.position[1].toFixed(2) + '）');
  ps3.stop();

  // ---- 4. 纯 GameRuntime（无 PlaySession）也可用：直接 initPhysics + fixedStep ----
  const s4 = new Scene3D();
  const b4 = mk('b', { rigidbody: { mass: 1 }, collider3d: { shape: 'sphere', size: [1, 1, 1] } }, [0, 3, 0]);
  s4.add(b4);
  const rt = new GameRuntime();
  rt.attachScene3d(s4);
  await rt.initPhysics();
  t.ok(rt._physics, 'GameRuntime 直接接线物理');
  for (let i = 0; i < 120; i++) rt.fixedStep(1 / 60);
  const e4 = rt.entities.find(x => x.id === b4.id);
  t.ok(e4.transform.position[1] < 3, 'fixedStep 驱动下落（y=' + e4.transform.position[1].toFixed(2) + '）');
}
