// sim_constraint smoke：对象约束求解（v3 M-D）。
import { solveConstraint, solveConstraints, CONSTRAINT_TYPES } from '../../src/engine/sim/constraint.js';
import { Scene3D, GameObject3D } from '../../src/engine/platform/scene3d.js';

export const name = 'sim-constraint';
function mk(name, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) {
  const o = new GameObject3D(name);
  o.transform.position = [...p]; o.transform.rotation = [...r]; o.transform.scale = [...s];
  return o;
}

export async function run(t) {
  t.ok(CONSTRAINT_TYPES.includes('COPY_TRANSFORMS') && CONSTRAINT_TYPES.includes('TRACK_TO'), '约束类型表');

  const scene = new Scene3D();
  const target = mk('target', [10, 5, -3], [0, 90, 0], [2, 2, 2]);
  const obj = mk('obj');
  scene.add(target); scene.add(obj);

  // COPY_LOCATION（influence=1 完全复制）
  obj.constraints = [{ type: 'COPY_LOCATION', target: target.id }];
  solveConstraints(scene);
  t.eq(obj.transform.position.join(','), '10,5,-3', 'COPY_LOCATION 复制位置');

  // influence=0.5 插值
  obj.transform.position = [0, 0, 0];
  obj.constraints = [{ type: 'COPY_LOCATION', target: target.id, influence: 0.5 }];
  solveConstraints(scene);
  t.eq(obj.transform.position[0], 5, 'influence=0.5 位置插值一半');

  // COPY_ROTATION / COPY_SCALE
  obj.constraints = [{ type: 'COPY_ROTATION', target: target.id }, { type: 'COPY_SCALE', target: target.id }];
  solveConstraints(scene);
  t.eq(obj.transform.rotation[1], 90, 'COPY_ROTATION');
  t.eq(obj.transform.scale[0], 2, 'COPY_SCALE');

  // COPY_TRANSFORMS 一次复制三项
  obj.transform.position = [0, 0, 0]; obj.transform.rotation = [0, 0, 0]; obj.transform.scale = [1, 1, 1];
  obj.constraints = [{ type: 'COPY_TRANSFORMS', target: target.id }];
  solveConstraints(scene);
  t.ok(obj.transform.position[0] === 10 && obj.transform.rotation[1] === 90 && obj.transform.scale[0] === 2, 'COPY_TRANSFORMS 三项同时复制');

  // TRACK_TO：target 在 +X 方向 -> yaw≈90
  const looker = mk('looker', [0, 0, 0]);
  const east = mk('east', [10, 0, 0]);
  scene.add(looker); scene.add(east);
  looker.constraints = [{ type: 'TRACK_TO', target: east.id }];
  solveConstraints(scene);
  t.ok(Math.abs(looker.transform.rotation[1] - 90) < 1e-6, 'TRACK_TO 朝 +X yaw=90');

  // LIMIT_LOCATION：钳制 y<=2
  const limited = mk('limited', [0, 10, 0]);
  scene.add(limited);
  limited.constraints = [{ type: 'LIMIT_LOCATION', max: [null, 2, null] }];
  solveConstraints(scene);
  t.eq(limited.transform.position[1], 2, 'LIMIT_LOCATION 钳制 y');
  t.eq(limited.transform.position[0], 0, '未限制轴不变');

  // LIMIT_SCALE：min
  const scaled = mk('scaled', [0, 0, 0], [0, 0, 0], [0.1, 5, 1]);
  scene.add(scaled);
  scaled.constraints = [{ type: 'LIMIT_SCALE', min: [0.5, null, null] }];
  solveConstraints(scene);
  t.eq(scaled.transform.scale[0], 0.5, 'LIMIT_SCALE min 钳制');
  t.eq(scaled.transform.scale[1], 5, '未限制轴保留');

  // enabled=false 跳过
  obj.constraints = [{ type: 'COPY_LOCATION', target: target.id, enabled: false }];
  obj.transform.position = [1, 1, 1];
  solveConstraints(scene);
  t.eq(obj.transform.position[0], 1, 'enabled=false 不生效');

  // 未知类型抛错（红线 A）
  let threw = false;
  try { solveConstraint(obj, { type: 'NOPE' }, scene); } catch (e) { threw = /未知约束/.test(e.message); }
  t.ok(threw, '未知约束类型抛可读错误');

  // 缺 target 抛错
  let threw2 = false;
  try { solveConstraint(obj, { type: 'COPY_LOCATION' }, scene); } catch (e) { threw2 = /target/.test(e.message); }
  t.ok(threw2, '缺 target 抛可读错误');

  // 返回值：生效约束数
  const n = solveConstraints(scene);
  t.ok(typeof n === 'number' && n >= 0, 'solveConstraints 返回生效数');
}
