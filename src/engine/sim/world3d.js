// 3D 物理世界（Q1 真实化）：形状集 + GJK/EPA 碰撞 + sequential impulse + 休眠 + raycast + 角色控制器。
// 对应 C++ physics3d / M3.1；数学走 core/math.js（Vec3/Quat/Mat4，行主序）。
import { Vec3, Quat, Mat4 } from '../core/math.js';
import { gjkIntersect, sphereSupport, boxSupport } from './physics3d.js';
import { epaPenetration } from './epa.js';

// ---------------------------------------------------------------- 形状
export const ShapeType = Object.freeze({ SPHERE: 0, BOX: 1, CAPSULE: 2, CONVEX: 3, PLANE: 4 });
export class Shape {
  constructor(type, params) {
    this.type = type;
    Object.assign(this, params); // sphere:{r} box:{half:[x,y,z]} capsule:{r,halfH} convex:{verts:[[x,y,z]..]} plane:{normal,d}
  }
  // 局部空间支持函数（dir 为局部方向）
  localSupport(dir) {
    switch (this.type) {
      case ShapeType.SPHERE: {
        const l = Math.hypot(dir[0], dir[1], dir[2]) || 1;
        return [dir[0] / l * this.r, dir[1] / l * this.r, dir[2] / l * this.r];
      }
      case ShapeType.BOX:
        return [Math.sign(dir[0]) * this.half[0], Math.sign(dir[1]) * this.half[1], Math.sign(dir[2]) * this.half[2]];
      case ShapeType.CAPSULE: {
        // 线段 [-halfH,halfH] y 轴 + 半径
        const seg = [0, Math.sign(dir[1]) * this.halfH, 0];
        const l = Math.hypot(dir[0], dir[1], dir[2]) || 1;
        return [seg[0] + dir[0] / l * this.r, seg[1] + dir[1] / l * this.r, seg[2] + dir[2] / l * this.r];
      }
      case ShapeType.CONVEX: {
        let best = this.verts[0], bd = -Infinity;
        for (const v of this.verts) { const d = v[0] * dir[0] + v[1] * dir[1] + v[2] * dir[2]; if (d > bd) { bd = d; best = v; } }
        return best;
      }
      default: throw new Error('shape has no support function');
    }
  }
  worldSupport(pos, rot) {
    const m = rot.toMat4();
    return (dir) => {
      // dir 世界 → 局部（R^T），支持点后变换回世界
      const ld = rot.conjugate().rotate(Vec3.fromArray(dir)).toArray();
      const lp = this.localSupport(ld);
      const wp = rot.rotate(Vec3.fromArray(lp));
      return [wp.x + pos.x, wp.y + pos.y, wp.z + pos.z];
    };
  }
  aabb(pos, rot) {
    if (this.type === ShapeType.PLANE) return { min: [-1e9, -1e9, -1e9], max: [1e9, 1e9, 1e9] };
    // 采样 8 方向支持点近似（确定性）
    let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    const s = this.worldSupport(pos, rot);
    for (const d of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [1, 1, 1], [-1, -1, -1]]) {
      const p = s(d);
      for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[k]); mx[k] = Math.max(mx[k], p[k]); }
    }
    return { min: mn, max: mx };
  }
  inertia(mass) {
    switch (this.type) {
      case ShapeType.SPHERE: { const i = 0.4 * mass * this.r * this.r; return [i, i, i]; }
      case ShapeType.BOX: {
        const [x, y, z] = this.half.map(v => v * 2);
        return [mass / 12 * (y * y + z * z), mass / 12 * (x * x + z * z), mass / 12 * (x * x + y * y)];
      }
      case ShapeType.CAPSULE: { // 近似圆柱
        const i = mass / 12 * (3 * this.r * this.r + (2 * this.halfH) ** 2);
        return [i, 0.5 * mass * this.r * this.r, i];
      }
      default: { const i = mass * 0.1; return [i, i, i]; }
    }
  }
}

