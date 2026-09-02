// 资产管线：OBJ 解析、meshlet 构建、ZTC 4x4 压缩、BC7 参考编码器、二进制容器 + 校验和、compile。
import { fnv1a } from '../core/determinism.js';
import { Rng_ } from '../infer/tensor.js';

const TEX_MAGIC = 0x54455831; // 'TEX1'
const MSH_MAGIC = 0x4d534831; // 'MSH1'

// ---- OBJ 解析（含负数索引与四边形三角化）----
export function parseOBJ(text) {
  const v = [], vn = [], vt = [];
  const outP = [], outN = [], outT = [], indices = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line[0] === '#') continue;
    const sp = line.split(/\s+/);
    if (sp[0] === 'v') v.push([+sp[1], +sp[2], +sp[3]]);
    else if (sp[0] === 'vn') vn.push([+sp[1], +sp[2], +sp[3]]);
    else if (sp[0] === 'vt') vt.push([+sp[1], +sp[2]]);
    else if (sp[0] === 'f') {
      const verts = [];
      for (let i = 1; i < sp.length; i++) {
        const parts = sp[i].split('/');
        const vi = parseInt(parts[0], 10);
        const ti = parts[1] ? parseInt(parts[1], 10) : 0;
        const ni = parts[2] ? parseInt(parts[2], 10) : 0;
        const vp = vi < 0 ? v[v.length + vi] : v[vi - 1];
        const tp = ti ? (vt[ti - 1] || [0, 0]) : [0, 0];
        const np = ni ? (vn[ni - 1] || [0, 0, 1]) : [0, 0, 1];
        outP.push(vp[0], vp[1], vp[2]);
        outT.push(tp[0], tp[1]);
        outN.push(np[0], np[1], np[2]);
        verts.push(outP.length / 3 - 1);
      }
      for (let i = 1; i < verts.length - 1; i++) indices.push(verts[0], verts[i], verts[i + 1]);
    }
  }
  return {
    positions: new Float32Array(outP), normals: new Float32Array(outN), uvs: new Float32Array(outT),
    indices: new Uint32Array(indices), vertexCount: outP.length / 3, indexCount: indices.length,
  };
}

// ---- meshlet 构建（简单按 64 顶点 / 124 图元切片）----
export function buildMeshlets(mesh, { maxVerts = 64, maxPrims = 124 } = {}) {
  const idx = mesh.indices || new Uint32Array(0);
  const meshlets = [];
  let unique = [], remap = new Map(), prim = 0;
  for (let i = 0; i < idx.length; i += 3) {
    const tri = [idx[i], idx[i + 1], idx[i + 2]];
    for (const x of tri) { if (!remap.has(x)) { remap.set(x, unique.length); unique.push(x); } }
    prim++;
    const flush = unique.length >= maxVerts || prim >= maxPrims || i + 3 >= idx.length;
    if (flush) {
      const local = tri.map(x => remap.get(x));
      meshlets.push({ vertices: unique.slice(), indices: local.slice(), primCount: Math.ceil(local.length / 3) });
      unique = []; remap = new Map(); prim = 0;
    }
  }
  return meshlets;
}

// ---- ZTC 4x4：端点(min/max RGBA8) + 2bit 索引（4 个量化等级），块 12 字节 ----
export function compressZTC4x4(rgba, w, h) {
  const bw = Math.ceil(w / 4), bh = Math.ceil(h / 4);
  const out = new Uint8Array(bw * bh * 12);
  let o = 0;
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    const px = [];
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const gx = Math.min(w - 1, bx * 4 + x), gy = Math.min(h - 1, by * 4 + y);
      const i = (gy * w + gx) * 4; px.push([rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]]);
    }
    const mins = [255, 255, 255, 255], maxs = [0, 0, 0, 0];
    for (const p of px) for (let c = 0; c < 4; c++) { mins[c] = Math.min(mins[c], p[c]); maxs[c] = Math.max(maxs[c], p[c]); }
    for (let c = 0; c < 4; c++) out[o + c] = mins[c];
    for (let c = 0; c < 4; c++) out[o + 4 + c] = maxs[c];
    o += 8;
    let bitbuf = 0, bits = 0;
    for (const p of px) {
      let best = 0, bd = Infinity;
      for (let l = 0; l < 4; l++) {
        const f = l / 3; let d = 0;
        for (let c = 0; c < 4; c++) { const val = mins[c] + (maxs[c] - mins[c]) * f; d += (p[c] - val) ** 2; }
        if (d < bd) { bd = d; best = l; }
      }
      bitbuf |= best << bits; bits += 2;
      if (bits >= 8) { out[o++] = bitbuf & 0xff; bitbuf >>= 8; bits -= 8; }
    }
    if (bits > 0) out[o++] = bitbuf & 0xff;
  }
  return { data: out, w: bw, h: bh };
}

