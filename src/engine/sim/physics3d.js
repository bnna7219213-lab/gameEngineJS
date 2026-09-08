// GJK（稳健重写）+ EPA（多方向支撑采样）。
// 数学走 [x,y,z] 元组。
import { Vec3 } from '../core/math.js';

export class Body3D {
  constructor(x = 0, y = 0, z = 0, r = 1) {
    this.pos = new Vec3(x, y, z);
    this.vel = new Vec3(0, 0, 0);
    this.r = r; this.mass = 1; this.restitution = 0.4; this.static = false;
  }
}

export function step(bodies, dt, gravity = 9.8) {
  for (const b of bodies) {
    if (b.static) continue;
    b.vel = b.vel.sub(new Vec3(0, gravity * dt, 0));
    b.pos = b.pos.add(b.vel.scale(dt));
    if (b.pos.y < b.r) { b.pos = b.pos.set(b.pos.x, b.r, b.pos.z); if (b.vel.y < 0) b.vel = new Vec3(b.vel.x, -b.vel.y * b.restitution, b.vel.z); }
  }
  for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
    const a = bodies[i], c = bodies[j];
    const d = c.pos.sub(a.pos); const dist = d.len(); const min = a.r + c.r;
    if (dist < min && dist > 1e-9) {
      const n = d.scale(1 / dist); const overlap = min - dist;
      const ta = a.static ? 0 : (c.static ? 1 : 0.5), tc = c.static ? 0 : (a.static ? 1 : 0.5);
      a.pos = a.pos.sub(n.scale(overlap * ta)); c.pos = c.pos.add(n.scale(overlap * tc));
      const rv = c.vel.sub(a.vel); const vn = Vec3.dot(rv, n);
      if (vn < 0) { const e = Math.min(a.restitution, c.restitution); const invA = a.static ? 0 : 1 / a.mass, invC = c.static ? 0 : 1 / c.mass; const invSum = invA + invC || 1; const jimp = -(1 + e) * vn / invSum; if (invA) a.vel = a.vel.sub(n.scale(jimp * invA)); if (invC) c.vel = c.vel.add(n.scale(jimp * invC)); }
    }
  }
}

