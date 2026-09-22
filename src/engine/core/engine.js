// Engine：聚合核心子系统（能力探测 / 性能 / 控制台变量）。
import { Capability } from './capability.js';
import { Profiler } from './profiler.js';
import { CVarRegistry } from './cvar.js';

export class Engine {
  constructor(opts = {}) {
    this.cap = new Capability(opts.backend || null);
    this.profiler = new Profiler();
    this.cvars = new CVarRegistry();
    this._t0 = Date.now();
  }
  init() {
    this.cvars.register('r.width', 1280, { type: 'number', min: 1, max: 4096, help: 'render width' });
    this.cvars.register('r.height', 720, { type: 'number', min: 1, max: 4096, help: 'render height' });
    this.cvars.register('r.backend', this.cap.current, { help: 'active backend' });
    this.cap.logSupported();
    return { backend: this.cap.current, available: this.cap.available };
  }
  get backend() { return this.cap.current; }
  dispose() { this.profiler = null; }
}
