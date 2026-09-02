// games/common.js —— 四个示例游戏共享的引导与渲染辅助。
// 职责：创建 RHI 渲染设备（'auto'：WebGPU→WebGL2→Software 自动降级），把后端与降级
//       原因写入 HUD；提供统一的「彩色三角形批次」渲染（2D 正交 / 3D 透视共用一条管线）。
// 对应：C++ 版 samples/sample_common（示例程序公共引导层）。
// 约定：顶点布局 pos(f32x3)+color(f32x3)（与 rhi_webgl2 固定属性 stride=24 对齐）；
//       常量 { mvp: Float32Array(16) } 行主序（见 core/math.js §4）；颜色 0..1；
//       Software 后端由本模块把帧缓冲 blit 到 canvas 2D，GPU 后端直接画到初始化 canvas。

import { Mat4 } from '../src/engine/core/math.js';
import { createRenderDevice, vertexLayout } from '../src/engine/render/rhi.js';

// 着色器双写：glsl 供 WebGL2，js 供 Software（黄金参考）。两者语义一致。
const SHADER_DESC = {
  name: 'game_flat_color',
  glsl: {
    vs: `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aColor;
uniform mat4 uMVP;
out vec3 vColor;
void main(){ vColor = aColor; gl_Position = uMVP * vec4(aPos, 1.0); }`,
    fs: `#version 300 es
precision mediump float;
in vec3 vColor;
out vec4 oColor;
void main(){ oColor = vec4(vColor, 1.0); }`
  },
  js: {
    // 行主序 mvp（core/math.js 约定：平移在 m[3]/m[7]/m[11]）
    vs(attr, uni) {
      const m = uni.mvp, p = attr.pos;
      const x = p[0], y = p[1], z = p[2] || 0;
      return {
        pos: [
          m[0] * x + m[1] * y + m[2] * z + m[3],
          m[4] * x + m[5] * y + m[6] * z + m[7],
          m[8] * x + m[9] * y + m[10] * z + m[11],
          m[12] * x + m[13] * y + m[14] * z + m[15]
        ],
        vary: { color: attr.color }
      };
    },
    fs(vary) {
      const c = vary.color;
      return [c[0] * 255, c[1] * 255, c[2] * 255, 255];
    }
  }
};

// 彩色三角形批次：每帧 CPU 侧收集三角形，flush 时一次性上传并 drawIndexed。
export class TriBatch {
  constructor(device) {
    this.device = device;
    this.layout = vertexLayout([
      { name: 'pos', type: 'f32x3' },
      { name: 'color', type: 'f32x3' }
    ]);
    this.shader = device.createShader(SHADER_DESC);
    this.pipeline = device.createPipeline({ shader: this.shader, vertexLayout: this.layout, targets: 1, depth: true });
    this.verts = [];   // 交错 [x,y,z, r,g,b] * n
    this.indices = [];
  }
  begin() { this.verts.length = 0; this.indices.length = 0; }
  // 直接推一个三角形（世界/屏幕空间由调用者决定，颜色 0..1）
  tri(ax, ay, az, bx, by, bz, cx, cy, cz, color) {
    const base = this.verts.length / 6;
    this.verts.push(ax, ay, az, color[0], color[1], color[2]);
    this.verts.push(bx, by, bz, color[0], color[1], color[2]);
    this.verts.push(cx, cy, cz, color[0], color[1], color[2]);
    this.indices.push(base, base + 1, base + 2);
  }
  // 2D 轴对齐矩形（z=0），像素坐标
  quad(x0, y0, x1, y1, color) {
    this.tri(x0, y0, 0, x1, y0, 0, x1, y1, 0, color);
    this.tri(x0, y0, 0, x1, y1, 0, x0, y1, 0, color);
  }
  // 上传并绘制。mvp 为 Mat4 或其 .m（Float32Array 行主序）。
  flush(mvp) {
    if (this.indices.length === 0) return;
    const dev = this.device;
    const m = mvp instanceof Mat4 ? mvp.m : mvp;
    const vb = dev.createBuffer({ data: new Float32Array(this.verts) });
    const ib = dev.createBuffer({ data: new Uint32Array(this.indices) });
    dev.setPipeline(this.pipeline);
    dev.setVertexBuffer(vb, 24);
    dev.setIndexBuffer(ib, 'u32');
    dev.setConstants({ mvp: m });
    dev.drawIndexed(this.indices.length);
    // 软件/GL 后端都没有显式销毁句柄的 API，直接从内部表移除避免每帧泄漏
    if (dev.buffers) { dev.buffers.delete(vb.id); dev.buffers.delete(ib.id); }
    if (dev._bufs) { dev._bufs.delete(vb.id); dev._bufs.delete(ib.id); }
  }
}

// 引导：创建设备 + 写 HUD 后端信息。能力缺失走引擎降级链，绝不崩溃（红线 E）。
export async function bootGame(canvas, hudBackendEl, width, height) {
  canvas.width = width;
  canvas.height = height;
  const device = await createRenderDevice('auto', { canvas, width, height });
  const fb = device.fallbackFrom;
  const text = fb && fb.length
    ? `渲染后端: ${device.api}（已降级，原因: ${fb.join('；')}）`
    : `渲染后端: ${device.api}`;
  if (hudBackendEl) hudBackendEl.textContent = text;
  const batch = new TriBatch(device);
  return { device, batch, backendText: text };
}

// 呈现：Software 后端 present() 返回 RGBA8，需要 blit 到 canvas 2D；
// GPU 后端直接画在初始化时传入的 canvas 上，present 可能未实现，显式跳过。
export function presentFrame(device, canvas) {
  if (device.api === 'software') {
    const rgba = device.present();
    if (!canvas._ctx2d) canvas._ctx2d = canvas.getContext('2d');
    const img = new ImageData(new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, device.width * device.height * 4), device.width, device.height);
    canvas._ctx2d.putImageData(img, 0, 0);
  }
}

// 2D 游戏常用：像素坐标正交投影（y 向下，原点在左上）
export function ortho2D(w, h) { return Mat4.ortho(0, w, h, 0, -1, 1); }
