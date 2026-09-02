// 游戏 AI：转向行为 + 有限状态机 + 行为树（参考实现）。
import { Vec3 } from '../core/math.js';

export function seek(agentPos, target) {
  const d = Vec3.fromArray(target).sub(Vec3.fromArray(agentPos));
  const l = d.len() || 1; return d.scale(1 / l);
}
export function flee(agentPos, target) {
  const d = Vec3.fromArray(agentPos).sub(Vec3.fromArray(target));
  const l = d.len() || 1; return d.scale(1 / l);
}
export function arrive(agentPos, target, slowR = 2) {
  const d = Vec3.fromArray(target).sub(Vec3.fromArray(agentPos));
  const dist = d.len();
  if (dist < 1e-5) return Vec3.zero();
  const speed = dist < slowR ? dist / slowR : 1;
  return d.scale(1 / dist * speed);
}

export class FSM {
  constructor() { this.states = {}; this.current = null; }
  add(name, def = {}) { this.states[name] = def; return this; }
  start(name) { if (this.states[name]) { this.current = name; this.states[name].onEnter && this.states[name].onEnter(); } return this; }
  transition(name) {
    if (!this.states[name] || name === this.current) return this;
    const cur = this.states[this.current];
    cur && cur.onExit && cur.onExit();
    this.current = name;
    this.states[name].onEnter && this.states[name].onEnter();
    return this;
  }
  update(ctx) { const s = this.states[this.current]; s && s.onUpdate && s.onUpdate(ctx); }
}

// ---- 行为树 ----
export class Sequence {
  constructor(...children) { this.children = children; }
  run(ctx) { for (const c of this.children) { const r = c.run(ctx); if (r !== 'success') return r; } return 'success'; }
}
export class Selector {
  constructor(...children) { this.children = children; }
  run(ctx) { for (const c of this.children) { const r = c.run(ctx); if (r === 'success' || r === 'running') return r; } return 'failure'; }
}
export class Action {
  constructor(fn) { this.fn = fn; }
  run(ctx) { return this.fn(ctx); }
}
export class Condition {
  constructor(fn) { this.fn = fn; }
  run(ctx) { return this.fn(ctx) ? 'success' : 'failure'; }
}
