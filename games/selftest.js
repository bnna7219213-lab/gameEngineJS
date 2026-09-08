// games/selftest.js —— 游戏核心逻辑的 Node 最小自测（不触碰 DOM/RHI）。
// 职责：验证四个 game.js 模块可在 Node import，核心玩法逻辑正确且确定性。
// 运行：node games/selftest.js
// 约定：契约 §2 要求一律 .js 扩展名（package.json 已 "type":"module"），故不使用 .mjs。

import { BreakoutGame } from './breakout/game.js';
import { SpaceShooterGame } from './space_shooter/game.js';
import { Match3Game, BOARD_W, BOARD_H } from './match3/game.js';
import { Action3DGame } from './action3d/game.js';
import { TriBatch } from './common.js'; // 验证 common.js 也可 Node import（不实例化设备）

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name); } };

// ---- breakout：物理步进 + 确定性 ----
{
  const run = () => {
    const g = new BreakoutGame(42, { width: 480, height: 360 });
    g.launch();
    for (let i = 0; i < 1200; i++) g.update(1 / 60, { dir: 0, mouseX: null, launch: true });
    return g;
  };
  const a = run(), b = run();
  const ballA = a.ecs.get(a.ball, 'ball'), ballB = b.ecs.get(b.ball, 'ball');
  ok(a.state !== 'serve', 'breakout 发球后进入 play/gameover');
  ok(ballA.x === ballB.x && ballA.y === ballB.y && a.score === b.score, 'breakout 同种子两次模拟完全一致（确定性）');
  ok(a.ecs.query('brick').length < 56, 'breakout 球击碎了至少一块砖');
}

// ---- space_shooter：波次生成 + 射击碰撞 + 确定性 ----
{
  const g = new SpaceShooterGame(7, { width: 480, height: 480 });
  ok(g.ecs.query('enemy').length === 4, 'space_shooter 第 1 波生成 4 架敌机');
  const before = g.ecs.query('enemy').length;
  for (let i = 0; i < 600; i++) g.update(1 / 60, { dx: 0, dy: 0, fire: true });
  ok(g.ecs.query('particle').length >= 0 && g.score >= 0, 'space_shooter 600 步模拟稳定');
  ok(g.wave >= 1 && (g.score > 0 || g.ecs.query('enemy').length !== before), 'space_shooter 射击/波次逻辑生效');
  const g2 = new SpaceShooterGame(7, { width: 480, height: 480 });
  for (let i = 0; i < 600; i++) g2.update(1 / 60, { dx: 0, dy: 0, fire: true });
  ok(g.score === g2.score && g.wave === g2.wave, 'space_shooter 同种子确定性');
}

// ---- match3：棋盘合法性 + 交换消除 + 计分 ----
{
  const g = new Match3Game(99);
  ok(g.board.length === BOARD_W * BOARD_H, 'match3 棋盘 8x8');
  ok(g.findMatches().length === 0, 'match3 初始棋盘无三连');
  // 暴力找一个可行交换
  let done = false;
  for (let y = 0; y < BOARD_H && !done; y++) {
    for (let x = 0; x < BOARD_W && !done; x++) {
      if (x + 1 < BOARD_W && g.trySwap(x, y, x + 1, y).ok) done = true;
      else if (y + 1 < BOARD_H && g.trySwap(x, y, x, y + 1).ok) done = true;
    }
  }
  ok(done, 'match3 存在可行交换');
  ok(g.score > 0 && g.moves === 1, 'match3 交换后计分');
  ok(g.findMatches().length === 0, 'match3 连锁结算后棋盘无残留三连');
  const bad = g.trySwap(0, 0, 3, 3);
  ok(!bad.ok, 'match3 非相邻交换被拒绝');
}

// ---- action3d：物理步进 + 相机 + 场景三角形输出 ----
{
  const g = new Action3DGame(5);
  const y0 = g.player.pos.y;
  for (let i = 0; i < 120; i++) g.update(1 / 60, { f: true, b: false, l: false, r: false });
  ok(g.player.pos.z < -1, 'action3d W 键使玩家前进（-Z）');
  ok(Math.abs(g.player.pos.y - g.player.r) < 0.2, 'action3d 玩家被物理约束在地面附近');
  const cam = g.camera();
  ok(cam.eye.z > cam.center.z, 'action3d 第三人称相机在玩家身后');
  // 用一个无设备的假 batch 收集三角形，验证场景输出
  let triCount = 0;
  const fakeBatch = { tri: () => triCount++ };
  g.renderTo(fakeBatch);
  ok(triCount > 200, `action3d 场景输出 ${triCount} 个三角形（地面+障碍+装饰）`);
  ok(typeof TriBatch === 'function', 'common.js 可 Node import');
}

console.log(`\n自测结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
