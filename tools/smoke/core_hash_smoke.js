// core_hash smoke：验证确定性哈希工具（v3 M-A0 / H7）。
// 断言：fnv1a 稳定性、stableStringify 键序无关、sceneHash/meshHash/commandHash 语义。
import { fnv1a, stableStringify, sceneHash, meshHash, commandHash } from '../../src/engine/core/hash.js';
import { Scene3D, GameObject3D } from '../../src/engine/platform/scene3d.js';

export const name = 'core-hash';
export async function run(t) {
  // ---- fnv1a 稳定性与区分度 ----
  t.eq(fnv1a('hello'), fnv1a('hello'), '同输入哈希一致');
  t.ok(fnv1a('hello') !== fnv1a('hellp'), '单字符差异哈希不同');
  t.eq(typeof fnv1a('x'), 'number', '返回 number');
  t.ok(fnv1a('') >= 0 && fnv1a('') <= 0xffffffff, '32 位无符号范围');
  // 已知 FNV-1a("hello") 参考值（offset basis 0x811c9dc5）—— 推导来源：标准 FNV-1a 算法
  t.eq(fnv1a(''), 0x811c9dc5, '空串=offset basis');

  // ---- stableStringify 键序无关 ----
  const a = { x: 1, y: [3, 2], z: { b: 2, a: 1 } };
  const b = { z: { a: 1, b: 2 }, y: [3, 2], x: 1 };
  t.eq(stableStringify(a), stableStringify(b), '键插入顺序不同但序列化一致');
  t.eq(fnv1a(stableStringify(a)), fnv1a(stableStringify(b)), '键序无关哈希一致');

  // ---- 类型化数组与 -0 归一 ----
  const m1 = { p: new Float32Array([1, 2, 3]), i: new Uint32Array([0, 1, 2]) };
  const m2 = { p: [1, 2, 3], i: [0, 1, 2] };
  t.eq(stableStringify(m1), stableStringify(m2), '类型化数组与普通数组归一一致');
  t.eq(stableStringify({ v: -0 }), stableStringify({ v: 0 }), '-0 归一为 0');

  // ---- sceneHash：同场景两次一致；改字段必变 ----
  const s = new Scene3D();
  const o = new GameObject3D('cube');
  o.transform.position = [1, 2, 3];
  o.components.mesh = { shape: 'cube', albedo: [1, 2, 3] };
  s.add(o);
  const h1 = sceneHash(s);
  const h2 = sceneHash(s);
  t.eq(h1, h2, '同一场景两次 sceneHash 一致');

  o.transform.position[0] = 9;                 // 改动一个字段
  const h3 = sceneHash(s);
  t.ok(h3 !== h1, '改动 transform 后 sceneHash 必变');
  o.transform.position[0] = 1;                 // 改回
  t.eq(sceneHash(s), h1, '改回后 sceneHash 复原（do/undo 往返基础）');

  // ---- meshHash ----
  const mesh = { positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), normals: new Float32Array(9), uvs: new Float32Array(6), indices: new Uint32Array([0, 1, 2]), vertexCount: 3, indexCount: 3 };
  const mh1 = meshHash(mesh);
  mesh.positions[0] = 5;
  t.ok(meshHash(mesh) !== mh1, '改动顶点 meshHash 必变');

  // ---- commandHash：同构命令哈希一致（脚本与 GUI 一致性断言基础）----
  const cmdA = { toJSON: () => ({ op: 'moveVerts', ids: [1, 2], to: [0, 1, 0] }) };
  const cmdB = { toJSON: () => ({ to: [0, 1, 0], ids: [1, 2], op: 'moveVerts' }) }; // 键序不同
  t.eq(commandHash(cmdA), commandHash(cmdB), '同构命令（键序不同）commandHash 一致');
}
