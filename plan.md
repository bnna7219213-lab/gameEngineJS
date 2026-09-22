# plan.md — v2 升级路线图（对标 Unity6 浏览器端 · 零后端算力 · 2026-09-04 更新）

> **修订背景**：v1 计划（取代 three.js）已基本落地——105 个引擎文件、46 个 smoke 全绿
> （1514 断言）：WebGL2 真 RHI（布局/uniform/纹理/FBO/MSAA/instancing）、PBR+灯光+阴影
> parity、GLTF+蒙皮+mixer、后处理链、GPU 视口、Play 模式（暂停/单步/热重载/断点/监视）、
> 代码工作台（Worker 语法校验）、OPFS/FSA 持久化、Profiler 时间线、Debug 模式。
> v2 在 v1 验收项之上，只列**真实缺口**，对标 Unity6 完整日常开发闭环。
>
> **2026-09-04 进度**：Q1 物理 3D ✅ + Q5 Worker 池 ✅ → 50 smoke / 1596 断言全绿。
>
> **不变约束**：CONTRACT.md 全部红线（零运行时依赖、无构建步骤、ES2022、DOM 隔离、
> 行主序矩阵、确定性 Rng、CPU 黄金参考永不下线、可选层缺失即降级、编辑器→运行时单向）。
> **计算驻留**：渲染/物理/烘焙/推理/序列化 100% 在浏览器；companion 进程仅文件 IO
> 与事件转发（同 Unity 编辑器本地进程），任何游戏计算不进服务端。

## 0. 审计结论（2026-09-04 v2 复审）

**已达标（v1+v2 已交付，勿重复建设）**：
- 渲染核心：WebGL2 RHI（vertexLayout/uniform 表/纹理/FBO/MRT/MSAA/instancing），
  Software 黄金参考，parity ≤2/255；PBR GGX、灯表、PCF 阴影、雾、IBL、后处理、文字图集。
- 内容管线：GLTF 2.0 加载（.glb 夹具往返）、图片解码、图元库、骨骼动画+mixer。
- 编辑器：GPU 视口、层级/检视器/gizmo/撤销/命令面板/时间轴/多场景、Play 模式
  （暂停/单步/热重载/断点/监视表达式）、代码工作台（tokenizer 高亮/多 Tab/Worker 校验）、
  OPFS/FSA 持久化、Profiler（帧时间线/draw call/内存）、导入向导、Debug 模式。
- 物理 3D（Q1 ✅）：GJK+EPA（稳健版 _resolve3+_resolve4 / 26 方向采样 / containsOrigin）、
  Sequential impulse（多点接触 / 摩擦 / 恢复阈值 / Baumgarte 校正 / 休眠双阈值）、
  raycast（全形状含 CONVEX 二分搜索）、CharacterController（胶囊扫掠 / 台阶 / 坡度 / 滑墙）。
- Worker 池（Q5 ✅）：`job_worker.js` 通用协议（5 种内置任务 / WorkerPool 类 / Node 顺序降级 /
  浏览器 Worker 路径 / 进度回调 / Transferable ArrayBuffer / stats 追踪）。
- 工程纪律：50 smoke / 1596 断言全绿，全 Node headless。

**剩余缺口（v2 待攻坚）**：

| # | 缺口 | 现状证据 | 对标 |
|---|---|---|---|
| G3 | **无音频输出** | 无 WebAudio 桥；mixer 模型只在 Node 出 PCM | Unity AudioSource/Listener |
| G4 | **无 WebSocket 网络层** | network.js 只有 loopback；无快照插值/预测回滚 | Unity Netcode |
| G6 | **GPU 视口特性未吃全** | 阴影/后处理未进编辑器视口 | Unity Scene 视图 |
| G7 | **无验收游戏** | games/ 仅 2D×3 + 脚本驱动 demo | Unity 官方 demo 级 |
| G8 | **无静态导出** | exporter 未打包「单目录静态站点」 | Unity Build Settings |
| G9 | **Worker 未接入资产管线** | job_worker.js 协议就绪，但 GLTF/纹理/DDC 导入仍在主线程 | Unity 导入进度条不卡 UI |
| G10 | **TAA/Hi-Z 未真接线 GPU** | CPU 参考就绪但无 GPU pass | Unity HDRP TAA |
| G1 | **WebGPU 后端空壳** | rhi_webgpu.js 24 行，caps 诚实但仅 init 真实 | Unity6 现代 GPU 路径 |
| G5 | **无多人协作** | 无 companion（serve.mjs 仅静态服务） | Unity Collaborate/Plastic |

