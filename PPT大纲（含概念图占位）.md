# Browser Game Engine — PPT 大纲（含概念图占位）

> 对标 Unity6 浏览器端 · 零后端算力 · 2026-09-04
> 每页标注 [概念图占位] 处，可在 Figma / draw.io / Excalidraw 中补充可视化。

---

## Slide 1 — 封面

**标题**：Browser Game Engine — 取代 Three.js 的真正游戏引擎

**副标题**：浏览器端独立运行完整 3D 游戏 · WebGL2/WebGPU 双后端 · 零后端算力

**底部信息**：项目代号 · 2026-09 · v2 Roadmap

---

## Slide 2 — 为什么需要它

**痛点**：
- Three.js 是渲染库，不是游戏引擎（无物理/无音频/无编辑器/无协作/无导出）
- Unity / Unreal 需要后端服务器 → 无法纯浏览器部署
- Godot Web 版本性能受限（WASM + WebGL1）
- 教育/原型/轻量游戏场景缺少「打开浏览器就能做游戏」的工具

**我们的定位**：
- 对标 Unity6 浏览器端能力
- 全部计算 100% 驻留浏览器（渲染/物理/烘焙/推理/序列化）
- 零运行时依赖 · 无构建步骤 · 纯 ES2022

> [概念图占位]：四象限图 — 横轴「浏览器 vs 原生」× 纵轴「渲染库 vs 完整引擎」，标注 Three.js / Unity / Godot / Our Engine 位置

---

## Slide 3 — 当前状态一览

**已交付（v1 + v2 部分）**：
| 维度 | 指标 |
|---|---|
| 引擎源码 | 109 个 JS 模块 |
| 自动化测试 | 50 个 smoke / 1596 断言 全绿 |
| 游戏 Demo | 4 个（action3d / breakout / match3 / space_shooter） |
| 渲染后端 | WebGL2 RHI（完整）+ Software 黄金参考 + WebGPU（空壳） |
| 物理 | GJK+EPA 3D 刚体 / 角色控制器 / raycast |
| 编辑器 | GPU 视口 / 检视器 / 代码工作台 / Play 模式 / Profiler |
| 平台层 | OPFS 持久化 / GLTF 加载 / 骨骼动画 / 纹理 / DDC |

> [概念图占位]：仪表盘式展示 — 7 个环形进度条（Q1-Q7），Q1 80% 绿色，Q5 40% 绿色，其余灰色

---

## Slide 4 — 架构图（全景）

**分层**：
```
┌─────────────────────────────────────────────┐
│              Editor (编辑器)                   │
│  层级树 · 检视器 · 代码工作台 · 视口 · Profiler  │
├─────────────────────────────────────────────┤
│              Runtime (运行时)                   │
│  GameRuntime · ScriptEngine · PlaySession     │
├────────┬────────┬────────┬────────┬─────────┤
│ Render │  Sim   │  Infer │ Platform│ Editor  │
│ WebGL2 │ Physics│ Neural │  GLTF  │  Code   │
│ PBR    │ GJK/EPA│  Net   │  Image │  Editor │
│ PostFX │ Char   │  ...   │  DDC   │  ...    │
│ Hi-Z   │ Raycast│        │  Cache │          │
├────────┴────────┴────────┴────────┴─────────┤
│              Core (数学/Rng/JSON/Profiler)      │
└─────────────────────────────────────────────┘
```

**关键设计原则**：
- 单后端自包含（非微服务）
- CPU 黄金参考永不下线（parity 断言）
- 编辑器 → 运行时单向依赖
- 确定性可重现（固定 key 序 / LF / 无时间戳）

> [概念图占位]：分层架构图 — 从上到下 4 层，每层用不同颜色块表示，箭头标注依赖方向

---

## Slide 5 — 渲染管线

**WebGL2 RHI 完整能力**：
- VertexLayout / Uniform 声明表 / 纹理（RGB/Float/SRGB）
- FBO / MRT / MSAA / Instancing
- PBR GGX 光照模型（Albedo/Roughness/Metallic/Normal/Emission）
- PCF 阴影 / 灯光表 / IBL / 雾 / 后处理链
- Software CPU 光栅器（黄金参考，parity ≤2/255）
- Parity 断言：WebGL2 vs Software 逐像素对比

**待完成（Q3/Q4）**：
- TAA（Halton jitter + 运动矢量）
- Hi-Z GPU 归约 + 遮挡剔除
- WebGPU 后端（WGSL 双轨 + compute）

