export const name = 'play-session';
import { Scene3D, GameObject3D } from '../../src/engine/platform/scene3d.js';
import { cloneScene, PlaySession } from '../../src/engine/platform/play_session.js';

export async function run(t) {
  const scene = new Scene3D();
  const a = new GameObject3D('a'); a.transform.position = [0, 0, 0];
  const b = new GameObject3D('b'); b.transform.position = [1, 2, 3];
  scene.add(a); scene.add(b);

  // 1) 深拷贝独立：改克隆不污染原场景（红线 F）
  const c = cloneScene(scene);
  t.ok(c !== scene, 'cloneScene 返回新场景实例');
  t.eq(c.get(a.id).transform.position[0], 0, '克隆 transform 值一致');
  c.get(a.id).transform.position[0] = 99;
  t.eq(scene.get(a.id).transform.position[0], 0, '改克隆不污染原场景（红线 F）');

  // 2) PlaySession 隔离：运行时只改写快照，原场景零污染
  // 注：GameRuntime.stepPhysics 把 position[1]<0 夹回 0（地面），故用水平位移验证运行时改写，避免被地面夹断。
  const session = new PlaySession(scene);
  session.start();
  session.runtime.addScript({ onUpdate: (dt) => { const e = session.runtime.entities[0]; e.transform.position[0] += 5 * dt; } });
  for (let i = 0; i < 10; i++) session.step(16);
  t.ok(session.getRenderScene().get(a.id).transform.position[0] > 0, '运行时节点的快照 transform 被运行时改写');
  t.eq(scene.get(a.id).transform.position[0], 0, '运行中原编辑场景已零污染');
  session.stop();
  t.eq(session.snapshot, null, '停止后运行时快照已丢弃');
  t.eq(scene.get(a.id).transform.position[0], 0, '停止后编辑场景 transform 仍零污染（红线 F）');

  // 3) 暂停/恢复
  const s2 = new PlaySession(scene);
  s2.start();
  s2.runtime.addScript({ onUpdate: (dt) => { const e = s2.runtime.entities[0]; e.transform.position[0] += 5 * dt; } });
  s2.step(16);
  s2.pause();
  const before = s2.getRenderScene().get(a.id).transform.position[0];
  s2.step(16);
  t.eq(s2.getRenderScene().get(a.id).transform.position[0], before, '暂停态 step 无效');
  s2.resume(); s2.step(16);
  t.ok(s2.getRenderScene().get(a.id).transform.position[0] !== before, '恢复后 step 生效');
  s2.stop();
  t.eq(s2.snapshot, null, '二次停止清理快照');
}
