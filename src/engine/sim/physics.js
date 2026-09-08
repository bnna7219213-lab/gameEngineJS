// 2D 物理（参考实现）：半隐式积分 + 圆形碰撞 + 地面约束。
export class Body2D {
  constructor(x = 0, y = 0, r = 1) { this.x = x; this.y = y; this.vx = 0; this.vy = 0; this.r = r; this.mass = 1; this.restitution = 0.5; this.static = false; }
}
export function step(bodies, dt, gravity = 9.8) {
  for (const b of bodies) {
    if (b.static) continue;
    b.vy -= gravity * dt;
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.y < b.r) { b.y = b.r; if (b.vy < 0) b.vy = -b.vy * b.restitution; b.vx *= 0.98; }
  }
  for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
    const a = bodies[i], c = bodies[j];
    const dx = c.x - a.x, dy = c.y - a.y; const d = Math.hypot(dx, dy); const min = a.r + c.r;
    if (d < min && d > 1e-9) {
      const nx = dx / d, ny = dy / d, overlap = (min - d);
      const ta = a.static ? 0 : (c.static ? 1 : 0.5), tc = c.static ? 0 : (a.static ? 1 : 0.5);
      a.x -= nx * overlap * ta; a.y -= ny * overlap * ta; c.x += nx * overlap * tc; c.y += ny * overlap * tc;
      const rvx = c.vx - a.vx, rvy = c.vy - a.vy; const vn = rvx * nx + rvy * ny;
      if (vn < 0) { const e = Math.min(a.restitution, c.restitution); const jimp = -(1 + e) * vn / 2; a.vx -= jimp * nx; a.vy -= jimp * ny; c.vx += jimp * nx; c.vy += jimp * ny; }
    }
  }
}
