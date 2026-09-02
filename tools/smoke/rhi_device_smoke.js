export const name = 'rhi-device-fallback';
import { createRenderDevice, detectBackends, RenderAPI } from '../../src/engine/render/rhi.js';

export async function run(t) {
  // Node 下无 WebGPU/WebGL2 → 自动降级到 Software
  const dev = await createRenderDevice('auto', { width: 32, height: 32 });
  t.ok(dev, 'device created');
  t.eq(dev.api, RenderAPI.Software, 'Node 下回退到 software 黄金后端');
  const snap = dev.snapshot();
  t.eq(snap.width, 32); t.eq(snap.height, 32);

  const det = await detectBackends();
  t.eq(det.software, true);
  // 强制指定 software
  const d2 = await createRenderDevice('software', { width: 16, height: 16 });
  t.eq(d2.api, 'software');
}
