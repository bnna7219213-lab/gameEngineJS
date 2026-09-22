// 测试辅助：构造最小 GLB。无 run 导出，run_smoke 会自动 SKIP，但可被其他 smoke import。
export function buildGLB(json, bin) {
  const enc = new TextEncoder();
  let jb = enc.encode(JSON.stringify(json));
  const jpad = (4 - (jb.length % 4)) % 4;
  const jChunk = new Uint8Array(jb.length + jpad); jChunk.set(jb); jChunk.set(new Uint8Array(jpad).fill(0x20), jb.length);
  const bpad = (4 - (bin.byteLength % 4)) % 4;
  const bChunk = new Uint8Array(bin.byteLength + bpad); bChunk.set(new Uint8Array(bin), 0); bChunk.set(new Uint8Array(bpad), bin.byteLength);
  const total = 12 + 8 + jChunk.length + 8 + bChunk.length;
  const ab = new ArrayBuffer(total); const dv = new DataView(ab);
  dv.setUint32(0, 0x46546C67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  let off = 12;
  dv.setUint32(off, jChunk.length, true); dv.setUint32(off + 4, 0x4E4F534A, true); new Uint8Array(ab, off + 8, jChunk.length).set(jChunk); off += 8 + jChunk.length;
  dv.setUint32(off, bChunk.length, true); dv.setUint32(off + 4, 0x004E4942, true); new Uint8Array(ab, off + 8, bChunk.length).set(bChunk); off += 8 + bChunk.length;
  return ab;
}
