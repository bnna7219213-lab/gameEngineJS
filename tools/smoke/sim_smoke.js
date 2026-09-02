export const name = 'sim';
import { ECS } from '../../src/engine/sim/ecs.js';
import { ArchetypeECS } from '../../src/engine/sim/ecs_archetype.js';
import { Body2D, step as step2d } from '../../src/engine/sim/physics.js';
import { Body3D, step as step3d, gjkIntersect, sphereSupport, boxSupport } from '../../src/engine/sim/physics3d.js';
import { createCloth, stepCloth } from '../../src/engine/sim/cloth.js';
import { rk4Scalar } from '../../src/engine/sim/solver_ode.js';
import { conjugateGradient } from '../../src/engine/sim/solver_linear.js';
import { heatStep, isStable } from '../../src/engine/sim/solver_pde.js';
import { createField, addDensity, step as fluidStep, totalDensity } from '../../src/engine/sim/fluid.js';
import { seek, FSM, Selector, Sequence, Action, Condition } from '../../src/engine/sim/ai.js';
import { Clip, sampleClip, blendPose } from '../../src/engine/sim/animation.js';

export async function run(t) {
  // ECS
  const ecs = new ECS(); const id = ecs.createEntity();
  ecs.add(id, 'pos', { x: 1 }); ecs.add(id, 'vel', { v: 2 });
  t.ok(ecs.has(id, 'pos')); t.eq(ecs.get(id, 'pos').x, 1);
  t.eq(ecs.query('pos', 'vel').length, 1);

  // Archetype ECS
  const a = new ArchetypeECS(); const aid = a.create(['pos', 'vel'], { pos: { x: 1 }, vel: { v: 2 } });
  t.eq(a.get(aid, 'pos').x, 1);
  t.eq(a.query('pos', 'vel').length, 1);

  // physics 2D
  const b = new Body2D(0, 10, 1); step2d([b], 0.1, 9.8);
  t.ok(b.y < 10 && b.y > 0, 'falls under gravity but stays above ground');

  // physics 3D + GJK
  const b1 = new Body3D(0, 10, 0, 1); step3d([b1], 0.1);
  t.ok(b1.pos.y < 10, '3D body falls');
  const sa = sphereSupport([0,0,0], 1), sb = sphereSupport([1.5,0,0], 1);
  t.ok(gjkIntersect(sa, sb), 'overlapping spheres intersect');
  t.ok(!gjkIntersect(sa, sphereSupport([3,0,0], 1)), 'separated spheres disjoint');
  const bx = boxSupport([0,0,0], [1,1,1]);
  t.ok(gjkIntersect(bx, sphereSupport([0.5,0,0], 1)), 'box overlaps inner sphere');
  t.ok(!gjkIntersect(bx, sphereSupport([5,0,0], 1)), 'box far from sphere');

  // cloth
  const cloth = createCloth(4, 4, 0.1, { top: true });
  const topY0 = cloth.pos[12 * 3 + 1];
  stepCloth(cloth, 0.016, 9.8, 5);
  t.eq(cloth.pos[12 * 3 + 1], topY0, 'pinned top row unchanged');
  let finite = true; for (let i = 0; i < cloth.pos.length; i++) if (!isFinite(cloth.pos[i])) finite = false;
  t.ok(finite, 'no NaN in cloth');

  // ODE: dy/dt=-2y, y(0)=1 -> y(0.5)=e^-1（5 步 dt=0.1，RK4 收敛到 e^-1）
  let yv = 1; for (let i = 0; i < 5; i++) yv = rk4Scalar((tt, y) => -2 * y, yv, i * 0.1, 0.1);
  t.near(yv, Math.exp(-1), 1e-3);

  // linear: solve [[4,1],[1,3]]x=[1,2]
  const A = [[4,1],[1,3]], B = [1,2];
  const x = conjugateGradient(A, B, [0, 0]);
  const Ax = [A[0][0]*x[0]+A[0][1]*x[1], A[1][0]*x[0]+A[1][1]*x[1]];
  t.vnear(Ax, B, 1e-6);

  // PDE heat: peak non-increasing
  const w = 5, h = 5; const g = new Float32Array(w * h).fill(0); g[12] = 1;
  const g2 = heatStep(g, w, h, 1, 0.1);
  let mb = -Infinity, ma = -Infinity; for (let i = 0; i < g.length; i++) { mb = Math.max(mb, g[i]); ma = Math.max(ma, g2[i]); }
  t.ok(ma <= mb + 1e-9, 'heat peak diffuses');
  t.ok(isStable(0.1, 1), 'explicit step stable');

  // fluid
  const f = createField(16, 16); addDensity(f, 8, 8, 5);
  const before = totalDensity(f); fluidStep(f, 0.1); const after = totalDensity(f);
  let ffin = true; for (let i = 0; i < f.dens.length; i++) if (!isFinite(f.dens[i])) ffin = false;
  t.ok(ffin); t.near(after, before, 1e-5, 'advection conserves with zero velocity');

  // AI
  const s = seek([0,0,0], [3,0,0]); t.near(s.x, 1, 1e-5); t.near(s.z, 0, 1e-5);
  const fsm = new FSM(); let entered = 0; fsm.add('patrol', { onEnter: () => entered++ }); fsm.start('patrol');
  t.eq(entered, 1);
  // Sequence 语义：所有子节点成功才返回 success，任一失败即短路返回该失败
  t.eq(new Sequence(new Action(() => 'success'), new Action(() => 'success')).run({}), 'success');
  t.eq(new Sequence(new Action(() => 'success'), new Action(() => 'failure')).run({}), 'failure');
  t.eq(new Selector(new Condition(() => false), new Action(() => 'success')).run({}), 'success');

  // animation
  const clip = new Clip('walk', 1, { arm: [{ t: 0, value: [0,0,0] }, { t: 1, value: [1,1,1] }] });
  t.vnear(sampleClip(clip, 0).arm, [0,0,0], 1e-9);
  t.vnear(sampleClip(clip, 0.5).arm, [0.5,0.5,0.5], 1e-9);
  t.vnear(blendPose({ arm: [0,0,0] }, { arm: [1,1,1] }, 0.5).arm, [0.5,0.5,0.5], 1e-9);
}
