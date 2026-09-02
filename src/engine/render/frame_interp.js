// 帧插值：相邻帧（或关键帧）按 alpha 线性混合，生成中间帧。
export function interpolate(a, b, alpha) {
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] + (b[i] - a[i]) * alpha;
  return out;
}

export function interpolateFrames(frames, alpha) {
  if (frames.length === 0) return new Float32Array(0);
  if (frames.length === 1) return frames[0].slice();
  const seg = alpha * (frames.length - 1);
  const i0 = Math.floor(seg), i1 = Math.min(frames.length - 1, i0 + 1);
  const t = seg - i0;
  return interpolate(frames[i0], frames[i1], t);
}
