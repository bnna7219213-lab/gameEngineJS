// 热重载：watch → 变更队列 → 去抖 → 回调。Node 用 fs.watch，浏览器用轮询；poll() 手动驱动（便于 smoke）。
export class HotReloader {
  constructor(opts = {}) {
    this.debounceMs = opts.debounceMs || 120;
    this.watchPaths = new Set();
    this.callbacks = new Map();
    this.queue = [];
    this._timers = new Map();
    this._watchers = [];
    this._fs = null;
  }
  watch(path, cb) {
    this.watchPaths.add(path);
    this.callbacks.set(path, cb);
    this._startWatch(path);
  }
  async _startWatch(path) {
    if (this._fs === null) { try { this._fs = await import('node:fs'); } catch (e) { this._fs = false; } }
    if (!this._fs) return; // 浏览器：轮询由调用方触发 notifyChange
    try {
      const w = this._fs.watch(path, () => this.notifyChange(path));
      this._watchers.push(w);
    } catch (e) { /* 目录不存在等 */ }
  }
  notifyChange(path) {
    this.queue.push(path);
    if (this._timers.has(path)) clearTimeout(this._timers.get(path));
    this._timers.set(path, setTimeout(() => {
      this._timers.delete(path);
      const cb = this.callbacks.get(path);
      if (cb) cb(path);
    }, this.debounceMs));
  }
  poll() {
    const q = this.queue; this.queue = [];
    for (const p of q) { const cb = this.callbacks.get(p); if (cb) cb(p); }
    return q;
  }
  stop() { for (const w of this._watchers) try { w.close(); } catch (e) {} }
}
