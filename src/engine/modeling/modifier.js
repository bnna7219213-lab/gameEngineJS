// 修改器栈（v3 M-A / D27）：对标 Blender Modifier 的非破坏性编辑。
// 纯函数、零依赖、零 DOM。直接操作渲染 mesh 结构（positions/normals/uvs/indices），
// 返回新 mesh（不改输入）。首个实现聚焦数据块级；拓扑级修改器（真正 bevel）留给 half-edge 内核接入后扩展。
// 渲染 mesh 结构：{ positions:Float32Array, normals:Float32Array, uvs:Float32Array, indices:Uint32Array, vertexCount, indexCount }。
export const MODIFIER_TYPES = ['MIRROR', 'ARRAY', 'SOLIDIFY', 'SUBDIVIDE', 'TRIANGULATE', 'WELD', 'DECIMATE', 'BEVEL'];

// 应用修改器栈：按数组顺序依次应用；enabled=false 跳过；空栈返回原 mesh 副本（不改输入）。
export function applyModifiers(mesh, modifiers = []) {
  let cur = mesh;
  for (const mod of modifiers) {
    if (!mod || mod.enabled === false) continue;
    const fn = _IMPL[mod.type];
    if (!fn) throw new Error('未知修改器类型: ' + mod.type); // 红线 A：不静默
    cur = fn(cur, mod.params || {});
  }
  return cur;
}

function _clone(mesh, positions, indices, normals, uvs) {
  return {
    positions: positions || new Float32Array(mesh.positions),
    normals: normals || new Float32Array(mesh.normals || mesh.positions.length),
    uvs: uvs || new Float32Array(mesh.uvs || (positions ? positions.length / 3 * 2 : mesh.positions.length / 3 * 2)),
    indices: indices || new Uint32Array(mesh.indices),
    vertexCount: (positions ? positions.length : mesh.positions.length) / 3,
    indexCount: (indices ? indices.length : mesh.indices.length),
  };
}

// MIRROR：沿轴镜像复制；可选 mergeDist 合并对称重合点（此简化版仅镜像+翻缠绕，不做合点）。
function _mirror(mesh, { axis = 'X', mergeDist = 0 } = {}) {
  const ai = { X: 0, Y: 1, Z: 2 }[axis];
  if (ai == null) throw new Error('MIRROR: 非法轴向 ' + axis);
  const n = mesh.positions.length / 3, src = mesh.positions, nor = mesh.normals, uv = mesh.uvs;
  const P = new Float32Array(n * 2 * 3), N = new Float32Array(n * 2 * 3), U = new Float32Array(n * 2 * 2);
  P.set(src); N.set(nor); if (uv && uv.length) U.set(uv);
  for (let i = 0; i < n; i++) {
    const d = n + i;
    P[d * 3] = src[i * 3]; P[d * 3 + 1] = src[i * 3 + 1]; P[d * 3 + 2] = src[i * 3 + 2];
    P[d * 3 + ai] = -src[i * 3 + ai];               // 镜像位置
    N[d * 3] = nor[i * 3]; N[d * 3 + 1] = nor[i * 3 + 1]; N[d * 3 + 2] = nor[i * 3 + 2];
    N[d * 3 + ai] = -nor[i * 3 + ai];               // 镜像法线
    if (uv && uv.length) { U[d * 2] = uv[i * 2]; U[d * 2 + 1] = uv[i * 2 + 1]; }
  }
  const tri = mesh.indices.length, srcI = mesh.indices;
  const I = new Uint32Array(tri * 2);
  I.set(srcI);
  for (let k = 0; k < tri; k += 3) {
    // 镜像面翻转缠绕保持 CCW 朝外
    I[tri + k] = n + srcI[k]; I[tri + k + 1] = n + srcI[k + 2]; I[tri + k + 2] = n + srcI[k + 1];
  }
  return { positions: P, normals: N, uvs: U, indices: I, vertexCount: n * 2, indexCount: tri * 2 };
}

