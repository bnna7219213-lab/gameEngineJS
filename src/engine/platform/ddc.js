// 派生数据缓存：key = 内容哈希 ⊕ 参数哈希（字符串 key），内存 LRU + 持久化钩子 + 统计。
export class DDC {
  constructor(opts = {}) {
    this.capacity = opts.capacity || 256;
    this.map = new Map(); // 插入顺序即 LRU
    this._stats = { hit: 0, miss: 0, evict: 0, put: 0 };
    this.persist = opts.persist || null; // 可选 {set(key,value),get(key),keys()}
  }
  get(key) {
    if (this.map.has(key)) {
      const v = this.map.get(key);
      this.map.delete(key); this.map.set(key, v); // 提到最近
      this._stats.hit++;
      return v;
    }
    this._stats.miss++;
    if (this.persist) { const v = this.persist.get(key); if (v) { this.map.set(key, v); return v; } }
    return null;
  }
  put(key, value) {
    if (this.map.size >= this.capacity && !this.map.has(key)) {
      const fk = this.map.keys().next().value;
      this.map.delete(fk); this._stats.evict++;
    }
    this.map.set(key, value);
    this._stats.put++;
    if (this.persist) this.persist.set(key, value);
  }
  invalidate(key) { this.map.delete(key); if (this.persist) this.persist.delete(key); }
  stats() { return { ...this._stats, size: this.map.size, capacity: this.capacity }; }
}