export function decompressZTC4x4(comp, bw, bh, w, h) {
  if (comp && comp.data) comp = comp.data;
  const out = new Uint8Array(w * h * 4);
  let o = 0;
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    const mins = [comp[o], comp[o + 1], comp[o + 2], comp[o + 3]];
    const maxs = [comp[o + 4], comp[o + 5], comp[o + 6], comp[o + 7]];
    o += 8;
    const idxBytes = [comp[o], comp[o + 1], comp[o + 2], comp[o + 3]]; o += 4;
    let bitbuf = 0, bits = 0, ptr = 0;
    const nib = () => { if (bits < 2) { bitbuf |= (idxBytes[ptr++] || 0) << bits; bits += 8; } const v = bitbuf & 3; bitbuf >>= 2; bits -= 2; return v; };
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const gx = bx * 4 + x, gy = by * 4 + y; if (gx >= w || gy >= h) { nib(); continue; }
      const f = nib() / 3, pi = (gy * w + gx) * 4;
      for (let c = 0; c < 4; c++) out[pi + c] = mins[c] + (maxs[c] - mins[c]) * f;
    }
  }
  return out;
}

// ---- BC7 参考编码器（mode 6：端点 RGBA8 + 16×4bit 索引；块 17 字节）----
export function encodeBC7(rgba, w, h) {
  const bw = Math.ceil(w / 4), bh = Math.ceil(h / 4);
  const out = new Uint8Array(bw * bh * 17);
  let o = 0;
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    const px = [];
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const gx = Math.min(w - 1, bx * 4 + x), gy = Math.min(h - 1, by * 4 + y);
      const i = (gy * w + gx) * 4; px.push([rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]]);
    }
    const mins = [255, 255, 255, 255], maxs = [0, 0, 0, 0];
    for (const p of px) for (let c = 0; c < 4; c++) { mins[c] = Math.min(mins[c], p[c]); maxs[c] = Math.max(maxs[c], p[c]); }
    out[o++] = 0x06; // mode 6
    for (let c = 0; c < 4; c++) out[o++] = mins[c];
    for (let c = 0; c < 4; c++) out[o++] = maxs[c];
    let bitbuf = 0, bits = 0;
    for (let i = 0; i < 16; i++) {
      const p = px[i]; let best = 0, bd = Infinity;
      for (let l = 0; l < 16; l++) {
        const f = l / 15; let d = 0;
        for (let c = 0; c < 4; c++) { const val = mins[c] + (maxs[c] - mins[c]) * f; d += (p[c] - val) ** 2; }
        if (d < bd) { bd = d; best = l; }
      }
      bitbuf |= best << bits; bits += 4;
      if (bits >= 8) { out[o++] = bitbuf & 0xff; bitbuf >>= 8; bits -= 8; }
    }
    if (bits > 0) out[o++] = bitbuf & 0xff;
  }
  return { data: out, w: bw, h: bh };
}

export function decodeBC7(comp, bw, bh, w, h) {
  if (comp && comp.data) comp = comp.data;
  const out = new Uint8Array(w * h * 4);
  let o = 0;
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    o++; // mode
    const mins = [comp[o], comp[o + 1], comp[o + 2], comp[o + 3]]; o += 4;
    const maxs = [comp[o], comp[o + 1], comp[o + 2], comp[o + 3]]; o += 4;
    const idxBytes = []; while (idxBytes.length < 8 && o < comp.length) idxBytes.push(comp[o++]);
    let bitbuf = 0, bits = 0, ptr = 0;
    const nib = () => { if (bits < 4) { bitbuf |= (idxBytes[ptr++] || 0) << bits; bits += 8; } const v = bitbuf & 0xf; bitbuf >>= 4; bits -= 4; return v; };
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const gx = bx * 4 + x, gy = by * 4 + y; if (gx >= w || gy >= h) { nib(); continue; }
      const f = nib() / 15, pi = (gy * w + gx) * 4;
      for (let c = 0; c < 4; c++) out[pi + c] = mins[c] + (maxs[c] - mins[c]) * f;
    }
  }
  return out;
}

