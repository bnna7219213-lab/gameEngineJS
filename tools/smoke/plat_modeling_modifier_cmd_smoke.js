// plat_modeling_modifier_cmd smoke：修改器栈挂载/命令化/Apply/顺序敏感（v3 M-D / D27）。
import { CommandBus } from '../../src/editor/modeling/commands.js';
import { AddModifierCommand, RemoveModifierCommand, MoveModifierCommand, SetModifierParamCommand, ApplyModifierCommand, modifiersOf, evalModifiedMesh } from '../../src/editor/modeling/modifier_cmd.js';
import { HMesh } from '../../src/engine/modeling/hedit.js';
import { cube } from '../../src/engine/render/primitives.js';
import { GameObject3D } from '../../src/engine/platform/scene3d.js';
import { meshHash } from '../../src/engine/core/hash.js';

export const name = 'plat-modeling-modifier-cmd';
export async function run(t) {
  const bus = new CommandBus({});
  const obj = new GameObject3D('box');
  const meshData = { id: obj.id, hmesh: HMesh.fromRenderMesh(cube(1)) };
  const baseMesh = meshData.hmesh.toRenderMesh();
  const baseHash = meshHash(baseMesh);

  // ---- AddModifier ----
  bus.submit(new AddModifierCommand(obj.id, obj, { type: 'MIRROR', params: { axis: 'X' } }));
  t.eq(modifiersOf(obj).length, 1, 'add 后栈长 1');
  t.eq(modifiersOf(obj)[0].type, 'MIRROR', '修改器类型');
  bus.undo();
  t.eq(modifiersOf(obj).length, 0, 'add undo 移除');

  // ---- evalModifiedMesh：惰性求值 ----
  bus.submit(new AddModifierCommand(obj.id, obj, { type: 'MIRROR', params: { axis: 'X' } }));
  const evaluated = evalModifiedMesh(obj, baseMesh);
  t.eq(evaluated.vertexCount, 48, 'MIRROR 求值顶点翻倍');
  t.eq(baseMesh.vertexCount, 24, '基础网格不被修改（非破坏）');

  // ---- SetModifierParam：开关 + 参数 ----
  bus.submit(new SetModifierParamCommand(obj.id, obj, 0, 'enabled', false));
  t.eq(evalModifiedMesh(obj, baseMesh).vertexCount, 24, 'enabled=false 不求值');
  bus.undo();
  t.eq(evalModifiedMesh(obj, baseMesh).vertexCount, 48, 'setParam undo 恢复');

  // ---- 栈顺序敏感：MIRROR+ARRAY 与 ARRAY+MIRROR 顶点数同为 ×2×3=6 倍但布局不同 ----
  bus.submit(new AddModifierCommand(obj.id, obj, { type: 'ARRAY', params: { count: 3, offset: [3, 0, 0] } }));
  const m1 = evalModifiedMesh(obj, baseMesh); // MIRROR 后 ARRAY
  t.eq(m1.vertexCount, 144, 'MIRROR+ARRAY 顶点 24*2*3=144');
  bus.submit(new MoveModifierCommand(obj.id, obj, 1, 0)); // ARRAY 移到栈顶
  const m2 = evalModifiedMesh(obj, baseMesh); // ARRAY 后 MIRROR
  t.eq(m2.vertexCount, 144, '换序后顶点数一致');
  t.ok(meshHash(m1) !== meshHash(m2), '换序后几何布局不同（顺序敏感）');
  bus.undo(); // 撤销换序
  t.eq(meshHash(evalModifiedMesh(obj, baseMesh)), meshHash(m1), 'move undo 恢复顺序');

  // ---- RemoveModifier ----
  bus.submit(new RemoveModifierCommand(obj.id, obj, 1)); // 移除 ARRAY
  t.eq(modifiersOf(obj).length, 1, 'remove 后栈长 1');
  bus.undo();
  t.eq(modifiersOf(obj).length, 2, 'remove undo 恢复');

  // ---- ApplyModifier：把 MIRROR 烘回基础网格并从栈移除 ----
  // 注意：cube 关于 X=0 对称，MIRROR X 后镜像与原顶点重合会被 weld 掉；
  // 先把基础网格平移离对称面，使镜像真正产生新顶点。
  for (let v = 0; v < meshData.hmesh._cap; v++) {
    if (meshData.hmesh._vertAlive[v]) meshData.hmesh.positions[v * 3] += 2;
  }
  const before = meshHash(meshData.hmesh.toRenderMesh());
  bus.submit(new ApplyModifierCommand(obj.id, obj, meshData, 0)); // apply MIRROR
  t.eq(modifiersOf(obj).length, 1, 'apply 后栈少一层（剩 ARRAY）');
  t.ok(meshData.hmesh.vertCount > 8, 'apply 后基础网格顶点增多（MIRROR 烘入）');
  t.ok(meshHash(meshData.hmesh.toRenderMesh()) !== before, 'apply 后基础网格变化');
  bus.undo();
  t.eq(modifiersOf(obj).length, 2, 'apply undo 恢复栈');
  t.eq(meshHash(meshData.hmesh.toRenderMesh()), before, 'apply undo 恢复基础网格');

  // ---- 索引越界抛错（红线 A）----
  let threw = false;
  try { bus.submit(new RemoveModifierCommand(obj.id, obj, 99)); } catch (e) { threw = /索引越界/.test(e.message); }
  t.ok(threw, 'remove 越界抛错');
}
