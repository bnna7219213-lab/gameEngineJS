// games/space_shooter/main.js —— 太空射击浏览器引导（唯一触碰 DOM 的层）。
// 职责：创建渲染设备（auto 降级）、键盘输入、固定步长驱动 game.js、
//       场景经引擎 RHI 绘制、HUD 叠加。
// 对应：C++ 版 samples 的 main 函数。
// 约定：import 无副作用，boot() 由页面脚本显式调用。

import { bootGame, presentFrame, ortho2D } from '../common.js';
import { SpaceShooterGame } from './game.js';

export async function boot() {
  const W = 480, H = 480;
  const canvas = document.getElementById('view');
  const hudBackend = document.getElementById('hud-backend');
  const hudState = document.getElementById('hud-state');
  const { device, batch } = await bootGame(canvas, hudBackend, W, H);

  const game = new SpaceShooterGame(20260902, { width: W, height: H });
  const keys = new Set();
  window.addEventListener('keydown', (e) => keys.add(e.code));
  window.addEventListener('keyup', (e) => keys.delete(e.code));

  const FIXED = 1 / 60;
  let acc = 0, last = performance.now();
  const mvp = ortho2D(W, H);

  function frame(now) {
    acc += Math.min(0.1, (now - last) / 1000);
    last = now;
    while (acc >= FIXED) {
      const input = {
        dx: (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0),
        dy: (keys.has('ArrowDown') || keys.has('KeyS') ? 1 : 0) - (keys.has('ArrowUp') || keys.has('KeyW') ? 1 : 0),
        fire: keys.has('Space') || keys.has('KeyJ')
      };
      game.update(FIXED, input);
      acc -= FIXED;
    }
    device.beginFrame();
    device.beginPass({ clearColor: [8, 10, 22, 255] });
    batch.begin();
    for (const q of game.quads()) batch.quad(q.x0, q.y0, q.x1, q.y1, q.color);
    batch.flush(mvp);
    device.endPass();
    device.endFrame();
    presentFrame(device, canvas);
    hudState.textContent = `分数 ${game.score}  生命 ${game.lives}  波次 ${game.wave}` +
      (game.state === 'gameover' ? '  [游戏结束，刷新重开]' : '');
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// 浏览器环境自动引导（Node 下不执行）
if (typeof document !== 'undefined') boot();
