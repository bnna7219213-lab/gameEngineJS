// editor_modeling_api smoke：建模脚本 JS API（data/ctx/ops/undoGroup）+ runScript 注入。
import { createModelingApi } from '../../src/editor/modeling/api.js';
import { EditSession } from '../../src/editor/modeling/edit_session.js';
import { runScript } from '../../src/editor/ide_script_api.js';
import { cube } from '../../src/engine/render/primitives.js';
import { meshHash } from '../../src/engine/core/hash.js';
import { Selection } from '../../src/editor/selection.js';

export const name = 'editor-modeling-api';
export async function run(t) {
  // 最小 project 桩
  const project = {
    scene: () => ({ get: () => null, add: (o) => ({ id: 99, name: o.name }) }),
    materialLibrary: null, world: null,
  };
  const selection = new Selection();
  const editSession = new EditSession({ scene: () => ({}) });
  editSession.enterEdit(1, cube(1), 'VERT');

  const api = createModelingApi(project, selection, editSession);
  t.ok(api.data && api.ctx && api.ops && api.undoGroup, 'api 含 data/ctx/ops/undoGroup');

  // ---- data.meshes ----
  t.ok(typeof api.data.meshes.new === 'function', 'data.meshes.new 存在');
  t.ok(typeof api.data.materials.new === 'function', 'data.materials.new 存在');
  const mat = api.data.materials.new('test-mat');
  t.ok(mat && mat.id > 0, 'materials.new 返回材质');
  t.ok(api.data.materials.get(mat.id) === mat, 'materials.get 命中');

  // ---- ctx ----
  t.eq(api.ctx.mode, 'EDIT_VERT', 'ctx.mode 反映编辑模式');
  t.eq(api.ctx.selectMode, 'VERT', 'ctx.selectMode 反映选择模式');

  // ---- ops.object.modeSet ----
  const r1 = api.ops.object.modeSet('EDIT_FACE');
  t.ok(r1.ok && r1.mode === 'EDIT_FACE', 'modeSet 切面模式');
  t.eq(api.ctx.selectMode, 'FACE', 'ctx.selectMode 已切到 FACE');

  // ---- ops.mesh.selectAll ----
  const r2 = api.ops.mesh.selectAll('SELECT');
  t.ok(r2.ok && r2.count === 12, 'selectAll 选中 12 面');
  const r3 = api.ops.mesh.selectAll('DESELECT');
  t.ok(r3.ok && r3.count === 0, 'selectAll DESELECT 清空');

  // ---- ops.mesh.extrudeRegion（经命令总线，可撤销）----
  api.ops.mesh.selectAll('SELECT');
  const h0 = meshHash(editSession.meshRegistry.get(1).hmesh.toRenderMesh());
  const cmd = api.ops.mesh.extrudeRegion({ offset: 0.5 });
  t.ok(cmd && cmd.op === 'mesh.extrudeRegion', 'extrudeRegion 返回命令实例');
  const h1 = meshHash(editSession.meshRegistry.get(1).hmesh.toRenderMesh());
  t.ok(h1 !== h0, '脚本挤出后网格变化');
  editSession.bus.undo();
  t.eq(meshHash(editSession.meshRegistry.get(1).hmesh.toRenderMesh()), h0, '脚本挤出 undo 恢复');

  // ---- undoGroup：脚本循环合并单步撤销 ----
  api.ops.mesh.selectAll('SELECT');
  const h2 = meshHash(editSession.meshRegistry.get(1).hmesh.toRenderMesh());
  api.undoGroup(() => {
    for (let i = 0; i < 3; i++) api.ops.mesh.extrudeRegion({ offset: 0.1 * (i + 1) });
  });
  t.ok(editSession.bus.canUndo(), 'undoGroup 后可撤销');
  editSession.bus.undo(); // 单步撤销整个组
  t.eq(meshHash(editSession.meshRegistry.get(1).hmesh.toRenderMesh()), h2, 'undoGroup 单步回滚到组前');

  // ---- runScript 注入（核心：脚本与 GUI 共用同一 API）----
  const scriptApi = { ...api, help: () => 'ok' };
  const result = runScript(scriptApi, 'ops.mesh.selectAll("SELECT"); ops.mesh.extrudeRegion({ offset: 0.2 }); ctx.selectMode');
  t.ok(result.ok, 'runScript 执行成功');
  t.eq(result.result, 'FACE', 'runScript 返回值正确（表达式尾）');
  t.ok(meshHash(editSession.meshRegistry.get(1).hmesh.toRenderMesh()) !== h2, '脚本挤出改变网格');

  // 脚本内 undoGroup
  const h3 = meshHash(editSession.meshRegistry.get(1).hmesh.toRenderMesh());
  const r4 = runScript(scriptApi, 'undoGroup(() => { for (let i = 0; i < 2; i++) ops.mesh.extrudeRegion({ offset: 0.05 }); }); "done"');
  t.ok(r4.ok && r4.result === 'done', '脚本内 undoGroup 执行');
  editSession.bus.undo();
  t.eq(meshHash(editSession.meshRegistry.get(1).hmesh.toRenderMesh()), h3, '脚本 undoGroup 单步撤销');

  // 非法算子抛错
  const r5 = runScript(scriptApi, 'ops.mesh.nope()');
  t.ok(!r5.ok, '非法算子执行失败');
}
