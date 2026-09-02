// VRS：按屏幕空间梯度/方差决定每 tile 的着色率（0=1x,1=2x,2=4x）。
export function computeShadingRates(grad, w, h, tile = 8) {
  const tw = Math.ceil(w / tile), th = Math.ceil(h / tile);
  const rates = new Uint8Array(tw * th);
  for (let ty = 0; ty < th; ty++) for (let tx = 0; tx < tw; tx++) {
    let v = 0, n = 0;
    for (let y = ty * tile; y < Math.min(h, (ty + 1) * tile); y++)
      for (let x = tx * tile; x < Math.min(w, (tx + 1) * tile); x++) { v += grad[y * w + x] || 0; n++; }
    v /= Math.max(1, n);
    rates[ty * tw + tx] = v > 0.3 ? 0 : v > 0.1 ? 1 : 2;
  }
  return rates;
}