> [概念图占位]：渲染管线流程图 — Draw Call → Geometry → Lighting → Shadow → PostFX → TAA → Output，标注 CPU/GPU 路径

---

## Slide 6 — 物理 3D（Q1 ✅）

**已实现**：
- GJK 算法（稳健版 _resolve3 + _resolve4 / 26 方向初始采样）
- EPA 穿透深度求解（多面体扩展 / containsOrigin / 4 面退化处理）
- Sequential Impulse 求解（摩擦锥 / 恢复系数 / Baumgarte 位置校正）
- 多点接触（8 顶点采样 for box-plane）
- 休眠系统（速度 + 时间双阈值）
- 形状集：Box / Sphere / Capsule / Plane / Convex
- Raycast：全形状（含 CONVEX 二分搜索 + Capsule 圆柱+端帽）
- CharacterController：胶囊扫掠 / 滑墙投影 / 台阶步高 / 坡度限制

**测试结果**：
- sim_physics3d: 21 assertions（球-球/盒-盒/堆叠稳定/休眠）
- sim_raycast: 14 assertions（全形状 + 旋转盒 + Capsule）
- sim_raycast_convex: 3 assertions（AABB 预检 + 二分命中）
- sim_character: 9 assertions（重力/台阶/坡度/碰撞）

> [概念图占位]：物理管线流程图 — Broad Phase → GJK → EPA → Sequential Impulse → Sleep → Character Controller，标注关键参数

---

## Slide 7 — 编辑器与工具链

**编辑器功能**：
- GPU 视口（实时渲染 + Gizmo 拖拽 + 网格/坐标轴）
- 层级树 + 检视器（transform/material/particle 属性）
- 撤销/重做 / 命令面板 / 多场景管理
- 时间轴（动画 + 粒子生命周期）
- Play 模式：暂停 / 单步 / 热重载 / 断点 / 监视表达式
- 代码工作台：Worker 语法校验 / tokenizer 高亮 / 多 Tab
- Profiler：帧时间线 / draw call 统计 / 内存面板
- Debug 模式 / 导入向导

**平台层**：
- OPFS + File System Access API 持久化
- GLTF 2.0 加载（.glb 往返）/ 骨骼动画 + mixer
- 图片解码 / DDC 编译缓存 / 纹理桥
- Worker 池（通用任务协议 / Node 降级 / Transferable）

> [概念图占位]：编辑器 UI 布局示意图 — 左侧层级树 / 中央视口 / 右侧检视器 / 底部控制台+时间轴

---

## Slide 8 — Worker 池（Q5 ✅ 协议层）

**通用协议**：
```
{ id, type, payload } → { id, result | error, progress }
```

**5 种内置任务**：
| 任务类型 | 功能 |
|---|---|
| import-gltf | GLB 解析 / JSON 场景树 |
| decode-image | PNG/JPEG 格式识别 / 尺寸提取 |
| ddc-bake | FNV1a 哈希 / 参数烘焙 |
| mesh-compress | 顶点/索引压缩 / 哈希 |
| custom | 用户自定义函数 |

**双路径**：
- 浏览器：Web Worker + Transferable ArrayBuffer 零拷贝
- Node：顺序降级（微任务队列 / 保持异步语义）

**下一步**：将 GLTF 解析 / 纹理解码 / DDC 烘焙从主线程迁入 Worker

> [概念图占位]：Worker 架构图 — 主线程 → WorkerPool.submit() → Worker(s) → postMessage 回传，标注 Transferable 零拷贝路径

---

## Slide 9 — 测试体系

**规模**：50 个 smoke / 1596 断言 / 全 Node headless / 无外部依赖

**覆盖域**：
| 类别 | Smoke 数 | 代表性测试 |
|---|---|---|
| Core（数学/Rng/JSON/Profiler） | 2 | core_smoke (31) / profiler_timeline (12) |
| Render（RHI/PBR/Shadow/PostFX） | 14 | render_primitives (908) / render_ibl (33) |
| Sim（物理/角色/粒子） | 5 | sim_physics3d (21) / sim_character (9) |
| Platform（GLTF/Image/Worker/Cache） | 6 | plat_worker (35) / plat_skin (22) |
| Editor（视口/代码/Profiler/Debug） | 7 | editor_smoke (32) / editor_code_editor (21) |
| Game/Play（脚本/会话/推理） | 4 | play_session (10) / infer (15) |

**质量保障**：
- 每个模块配套 smoke（新增功能必须配套测试）
- Parity 断言：WebGL2 vs Software 逐像素 ≤2/255
- 确定性断言：跨运行可重现（Rng 种子 / 序列化 byte-identical）

