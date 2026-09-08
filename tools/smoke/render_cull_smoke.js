// 视锥剔除 + LOD smoke（CPU 参考核心，与后端无关）
import { Frustum, Mat4, AABB, Vec3 } from '../../src/engine/core/math.js';
import { FrustumCuller, selectLOD } from '../../src/engine/render/cull.js';

export const name = 'render_cull_smoke.js';
export async function run(t) {
  const f = Frustum.fromViewProj(Mat4.identity()); // 单位 VP → 裁剪立方体 [-1,1]^3 视锥
  const inside = { aabb: new AABB(new Vec3(-0.5, -0.5, -0.5), new Vec3(0.5, 0.5, 0.5)) };
  const outside = { aabb: new AABB(new Vec3(2, 2, 2), new Vec3(3, 3, 3)) };

  const culler = new FrustumCuller(f);
  const res = culler.cull([inside, outside]);
  t.ok(res[0].visible, '框内对象可见');
  t.ok(!res[1].visible, '框外对象剔除');

  const vis = culler.visible([inside, outside]);
  t.eq(vis.length, 1, '仅 1 个对象可见');

  // LOD 阈值
  t.eq(selectLOD(10, [20, 50]), 0, '10 < 20 → LOD0');
  t.eq(selectLOD(30, [20, 50]), 1, '30 ∈ [20,50) → LOD1');
  t.eq(selectLOD(60, [20, 50]), 2, '60 > 50 → LOD2');

  // 带相机的 LOD 距离估算（真实透视视锥：相机 (0,0,5) 看向原点）
  const vp = Mat4.perspective(Math.PI / 3, 1, 0.1, 100).mul(Mat4.lookAt(Vec3.of(0, 0, 5), Vec3.of(0, 0, 0), Vec3.of(0, 1, 0)));
  const f2 = Frustum.fromViewProj(vp);
  const cam2 = new Vec3(0, 0, 5);
  const farObj = { aabb: new AABB(new Vec3(-1, -1, -26), new Vec3(1, 1, -24)), lodThresholds: [20, 50] };
  const c2 = new FrustumCuller(f2, cam2);
  const r2 = c2.cull([farObj])[0];
  t.ok(r2.visible, 'z=-25 处对象在视锥内可见');
  t.eq(r2.lod, 1, '距相机 ~30 → LOD1');
}
