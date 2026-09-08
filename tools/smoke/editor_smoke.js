// editor smoke：验证编辑器 DOM-free 核心（registry/selection/history/project/ide_script_api/timeline）。
// 契约 §3 要求 editor_*.js；UI 面板依赖 DOM，不在 Node 覆盖范围内。
import { registry, componentsOf, addableComponents, addComponent, removeComponent, setField, getComponent } from '../../src/editor/registry.js';
import { Selection } from '../../src/editor/selection.js';
import { History } from '../../src/editor/history.js';
import { Project, memoryStorage } from '../../src/editor/project.js';
import { createApi, runScript } from '../../src/editor/ide_script_api.js';
import { Timeline } from '../../src/editor/timeline.js';
import { Scene3D } from '../../src/engine/platform/scene3d.js';

export const name = 'editor';
export async function run(t) {
  // ---- registry ----
  const proj = new Project({ storage: memoryStorage() });
  proj.createScene('s1');
  const obj = proj.spawn('cube', { position: [1, 2, 3], components: { mesh: { shape: 'cube', albedo: [1, 2, 3], rough: 0.5, metal: 0 } } });
  t.ok(obj && obj.id > 0, 'project.spawn 返回对象');
  t.eq(componentsOf(obj).join(','), 'transform,mesh', 'componentsOf 含 transform+mesh');
  t.ok(addableComponents(obj).includes('light'), 'addableComponents 含 light');
  t.ok(addComponent(obj, 'light'), 'addComponent light');
  t.ok(!addComponent(obj, 'light'), '重复添加被拒绝');
  t.ok(setField(obj, 'light', 'intensity', 2.5), 'setField');
  t.eq(getComponent(obj, 'light').intensity, 2.5, '字段写入生效');
  t.ok(setField(obj, 'transform', 'position', [9, 9, 9]), 'transform 走 obj.transform');
  t.eq(obj.transform.position[0], 9, 'transform position 生效');
  t.ok(removeComponent(obj, 'light'), 'removeComponent');
  t.ok(!removeComponent(obj, 'transform'), 'builtin 不可移除');

  // ---- selection ----
  const sel = new Selection();
  let notified = 0;
  sel.onChange(() => notified++);
  sel.set(1); sel.toggle(2); sel.toggle(1);
  t.eq(sel.get().join(','), '2', 'toggle 语义');
  t.eq(sel.primary(), 2, 'primary');
  sel.clear();
  t.eq(sel.get().length, 0, 'clear');
  t.ok(notified >= 4, 'onChange 通知');

  // ---- history（undo/redo 快照恢复）----
  const hist = new History();
  const s1 = proj.scene();
  hist.push(s1, 'op1');
  const before = s1.objects.size;
  proj.spawn('extra');
  t.eq(s1.objects.size, before + 1, 'spawn 后数量+1');
  const restored = hist.undo(s1, Scene3D);
  t.ok(restored && restored.objects.size === before, 'undo 恢复快照');
  const redone = hist.redo(restored, Scene3D);
  t.ok(redone && redone.objects.size === before + 1, 'redo 恢复修改');

  // ---- project 持久化 ----
  const st = memoryStorage();
  const p2 = new Project({ name: 'demo', storage: st });
  p2.createScene('a'); p2.createScene('b');
  p2.activeScene = 'b';
  p2.addAsset('materials/x.mat', 'material', { albedo: [255, 0, 0] });
  p2.save();
  const loaded = Project.load('demo', { storage: st });
  t.ok(loaded && loaded.activeScene === 'b' && loaded.scenes.size === 2, 'project save/load 往返');
  t.eq(loaded.listAssets('material').length, 1, '资产持久化');

  // ---- ide_script_api + runScript ----
  const p3 = new Project({ storage: memoryStorage() });
  p3.createScene('main');
  const sel3 = new Selection(); const h3 = new History();
  const api = createApi(p3, sel3, h3);
  let r = runScript(api, "spawn('hero', { position: [1,0,0] })");
  t.ok(r.ok && r.result > 0, 'gbhy spawn');
  const heroId = r.result;
  r = runScript(api, `move(${heroId}, [5, 0, 0])`);
  t.ok(r.ok, 'gbhy move');
  t.eq(p3.scene().get(heroId).transform.position[0], 5, 'move 生效');
  r = runScript(api, `select(${heroId}); sel()`);
  t.ok(r.ok && r.result[0] === heroId, '多语句 + select/sel');
  r = runScript(api, `get(${heroId}, 'transform').position[0]`);
  t.ok(r.ok && r.result === 5, '表达式求值');
  r = runScript(api, 'del(99999)');
  t.ok(!r.ok && /not found/.test(r.error), '错误可读不静默（红线 A）');
  r = runScript(api, 'this_is_not_defined()');
  t.ok(!r.ok, '脚本异常被捕获');
  t.ok(h3.canUndo(), 'gbhy 操作压入历史');

  // ---- timeline ----
  const tl = new Timeline();
  tl.duration = 2;
  tl.addTrack(heroId, 'position');
  tl.key(heroId, 'position', [0, 0, 0], 0);
  tl.key(heroId, 'position', [10, 0, 0], 2);
  const mid = tl.eval(tl.tracks[0], 1);
  t.near(mid[0], 5, 1e-6, '线性插值中点');
  tl.play();
  for (let i = 0; i < 60; i++) tl.tick(1 / 60, p3.scene()); // 1s
  t.near(p3.scene().get(heroId).transform.position[0], 5, 1e-3, 'tick 写回场景');
  while (tl.tick(1 / 30, p3.scene())) { /* 播到结束 */ }
  t.near(p3.scene().get(heroId).transform.position[0], 10, 1e-3, '播放结束到末帧');
  t.ok(!tl.playing, '播完自动停');
}
