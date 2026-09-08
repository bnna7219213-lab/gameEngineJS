export const name = 'editor-profiler';
import { Profiler } from '../../src/editor/profiler.js';

export async function run(t) {
  const p = new Profiler();
  p.beginFrame();
  p.timed('script', () => { let s = 0; for (let i = 0; i < 1000; i++) s += i; });
  p.count('drawCalls', 3);
  p.count('triangles', 100);
  p.endFrame();

  const fr = p.frame();
  t.ok(fr.ms >= 0, 'frame ms 非负');
  t.eq(fr.counts.drawCalls, 3, 'drawCalls 计数正确');
  t.eq(fr.counts.triangles, 100, 'triangles 计数正确');
  t.ok(fr.segs.script !== undefined, 'script 分段计时存在');

  const snap = p.snapshot();
  t.eq(snap.totalFrames, 1, '总帧数累计');
  t.ok(Array.isArray(snap.history) && snap.history.length === 1, '历史含当前帧');

  // 多帧历史受上限约束
  for (let i = 0; i < 5; i++) { p.beginFrame(); p.timed('r', () => {}); p.endFrame(); }
  t.ok(p.history.length > 1 && p.history.length <= p.historySize, `历史累积且受上限约束 (len=${p.history.length})`);

  // 嵌套/同名分段累计
  const p3 = new Profiler();
  p3.beginFrame();
  p3.begin('a'); p3.begin('b');
  p3.end('b'); p3.end('a');
  p3.begin('a'); p3.end('a');
  p3.endFrame();
  t.ok(p3.frame().segs.a > 0, '同名分段累计计时');

  // 禁用时不计时不计帧
  const p2 = new Profiler({ enabled: false });
  p2.beginFrame(); p2.timed('x', () => {}); p2.count('c', 5); p2.endFrame();
  t.eq(p2.frame().ms, 0, 'disabled：不计时');
  t.eq(p2.snapshot().totalFrames, 0, 'disabled：不计帧');

  // 内存采样降级（Node 非 Chromium → null，但不报错）
  const mem = p.memory();
  t.ok(mem === null || (typeof mem.usedJSHeapSize === 'number'), 'memory 采样降级或数值');

  // JSON 导出可解析且与快照一致
  const json = JSON.parse(p.exportJSON());
  t.eq(json.totalFrames, p.snapshot().totalFrames, 'exportJSON 与 snapshot 一致');
  t.ok(typeof json.history === 'object', 'exportJSON 含 history');
}
