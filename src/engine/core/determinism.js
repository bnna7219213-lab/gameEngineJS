// 确定性：Q16.16 定点、FNV-1a 哈希、输入录制/回放（保证相同输入→相同输出）。
export function toQ16(x) { return Math.round(x * 65536); }
export function fromQ16(q) { return q / 65536; }

export function fnv1a(str) {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

export function hashU32(a) {
  a |= 0; a = (a + 0x9e3779b9) | 0;
  let t = Math.imul(a ^ Math.imul(a >>> 16, 0x45d9f3b), 0x45d9f3b);
  t = Math.imul(t ^ (t >>> 16), 0x45d9f3b);
  return (t ^ (t >>> 16)) >>> 0;
}

export function hashFloat(x) { return hashU32(Math.fround(x) >>> 0); }
export function hashVec3(x, y, z) { return (hashU32(Math.fround(x) >>> 0) ^ Math.imul(hashU32(Math.fround(y) >>> 0), 0x85ebca6b) ^ Math.imul(hashU32(Math.fround(z) >>> 0), 0xc2b2ae35)) >>> 0; }

export class InputRecorder {
  constructor() { this.frames = []; }
  record(frame) { this.frames.push(Array.isArray(frame) ? frame.slice() : frame); }
  get count() { return this.frames.length; }
  toJSON() { return this.frames; }
}

export class InputPlayer {
  constructor(frames) { this.frames = frames || []; this.i = 0; }
  next() { return this.frames[this.i++]; }
  get done() { return this.i >= this.frames.length; }
  reset() { this.i = 0; }
}
