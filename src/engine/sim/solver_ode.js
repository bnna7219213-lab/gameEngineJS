// 常微分方程数值积分：四阶 Runge-Kutta（rk4）。
const vadd = (a, b) => a.map((x, i) => x + b[i]);
const vsub = (a, b) => a.map((x, i) => x - b[i]);
const vscale = (a, s) => a.map((x) => x * s);

export function rk4(f, y, t, dt) {
  const k1 = f(t, y);
  const k2 = f(t + dt / 2, vadd(y, vscale(k1, dt / 2)));
  const k3 = f(t + dt / 2, vadd(y, vscale(k2, dt / 2)));
  const k4 = f(t + dt, vadd(y, vscale(k3, dt)));
  return vadd(y, vscale(vadd(vadd(k1, vscale(k2, 2)), vadd(vscale(k3, 2), k4)), dt / 6));
}

// 标量便捷版
export function rk4Scalar(f, y, t, dt) {
  const k1 = f(t, y);
  const k2 = f(t + dt / 2, y + k1 * dt / 2);
  const k3 = f(t + dt / 2, y + k2 * dt / 2);
  const k4 = f(t + dt, y + k3 * dt);
  return y + (k1 + 2 * k2 + 2 * k3 + k4) * dt / 6;
}