// ---- 凸包支持函数 ----
export function sphereSupport(center, r) {
  return (dir) => {
    const l = Math.hypot(dir[0], dir[1], dir[2]) || 1;
    return [center[0] + dir[0] / l * r, center[1] + dir[1] / l * r, center[2] + dir[2] / l * r];
  };
}
export function boxSupport(center, half) {
  return (dir) => [
    center[0] + Math.sign(dir[0]) * half[0],
    center[1] + Math.sign(dir[1]) * half[1],
    center[2] + Math.sign(dir[2]) * half[2],
  ];
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len2 = (a) => dot(a, a);

// GJK（稳健）：返回 { hit, simplex }
export function gjkIntersect(supA, supB, maxIter = 256, initialDir = null) {
  const support = (dir) => {
    const l = Math.hypot(dir[0], dir[1], dir[2]) || 1;
    const dn = [dir[0] / l, dir[1] / l, dir[2] / l];
    const pa = supA(dn), pb = supB([-dn[0], -dn[1], -dn[2]]);
    return sub(pa, pb);
  };

  let d = initialDir || [1, 0, 0];
  let A = support(d);
  let simplex = [A];
  d = [-A[0], -A[1], -A[2]];

  for (let i = 0; i < maxIter; i++) {
    const sp = support(d);
    if (dot(sp, d) < -1e-9) return { hit: false, simplex };
    simplex.push(sp);
    const res = _updateSimplex(simplex, d);
    if (res.hit) return { hit: true, simplex };
    d[0] = res.d[0]; d[1] = res.d[1]; d[2] = res.d[2];
  }
  return { hit: false, simplex };
}

function _updateSimplex(simplex, d) {
  if (simplex.length === 2) {
    const [B, A] = simplex;
    const AB = sub(B, A), AO = [-A[0], -A[1], -A[2]];
    if (dot(AB, AO) > 0) {
      const newD = cross(cross(AB, AO), AB);
      if (len2(newD) < 1e-14) return { hit: true, d: [0, 0, 0] };
      d[0] = newD[0]; d[1] = newD[1]; d[2] = newD[2];
      return { hit: false, d };
    }
    simplex.splice(0, 1); // remove B
    d[0] = AO[0]; d[1] = AO[1]; d[2] = AO[2];
    return { hit: false, d };
  } else if (simplex.length === 3) {
    const [C, B, A] = simplex;
    const AB = sub(B, A), AC = sub(C, A), AO = [-A[0], -A[1], -A[2]];
    const ABC = cross(AB, AC);
    if (dot(cross(ABC, AC), AO) > 0) {
      if (dot(AC, AO) > 0) {
        simplex.splice(1, 1); // remove B
        const newD = cross(cross(AC, AO), AC);
        d[0] = newD[0]; d[1] = newD[1]; d[2] = newD[2];
        return { hit: false, d };
      }
      if (dot(AB, AO) > 0) {
        simplex.splice(0, 1); // remove C
        const newD = cross(cross(AB, AO), AB);
        d[0] = newD[0]; d[1] = newD[1]; d[2] = newD[2];
        return { hit: false, d };
      }
      simplex.splice(0, 2); // remove C, B
      d[0] = AO[0]; d[1] = AO[1]; d[2] = AO[2];
      return { hit: false, d };
    }
    if (dot(cross(AB, ABC), AO) > 0) {
      if (dot(AB, AO) > 0) {
        simplex.splice(0, 1); // remove C
        const newD = cross(cross(AB, AO), AB);
        d[0] = newD[0]; d[1] = newD[1]; d[2] = newD[2];
        return { hit: false, d };
      }
      simplex.splice(0, 2); // remove C, B
      d[0] = AO[0]; d[1] = AO[1]; d[2] = AO[2];
      return { hit: false, d };
    }
    if (dot(ABC, AO) > 0) {
      d[0] = ABC[0]; d[1] = ABC[1]; d[2] = ABC[2];
      return { hit: false, d };
    }
    d[0] = -ABC[0]; d[1] = -ABC[1]; d[2] = -ABC[2];
    return { hit: false, d };
  } else if (simplex.length === 4) {
    const [D, C, B, A] = simplex;
    const AB = sub(B, A), AC = sub(C, A), AD = sub(D, A), AO = [-A[0], -A[1], -A[2]];
    const ABC = cross(AB, AC), ACD = cross(AC, AD), ADB = cross(AD, AB);
    if (dot(ABC, AO) > 0) { simplex.splice(0, 1); return _updateSimplex(simplex, d); } // remove D
    if (dot(ACD, AO) > 0) { simplex.splice(2, 1); return _updateSimplex(simplex, d); } // remove B
    if (dot(ADB, AO) > 0) { simplex.splice(1, 1); return _updateSimplex(simplex, d); } // remove C
    return { hit: true, d: [0, 0, 0] };
  }
  return { hit: false, d };
}

// EPA：给定 GJK 终止单形，求穿透深度与法线
// 通过多方向支撑采样 + 迭代扩张（26 方向采样初始四面体，含原点保证）
const DIRS = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
  [1, 1, 1], [-1, 1, 1], [1, -1, 1], [-1, -1, 1],
  [1, 1, -1], [-1, 1, -1], [1, -1, -1], [-1, -1, -1],
].map(d => { const l = Math.hypot(...d); return [d[0] / l, d[1] / l, d[2] / l]; });

