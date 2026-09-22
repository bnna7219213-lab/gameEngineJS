// plat_world_viewport smoke：World 数据块下发 Viewport3D（v3 M-E / M7）。
import { applyWorldToViewport } from '../../src/editor/viewport.js';
import { World } from '../../src/engine/platform/world.js';
import { Viewport3D } from '../../src/engine/render/viewport3d.js';

export const name = 'plat-world-viewport';
export async function run(t) {
  const vp = new Viewport3D(null, { width: 32, height: 32 });

  // 默认 World 下发
  applyWorldToViewport(vp, null);
  t.eq(vp.ambient.join(','), World.default().ambient.join(','), '默认 ambient 下发');
  t.eq(vp.fog, null, '默认无雾');
  t.ok(vp.lights.some(L => L.type === 0), '默认 sunDir -> 补方向光');

  // 自定义 World：雾 + IBL + ambient
  const w = World.default();
  w.ambient = [0.1, 0.2, 0.3];
  w.fog = { type: 'exp', density: 0.05, color: [0.5, 0.6, 0.7] };
  w.ibl = { sh: Array.from({ length: 9 }, () => [0, 0, 0]), avg: [0.2, 0.2, 0.2], intensity: 1.5 };
  applyWorldToViewport(vp, w);
  t.eq(vp.ambient[1], 0.2, '自定义 ambient');
  t.eq(vp.fog.type, 'exp', '雾下发');
  t.eq(vp.fog.density, 0.05, '雾密度');
  t.ok(vp.ibl && vp.ibl.intensity === 1.5, 'IBL 下发');

  // 已有方向光时不重复补
  const lightCount = vp.lights.filter(L => L.type === 0).length;
  applyWorldToViewport(vp, w);
  t.eq(vp.lights.filter(L => L.type === 0).length, lightCount, '不重复补方向光');

  // World 序列化往返后仍可下发
  const w2 = World.deserialize(w.serialize());
  applyWorldToViewport(vp, w2);
  t.eq(vp.fog.density, 0.05, '往返后雾一致');
}
