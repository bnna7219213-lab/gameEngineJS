// 粒子系统（P4）：CPU 模拟核心，确定性 Rng 驱动。产物为供实例化渲染（billboard quad）的实例数据。
// SoA 存储 + swap-remove 回收；所有随机来自 Rng，故同种子 + 同 dt 序列 → 跨端 bit-exact。
// 不依赖任何后端；实际绘制由渲染层把 toInstances() 喂给 instanced draw（见 rhi_webgl2 drawIndexed 的 instanceCount）。
import { Rng } from '../core/math.js';

const lerp = (a, b, t) => a + (b - a) * t;

function normEmitter(e = {}) {
  return {
    rate: e.rate != null ? e.rate : 0,        // 每秒粒子数（>0 持续发射）
    burst: e.burst != null ? e.burst : 0,     // 一次性总发射量（>0 时 rate 失效，发完即止）
    loop: e.loop != null ? e.loop : (e.burst > 0 ? false : true),
    lifetime: e.lifetime || [0.6, 1.4],
    position: e.position || [0, 0, 0],
    positionSpread: e.positionSpread || [0, 0, 0],
    velocity: e.velocity || [0, 1, 0],
    velocitySpread: e.velocitySpread || [0, 0, 0],
    size: e.size || [0.12, 0.02],             // [start, end] 世界尺寸
    color: e.color || [[1, 1, 1, 1], [1, 1, 1, 0]], // [start, end] rgba 0..1
    rotation: e.rotation || 0,
    rotationSpread: e.rotationSpread || 0,
    angularVelocity: e.angularVelocity || 0,
    enabled: e.enabled !== false,
  };
}

export class ParticleSystem {
  constructor(opts = {}) {
    this.capacity = Math.max(1, opts.capacity || 2048);
    this.rng = new Rng(opts.seed != null ? opts.seed : 0x9E3779B9);
    this.gravity = opts.gravity || [0, -9.8, 0];
    this.damping = opts.damping != null ? opts.damping : 0; // 每秒速度阻尼系数
    this.maxAge = opts.maxAge != null ? opts.maxAge : 30;   // 安全阀：极端情况下强制回收
    this.emitters = (opts.emitters && opts.emitters.length ? opts.emitters : [{}]).map(normEmitter);

    const n = this.capacity;
    this.px = new Float32Array(n); this.py = new Float32Array(n); this.pz = new Float32Array(n);
    this.vx = new Float32Array(n); this.vy = new Float32Array(n); this.vz = new Float32Array(n);
    this.age = new Float32Array(n); this.life = new Float32Array(n);
    this.size0 = new Float32Array(n); this.size1 = new Float32Array(n);
    this.cr0 = new Float32Array(n); this.cg0 = new Float32Array(n); this.cb0 = new Float32Array(n); this.ca0 = new Float32Array(n);
    this.cr1 = new Float32Array(n); this.cg1 = new Float32Array(n); this.cb1 = new Float32Array(n); this.ca1 = new Float32Array(n);
    this.rot = new Float32Array(n); this.angVel = new Float32Array(n);
    this.count = 0;
    this._acc = this.emitters.map(() => 0);   // 每发射器小数累加器
    this._burstLeft = this.emitters.map(e => (e.burst > 0 ? e.burst : 0));
    this.totalEmitted = 0;
  }

  get aliveCount() { return this.count; }

