// editor_gizmo smoke：gizmo 纯函数（角度/缩放/命中）+ mode 状态切换（不依赖 DOM）。
import { hitCircle, angleDelta, axisScaleFactor, axisWorldDelta, hitSegment, Gizmo } from '../../src/editor/gizmo.js';

export const name = 'editor-gizmo';
export async function run(t) {
  // --- hitCircle ---
  t.ok(hitCircle(10, 0, 0, 0, 10, 8), '圆环上点命中');
  t.ok(hitCircle(16, 0, 0, 0, 10, 8), '容差内外侧命中');
  t.ok(!hitCircle(19, 0, 0, 0, 10, 8), '容差外不命中');
  t.ok(!hitCircle(0, 0, 0, 0, 10, 8), '圆心不命中');

  // --- angleDelta ---
  const q = angleDelta(0, 0, 10, 0, 0, 10); // 从 +X 转到 +Y，逆时针 90°
  t.ok(Math.abs(q - Math.PI / 2) < 1e-9, 'angleDelta 逆时针 90°');
  const q2 = angleDelta(0, 0, 0, 10, 10, 0);
  t.ok(Math.abs(q2 + Math.PI / 2) < 1e-9, 'angleDelta 顺时针 -90°');
  t.ok(Math.abs(angleDelta(5, 5, 15, 5, 15, 5)) < 1e-12, '同点零角度');
  // 跨 ±π 环绕
  const q3 = angleDelta(0, 0, -10, 1, -10, -1);
  t.ok(Math.abs(q3) < 0.3, 'angleDelta 跨 ±π 取短弧');

  // --- axisScaleFactor ---
  t.eq(axisScaleFactor(0, 100, 1.2), 1, '零位移系数为 1');
  t.eq(axisScaleFactor(100, 100, 1.2), 2, '拖满轴长放大 2 倍');
  t.eq(axisScaleFactor(-50, 100, 1.2), 0.5, '反向一半缩小 0.5');
  t.eq(axisScaleFactor(-1000, 100, 1.2), 0.01, '钳制最小 0.01');
  t.eq(axisScaleFactor(10, 0, 1.2), 1.5, 'plen 退化按 20 兜底');

  // --- axisWorldDelta（平移映射）---
  t.eq(axisWorldDelta(0, 100, 1.2), 0, '零位移零增量');
  t.ok(Math.abs(axisWorldDelta(100, 100, 1.2) - 1.2) < 1e-12, '满屏轴长 = len');
  t.eq(axisWorldDelta(20, 10, 1.2), 1.2, 'plen 退化按 20 兜底');

  // --- hitSegment ---
  t.ok(hitSegment(50, 3, 0, 0, 1, 0, 100, 8), '线段附近命中');
  t.ok(!hitSegment(50, 20, 0, 0, 1, 0, 100, 8), '远离不命中');
  t.ok(hitSegment(105, 0, 0, 0, 1, 0, 100, 8), '端点外仍钳制到端点命中');
  t.ok(!hitSegment(-20, 0, 0, 0, 1, 0, 100, 8), '起点后方不命中');

  // --- mode 状态切换（不实例化，仅原型调用 setMode 需要 this）---
  const fake = { mode: 'translate', activeAxis: -1, _grab: null };
  Gizmo.prototype.setMode.call(fake, 'rotate');
  t.eq(fake.mode, 'rotate', 'setMode rotate');
  Gizmo.prototype.setMode.call(fake, 'scale');
  t.eq(fake.mode, 'scale', 'setMode scale');
  fake.activeAxis = 1; fake._grab = { mx: 0 };
  Gizmo.prototype.setMode.call(fake, 'translate');
  t.eq(fake.mode, 'translate', 'setMode translate');
  t.eq(fake.activeAxis, -1, '切模式清空 activeAxis');
  t.eq(fake._grab, null, '切模式清空 _grab');
  let threw = false;
  try { Gizmo.prototype.setMode.call(fake, 'nope'); } catch (e) { threw = /非法 gizmo 模式/.test(e.message); }
  t.ok(threw, '非法模式抛可读错误');
  t.eq(fake.mode, 'translate', '抛错后模式不变');
}