> [概念图占位]：测试覆盖热力图 — 模块 × 断言数量矩阵，颜色深度表示覆盖密度

---

## Slide 10 — 性能基准

**当前指标**：
| 指标 | 值 |
|---|---|
| Smoke 全量执行 | ~500ms（Node 22 / 50 文件 / 1596 断言） |
| render_primitives | 908 断言 / 1ms（CPU 光栅器） |
| sim_physics3d | 21 断言 / ~800ms（含堆叠休眠收敛） |
| plat_worker | 35 断言 / ~36ms（5 种任务 + 并发 + 错误路径） |

**目标指标（v2 完成时）**：
| 指标 | 目标 |
|---|---|
| WebGL2 1080p 中端 GPU | ≥30 fps |
| Software 160p parity | 通过 |
| 50MB GLB 导入 | 主线程帧时间 <16ms |
| 编辑器视口 | ≥60 fps |

> [概念图占位]：性能对比条形图 — 各模块耗时对比，当前值 vs 目标值

---

## Slide 11 — 技术亮点

1. **CPU 黄金参考永不下线**：Software 光栅器作为 parity 基准，WebGPU/WebGL2 实现必须逐像素对齐（≤2/255），确保数值正确性可验证
2. **确定性可重现**：Rng 种子 / 序列化固定 key 序 / LF / 无时间戳 / 稳定 ID — 跨运行/跨平台可验证
3. **单后端自包含**：非微服务架构，引擎+编辑器+运行时同进程，减少 IPC 开销
4. **零运行时依赖**：无 npm install / 无构建步骤 / 纯 ES2022 / 浏览器打开即用
5. **Worker 降级策略**：Node 端顺序降级保持异步语义，浏览器端 Web Worker 零拷贝，同一套代码
6. **物理稳健性**：GJK _resolve4 + EPA 26 方向采样 + containsOrigin 显式检查，避免退化崩溃

---

## Slide 12 — 路线图（v2 Q1-Q7）

```
已完成:  Q1 物理 3D ✅ (80%)  |  Q5 Worker 池 ✅ (40%)
待启动:  Q2 音频/网络  Q3 TAA/Hi-Z  Q4 WebGPU  Q6 协作  Q7 导出/游戏
```

| 阶段 | 内容 | 规模 | 状态 |
|---|---|---|---|
| Q1 | 物理 3D 真实化 | ~1400 行 | ✅ 80% |
| Q2 | 音频输出 + 网络传输 | ~600 行 | ⬜ |
| Q3 | TAA/Hi-Z GPU 接线 | ~600 行 | ⬜ |
| Q4 | WebGPU 真实化 | ~1000 行 | ⬜ |
| Q5 | Worker 池化 | ~350 行 | ✅ 40% |
| Q6 | 多人协作 | ~900 行 | ⬜ |
| Q7 | 静态导出 + 验收游戏 | ~300 行 + demo | ⬜ |

> [概念图占位]：甘特图 / 里程碑时间线 — 横轴时间，纵轴 Q1-Q7，已完成绿色实心，待启动灰色空心

---

## Slide 13 — 下一步计划

**近期（1-2 周）**：
1. Q5 补全：GLTF/纹理/DDC 迁入 Worker（~200 行）
2. Q1 runtime 接线：GameRuntime.stepPhysics 换真世界步进（~100 行）

**中期（2-4 周）**：
3. Q2 音频桥 + 网络传输（~600 行）
4. Q3 TAA/Hi-Z GPU 接线（~600 行）

**远期（4-8 周）**：
5. Q4 WebGPU compute（~1000 行）
6. Q6 多人协作（~900 行）
7. Q7 静态导出 + 验收游戏（~300 行 + demo）

---

## Slide 14 — 总结

**已实现**：
- 109 模块 / 50 smoke / 1596 断言 / 4 个游戏 Demo
- WebGL2 RHI 完整 + PBR + 物理 3D + 编辑器 + Play 模式
- CPU 黄金参考 parity / 确定性 / 零依赖

**核心承诺**：
- 浏览器端独立运行完整 3D 游戏
- 全部计算 100% 驻留浏览器
- 对标 Unity6 日常开发闭环

**愿景**：打开浏览器 → 写代码 → 调试 → 构建 → 发布 → 玩家即点即玩

> [概念图占位]：路线图全景图 — 从「打开浏览器」到「玩家即点即玩」的端到端流程图