**已关闭（本轮完成）**：
| ~~G2~~ | ~~物理 3D 未真实化~~ | Q1 ✅：5 文件 / 4 smoke / 47 断言 |
| ~~Q5~~ | ~~Worker 池化~~ | 2 文件 / 1 smoke / 35 断言 |

## 1. 目标与非目标（v2）

**目标**：
1. 浏览器端独立开发并运行**完整 3D 游戏**（GLTF 骨骼角色 + 场景资产 + 阴影 + PBR + 雾 +
   粒子 + 后处理 + instancing + 音效 + 物理 + 存档），WebGL2 1080p 中端 GPU ≥30fps；
   Software 160p parity 通过。
2. WebGPU 后端真实化：对等 WebGL2 绘制能力 + 3 个 compute pass（Hi-Z 归约 / DDGI 探针
   更新 / ReSTIR 重采样），parity 不破；caps 随实现翻真（红线 A）。
3. 物理 3D：GJK+EPA 从 C++ M3.1 逐位移植；sequential impulse（摩擦/恢复/迭代/休眠）；
   角色控制器（胶囊扫掠/滑墙/台阶）；raycast 全形状。
4. 音频：WebAudio 输出桥（合成器→AudioBuffer）、文件解码、loop/总线/3D Panner。
5. 网络：WebSocketTransport 与 LoopbackTransport 同接口 + 快照插值 + 预测回滚。
6. 协作：companion.mjs（Node 内置模块 only：静态服务 + fs.watch + WS presence + 对象锁
   + HTTP PUT 保存）+ 对象级三方合并工具 + CI 纯 node 流水线。
7. 导出：「构建游戏」= 打包单目录静态站点（无 companion 依赖，可任意托管）。
8. TAA 真接线：prev-MVP 运动矢量 + Halton jitter 进投影 + 邻域 clamp（GPU pass）。

**非目标**（沿用 v1）：第三方库、服务端游戏计算、AAA 规模、全 GLTF 扩展、WebXR。

## 2. 架构决策（v2 增量）

| # | 决策 | 理由 |
|---|---|---|
| D16 | **WebGPU 真实化走「commandEncoder 对等 + compute 先行」**：先复刻 WebGL2 全部 pipeline 语义（同 uniform 声明表 → bindGroup 布局反射），再补 3 个 compute；Node 冒烟保持 init=false 降级路径不动 | 红线 D/E；compute 是 WebGPU 独占价值 |
| D17 | **物理移植锚定 C++ M3.1 数值**：GJK 支撑函数/EPA 面扩展/冲量求解逐函数对照移植，smoke 内置 C++ 基准值断言 | 已有 bit-exact 蓝图，避免重新调参 |
| D18 | **音频双轨**：`sim/audio`（PCM 合成，Node 可测）+ `platform/audio_web`（WebAudio 桥，浏览器 only，Node 冒烟走 mock 句柄） | 红线 E；混音图保持确定性 |
| D19 | **网络层三态**：loopback（Node 冒烟）/ WebSocket（联机）/ 离线（单机）；快照插值与预测回滚为传输无关层 | 复用现有 lockstep 框架 |
| D20 | **companion 单一文件** `tools/companion.mjs`（Node 内置模块 only）：静态服务 + fs.watch → SSE/WS 广播 + WS 房间（presence/锁）+ HTTP PUT 保存。**不 import 任何引擎模块，不做任何游戏计算** | 边界清晰；离线单机（OPFS）与纯静态发布始终可用 |
| D21 | **对象级项目布局**（git 友好）：`project.json` + `scenes/<name>.json`（轻清单）+ `objects/<id>.json`（每对象一文件）+ 确定性序列化（固定 key 序/LF/无时间戳/稳定 id） | 多人分支合并；CI 可直接 `node --check` |
| D22 | **TAA GPU 接线走运动矢量 RT**：geometry pass 输出 prev-clip → current-NDC 运动矢量到 RG16F RT；jitter 序列与 CPU 参考共用同一 Halton 表 | parity 可断言；CPU 参考不下线 |
| D23 | **Worker 池化**：`job_worker.js` 通用任务协议（import-gltf / decode-image / ddc-bake），主线程提交+进度回调；Node 走顺序降级 | 大资产导入不冻结编辑器 |

