export const name = 'api-extension';
import { Scene3D, GameObject3D } from '../../src/engine/platform/scene3d.js';
import { PlaySession } from '../../src/engine/platform/play_session.js';
import { createEntityApi, evalWatch } from '../../src/editor/script_compiler.js';

export async function run(t) {
  // —— input 事件回调 ——
  {
    const s = new Scene3D();
    const pl = new GameObject3D('player'); pl.scripts = ['this.onKeyDown((k)=>{ this.move(1,0,0); this.log("key "+k); });'];
    s.add(pl);
    const ps = new PlaySession(s); ps.start();
    ps.runtime.pushKey('keydown', 'ArrowRight');
    ps.stepFrame();
    t.ok(ps.getRenderScene().get(pl.id).transform.position[0] > 0.99, 'onKeyDown 回调在键盘事件中触发并移动');
    t.ok(ps.runtime.logBuffer.some(l => String(l.msg).includes('key ArrowRight')), 'onKeyDown 回调收到按键名');
  }

  // —— spawn / despawn ——
  {
    const s = new Scene3D();
    const spawner = new GameObject3D('spawner');
    spawner.scripts = ['const id = this.spawn("bullet", { position:[1,1,1] }); this.log("spawned "+id);'];
    s.add(spawner);
    const ps = new PlaySession(s); ps.start();
    ps.stepFrame();
    const spawned = ps.runtime.entities.find(e => String(e.id).startsWith('spawn_'));
    t.ok(!!spawned, 'this.spawn 在运行时新增实体');
    t.ok(Math.abs(spawned.transform.position[0] - 1) < 1e-9, 'spawn 接收 position 选项');
    ps.runtime.despawn(spawned.id);
    t.eq(ps.runtime.entities.some(e => e.id === spawned.id), false, 'despawn 移除实体');
  }

  // —— timer ——
  {
    const s = new Scene3D();
    const clock = new GameObject3D('clock');
    clock.scripts = ['let n=0; this.timer(0.1, ()=>{ n++; this.log("tick"+n); }); this.log("armed");'];
    s.add(clock);
    const ps = new PlaySession(s); ps.start();
    // 0.1s = 6 固定步；推进 10 帧确保触发
    for (let i = 0; i < 12; i++) ps.stepFrame();
    const ticks = ps.runtime.logBuffer.filter(l => String(l.msg).includes('tick')).length;
    t.ok(ticks >= 1, 'this.timer 在到期时触发回调');
  }

  // —— 碰撞/查询 ——
  {
    const s = new Scene3D();
    const a = new GameObject3D('a'); a.transform.position = [0, 0, 0];
    const b = new GameObject3D('b'); b.transform.position = [2, 0, 0];
    const c = new GameObject3D('c'); c.transform.position = [5, 0, 0];
    s.add(a); s.add(b); s.add(c);
    const ps = new PlaySession(s); ps.start();
    const near = ps.runtime.queryRadius(a.id, 3);
    t.eq(near.length, 1, 'queryRadius 返回半径内实体');
    t.eq(near[0].id, b.id, 'queryRadius 命中 b 而非 c');
    t.ok(Math.abs(ps.runtime.distanceTo(a.id, b.id) - 2) < 1e-9, 'distanceTo 正确');
    const hit = ps.runtime.raycast(a.id, [1, 0, 0], 10);
    t.eq(hit, b.id, 'raycast 沿 +x 命中 b');
  }

  // —— breakpoint ——
  {
    const s = new Scene3D();
    const o = new GameObject3D('o'); o.scripts = ['this.move(1,0,0); this.breakpoint("here"); this.move(1,0,0);'];
    s.add(o);
    const ps = new PlaySession(s); ps.start();
    ps.stepFrame();
    t.ok(ps.runtime.breakRequested, 'breakpoint 触发 breakRequested');
    t.ok(ps.paused, '命中断点后 PlaySession 自动暂停');
    const xHit = ps.getRenderScene().get(o.id).transform.position[0];
    // 后续 step 不应推进（已暂停且断点拦截）
    ps.stepFrame();
    t.eq(ps.getRenderScene().get(o.id).transform.position[0], xHit, '断点后不再推进帧');
  }

  // —— evalWatch ——
  {
    const s = new Scene3D();
    const o = new GameObject3D('o'); o.transform.position = [3, 4, 0]; s.add(o);
    const ps = new PlaySession(s); ps.start();
    const api = createEntityApi(ps.runtime, o.id);
    api.dt = 1 / 60; api.input = null;
    t.eq(evalWatch('pos[0]', api), '3', 'watch 读取 pos');
    t.eq(evalWatch('Math.round(sqrt(pos[0]*pos[0]+pos[1]*pos[1]))', api), '5', 'watch 计算距离');
    t.ok(evalWatch('??', api).startsWith('ERR'), 'watch 错误表达式返回 ERR');
  }
}
