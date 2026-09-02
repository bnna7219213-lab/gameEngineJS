export const name = 'profiler-timeline';
import { Profiler } from '../../src/editor/profiler.js';
import { buildTimelineData, renderTimelineSVG } from '../../src/editor/profiler_panel.js';

export async function run(t) {
  const p = new Profiler();
  // 模拟 5 帧，帧耗时递增（便于看到折线变化）
  for (let i = 1; i <= 5; i++) { p.beginFrame(); p.endFrame(); }
  // 手动把历史帧 ms 设为已知值（绕过真实计时），确保可视化数据可断言
  p.history = [
    { ms: 10, segs: {}, counts: {} },
    { ms: 16, segs: {}, counts: {} },
    { ms: 33, segs: {}, counts: {} },
    { ms: 50, segs: {}, counts: {} },
    { ms: 8, segs: {}, counts: {} },
  ];

  const data = buildTimelineData(p, { maxFrames: 120 });
  t.eq(data.count, 5, '时间线含 5 帧');
  t.eq(data.maxMs, 50, 'maxMs 取最大帧耗时');
  t.ok(data.avgMs > 0, 'avgMs 有效');
  // fps 派生：10ms→100, 50ms→20
  const fpsFor10 = data.frames.find(f => f.ms === 10).fps;
  t.eq(fpsFor10, 100, '10ms 帧派生 100fps');
  const fpsFor50 = data.frames.find(f => f.ms === 50).fps;
  t.eq(fpsFor50, 20, '50ms 帧派生 20fps');
  t.eq(data.fpsMax, 125, 'fpsMax=125 (8ms 帧)');
  t.eq(data.fpsMin, 20, 'fpsMin=20 (50ms 帧)');

  // 空历史
  const empty = buildTimelineData(new Profiler());
  t.eq(empty.count, 0, '空历史 count=0');

  // SVG 渲染：含 polyline 与两条参考线
  const svg = renderTimelineSVG(data);
  t.ok(svg.includes('<polyline'), 'SVG 含帧折线');
  t.ok(svg.includes('<line'), 'SVG 含参考线');
  t.ok(svg.includes('class="pf-tl"'), 'SVG 带 pf-tl 类');
  const emptySvg = renderTimelineSVG(empty);
  t.ok(emptySvg.includes('<svg'), '空数据也产出 svg 元素');
}