  _spawn(e) {
    if (this.count >= this.capacity) return false;
    const i = this.count;
    const r = this.rng;
    const life = r.range(e.lifetime[0], e.lifetime[1]);
    this.age[i] = 0; this.life[i] = life;
    this.px[i] = e.position[0] + (r.next() * 2 - 1) * e.positionSpread[0];
    this.py[i] = e.position[1] + (r.next() * 2 - 1) * e.positionSpread[1];
    this.pz[i] = e.position[2] + (r.next() * 2 - 1) * e.positionSpread[2];
    this.vx[i] = e.velocity[0] + (r.next() * 2 - 1) * e.velocitySpread[0];
    this.vy[i] = e.velocity[1] + (r.next() * 2 - 1) * e.velocitySpread[1];
    this.vz[i] = e.velocity[2] + (r.next() * 2 - 1) * e.velocitySpread[2];
    this.size0[i] = e.size[0]; this.size1[i] = e.size[1];
    this.cr0[i] = e.color[0][0]; this.cg0[i] = e.color[0][1]; this.cb0[i] = e.color[0][2]; this.ca0[i] = e.color[0][3];
    this.cr1[i] = e.color[1][0]; this.cg1[i] = e.color[1][1]; this.cb1[i] = e.color[1][2]; this.ca1[i] = e.color[1][3];
    this.rot[i] = e.rotation + (r.next() * 2 - 1) * e.rotationSpread;
    this.angVel[i] = e.angularVelocity;
    this.count++;
    this.totalEmitted++;
    return true;
  }

  // 推进 dt 秒。emission 与 integration 顺序固定，保证确定性。
  update(dt) {
    // 1) 发射
    for (let k = 0; k < this.emitters.length; k++) {
      const e = this.emitters[k];
      if (!e.enabled) continue;
      if (e.burst > 0) {
        let left = this._burstLeft[k];
        while (left > 0 && this._spawn(e)) left--;
        this._burstLeft[k] = left;
      } else if (e.loop && e.rate > 0) {
        this._acc[k] += e.rate * dt;
        while (this._acc[k] >= 1 && this._spawn(e)) this._acc[k] -= 1;
      }
    }
    // 2) 积分（确定性，不动 Rng）
    const g = this.gravity, d = Math.max(0, 1 - this.damping * dt);
    for (let i = 0; i < this.count; i++) {
      this.age[i] += dt;
      this.vx[i] = this.vx[i] * d + g[0] * dt;
      this.vy[i] = this.vy[i] * d + g[1] * dt;
      this.vz[i] = this.vz[i] * d + g[2] * dt;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      this.rot[i] += this.angVel[i] * dt;
    }
    // 3) 回收（swap-remove 紧凑化活动区间 [0,count)）
    let w = 0;
    for (let r2 = 0; r2 < this.count; r2++) {
      if (this.age[r2] < this.life[r2] && this.age[r2] < this.maxAge) {
        if (w !== r2) this._move(r2, w);
        w++;
      }
    }
    this.count = w;
  }

  _move(from, to) {
    if (from === to) return;
    this.px[to] = this.px[from]; this.py[to] = this.py[from]; this.pz[to] = this.pz[from];
    this.vx[to] = this.vx[from]; this.vy[to] = this.vy[from]; this.vz[to] = this.vz[from];
    this.age[to] = this.age[from]; this.life[to] = this.life[from];
    this.size0[to] = this.size0[from]; this.size1[to] = this.size1[from];
    this.cr0[to] = this.cr0[from]; this.cg0[to] = this.cg0[from]; this.cb0[to] = this.cb0[from]; this.ca0[to] = this.ca0[from];
    this.cr1[to] = this.cr1[from]; this.cg1[to] = this.cg1[from]; this.cb1[to] = this.cb1[from]; this.ca1[to] = this.ca1[from];
    this.rot[to] = this.rot[from]; this.angVel[to] = this.angVel[from];
  }

  // 当前插值后的实例数据（供实例化 billboard 渲染）
  toInstances() {
    const n = this.count;
    const position = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const color = new Float32Array(n * 4);
    const rotation = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = this.life[i] > 0 ? Math.min(1, this.age[i] / this.life[i]) : 1;
      position[i * 3] = this.px[i]; position[i * 3 + 1] = this.py[i]; position[i * 3 + 2] = this.pz[i];
      size[i] = lerp(this.size0[i], this.size1[i], t);
      color[i * 4] = lerp(this.cr0[i], this.cr1[i], t);
      color[i * 4 + 1] = lerp(this.cg0[i], this.cg1[i], t);
      color[i * 4 + 2] = lerp(this.cb0[i], this.cb1[i], t);
      color[i * 4 + 3] = lerp(this.ca0[i], this.ca1[i], t);
      rotation[i] = this.rot[i];
    }
    return { count: n, position, size, color, rotation };
  }
}
