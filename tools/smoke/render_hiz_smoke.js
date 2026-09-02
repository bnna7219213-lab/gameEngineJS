// Hi-Z 遮挡剔除 smoke（CPU 参考核心：深度 mip 归约 + 遮挡查询）
import { HiZBuffer } from '../../src/engine/render/hiz.js';

export const name = 'render_hiz_smoke.js';
export async function run(t) {
  // 4x4 深度：左半(x<2) 近遮挡(0.2)，右半(x>=2) 远(0.9)
  const w = 4, h = 4;
  const depth = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) depth[y * w + x] = x < 2 ? 0.2 : 0.9;

  const hz = new HiZBuffer();
  hz.build(depth, w, h);
  t.ok(hz.mips.length >= 1, '生成 mip 链');

  // 顶层（最小）mip 取全图最小深度 = 0.2（左半为最近遮挡）
  const top = hz.mips[hz.mips.length - 1];
  t.ok(Math.abs(top[0] - 0.2) < 1e-6, '顶层最近深度 = 0.2');

  // 物体完全落在左半遮挡物(最近 0.2)之后（minZ=0.5 > 0.2）→ 被遮挡
  const occ = hz.isOccluded({ minX: -0.9, maxX: -0.1, minY: -0.1, maxY: 0.1, minZ: 0.5, maxZ: 0.8 });
  t.ok(occ, '物体在最近遮挡物之后 → 被遮挡');

  // 物体在遮挡物之前（minZ=0.1 < 0.2）→ 可见
  const visible = hz.isOccluded({ minX: -0.9, maxX: -0.1, minY: -0.1, maxY: 0.1, minZ: 0.1, maxZ: 0.3 });
  t.ok(!visible, '物体在遮挡物之前 → 可见');

  // 右半区域无遮挡（最近=0.9），物体 minZ=0.5 < 0.9 → 可见（空远区域不误剔）
  const occNear = hz.isOccluded({ minX: 0.1, maxX: 0.9, minY: -0.1, maxY: 0.1, minZ: 0.5, maxZ: 0.8 });
  t.ok(!occNear, '空远区域 → 不遮挡');
}
