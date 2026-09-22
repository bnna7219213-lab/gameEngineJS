// 确定性哈希工具（v3 M-A0 / H7）：为「do/undo 往返一致」「脚本与 GUI 结果一致」
// 「导出往返一致」等关键断言提供可比较的稳定指纹。
// 约定：DOM-free、零依赖、Node 可测（红线 D/E）。仅用于断言与校验，不进每帧热路径。

// 32 位 FNV-1a：对 UTF-16 码元求哈希，返回无符号 32 位整数。
// 选择理由：实现极简、确定性、足够区分结构化数据差异（非加密用途）。
export function fnv1a(str) {
  let h = 0x811c9dc5 >>> 0; // offset basis
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    // h *= 16777619 (mod 2^32)，用位移避免浮点精度损失
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

// 固定 key 序的稳定序列化：递归对对象键排序，数组保持顺序，类型化数组转普通数组。
// 保证「逻辑相同」的数据产生逐字节相同的字符串（与键插入顺序无关）。
export function stableStringify(value) {
  return JSON.stringify(_normalize(value));
}

function _normalize(v) {
  if (v === null || typeof v !== 'object') {
    // 数值规范化：-0 -> 0，避免 -0 与 0 序列化差异
    if (typeof v === 'number') return Object.is(v, -0) ? 0 : v;
    return v;
  }
  if (ArrayBuffer.isView(v)) return Array.from(v);          // Float32Array/Uint32Array 等
  if (Array.isArray(v)) return v.map(_normalize);
  // Map -> 按键序的对象
  if (v instanceof Map) {
    const keys = [...v.keys()].map(String).sort();
    const o = {};
    for (const k of keys) o[k] = _normalize(v.get(isNaN(+k) ? k : +k));
    return o;
  }
  const o = {};
  for (const k of Object.keys(v).sort()) o[k] = _normalize(v[k]);
  return o;
}

// 场景哈希：对 Scene3D 的稳定序列化求 FNV-1a。
// 依赖 Scene3D.serialize() 输出（objects 键 + 各字段）；先 stableStringify 归一再哈希，
// 屏蔽对象内部键插入顺序差异。
export function sceneHash(scene) {
  const json = scene.serialize();
  return fnv1a(stableStringify(JSON.parse(json)));
}

// 网格哈希：对 {positions,normals,uvs,indices} 求指纹（建模内核 do/undo 往返断言用）。
export function meshHash(mesh) {
  return fnv1a(stableStringify({
    p: mesh.positions, n: mesh.normals, u: mesh.uvs, i: mesh.indices,
    vc: mesh.vertexCount, ic: mesh.indexCount,
  }));
}

// 命令哈希：对 Command.toJSON() 求指纹（脚本与 GUI 产生同构命令时哈希一致）。
export function commandHash(cmd) {
  return fnv1a(stableStringify(cmd.toJSON()));
}
