// 帧预测：用历史帧做线性外推（恒定速度假设），用于插值与低延迟补偿。
export function predict(prevFrames, n) {
  if (prevFrames.length === 0) return [];
  const out = [];
  const last = prevFrames[prevFrames.length - 1];
  const prev = prevFrames.length > 1 ? prevFrames[prevFrames.length - 2] : last;
  const vel = new Float32Array(last.length);
  for (let i = 0; i < last.length; i++) vel[i] = last[i] - prev[i];
  let acc = last.slice();
  for (let k = 1; k <= n; k++) {
    const f = new Float32Array(last.length);
    for (let i = 0; i < last.length; i++) f[i] = last[i] + vel[i] * k;
    out.push(f);
  }
  return out;
}