// ---- 二进制容器（魔数 + 校验和）----
function fnv1aBuf(u8) { let h = 0x811c9dc5 >>> 0; for (let i = 0; i < u8.length; i++) { h ^= u8[i]; h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; }

export function writeMesh(mesh) {
  const pos = new Uint8Array(mesh.positions.buffer, mesh.positions.byteOffset, mesh.positions.byteLength);
  const norm = new Uint8Array(mesh.normals.buffer, mesh.normals.byteOffset, mesh.normals.byteLength);
  const hasUV = !!(mesh.uvs && mesh.uvs.length);
  const uv = hasUV ? new Uint8Array(mesh.uvs.buffer, mesh.uvs.byteOffset, mesh.uvs.byteLength) : new Uint8Array(0);
  const idx = new Uint8Array(mesh.indices.buffer, mesh.indices.byteOffset, mesh.indices.byteLength);
  const meta = new TextEncoder().encode(JSON.stringify({ vn: mesh.vertexCount, in: mesh.indexCount, hasUV }));
  const head = new Uint8Array(12);
  const dv = new DataView(head.buffer);
  dv.setUint32(0, MSH_MAGIC, true);
  dv.setUint32(8, meta.length, true);
  const body = [meta, pos, norm, uv, idx];
  let bodyLen = 0; for (const b of body) bodyLen += b.length;
  const out = new Uint8Array(12 + bodyLen + 4);
  out.set(head, 0); let p = 12; for (const b of body) { out.set(b, p); p += b.length; }
  dv.setUint32(4, fnv1aBuf(out.subarray(8, p)), true); out.set(new Uint8Array(dv.buffer, 4, 4), 4);
  return out;
}
export function readMesh(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, true) !== MSH_MAGIC) throw new Error('readMesh: bad magic');
  const cs = dv.getUint32(4, true);
  const metaLen = dv.getUint32(8, true);
  if (fnv1aBuf(new Uint8Array(buf.buffer, buf.byteOffset + 8, buf.byteLength - 12)) !== cs) throw new Error('readMesh: checksum mismatch');
  const meta = JSON.parse(new TextDecoder().decode(new Uint8Array(buf.buffer, buf.byteOffset + 12, metaLen)));
  let p = 12 + metaLen;
  const pos = new Float32Array(meta.vn * 3); copyF32(buf, p, pos); p += pos.byteLength;
  const norm = new Float32Array(meta.vn * 3); copyF32(buf, p, norm); p += norm.byteLength;
  let uvs = null; if (meta.hasUV) { uvs = new Float32Array(meta.vn * 2); copyF32(buf, p, uvs); p += uvs.byteLength; }
  const idx = new Uint32Array(meta.in); copyU32(buf, p, idx);
  return { positions: pos, normals: norm, uvs, indices: idx, vertexCount: meta.vn, indexCount: meta.in };
}
function copyF32(buf, off, arr) { const dv = new DataView(buf.buffer, buf.byteOffset + off, arr.length * 4); for (let i = 0; i < arr.length; i++) arr[i] = dv.getFloat32(i * 4, true); }
function copyU32(buf, off, arr) { const dv = new DataView(buf.buffer, buf.byteOffset + off, arr.length * 4); for (let i = 0; i < arr.length; i++) arr[i] = dv.getUint32(i * 4, true); }

export function writeTexture(tex) {
  const px = new Uint8Array(tex.rgba.buffer || tex.rgba, tex.rgba.byteOffset, tex.rgba.byteLength);
  const head = new Uint8Array(16);
  const dv = new DataView(head.buffer);
  dv.setUint32(0, TEX_MAGIC, true); dv.setUint32(4, tex.w, true); dv.setUint32(8, tex.h, true); dv.setUint32(12, tex.format || 0, true);
  const out = new Uint8Array(16 + px.length + 4);
  out.set(head, 0); out.set(px, 16);
  dv.setUint32(0, fnv1aBuf(px), true); out.set(new Uint8Array(dv.buffer, 0, 4), 16 + px.length);
  return out;
}
export function readTexture(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, true) !== TEX_MAGIC) throw new Error('readTexture: bad magic');
  const w = dv.getUint32(4, true), h = dv.getUint32(8, true), fmt = dv.getUint32(12, true);
  const px = new Uint8Array(buf.buffer, buf.byteOffset + 16, w * h * 4);
  if (fnv1aBuf(px) !== dv.getUint32(16 + px.length, true)) throw new Error('readTexture: checksum mismatch');
  return { w, h, format: fmt, rgba: px.slice() };
}

// ---- 资产编译（可接入 DDC）----
export function compile(asset, ddc) {
  if (asset.type === 'mesh') {
    const meshlets = buildMeshlets(asset);
    const art = { kind: 'mesh', meshlets: meshlets.length };
    if (ddc) ddc.put('mesh:' + (asset.id || 'x'), art);
    return art;
  }
  if (asset.type === 'texture') {
    const bc7 = encodeBC7(asset.rgba, asset.w, asset.h);
    if (ddc) ddc.put('tex:' + (asset.id || 'x'), { bc7: bc7.data.length });
    return { kind: 'texture', bc7Bytes: bc7.data.length };
  }
  return { kind: asset.type || 'unknown' };
}
