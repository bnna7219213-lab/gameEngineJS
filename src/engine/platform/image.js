// 图片/纹理子系统（P3.3）：纯 JS PNG 编解码（Node 端 asset 管线）+ 纹理对象 + Mipmap + Atlas 打包。
// 与现有 asset_pipeline.js 同构（Node 侧工具）：浏览器运行时改用 createImageBitmap + WebGL/RHI 纹理，
// 此处提供可在 smoke 中确定性往返的 PNG 编解码，供烘焙/打包/校验使用。
// 注意：本模块依赖 Node 内置 zlib，仅限 Node 侧 asset 管线使用；浏览器走 createImageBitmap，不引入本文件。
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const zlib = require('zlib');

// ---- CRC32（PNG 用，纯 JS，Node/Browser 通用）----
const _crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
export function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = _crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = data.length;
  const out = new Uint8Array(8 + len + 4);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, len, false);
  out.set(Uint8Array.from(type.split('').map(c => c.charCodeAt(0))), 4);
  out.set(data, 8);
  const crc = crc32(out.subarray(4, 8 + len));
  dv.setUint32(8 + len, crc, false);
  return out;
}

function paeth(a, b, c) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return (pa <= pb && pa <= pc) ? a : (pb <= pc) ? b : c;
}

// 解码 PNG（8-bit、colorType 2/6，非隔行）。返回 {width,height,rgba:Uint8Array}
export function decodePNG(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(0, false) !== 0x89504E47) throw new Error('decodePNG: 非 PNG 签名');
  let off = 8, width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (off < bytes.length) {
    const len = dv.getUint32(off, false); off += 4;
    const type = String.fromCharCode(bytes[off], bytes[off + 1], bytes[off + 2], bytes[off + 3]); off += 4;
    const data = bytes.subarray(off, off + len); off += len + 4; // 跳过 crc
    if (type === 'IHDR') {
      width = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(0, false);
      height = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(4, false);
      bitDepth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
  }
  if (bitDepth !== 8) throw new Error(`decodePNG: 仅支持 8-bit（当前 ${bitDepth}）`);
  if (interlace !== 0) throw new Error('decodePNG: 不支持隔行 PNG');
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 4 ? 2 : colorType === 0 ? 1 : 0;
  if (!channels) throw new Error(`decodePNG: 不支持 colorType ${colorType}`);
  const raw = zlib.inflateSync(concat(idat));
  const stride = width * channels;
  const out = new Uint8Array(width * height * 4);
  const prev = new Uint8Array(stride);
  let rp = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[rp++];
    const cur = new Uint8Array(stride);
    for (let x = 0; x < stride; x++) {
      const rawv = raw[rp++];
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      let v;
      switch (filter) {
        case 0: v = rawv; break;
        case 1: v = rawv + a; break;
        case 2: v = rawv + b; break;
        case 3: v = rawv + ((a + b) >> 1); break;
        case 4: v = rawv + paeth(a, b, c); break;
        default: throw new Error(`decodePNG: 未知过滤器 ${filter}`);
      }
      cur[x] = v & 0xFF;
    }
    for (let px = 0; px < width; px++) {
      const si = px * channels, di = (y * width + px) * 4;
      if (channels === 4) { out[di] = cur[si]; out[di + 1] = cur[si + 1]; out[di + 2] = cur[si + 2]; out[di + 3] = cur[si + 3]; }
      else if (channels === 3) { out[di] = cur[si]; out[di + 1] = cur[si + 1]; out[di + 2] = cur[si + 2]; out[di + 3] = 255; }
      else if (channels === 2) { out[di] = cur[si]; out[di + 1] = cur[si]; out[di + 2] = cur[si]; out[di + 3] = cur[si + 1]; }
      else if (channels === 1) { out[di] = cur[si]; out[di + 1] = cur[si]; out[di + 2] = cur[si]; out[di + 3] = 255; }
    }
    prev.set(cur);
  }
  return { width, height, rgba: out };
}

// 编码 PNG（8-bit RGBA，filter=0）。返回 Uint8Array。
export function encodePNG({ width, height, rgba }) {
  const sig = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width, false); dv.setUint32(4, height, false);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height);
  let p = 0;
  for (let y = 0; y < height; y++) {
    raw[p++] = 0; // filter none
    for (let x = 0; x < stride; x++) raw[p++] = rgba[y * stride + x];
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return concatBytes([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', new Uint8Array(0))]);
}

function concat(chunks) {
  let total = 0; for (const c of chunks) total += c.length;
  const out = new Uint8Array(total); let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}
function concatBytes(arrs) { return concat(arrs); }

// ---- 纹理对象 ----
export class Texture {
  constructor({ width, height, rgba, channels = 4 }) {
    this.width = width; this.height = height; this.channels = channels;
    this.data = rgba instanceof Uint8Array ? rgba : new Uint8Array(rgba);
    this.mipmaps = [{ width, height, data: this.data }];
  }
  // 盒式降采样 Mipmap，直到 1x1
  generateMipmaps() {
    this.mipmaps = [{ width: this.width, height: this.height, data: this.data }];
    let w = this.width, h = this.height, src = this.data;
    while (w > 1 || h > 1) {
      const nw = Math.max(1, w >> 1), nh = Math.max(1, h >> 1);
      const dst = new Uint8Array(nw * nh * 4);
      for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
        const sx = x * 2, sy = y * 2;
        for (let c = 0; c < 4; c++) {
          const s00 = src[(sy * w + sx) * 4 + c];
          const s10 = src[(sy * w + Math.min(sx + 1, w - 1)) * 4 + c];
          const s01 = src[(Math.min(sy + 1, h - 1) * w + sx) * 4 + c];
          const s11 = src[(Math.min(sy + 1, h - 1) * w + Math.min(sx + 1, w - 1)) * 4 + c];
          dst[(y * nw + x) * 4 + c] = (s00 + s10 + s01 + s11 + 2) >> 2;
        }
      }
      this.mipmaps.push({ width: nw, height: nh, data: dst });
      w = nw; h = nh; src = dst;
    }
    return this.mipmaps;
  }
}

// ---- Atlas 打包（shelf/行架算法）----
export function packAtlas(items, { maxWidth = 2048, padding = 0 } = {}) {
  const rects = items.map((it, i) => ({ w: it.w + padding * 2, h: it.h + padding * 2, idx: i }));
  rects.sort((a, b) => b.h - a.h);
  let x = 0, y = 0, rowH = 0, width = 0, height = 0;
  const placed = new Array(items.length);
  for (const r of rects) {
    if (x + r.w > maxWidth) { x = 0; y += rowH; rowH = 0; }
    placed[r.idx] = { x: x + padding, y: y + padding, w: r.w - padding * 2, h: r.h - padding * 2 };
    x += r.w; rowH = Math.max(rowH, r.h); width = Math.max(width, x); height = Math.max(height, y + rowH);
  }
  return { width, height, rects: placed };
}

// 平台无关解码入口：PNG 在 Node 侧走 decodePNG；其余格式浏览器经 createImageBitmap
export function decodeImage(bytes, mimeType = 'image/png') {
  if (mimeType === 'image/png') return decodePNG(bytes);
  throw new Error(`decodeImage: 平台无关解码仅支持 image/png（${mimeType} 请在浏览器用 createImageBitmap）`);
}
