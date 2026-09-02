// 用对象脚本驱动的 3D 动作游戏示例场景（验证 D：input/spawn/timer/碰撞查询/断点 足以驱动 Action3D 类玩法）。
// 不依赖编辑器 DOM，可直接被 PlaySession 运行，也可被 games/ 页面复用（红线 F：仅运行时改写快照）。
import { Scene3D, GameObject3D } from './scene3d.js';

export function buildAction3DScene() {
  const s = new Scene3D();
  s.name = 'Action3D (scripted)';

  const ground = new GameObject3D('ground');
  ground.transform.position = [0, 0, 0];
  ground.components = { mesh: { shape: 'plane', albedo: [40, 44, 52], rough: 1, metal: 0 } };
  s.add(ground);

  // 玩家：方向键移动（onKeyDown），空格跳跃
  const player = new GameObject3D('player');
  player.transform.position = [0, 0.5, 0];
  player.components = { mesh: { shape: 'cube', albedo: [90, 160, 255], rough: 0.5, metal: 0 } };
  player.scripts = [
    'let speed = 4;' +
    'this.onKeyDown((k) => {' +
    '  if (k === "ArrowRight") this.move(speed * this.dt, 0, 0);' +
    '  if (k === "ArrowLeft") this.move(-speed * this.dt, 0, 0);' +
    '  if (k === "ArrowUp") this.move(0, 0, -speed * this.dt);' +
    '  if (k === "ArrowDown") this.move(0, 0, speed * this.dt);' +
    '  if (k === " ") { this.setPosition(this.position[0], this.position[1] + 0.5, this.position[2]); this.log("jump"); }' +
    '});'
  ];
  s.add(player);

  // 敌人：玩家靠近则被销毁并计分（queryRadius）
  const enemy = new GameObject3D('enemy');
  enemy.transform.position = [3, 0.5, 0];
  enemy.components = { mesh: { shape: 'sphere', albedo: [220, 80, 80], rough: 0.5, metal: 0 } };
  enemy.scripts = [
    'const near = this.queryRadius(1.5).filter(x => x.name === "player");' +
    'if (near.length) { this.log("enemy-hit " + this.id); this.despawn(this.id); }'
  ];
  s.add(enemy);

  // 金币：玩家靠近收集（queryRadius）
  for (let i = 0; i < 2; i++) {
    const coin = new GameObject3D('coin' + i);
    coin.transform.position = [(i + 1) * -2, 0.6, 1.5];
    coin.components = { mesh: { shape: 'sphere', albedo: [240, 200, 60], rough: 0.3, metal: 0.2 } };
    coin.scripts = [
      'const near = this.queryRadius(1.4).filter(x => x.name === "player");' +
      'if (near.length) { this.log("collect " + this.id); this.despawn(this.id); }'
    ];
    s.add(coin);
  }
  return s;
}
