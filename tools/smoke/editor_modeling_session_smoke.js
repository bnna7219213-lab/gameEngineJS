// editor_modeling_session smoke：编辑会话（进/出编辑模式、选择、算子经命令总线可撤销）。
import { EditSession } from '../../src/editor/modeling/edit_session.js';
import { cube } from '../../src/engine/render/primitives.js';
import { meshHash } from '../../src/engine/core/hash.js';

export const name = 'editor-modeling-session';
export async function run(t) {
  const ctx = { scene: () => ({}) }; // 最小 ctx（enterEdit 只需 truthy）
  const session = new EditSession(ctx);
  t.ok(session.mode === 'OBJECT', '初始物体模式');
  t.ok(!session.isEditing(), '初始不在编辑');

  // 进入编辑模式
  const base = cube(1);
  const hmesh = session.enterEdit(1, base, 'VERT');
  t.ok(session.isEditing(), '进入编辑模式');
  t.eq(session.selectMode, 'VERT', '顶点选择模式');
  t.eq(hmesh.vertCount, 8, 'cube weld 为 8 顶点');
  t.eq(session.editingObject(), 1, '编辑对象 id=1');

  // 选择
  session.selectAll();
  t.eq(session.selection().length, 8, 'selectAll 选中全部顶点');
  session.clearSelection();
  t.eq(session.selection().length, 0, 'clearSelection');

  // 拾取选择（用与 pick smoke 相同的固定正交投影）
  const W = 64, H = 64, scale = 20;
  const project = (wp) => ({ x: W / 2 + wp[0] * scale, y: H / 2 - wp[1] * scale, z: wp[2] });
  const ray = (sx, sy) => ({ o: [(sx - W / 2) / scale, (H / 2 - sy) / scale, 10], d: [0, 0, -1] });
  session.enterEdit(1, session.meshRegistry.get(1).hmesh.toRenderMesh(), 'VERT');
  const hit = session.pickAndSelect(project, ray, W / 2 + 10, H / 2 - 10);
  t.ok(hit && hit.type === 'VERT', '拾取命中顶点');
  t.eq(session.selection().length, 1, '拾取后选中 1 个顶点');

  // 算子经命令总线可撤销：挤出
  const h0 = meshHash(session.meshRegistry.get(1).hmesh.toRenderMesh());
  session.setSelectMode('FACE');
  session.selectAll();
  session.extrude(0.5);
  const h1 = meshHash(session.meshRegistry.get(1).hmesh.toRenderMesh());
  t.ok(h1 !== h0, '挤出后网格变化');
  t.ok(session.bus.canUndo(), '命令可撤销');
  session.bus.undo();
  t.eq(meshHash(session.meshRegistry.get(1).hmesh.toRenderMesh()), h0, 'undo 恢复挤出前');

  // 删除选中面 + undo
  session.setSelectMode('FACE');
  session.selectAll();
  const selFaces = session.selection();
  session.deleteSelected();
  t.ok(session.meshRegistry.get(1).hmesh.faceCount < 12, '删除面后减少');
  session.bus.undo();
  t.eq(session.meshRegistry.get(1).hmesh.faceCount, 12, 'undo 恢复面数');

  // 退出编辑模式：写回渲染网格
  const out = session.exitEdit();
  t.ok(out && out.positions && out.indices, 'exitEdit 返回渲染网格');
  t.ok(!session.isEditing(), '退出后回物体模式');
  t.eq(session.editingObject(), null, '编辑对象清空');

  // 非法操作抛错
  let threw = false;
  try { session.setSelectMode('NOPE'); } catch (e) { threw = /非法选择模式/.test(e.message); }
  t.ok(threw, '非法选择模式抛错');
  let threw2 = false;
  try { session.extrude(1); } catch (e) { threw2 = /不在编辑模式/.test(e.message); }
  t.ok(threw2, '非编辑模式调算子抛错');
}
