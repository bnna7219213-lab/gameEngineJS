// 粒子系统（P4 / v3 M-E·M8 扩展）：CPU 模拟核心，确定性 Rng 驱动。产物为供实例化渲染（billboard quad）的实例数据。
// SoA 存储 + swap-remove 回收；所有随机来自 Rng，故同种子 + 同 dt 序列 → 跨端 bit-exact。
// 不依赖任何后端；实际绘制由渲染层把 toInstances() 喂给 instanced draw（见 rhi_webgl2 drawIndexed 的 instanceCount）。
//
// 扩展能力（全部向后兼容，缺省行为与旧版逐字节一致）：
//   1) 发射器形状 shape：'point'(默认) | 'sphere' | 'cone' | 'box' | 'edge'，决定出生位置与初速方向；
//   2) 力场 fields：gravity / wind / vortex / attract，radius 内线性衰减；
//   3) 生命周期曲线 sizeCurve / colorCurve：[[t,v]..] 关键帧，替代线性 lerp；
//   4) alignToVelocity：实例 rotation 由速度方向推算（billboard 朝向速度）。
import { Rng } from '../core/math.js';

const lerp = (a, b, t) => a + (b - a) * t;

// 关键帧曲线采样：keys=[[t,v]..]（t∈[0,1]，v 为标量或数组），线性插值，端点外截断。
function sampleCurve(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  const last = keys[keys.length - 1];
  if (t >= last[0]) return last[1];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [t0, v0] = keys[i - 1], [t1, v1] = keys[i];
      const k = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
      if (Array.isArray(v0)) return v0.map((a, j) => lerp(a, v1[j], k));
      return lerp(v0, v1, k);
    }
  }
  return last[1];
}

// 发射器形状归一化（默认 point = 旧行为，不额外消耗 Rng）
function normShape(s) {
  if (!s || s === 'point') return { type: 'point' };
  const o = typeof s === 'string' ? { type: s } : s;
  const out = { type: o.type || 'point' };
  if (o.radius != null) out.radius = o.radius;
  if (o.angle != null) out.angle = o.angle;         // cone 半顶角（度）
  if (o.extent) out.extent = o.extent;              // box 半尺寸 [x,y,z]
  if (o.length != null) out.length = o.length;      // edge 线段长（沿 X）
  return out;
}

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
    shape: normShape(e.shape),                // 发射器形状
    sizeCurve: e.sizeCurve || null,           // [[t,size]..] 覆盖 size lerp
    colorCurve: e.colorCurve || null,         // [[t,[r,g,b,a]]..] 覆盖 color lerp
    alignToVelocity: e.alignToVelocity === true, // rotation 对齐速度方向
  };
}

