// 3D 物理（参考实现）：半隐式积分 + 球碰撞 + GJK/EPA 前的凸包相交判定（GJK）。
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

// ---- 凸包支持函数（GJK 用）----
export function sphereSupport(center, r) {
  return (dir) => { const l = Math.hypot(dir[0], dir[1], dir[2]); if (l < 1e-12) return [center[0], center[1], center[2]]; return [center[0] + dir[0] / l * r, center[1] + dir[1] / l * r, center[2] + dir[2] / l * r]; };
}
export function boxSupport(center, half) {
  return (dir) => [center[0] + Math.sign(dir[0]) * half[0], center[1] + Math.sign(dir[1]) * half[1], center[2] + Math.sign(dir[2]) * half[2]];
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const neg = (a) => [-a[0], -a[1], -a[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len2 = (a) => dot(a, a);

// 单形缩减：返回 { simplex, dir }（dir 为下一步搜索方向）或 { contains:true }
function doTri(S, ao) {
  const a = S[2], b = S[1], c = S[0];
  const ab = sub(b, a), ac = sub(c, a);
  const abc = cross(ab, ac);
  if (dot(cross(abc, ac), ao) > 0) {
    if (dot(ac, ao) > 0) return { simplex: [c, a], dir: cross(cross(ac, ao), ac) };
    // 落到 ab 边区域
  }
  if (dot(cross(ab, abc), ao) > 0) {
    if (dot(ab, ao) > 0) return { simplex: [b, a], dir: cross(cross(ab, ao), ab) };
    return { simplex: [a], dir: ao };
  }
  if (dot(ac, ao) > 0) return { simplex: [c, a], dir: cross(cross(ac, ao), ac) };
  return { simplex: [b, c, a], dir: abc };
}

// GJK：两凸体（由支持函数定义）是否相交。
export function gjkIntersect(supA, supB, maxIter = 64) {
  let d = [1, 0, 0];
  let s = sub(supA(d), supB(neg(d)));
  let simplex = [s];
  if (len2(s) < 1e-12) return true;
  for (let iter = 0; iter < maxIter; iter++) {
    d = neg(simplex[simplex.length - 1]);
    if (len2(d) < 1e-12) return true;
    const a = sub(supA(d), supB(neg(d)));
    if (dot(a, d) < 0) return false; // 朝原点推进失败 → 存在分离方向
    simplex.push(a);
    const ao = neg(a);
    if (simplex.length === 2) {
      const b = simplex[0]; const ab = sub(b, a);
      if (dot(ab, ao) > 0) { simplex = [b, a]; d = cross(cross(ab, ao), ab); if (len2(d) < 1e-12) d = ao; }
      else { simplex = [a]; d = ao; }
    } else if (simplex.length === 3) {
      const r = doTri(simplex, ao); simplex = r.simplex; d = r.dir; if (len2(d) < 1e-12) d = ao;
    } else {
      // 四面体：测试 4 个面
      const a0 = simplex[3], b = simplex[2], c = simplex[1], dd = simplex[0];
      const ab = sub(b, a0), ac = sub(c, a0), ad = sub(dd, a0);
      const abc = cross(ab, ac), acd = cross(ac, ad), adb = cross(ad, ab);
      const bcd = cross(sub(c, b), sub(dd, b));
      if (dot(abc, ao) > 0) { const r = doTri([b, c, a0], ao); simplex = r.simplex; d = r.dir; }
      else if (dot(acd, ao) > 0) { const r = doTri([c, dd, a0], ao); simplex = r.simplex; d = r.dir; }
      else if (dot(adb, ao) > 0) { const r = doTri([dd, b, a0], ao); simplex = r.simplex; d = r.dir; }
      else if (dot(bcd, neg(b)) > 0) { const r = doTri([c, dd, b], ao); simplex = r.simplex; d = r.dir; }
      else return true; // 原点在四面体内
      if (len2(d) < 1e-12) d = ao;
    }
    s = simplex[simplex.length - 1];
  }
  return false;
}
