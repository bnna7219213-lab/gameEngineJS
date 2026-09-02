// ReSTIR：储层采样（单帧）+ 时空复用（邻域合并）。
export class Reservoir {
  constructor() { this.w = 0; this.Wsum = 0; this.M = 0; this.y = null; }
  update(sample, weight, rand) {
    if (weight <= 0) { this.M++; return; }
    this.Wsum += weight;
    if (rand() < weight / this.Wsum) this.y = sample;
    this.M++;
  }
  get estimator() { return this.M > 0 && this.y ? this.y * (this.Wsum / this.M) : null; }
}

export function spatiotemporalReuse(reservoirs, neighbors, rand) {
  // reservoirs: 当前像素储层数组；neighbors: 索引列表（含自身）
  const out = [];
  for (let i = 0; i < reservoirs.length; i++) {
    const r = new Reservoir();
    let wSum = 0;
    const selfM = reservoirs[i].M || 1;
    for (const j of neighbors) {
      const o = reservoirs[j]; if (!o || !o.y) continue;
      const w = (o.Wsum * (o.M || 1)) / selfM; // 归一化权重
      if (w <= 0) continue;
      r.update(o.y, w, rand);
      wSum += w * (o.M || 1);
    }
    r.Wsum = wSum;
    out.push(r);
  }
  return out;
}
