// 时间累积：对多帧结果做指数滑动平均，降低时序噪声（路径追踪/降噪常用）。
export class TemporalAccumulator {
  constructor() { this.acc = null; this.n = 0; }
  reset() { this.acc = null; this.n = 0; }
  accumulate(frame, alpha = 0.1) {
    if (!this.acc) { this.acc = frame.slice(); this.n = 1; return this.acc; }
    for (let i = 0; i < frame.length; i++) this.acc[i] = this.acc[i] * (1 - alpha) + frame[i] * alpha;
    this.n++;
    return this.acc;
  }
  get samples() { return this.n; }
}
