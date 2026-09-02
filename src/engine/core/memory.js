// 分层内存：Arena（bump）+ Pool（对象池）+ Stack（临时）。纯 JS，无 GC 压力路径。
export class Arena {
  constructor(size = 1 << 20) {
    this.buf = new ArrayBuffer(size);
    this.u8 = new Uint8Array(this.buf);
    this.off = 0;
    this.peak = 0;
  }
  alloc(n) {
    const a = (this.off + 15) & ~15;
    if (a + n > this.buf.byteLength) throw new Error('Arena OOM');
    this.off = a + n;
    if (this.off > this.peak) this.peak = this.off;
    return a;
  }
  reset() { this.off = 0; }
  get used() { return this.off; }
  get capacity() { return this.buf.byteLength; }
}

export class Pool {
  constructor(factory) {
    this.factory = factory;
    this.free = [];
    this.active = new Set();
  }
  obtain() {
    const o = this.free.pop() || this.factory();
    this.active.add(o);
    return o;
  }
  release(o) {
    if (this.active.delete(o)) this.free.push(o);
  }
  get stats() { return { active: this.active.size, free: this.free.length }; }
}

export class Stack {
  constructor() { this.items = []; }
  push(x) { this.items.push(x); }
  pop() { return this.items.pop(); }
  peek() { return this.items[this.items.length - 1]; }
  get size() { return this.items.length; }
  clear() { this.items.length = 0; }
}
