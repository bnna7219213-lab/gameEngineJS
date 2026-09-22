// 骨骼蒙皮（P3.4）：CPU 端 skinning。输入图元（positions/joints/weights）与 skinning 矩阵，
// 输出蒙皮后的顶点（与法线）。skinning 矩阵由 gltf.skinMatrices 提供（world * inverseBind）。
import { Vec3 } from '../core/math.js';

// 单个顶点蒙皮：p 为 [x,y,z]，joints/weights 为 4 元组；jointMatrices 为 Mat4[]
export function skinVertex(p, joints, weights, jointMatrices) {
  let out = new Vec3(0, 0, 0);
  for (let i = 0; i < 4; i++) {
    const w = weights[i];
    if (w === 0) continue;
    const jm = jointMatrices[joints[i]];
    if (!jm) continue;
    const tp = jm.applyPoint({ x: p[0], y: p[1], z: p[2] });
    out = out.add(tp.scale(w));
  }
  return out;
}

// 蒙皮整网格位置（prim 来自 gltf 图元：positions/joints/weights）
export function skinPositions(prim, jointMatrices) {
  const pos = prim.positions, joints = prim.joints, weights = prim.weights;
  const n = pos.length / 3;
  const out = new Float32Array(pos.length);
  for (let v = 0; v < n; v++) {
    const p = [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
    const j = [joints[v * 4], joints[v * 4 + 1], joints[v * 4 + 2], joints[v * 4 + 3]];
    const w = [weights[v * 4], weights[v * 4 + 1], weights[v * 4 + 2], weights[v * 4 + 3]];
    const r = skinVertex(p, j, w, jointMatrices);
    out[v * 3] = r.x; out[v * 3 + 1] = r.y; out[v * 3 + 2] = r.z;
  }
  return out;
}
