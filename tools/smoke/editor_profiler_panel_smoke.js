export const name = 'editor-profiler-panel';
import { Profiler } from '../../src/editor/profiler.js';
import { buildReport, renderReportHTML, ProfilerPanel } from '../../src/editor/profiler_panel.js';

export async function run(t) {
  const p = new Profiler();
  p.beginFrame();
  p.timed('render', () => {});
  p.count('drawCalls', 7);
  p.count('triangles', 1200);
  p.endFrame();

  const report = buildReport(p.snapshot());
  t.eq(report.totalFrames, 1, '总帧数');
  t.ok(report.segments.some(s => s.name === 'render'), '含 render 分段');
  const seg = report.segments.find(s => s.name === 'render');
  t.ok(report.maxSegmentMs >= seg.ms, 'maxSegmentMs 为分段最大值');
  t.ok(report.counters.some(c => c.name === 'drawCalls' && c.value === 7), 'drawCalls 计数');
  t.ok(report.counters.some(c => c.name === 'triangles' && c.value === 1200), 'triangles 计数');
  if (report.segments.length >= 2) t.ok(report.segments[0].ms >= report.segments[1].ms, '分段按耗时降序');

  const html = renderReportHTML(report);
  t.ok(html.includes('pf-head') && html.includes('FPS'), 'HTML 含头部');
  t.ok(html.includes('render'), 'HTML 含分段名');
  t.ok(html.includes('pf-mem'), 'HTML 含内存行');

  // ProfilerPanel：无 DOM 时不崩
  const panel = new ProfilerPanel(null);
  panel.beginFrame(); panel.timed('x', () => {}); panel.count('c', 1); panel.endFrame(); panel.update();
  t.ok(true, 'ProfilerPanel 无 DOM 时 update 安全');
}
