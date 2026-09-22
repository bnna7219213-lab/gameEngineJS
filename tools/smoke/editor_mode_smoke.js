// editor_mode smoke：模式状态机与快捷键路由（v3 M-A / D37）。
import { EditorMode, SelectMode, ModeState } from '../../src/editor/modeling/mode.js';

export const name = 'editor-mode';
export async function run(t) {
  const ms = new ModeState();
  t.eq(ms.mode, EditorMode.OBJECT, '默认物体模式');
  t.ok(ms.isObject() && !ms.isEdit(), 'isObject/isEdit');

  // 模式切换 + 通知
  let notified = null;
  ms.onChange((m, prev) => { notified = { m, prev }; });
  t.ok(ms.setMode(EditorMode.EDIT_VERT), '切换到顶点编辑');
  t.ok(ms.isEdit(), '编辑模式判定');
  t.eq(ms.selectMode, SelectMode.VERT, '顶点选择模式联动');
  t.eq(notified.m, EditorMode.EDIT_VERT, 'onChange 通知新模式');
  t.eq(notified.prev, EditorMode.OBJECT, 'onChange 通知旧模式');
  t.ok(!ms.setMode(EditorMode.EDIT_VERT), '重复设置返回 false');

  ms.setMode(EditorMode.EDIT_EDGE); t.eq(ms.selectMode, SelectMode.EDGE, '边模式');
  ms.setMode(EditorMode.EDIT_FACE); t.eq(ms.selectMode, SelectMode.FACE, '面模式');
  ms.setMode(EditorMode.OBJECT); t.eq(ms.selectMode, null, '物体模式无 selectMode');

  // 快捷键路由：按模式隔离
  ms.bind(EditorMode.OBJECT, 'g', 'move');
  ms.bind(EditorMode.EDIT_VERT, 'e', 'extrude');
  ms.setMode(EditorMode.OBJECT);
  t.eq(ms.route('g'), 'move', 'OBJECT 模式路由 g');
  t.eq(ms.route('e'), null, 'OBJECT 模式不响应编辑快捷键');
  ms.setMode(EditorMode.EDIT_VERT);
  t.eq(ms.route('e'), 'extrude', 'EDIT_VERT 模式路由 e');
  t.eq(ms.route('g'), null, 'EDIT_VERT 模式不响应物体快捷键');

  // 解绑
  const off = ms.bind(EditorMode.OBJECT, 'x', 'delete');
  t.eq(ms.route('x'), null, '当前模式无 x');
  ms.setMode(EditorMode.OBJECT);
  t.eq(ms.route('x'), 'delete', '绑定生效');
  off();
  t.eq(ms.route('x'), null, '解绑生效');

  // 非法模式抛错（红线 A）
  let threw = false;
  try { ms.setMode('NOPE'); } catch (e) { threw = /非法模式/.test(e.message); }
  t.ok(threw, '非法模式抛可读错误');
  let threw2 = false;
  try { ms.bind('NOPE', 'k', 'c'); } catch (e) { threw2 = true; }
  t.ok(threw2, '非法模式 bind 抛错');

  ms.clearBindings();
  t.eq(ms.route('e'), null, 'clearBindings 清空');
}
