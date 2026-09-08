// 文字 / 精灵 smoke（排版 → 顶点/UV 几何，与后端无关）
import { makeAsciiAtlas, measureText, buildTextQuads, makeSpriteQuad } from '../../src/engine/render/text.js';

export const name = 'render_text_smoke.js';
export async function run(t) {
  const font = makeAsciiAtlas({ cell: 16, cols: 16 });
  t.ok(font.atlas.glyphs.has('A'), '图集含 A');
  t.ok(font.atlas.glyphs.has(' '), '图集含空格');

  const w = measureText('AB', font);
  t.eq(w, font.size * 2, '2 字宽度 = 2*cell');

  const q = buildTextQuads('Hi', font, { x: 0, y: 0, size: 16 });
  t.eq(q.count, 2, '2 字形 → 2 quad');
  t.eq(q.indices.length, 2 * 6, '索引数 = count*6');
  t.eq(q.vertices.length, 2 * 4 * 2, '顶点数 = count*4*2');

  // UV 在 [0,1]
  let uvOk = true;
  for (let i = 0; i < q.uvs.length; i++) if (q.uvs[i] < -1e-6 || q.uvs[i] > 1 + 1e-6) uvOk = false;
  t.ok(uvOk, 'UV 在 [0,1]');

  // 第二个字形 x 偏移 = size
  t.near(q.vertices[0], 0, 1e-6, '首字 x=0');
  t.near(q.vertices[8], 16, 1e-6, '次字 x=size');

  // 颜色逐顶点写入
  t.eq(q.colors[3], 1, '默认白色 alpha=1');

  // sprite 单 quad
  const sp = makeSpriteQuad({ x0: 0, y0: 0, x1: 10, y1: 20 });
  t.eq(sp.count, 1, 'sprite 单 quad');
  t.eq(sp.indices.length, 6, 'sprite 6 索引');
  t.near(sp.uvs[0], 0, 1e-6, 'sprite 默认 UV 左下 0');
}
