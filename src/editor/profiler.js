// Profiler（P5#7）：帧时间线 + 分段计时 + 计数器（draw call / 三角形）+ 内存采样 + JSON 导出。
// 与 PerfHud 互补：PerfHud 负责 HUD 文本，Profiler 负责可展开剖析面板与帧时间线数据。
// 设计为浏览器与 Node 双可运行；performance.memory 不可用时安全降级为 null（红线 E：缺能力优雅降级）。
//
// 用法：
//   const p = new Profiler();
//   p.beginFrame();
//   p.timed('physics', () => stepPhysics());
//   p.count('drawCalls', n); p.count('triangles', tris);
//   p.timed('render', () => render());
//   p.endFrame();
//   console.log(p.snapshot());
export class Profiler {
  constructor(opts = {}) {
    this.historySize = opts.historySize || 120; // 帧时间线保留最近 N 帧
    this.enabled = opts.enabled !== false;
    this.segments = new Map();   // 当前帧分段累计（name -> ms）
    this.counters = new Map();   // 计数器累计（name -> number）
    this.history = [];           // 每帧快照 { ms, segs, counts }
    this._open = new Map();      // 进行中的分段 name -> startMs
    this._frameStart = 0;
    this.totalFrames = 0;
    this.fps = 0; this._fpsAcc = 0; this._fpsFrames = 0;
  }

  beginFrame() {
    if (!this.enabled) return;
    this.segments.clear(); this.counters.clear(); this._open.clear();
    this._frameStart = _now();
  }

  // 分段计时：同名多次 begin/end 累计，不同名并行独立累计
  begin(name) { if (this.enabled) this._open.set(name, _now()); }
  end(name) {
    if (!this.enabled) return;
    const s = this._open.get(name); if (s == null) return;
    this.segments.set(name, (this.segments.get(name) || 0) + (_now() - s));
    this._open.delete(name);
  }
  // 便捷包裹：const r = p.timed('render', () => render());
  timed(name, fn) {
    if (!this.enabled) return fn();
    this.begin(name); const r = fn(); this.end(name); return r;
  }

  count(name, n) { if (this.enabled) this.counters.set(name, (this.counters.get(name) || 0) + (n || 1)); }

  // 帧结束：落历史 + 更新 fps
  endFrame() {
    if (!this.enabled) return 0;
    const ms = _now() - this._frameStart;
    const segs = {}; for (const [k, v] of this.segments) segs[k] = _round3(v);
    const counts = {}; for (const [k, v] of this.counters) counts[k] = v;
    this.history.push({ ms: _round3(ms), segs, counts });
    if (this.history.length > this.historySize) this.history.shift();
    this.totalFrames++;
    this._fpsAcc += ms; this._fpsFrames++;
    if (this._fpsAcc >= 500) { this.fps = Math.round(this._fpsFrames * 1000 / this._fpsAcc); this._fpsAcc = 0; this._fpsFrames = 0; }
    return ms;
  }

  // 内存采样：仅 Chromium 暴露 performance.memory；其余返回 null
  memory() {
    const m = (typeof performance !== 'undefined' && performance.memory) ? performance.memory : null;
    if (!m) return null;
    return {
      usedJSHeapSize: m.usedJSHeapSize,
      totalJSHeapSize: m.totalJSHeapSize,
      jsHeapSizeLimit: m.jsHeapSizeLimit,
    };
  }

  // 最近一帧汇总（供 HUD 实时显示）
  frame() {
    const last = this.history[this.history.length - 1];
    return {
      ms: last ? last.ms : 0,
      segs: last ? last.segs : {},
      counts: last ? last.counts : {},
      fps: this.fps,
      backend: undefined,
      totalFrames: this.totalFrames,
    };
  }

  // 可序列化诊断快照（供剖析面板 / CI 导出）
  snapshot() {
    const last = this.history[this.history.length - 1];
    return {
      fps: this.fps,
      totalFrames: this.totalFrames,
      lastFrameMs: last ? last.ms : 0,
      historyLen: this.history.length,
      memory: this.memory(),
      lastCounts: last ? last.counts : {},
      history: this.history.slice(-this.historySize),
    };
  }

  exportJSON() { return JSON.stringify(this.snapshot()); }
}

function _now() {
  return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
}
function _round3(x) { return Math.round(x * 1000) / 1000; }
