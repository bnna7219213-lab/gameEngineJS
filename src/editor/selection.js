// 选择集：编辑器对象选中状态（对应 python/ide 的 selection）。
// DOM-free：纯 Set + 订阅通知。
export class Selection {
  constructor() { this.ids = new Set(); this._subs = []; }
  onChange(fn) { this._subs.push(fn); return () => { this._subs = this._subs.filter(f => f !== fn); }; }
  _emit() { const s = this.get(); for (const fn of this._subs) fn(s); }
  get() { return [...this.ids]; }
  primary() { const a = this.get(); return a.length ? a[a.length - 1] : null; }
  set(id) { this.ids = id == null ? new Set() : new Set([id]); this._emit(); }
  toggle(id) { if (this.ids.has(id)) this.ids.delete(id); else this.ids.add(id); this._emit(); }
  add(id) { this.ids.add(id); this._emit(); }
  clear() { if (this.ids.size) { this.ids.clear(); this._emit(); } }
  has(id) { return this.ids.has(id); }
}
