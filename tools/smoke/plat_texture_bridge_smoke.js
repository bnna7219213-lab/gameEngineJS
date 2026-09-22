// 纹理桥接 smoke：GLTF 图像（bufferView / data URI）字节解码 + 浏览器 createImageBitmap 分支 + RHI 上传统一接口。
import { parseGLB } from '../../src/engine/platform/gltf.js';
import { encodePNG, decodePNG } from '../../src/engine/platform/image.js';
import { decodeGLTFImage, uploadTexture, createImageTexture } from '../../src/engine/platform/texture_bridge.js';
import { SoftwareDevice } from '../../src/engine/render/rhi_software.js';
import { buildGLB } from './_glb_helper.js';

export const name = 'plat_texture_bridge_smoke.js';

export async function run(t) {
  // 造一张已知 2x2 RGBA PNG
  const ref = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]);
  const W = 2, H = 2;
  const png = encodePNG({ width: W, height: H, rgba: ref });
  t.ok(png.length > 8 && png[0] === 0x89, 'PNG 头');

  // ---- 1. bufferView 图像解码（Node PNG）----
  const bin1 = new ArrayBuffer(png.length);
  new Uint8Array(bin1).set(png);
  const doc1 = parseGLB(buildGLB({
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: 'n0' }],
    images: [{ mimeType: 'image/png', bufferView: 0 }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: png.length }],
    buffers: [{ byteLength: bin1.byteLength }],
  }, bin1));
  const img1 = await decodeGLTFImage(doc1, 0);
  t.eq(img1.width, W, 'bufferView 解码宽');
  t.eq(img1.height, H, 'bufferView 解码高');
  let eq = true; for (let i = 0; i < ref.length; i++) if (img1.rgba[i] !== ref[i]) eq = false;
  t.ok(eq, 'bufferView 解码 RGBA 与原始一致');

  // ---- 2. data URI 图像解码（Node PNG）----
  const b64 = Buffer.from(png).toString('base64');
  const doc2 = parseGLB(buildGLB({
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: 'n0' }],
    images: [{ mimeType: 'image/png', uri: 'data:image/png;base64,' + b64 }],
    bufferViews: [], buffers: [{ byteLength: 0 }],
  }, new ArrayBuffer(0)));
  const img2 = await decodeGLTFImage(doc2, 0);
  t.eq(img2.width, W, 'dataURI 解码宽');
  let eq2 = true; for (let i = 0; i < ref.length; i++) if (img2.rgba[i] !== ref[i]) eq2 = false;
  t.ok(eq2, 'dataURI 解码 RGBA 一致');

  // ---- 3. 浏览器 createImageBitmap 分支（注入 mock）----
  let captured = null;
  const fakeRhi = { createTexture(p) { captured = p; return { id: 1 }; } };
  const mockBm = { width: W, height: H, close() {} };
  const img3 = await decodeGLTFImage(doc1, 0, { createImageBitmap: async () => mockBm });
  t.ok(img3.bitmap === mockBm, '浏览器分支返回 ImageBitmap');
  t.eq(img3.width, W, 'bitmap 宽');
  uploadTexture(fakeRhi, img3);
  t.ok(captured && captured.data === mockBm, 'uploadTexture 把 bitmap 直传 WebGL2');

  // ---- 4. Node 路径上传到 SoftwareRHI ----
  const dev = new SoftwareDevice(); await dev.init({ width: 4, height: 4 });
  const tex = await createImageTexture(dev, doc1, 0);
  const st = dev.textures.get(tex.id);
  t.eq(st.w, W, 'Software 纹理宽');
  t.eq(st.h, H, 'Software 纹理高');
  let eq3 = true; for (let i = 0; i < ref.length; i++) if (st.data[i] !== ref[i]) eq3 = false;
  t.ok(eq3, 'Software 纹理数据一致');
  dev.destroy();
}
