// rhi-software-texture：验证 Software 黄金参考的纹理采样路径（bindTexture → js fs 采样 tex0）。
// 作为 P1「纹理采样」parity 的 Node 侧基线（WebGL2↔Software 逐像素比对在 parity_browser.html 完成）。
export const name = 'rhi-software-texture';
import { SoftwareDevice } from '../../src/engine/render/rhi_software.js';
import { vertexLayout, packVertices } from '../../src/engine/render/rhi.js';

export async function run(t) {
  const dev = new SoftwareDevice(); await dev.init({ width: 16, height: 16 });
  const tex = dev.createTexture({
    width: 2, height: 2,
    data: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255])
  });
  const layout = vertexLayout([{ name: 'pos', type: 'f32x3' }]);
  const verts = packVertices(layout, [
    { pos: [-1, -1, 0] }, { pos: [1, -1, 0] }, { pos: [1, 1, 0] },
    { pos: [-1, -1, 0] }, { pos: [1, 1, 0] }, { pos: [-1, 1, 0] }
  ]);
  const vb = dev.createBuffer({ data: verts.data });
  const ib = dev.createBuffer({ data: new Uint32Array([0, 1, 2, 3, 4, 5]) });
  const sh = dev.createShader({
    js: {
      vs: (a) => ({ pos: [a.pos[0], a.pos[1], a.pos[2], 1], vary: { uv: [a.pos[0] * 0.5 + 0.5, a.pos[1] * 0.5 + 0.5] } }),
      fs: (v, u) => {
        const T = u.tex0;
        const x = Math.min(T.w - 1, Math.max(0, (v.uv[0] * T.w) | 0));
        const y = Math.min(T.h - 1, Math.max(0, (v.uv[1] * T.h) | 0));
        const i = (y * T.w + x) * 4;
        return [T.data[i], T.data[i + 1], T.data[i + 2], 255];
      }
    }
  });
  const pipe = dev.createPipeline({ shader: sh, vertexLayout: layout });
  dev.beginFrame(); dev.beginPass({ clearColor: [0, 0, 0, 255] });
  dev.setPipeline(pipe); dev.setVertexBuffer(vb); dev.setIndexBuffer(ib, 'u32');
  dev.bindTexture(0, tex);
  dev.drawIndexed(6);
  dev.endPass(); dev.endFrame();
  const s = dev.snapshot().rgba;
  const near = (a, b) => Math.abs(a - b) <= 3;
  const found = { r: false, g: false, b: false, w: false };
  for (let i = 0; i < s.length; i += 4) {
    const R = s[i], G = s[i + 1], B = s[i + 2];
    if (near(R, 255) && near(G, 0) && near(B, 0)) found.r = true;
    else if (near(R, 0) && near(G, 255) && near(B, 0)) found.g = true;
    else if (near(R, 0) && near(G, 0) && near(B, 255)) found.b = true;
    else if (near(R, 255) && near(G, 255) && near(B, 255)) found.w = true;
  }
  t.ok(found.r && found.g && found.b && found.w, 'Software 纹理采样覆盖全部 4 个 texel 颜色: ' + JSON.stringify(found));
  dev.destroy();
}
