// 虚拟纹理：页表 + LRU 常驻管理 + 按需加载。
export class VirtualTexture {
  constructor(pageSize, capacity) { this.pageSize = pageSize; this.capacity = capacity || 64; this.table = new Map(); this.order = []; }
  request(px, py, loader) {
    const k = px + '_' + py;
    if (this.table.has(k)) { this._touch(k); return { resident: true, data: this.table.get(k), key: k }; }
    if (this.order.length >= this.capacity) { const old = this.order.shift(); this.table.delete(old); }
    const data = loader ? loader(px, py) : null;
    this.table.set(k, data); this.order.push(k);
    return { resident: true, data, key: k };
  }
  _touch(k) { const i = this.order.indexOf(k); if (i > 0) { this.order.splice(i, 1); this.order.push(k); } }
  evict(px, py) { const k = px + '_' + py; this.table.delete(k); const i = this.order.indexOf(k); if (i >= 0) this.order.splice(i, 1); }
  stats() { return { resident: this.table.size, capacity: this.capacity }; }
}
