// ECS：组件按名存储 + 多组件查询。
export class ECS {
  constructor() { this.entities = new Map(); this.next = 1; this.components = new Map(); }
  createEntity() { const id = this.next++; this.entities.set(id, new Set()); return id; }
  add(id, name, data) {
    if (!this.components.has(name)) this.components.set(name, new Map());
    this.components.get(name).set(id, data);
    if (this.entities.has(id)) this.entities.get(id).add(name);
    return id;
  }
  get(id, name) { const m = this.components.get(name); return m ? m.get(id) : undefined; }
  has(id, name) { const m = this.components.get(name); return m ? m.has(id) : false; }
  remove(id) { this.entities.delete(id); for (const m of this.components.values()) m.delete(id); }
  query(...names) {
    let best = null;
    for (const n of names) { const m = this.components.get(n); if (!m || m.size === 0) return []; if (!best || m.size < best.size) best = m; }
    const out = [];
    for (const id of best.keys()) if (names.every(n => this.components.get(n).has(id))) out.push(id);
    return out;
  }
}
