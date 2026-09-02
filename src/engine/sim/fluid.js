// 流体（稳定流体，Jos Stam 风格半拉格朗日平流；参考实现）。
export function createField(w, h) {
  return {
    w, h,
    u: new Float32Array(w * h), v: new Float32Array(w * h),
    dens: new Float32Array(w * h), densPrev: new Float32Array(w * h),
  };
}

const IX = (x, y, w) => y * w + x;

export function addDensity(field, x, y, amount) { field.dens[IX(x, y, field.w)] += amount; }
export function addVelocity(field, x, y, fx, fy) { const i = IX(x, y, field.w); field.u[i] += fx; field.v[i] += fy; }

// 一步平流（半拉格朗日回溯采样）
export function advect(field, dt) {
  const { w, h, u, v, dens, densPrev } = field;
  densPrev.set(dens);
  const out = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = IX(x, y, w);
    const px = x - u[i] * dt, py = y - v[i] * dt;
    const sx = Math.max(1, Math.min(w - 2, Math.round(px)));
    const sy = Math.max(1, Math.min(h - 2, Math.round(py)));
    out[i] = densPrev[IX(sx, sy, w)];
  }
  field.dens.set(out);
  return field;
}

export function step(field, dt) { return advect(field, dt); }

// 总质量（用于守恒性粗检）
export function totalDensity(field) { let s = 0; for (let i = 0; i < field.w * field.h; i++) s += field.dens[i]; return s; }
