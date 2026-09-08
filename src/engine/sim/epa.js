// EPA (Expanding Polytope Algorithm) — 真正 3D 版本。
// 输入 GJK 终止单形（可退化），返回 { normal, depth, pointA, pointB } 或兜底。
// 数学走 [x,y,z] 元组；方向采样 26 轴/面对角线；多迭代扩张至收敛。

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]);
const norm = a => { const l = len(a); return l < 1e-15 ? [0, 1, 0] : [a[0] / l, a[1] / l, a[2] / l]; };

const DIRS = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
  [1, 1, 1], [-1, 1, 1], [1, -1, 1], [-1, -1, 1],
  [1, 1, -1], [-1, 1, -1], [1, -1, -1], [-1, -1, -1],
].map(d => norm(d));

function isUnique(list, v) {
  return list.every(p => len(sub(p.v, v)) > 1e-9);
}

// 原点是否在四面体内：对每个面，原点与对角顶点同侧
function containsOrigin([a, b, c, d]) {
  const tet = [a, b, c, d];
  // 非共面
  for (let i = 0; i < 4; i++) {
    const others = [0, 1, 2, 3].filter(j => j !== i);
    const n = cross(sub(tet[others[1]].v, tet[others[0]].v), sub(tet[others[2]].v, tet[others[0]].v));
    if (len(n) < 1e-12) return false;
  }
  const O = { v: [0, 0, 0] };
  const sameSide = (face, p, q) => {
    const n = cross(sub(face[1].v, face[0].v), sub(face[2].v, face[0].v));
    return dot(n, sub(p.v, face[0].v)) * dot(n, sub(q.v, face[0].v)) > 0;
  };
  return sameSide([a, b, c], d, O) && sameSide([a, b, d], c, O) &&
    sameSide([a, c, d], b, O) && sameSide([b, c, d], a, O);
}

// 构造面：法线朝外（远离原点），附 3 条排序边
function makeFace([a, b, c], verts) {
  const va = verts[a].v, vb = verts[b].v, vc = verts[c].v;
  let n = cross(sub(vb, va), sub(vc, va));
  if (len(n) < 1e-12) return null;
  if (dot(n, va) < 0) n = [-n[0], -n[1], -n[2]];
  const nn = norm(n);
  return {
    [0]: a, [1]: b, [2]: c,
    normal: nn,
    dist: dot(nn, va),
    edges: [[a, b], [b, c], [c, a]].map(e => e[0] < e[1] ? e : [e[1], e[0]])
  };
}

// 构造四面体 4 面
function makeTetra(verts) {
  return [[0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3]]
    .map(f => makeFace(f, verts))
    .filter(Boolean);
}

function dedupEdges(edges) {
  const unique = [];
  for (const [a, b] of edges) {
    const i = unique.findIndex(e => e[0] === a && e[1] === b);
    if (i >= 0) unique.splice(i, 1);
    else unique.push([a, b]);
  }
  return unique;
}

export function epaPenetration(supA, supB, gjkSimplex, { maxIter = 64, tolerance = 1e-4 } = {}) {
  const support = (d) => {
    const l = len(d) || 1;
    const dn = [d[0] / l, d[1] / l, d[2] / l];
    const pa = supA(dn), pb = supB([-dn[0], -dn[1], -dn[2]]);
    return { v: sub(pa, pb), pa, pb };
  };

  // 1) 归一化输入单形
  const seed = (gjkSimplex ?? []).map(s => ({
    v: s.v ?? s,
    pa: s.pa ?? (s.v ?? s),
    pb: s.pb ?? (s.v ?? s),
  }));

  // 2) 采样多点，构造含原点的四面体
  let pool = [];
  for (const s of seed) if (isUnique(pool, s.v)) pool.push(s);
  for (const d of DIRS) {
    const p = support(d);
    if (isUnique(pool, p.v)) pool.push(p);
  }
  let verts = null;
  for (let a = 0; a < pool.length && !verts; a++)
    for (let b = a + 1; b < pool.length && !verts; b++)
      for (let c = b + 1; c < pool.length && !verts; c++)
        for (let dd = c + 1; dd < pool.length && !verts; dd++) {
          const tet = [pool[a], pool[b], pool[c], pool[dd]];
          if (containsOrigin(tet)) verts = tet;
        }
  if (!verts) {
    return {
      normal: [0, 1, 0], depth: 0.01,
      pointA: pool[0]?.pa ?? [0, 0, 0],
      pointB: pool[0]?.pb ?? [0, 0, 0],
    };
  }

  // 3) 初始四面体 4 面
  let faces = makeTetra(verts);
  if (!faces.length) {
    return { normal: [0, 1, 0], depth: 0.01, pointA: verts[0].pa, pointB: verts[0].pb };
  }

  // 4) EPA 迭代扩张
  for (let iter = 0; iter < maxIter; iter++) {
    let best = faces[0];
    for (const f of faces) if (f.dist < best.dist) best = f;
    const p = support(best.normal);
    const d = dot(p.v, best.normal);
    if (d - best.dist < tolerance) {
      return { normal: best.normal, depth: best.dist, pointA: p.pa, pointB: p.pb };
    }
    const boundary = [];
    const nextFaces = faces.filter(f => {
      if (dot(f.normal, sub(p.v, verts[f[0]].v)) > 0) {
        for (const e of f.edges) boundary.push(e);
        return false;
      }
      return true;
    });
    if (nextFaces.length === 0) break; 
    faces = nextFaces;
    const uniqueEdges = dedupEdges(boundary);
    verts.push(p);
    const newIdx = verts.length - 1;
    for (const [a, b] of uniqueEdges) {
      const f = makeFace([a, b, newIdx], verts);
      if (f) faces.push(f);
    }
  }
  // 未收敛，返回最近面
  if (!faces.length) return { normal: [0, 1, 0], depth: 0.01, pointA: verts[0].pa, pointB: verts[0].pb };
  let best = faces[0];
  for (const f of faces) if (f.dist < best.dist) best = f;
  const contact = support(best.normal);
  return { normal: best.normal, depth: best.dist, pointA: contact.pa, pointB: contact.pb };
}