## 3. 里程碑（v2）

### Q1 — 物理 3D 真实化（游戏性根基） ✅ 2026-09-04

| 任务 | 状态 | 验收 |
|---|---|---|
| GJK+EPA 逐位移植（支撑映射/单纯形/面扩展/接触点） | ✅ | `physics3d.js`：稳健版 _resolve3+_resolve4、26 方向采样、containsOrigin |
| Sequential impulse 完整化：摩擦锥/恢复/迭代/休眠 | ✅ | `world3d.js`：多点接触(8顶点采样)/摩擦/恢复阈值(0.2)/Baumgarte(0.2)/休眠(双阈值) |
| 形状集：box/sphere/capsule/convex/plane | ✅ | 各形状两两组合 |
| raycast（全形状最近命中）+ sweep | ✅ | CONVEX 二分搜索、capsule 圆柱+端帽 |
| 角色控制器：胶囊扫掠 + 滑墙 + 台阶 + 坡度 | ✅ | `character.js`：`_sweepCapsule` 去除 -r 偏移、法线旋转到世界空间 |
| runtime 接线：GameRuntime.stepPhysics 换真世界步进 | ⬜ | play_session_smoke 不回退 |

**出口**：4 smoke / 47 断言全绿。Play 模式自动获得完整物理；堆叠场景 60 帧无爆炸。

### Q5 — Worker 池化 + 导入不冻结 ✅ 2026-09-04

| 任务 | 状态 | 验收 |
|---|---|---|
| `job_worker.js` 通用协议 | ✅ | 5 种内置任务 / WorkerPool 类 / Node 顺序降级 / 进度回调 / stats |
| GLTF/纹理/DDC 迁入 Worker | ⬜ | 50MB glb 导入期间主线程帧时间 <16ms |
| ResourceCache 对接 Transferable | ⬜ | smoke：传输后 buffer 内容一致 |

**出口**：1 smoke / 35 断言全绿。协议层就绪，下一步接入资产管线。

### Q2 — 音频输出桥 + 网络传输
| 任务 | 验收 |
|---|---|
| `platform/audio_web.js`：AudioContext 包装（lazy init 于用户手势）、合成器 render()→AudioBufferSourceNode、decodeAudioData 文件加载、loop/gain/bus、PannerNode 3D | `plat_audio_smoke.js`（Node mock 句柄路径）+ 浏览器手动验收 |
| 混音图确定性保持：同输入 PCM hash 跨轨一致 | sim/audio 现有断言不回退 |
| `WebSocketTransport`（与 LoopbackTransport 同接口：send/receive(frame)） | `plat_net_smoke.js`：Node 内 WS 回环（companion 中继） |
| 快照插值 + 预测回滚层（传输无关）：服务器快照 ring buffer、客户端实体插值、本地输入重放 | `plat_rollback_smoke.js`：注入 100ms 人工延迟，插值平滑、回滚后状态哈希一致 |

**出口**：两浏览器实例经 companion WS 联机玩同一 lockstep 会话。

### Q3 — TAA/Hi-Z GPU 真接线 + GPU 视口特性吃全
| 任务 | 验收 |
|---|---|
| 运动矢量 pass：prev-MVP uniform + RG16F RT 输出 | `render_motionvec_smoke.js` |
| TAA resolve pass：Halton jitter 进投影矩阵 + history RT ping-pong + 3x3 邻域 clamp（GLSL 与 CPU 参考同式） | `render_taa_parity.js`：静态帧收敛、运动帧抗锯齿且 2/255 |
| Hi-Z 归约 pass（WebGL2 版：逐级 blit+max shader）+ 遮挡查询进提交路径 | `render_hiz_smoke.js` 扩展：剔除计数两后端一致 |
| 编辑器视口吃全：阴影开关/后处理链/fog 在 GPU 视口路径生效 | parity 页覆盖编辑器视口；perf_hud 实测 1080p≥60fps |

