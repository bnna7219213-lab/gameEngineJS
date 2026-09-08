export const name = 'debug-mode';
import { Scene3D, GameObject3D } from '../../src/engine/platform/scene3d.js';
import { PlaySession } from '../../src/engine/platform/play_session.js';

export async function run(t) {
  const scene = new Scene3D();
  const cube = new GameObject3D('cube'); cube.transform.position = [0, 0, 0];
  // 初始脚本：每帧 x += 0.1
  cube.scripts = ['this.move(0.1, 0, 0);'];
  scene.add(cube);

  const session = new PlaySession(scene);
  session.start();

  // 1) stepFrame 精确推进一固定步长，实体应移动 0.1
  session.stepFrame();
  t.ok(session.getRenderScene().get(cube.id).transform.position[0] > 0.09, 'stepFrame 推进一帧使实体移动');

  // 2) 暂停后 step(实时) 不推进；stepFrame 仍可控推进
  session.pause();
  const xPaused = session.getRenderScene().get(cube.id).transform.position[0];
  session.step(16); // 暂停态应被拦截
  t.eq(session.getRenderScene().get(cube.id).transform.position[0], xPaused, '暂停态 step() 被拦截不推进');
  session.stepFrame(); // 暂停态单步仍可用
  t.ok(session.getRenderScene().get(cube.id).transform.position[0] > xPaused, '暂停态 stepFrame 仍可控推进');

  // 3) 热重载：把脚本换成每帧 y += 0.2（不停止会话）
  const res = session.hotReload(cube.id, 0, 'this.move(0, 0.2, 0);');
  t.eq(res.ok, true, '热重载返回 ok');
  const xBefore = session.getRenderScene().get(cube.id).transform.position[0];
  session.resume();
  session.stepFrame();
  const after = session.getRenderScene().get(cube.id).transform.position;
  t.ok(after[1] > 0.19, '热重载后新脚本生效（y 方向移动）');
  t.eq(after[0], xBefore, '热重载后旧脚本不再生效（x 不变）');

  // 4) 空槽位热重载：为原本无脚本的实体新增首个脚本
  const scene2 = new Scene3D();
  const ball = new GameObject3D('ball'); ball.transform.position = [0, 0, 0]; // 无 scripts
  scene2.add(ball);
  const s2 = new PlaySession(scene2); s2.start();
  const r2 = s2.hotReload(ball.id, 0, 'this.move(0.3, 0, 0);');
  t.eq(r2.ok, true, '空槽位热重载成功（新增首个脚本）');
  s2.stepFrame();
  t.ok(s2.getRenderScene().get(ball.id).transform.position[0] > 0.29, '新增脚本被执行');

  // 5) 编译错误热重载：不替换旧脚本、不崩溃、返回 error
  const s3 = new PlaySession(scene); s3.start();
  const bad = s3.hotReload(cube.id, 0, 'this.move( ');
  t.eq(bad.ok, false, '语法错误热重载返回 ok:false');
  t.ok(bad.error, '返回 error 信息');
  s3.stepFrame();
  // 旧脚本（x+=0.1）仍在跑
  t.ok(s3.getRenderScene().get(cube.id).transform.position[0] > 0.09, '热重载失败时旧脚本继续运行（不中断游戏）');

  // 6) 脚本日志经 runtime.logBuffer 捕获
  const scene3 = new Scene3D();
  const log = new GameObject3D('log'); log.scripts = ['this.log("hello-" + Math.round(dt*1000));'];
  scene3.add(log);
  const s4 = new PlaySession(scene3); s4.start();
  s4.stepFrame();
  t.ok(s4.runtime.logBuffer.length >= 1, 'api.log 写入 runtime.logBuffer');
  t.ok(s4.runtime.logBuffer.some(l => String(l.msg).includes('hello-')), '日志内容正确');
}
