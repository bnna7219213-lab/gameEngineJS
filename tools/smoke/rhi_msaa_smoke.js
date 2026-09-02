// MSAA smoke：验证 WebGL2 多重采样 RT API 存在，且 Node 无 GL 时优雅降级（红线 E）。
// 真实 MSAA 解析（renderbufferStorageMultisample + blitFramebuffer）在浏览器 parity 页验收。
import { WebGL2Device } from '../../src/engine/render/rhi_webgl2.js';

export const name = 'rhi_msaa_smoke.js';
export async function run(t) {
  const d = new WebGL2Device();
  t.ok(typeof d.createRenderTarget === 'function', 'createRenderTarget 是方法');
  t.ok(typeof d.resolveRenderTarget === 'function', 'resolveRenderTarget 是方法');
  t.ok(d.caps.maxMRT >= 1, '支持多渲染目标（MSAA 解析目标前提）');
  const ok = await d.init({ width: 8, height: 8 });
  t.ok(ok === false, 'Node 无 GL → init 优雅降级 false');
}
