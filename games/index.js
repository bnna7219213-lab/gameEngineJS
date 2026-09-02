// games 索引：可直接在浏览器运行的示例清单 + 元数据。
// 每个游戏目录自含 index.html；本文件供启动器/文档程序化读取。
export const games = [
  { id: 'breakout', title: '打砖块 Breakout', path: './breakout/index.html', engine: ['math', 'Rng', 'ECS'], desc: '挡板反弹消砖，ECS 实体组件驱动。' },
  { id: 'space_shooter', title: '太空射手 Space Shooter', path: './space_shooter/index.html', engine: ['math', 'Rng', 'ECS'], desc: '纵版射击，对象池子弹 + 敌机波次。' },
  { id: 'match3', title: '三消 Match-3', path: './match3/index.html', engine: ['math', 'Rng'], desc: '交换消除 + 下落补位，确定性 RNG。' },
  { id: 'action3d', title: '3D 动作 Action3D', path: './action3d/index.html', engine: ['Viewport3D', 'SoftwareDevice'], desc: '软渲染 3D 场景：移动 + 跳跃 + 收集。' },
];
export default games;
