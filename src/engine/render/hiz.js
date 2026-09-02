// Hi-Z 遮挡剔除（P4 参考核心，CPU 侧深度 mip 归约 + 遮挡查询）。
// 由深度缓冲构建最小深度 mip 链（每纹素 = 2x2 父块最小深度，0=近平面）；
// 渲染端可选把同一归约做成 GPU pass（见 plan P4），本模块是黄金参考 + 一致性校验基准。
// depth: Float32Array(w*h)，值 ∈ [0,1]，0 近 1 远。
export class HiZBuffer {
  constructor() { this.mips = []; this.w = 0; this.h = 0; }
  build(depth, w, h) {
    let cur = Float32Array.from(depth); this.w = w; this.h = h;
    this.mips = [cur];
    let cw = w, ch = h;
    while (cw > 1 || ch > 1) {
      const nw = Math.max(1, cw >> 1), nh = Math.max(1, ch >> 1);
      const dst = new Float32Array(nw * nh);
      for (let y = 0; y < nh; y++) {
        for (let x = 0; x < nw; x++) {
          const x0 = x * 2, y0 = y * 2;
          const a = cur[y0 * cw + x0];
          const b = cur[y0 * cw + Math.min(x0 + 1, cw - 1)];
          const c = cur[Math.min(y0 + 1, ch - 1) * cw + x0];
          const d = cur[Math.min(y0 + 1, ch - 1) * cw + Math.min(x0 + 1, cw - 1)];
          dst[y * nw + x] = Math.min(a, b, c, d);
        }
      }
      this.mips.push(dst); cw = nw; ch = nh; cur = dst;
    }
    return this.mips;
  }
  // 取指定 mip 上 (x,y) 处的最小深度
  sample(mip, x, y) {
    const m = this.mips[mip];
    const w = Math.max(1, this.w >> mip);
    return m[Math.min(y, (this.h >> mip) - 1) * w + Math.min(x, w - 1)];
  }
  // 遮挡查询：ndcBox = { minX,minY,maxX,maxY ∈ [-1,1], minZ,maxZ ∈ [0,1]（最近/最远深度） }
  // 选 mip 由包围盒屏幕占比决定；若对象最*近*点(minZ) 仍远于覆盖区域内最*近*(nearest)深度 → 整对象落在遮挡物之后 → 被遮挡。
  // 约定：depth 0=近 1=远。空区域(全 1.0) 不会误剔除（对象 minZ<1 恒成立）。
  isOccluded(ndcBox) {
    if (this.mips.length === 0) return false;
    const minX = Math.floor((ndcBox.minX * 0.5 + 0.5) * this.w);
    const maxX = Math.ceil((ndcBox.maxX * 0.5 + 0.5) * this.w);
    const minY = Math.floor((1 - (ndcBox.maxY * 0.5 + 0.5)) * this.h);
    const maxY = Math.ceil((1 - (ndcBox.minY * 0.5 + 0.5)) * this.h);
    const bw = Math.max(1, maxX - minX), bh = Math.max(1, maxY - minY);
    // 选 mip：屏幕占比越大，用越细的 mip
    let mip = 0;
    while (mip < this.mips.length - 1 && (bw >> (mip + 1)) > 0 && (bh >> (mip + 1)) > 0) mip++;
    const mw = Math.max(1, this.w >> mip), mh = Math.max(1, this.h >> mip);
    const x0 = Math.max(0, Math.floor(minX / (1 << mip))), x1 = Math.min(mw - 1, Math.floor(maxX / (1 << mip)));
    const y0 = Math.max(0, Math.floor(minY / (1 << mip))), y1 = Math.min(mh - 1, Math.floor(maxY / (1 << mip)));
    const m = this.mips[mip];
    let nearest = 2; // 深度上限保护
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const d = m[y * mw + x]; if (d < nearest) nearest = d; }
    // 对象最近点仍比遮挡物最近点更远（留 ε 容差，避免共面/自身遮挡的浮点误剔）→ 完全被遮挡
    return ndcBox.minZ > nearest + 1e-3;
  }
}
