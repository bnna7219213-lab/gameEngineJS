// 实例属性缓冲打包（P4 实例化绘制）：把「每实例世界矩阵 Mat4[]」+ 可选每实例颜色
// 压成一块扁平 Float32Array，供 RHI 绑定为带 divisor 的逐实例顶点属性。
// GLSL 的 in mat4 按列主序读 4 个连续 vec4，故 Mat4(行主序 .m) 在此转置为列主序写入；
// Software 参考端用 mat4FromColumnMajor 再转回行主序 Mat4，保证两后端变换等价（红线 D）。
import { Mat4 } from '../core/math.js';

// matrices: Mat4[]；colors: 可选 Float32Array(count*4) 或 null
// 返回 { data: Float32Array, strideFloats, count, hasColor }
export function packInstanceBuffer(matrices, { colors = null } = {}) {
  const hasColor = !!colors;
  const strideFloats = 16 + (hasColor ? 4 : 0);
  const data = new Float32Array(matrices.length * strideFloats);
  for (let i = 0; i < matrices.length; i++) {
    const m = matrices[i].m; // 行主序
    const base = i * strideFloats;
    // 列主序写入：buffer[base + c*4 + r] = m[r*4 + c]
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) data[base + c * 4 + r] = m[r * 4 + c];
    if (hasColor) { data[base + 16] = colors[i * 4]; data[base + 17] = colors[i * 4 + 1]; data[base + 18] = colors[i * 4 + 2]; data[base + 19] = colors[i * 4 + 3]; }
  }
  return { data, strideFloats, count: matrices.length, hasColor };
}

// 从列主序实例缓冲读出第 inst 个实例的世界矩阵（转回行主序 Mat4）
export function mat4FromColumnMajor(buf, off) {
  const m = new Array(16);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) m[r * 4 + c] = buf[off + c * 4 + r];
  return new Mat4(m);
}

// WebGL2 实例属性布局描述：mat4 占 4 个连续 vec4 location，可选 vec4 颜色接在后面。
// 调用方需保证 GLSL 中 in 变量 location 与此对齐（顶点属性 location 之后接续）。
export function instanceVertexLayout(vertexAttrCount, hasColor) {
  const attrs = [];
  for (let k = 0; k < 4; k++) attrs.push({ name: 'iModel' + k, type: 'f32x4', offset: k * 16, location: vertexAttrCount + k });
  if (hasColor) attrs.push({ name: 'iColor', type: 'f32x4', offset: 64, location: vertexAttrCount + 4 });
  return { attrs, stride: (16 + (hasColor ? 4 : 0)) * 4, hasColor };
}
