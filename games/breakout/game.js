// 打砖块：ECS 实体组件 + 确定性 RNG（对应 C++ 版 games/breakout）。
// 重构为无 DOM 的类，供 games/selftest.js（Node 校验）与 main.js（RHI 渲染）共用。
import { ECS } from '../../src/engine/sim/ecs.js';
import { clamp, Rng } from '../../src/engine/core/math.js';

const COL = {
  bg: [0.09, 0.10, 0.14],
  paddle: [0.31, 0.55, 1.0],
  ball: [0.94, 0.94, 0.94],
  brick: (h) => [0.4 + 0.25 * Math.sin(h), 0.4, 0.5],
};

export class BreakoutGame {
  constructor(seed = 0xC0FFEE, opts = {}) {
    this.width = opts.width || 640;
    this.height = opts.height || 480;
    this.ecs = new ECS();
    this.rng = new Rng(seed);
    this.score = 0; this.lives = 3; this.level = 1; this.state = 'serve';
    this.ball = null;
    this._reset();
  }
  _reset() {
    const W = this.width, H = this.height;
    this.ecs.entities.clear(); this.ecs.components.clear(); this.ecs.next = 1;
    const paddle = this.ecs.createEntity();
    this.ecs.add(paddle, 'pos', { x: W / 2 - 50, y: H - 30 });
    this.ecs.add(paddle, 'box', { w: 100, h: 12 });
    this.ecs.add(paddle, 'kind', 'paddle');
    const ball = this.ecs.createEntity();
    // 注意：小球位置组件命名为 'ball'（selftest 通过 ecs.get(id,'ball') 取坐标）
    this.ecs.add(ball, 'ball', { x: W / 2, y: H - 50 });
    this.ecs.add(ball, 'vel', { vx: 0, vy: 0 });
    this.ecs.add(ball, 'box', { w: 10, h: 10 });
    this.ecs.add(ball, 'kind', 'ball');
    this.ecs.add(ball, 'stuck', true);
    this.ball = ball;
    const cols = 10, rows = 5;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const b = this.ecs.createEntity();
      this.ecs.add(b, 'pos', { x: 20 + c * 60, y: 40 + r * 24 });
      this.ecs.add(b, 'box', { w: 56, h: 20 });
      this.ecs.add(b, 'kind', 'brick');
      this.ecs.add(b, 'hp', r < 2 ? 2 : 1);
      this.ecs.add(b, 'hue', this.rng.int(360));
    }
  }
  launch() {
    for (const id of this.ecs.query('kind', 'stuck')) {
      this.ecs.entities.get(id).delete('stuck');
      const v = this.ecs.get(id, 'vel'); v.vx = this.rng.range(-160, 160) || 120; v.vy = -260;
    }
    this.state = 'play';
  }
  update(dt, input = {}) {
    const W = this.width, H = this.height;
    const [paddle] = this.ecs.query('kind').filter(id => this.ecs.get(id, 'kind') === 'paddle');
    const pp = this.ecs.get(paddle, 'pos'), pb = this.ecs.get(paddle, 'box');
    if (input.mouseX != null) pp.x = clamp(input.mouseX - pb.w / 2, 0, W - pb.w);
    else if (input.dir) pp.x = clamp(pp.x + input.dir * 420 * dt, 0, W - pb.w);
    if (input.launch) this.launch();
    for (const id of this.ecs.query('kind', 'ball', 'box')) {
      if (this.ecs.has(id, 'stuck')) continue;
      const p = this.ecs.get(id, 'ball'), v = this.ecs.get(id, 'vel'), b = this.ecs.get(id, 'box');
      p.x += v.vx * dt; p.y += v.vy * dt;
      if (p.x < 0 || p.x + b.w > W) { v.vx = -v.vx; p.x = clamp(p.x, 0, W - b.w); }
      if (p.y < 0) { v.vy = -v.vy; p.y = 0; }
      if (v.vy > 0 && p.y + b.h >= pp.y && p.y + b.h <= pp.y + pb.h + 8 && p.x + b.w > pp.x && p.x < pp.x + pb.w) {
        const k = ((p.x + b.w / 2) - (pp.x + pb.w / 2)) / (pb.w / 2);
        const sp = Math.hypot(v.vx, v.vy) * 1.02;
        v.vx = sp * k * 0.9; v.vy = -Math.sqrt(Math.max(1, sp * sp - v.vx * v.vx));
      }
      for (const bid of this.ecs.query('kind', 'pos', 'box')) {
        if (this.ecs.get(bid, 'kind') !== 'brick') continue;
        const bp = this.ecs.get(bid, 'pos'), bb = this.ecs.get(bid, 'box');
        if (p.x < bp.x + bb.w && p.x + b.w > bp.x && p.y < bp.y + bb.h && p.y + b.h > bp.y) {
          v.vy = -v.vy;
          const hp = this.ecs.get(bid, 'hp') - 1;
          if (hp <= 0) { this.ecs.remove(bid); this.score += 10; } else this.ecs.add(bid, 'hp', hp);
          break;
        }
      }
      if (p.y > H + 20) {
        this.ecs.entities.get(id).delete('stuck'); v.vx = v.vy = 0;
        p.x = pp.x + pb.w / 2 - 5; p.y = pp.y - 14;
      }
    }
    for (const id of this.ecs.query('kind', 'stuck', 'ball')) {
      if (this.ecs.get(id, 'kind') === 'ball') { const p = this.ecs.get(id, 'ball'); p.x = pp.x + pb.w / 2 - 5; p.y = pp.y - 14; }
    }
    const bricks = this.ecs.query('kind').filter(i => this.ecs.get(i, 'kind') === 'brick').length;
    if (bricks === 0) this.state = 'clear';
  }
  quads() {
    const W = this.width, H = this.height;
    const out = [{ x0: 0, y0: 0, x1: W, y1: H, color: COL.bg }];
    for (const id of this.ecs.query('kind', 'pos', 'box')) {
      const p = this.ecs.get(id, 'pos'), b = this.ecs.get(id, 'box'), k = this.ecs.get(id, 'kind');
      const c = k === 'paddle' ? COL.paddle : k === 'ball' ? COL.ball : COL.brick(this.ecs.get(id, 'hue'));
      out.push({ x0: p.x, y0: p.y, x1: p.x + b.w, y1: p.y + b.h, color: c });
    }
    return out;
  }
}