**出口**：编辑器 Scene 视图与 Game 视图渲染特性全集一致。

### Q4 — WebGPU 真实化（compute 价值交付）
| 任务 | 验收 |
|---|---|
| WGSL 着色器双轨生成：uniform 声明表 → bindGroupLayout 反射；pipeline 创建对等（blend/depth/cull/topology） | `rhi_webgpu_parity_smoke.js`（浏览器页） |
| commandEncoder/renderPass 完整路径：vb/ib/纹理/RT/MRT | WebGPU vs WebGL2 vs Software 三方 parity |
| compute×3：Hi-Z 归约 / DDGI 探针更新（ray gen+irradiance blend）/ ReSTIR 重采样 | 各 compute 输出 vs CPU 参考 parity；caps 翻真（compute:true） |
| 诚实降级：无 navigator.gpu 时回退链不变；storage/indirect 未实现前 caps 保持 false | rhi_device_smoke 断言 caps↔行为一致 |

**出口**：Chrome/Edge 最新版可切 WebGPU 后端渲染完整场景，compute 三项翻真。

### Q6 — 多人协作（companion v2 + git 工作流）
| 任务 | 验收 |
|---|---|
| `tools/companion.mjs`（Node 内置 only）：静态服务 + 递归 fs.watch → WS 广播 + WS 房间 presence（谁打开哪个场景/编辑哪个对象）+ 对象锁 API（获锁/释放/持有者查询）+ HTTP PUT 保存 | `plat_companion_smoke.js`：Node 内双客户端回环——presence 互见、同对象第二人获锁被拒（可读错误，红线 A） |
| 编辑器接线：检视器编辑前获锁、失焦释放；锁持有者头像/名显示；SSE 断线重连 | 双浏览器实例手动验收 |
| 对象级项目布局 + 确定性序列化（Q6 同时改造 project.js 存储层） | 同一场景两次保存 byte-identical（smoke 断言）；git diff 只显真实变更 |
| `tools/merge_scene.mjs`：三方对象级合并（对象文件级自动合并 + 同对象冲突清单报告） | 合并用例矩阵：不同对象自动合并；同对象不同字段按字段合并；同对象同字段报冲突 |
| CI：`tools/ci.mjs` 纯 node（--check 全部 src + run_smoke + selftest + 序列化往返断言），任意 runner 可执行 | 模拟 PR（改一个对象文件）→ CI 绿 |
| 对象级语义 diff 检视器（评审面板）：两版本 project 的对象/字段级差异清单 | `tools/diff_project.mjs` + 编辑器只读面板 |

**出口**：2–10 人按「分支→编辑(presence/锁)→合并(对象级)→PR→CI→主干」日常协作。

### Q7 — 静态导出 + 验收游戏（终局）
| 任务 | 验收 |
|---|---|
| 「构建游戏」导出：项目 + 引擎模块清单 + cooked 资产 → 单目录静态站点（importmap 相对路径；无 companion 依赖；双击 index.html 经任意静态托管可玩） | `plat_export_smoke.js`：导出目录完整性清单 + 入口可 import（Node 静态分析） |
| **action3d v2 验收游戏**：GLTF 骨骼角色+场景、阴影+PBR+雾、粒子、后处理、instancing 植被、文字 HUD、音效、角色控制器、存档；**全程用本编辑器开发** | 硬指标：WebGL2 1080p ≥30fps（`docs/benchmark.md` 记录）；Software 160p parity；`games/selftest.js` 扩展覆盖 |
| 文档同步：README/CONTRACT/docs 更新到 v2 实况 | — |

**出口**：对外演示闭环成立——浏览器打开编辑器 → 开发/调试/协作 → 构建 → 静态托管开玩。

## 4. 阶段依赖与并行