export function epaPenetration(supA, supB, gjkSimplex, { maxIter = 64, tolerance = 1e-4 } = {}) {
  const support = (d) => {
    const l = Math.hypot(...d) || 1;
    const dn = [d[0] / l, d[1] / l, d[2] / l];
    const pa = supA(dn), pb = supB([-dn[0], -dn[1], -dn[2]]);
    return { v: sub(pa, pb), pa, pb };
  };

  // 构造含原点的四面体：用 GJK 终止单形 + 多方向采样
  let pool = (gjkSimplex ?? []).map(v => ({ v, pa: v, pb: v }));
  for (const d of DIRS) {
    const p = support(d);
    if (pool.every(q => Math.hypot(...sub(q.v, p.v)) > 1e-6)) pool.push(p);
  }
  // 搜索含原点的四面体：对每个面，原点与对顶点同侧
  function containsOrigin(tet) {
    const [a, b, c, d] = tet;
    const O = [0, 0, 0];
    const check = (face, opp) => {
      const n = cross(sub(face[1].v, face[0].v), sub(face[2].v, face[0].v));
      const sOrig = dot(n, sub(O, face[0].v));
      const sOpp = dot(n, sub(opp, face[0].v));
      return sOrig * sOpp > 1e-18; // 同侧
    };
    return [
      check([a, b, c], d.v),
      check([a, b, d], c.v),
      check([a, c, d], b.v),
      check([b, c, d], a.v),
    ].every(Boolean);
  }
  let verts = null;
  for (let a = 0; a < pool.length && !verts; a++)
    for (let b = a + 1; b < pool.length && !verts; b++)
      for (let c = b + 1; c < pool.length && !verts; c++)
        for (let dd = c + 1; dd < pool.length && !verts; dd++) {
          if (containsOrigin([pool[a], pool[b], pool[c], pool[dd]])) {
            verts = [pool[a], pool[b], pool[c], pool[dd]];
          }
        }
  if (!verts) return { normal: [0, 1, 0], depth: 0.01, pointA: pool[0]?.pa ?? [0, 0, 0], pointB: pool[0]?.pb ?? [0, 0, 0] };

  function makeFace([i, j, k], vv) {
    const va = vv[i].v, vb = vv[j].v, vc = vv[k].v;
    let n = cross(sub(vb, va), sub(vc, va));
    const nl = Math.hypot(...n);
    if (nl < 1e-12) return null;
    n = [n[0] / nl, n[1] / nl, n[2] / nl];
    if (dot(n, va) < 0) n = [-n[0], -n[1], -n[2]];
    return { [0]: i, [1]: j, [2]: k, normal: n, dist: dot(n, va),
      edges: [[i, j], [j, k], [k, i]].map(e => e[0] < e[1] ? e : [e[1], e[0]]) };
  }

  let faces = [[0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3]]
    .map(f => makeFace(f, verts)).filter(Boolean);

  for (let iter = 0; iter < maxIter; iter++) {
    if (!faces.length) break;
    let best = faces[0];
    for (const f of faces) if (f.dist < best.dist) best = f;
    if (best.dist < tolerance) return { normal: best.normal, depth: best.dist, pointA: verts[best[0]].pa, pointB: verts[best[0]].pb };
    const p = support(best.normal);
    const d = dot(p.v, best.normal);
    if (d - best.dist < tolerance) return { normal: best.normal, depth: best.dist, pointA: p.pa, pointB: p.pb };
    const boundary = [];
    faces = faces.filter(f => {
      if (dot(f.normal, sub(p.v, verts[f[0]].v)) > 0) { for (const e of f.edges) boundary.push(e); return false; }
      return true;
    });
    const unique = [];
    for (const e of boundary) { const i = unique.findIndex(x => x[0] === e[0] && x[1] === e[1]); if (i >= 0) unique.splice(i, 1); else unique.push(e); }
    verts.push(p); const newIdx = verts.length - 1;
    for (const [a, b] of unique) { const f = makeFace([a, b, newIdx], verts); if (f) faces.push(f); }
  }
  if (!faces.length) return { normal: [0, 1, 0], depth: 0.01, pointA: verts[0].pa, pointB: verts[0].pb };
  let best = faces[0]; for (const f of faces) if (f.dist < best.dist) best = f;
  const contact = support(best.normal);
  return { normal: best.normal, depth: best.dist, pointA: contact.pa, pointB: contact.pb };
}