// TAA：抖动序列（Halton）+ 历史对齐 + 邻域 clamp 抗闪。
export function halton(index, base) {
  let f = 1, r = 0, i = index;
  while (i > 0) { f /= base; r += f * (i % base); i = Math.floor(i / base); }
  return r;
}
export function jitter(frame, w, h, scale = 1) {
  const x = (halton(frame + 1, 2) - 0.5) * scale;
  const y = (halton(frame + 1, 3) - 0.5) * scale;
  return { x, y };
}
export function resolveTAA(history, current, alpha = 0.1) {
  const n = current.length;
  const w = Math.max(1, Math.round(Math.sqrt(n / 4)));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 4) {
    const px = (i / 4) % w, py = (i / 4 / w) | 0;
    let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = px + dx, y = py + dy; if (x < 0 || y < 0 || x >= w || y >= w) continue;
      const j = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) { mn[c] = Math.min(mn[c], current[j + c]); mx[c] = Math.max(mx[c], current[j + c]); }
    }
    for (let c = 0; c < 3; c++) {
      let hv = history ? history[i + c] : current[i + c];
      hv = Math.min(mx[c], Math.max(mn[c], hv));
      out[i + c] = hv * (1 - alpha) + current[i + c] * alpha;
    }
    out[i + 3] = current[i + 3];
  }
  return out;
}
