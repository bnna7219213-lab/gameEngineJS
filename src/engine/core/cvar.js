// 控制台变量：注册表 + 数值 clamp + 变更回调 + 自动补全。
export class CVar {
  constructor(name, value, opts = {}) {
    this.name = name;
    this.value = value;
    this.type = opts.type || typeof value;
    this.help = opts.help || '';
    this.min = opts.min; this.max = opts.max;
    this.onChange = opts.onChange || null;
  }
  set(v) {
    if (this.type === 'number') {
      v = Number(v);
      if (typeof this.min === 'number' && v < this.min) v = this.min;
      if (typeof this.max === 'number' && v > this.max) v = this.max;
    }
    if (v === this.value) return;
    const old = this.value; this.value = v;
    if (this.onChange) this.onChange(v, old);
  }
  get() { return this.value; }
}

export class CVarRegistry {
  constructor() { this.vars = new Map(); }
  register(name, value, opts = {}) {
    if (this.vars.has(name)) return this.vars.get(name);
    const c = new CVar(name, value, opts);
    this.vars.set(name, c);
    return c;
  }
  get(name) { const c = this.vars.get(name); return c ? c.get() : undefined; }
  set(name, v) { const c = this.vars.get(name); if (c) c.set(v); }
  has(name) { return this.vars.has(name); }
  list() { return [...this.vars.keys()]; }
  complete(prefix) { return [...this.vars.keys()].filter(k => k.startsWith(prefix)); }
}
