// 原型（Archetype）ECS：按组件签名分块存储，查询为 O(chunk)。
export class ArchetypeECS {
  constructor() { this.archetypes = new Map(); this.entities = new Map(); this.next = 1; }
  _sig(names) { return names.slice().sort().join(','); }
  create(names, data = {}) {
    const sig = this._sig(names); let arch = this.archetypes.get(sig);
    if (!arch) { arch = { sig, entities: [], store: {} }; for (const n of names) arch.store[n] = []; this.archetypes.set(sig, arch); }
    const id = this.next++; arch.entities.push(id);
    for (const n of names) arch.store[n].push(data[n]);
    this.entities.set(id, { sig, index: arch.entities.length - 1 });
    return id;
  }
  get(id, name) { const e = this.entities.get(id); if (!e) return undefined; const arch = this.archetypes.get(e.sig); return arch.store[name][e.index]; }
  set(id, name, value) { const e = this.entities.get(id); if (!e) return; const arch = this.archetypes.get(e.sig); if (arch.store[name]) arch.store[name][e.index] = value; }
  query(...names) {
    const want = names;
    const out = [];
    for (const arch of this.archetypes.values()) {
      if (!arch._set) arch._set = new Set(arch.sig.split(','));
      let ok = true;
      for (const n of want) if (!arch._set.has(n)) { ok = false; break; }
      if (ok) for (const id of arch.entities) out.push(id);
    }
    return out;
  }
  count() { return this.entities.size; }
}
