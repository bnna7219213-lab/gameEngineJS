// 资源缓存：引用计数 + 异步 load/unload + LRU 逐出 + 状态机（unloaded/loading/ready/error）+ 错误可读。
export class ResourceCache {
  constructor(loader, opts = {}) {
    this.loader = loader;             // (key) => value | Promise<value>
    this.capacity = opts.capacity || 64;
    this.entries = new Map();
    this.stats = { loaded: 0, unloaded: 0, evicted: 0, errors: 0 };
  }
  async load(key) {
    let e = this.entries.get(key);
    if (e) {
      e.refs++;
      if (e.state === 'ready') return e.value;
      if (e.state === 'error') { e.error.message = (e.error.message || '') + ' [reload]'; throw e.error; }
      if (e.state === 'loading') return e.promise;
    }
    e = { state: 'loading', refs: 1, value: null, error: null, promise: null, last: Date.now() };
    this.entries.set(key, e);
    e.promise = Promise.resolve(this.loader(key)).then(v => { e.value = v; e.state = 'ready'; this.stats.loaded++; return v; })
      .catch(err => { e.state = 'error'; e.error = err; this.stats.errors++; throw err; });
    return e.promise;
  }
  unload(key) {
    const e = this.entries.get(key); if (!e) return;
    e.refs--;
    if (e.refs <= 0) { this.entries.delete(key); this.stats.unloaded++; }
  }
  get(key) { return this.entries.get(key); }
  state(key) { const e = this.entries.get(key); return e ? e.state : 'unloaded'; }
  tickLRU() {
    if (this.entries.size <= this.capacity) return;
    const arr = [...this.entries.entries()].sort((a, b) => (a[1].last || 0) - (b[1].last || 0));
    let over = arr.length - this.capacity;
    for (const [k, e] of arr) { if (over <= 0) break; if (e.refs <= 0) { this.entries.delete(k); this.stats.evicted++; over--; } }
  }
  stats() { return { ...this.stats, size: this.entries.size, capacity: this.capacity }; }
}
