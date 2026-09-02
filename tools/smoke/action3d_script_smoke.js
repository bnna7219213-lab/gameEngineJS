export const name = 'action3d-script';
import { PlaySession } from '../../src/engine/platform/play_session.js';
import { buildAction3DScene } from '../../src/engine/platform/demo_action3d.js';

function idByName(scene, name) { for (const o of scene.objects.values()) if (o.name === name) return o.id; return null; }

export async function run(t) {
  const scene = buildAction3DScene();
  const playerId = idByName(scene, 'player');
  const enemyId = idByName(scene, 'enemy');
  const coin0Id = idByName(scene, 'coin0');
  t.ok(playerId && enemyId && coin0Id, 'demo 场景含 player/enemy/coin0');

  const ps = new PlaySession(scene); ps.start();
  const ent = (id) => ps.runtime.entities.find(e => e.id === id);
  const pos = (id) => ent(id).transform.position;

  // 无输入：位置稳定
  const x0 = pos(playerId)[0];
  for (let i = 0; i < 5; i++) ps.stepFrame();
  t.eq(Math.abs(pos(playerId)[0] - x0) < 1e-9, true, '无输入时玩家不动');

  // 方向键移动（按住：每帧推一次 keydown，事件式 API 单次事件=单帧移动）
  for (let i = 0; i < 10; i++) { ps.runtime.pushKey('keydown', 'ArrowRight'); ps.stepFrame(); }
  t.ok(pos(playerId)[0] > x0 + 0.1, '按右键玩家沿 +x 移动');

  // 空格跳跃（y 抬升）
  const yBefore = pos(playerId)[1];
  ps.runtime.pushKey('keydown', ' ');
  ps.stepFrame();
  t.ok(pos(playerId)[1] > yBefore, '空格使玩家跳跃（y 抬升）');

  // 碰撞收集 coin0：把玩家挪到 coin0 旁，下一帧 coin0 应被 despawn
  const coinPos = pos(coin0Id);
  pos(playerId)[0] = coinPos[0]; pos(playerId)[1] = coinPos[1]; pos(playerId)[2] = coinPos[2];
  ps.stepFrame();
  t.eq(ps.runtime.entities.some(e => e.id === coin0Id), false, '靠近金币触发收集（despawn）');
  t.ok(ps.runtime.logBuffer.some(l => String(l.msg).includes('collect ' + coin0Id)), '收集写入日志');

  // 碰撞销毁敌人
  const enemyPos = pos(enemyId);
  pos(playerId)[0] = enemyPos[0]; pos(playerId)[1] = enemyPos[1]; pos(playerId)[2] = enemyPos[2];
  ps.stepFrame();
  t.eq(ps.runtime.entities.some(e => e.id === enemyId), false, '靠近敌人触发销毁（despawn）');
  t.ok(ps.runtime.logBuffer.some(l => String(l.msg).includes('enemy-hit')), '敌人销毁写入日志');
}
