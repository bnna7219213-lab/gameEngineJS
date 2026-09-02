// 实例化 GPU 绘制闭环 smoke：SoftwareDevice 实例循环 + 每实例矩阵/颜色喂入（黄金参考路径）
// WebGL2 端的 drawElementsInstanced + vertexAttribDivisor 为本文件同源逻辑的 GPU 对等实现（浏览器 parity 页验收）。
import { SoftwareDevice } from '../../src/engine/render/rhi_software.js';
import { packInstanceBuffer } from '../../src/engine/render/instance_buffer.js';
import { Mat4 } from '../../src/engine/core/math.js';

export const name = 'rhi_instancing_smoke.js';
export async function run(t) {
  const dev = new SoftwareDevice();
  await dev.init({ width: 64, height: 64 });

  // 单位 quad（2 三角），仅 position
  const positions = new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]);
  const indices = new Uint32Array([0, 1, 2, 0, 2, 3]);
  const vbuf = dev.createBuffer({ data: positions });
  const ibuf = dev.createBuffer({ data: indices });
  const layout = [{ name: 'position', type: 'f32x3', offset: 0 }];

  // 4 个实例：平移到四象限 + 4 色
  const matrices = [
    Mat4.translation(-0.5, 0.5, 0),   // 左上红
    Mat4.translation(0.5, 0.5, 0),    // 右上绿
    Mat4.translation(-0.5, -0.5, 0),  // 左下蓝
    Mat4.translation(0.5, -0.5, 0),   // 右下黄
  ];
  const colors = new Float32Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255]);
  const packed = packInstanceBuffer(matrices, { colors });
  t.eq(packed.strideFloats, 20, 'stride = 16(mat4) + 4(color)');
  const ibufInst = dev.createBuffer({ data: packed.data });

  const vs = (attr) => {
    const m = attr.iModel.m, p = attr.position;
    const x = m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3];
    const y = m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7];
    const z = m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11];
    return { pos: [x, y, z, 1], vary: { color: attr.iColor } };
  };
  const fs = (vary) => vary.color;
  const shader = dev.createShader({ js: { vs, fs } });
  const pipe = dev.createPipeline({ shader, vertexLayout: layout });

  dev.beginFrame();
  dev.beginPass({ clearColor: [0, 0, 0, 255] });
  dev.setPipeline(pipe);
  dev.setVertexBuffer(vbuf);
  dev.setIndexBuffer(ibuf, 'u32');
  dev.setInstanceBuffer(ibufInst, { strideFloats: packed.strideFloats, hasColor: packed.hasColor });
  dev.drawIndexed(6, 4);
  dev.endPass();
  const snap = dev.snapshot();

  const px = (x, y) => { const i = (y * 64 + x) * 4; return [snap.rgba[i], snap.rgba[i + 1], snap.rgba[i + 2]]; };
  const tl = px(16, 16), tr = px(48, 16), bl = px(16, 48), br = px(48, 48);
  t.ok(tl[0] > tl[1] && tl[0] > tl[2], '左上 = 红');
  t.ok(tr[1] > tr[0] && tr[1] > tr[2], '右上 = 绿');
  t.ok(bl[2] > bl[0] && bl[2] > bl[1], '左下 = 蓝');
  t.ok(br[0] > br[2] && br[1] > br[2], '右下 = 黄');

  // 实例计数：4 个象限均被绘制（非零像素）
  const lit = [tl, tr, bl, br].every(c => c[0] + c[1] + c[2] > 0);
  t.ok(lit, '四个象限均有实例被绘制');
}
