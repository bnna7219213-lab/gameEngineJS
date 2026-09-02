export const name = 'gi';
import { DDGI } from '../../src/engine/render/ddgi.js';
import { Reservoir, spatiotemporalReuse } from '../../src/engine/render/restir.js';

// GI 层：DDGI 探针插值 + ReSTIR 储层复用（与渲染层共用实现，这里做 GI 语义验收）
export async function run(t) {
  // DDGI：同一探针网格内采样确定性、连续
  const ddgi = new DDGI([[0,0,0],[3,0,0]], 3);
  const a = ddgi.sample(() => [1, 1, 1], [1.5, 0, 0]);
  const b = ddgi.sample(() => [1, 1, 1], [1.5, 0, 0]);
  t.vnear(a, b, 1e-9, 'DDGI 采样确定性');

  // 不同探针辐照线性插值
  const lo = ddgi.sample(() => [0, 0, 0], [0, 0, 0]);
  const hi = ddgi.sample(() => [1, 1, 1], [3, 0, 0]);
  t.vnear(lo, [0,0,0], 1e-9); t.vnear(hi, [1,1,1], 1e-9);

  // ReSTIR：多次更新后储层收敛到某候选；时空复用合并邻域
  let seed = 7; const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const r = new Reservoir(); r.update([2,2,2], 5, rand); r.update([0,1,0], 1, rand);
  t.eq(r.M, 2); t.ok(r.y !== null);
  const reuse = spatiotemporalReuse([r], [0], rand);
  t.eq(reuse.length, 1); t.ok(reuse[0].M > 0);
}