// ---------------------------------------------------------------- 刚体
export class RigidBody {
  constructor(shape, { pos = [0, 0, 0], rot = null, mass = 1, restitution = 0.3, friction = 0.5, static: isStatic = false } = {}) {
    this.shape = shape;
    this.pos = Vec3.fromArray(pos);
    this.rot = rot || Quat.identity();
    this.vel = new Vec3(0, 0, 0);
    this.angVel = new Vec3(0, 0, 0);
    this.mass = isStatic ? 0 : mass;
    this.invMass = isStatic ? 0 : 1 / mass;
    const I = shape.inertia(mass);
    this.invInertiaLocal = isStatic ? [0, 0, 0] : I.map(v => v > 0 ? 1 / v : 0);
    this.restitution = restitution;
    this.friction = friction;
    this.static = isStatic;
    this.sleeping = false;
    this.sleepTimer = 0;
    this.force = new Vec3(0, 0, 0);
    this.id = RigidBody._nextId++;
  }

  applyForce(f) { this.force = this.force.add(f); this.wake(); }
  applyImpulse(j, worldPoint = null) {
    if (this.invMass === 0) return;
    this.vel = this.vel.add(j.scale(this.invMass));
    if (worldPoint) {
      const r = worldPoint.sub(this.pos);
      const L = Vec3.cross(r, j);
      this.angVel = this.angVel.add(this._applyInvInertia(L));
    }
    this.wake();
  }
  _applyInvInertia(v) {
    // 局部角速度空间应用对角逆惯性后回世界
    const lv = this.rot.conjugate().rotate(v);
    const out = new Vec3(lv.x * this.invInertiaLocal[0], lv.y * this.invInertiaLocal[1], lv.z * this.invInertiaLocal[2]);
    return this.rot.rotate(out);
  }
  wake() { this.sleeping = false; this.sleepTimer = 0; }
}
RigidBody._nextId = 1;

// ---------------------------------------------------------------- 碰撞检测
export function collide(a, b) {
  // 平面特判（无限大，GJK 不适用）
  if (a.shape.type === ShapeType.PLANE || b.shape.type === ShapeType.PLANE) {
    const [planeBody, other] = a.shape.type === ShapeType.PLANE ? [a, b] : [b, a];
    const n = planeBody.shape.normal, d0 = planeBody.shape.d;
    const SLOP = 0.01; // 适中 SLOP
    const contactNormal = a.shape.type === ShapeType.PLANE ? [...n] : [-n[0], -n[1], -n[2]];

    // BOX-PLANE 多点接触：检查 8 个顶点
    if (other.shape.type === ShapeType.BOX) {
      const h = other.shape.half;
      const contacts = [];
      for (let x of [-1, 1]) for (let y of [-1, 1]) for (let z of [-1, 1]) {
        const lp = new Vec3(x * h[0], y * h[1], z * h[2]);
        const wp = other.rot.rotate(lp).add(other.pos);
        const dist = wp.x * n[0] + wp.y * n[1] + wp.z * n[2] - d0;
        if (dist <= SLOP) {
          contacts.push({ normal: contactNormal, depth: Math.max(-dist, 0), pointA: wp.toArray(), pointB: wp.toArray() });
        }
      }
      return contacts.length > 0 ? contacts : null;
    }

    const sup = other.shape.worldSupport(other.pos, other.rot);
    const deepest = sup([-n[0], -n[1], -n[2]]);
    const dist = deepest[0] * n[0] + deepest[1] * n[1] + deepest[2] * n[2] - d0;
    if (dist > SLOP) return null;
    const depth = Math.max(-dist, 0);
    return { normal: contactNormal, depth, pointA: deepest, pointB: deepest };
  }
  const sa = a.shape.worldSupport(a.pos, a.rot);
  const sb = b.shape.worldSupport(b.pos, b.rot);
  const { hit, simplex } = gjkIntersect(sa, sb, 256);
  if (simplex.length < 2) return null;
  const pen = epaPenetration(sa, sb, simplex);
  if (!pen || pen.depth < 1e-6) return null;
  // 防止假阳性：EPA 深度不应超过 AABB 间距（GJK 未确认命中时更严格）
  const aabbSep = Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y, a.pos.z - b.pos.z);
  if (!hit && pen.depth > aabbSep * 0.5) return null; // 大幅分离时 EPA 深度不可信
  const normal = pen.normal;
  const pointA = pen.pointA;
  const pointB = pen.pointB;
  return { normal, depth: pen.depth, pointA, pointB };
}

