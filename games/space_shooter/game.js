// 太空射手：ECS + 对象池子弹 + 波次敌机（对应 C++ 版 games/space_shooter）。
// 重构为无 DOM 的类，供 games/selftest.js 与 main.js 共用。
import { ECS } from '../../src/engine/sim/ecs.js';
import { clamp, Rng } from '../../src/engine/core/math.js';

export class SpaceShooterGame {
  constructor(seed = 1, opts = {}) {
    this.width = opts.width || 480;
    this.height = opts.height || 640;
    this.ecs = new ECS();
    this.rng = new Rng(seed);
    this.score = 0; this.lives = 3; this.wave = 0; this.spawnT = 0; this.gameOver = false; this.state = 'play';
    this._t = 0;
    this._reset();
  }
  _reset() {
    const W = this.width, H = this.height;
    this.ecs.entities.clear(); this.ecs.components.clear(); this.ecs.next = 1;
    this.score = 0; this.lives = 3; this.wave = 0; this.spawnT = 0; this.gameOver = false; this.state = 'play';
    const p = this.ecs.createEntity();
    this.ecs.add(p, 'kind', 'player');
    this.ecs.add(p, 'pos', { x: W / 2, y: H - 60 });
    this.ecs.add(p, 'r', 12);
    this.ecs.add(p, 'cool', 0);
    this.wave = 1;
    for (let i = 0; i < 4; i++) this._spawn();
  }
  _spawn() {
    const W = this.width;
    const e = this.ecs.createEntity();
    this.ecs.add(e, 'kind', 'enemy');
    this.ecs.add(e, 'enemy', true);
    this.ecs.add(e, 'pos', { x: this.rng.range(20, W - 20), y: -20 });
    this.ecs.add(e, 'vel', { vx: this.rng.range(-60, 60), vy: this.rng.range(60, 60 + this.wave * 20) });
    this.ecs.add(e, 'r', 11);
    this.ecs.add(e, 'hp', this.wave > 2 ? 2 : 1);
    this.ecs.add(e, 'wob', this.rng.range(0, Math.PI * 2));
  }
  _fire(pp) {
    const b = this.ecs.createEntity();
    this.ecs.add(b, 'kind', 'bullet');
    this.ecs.add(b, 'pos', { x: pp.x, y: pp.y - 16 });
    this.ecs.add(b, 'vel', { vx: 0, vy: -420 });
    this.ecs.add(b, 'r', 3);
  }
  update(dt, input = {}) {
    const W = this.width, H = this.height;
    this._t += dt;
    if (this.gameOver) { this.state = 'gameover'; return; }
    const [pl] = this.ecs.query('kind').filter(i => this.ecs.get(i, 'kind') === 'player');
    if (!pl) { this.gameOver = true; return; }
    const pp = this.ecs.get(pl, 'pos');
    const sp = 260;
    if (input.dx) pp.x = clamp(pp.x + input.dx * sp * dt, 12, W - 12);
    if (input.dy) pp.y = clamp(pp.y + input.dy * sp * dt, 12, H - 12);
    let cool = this.ecs.get(pl, 'cool') - dt;
    if (input.fire && cool <= 0) { this._fire(pp); cool = 0.18; }
    this.ecs.add(pl, 'cool', cool);
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.wave++; this.spawnT = Math.max(0.35, 1.2 - this.wave * 0.04);
      for (let i = 0, n = 1 + Math.min(3, this.wave >> 2); i < n; i++) this._spawn();
    }
    const dead = [];
    for (const id of this.ecs.query('kind', 'pos', 'vel')) {
      const p = this.ecs.get(id, 'pos'), v = this.ecs.get(id, 'vel');
      p.x += v.vx * dt; p.y += v.vy * dt;
      const k = this.ecs.get(id, 'kind');
      if (k === 'enemy') { p.x += Math.sin(this._t / 0.5 + this.ecs.get(id, 'wob')) * 40 * dt; if (p.y > H + 30) dead.push(id); }
      else if (k === 'bullet' && p.y < -20) dead.push(id);
    }
    for (const b of this.ecs.query('kind', 'pos').filter(i => this.ecs.get(i, 'kind') === 'bullet')) {
      const bp = this.ecs.get(b, 'pos');
      for (const e of this.ecs.query('kind', 'pos').filter(i => this.ecs.get(i, 'kind') === 'enemy')) {
        const ep = this.ecs.get(e, 'pos');
        if (Math.hypot(bp.x - ep.x, bp.y - ep.y) < this.ecs.get(e, 'r') + 3) {
          dead.push(b);
          const hp = this.ecs.get(e, 'hp') - 1;
          if (hp <= 0) { dead.push(e); this.score += 10; } else this.ecs.add(e, 'hp', hp);
          break;
        }
      }
    }
    for (const e of this.ecs.query('kind', 'pos').filter(i => this.ecs.get(i, 'kind') === 'enemy')) {
      const ep = this.ecs.get(e, 'pos');
      if (Math.hypot(ep.x - pp.x, ep.y - pp.y) < this.ecs.get(e, 'r') + 12) {
        dead.push(e); this.lives--;
        if (this.lives <= 0) { dead.push(pl); this.gameOver = true; this.state = 'gameover'; }
      }
    }
    for (const id of new Set(dead)) if (this.ecs.entities.has(id)) this.ecs.remove(id);
  }
  quads() {
    const W = this.width, H = this.height;
    const out = [{ x0: 0, y0: 0, x1: W, y1: H, color: [0.05, 0.06, 0.13] }];
    for (const id of this.ecs.query('kind', 'pos')) {
      const p = this.ecs.get(id, 'pos'), k = this.ecs.get(id, 'kind');
      const r = this.ecs.get(id, 'r');
      const c = k === 'player' ? [0.31, 0.55, 1.0] : k === 'enemy' ? (this.ecs.get(id, 'hp') > 1 ? [0.88, 0.33, 0.33] : [0.78, 0.54, 0.29]) : [0.62, 0.88, 0.54];
      out.push({ x0: p.x - r, y0: p.y - r, x1: p.x + r, y1: p.y + r, color: c });
    }
    return out;
  }
}