```
Q1 物理 ✅ ─┬─ Q7 验收游戏
Q2 音频/网络 ─┤
Q3 TAA/Hi-Z ─┴─ Q4 WebGPU（Q3 的 GLSL 双轨经验直接复用）
Q5 Worker ✅（独立于 Q1-Q4，已完成协议层）
Q6 协作（依赖现有 OPFS/FSA；与 Q1-Q5 文件零重叠，可全程并行）
```

每阶段出口保持「全量 smoke 绿 + parity 绿」；新增 smoke 一律 Node headless 优先，
浏览器 parity 页仅覆盖 GPU 断言。

## 4a. 进度追踪（2026-09-04）

| 阶段 | 状态 | Smoke | 断言 | 剩余 |
|---|---|---|---|---|
| Q1 物理 | 🟢 80% | 4 (sim_physics3d/raycast/raycast_convex/character) | 47 | runtime 接线 |
| Q2 音频/网络 | ⬜ 0% | — | — | 全部 |
| Q3 TAA/Hi-Z GPU | ⬜ 0% | — | — | 全部 |
| Q4 WebGPU | ⬜ 0% | — | — | 全部 |
| Q5 Worker | 🟢 40% | 1 (plat_worker) | 35 | 资产管线接入 |
| Q6 协作 | ⬜ 0% | — | — | 全部 |
| Q7 导出/游戏 | ⬜ 0% | — | — | 全部 |
| **合计** | **🟢 2/7 阶段** | **50** | **1596** | **5 阶段待启动** |

**下一步推荐顺序**（按投入产出比）：

1. **Q5 补全**（~200 行）：将 GLTF 解析 / 纹理解码 / DDC 烘焙从主线程迁入 Worker。
   job_worker.js 协议已就绪，只需修改 resource.js 的 import 路径和调用方式。
   产出：大资产导入不冻结编辑器，直接可感知。

2. **Q1 runtime 接线**（~100 行）：GameRuntime.stepPhysics 换真世界步进。
   world3d.js 的 PhysicsWorld.step() 已验证稳定，接线后 Play 模式自动获得完整物理。
   产出：游戏内物理交互可用。

3. **Q2 音频桥**（~500 行）：platform/audio_web.js（WebAudio 包装）+ 网络传输。
   音频是游戏感知的核心，无音频的 3D 游戏不完整。
   产出：音频输出 + WebSocket 联机。

4. **Q3 TAA/Hi-Z**（~600 行）：运动矢量 pass + TAA resolve + Hi-Z 归约。
   渲染质量提升，GPU 视口吃全。
   产出：抗锯齿 + 遮挡剔除。

5. **Q4 WebGPU**（~1000 行）：WGSL 双轨 + compute 三项。
   依赖 Q3 的 GLSL 经验，是最大单块。
   产出：现代 GPU 路径。

6. **Q6 协作**（~900 行）：companion.mjs + 对象锁 + 合并 + CI。
   与上述阶段文件零重叠，可并行开发。
   产出：多人协作闭环。

7. **Q7 导出/游戏**（~300 行 + demo）：静态导出 + action3d v2 验收游戏。
   最终阶段，依赖 Q1-Q5 全部完成。
   产出：完整演示闭环。

## 5. 规模估计（v2 更新）

| 阶段 | 规模（估） | 状态 | 关键交付 |
|---|---|---|---|
| Q1 | ~1200-1600 行（移植为主） | 🟢 80% | 真物理 ✅ |
| Q2 | ~500-700 行 | ⬜ | 音频+联机 |
| Q3 | ~500-700 行 | ⬜ | TAA/Hi-Z GPU |
| Q4 | ~800-1100 行 | ⬜ | WebGPU+compute |
| Q5 | ~300-400 行 | 🟢 40% | Worker 池 ✅（协议层）|
| Q6 | ~800-1000 行 | ⬜ | companion+合并+CI |
| Q7 | demo + ~300 行导出 | ⬜ | 终局 |

合计约 +4400-5600 行核心代码 + smoke/夹具；7 个独立可验收阶段。
已交付约 1500 行核心代码（Q1+Q5 协议层）。
v1 的 46 smoke / 1514 断言全程不得回退（红线 B：不做半成品硬编码）。
