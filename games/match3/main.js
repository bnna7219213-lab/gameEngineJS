// games/match3/main.js —— 三消浏览器引导（唯一触碰 DOM 的层）。
// 职责：创建渲染设备（auto 降级）、鼠标点选交换、驱动 game.js、
//       棋盘经引擎 RHI 绘制（每个宝石一个彩色圆角近似方块），HUD 叠加。
// 对应：C++ 版 samples 的 main 函数。
// 约定：import 无副作用，boot() 由页面脚本显式调用。

import { bootGame, presentFrame, ortho2D } from '../common.js';
import { Match3Game, BOARD_W, BOARD_H, GEM_COLORS } from './game.js';

export async function boot() {
  const CELL = 48, PAD = 24;
  const W = BOARD_W * CELL + PAD * 2, H = BOARD_H * CELL + PAD * 2;
  const canvas = document.getElementById('view');
  const hudBackend = document.getElementById('hud-backend');
  const hudState = document.getElementById('hud-state');
  const { device, batch } = await bootGame(canvas, hudBackend, W, H);

  const game = new Match3Game(20260902);
  let sel = null; // 已选中的格子 {x,y}
  let msg = '';

  canvas.addEventListener('mousedown', (e) => {
    const r = canvas.getBoundingClientRect();
    const px = (e.clientX - r.left) * (W / r.width) - PAD;
    const py = (e.clientY - r.top) * (H / r.height) - PAD;
    const x = Math.floor(px / CELL), y = Math.floor(py / CELL);
    if (x < 0 || y < 0 || x >= BOARD_W || y >= BOARD_H) return;
    if (!sel) { sel = { x, y }; return; }
    const res = game.trySwap(sel.x, sel.y, x, y);
    msg = res.ok ? (res.chain > 1 ? `连锁 x${res.chain}！` : '') : '无效交换';
    sel = null;
  });

  const mvp = ortho2D(W, H);

  function frame() {
    device.beginFrame();
    device.beginPass({ clearColor: [18, 20, 32, 255] });
    batch.begin();
    for (let y = 0; y < BOARD_H; y++) {
      for (let x = 0; x < BOARD_W; x++) {
        const gx = PAD + x * CELL, gy = PAD + y * CELL;
        batch.quad(gx, gy, gx + CELL - 2, gy + CELL - 2, [0.14, 0.15, 0.22]); // 格底
        const c = GEM_COLORS[game.get(x, y)];
        batch.quad(gx + 5, gy + 5, gx + CELL - 7, gy + CELL - 7, c);          // 宝石
        if (sel && sel.x === x && sel.y === y) {
          batch.quad(gx + 2, gy + 2, gx + CELL - 4, gy + 5, [1, 1, 1]);       // 选中高亮
        }
      }
    }
    batch.flush(mvp);
    device.endPass();
    device.endFrame();
    presentFrame(device, canvas);
    hudState.textContent = `分数 ${game.score}  步数 ${game.moves}  ${msg}` +
      (game.hasAnyMove() ? '' : '  [死局，刷新重开]');
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// 浏览器环境自动引导（Node 下不执行）
if (typeof document !== 'undefined') boot();
