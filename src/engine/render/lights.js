// 灯光系统：directional / point / spot 三类灯，以及打包成 WebGL2 uniform 数组的辅助。
// 颜色统一为线性 0..1（着色器内再做线性合成）；颜色以 0..255 传入时会自动归一化。
import { Vec3 } from '../core/math.js';

export const LightType = { Directional: 0, Point: 1, Spot: 2 };
const MAX_LIGHTS = 8;

function toLinear01(c) {
  if (!c) return [0, 0, 0];
  // 接受 [r,g,b] 0..255 或 0..1：以 1.0 为阈值区分
  const m = Math.max(c[0] || 0, c[1] || 0, c[2] || 0);
  if (m > 1.001) return [c[0] / 255, c[1] / 255, c[2] / 255];
  return [c[0] || 0, c[1] || 0, c[2] || 0];
}

export function directionalLight({ direction = [0, -1, 0], color = [1, 1, 1], intensity = 1, shadow = null } = {}) {
  const d = Vec3.of(direction[0], direction[1], direction[2]).normalize();
  return { type: LightType.Directional, direction: [d.x, d.y, d.z], color: toLinear01(color), intensity, shadow };
}
export function pointLight({ position = [0, 0, 0], color = [1, 1, 1], intensity = 1, range = Infinity } = {}) {
  return { type: LightType.Point, position: [position[0], position[1], position[2]], color: toLinear01(color), intensity, range };
}
export function spotLight({ position = [0, 0, 0], direction = [0, -1, 0], color = [1, 1, 1], intensity = 1, range = Infinity, innerConeDeg = 30, outerConeDeg = 45 } = {}) {
  const d = Vec3.of(direction[0], direction[1], direction[2]).normalize();
  return {
    type: LightType.Spot, position: [position[0], position[1], position[2]], direction: [d.x, d.y, d.z],
    color: toLinear01(color), intensity, range, cosInner: Math.cos(innerConeDeg * Math.PI / 180), cosOuter: Math.cos(outerConeDeg * Math.PI / 180),
  };
}

// 打包为 WebGL2 的扁平 uniform 数组（与 pbr.js 的 GLSL 灯表布局一致）。
// 返回 { count, type:Int32Array, color:Float32Array(3*N), pos, dir, param:Float32Array(4*N) }。
export function packLights(lights) {
  const type = new Int32Array(MAX_LIGHTS);
  const color = new Float32Array(MAX_LIGHTS * 3);
  const pos = new Float32Array(MAX_LIGHTS * 3);
  const dir = new Float32Array(MAX_LIGHTS * 3);
  const param = new Float32Array(MAX_LIGHTS * 4); // [intensity, range, cosInner, cosOuter]
  let n = 0;
  for (const L of lights) {
    if (n >= MAX_LIGHTS) break;
    type[n] = L.type;
    color[n * 3] = L.color[0]; color[n * 3 + 1] = L.color[1]; color[n * 3 + 2] = L.color[2];
    if (L.position) { pos[n * 3] = L.position[0]; pos[n * 3 + 1] = L.position[1]; pos[n * 3 + 2] = L.position[2]; }
    if (L.direction) { dir[n * 3] = L.direction[0]; dir[n * 3 + 1] = L.direction[1]; dir[n * 3 + 2] = L.direction[2]; }
    param[n * 4] = L.intensity || 1;
    param[n * 4 + 1] = (L.range && isFinite(L.range)) ? L.range : 0;
    param[n * 4 + 2] = L.cosInner !== undefined ? L.cosInner : 1;
    param[n * 4 + 3] = L.cosOuter !== undefined ? L.cosOuter : 0;
    n++;
  }
  return { count: n, type, color, pos, dir, param };
}
