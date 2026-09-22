// plat_modeling_ops smoke：P0 建模算子（extrude/merge/delete/subdivide）命令化 + do/undo 哈希往返。
import { CommandBus } from '../../src/editor/modeling/commands.js';
import { createMeshOps, ExtrudeRegionCommand, MergeVertsCommand, DeleteCommand, SubdivideCommand } from '../../src/editor/modeling/ops.js';
import { HMesh } from '../../src/engine/modeling/hedit.js';
import { cube } from '../../src/engine/render/primitives.js';
import { meshHash } from '../../src/engine/core/hash.js';

export const name = 'plat-modeling-ops';
export async function run(t) {
  // 构造一个 cube 的 HMesh 与注册表
  const base = cube(1); // 24 verts / 36 idx
  const hmesh = HMesh.fromRenderMesh(base);
  t.eq(hmesh.vertCount, 8, 'cube 经 fromRenderMesh weld 为 8 顶点');
  t.eq(hmesh.faceCount, 12, 'cube 12 三角面');
  t.ok(hmesh.validate().ok, '初始 HMesh 有效');

  const meshData = { id: 1, hmesh };
  const meshRegistry = new Map([[1, meshData]]);
  const bus = new CommandBus({ scene: null });
  const ops = createMeshOps(bus, meshRegistry);

  const h0 = meshHash(hmesh.toRenderMesh());

  // ---- ExtrudeRegion：挤出所有面 ----
  const extrudeCmd = new ExtrudeRegionCommand(meshData, { offset: 0.5 });
  bus.submit(extrudeCmd);
  const afterExtrude = meshHash(hmesh.toRenderMesh());
  t.ok(afterExtrude !== h0, 'extrude 后网格变化');
  t.ok(hmesh.vertCount > 8, 'extrude 增加顶点');
  t.ok(hmesh.faceCount > 12, 'extrude 增加面');
  t.ok(hmesh.validate().ok, 'extrude 后 HMesh 有效');
  bus.undo();
  t.eq(meshHash(hmesh.toRenderMesh()), h0, 'extrude undo 恢复原网格');
  bus.redo();
  t.eq(meshHash(hmesh.toRenderMesh()), afterExtrude, 'extrude redo 重做一致');

  // ---- MergeVerts：合并两个顶点到中心 ----
  bus.undo(); // 回到原始 cube
  const mergeCmd = new MergeVertsCommand(meshData, { type: 'CENTER', vertexIds: [0, 1, 2, 3] });
  bus.submit(mergeCmd);
  t.ok(hmesh.vertCount < 8, 'merge 后顶点减少');
  bus.undo();
  t.eq(meshHash(hmesh.toRenderMesh()), h0, 'merge undo 恢复');

  // ---- DeleteCommand：删除一个面 ----
  const delCmd = new DeleteCommand(meshData, { type: 'FACE', ids: [0] });
  bus.submit(delCmd);
  t.eq(hmesh.faceCount, 11, '删除一面后剩 11');
  bus.undo();
  t.eq(hmesh.faceCount, 12, 'delete undo 恢复 12 面');
  t.eq(meshHash(hmesh.toRenderMesh()), h0, 'delete undo 哈希一致');

  // ---- SubdivideCommand：细分一条边 ----
  const subCmd = new SubdivideCommand(meshData, { edgeIds: [0], cuts: 1 });
  bus.submit(subCmd);
  t.ok(hmesh.vertCount > 8, 'subdivide 增加顶点');
  bus.undo();
  t.eq(meshHash(hmesh.toRenderMesh()), h0, 'subdivide undo 恢复');

  // ---- 便捷 API（ops.* 与命令类结果一致）----
  const directCmd = new ExtrudeRegionCommand(meshData, { offset: 1 });
  bus.submit(directCmd);
  const hDirect = meshHash(hmesh.toRenderMesh());
  bus.undo();
  ops.extrudeRegion(1, { offset: 1 });
  const hOps = meshHash(hmesh.toRenderMesh());
  t.eq(hOps, hDirect, 'ops.extrudeRegion 与直接提交命令结果一致');
  bus.undo();

  // ---- 命令脏标记 ----
  bus.consumeDirty();
  ops.extrudeRegion(1, { offset: 0.1 });
  const d = bus.consumeDirty();
  t.ok(d.ids.has(1), '命令脏标记含 mesh id');
  t.ok(d.flags.geometry, '脏标记含 geometry');
  bus.undo();
}