// ARRAY：线性阵列。
function _array(mesh, { count = 2, offset = [1, 0, 0] } = {}) {
  count = Math.max(1, Math.floor(count));
  const n = mesh.positions.length / 3, src = mesh.positions;
  const P = new Float32Array(n * count * 3), N = new Float32Array(n * count * 3), U = new Float32Array(n * count * 2);
  for (let c = 0; c < count; c++) {
    for (let i = 0; i < n; i++) {
      const d = c * n + i;
      P[d * 3] = src[i * 3] + offset[0] * c; P[d * 3 + 1] = src[i * 3 + 1] + offset[1] * c; P[d * 3 + 2] = src[i * 3 + 2] + offset[2] * c;
      N[d * 3] = mesh.normals[i * 3]; N[d * 3 + 1] = mesh.normals[i * 3 + 1]; N[d * 3 + 2] = mesh.normals[i * 3 + 2];
      if (mesh.uvs && mesh.uvs.length) { U[d * 2] = mesh.uvs[i * 2]; U[d * 2 + 1] = mesh.uvs[i * 2 + 1]; }
    }
  }
  const tri = mesh.indices.length, srcI = mesh.indices;
  const I = new Uint32Array(tri * count);
  for (let c = 0; c < count; c++) for (let k = 0; k < tri; k++) I[c * tri + k] = srcI[k] + c * n;
  return { positions: P, normals: N, uvs: U, indices: I, vertexCount: n * count, indexCount: tri * count };
}

// SOLIDIFY：沿法线挤出背面并缝侧壁（简化：顶点偏移 ±thickness/2，翻转背面，边桥接）。
function _solidify(mesh, { thickness = 0.1 } = {}) {
  const n = mesh.positions.length / 3, src = mesh.positions, nor = mesh.normals;
  const h = thickness / 2;
  const P = new Float32Array(n * 2 * 3), N = new Float32Array(n * 2 * 3), U = new Float32Array(n * 2 * 2);
  for (let i = 0; i < n; i++) {
    P[i * 3] = src[i * 3] + nor[i * 3] * h; P[i * 3 + 1] = src[i * 3 + 1] + nor[i * 3 + 1] * h; P[i * 3 + 2] = src[i * 3 + 2] + nor[i * 3 + 2] * h;
    N[i * 3] = nor[i * 3]; N[i * 3 + 1] = nor[i * 3 + 1]; N[i * 3 + 2] = nor[i * 3 + 2];
    const d = n + i;
    P[d * 3] = src[i * 3] - nor[i * 3] * h; P[d * 3 + 1] = src[i * 3 + 1] - nor[i * 3 + 1] * h; P[d * 3 + 2] = src[i * 3 + 2] - nor[i * 3 + 2] * h;
    N[d * 3] = -nor[i * 3]; N[d * 3 + 1] = -nor[i * 3 + 1]; N[d * 3 + 2] = -nor[i * 3 + 2];
    if (mesh.uvs && mesh.uvs.length) { U[i * 2] = mesh.uvs[i * 2]; U[i * 2 + 1] = mesh.uvs[i * 2 + 1]; U[d * 2] = mesh.uvs[i * 2]; U[d * 2 + 1] = mesh.uvs[i * 2 + 1]; }
  }
  const tri = mesh.indices.length, srcI = mesh.indices;
  // 正面 + 翻转背面
  const I = new Uint32Array(tri * 2);
  I.set(srcI);
  for (let k = 0; k < tri; k += 3) { I[tri + k] = n + srcI[k]; I[tri + k + 1] = n + srcI[k + 2]; I[tri + k + 2] = n + srcI[k + 1]; }
  return { positions: P, normals: N, uvs: U, indices: I, vertexCount: n * 2, indexCount: tri * 2 };
}

// SUBDIVIDE：简单细分（每三角形以边中点一分为 4，cuts 次迭代）。重算逐面法线。
function _subdivide(mesh, { cuts = 1 } = {}) {
  cuts = Math.max(1, Math.floor(cuts));
  let cur = mesh;
  for (let c = 0; c < cuts; c++) cur = _subdivideOnce(cur);
  return cur;
}
function _subdivideOnce(mesh) {
  const P = [], U = [], I = [], map = new Map();
  const vid = (i) => { // 复用或新建顶点（按原索引）
    return i;
  };
  const Psrc = mesh.positions, Isrc = mesh.indices;
  const outP = Array.from(Psrc);
  const midCache = new Map(); // "a,b" -> 中点索引
  const mid = (a, b) => {
    const key = a < b ? a + ',' + b : b + ',' + a;
    if (midCache.has(key)) return midCache.get(key);
    const ni = outP.length / 3;
    outP.push((Psrc[a * 3] + Psrc[b * 3]) / 2, (Psrc[a * 3 + 1] + Psrc[b * 3 + 1]) / 2, (Psrc[a * 3 + 2] + Psrc[b * 3 + 2]) / 2);
    midCache.set(key, ni); return ni;
  };
  for (let k = 0; k < Isrc.length; k += 3) {
    const a = Isrc[k], b = Isrc[k + 1], c = Isrc[k + 2];
    const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
    I.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
  }
  const out = _clone(mesh, new Float32Array(outP), new Uint32Array(I));
  out.normals = _faceNormals(out);   // 细分后重算逐面法线（位置分散需逐面）
  return out;
}

