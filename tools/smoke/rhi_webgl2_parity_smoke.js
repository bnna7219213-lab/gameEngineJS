// rhi-webgl2-parity：WebGL2 真 RHI 的契约守卫。
// Node 无 GL 上下文，无法在此做像素级 parity（由 tools/parity_browser.html 在浏览器中完成）；
// 本 smoke 仅做：① 模块可解析（捕获语法/导入错误）② 若环境具备 WebGL2 则实际初始化一次。
export const name = 'rhi-webgl2-parity';
import { WebGL2Device } from '../../src/engine/render/rhi_webgl2.js';
import { detectBackends } from '../../src/engine/render/rhi.js';

export async function run(t) {
  t.ok(typeof WebGL2Device === 'function', 'rhi_webgl2 模块可解析、WebGL2Device 已导出');

  const det = await detectBackends();
  if (!det.webgl2) {
    t.ok(true, 'Node 环境无 WebGL2：像素级 parity 由浏览器 parity_browser.html 验证（跳过）');
    return;
  }
  // 浏览器/有头环境下真正初始化一次，确认降级链之上的 WebGL2 设备可用
  const dev = new WebGL2Device();
  const ok = await dev.init({ width: 32, height: 32 });
  t.ok(ok, 'WebGL2 设备初始化成功');
  if (ok) dev.destroy();
}
