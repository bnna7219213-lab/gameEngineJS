// contracts smoke：把红线 A 的 IRHIContract 作为可执行的 Node 回归门。
// 任何后端都要通过该契约；此处验证 Software（黄金参考）满足之，
// 包括 0..1 浮点 / 0..255 双约定 clearColor 与 writeBuffer(buf,data)。
export const name = 'contracts';
import { SoftwareDevice } from '../../src/engine/render/rhi_software.js';
import { IRHIContract } from '../../src/engine/core/contracts.js';

export async function run(t) {
  const dev = new SoftwareDevice();
  await dev.init({ width: 48, height: 48 });
  const r = IRHIContract.run(dev);
  t.ok(r.ok, 'IRHIContract 在 Software 后端全通过' + (r.ok ? '' : ' :: ' + r.messages.join('; ')));
  dev.destroy();
}
