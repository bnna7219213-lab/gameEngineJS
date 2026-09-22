// 文字 / 精灵（P4）：文本排版 → 顶点/UV（供实例化或批量 quad 渲染）。
// 图集复用 P3.3 的 packAtlas 思路；浏览器侧可用 canvas 2D 把字形栅格化进图集，
// Node 侧用程序化 ASCII 图集（空白格，足以验证排版/UV 数学，红线 D：几何与 UV 与后端无关）。
// Sprite = 单张纹理 quad，复用同一 buildQuads 路径（见 makeSpriteQuad）。

// 程序化 ASCII 图集：把可打印 ASCII(32..126) 排进网格，每格 cell×cell。返回 font 描述。
export function makeAsciiAtlas({ cell = 16, cols = 16 } = {}) {
  const first = 32, last = 126, count = last - first + 1;
  const rows = Math.ceil(count / cols);
  const width = cols * cell, height = rows * cell;
  const glyphs = new Map();
  for (let i = 0; i < count; i++) {
    const ch = String.fromCharCode(first + i);
    const gx = (i % cols) * cell, gy = ((i / cols) | 0) * cell;
    glyphs.set(ch, { u0: gx / width, v0: gy / height, u1: (gx + cell) / width, v1: (gy + cell) / height, w: cell, h: cell, advance: cell });
  }
  return { atlas: { width, height, glyphs, cell }, size: cell, cellAspect: 1 };
}

// 浏览器侧：把字形用 canvas 2D 真实栅格化进一个离屏 canvas 并返回 ImageData/纹理数据。
// （Node 侧不需要；仅类型契约说明：返回 {width,height,rgba}）
export function rasterizeFontCanvas(font, ctx, { fontSize = 16, fontFamily = 'monospace' } = {}) {
  const a = font.atlas;
  ctx.clearRect(0, 0, a.width, a.height);
  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#fff';
  for (const [ch, g] of a.glyphs) ctx.fillText(ch, g.u0 * a.width, g.v0 * a.height);
  return ctx.getImageData(0, 0, a.width, a.height);
}

// 测量文本宽度（pen 前进量），按每字形 advance 累计；未知字形按 cell 宽。
export function measureText(text, font) {
  let w = 0;
  for (const ch of text) { const g = font.atlas.glyphs.get(ch); w += g ? g.advance : font.size; }
  return w;
}

// 构建文本 quad 网格：每字形 4 顶点 + 6 索引。返回 { vertices, uvs, indices, count, width }。
// vertices: Float32Array(count*4*2)，NDC-ish 像素坐标（左上原点，x 右 y 下）；
// uvs: Float32Array(count*4*2)；indices: Uint16Array(count*6)。
export function buildTextQuads(text, font, { x = 0, y = 0, size = 16, color = [1, 1, 1, 1] } = {}) {
  const glyphs = font.atlas.glyphs;
  const quads = [];
  let penX = x;
  for (const ch of text) {
    const g = glyphs.get(ch);
    if (!g) { penX += font.size; continue; }
    const s = size * font.cellAspect || size;
    const x0 = penX, y0 = y, x1 = penX + s, y1 = y + s;
    quads.push({ x0, y0, x1, y1, u0: g.u0, v0: g.v0, u1: g.u1, v1: g.v1, color });
    penX += g.advance * (size / font.size);
  }
  const n = quads.length;
  const vertices = new Float32Array(n * 4 * 2);
  const uvs = new Float32Array(n * 4 * 2);
  const colors = new Float32Array(n * 4 * 4);
  const indices = new Uint16Array(n * 6);
  for (let q = 0; q < n; q++) {
    const qd = quads[q], vi = q * 4, ii = q * 6;
    // 顶点顺序：TL, TR, BR, BL
    vertices.set([qd.x0, qd.y0, qd.x1, qd.y0, qd.x1, qd.y1, qd.x0, qd.y1], vi * 2);
    uvs.set([qd.u0, qd.v0, qd.u1, qd.v0, qd.u1, qd.v1, qd.u0, qd.v1], vi * 2);
    for (let k = 0; k < 4; k++) colors.set(qd.color, (vi + k) * 4);
    indices[ii] = vi; indices[ii + 1] = vi + 1; indices[ii + 2] = vi + 2;
    indices[ii + 3] = vi; indices[ii + 4] = vi + 2; indices[ii + 5] = vi + 3;
  }
  return { vertices, uvs, colors, indices, count: n, width: penX - x };
}

// 单张 sprite（纹理 quad）：给定四边形像素矩形 + UV 矩形 → 与 buildTextQuads 同结构。
export function makeSpriteQuad({ x0, y0, x1, y1, u0 = 0, v0 = 0, u1 = 1, v1 = 1, color = [1, 1, 1, 1] }) {
  const vertices = new Float32Array(8), uvs = new Float32Array(8), colors = new Float32Array(16), indices = new Uint16Array(6);
  vertices.set([x0, y0, x1, y0, x1, y1, x0, y1]);
  uvs.set([u0, v0, u1, v0, u1, v1, u0, v1]);
  for (let k = 0; k < 4; k++) colors.set(color, k * 4);
  indices.set([0, 1, 2, 0, 2, 3]);
  return { vertices, uvs, colors, indices, count: 1, width: x1 - x0 };
}
