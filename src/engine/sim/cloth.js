// 布料（质点-弹簧，Verlet 积分 + 约束松弛）。
export function createCloth(nx, ny, spacing = 0.1, pin = {}) {
  const N = nx * ny;
  const pos = new Float32Array(N * 3), prev = new Float32Array(N * 3), pinned = new Uint8Array(N);
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    const i = y * nx + x;
    pos[i * 3] = x * spacing; pos[i * 3 + 1] = y * spacing; pos[i * 3 + 2] = 0;
    prev[i * 3] = pos[i * 3]; prev[i * 3 + 1] = pos[i * 3 + 1]; prev[i * 3 + 2] = pos[i * 3 + 2];
  }
  if (pin.top) for (let x = 0; x < nx; x++) pinned[(ny - 1) * nx + x] = 1;
  if (pin.corners) { pinned[0] = 1; pinned[nx - 1] = 1; }
  const constraints = [];
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    const i = y * nx + x;
    if (x + 1 < nx) constraints.push([i, i + 1, spacing]);
    if (y + 1 < ny) constraints.push([i, i + nx, spacing]);
  }
  return { nx, ny, N, pos, prev, pinned, constraints, spacing };
}

export function stepCloth(cloth, dt, gravity = 9.8, iterations = 5) {
  const { pos, prev, pinned, N, constraints } = cloth;
  const dt2 = dt * dt;
  for (let i = 0; i < N; i++) {
    if (pinned[i]) continue;
    const ox = pos[i * 3], oy = pos[i * 3 + 1], oz = pos[i * 3 + 2];
    const vx = (ox - prev[i * 3]) * 0.99, vy = (oy - prev[i * 3 + 1]) * 0.99, vz = (oz - prev[i * 3 + 2]) * 0.99;
    prev[i * 3] = ox; prev[i * 3 + 1] = oy; prev[i * 3 + 2] = oz;
    pos[i * 3] = ox + vx; pos[i * 3 + 1] = oy + vy - gravity * dt2; pos[i * 3 + 2] = oz + vz;
  }
  for (let it = 0; it < iterations; it++) {
    for (const [a, b, rest] of constraints) {
      const dx = pos[b * 3] - pos[a * 3], dy = pos[b * 3 + 1] - pos[a * 3 + 1], dz = pos[b * 3 + 2] - pos[a * 3 + 2];
      const d = Math.hypot(dx, dy, dz) || 1e-9; const diff = (d - rest) / d * 0.5;
      const mx = dx * diff, my = dy * diff, mz = dz * diff;
      if (!pinned[a]) { pos[a * 3] += mx; pos[a * 3 + 1] += my; pos[a * 3 + 2] += mz; }
      if (!pinned[b]) { pos[b * 3] -= mx; pos[b * 3 + 1] -= my; pos[b * 3 + 2] -= mz; }
    }
  }
  return cloth;
}

export function aabbOf(cloth) {
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < cloth.N; i++) for (let k = 0; k < 3; k++) {
    mn[k] = Math.min(mn[k], cloth.pos[i * 3 + k]); mx[k] = Math.max(mx[k], cloth.pos[i * 3 + k]);
  }
  return { min: mn, max: mx };
}
