// 约束系统（v3 M-D / D31）：对象级约束，对标 Blender Object Constraints。
// 纯函数、零依赖、零 DOM、Node 可测。约束作用于 GameObject3D.transform（position/rotation/scale）。
// 每帧由 solveConstraints(scene) 求解：按对象 constraints 数组顺序依次应用。
// 注意：旋转为欧拉角（度），与引擎 transform 约定一致。

export const CONSTRAINT_TYPES = [
  'COPY_LOCATION', 'COPY_ROTATION', 'COPY_SCALE', 'COPY_TRANSFORMS',
  'TRACK_TO', 'LIMIT_LOCATION', 'LIMIT_ROTATION', 'LIMIT_SCALE',
];

// ---- 单约束求解 ----
// constraint: { type, target?:objId, influence=1, ...params }
// obj: 被约束对象；scene: Scene3D（取 target）；返回是否生效。
export function solveConstraint(obj, constraint, scene) {
  if (!constraint || constraint.enabled === false) return false;
  const fn = _IMPL[constraint.type];
  if (!fn) throw new Error('未知约束类型: ' + constraint.type); // 红线 A
  const w = constraint.influence == null ? 1 : constraint.influence;
  fn(obj, constraint, scene, w);
  return true;
}

// ---- 场景级求解：遍历对象，应用其 constraints ----
// 拓扑排序省略（约束环为已知简化，v3 不处理循环依赖；按对象插入序求解）。
export function solveConstraints(scene) {
  if (!scene || !scene.objects) return 0;
  let n = 0;
  for (const obj of scene.objects.values()) {
    const list = obj.constraints;
    if (!Array.isArray(list)) continue;
    for (const c of list) if (solveConstraint(obj, c, scene)) n++;
  }
  return n;
}

function _target(scene, c) {
  const t = c.target != null ? scene.get(c.target) : null;
  if (!t) throw new Error('约束缺 target 对象: ' + c.type);
  return t;
}
function _lerp(a, b, w) { return a + (b - a) * w; }
function _lerp3(dst, src, w) { dst[0] = _lerp(dst[0], src[0], w); dst[1] = _lerp(dst[1], src[1], w); dst[2] = _lerp(dst[2], src[2], w); }

// COPY_LOCATION / COPY_ROTATION / COPY_SCALE：按 influence 插值到目标值。
function _copyLocation(obj, c, scene, w) { _lerp3(obj.transform.position, _target(scene, c).transform.position, w); }
function _copyRotation(obj, c, scene, w) { _lerp3(obj.transform.rotation, _target(scene, c).transform.rotation, w); }
function _copyScale(obj, c, scene, w) { _lerp3(obj.transform.scale, _target(scene, c).transform.scale, w); }
function _copyTransforms(obj, c, scene, w) {
  const t = _target(scene, c).transform;
  _lerp3(obj.transform.position, t.position, w);
  _lerp3(obj.transform.rotation, t.rotation, w);
  _lerp3(obj.transform.scale, t.scale, w);
}

// TRACK_TO：使 obj 的 -Z（Blender 约定为 -Z 朝向，本引擎用 +Z 朝向由 axis 参数指定）指向 target。
// 简化实现：计算朝向欧拉角（yaw/pitch），roll 不变。axis 默认 'Z'。
function _trackTo(obj, c, scene, w) {
  const t = _target(scene, c);
  const p = obj.transform.position, q = t.transform.position;
  const dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2];
  const yaw = Math.atan2(dx, dz) * 180 / Math.PI;                    // 绕 Y
  const pitch = -Math.atan2(dy, Math.hypot(dx, dz)) * 180 / Math.PI; // 绕 X
  const r = obj.transform.rotation;
  r[1] = _lerp(r[1], yaw, w);
  r[0] = _lerp(r[0], pitch, w);
}

// LIMIT_*：逐轴钳制到 [min,max]（未提供的轴不限制）。
function _limitLocation(obj, c) { _clamp3(obj.transform.position, c.min, c.max); }
function _limitRotation(obj, c) { _clamp3(obj.transform.rotation, c.min, c.max); }
function _limitScale(obj, c) { _clamp3(obj.transform.scale, c.min, c.max); }
function _clamp3(v, mn, mx) {
  for (let i = 0; i < 3; i++) {
    if (mn && mn[i] != null && v[i] < mn[i]) v[i] = mn[i];
    if (mx && mx[i] != null && v[i] > mx[i]) v[i] = mx[i];
  }
}

const _IMPL = {
  COPY_LOCATION: _copyLocation, COPY_ROTATION: _copyRotation, COPY_SCALE: _copyScale,
  COPY_TRANSFORMS: _copyTransforms, TRACK_TO: _trackTo,
  LIMIT_LOCATION: _limitLocation, LIMIT_ROTATION: _limitRotation, LIMIT_SCALE: _limitScale,
};