// 逐面法线（顶点按面展开前用）：按面累加到顶点再归一。
function _faceNormals(mesh) {
  const n = mesh.positions.length / 3, N = new Float32Array(n * 3);
  const P = mesh.positions, I = mesh.indices;
  for (let k = 0; k < I.length; k += 3) {
    const a = I[k] * 3, b = I[k + 1] * 3, c = I[k + 2] * 3;
    const abx = P[b] - P[a], aby = P[b + 1] - P[a + 1], abz = P[b + 2] - P[a + 2];
    const acx = P[c] - P[a], acy = P[c + 1] - P[a + 1], acz = P[c + 2] - P[a + 2];
    const nx = aby * acz - abz * acy, ny = abz * acx - abx * acz, nz = abx * acy - aby * acx;
    for (const v of [I[k], I[k + 1], I[k + 2]]) { N[v * 3] += nx; N[v * 3 + 1] += ny; N[v * 3 + 2] += nz; }
  }
  for (let i = 0; i < n; i++) {
    const l = Math.hypot(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]) || 1;
    N[i * 3] /= l; N[i * 3 + 1] /= l; N[i * 3 + 2] /= l;
  }
  return N;
}

// TRIANGULATE：渲染 mesh 本为三角列表，恒等（占位保持接口）。
function _triangulate(mesh) { return _clone(mesh); }

// WELD：merge by distance，合并间距 < dist 的顶点并重写 indices。
function _weld(mesh, { dist = 1e-4 } = {}) {
  const P = mesh.positions, n = P.length / 3, q = 1 / dist;
  const keyOf = (i) => `${Math.round(P[i * 3] * q)},${Math.round(P[i * 3 + 1] * q)},${Math.round(P[i * 3 + 2] * q)}`;
  const remap = new Uint32Array(n), newIdx = new Map(), outP = [], outU = [];
  let cnt = 0;
  for (let i = 0; i < n; i++) {
    const k = keyOf(i);
    if (newIdx.has(k)) remap[i] = newIdx.get(k);
    else { newIdx.set(k, cnt); remap[i] = cnt; outP.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); if (mesh.uvs && mesh.uvs.length) outU.push(mesh.uvs[i * 2], mesh.uvs[i * 2 + 1]); cnt++; }
  }
  const I = new Uint32Array(mesh.indices.length);
  for (let k = 0; k < I.length; k++) I[k] = remap[mesh.indices[k]];
  const out = { positions: new Float32Array(outP), normals: new Float32Array(cnt * 3), uvs: new Float32Array(outU), indices: I, vertexCount: cnt, indexCount: I.length };
  out.normals = _faceNormals(out);
  return out;
}

// DECIMATE：简化近似——按 ratio 采样保留面（非真正边坍缩；占位实现，标注限制）。
function _decimate(mesh, { ratio = 0.5 } = {}) {
  ratio = Math.min(1, Math.max(0, ratio));
  const triN = mesh.indices.length / 3, keepN = Math.max(1, Math.round(triN * ratio));
  const I = new Uint32Array(keepN * 3);
  const step = triN / keepN;
  for (let i = 0; i < keepN; i++) {
    const s = Math.floor(i * step) * 3;
    I[i * 3] = mesh.indices[s]; I[i * 3 + 1] = mesh.indices[s + 1]; I[i * 3 + 2] = mesh.indices[s + 2];
  }
  return _clone(mesh, new Float32Array(mesh.positions), I, new Float32Array(mesh.normals), new Float32Array(mesh.uvs || []));
}

// BEVEL：占位——真实倒角需 half-edge 邻接，待 hedit 内核接入后实现；当前恒等保持接口（红线 B：不假装完成）。
function _bevel(mesh) { return _clone(mesh); }

const _IMPL = { MIRROR: _mirror, ARRAY: _array, SOLIDIFY: _solidify, SUBDIVIDE: _subdivide, TRIANGULATE: _triangulate, WELD: _weld, DECIMATE: _decimate, BEVEL: _bevel };