// ---------------------------------------------------------------- 世界
export class PhysicsWorld {
  constructor({ gravity = [0, -9.8, 0], iterations = 20, sleepLinThresh = 0.2, sleepAngThresh = 0.2, sleepTime = 0.5 } = {}) {
    this.gravity = Vec3.fromArray(gravity);
    this.iterations = iterations;
    this.sleepLin = sleepLinThresh; this.sleepAng = sleepAngThresh; this.sleepTime = sleepTime;
    this.bodies = [];
    this.contacts = [];
  }
  add(body) { this.bodies.push(body); return body; }
  remove(body) { const i = this.bodies.indexOf(body); if (i >= 0) this.bodies.splice(i, 1); }
  step(dt) {
    // 力积分 + 位置预估
    for (const b of this.bodies) {
      if (b.invMass === 0 || b.sleeping) continue;
      b.vel = b.vel.add(this.gravity.scale(dt)).add(b.force.scale(dt * b.invMass));
      b.force = new Vec3(0, 0, 0);
      // 阻尼
      b.vel = b.vel.scale(1 / (1 + 0.01 * dt));
      b.angVel = b.angVel.scale(1 / (1 + 0.05 * dt));
    }
    // 碰撞检测（O(n²)，宽相位后续可换 SAP）
    this.contacts = [];
    for (let i = 0; i < this.bodies.length; i++) for (let j = i + 1; j < this.bodies.length; j++) {
      const a = this.bodies[i], b = this.bodies[j];
      if (a.invMass === 0 && b.invMass === 0) continue;
      if (a.sleeping && b.sleeping) continue;
      const res = collide(a, b);
      if (res) {
        if (Array.isArray(res)) {
          for (const c of res) this.contacts.push({ a, b, ...c });
        } else {
          this.contacts.push({ a, b, ...res });
        }
      }
    }
    // 速度求解（sequential impulse）
    for (let it = 0; it < this.iterations; it++) {
      for (const c of this.contacts) this._solveContact(c, false);
    }
    // 位置积分
    for (const b of this.bodies) {
      if (b.invMass === 0 || b.sleeping) continue;
      b.pos = b.pos.add(b.vel.scale(dt));
      const w = b.angVel;
      const wl = Math.hypot(w.x, w.y, w.z);
      if (wl > 1e-9) {
        const dq = Quat.fromAxisAngle([w.x / wl, w.y / wl, w.z / wl], wl * dt);
        b.rot = dq.mul(b.rot).normalize();
      }
    }
    // 位置校正（Baumgarte）
    for (const c of this.contacts) this._solveContact(c, true);
    // 休眠
    for (const b of this.bodies) {
      if (b.invMass === 0) continue;
      const lin = b.vel.len(), ang = Math.hypot(b.angVel.x, b.angVel.y, b.angVel.z);
      if (lin < this.sleepLin && ang < this.sleepAng) {
        b.sleepTimer += dt;
        if (b.sleepTimer >= this.sleepTime) { b.sleeping = true; b.vel = new Vec3(0, 0, 0); b.angVel = new Vec3(0, 0, 0); }
      } else b.sleepTimer = 0;
    }
  }
  _solveContact(c, positional) {
    const a = c.a, b = c.b;
    const n = Vec3.fromArray(c.normal);
    const pa = Vec3.fromArray(c.pointA), pb = Vec3.fromArray(c.pointB);
    const ra = pa.sub(a.pos), rb = pb.sub(b.pos);
    if (!positional) {
      const rv = b.vel.add(Vec3.cross(b.angVel, rb)).sub(a.vel.add(Vec3.cross(a.angVel, ra)));
      const vn = Vec3.dot(rv, n);
      if (vn > 0) return;
      const rnA = Vec3.cross(ra, n), rnB = Vec3.cross(rb, n);
      const k = a.invMass + b.invMass + Vec3.dot(rnA, a._applyInvInertia(rnA)) + Vec3.dot(rnB, b._applyInvInertia(rnB));
      if (k < 1e-12) return;
      let e = Math.min(a.restitution, b.restitution);
      if (Math.abs(vn) < 0.2) e = 0; // 增加阈值：0.1 -> 0.2，防止重力微跳
      let j = -(1 + e) * vn / k;
      
      // 累积冲量裁剪（如果有）或者直接应用
      const imp = n.scale(j);
      a.applyImpulse(imp.scale(-1), pa); b.applyImpulse(imp, pb);
      // 摩擦：切向冲量与切向速度反向（库仑模型）
      const rv2 = b.vel.add(Vec3.cross(b.angVel, rb)).sub(a.vel.add(Vec3.cross(a.angVel, ra)));
      const t = rv2.sub(n.scale(Vec3.dot(rv2, n)));
      const tl = t.len();
      if (tl > 1e-6) {
        const tn = t.scale(-1 / tl); // 与切向速度反向
        const rtA = Vec3.cross(ra, tn), rtB = Vec3.cross(rb, tn);
        const kt = a.invMass + b.invMass + Vec3.dot(rtA, a._applyInvInertia(rtA)) + Vec3.dot(rtB, b._applyInvInertia(rtB));
        const mu = Math.sqrt(a.friction * b.friction);
        const jt = Math.min(tl / Math.max(kt, 1e-12), mu * j); // 冲量幅值
        const fImp = tn.scale(jt);
        a.applyImpulse(fImp.scale(-1), pa); b.applyImpulse(fImp, pb);
      }
    } else {
      // 位置校正：沿法线分离（percent=0.8, slop=0.001）
      const invSum = a.invMass + b.invMass;
      if (invSum < 1e-12) return;
      const corr = Math.max(c.depth - 0.001, 0) / invSum * 0.2;
      a.pos = a.pos.sub(n.scale(corr * a.invMass));
      b.pos = b.pos.add(n.scale(corr * b.invMass));
    }
  }
  // raycast：最近命中（球/盒解析，其它形状走采样支持点近似）
  raycast(origin, dir, maxDist = 1e9) {
    let best = null;
    for (const b of this.bodies) {
      const hit = rayShape(b, origin, dir, maxDist);
      if (hit && (!best || hit.t < best.t)) best = { body: b, ...hit };
    }
    return best;
  }
}

