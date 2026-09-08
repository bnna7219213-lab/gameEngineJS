// 光照烘焙（CPU 参考）：在 w×h 光照图上累加点光源辐照（距离平方衰减）。
export function bake(objects, lights, w, h) {
  const out = new Float32Array(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    const u = i % w, v = (i / w) | 0;
    const p = [(u / w - 0.5) * 10, 0, (v / h - 0.5) * 10];
    let r = 0, g = 0, b = 0;
    for (const L of lights) {
      const dx = L.pos[0] - p[0], dy = L.pos[1] - p[1], dz = L.pos[2] - p[2];
      const dist = Math.hypot(dx, dy, dz) + 0.1;
      const att = (L.intensity || 1) / (dist * dist);
      r += (L.color[0] || 0) * att; g += (L.color[1] || 0) * att; b += (L.color[2] || 0) * att;
    }
    out[i * 3] = Math.min(1, r); out[i * 3 + 1] = Math.min(1, g); out[i * 3 + 2] = Math.min(1, b);
  }
  return out;
}
