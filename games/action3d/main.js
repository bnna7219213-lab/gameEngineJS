// games/action3d/main.js —— 3D 动作演示浏览器引导（唯一触碰 DOM 的层）。
// 职责：创建渲染设备（auto 降级，Software 后端兜底）、WASD 输入、固定步长驱
//       动 game.js，MVP 用引擎 Mat4 组装，场景经 RHI 绘制。
// 对应：C++ 版 samples 的 main 函数。
// 约定：import 无副作用，boot() 由页面脚本显式调用。

import { Mat4 } from '../../src/engine/core/math.js';
import { bootGame, presentFrame } from '../common.js';
import { Action3DGame } from './game.js';

export async function boot() {
  const W = 640, H = 400;
  const canvas = document.getElementById('view');
  const hudBackend = document.getElementById('hud-backend');
  const hudState = document.getElementById('hud-state');
  const { device, batch } = await bootGame(canvas, hudBackend, W, H);

  const game = new Action3DGame(20260902);
  const keys = new Set();
  window.addEventListener('keydown', (e) => keys.add(e.code));
  window.addEventListener('keyup', (e) => keys.delete(e.code));

  const FIXED = 1 / 60;
  let acc = 0, last = performance.now(), fps = 0, frames = 0, tFps = 0;

  function frame(now) {
    acc += Math.min(0.1, (now - last) / 1000);
    last = now;
    while (acc >= FIXED) {
      game.update(FIXED, {
        f: keys.has('KeyW') || keys.has('ArrowUp'),
        b: keys.has('KeyS') || keys.has('ArrowDown'),
        l: keys.has('KeyA') || keys.has('ArrowLeft'),
        r: keys.has('KeyD') || keys.has('ArrowRight')
      });
      acc -= FIXED;
    }
    // 跟随相机 + 透视投影（行主序：vp = proj · view）
    const cam = game.camera();
    const proj = Mat4.perspective(cam.fovy, W / H, cam.zn, cam.zf);
    const view = Mat4.lookAt(cam.eye, cam.center, cam.up);
    const mvp = proj.mul(view);

    device.beginFrame();
    device.beginPass({ clearColor: [22, 26, 40, 255] });
    batch.begin();
    game.renderTo(batch);
    batch.flush(mvp);
    device.endPass();
    device.endFrame();
    presentFrame(device, canvas);

    frames++; tFps += (now - last) / 1000;
    const p = game.player.pos;
    hudState.textContent = `位置 (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})  操作：WASD/方向键移动`;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// 浏览器环境自动引导（Node 下不执行）
if (typeof document !== 'undefined') boot();
