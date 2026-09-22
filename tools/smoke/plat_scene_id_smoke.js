// plat_scene_id smoke：验证场景 id 稳定性与 children 双向一致性（v3 M-A0 / H1 / H2）。
// 这是命令层/建模引用可按对象 id 稳定索引的前提（undo 后引用不断裂）。
import { Scene3D, GameObject3D, nextId3d } from '../../src/engine/platform/scene3d.js';
import { sceneHash } from '../../src/engine/core/hash.js';

export const name = 'plat-scene-id';
export async function run(t) {
  // ---- H1：反序列化后内存 id == 序列化 id ----
  const s = new Scene3D();
  const parent = new GameObject3D('parent');
  const child = new GameObject3D('child');
  const grand = new GameObject3D('grand');
  s.add(parent);
  s.add(child, parent.id);
  s.add(grand, child.id);

  const pid = parent.id, cid = child.id, gid = grand.id;
  const json = s.serialize();
  const s2 = Scene3D.deserialize(json);

  const p2 = s2.findByName('parent');
  const c2 = s2.findByName('child');
  const g2 = s2.findByName('grand');
  t.ok(p2 && c2 && g2, '反序列化后三对象均存在');
  t.eq(p2.id, pid, 'H1: parent 内存 id == 序列化 id');
  t.eq(c2.id, cid, 'H1: child 内存 id == 序列化 id');
  t.eq(g2.id, gid, 'H1: grand 内存 id == 序列化 id');

  // map key 与内存 id 一致（无分裂）
  t.ok(s2.objects.get(pid) === p2, 'H1: objects.get(序列化id) 命中内存对象');
  t.ok(s2.objects.get(cid) === c2, 'H1: child map key 一致');

  // 父子引用按 id 稳定（undo 后不断裂的核心断言）
  t.eq(c2.parent.id, pid, 'H1: child.parent.id 稳定指向 parent');
  t.ok(p2.children.includes(cid), 'H1: parent.children 含真实 child id（非野指针）');
  t.ok(c2.children.includes(gid), 'H1: child.children 含 grand id');
  t.ok(s2.objects.get(cid) != null, 'H1: children 引用的 id 在 map 中可解析（无悬空）');

  // 反序列化后 id 计数器已推进，新建对象不与恢复 id 冲突
  const neo = new GameObject3D('neo');
  t.ok(neo.id > gid, 'H1: 反序列化后新建对象 id 大于所有恢复 id（无冲突）');

  // 往返稳定：再序列化→反序列化，sceneHash 不变
  const s3 = Scene3D.deserialize(s2.serialize());
  t.eq(sceneHash(s3), sceneHash(s2), 'H1: 序列化往返 sceneHash 稳定');

  // ---- H2：remove 同步清理父 children ----
  s2.remove(cid);
  t.ok(!s2.objects.get(cid), 'H2: remove 后 child 从 map 删除');
  t.ok(!p2.children.includes(cid), 'H2: remove 后 parent.children 无残留');
  t.eq(c2.parent, null, 'H2: 被删对象 parent 置空');

  // ---- removeRecursive：删子树 ----
  const s4 = new Scene3D();
  const a = new GameObject3D('a'); const bobj = new GameObject3D('b'); const cobj = new GameObject3D('c');
  s4.add(a); s4.add(bobj, a.id); s4.add(cobj, bobj.id);
  s4.removeRecursive(a.id);
  t.eq(s4.objects.size, 0, 'H2: removeRecursive 删除整棵子树');

  // ---- 序列化字段完整性：components/material/scripts/transform 保留 ----
  const s5 = new Scene3D();
  const m = new GameObject3D('m');
  m.components.mesh = { shape: 'cube', albedo: [10, 20, 30] };
  m.scripts = ['code1'];
  m.material = { albedo: [1, 0, 0] };
  m.transform.scale = [2, 2, 2];
  s5.add(m);
  const m2 = Scene3D.deserialize(s5.serialize()).findByName('m');
  t.eq(m2.components.mesh.shape, 'cube', '组件保留');
  t.eq(m2.scripts[0], 'code1', '脚本保留');
  t.eq(m2.transform.scale[0], 2, 'transform 保留');
  t.eq(m2.material.albedo[1], 0, 'material 保留');

  // nextId3d 仍单调（构造函数显式 id 不破坏计数器单调性）
  const before = nextId3d();
  const after = new GameObject3D('x');
  t.ok(after.id > before, 'nextId3d 保持单调递增');
}
