// 角色控制器（Q1）：胶囊扫掠 + 滑墙投影 + 台阶步高 + 坡度限制。对应 Unity CharacterController。
// 确定性：移动分最多 3 次迭代投影，无随机。
import { Vec3 } from '../core/math.js';
import { Shape, ShapeType, RigidBody, PhysicsWorld } from './world3d.js';

export class CharacterController {
  constructor(world, { pos = [0, 0, 0], r = 0.4, height = 1.8, stepHeight = 0.4, slopeLimitDeg = 50, skin = 0.02 } = {}) {
    this.world = world;
    this.r = r; this.height = height;
    this.stepHeight = stepHeight;
    this.slopeLimit = Math.cos(slopeLimitDeg * Math.PI / 180); // 法线 y 分量阈值
    this.skin = skin;
    this.shape = new Shape(ShapeType.CAPSULE, { r, halfH: Math.max(0, height / 2 - r) });
    this.body = new RigidBody(this.shape, { pos, mass: 0 }); // 运动学体（不进世界 bodies，仅形状载体）
    this.vel = new Vec3(0, 0, 0);
    this.grounded = false;
    this.groundNormal = new Vec3(0, 1, 0);
  }
  get pos() { return this.body.pos; }
  // 期望位移（含重力积分由调用方负责）；返回实际位移
  move(delta) {
    let remaining = Vec3.fromArray(delta);
    let total = new Vec3(0, 0, 0);
    this.grounded = false;
    for (let iter = 0; iter < 3 && remaining.len() > 1e-9; iter++) {
      const step = remaining;
      // 1) 试探目标位置
      const target = this.body.pos.add(step);
      // 2) 与世界的最近碰撞（胶囊采样：扫掠近似为多段球）
      const hit = this._sweepCapsule(this.body.pos, target);
      if (!hit) { this.body.pos = target; total = total.add(step); break; }
      // 3) 走到接触点（留 skin）
      const allowed = Math.max(0, hit.t - this.skin);
      const move = step.scale(allowed / Math.max(step.len(), 1e-9));
      this.body.pos = this.body.pos.add(move);
      total = total.add(move);
      const n = hit.normal;
      if (n.y >= this.slopeLimit) { this.grounded = true; this.groundNormal = n; }
      // 4) 台阶：尝试抬高 stepHeight 后水平走完
      if (n.y < this.slopeLimit && this.stepHeight > 0 && step.y <= 0) {
        const up = new Vec3(0, this.stepHeight, 0);
        const raised = this.body.pos.add(up);
        if (!(this._sweepCapsule(raised, raised.add(step.sub(move)))?.hit)) {
          this.body.pos = raised.add(step.sub(move));
          total = total.add(up).add(step.sub(move));
          break;
        }
      }
      // 5) 滑墙：剩余位移投影到接触面
      const rest = step.sub(move);
      remaining = rest.sub(n.scale(Vec3.dot(rest, n)));
    }
    return total;
  }
  // 胶囊扫掠（多球近似：3 段），返回 {t(0..len), normal, hit}
  _sweepCapsule(from, to) {
    const d = to.sub(from);
    const len = d.len();
    if (len < 1e-12) return null;
    const dir = d.scale(1 / len);
    const offs = [-this.shape.halfH, 0, this.shape.halfH];
    let best = null;
    for (const oy of offs) {
      const o = from.add(new Vec3(0, oy, 0));
      // 扩展世界形状半径 r：简化为对静态体做 rayShape + 半径膨胀检查
      for (const b of this.world.bodies) {
        // 解析路径：球 vs 膨胀形状（用 rayShape + r 补偿距离）
        const expanded = { ...b, shape: b.shape };
        const hit = rayShapeExpanded(b, o.toArray(), dir.toArray(), len + this.r, this.r);
        if (hit && (!best || hit.t < best.t)) best = { ...hit, t: hit.t };
      }
    }
    return best ? { ...best, hit: true } : null;
  }
}

// 半径膨胀 raycast（把角色球半径并入形状尺寸）
function rayShapeExpanded(body, origin, dir, maxDist, expandR) {
  const s = body.shape;
  if (s.type === ShapeType.SPHERE) {
    const o = Vec3.fromArray(origin).sub(body.pos);
    const dv = Vec3.fromArray(dir);
    const R = s.r + expandR;
    const bq = 2 * Vec3.dot(o, dv);
    const cq = Vec3.dot(o, o) - R * R;
    const disc = bq * bq - 4 * cq;
    if (disc < 0) return null;
    const t = (-bq - Math.sqrt(disc)) / 2;
    if (t < 0 || t > maxDist) return null;
    const p = Vec3.fromArray(origin).add(dv.scale(t)).sub(body.pos);
    return { t, normal: p.normalize() };
  }
  if (s.type === ShapeType.BOX) {
    const inv = body.rot.conjugate();
    const o = inv.rotate(Vec3.fromArray(origin).sub(body.pos));
    const dv = inv.rotate(Vec3.fromArray(dir));
    let tmin = 0, tmax = maxDist, nAxis = -1, nSign = 0;
    for (let k = 0; k < 3; k++) {
      const ok = [o.x, o.y, o.z][k], dk = [dv.x, dv.y, dv.z][k], h = s.half[k] + expandR;
      if (Math.abs(dk) < 1e-12) { if (Math.abs(ok) > h) return null; continue; }
      let t1 = (-h - ok) / dk, t2 = (h - ok) / dk, sign = -1;
      if (t1 > t2) { [t1, t2] = [t2, t1]; sign = 1; }
      if (t1 > tmin) { tmin = t1; nAxis = k; nSign = sign; }
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
    if (nAxis < 0) return null;
    const nLocal = nAxis === 0 ? new Vec3(nSign, 0, 0) : nAxis === 1 ? new Vec3(0, nSign, 0) : new Vec3(0, 0, nSign);
    return { t: tmin, normal: body.rot.rotate(nLocal) };
  }
  if (s.type === ShapeType.PLANE) {
    const n = Vec3.fromArray(s.normal);
    const dn = Vec3.dot(Vec3.fromArray(dir), n);
    if (Math.abs(dn) < 1e-12) return null;
    const o = Vec3.fromArray(origin);
    const dist = Vec3.dot(o, n) - s.d - expandR;
    const t = -dist / dn;
    if (t < 0 || t > maxDist) return null;
    return { t, normal: n };
  }
  return null;
}
