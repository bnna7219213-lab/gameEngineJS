// 偏微分方程：显式有限差分热传导（Dirichlet/Neumann 混合边界）。
// grid: Float32Array(w*h)，按行主序。返回新的 grid。
export function heatStep(grid, w, h, dt, alpha = 0.1) {
  const out = new Float32Array(grid.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    const c = grid[i];
    const l = grid[Math.max(0, x - 1) + y * w];
    const rr = grid[Math.min(w - 1, x + 1) + y * w];
    const u = grid[x + Math.max(0, y - 1) * w];
    const dn = grid[x + Math.min(h - 1, y + 1) * w];
    out[i] = c + alpha * dt * (l + rr + u + dn - 4 * c);
  }
  return out;
}

// 稳定性：显式格式要求 alpha*dt <= 0.25（2D）；返回是否稳定
export function isStable(alpha, dt) { return alpha * dt <= 0.25; }
