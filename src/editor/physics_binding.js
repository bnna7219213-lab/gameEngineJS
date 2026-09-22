// 刚体组件绑定层（v3 M-E）：把 GameObject3D.components.rigidbody/collider3d 绑定到
// world3d.js 的 PhysicsWorld。对标 Blender「物理属性」选项卡 + Unity Rigidbody 组件。
// 职责：组件参数 -> RigidBody 构造、step 后回写 transform、静态/质量/摩擦/恢复/形状。
// DOM-free、零依赖、Node 可测。
import { PhysicsWorld, RigidBody, Shape, ShapeType } from '../engine/sim/world3d.js';
import { Vec3, Quat } from '../engine/core/math.js';

// collider3d 组件 -> Shape。registry 现有 collider3d: { shape:'box'|'sphere', size:[x,y,z] }。
export function shapeFromCollider(collider) {
  if (!collider) return new Shape(ShapeType.BOX, { half: [0.5, 0.5, 0.5] });
  const s = collider.size || [1, 1, 1];
  switch (collider.shape) {
    case 'sphere': return new Shape(ShapeType.SPHERE, { r: (s[0] || 1) / 2 });
    case 'capsule': return new Shape(ShapeType.CAPSULE, { r: (s[0] || 1) / 2, halfH: (s[1] || 1) / 2 });
    case 'box':
    default: return new Shape(ShapeType.BOX, { half: [s[0] / 2, s[1] / 2, s[2] / 2] });
  }
}

// 组件 -> RigidBody。rigidbody 组件字段：mass/friction/restitution/static/gravityScale。
export function bodyFromObject(obj) {
  const rb = (obj.components || {}).rigidbody || {};
  const col = (obj.components || {}).collider3d;
  const shape = shapeFromCollider(col);
  const p = obj.transform.position, r = obj.transform.rotation;
  return new RigidBody(shape, {
    pos: [p[0], p[1], p[2]],
    rot: _eulerToQuat(r[0], r[1], r[2]),
    mass: rb.mass != null ? rb.mass : 1,
    restitution: rb.restitution != null ? rb.restitution : 0.3,
    friction: rb.friction != null ? rb.friction : 0.5,
    static: !!rb.static,
  });
}

// 度欧拉 -> Quat（XYZ 顺序，与引擎 transform 约定一致）。
function _eulerToQuat(rx, ry, rz) {
  const toR = (d) => d * Math.PI / 180;
  const qx = Quat.fromAxisAngle([1, 0, 0], toR(rx));
  const qy = Quat.fromAxisAngle([0, 1, 0], toR(ry));
  const qz = Quat.fromAxisAngle([0, 0, 1], toR(rz));
  return qy.mul(qx).mul(qz).normalize();
}
function _quatToEuler(q) {
  // 从四元数提取 XYZ 欧拉（度）。简化：转 Mat4 后按列解算。
  const m = q.toMat4().m;
  // 行主序 m[row*4+col]；提取 pitch(X)/yaw(Y)/roll(Z)
  const sy = Math.hypot(m[0], m[4]);
  const rad2deg = 180 / Math.PI;
  let x, y, z;
  if (sy > 1e-6) {
    x = Math.atan2(m[6], m[10]); y = Math.atan2(-m[2], sy); z = Math.atan2(m[1], m[0]);
  } else {
    x = Math.atan2(-m[9], m[5]); y = Math.atan2(-m[2], sy); z = 0;
  }
  return [x * rad2deg, y * rad2deg, z * rad2deg];
}

// 物理会话：把场景中所有带 rigidbody 的对象加入 PhysicsWorld，step 后回写 transform。
export class PhysicsSession {
  constructor(scene, { gravity = [0, -9.8, 0] } = {}) {
    this.scene = scene;
    this.world = new PhysicsWorld({ gravity });
    this._map = new Map(); // objId -> RigidBody
  }
  // 同步场景刚体（新增/移除）。
  sync() {
    const seen = new Set();
    for (const obj of this.scene.objects.values()) {
      if (!(obj.components || {}).rigidbody) continue;
      seen.add(obj.id);
      if (!this._map.has(obj.id)) {
        const body = bodyFromObject(obj);
        this.world.add(body);
        this._map.set(obj.id, body);
      }
    }
    for (const [id, body] of [...this._map.entries()]) {
      if (!seen.has(id)) { this.world.remove(body); this._map.delete(id); }
    }
    return this._map.size;
  }
  // 推进 dt 并回写 transform（pos + 欧拉旋转）。
  step(dt) {
    this.world.step(dt);
    for (const [id, body] of this._map.entries()) {
      const obj = this.scene.get(id);
      if (!obj) continue;
      obj.transform.position = [body.pos.x, body.pos.y, body.pos.z];
      obj.transform.rotation = _quatToEuler(body.rot);
    }
  }
  bodyOf(objId) { return this._map.get(objId) || null; }
  get bodyCount() { return this._map.size; }
}
