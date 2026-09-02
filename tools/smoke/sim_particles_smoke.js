// 粒子系统 smoke：确定性发射/回收、bit-exact 复现、重力积分、burst、实例化实例产出。
import { ParticleSystem } from '../../src/engine/sim/particles.js';

export const name = 'sim_particles_smoke.js';

export async function run(t) {
  // 1) 发射速率确定性：rate=50/s，dt=0.1，3 步 = 15 个（min life 0.6 故均未死）
  const mk = () => new ParticleSystem({
    seed: 0xABCDEF, capacity: 2048,
    emitters: [{ rate: 50, lifetime: [0.6, 1.4], position: [0, 0, 0], velocity: [0, 1, 0] }],
  });
  const a = mk();
  for (let i = 0; i < 3; i++) a.update(0.1);
  t.eq(a.aliveCount, 15, '3 步(dt=0.1,rate=50) → 15 粒子');

  // 2) 确定性：同种子 → 完全相同状态
  const b = mk();
  for (let i = 0; i < 3; i++) b.update(0.1);
  const pa = a.toInstances(), pb = b.toInstances();
  t.eq(pa.count, pb.count, '两系统粒子数一致');
  let identical = true; for (let i = 0; i < pa.position.length; i++) if (pa.position[i] !== pb.position[i]) identical = false;
  t.ok(identical, '同种子位置 bit-exact（确定性）');

  // 3) 全死亡回收：用一次性 burst 发射后，运行足够久所有粒子寿命耗尽 → count=0（验证 swap-remove 回收）
  const d0 = new ParticleSystem({ seed: 0xABCDEF, capacity: 2048, emitters: [{ burst: 15, lifetime: [0.6, 1.4] }] });
  d0.update(0.1); // 一次性发出 15
  t.eq(d0.aliveCount, 15, 'burst 发射 15');
  for (let i = 0; i < 300; i++) d0.update(0.1);
  t.eq(d0.aliveCount, 0, '寿命耗尽后全部回收');
  t.eq(d0.totalEmitted, 15, '累计发射计数守恒');

  // 4) 重力积分：长寿命、无初速、向下重力 → 粒子必然下落且有限
  const g = new ParticleSystem({
    seed: 1, capacity: 64,
    emitters: [{ burst: 1, lifetime: [5, 5], position: [0, 10, 0], velocity: [0, 0, 0], velocitySpread: [0, 0, 0] }],
    gravity: [0, -9.8, 0],
  });
  g.update(0.1); // 一次性生成 1 个并积分一步
  const idx = 0;
  const y0 = g.py[idx];
  for (let i = 0; i < 10; i++) g.update(0.1); // +1.0s（共 1.1s）
  t.ok(g.py[idx] < y0 - 0.5, '重力下粒子高度下降');
  t.ok(g.py[idx] > 0 && isFinite(g.py[idx]), '高度有限且未穿地');

  // 5) 实例化产出形状 + 颜色插值（age≈0 → color0）
  const c = new ParticleSystem({
    seed: 7, capacity: 64,
    emitters: [{
      rate: 10, lifetime: [100, 100], position: [0, 0, 0],
      size: [0.2, 0.02], color: [[1, 0, 0, 1], [0, 0, 1, 0]],
    }],
  });
  c.update(0.1); // 1 个粒子，age≈0.1/1=0.1
  const inst = c.toInstances();
  t.eq(inst.count, c.aliveCount, 'toInstances 数量一致');
  t.ok(inst.size.length === inst.count, 'size 数组长度=count');
  t.ok(inst.color.length === inst.count * 4, 'color 数组长度=count*4');
  // age 小 → 颜色接近 color0=(1,0,0,1)
  t.near(inst.color[0], 1, 1e-3, '起始色 r≈1');
  t.near(inst.color[1], 0, 1e-3, '起始色 g≈0');
  // size 处于 [0.02,0.2] 区间
  t.ok(inst.size[0] <= 0.2 + 1e-6 && inst.size[0] >= 0.02 - 1e-6, 'size 在起止区间');

  // 6) burst 一次性发射
  const d = new ParticleSystem({
    seed: 3, capacity: 512,
    emitters: [{ burst: 100, loop: false, lifetime: [2, 2], position: [0, 0, 0] }],
  });
  d.update(0.016);
  t.eq(d.aliveCount, 100, 'burst=100 → 单帧发射 100');
  d.update(3.0); // 超过寿命
  t.eq(d.aliveCount, 0, 'burst 粒子寿命后回收');
}
