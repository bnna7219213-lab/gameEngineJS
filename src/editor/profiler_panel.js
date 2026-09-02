// Profiler 展开面板（P5#7 集成）：把 Profiler 的快照转为结构化报告 + 可选 HTML 渲染。
// buildReport 为纯函数（DOM-free），可在 Node 单测；renderReportHTML 仅做静态渲染，无副作用。
import { Profiler } from './profiler.js';

// 纯函数：Profiler 快照 → 结构化报告（分段计时排序、计数器、内存）
export function buildReport(snap, opts = {}) {
  const last = snap.history.length ? snap.history[snap.history.length - 1] : null;
  const segs = last ? last.segs : {};
  const counts = last ? last.counts : {};
  const segRows = Object.keys(segs).map(k => ({ name: k, ms: segs[k] }));
  segRows.sort((a, b) => b.ms - a.ms);
  const maxSeg = segRows.length ? Math.max(...segRows.map(r => r.ms)) : 1;
  return {
    fps: snap.fps,
    lastFrameMs: snap.lastFrameMs,
    totalFrames: snap.totalFrames,
    segments: segRows,
    maxSegmentMs: maxSeg,
    counters: Object.keys(counts).map(k => ({ name: k, value: counts[k] })),
    memory: snap.memory,
  };
}

// 生成可折叠的 HTML（浏览器侧渲染；纯渲染，无副作用）
export function renderReportHTML(report) {
  const segBars = report.segments.map(r => {
    const pct = Math.max(1, Math.round((r.ms / report.maxSegmentMs) * 100));
    return `<div class="pf-row"><span class="pf-name">${esc(r.name)}</span><span class="pf-bar"><i style="width:${pct}%"></i></span><span class="pf-val">${r.ms.toFixed(2)}ms</span></div>`;
  }).join('');
  const counters = report.counters.map(c => `<div class="pf-row"><span class="pf-name">${esc(c.name)}</span><span class="pf-val">${c.value}</span></div>`).join('');
  const mem = report.memory
    ? `<div class="pf-mem">内存 ${(report.memory.usedJSHeapSize / 1048576).toFixed(1)}/${(report.memory.jsHeapSizeLimit / 1048576).toFixed(0)} MB</div>`
    : `<div class="pf-mem">内存 不可用（非 Chromium）</div>`;
  return `<div class="pf"><div class="pf-head">FPS ${report.fps} · ${report.lastFrameMs.toFixed(2)}ms · 帧${report.totalFrames}</div>${segBars}${counters}${mem}</div>`;
}

// ---- Profiler 时间线可视化（P5#7 深化） ----
// 纯函数：从历史帧提取时间线样本（帧耗时 + 派生 fps）。DOM-free，可 Node 单测。
export function buildTimelineData(profiler, opts = {}) {
  const hist = (profiler && Array.isArray(profiler.history)) ? profiler.history : [];
  const maxFrames = opts.maxFrames || 120;
  const frames = hist.slice(-maxFrames).map(h => {
    const ms = +h.ms || 0;
    return { ms, fps: ms > 0 ? +(1000 / ms).toFixed(1) : 0 };
  });
  const msVals = frames.map(f => f.ms);
  const fpsVals = frames.map(f => f.fps);
  const avg = ms => (ms.length ? ms.reduce((a, b) => a + b, 0) / ms.length : 0);
  return {
    frames,
    count: frames.length,
    maxMs: msVals.length ? Math.max(...msVals) : 0,
    avgMs: +avg(msVals).toFixed(3),
    fpsMin: fpsVals.length ? Math.min(...fpsVals) : 0,
    fpsMax: fpsVals.length ? Math.max(...fpsVals) : 0,
  };
}

// 时间线 SVG：帧耗时折线 + fps 参考线（满帧 60 / 30 阈值）。返回 SVG 字符串，无副作用。
export function renderTimelineSVG(data, opts = {}) {
  const w = opts.width || 220; const h = opts.height || 70; const pad = 2;
  const n = data.frames.length;
  if (n === 0) return `<svg class="pf-tl" width="${w}" height="${h}"></svg>`;
  const maxMs = Math.max(16, data.maxMs); // 至少以 16ms(60fps) 为基准，便于观察掉帧
  const x = i => pad + (n === 1 ? 0 : (i / (n - 1)) * (w - 2 * pad));
  const y = ms => h - pad - (ms / maxMs) * (h - 2 * pad);
  const pts = data.frames.map((f, i) => `${x(i).toFixed(1)},${y(f.ms).toFixed(1)}`).join(' ');
  // fps 参考线（60fps=16.67ms, 30fps=33.33ms）
  const y60 = y(1000 / 60), y30 = y(1000 / 30);
  return `<svg class="pf-tl" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<line x1="${pad}" y1="${y60.toFixed(1)}" x2="${w - pad}" y2="${y60.toFixed(1)}" stroke="#3a6" stroke-dasharray="2 2"/>` +
    `<line x1="${pad}" y1="${y30.toFixed(1)}" x2="${w - pad}" y2="${y30.toFixed(1)}" stroke="#a33" stroke-dasharray="2 2"/>` +
    `<polyline fill="none" stroke="#5cf" stroke-width="1" points="${pts}"/>` +
    `</svg>`;
}

function esc(s) { return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

// 面板：持有 Profiler，提供与渲染循环对齐的计时接口，并驱动 DOM 更新。
export class ProfilerPanel {
  constructor(el) {
    this.el = el || null;
    this.profiler = new Profiler();
  }
  beginFrame() { this.profiler.beginFrame(); }
  timed(name, fn) { return this.profiler.timed(name, fn); }
  count(name, n) { this.profiler.count(name, n); }
  endFrame() { return this.profiler.endFrame(); }
  update() {
    if (!this.el) return;
    const report = renderReportHTML(buildReport(this.profiler.snapshot()));
    const tl = `<div class="pf-tl-wrap"><div class="pf-sub">帧时间线 (最近 ${Math.min(this.profiler.history.length, this.profiler.historySize)} 帧)</div>${renderTimelineSVG(buildTimelineData(this.profiler))}</div>`;
    this.el.innerHTML = report + tl;
  }
}