// 力场归一化：F = strength * falloff(dist)，falloff 在 radius 内线性 1→0（radius 缺省 = 无限全域）
function normField(f = {}) {
  return {
    type: f.type || 'gravity',
    position: f.position || [0, 0, 0],
    strength: f.strength != null ? f.strength : 1,
    radius: f.radius != null ? f.radius : Infinity,
    direction: f.direction || (f.type === 'wind' ? [1, 0, 0] : [0, -1, 0]), // wind/gravity 方向；vortex 复用为轴
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
    this.fields = (opts.fields || []).map(normField);       // 力场列表（可选）

    const n = this.capacity;
    this.px = new Float32Array(n); this.py = new Float32Array(n); this.pz = new Float32Array(n);
    this.vx = new Float32Array(n); this.vy = new Float32Array(n); this.vz = new Float32Array(n);
    this.age = new Float32Array(n); this.life = new Float32Array(n);
    this.size0 = new Float32Array(n); this.size1 = new Float32Array(n);
    this.cr0 = new Float32Array(n); this.cg0 = new Float32Array(n); this.cb0 = new Float32Array(n); this.ca0 = new Float32Array(n);
    this.cr1 = new Float32Array(n); this.cg1 = new Float32Array(n); this.cb1 = new Float32Array(n); this.ca1 = new Float32Array(n);
    this.rot = new Float32Array(n); this.angVel = new Float32Array(n);
    this.emitIdx = new Uint16Array(n); // 每粒子所属发射器（供曲线/对齐查询）
    this.count = 0;
    this._acc = this.emitters.map(() => 0);   // 每发射器小数累加器
    this._burstLeft = this.emitters.map(e => (e.burst > 0 ? e.burst : 0));
    this.totalEmitted = 0;
  }

  get aliveCount() { return this.count; }

  // 按发射器形状确定出生位置与初速方向（非 point 才消耗 Rng，point 保持旧消耗序列）。
  // 约定：sphere/cone 初速方向 = 沿表面法线向外，速率取基础采样的速度模长；box/edge 只影响位置。
  _applyShape(e, i) {
    const s = e.shape, r = this.rng;
    if (s.type === 'point') return;
    const speed = Math.hypot(this.vx[i], this.vy[i], this.vz[i]);
    if (s.type === 'sphere') {
      const radius = s.radius != null ? s.radius : 1;
      // 球面均匀方向
      const z = r.next() * 2 - 1;
      const a = r.next() * Math.PI * 2;
      const rr = Math.sqrt(Math.max(0, 1 - z * z));
      const dx = rr * Math.cos(a), dy = rr * Math.sin(a), dz = z;
      // 球体内均匀（cbrt 径向分布）
      const rad = radius * Math.cbrt(r.next());
      this.px[i] = e.position[0] + dx * rad;
      this.py[i] = e.position[1] + dy * rad;
      this.pz[i] = e.position[2] + dz * rad;
      this.vx[i] = dx * speed; this.vy[i] = dy * speed; this.vz[i] = dz * speed;
    } else if (s.type === 'cone') {
      const half = ((s.angle != null ? s.angle : 30) * Math.PI) / 180; // 半顶角，轴 = +Y
      const radius = s.radius != null ? s.radius : 0;
      // 锥内均匀方向：cosθ ∈ [cos(half), 1]
      const cosT = 1 - r.next() * (1 - Math.cos(half));
      const sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT));
      const a = r.next() * Math.PI * 2;
      const dx = sinT * Math.cos(a), dy = cosT, dz = sinT * Math.sin(a);
      // 底面圆盘内均匀出生位置
      const rr = radius * Math.sqrt(r.next());
      const pa = r.next() * Math.PI * 2;
      this.px[i] = e.position[0] + rr * Math.cos(pa);
      this.py[i] = e.position[1];
      this.pz[i] = e.position[2] + rr * Math.sin(pa);
      this.vx[i] = dx * speed; this.vy[i] = dy * speed; this.vz[i] = dz * speed;
    } else if (s.type === 'box') {
      const ex = s.extent || [1, 1, 1];
      this.px[i] = e.position[0] + (r.next() * 2 - 1) * ex[0];
      this.py[i] = e.position[1] + (r.next() * 2 - 1) * ex[1];
      this.pz[i] = e.position[2] + (r.next() * 2 - 1) * ex[2];
    } else if (s.type === 'edge') {
      const len = s.length != null ? s.length : 1;
      this.px[i] = e.position[0] + (r.next() * 2 - 1) * len * 0.5;
      this.py[i] = e.position[1];
      this.pz[i] = e.position[2];
    }
  }

  _spawn(e, k) {
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
    this._applyShape(e, i); // 非 point 形状覆盖位置/方向
    this.size0[i] = e.size[0]; this.size1[i] = e.size[1];
    this.cr0[i] = e.color[0][0]; this.cg0[i] = e.color[0][1]; this.cb0[i] = e.color[0][2]; this.ca0[i] = e.color[0][3];
    this.cr1[i] = e.color[1][0]; this.cg1[i] = e.color[1][1]; this.cb1[i] = e.color[1][2]; this.ca1[i] = e.color[1][3];
    this.rot[i] = e.rotation + (r.next() * 2 - 1) * e.rotationSpread;
    this.angVel[i] = e.angularVelocity;
    this.emitIdx[i] = k;
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
        while (left > 0 && this._spawn(e, k)) left--;
        this._burstLeft[k] = left;
      } else if (e.loop && e.rate > 0) {
        this._acc[k] += e.rate * dt;
        while (this._acc[k] >= 1 && this._spawn(e, k)) this._acc[k] -= 1;
      }
    }
    // 2) 积分（确定性，不动 Rng）：阻尼 + 全局重力 + 力场
    const g = this.gravity, d = Math.max(0, 1 - this.damping * dt);
    const fields = this.fields;
    for (let i = 0; i < this.count; i++) {
      this.age[i] += dt;
      this.vx[i] = this.vx[i] * d + g[0] * dt;
      this.vy[i] = this.vy[i] * d + g[1] * dt;
      this.vz[i] = this.vz[i] * d + g[2] * dt;
      // 力场叠加（质量=1，F 即加速度）
      for (let fi = 0; fi < fields.length; fi++) {
        const f = fields[fi];
        const ox = this.px[i] - f.position[0];
        const oy = this.py[i] - f.position[1];
        const oz = this.pz[i] - f.position[2];
        const dist = Math.hypot(ox, oy, oz);
        const fall = f.radius === Infinity ? 1 : (dist < f.radius ? 1 - dist / f.radius : 0);
        if (fall <= 0) continue;
        const s = f.strength * fall;
        if (f.type === 'attract') {
          if (dist > 1e-9) {
            const inv = s / dist;
            this.vx[i] -= ox * inv * dt;
            this.vy[i] -= oy * inv * dt;
            this.vz[i] -= oz * inv * dt;
          }
        } else if (f.type === 'wind' || f.type === 'gravity') {
          this.vx[i] += f.direction[0] * s * dt;
          this.vy[i] += f.direction[1] * s * dt;
          this.vz[i] += f.direction[2] * s * dt;
        } else if (f.type === 'vortex') {
          // 绕 axis（默认 +Y，复用 direction）的切向力：t = normalize(cross(axis, offset))
          const ax = f.direction[0], ay = f.direction[1], az = f.direction[2];
          const tx = ay * oz - az * oy;
          const ty = az * ox - ax * oz;
          const tz = ax * oy - ay * ox;
          const tl = Math.hypot(tx, ty, tz);
          if (tl > 1e-9) {
            const inv = s / tl;
            this.vx[i] += tx * inv * dt;
            this.vy[i] += ty * inv * dt;
            this.vz[i] += tz * inv * dt;
          }
        }
      }
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
    this.emitIdx[to] = this.emitIdx[from];
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
      const e = this.emitters[this.emitIdx[i]];
      position[i * 3] = this.px[i]; position[i * 3 + 1] = this.py[i]; position[i * 3 + 2] = this.pz[i];
      if (e && e.sizeCurve) {
        size[i] = sampleCurve(e.sizeCurve, t);
      } else {
        size[i] = lerp(this.size0[i], this.size1[i], t);
      }
      if (e && e.colorCurve) {
        const c = sampleCurve(e.colorCurve, t);
        color[i * 4] = c[0]; color[i * 4 + 1] = c[1]; color[i * 4 + 2] = c[2]; color[i * 4 + 3] = c[3];
      } else {
        color[i * 4] = lerp(this.cr0[i], this.cr1[i], t);
        color[i * 4 + 1] = lerp(this.cg0[i], this.cg1[i], t);
        color[i * 4 + 2] = lerp(this.cb0[i], this.cb1[i], t);
        color[i * 4 + 3] = lerp(this.ca0[i], this.ca1[i], t);
      }
      // 朝向对齐：rotation 取速度在 XY 平面相对 +Y 的夹角（billboard 平面内旋转）
      rotation[i] = (e && e.alignToVelocity)
        ? Math.atan2(this.vx[i], this.vy[i])
        : this.rot[i];
    }
    return { count: n, position, size, color, rotation };
  }
}
