export const name = 'editor-viewport-gpu';
import { pickViewportBackend } from '../../src/engine/render/rhi.js';
import { createViewportDevice } from '../../src/editor/viewport.js';
import { Viewport3D } from '../../src/engine/render/viewport3d.js';

export async function run(t) {
  // 1) 后端选择真值表
  const det = { webgl2: true, software: true };
  t.eq(pickViewportBackend(det), 'webgl2', '自动：webgl2 可用时优先 GPU');
  t.eq(pickViewportBackend(det, { forceSoftware: true }), 'software', 'forceSoftware 优先');
  t.eq(pickViewportBackend(det, { forceGPU: true }), 'webgl2', 'forceGPU 且可用 → webgl2');
  const detNo = { webgl2: false, software: true };
  t.eq(pickViewportBackend(detNo), 'software', '无 webgl2 → software');
  t.eq(pickViewportBackend(detNo, { forceGPU: true }), 'software', 'forceGPU 但不可用 → 回退 software（红线 D）');
  t.eq(pickViewportBackend(null), 'software', '探测结果缺失 → software 兜底');

  // 2) 设备创建：Node 无 GL，webgl2 必须安全回退 null（绝不抛错，红线 A）
  const dev = await createViewportDevice('webgl2');
  t.eq(dev, null, 'Node 下 webgl2 设备创建安全回退 null');
  const sw = await createViewportDevice('software');
  t.eq(sw, null, 'software 显式返回 null（软渲染由 Viewport3D 自建）');

  // 3) Viewport3D 软渲染仍正常：unlit 补 glsl 不应破坏 Software 黄金路径
  const vp = new Viewport3D(null, { width: 64, height: 64 });
  vp.setCamera({ eye: [0, 0, 5], target: [0, 0, 0] });
  vp.addMesh({
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    indices: new Uint32Array([0, 1, 2]),
    albedo: [200, 180, 120],
  });
  const rgba = vp.renderToRGBA8();
  t.eq(rgba.length, 64 * 64 * 4, '软渲染输出尺寸正确');
  let nonClear = 0;
  for (let i = 0; i < rgba.length; i += 4) if (!(rgba[i] === 18 && rgba[i + 1] === 18 && rgba[i + 2] === 26)) nonClear++;
  t.ok(nonClear > 0, '软渲染仍光栅化网格（unlit glsl 未破坏 Software 路径）');

  // 4) 无灯光场景走 unlit：构造后渲染不崩（验证 _shader 同时含 js+glsl 时 Software 仍可用）
  const vp2 = new Viewport3D(null, { width: 32, height: 32 });
  vp2.setCamera({ eye: [0, 0, 4], target: [0, 0, 0] });
  vp2.addMesh({ positions: new Float32Array([-1, -1, 0, 1, -1, 0, 0, 1, 0]), indices: new Uint32Array([0, 1, 2]), albedo: [120, 200, 120] });
  t.ok(vp2.renderToRGBA8().length === 32 * 32 * 4, '无灯光 unlit 路径软渲染正常');
}
