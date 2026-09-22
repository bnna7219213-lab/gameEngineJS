// plat_modeling_undo smoke：命令总线 do/undo/redo/undoGroup/dirtySet（v3 M-A / D25/D30/D34/D36）。
import { Command, SetValueCommand, SnapshotCommand, CommandBus } from '../../src/editor/modeling/commands.js';
import { meshHash } from '../../src/engine/core/hash.js';
import { Scene3D, GameObject3D } from '../../src/engine/platform/scene3d.js';

export const name = 'plat-modeling-undo';
export async function run(t) {
  const scene = new Scene3D();
  const obj = new GameObject3D('cube');
  scene.add(obj);
  const bus = new CommandBus({ scene });

  // ---- 基本 do/undo/redo：MoveVerts 属性回滚 ----
  const get = () => [...obj.transform.position];
  const set = (ctx, v) => { obj.transform.position = [...v]; };
  bus.submit(new SetValueCommand('transform.translate', obj.id, { value: [1, 0, 0] }, set, get));
  t.eq(obj.transform.position[0], 1, 'do 生效');
  t.ok(bus.canUndo(), '可撤销');
  bus.undo();
  t.eq(obj.transform.position[0], 0, 'undo 回滚');
  bus.redo();
  t.eq(obj.transform.position[0], 1, 'redo 重做');

  // ---- undoGroup：循环命令合并为单步撤销 ----
  bus.group('build-tower', () => {
    for (let i = 0; i < 5; i++) bus.submit(new SetValueCommand('transform.translate', obj.id, { value: [i + 1, 0, 0] }, set, get));
  });
  t.eq(obj.transform.position[0], 5, '组内 5 次 do 生效');
  t.eq(bus.undoStack.length >= 1, true, '组压入为单条');
  bus.undo(); // 单步撤销整个组
  t.eq(obj.transform.position[0], 1, 'undoGroup 单步回滚到组前');

  // ---- D34：组内异常自动回滚已执行命令并闭合组 ----
  const posBefore = get()[0];
  let threw = false;
  try {
    bus.group('bad', () => {
      bus.submit(new SetValueCommand('transform.translate', obj.id, { value: [99, 0, 0] }, set, get));
      throw new Error('脚本中途出错');
    });
  } catch (e) { threw = true; }
  t.ok(threw, '组内异常向外抛');
  t.eq(get()[0], posBefore, 'D34: 组内异常已回滚已执行命令');
  t.eq(bus.currentGroup, null, 'D34: 异常后组已闭合');

  // ---- endGroup 无组抛错（红线 A）----
  let egThrew = false;
  try { bus.endGroup(); } catch (e) { egThrew = /无进行中的组/.test(e.message); }
  t.ok(egThrew, 'endGroup 无组抛可读错误');

  // ---- D36：dirtySet 标记与 consume ----
  bus.consumeDirty(); // 清空
  bus.submit(new SetValueCommand('transform.translate', obj.id, { value: [7, 0, 0] }, set, get));
  const d = bus.consumeDirty();
  t.ok(d.ids.has(obj.id), 'D36: dirtySet 含受影响对象');
  t.ok(d.flags.transform, 'D36: transform 脏标志');
  const d2 = bus.consumeDirty();
  t.eq(d2.ids.size, 0, 'D36: consume 后清空');

  // ---- 命令哈希：同构命令哈希一致（脚本与 GUI 一致性断言基础）----
  const ca = new SetValueCommand('transform.translate', obj.id, { value: [1, 2, 3] }, set, get);
  const cb = new SetValueCommand('transform.translate', obj.id, { value: [1, 2, 3] }, set, get);
  t.eq(ca.hash(), cb.hash(), '同构命令 commandHash 一致');

  // ---- SnapshotCommand 兜底 ----
  let buf = [1, 2, 3];
  const snap = new SnapshotCommand('mesh.relax', obj.id, {}, () => [...buf], (c, s) => { buf = [...s]; }, () => { buf = buf.map(x => x * 2); });
  bus.submit(snap);
  t.eq(buf[0], 2, 'SnapshotCommand do 生效');
  bus.undo();
  t.eq(buf[0], 1, 'SnapshotCommand undo 恢复快照');

  // ---- meshHash 往返（命令层与内核哈希联动）----
  const mesh = { positions: new Float32Array([0, 0, 0, 1, 0, 0]), normals: new Float32Array(6), uvs: new Float32Array(4), indices: new Uint32Array([0, 1, 2]), vertexCount: 3, indexCount: 3 };
  const h0 = meshHash(mesh);
  mesh.positions[0] = 5; t.ok(meshHash(mesh) !== h0, 'meshHash 捕获变更');
  mesh.positions[0] = 0; t.eq(meshHash(mesh), h0, 'meshHash 改回复原');

  // ---- 提交监听 ----
  let commits = 0;
  const off = bus.onCommit(() => commits++);
  bus.submit(new SetValueCommand('transform.translate', obj.id, { value: [0, 0, 0] }, set, get));
  t.ok(commits >= 1, 'onCommit 监听触发');
  off();
}
