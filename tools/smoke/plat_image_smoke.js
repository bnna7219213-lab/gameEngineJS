// 图片/纹理子系统 smoke：PNG 编解码往返、Mipmap 盒式降采样、Atlas 行架打包、decodeImage 分发。
import { encodePNG, decodePNG, decodeImage, Texture, packAtlas } from '../../src/engine/platform/image.js';

export const name = 'plat_image_smoke.js';

export async function run(t) {
  // 1. PNG 编解码往返（4x4 RGBA，渐变像素）
  const W = 4, H = 4;
  const rgba = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    rgba[i] = x * 60; rgba[i + 1] = y * 60; rgba[i + 2] = (x + y) * 30; rgba[i + 3] = 255;
  }
  const png = encodePNG({ width: W, height: H, rgba });
  t.ok(png.length > 20 && png[0] === 0x89 && png[1] === 0x50, 'encodePNG 产出 PNG 头');
  const dec = decodePNG(png);
  t.eq(dec.width, W, 'decode 宽');
  t.eq(dec.height, H, 'decode 高');
  let allEq = true; for (let i = 0; i < rgba.length; i++) if (dec.rgba[i] !== rgba[i]) allEq = false;
  t.ok(allEq, 'PNG 编解码往返字节一致');

  // 2. Texture Mipmap（2x2 四色 → 1x1 均值）
  const m = new Uint8Array([0, 0, 0, 255, 255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]);
  const tex = new Texture({ width: 2, height: 2, rgba: m });
  const mips = tex.generateMipmaps();
  t.eq(mips.length, 2, 'Mipmap 级数=2（2x2→1x1）');
  const m1 = mips[1].data;
  t.eq(m1[0], 64, 'mip1 R 均值'); t.eq(m1[1], 64, 'mip1 G 均值'); t.eq(m1[2], 64, 'mip1 B 均值'); t.eq(m1[3], 255, 'mip1 A=255');
  t.eq(mips[1].width, 1, 'mip1 宽=1'); t.eq(mips[1].height, 1, 'mip1 高=1');

  // 3. Atlas 行架打包
  const atlas = packAtlas([{ w: 2, h: 2 }, { w: 2, h: 2 }], { maxWidth: 4 });
  t.eq(atlas.width, 4, 'atlas 宽=4');
  t.eq(atlas.height, 2, 'atlas 高=2');
  const r0 = atlas.rects[0], r1 = atlas.rects[1];
  t.ok(r0.x === 0 && r0.y === 0 && r0.w === 2 && r0.h === 2, 'rect0=(0,0,2,2)');
  t.ok(r1.x === 2 && r1.y === 0 && r1.w === 2 && r1.h === 2, 'rect1=(2,0,2,2)');

  // 4. decodeImage 分发：PNG 走 decodePNG，未知 mime 抛错
  const d2 = decodeImage(png, 'image/png');
  t.eq(d2.width, W, 'decodeImage(png)');
  let threw = false; try { decodeImage(png, 'image/jpeg'); } catch (e) { threw = true; }
  t.ok(threw, 'decodeImage 未知 mime 抛错（浏览器走 createImageBitmap）');
}
