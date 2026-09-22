// plat_modeling_modifier smoke：修改器栈求值（v3 M-A / D27）。
import { applyModifiers, MODIFIER_TYPES } from '../../src/engine/modeling/modifier.js';
import { cube } from '../../src/engine/render/primitives.js';

export const name = 'plat-modeling-modifier';
export async function run(t) {
  const base = cube(1); // 24 verts / 36 idx
  t.eq(base.vertexCount, 24, 'cube 顶点数前置');
  t.ok(MODIFIER_TYPES.includes('MIRROR') && MODIFIER_TYPES.includes('SUBDIVIDE'), '修改器类型表存在');

  // MIRROR：顶点/索引翻倍
  const mir = applyModifiers(base, [{ type: 'MIRROR', params: { axis: 'X' } }]);
  t.eq(mir.vertexCount, 48, 'MIRROR 顶点翻倍');
  t.eq(mir.indexCount, 72, 'MIRROR 索引翻倍');
  t.eq(base.vertexCount, 24, 'MIRROR 不改输入（纯函数）');

  // ARRAY：count=3 顶点×3
  const arr = applyModifiers(base, [{ type: 'ARRAY', params: { count: 3, offset: [2, 0, 0] } }]);
  t.eq(arr.vertexCount, 72, 'ARRAY count=3 顶点×3');
  t.eq(arr.indexCount, 108, 'ARRAY 索引×3');

  // SUBDIVIDE：cuts=1 三角形数×4（36 idx -> 12 三角 -> 48 三角 -> 144 idx）
  const sub = applyModifiers(base, [{ type: 'SUBDIVIDE', params: { cuts: 1 } }]);
  t.eq(sub.indexCount, 144, 'SUBDIVIDE cuts=1 索引×4');
  t.ok(sub.vertexCount > base.vertexCount, 'SUBDIVIDE 增加顶点');

  // WELD：cube 24 顶点（每面独立）合并同位点 -> 8 顶点
  const wel = applyModifiers(base, [{ type: 'WELD', params: { dist: 1e-4 } }]);
  t.eq(wel.vertexCount, 8, 'WELD 合并 cube 24 顶点为 8');

  // SOLIDIFY：顶点×2
  const sol = applyModifiers(base, [{ type: 'SOLIDIFY', params: { thickness: 0.2 } }]);
  t.eq(sol.vertexCount, 48, 'SOLIDIFY 顶点×2');

  // TRIANGULATE / BEVEL 占位：恒等
  t.eq(applyModifiers(base, [{ type: 'TRIANGULATE' }]).indexCount, base.indexCount, 'TRIANGULATE 恒等');
  t.eq(applyModifiers(base, [{ type: 'BEVEL' }]).indexCount, base.indexCount, 'BEVEL 占位恒等');

  // 栈顺序敏感：先 MIRROR 后 SUBDIVIDE 与 反序 三角形数相同但顶点布局不同（此处验指数级）
  const s1 = applyModifiers(base, [{ type: 'MIRROR', params: { axis: 'X' } }, { type: 'SUBDIVIDE', params: { cuts: 1 } }]);
  const s2 = applyModifiers(base, [{ type: 'SUBDIVIDE', params: { cuts: 1 } }, { type: 'MIRROR', params: { axis: 'X' } }]);
  t.eq(s1.indexCount, s2.indexCount, 'MIRROR+SUBDIVIDE 两顺序索引数一致（结合律）');
  t.eq(s1.indexCount, 288, 'MIRROR(×2) 后 SUBDIVIDE(×4) = 72*4=288');

  // enabled=false 跳过
  const dis = applyModifiers(base, [{ type: 'MIRROR', enabled: false, params: { axis: 'X' } }]);
  t.eq(dis.vertexCount, 24, 'enabled=false 跳过');

  // 空栈恒等
  t.eq(applyModifiers(base, []).vertexCount, 24, '空栈恒等');

  // 未知类型抛错（红线 A）
  let threw = false;
  try { applyModifiers(base, [{ type: 'NOPE' }]); } catch (e) { threw = /未知修改器/.test(e.message); }
  t.ok(threw, '未知修改器类型抛可读错误');

  // DECIMATE：ratio=0.5 面数减半
  const dec = applyModifiers(base, [{ type: 'DECIMATE', params: { ratio: 0.5 } }]);
  t.eq(dec.indexCount, 18, 'DECIMATE ratio=0.5 索引减半');
}