// 形状级 raycast（局部空间解析）
export function rayShape(body, origin, dir, maxDist) {
  const inv = body.rot.conjugate();
  const o = inv.rotate(Vec3.fromArray(origin).sub(body.pos));
  const d = inv.rotate(Vec3.fromArray(dir));
  const s = body.shape;
  let t = null, nLocal = null;
  if (s.type === ShapeType.SPHERE) {
    const bq = 2 * (o.x * d.x + o.y * d.y + o.z * d.z);
    const cq = o.x * o.x + o.y * o.y + o.z * o.z - s.r * s.r;
    const disc = bq * bq - 4 * cq;
    if (disc < 0) return null;
    const t0 = (-bq - Math.sqrt(disc)) / 2;
    t = t0 >= 0 ? t0 : (-bq + Math.sqrt(disc)) / 2;
    if (t < 0) return null;
    const p = o.add(d.scale(t));
    nLocal = p.normalize();
  } else if (s.type === ShapeType.BOX) {
    // slab
    let tmin = 0, tmax = maxDist, nAxis = -1, nSign = 0;
    for (let k = 0; k < 3; k++) {
      const ok = [o.x, o.y, o.z][k], dk = [d.x, d.y, d.z][k], h = s.half[k];
      if (Math.abs(dk) < 1e-12) { if (Math.abs(ok) > h) return null; continue; }
      let t1 = (-h - ok) / dk, t2 = (h - ok) / dk;
      let sign = -1;
      if (t1 > t2) { [t1, t2] = [t2, t1]; sign = 1; }
      if (t1 > tmin) { tmin = t1; nAxis = k; nSign = sign; }
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
    t = tmin;
    nLocal = new Vec3(0, 0, 0);
    if (nAxis >= 0) { nLocal = nAxis === 0 ? new Vec3(nSign, 0, 0) : nAxis === 1 ? new Vec3(0, nSign, 0) : new Vec3(0, 0, nSign); }
  } else if (s.type === ShapeType.PLANE) {
    const n = Vec3.fromArray(s.normal);
    const originW = Vec3.fromArray(origin);
    const dirW = Vec3.fromArray(dir);
    const dn = Vec3.dot(dirW, n);
    if (Math.abs(dn) < 1e-12) return null;
    const tt = (s.d - Vec3.dot(originW, n)) / dn;
    if (tt < 0 || tt > maxDist) return null;
    return { t: tt, normal: n, point: originW.add(dirW.scale(tt)) };
  } else if (s.type === ShapeType.CAPSULE) {
     const inv = body.rot.conjugate();
     const o = inv.rotate(Vec3.fromArray(origin).sub(body.pos));
     const d = inv.rotate(Vec3.fromArray(dir));
     const r = s.r, hh = s.halfH;
     let bestT = Infinity, bestN = null;
     const a = d.x * d.x + d.z * d.z;
     const b = 2 * (o.x * d.x + o.z * d.z);
     const c = o.x * o.x + o.z * o.z - r * r;
     const disc = b * b - 4 * a * c;
     if (disc >= 0 && a > 1e-12) {
       const sq = Math.sqrt(disc);
       for (const t of [(-b - sq) / (2 * a), (-b + sq) / (2 * a)]) {
         if (t > 0 && t < bestT) {
           const y = o.y + t * d.y;
           if (Math.abs(y) <= hh) { bestT = t; bestN = new Vec3(o.x + t * d.x, 0, o.z + t * d.z).normalize(); }
         }
       }
     }
     for (const yOff of [hh, -hh]) {
       const co = o.sub(new Vec3(0, yOff, 0));
       const bq = 2 * Vec3.dot(co, d), cq = co.lenSq() - r * r, dsq = bq * bq - 4 * cq;
       if (dsq >= 0) {
         const t = (-bq - Math.sqrt(dsq)) / 2;
         if (t > 0 && t < bestT) { bestT = t; bestN = co.add(d.scale(t)).normalize(); }
       }
     }
    if (bestT === Infinity || bestT > maxDist) return null;
    return { t: bestT, normal: body.rot.rotate(bestN), point: Vec3.fromArray(origin).add(Vec3.fromArray(dir).scale(bestT)) };
  } else if (s.type === ShapeType.CONVEX) {
    const supA = s.worldSupport(body.pos, body.rot);
    const aabb = s.aabb(body.pos, body.rot);
    const ro = Vec3.fromArray(origin);
    const rd = Vec3.fromArray(dir);
    
    // 1. AABB 预检
    let tmin = 0, tmax = maxDist;
    for (let k = 0; k < 3; k++) {
      const ok = origin[k], dk = dir[k];
      const mn = aabb.min[k], mx = aabb.max[k];
      if (Math.abs(dk) < 1e-12) { if (ok < mn || ok > mx) return null; continue; }
      let t1 = (mn - ok) / dk, t2 = (mx - ok) / dk;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }

    // 2. 二分搜索命中点
    let low = tmin, high = tmax, hitT = -1, hitSimplex = null;
    for (let i = 0; i < 20; i++) {
      let mid = (low + high) * 0.5;
      const p = ro.add(rd.scale(mid));
      const { hit, simplex } = gjkIntersect(supA, (d) => p.toArray(), 64);
      if (hit) { hitT = mid; high = mid; hitSimplex = simplex; }
      else low = mid;
    }
    if (hitT >= 0) {
      const p = ro.add(rd.scale(hitT));
      const pen = epaPenetration(supA, (d) => p.toArray(), hitSimplex);
      return { t: hitT, normal: Vec3.fromArray(pen.normal), point: p };
    }
    return null;
  }
  if (t === null || t < 0 || t > maxDist) return null;
  const nWorld = body.rot.rotate(nLocal);
  return { t, normal: nWorld, point: Vec3.fromArray(origin).add(Vec3.fromArray(dir).scale(t)) };
}
