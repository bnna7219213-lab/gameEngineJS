// DDGI：探针网格 + 三线性插值采样（可选 TF.js 去噪由上层接入）。
import { Vec3 } from '../core/math.js';

export class DDGI {
  constructor(bounds, spacing) {
    this.bounds = bounds; // [min:[x,y,z], max:[x,y,z]]
    this.spacing = spacing;
    this.probes = [];
    const mn = bounds[0], mx = bounds[1];
    for (let x = mn[0]; x <= mx[0]; x += spacing)
      for (let y = mn[1]; y <= mx[1]; y += spacing)
        for (let z = mn[2]; z <= mx[2]; z += spacing)
          this.probes.push(Vec3.of(x, y, z));
    this.dims = [
      Math.floor((mx[0] - mn[0]) / spacing) + 1,
      Math.floor((mx[1] - mn[1]) / spacing) + 1,
      Math.floor((mx[2] - mn[2]) / spacing) + 1,
    ];
  }
  // irrFn(probeIndex) -> [r,g,b]
  sample(irrFn, p) {
    const mn = this.bounds[0];
    const fx = (p[0] - mn[0]) / this.spacing, fy = (p[1] - mn[1]) / this.spacing, fz = (p[2] - mn[2]) / this.spacing;
    const xi = Math.max(0, Math.min(this.dims[0] - 2, Math.floor(fx)));
    const yi = Math.max(0, Math.min(this.dims[1] - 2, Math.floor(fy)));
    const zi = Math.max(0, Math.min(this.dims[2] - 2, Math.floor(fz)));
    const dx = fx - xi, dy = fy - yi, dz = fz - zi;
    let r = 0, g = 0, b = 0;
    for (let k = 0; k < 8; k++) {
      const cx = (k & 1) ? 1 : 0, cy = (k & 2) ? 1 : 0, cz = (k & 4) ? 1 : 0;
      const w = (cx ? dx : 1 - dx) * (cy ? dy : 1 - dy) * (cz ? dz : 1 - dz);
      const idx = ((zi + cz) * this.dims[1] + (yi + cy)) * this.dims[0] + (xi + cx);
      const irr = irrFn(idx);
      r += irr[0] * w; g += irr[1] * w; b += irr[2] * w;
    }
    return [r, g, b];
  }
}
