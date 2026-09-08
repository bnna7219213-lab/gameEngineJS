// 性能分析：CPU 区段 + Chrome Trace 导出。轻量，可在 Node 下运行。
function nowMs() { return (typeof performance !== 'undefined') ? performance.now() : Date.now(); }

export class Profiler {
  constructor() {
    this.zones = new Map();
    this.stack = [];
    this.active = null;
    this.events = [];
  }
  begin(name) {
    const z = this.zones.get(name) || { name, calls: 0, total: 0, max: 0 };
    const s = { z, t: nowMs(), parent: this.active };
    this.stack.push(s);
    this.active = s;
  }
  end() {
    const s = this.stack.pop();
    if (!s) return;
    const dt = nowMs() - s.t;
    s.z.calls++; s.z.total += dt; if (dt > s.z.max) s.z.max = dt;
    this.events.push({ name: s.z.name, dur: dt, ts: s.t });
    this.active = s.parent;
  }
  async scope(name, fn) {
    this.begin(name);
    try { return await fn(); } finally { this.end(); }
  }
  stats() {
    const out = [];
    for (const z of this.zones.values())
      out.push({ name: z.name, calls: z.calls, total: +z.total.toFixed(3), avg: +(z.total / (z.calls || 1)).toFixed(4), max: +z.max.toFixed(3) });
    return out;
  }
  writeTrace() { return this.events.slice(); }
}

export function makeScope(p, name) { return { end: () => p.end() }; }
