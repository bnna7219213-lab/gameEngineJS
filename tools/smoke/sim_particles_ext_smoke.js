// 粒子系统扩展 smoke（v3 M-E / M8）：发射器形状 / 力场 / 生命周期曲线 / 朝向对齐 / 确定性。
// 不动 sim_particles_smoke.js；本文件仅断言新增能力。
import { ParticleSystem } from '../../src/engine/sim/particles.js';

export const name = 'sim_particles_ext_smoke.js';

export async function run(t) {
  const dt = 0.05;

  // 1) sphere 发射器：位置在半径内（球内均匀），初速沿径向向外
  {
    const s = new ParticleSystem({
      seed: 11, capacity: 256, gravity: [0, 0, 0],
      emitters: [{ burst: 50, lifetime: [10, 10], position: [0, 0, 0], velocity: [0, 2, 0], velocitySpread: [0, 0, 0], shape: { type: 'sphere', radius: 2 } }],
    });
    s.update(dt);
    t.eq(s.aliveCount, 50, 'sphere burst 50');
    let posOk = true, dirOk = true;
    for (let i = 0; i < s.count; i++) {
      const d = Math.hypot(s.px[i], s.py[i], s.pz[i]);
      // update 在发射后积分一步：允许 speed*dt 的径向位移
      if (d > 2 + 2 * dt + 1e-3) posOk = false;
      // 速度方向与位置同向（外法线）
      const vl = Math.hypot(s.vx[i], s.vy[i], s.vz[i]);
      if (d > 1e-6 && vl > 1e-6) {
        const dot = (s.px[i] * s.vx[i] + s.py[i] * s.vy[i] + s.pz[i] * s.vz[i]) / (d * vl);
        if (dot < 1 - 1e-3) dirOk = false;
      }
    }
    t.ok(posOk, 'sphere：出生位置均在 radius 内');
    t.ok(dirOk, 'sphere：初速沿表面法线向外');
  }

  // 2) cone 发射器：初速与 +Y 轴夹角在半顶角内
  {
    const c = new ParticleSystem({
      seed: 22, capacity: 256, gravity: [0, 0, 0],
      emitters: [{ burst: 60, lifetime: [10, 10], velocity: [0, 3, 0], velocitySpread: [0, 0, 0], shape: { type: 'cone', angle: 25, radius: 1 } }],
    });
    c.update(dt);
    t.eq(c.aliveCount, 60, 'cone burst 60');
    const cosHalf = Math.cos((25 * Math.PI) / 180);
    let inCone = true, inDisc = true;
    for (let i = 0; i < c.count; i++) {
      const vl = Math.hypot(c.vx[i], c.vy[i], c.vz[i]);
      if (vl < 1e-9) continue;
      if (c.vy[i] / vl < cosHalf - 1e-4) inCone = false; // 与 +Y 夹角 ≤ 半顶角
      // 发射后积分一步：底面圆盘位置允许 speed*dt 的位移
      if (Math.hypot(c.px[i], c.pz[i]) > 1 + 3 * dt + 1e-3 || Math.abs(c.py[i]) > 3 * dt + 1e-3) inDisc = false;
    }
    t.ok(inCone, 'cone：初速方向均在半顶角 25° 内（轴 +Y）');
    t.ok(inDisc, 'cone：出生位置在底面半径圆盘内');
  }

  // 3) box / edge 发射器：位置在范围内
  {
    const b = new ParticleSystem({
      seed: 33, capacity: 256, gravity: [0, 0, 0],
      emitters: [{ burst: 40, lifetime: [10, 10], velocity: [0, 0, 0], velocitySpread: [0, 0, 0], shape: { type: 'box', extent: [1, 2, 3] } }],
    });
    b.update(dt);
    let boxOk = true;
    for (let i = 0; i < b.count; i++) {
      if (Math.abs(b.px[i]) > 1 + 1e-4 || Math.abs(b.py[i]) > 2 + 1e-4 || Math.abs(b.pz[i]) > 3 + 1e-4) boxOk = false;
    }
    t.ok(boxOk, 'box：出生位置均在 extent 内');
    const e2 = new ParticleSystem({
      seed: 34, capacity: 256, gravity: [0, 0, 0],
      emitters: [{ burst: 40, lifetime: [10, 10], velocity: [0, 0, 0], velocitySpread: [0, 0, 0], shape: { type: 'edge', length: 4 } }],
    });
    e2.update(dt);
    let edgeOk = true;
    for (let i = 0; i < e2.count; i++) {
      if (Math.abs(e2.px[i]) > 2 + 1e-4 || Math.abs(e2.py[i]) > 1e-4 || Math.abs(e2.pz[i]) > 1e-4) edgeOk = false;
    }
    t.ok(edgeOk, 'edge：出生位置在 X 轴线段 [-2,2] 上');
  }

  // 4) attract 力场：粒子被拉向场心（位移方向指向 position）
  {
    const a = new ParticleSystem({
      seed: 44, capacity: 64, gravity: [0, 0, 0],
      emitters: [{ burst: 1, lifetime: [10, 10], position: [10, 0, 0], velocity: [0, 0, 0], velocitySpread: [0, 0, 0] }],
      fields: [{ type: 'attract', position: [0, 0, 0], strength: 20, radius: 100 }],
    });
    a.update(dt); // 出生 + 积分一步
    const x0 = a.px[0], d0 = Math.hypot(a.px[0], a.py[0], a.pz[0]);
    for (let i = 0; i < 20; i++) a.update(dt);
    const d1 = Math.hypot(a.px[0], a.py[0], a.pz[0]);
    t.ok(d1 < d0 - 0.5, 'attract：粒子被拉向场心（距离显著减小）');
    t.ok(a.vx[0] < 0, 'attract：速度方向指向 position（-X）');
    t.ok(a.px[0] < x0, 'attract：X 位移朝场心');
  }

  // 5) wind 力场：沿 direction 加速
  {
    const w = new ParticleSystem({
      seed: 55, capacity: 64, gravity: [0, 0, 0],
      emitters: [{ burst: 1, lifetime: [10, 10], position: [0, 0, 0], velocity: [0, 0, 0], velocitySpread: [0, 0, 0] }],
      fields: [{ type: 'wind', direction: [1, 0, 0], strength: 10 }],
    });
    w.update(dt);
    for (let i = 0; i < 10; i++) w.update(dt);
    t.ok(w.vx[0] > 1, 'wind：沿 direction 持续加速 (vx>1)');
    t.near(w.vy[0], 0, 1e-6, 'wind：垂直方向无加速度');
    t.ok(w.px[0] > 0.5, 'wind：沿风向产生位移');
  }

  // 6) sizeCurve / colorCurve：按关键帧插值
  {
    const cv = new ParticleSystem({
      seed: 66, capacity: 64, gravity: [0, 0, 0],
      emitters: [{
        burst: 1, lifetime: [1, 1], velocity: [0, 0, 0], velocitySpread: [0, 0, 0],
        size: [9, 9], color: [[9, 9, 9, 9], [9, 9, 9, 9]], // 故意设怪值验证被曲线覆盖
        sizeCurve: [[0, 0], [0.5, 1], [1, 0]],
        colorCurve: [[0, [1, 0, 0, 1]], [1, [0, 0, 1, 0]]],
      }],
    });
    cv.update(0.5); // 1 步后 age=0.5 → t=0.5
    const inst = cv.toInstances();
    t.near(inst.size[0], 1, 1e-3, 'sizeCurve：t=0.5 → size=峰值 1');
    t.near(inst.color[0], 0.5, 1e-3, 'colorCurve：t=0.5 → r=0.5');
    t.near(inst.color[2], 0.5, 1e-3, 'colorCurve：t=0.5 → b=0.5');
    t.near(inst.color[3], 0.5, 1e-3, 'colorCurve：t=0.5 → a=0.5');
  }

  // 7) alignToVelocity：rotation 由速度方向推算
  {
    const al = new ParticleSystem({
      seed: 77, capacity: 64, gravity: [0, 0, 0],
      emitters: [{ burst: 1, lifetime: [10, 10], velocity: [1, 0, 0], velocitySpread: [0, 0, 0], alignToVelocity: true, rotation: 0 }],
    });
    al.update(dt);
    const inst = al.toInstances();
    t.near(inst.rotation[0], Math.PI / 2, 1e-3, 'alignToVelocity：+X 速度 → rotation=π/2');
  }

  // 8) 确定性：同 seed + 同 dt 序列（含形状/力场/曲线全开）→ 实例数据 bit 一致
  {
    const mk = () => new ParticleSystem({
      seed: 88, capacity: 512, gravity: [0, -1, 0],
      emitters: [{
        rate: 30, lifetime: [1, 3], shape: { type: 'cone', angle: 40, radius: 0.5 },
        velocity: [0, 2, 0], velocitySpread: [0.2, 0.2, 0.2],
        sizeCurve: [[0, 0.1], [1, 0.5]], alignToVelocity: true,
      }],
      fields: [
        { type: 'attract', position: [3, 2, 0], strength: 5, radius: 20 },
        { type: 'wind', direction: [0.5, 0, 0.2], strength: 2 },
        { type: 'vortex', position: [0, 0, 0], strength: 3, radius: 10, direction: [0, 1, 0] },
      ],
    });
    const s1 = mk(), s2 = mk();
    const dts = [0.016, 0.033, 0.05, 0.016, 0.1];
    for (const d of dts) { s1.update(d); s2.update(d); }
    const i1 = s1.toInstances(), i2 = s2.toInstances();
    t.eq(i1.count, i2.count, '确定性：粒子数一致');
    let bit = i1.position.length === i2.position.length;
    if (bit) {
      for (let i = 0; i < i1.position.length; i++) if (i1.position[i] !== i2.position[i]) { bit = false; break; }
      for (let i = 0; bit && i < i1.rotation.length; i++) if (i1.rotation[i] !== i2.rotation[i]) bit = false;
      for (let i = 0; bit && i < i1.color.length; i++) if (i1.color[i] !== i2.color[i]) bit = false;
      for (let i = 0; bit && i < i1.size.length; i++) if (i1.size[i] !== i2.size[i]) bit = false;
    }
    t.ok(bit, '确定性：同 seed 同 dt 序列 → position/rotation/color/size bit-exact');
  }
}
