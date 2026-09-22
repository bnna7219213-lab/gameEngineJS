export const name = 'script-compiler';
import { Scene3D, GameObject3D } from '../../src/engine/platform/scene3d.js';
import { PlaySession } from '../../src/engine/platform/play_session.js';
import { compileSceneScripts, compileObjectScript, validateScript, createEntityApi } from '../../src/editor/script_compiler.js';

export async function run(t) {
  // 1) createEntityApi.move 改写实体（红线 F：只碰运行时实体，不碰 Scene3D）
  const api = createEntityApi({ entities: [{ id: 1, transform: { position: [0, 0, 0] } }], time: 0 }, 1);
  api.move(0.05, 0, 0);
  t.eq(api.position[0], 0.05, 'createEntityApi.move 改写实体 position');

  // 2) compileObjectScript：onUpdate 经 this.move 推动实体
  const fakeRt = { entities: [{ id: 1, transform: { position: [0, 0, 0] } }], time: 0 };
  const compiled = compileObjectScript('this.move(0.05, 0, 0);', { entityId: 1, name: 'a#0', runtime: fakeRt });
  t.ok(!compiled.error, '合法脚本编译无 error');
  compiled.onUpdate(0.016, { keys: new Set(), mouse: { x: 0, y: 0, down: false } });
  t.eq(fakeRt.entities[0].transform.position[0], 0.05, '编译后 onUpdate 经 this.move 推动实体');

  // 3) validateScript：语法错误返回 ok:false
  t.eq(validateScript('this.move(0.05,0,0);').ok, true, 'validate 合法脚本 ok');
  t.eq(validateScript('this.move(  ').ok, false, 'validate 语法错误 ok:false');

  // 4) compileSceneScripts：单个脚本语法错误仅入 errors，不抛、不阻断其它脚本
  const scene3 = new Scene3D();
  const good = new GameObject3D('good'); good.scripts = ['this.move(0.05, 0, 0);'];
  const bad = new GameObject3D('bad'); bad.scripts = ['this.move(  '];
  scene3.add(good); scene3.add(bad);
  const rt3 = { entities: [{ id: good.id, transform: { position: [0, 0, 0] } }, { id: bad.id, transform: { position: [0, 0, 0] } }], time: 0 };
  const cr = compileSceneScripts(rt3, scene3);
  t.eq(cr.scripts.length, 1, '语法错误脚本被剔除，仅 1 个有效脚本');
  t.eq(cr.errors.length, 1, '收集到 1 个编译错误');

  // 5) PlaySession 自动收集脚本 + 隔离（红线 F）
  const scene = new Scene3D();
  const a = new GameObject3D('a'); a.transform.position = [0, 0, 0];
  a.scripts = ['this.move(0.05, 0, 0);'];
  scene.add(a);
  const session = new PlaySession(scene);
  t.eq(session.scriptErrors.length, 0, 'PlaySession 编译场景脚本无错误');
  session.start();
  for (let i = 0; i < 10; i++) session.step(16);
  t.ok(session.getRenderScene().get(a.id).transform.position[0] > 0.4, '对象脚本驱动运行时改写快照 transform');
  t.eq(scene.get(a.id).transform.position[0], 0, '原编辑场景零污染（红线 F）');
  session.stop();
  t.eq(scene.get(a.id).transform.position[0], 0, '停止后原编辑场景仍零污染');
}
