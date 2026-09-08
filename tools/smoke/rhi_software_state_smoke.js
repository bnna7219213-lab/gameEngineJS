// rhi-software-state：验证 Software 黄金参考已具备 P1-5 的光栅状态语义
// （背面剔除、近/远平面裁剪、像素中心 +0.5 栅格化），与 WebGL2 行为对齐。
export const name = 'rhi-software-state';
import { SoftwareDevice } from '../../src/engine/render/rhi_software.js';
import { vertexLayout, packVertices } from '../../src/engine/render/rhi.js';

function drawTri(dev, layout, verts, shader, cull) {
  const vb = dev.createBuffer({ data: verts.data });
  const ib = dev.createBuffer({ data: new Uint32Array([0, 1, 2]) });
  const sh = dev.createShader({ js: shader });
  const pipe = dev.createPipeline({ shader: sh, vertexLayout: layout, cull });
  dev.beginFrame();
  dev.beginPass({ clearColor: [0, 0, 0, 255] });
  dev.setPipeline(pipe); dev.setVertexBuffer(vb); dev.setIndexBuffer(ib, 'u32');
  dev.drawIndexed(3);
  dev.endPass(); dev.endFrame();
  const s = dev.snapshot();
  let lit = 0;
  for (let i = 0; i < s.rgba.length; i += 4) if (s.rgba[i] || s.rgba[i + 1] || s.rgba[i + 2]) lit++;
  return lit;
}

export async function run(t) {
  const layout = vertexLayout([{ name: 'position', type: 'f32x3' }]);
  const verts = packVertices(layout, [{ position: [0, 0.6, 0] }, { position: [-0.6, -0.4, 0] }, { position: [0.6, -0.4, 0] }]);
  const flat = () => ({ vs: (a) => ({ pos: [a.position[0], a.position[1], a.position[2], 1], vary: {} }), fs: () => [255, 0, 0, 255] });

  // 正面三角形（CCW，area>0）：cull=back 可见，cull=front 被剔除
  {
    const dev = new SoftwareDevice(); await dev.init({ width: 64, height: 64 });
    const back = drawTri(dev, layout, verts, flat(), 'back');
    const front = drawTri(dev, layout, verts, flat(), 'front');
    t.ok(back > 0, 'cull=back 正面三角形可见 (got ' + back + ')');
    t.eq(front, 0, 'cull=front 正面三角形被剔除（背面剔除生效）');
    dev.destroy();
  }

  // 近/远平面裁剪：所有顶点 ndc z=2（超出远平面）→ 完全裁掉
  {
    const dev = new SoftwareDevice(); await dev.init({ width: 64, height: 64 });
    const far = { vs: (a) => ({ pos: [a.position[0], a.position[1], 2.0, 1], vary: {} }), fs: () => [0, 255, 0, 255] };
    const lit = drawTri(dev, layout, verts, far, 'none');
    t.eq(lit, 0, 'ndc z=2 超出远平面被完全裁剪');
    dev.destroy();
  }

  // 像素中心 +0.5：常规三角形仍正常栅格化（回归守卫，确保改动未令覆盖归零）
  {
    const dev = new SoftwareDevice(); await dev.init({ width: 32, height: 32 });
    const big = packVertices(layout, [{ position: [-0.4, 0.4, 0] }, { position: [-0.4, -0.4, 0] }, { position: [0.4, -0.4, 0] }]);
    const lit = drawTri(dev, layout, big, flat(), 'none');
    t.ok(lit > 0, '像素中心采样下三角形仍正常栅格化 (got ' + lit + ')');
    dev.destroy();
  }
}
