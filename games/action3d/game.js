// Action3D：软渲染 3D 收集游戏（对应 C++ 版 games/action3d）。
// 重构为无 DOM 的类：物理/相机/场景图元在实例内，renderTo(batch) 发射世界空间三角形。
import { Rng, clamp, Vec3 } from '../../src/engine/core/math.js';
import { cube, sphere } from '../../src/engine/render/primitives.js';

// 复用 engine 图元（D8 收编）；三角数须与历史 selftest 一致：cube=12、sphere(10,8)=160
const cubeGeo = () => cube(1);
const sphereGeo = () => sphere(0.35, 10, 8);
const GROUND = {
  positions: [-10, 0, -10, 10, 0, -10, 10, 0, 10, -10, 0, 10],
  normals: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
  indices: [0, 1, 2, 0, 2, 3],
};

export class Action3DGame {
  constructor(seed = 1) {
    this.rng = new Rng(seed);
    this.player = { pos: { x: 0, y: 0.5, z: 0 }, vy: 0, grounded: true, r: 0.5 };
    this.coins = [];
    this.got = 0;
    this._t = 0;
    this._reset();
  }
  _reset() {
    const p = this.player; p.pos.x = 0; p.pos.y = 0.5; p.pos.z = 0; p.vy = 0; p.grounded = true;
    this.coins = [];
    for (let i = 0; i < 8; i++) this.coins.push({ x: this.rng.range(-7, 7), z: this.rng.range(-7, 7), taken: false });
    this.got = 0; this._t = 0;
  }
  update(dt, input = {}) {
    this._t += dt;
    const p = this.player; const sp = 4.5; let dx = 0, dz = 0;
    if (input.f) dz -= 1; if (input.b) dz += 1;
    if (input.l) dx -= 1; if (input.r) dx += 1;
    const l = Math.hypot(dx, dz) || 1;
    p.pos.x = clamp(p.pos.x + dx / l * sp * dt, -9.5, 9.5);
    p.pos.z = clamp(p.pos.z + dz / l * sp * dt, -9.5, 9.5);
    p.vy -= 18 * dt; p.pos.y += p.vy * dt;
    if (p.pos.y <= p.r) { p.pos.y = p.r; p.vy = 0; p.grounded = true; }
    if (input.jump && p.grounded) { p.vy = 7; p.grounded = false; }
    for (const c of this.coins) {
      if (!c.taken && Math.hypot(p.pos.x - c.x, p.pos.z - c.z) < 0.8 && p.pos.y < 1.6) { c.taken = true; this.got++; }
    }
  }
  camera() {
    const p = this.player;
    return { eye: new Vec3(p.pos.x, p.pos.y + 5, p.pos.z + 8), center: new Vec3(p.pos.x, p.pos.y, p.pos.z), up: new Vec3(0, 1, 0), fovy: 1.1, zn: 0.1, zf: 100 };
  }
  _emit(batch, geo, pos, rot, scale, color) {
    const cy = Math.cos(rot[1] || 0), sy = Math.sin(rot[1] || 0);
    const sx = scale[0], syc = scale[1], sz = scale[2];
    const tx = pos[0], ty = pos[1], tz = pos[2];
    const T = (x, y, z) => {
      const X = x * sx, Y = y * syc, Z = z * sz;
      const rx = X * cy + Z * sy, rz = -X * sy + Z * cy;
      return [rx + tx, Y + ty, rz + tz];
    };
    const P = geo.positions, I = geo.indices;
    for (let i = 0; i < I.length; i += 3) {
      const a = 3 * I[i], b = 3 * I[i + 1], c = 3 * I[i + 2];
      const A = T(P[a], P[a + 1], P[a + 2]), B = T(P[b], P[b + 1], P[b + 2]), C = T(P[c], P[c + 1], P[c + 2]);
      batch.tri(A[0], A[1], A[2], B[0], B[1], B[2], C[0], C[1], C[2], color);
    }
  }
  renderTo(batch) {
    const CUBE = cubeGeo(), BALL = sphereGeo();
    this._emit(batch, GROUND, [0, 0, 0], [0, 0, 0], [1, 1, 1], [0.23, 0.25, 0.30]);
    const p = this.player;
    this._emit(batch, CUBE, [p.pos.x, p.pos.y, p.pos.z], [0, this._t, 0], [1, 1, 1], [0.35, 0.55, 1.0]);
    for (const c of this.coins) if (!c.taken) this._emit(batch, BALL, [c.x, 0.6 + Math.sin(this._t * 2.5 + c.x) * 0.1, c.z], [0, this._t, 0], [1, 1, 1], [0.94, 0.78, 0.24]);
  }
}
