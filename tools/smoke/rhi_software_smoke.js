export const name = 'rhi-software';
import { SoftwareDevice } from '../../src/engine/render/rhi_software.js';
import { vertexLayout, packVertices } from '../../src/engine/render/rhi.js';

export async function run(t) {
  const dev = new SoftwareDevice();
  await dev.init({ width: 64, height: 64 });
  t.eq(dev.api, 'software');
  const layout = vertexLayout([{ name: 'position', type: 'f32x3' }]);
  const verts = packVertices(layout, [
    { position: [0, 0.6, 0] }, { position: [-0.6, -0.4, 0] }, { position: [0.6, -0.4, 0] },
  ]);
  const vb = dev.createBuffer({ data: verts.data });
  const ib = dev.createBuffer({ data: new Uint32Array([0, 1, 2]) });
  const sh = dev.createShader({ js: { vs: (at) => ({ pos: [at.position[0], at.position[1], at.position[2], 1], vary: {} }), fs: () => [255, 0, 0, 255] } });
  const pipe = dev.createPipeline({ shader: sh, vertexLayout: layout });
  dev.beginFrame();
  dev.beginPass({ clearColor: [0, 0, 0, 255] });
  dev.setPipeline(pipe); dev.setVertexBuffer(vb); dev.setIndexBuffer(ib); dev.setConstants({});
  dev.drawIndexed(3);
  dev.endPass(); dev.endFrame();
  const snap = dev.snapshot();
  t.eq(snap.width, 64); t.eq(snap.height, 64);
  let red = 0;
  for (let i = 0; i < snap.rgba.length; i += 4) if (snap.rgba[i] === 255 && snap.rgba[i + 1] === 0) red++;
  t.ok(red > 0, 'triangle rasterized red pixels (got ' + red + ')');
  dev.destroy();
}
