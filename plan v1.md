# plan.md — 自研补全路线图（完全取代 three.js · 对标 Unity6 日常开发 · 多人团队）

> **定位**：在不引入 three.js（以及任何第三方 3D/渲染/物理库）的前提下，把本项目补全为可独立支撑完整三维游戏开发与运行的浏览器引擎；编辑器工作台对标 Unity6 的日常开发工作流（场景/资产/调试/剖析/热重载/Play 模式），并支持多人团队协作（git 工作流 + 场景级协作）。
> **依据**：2026-09-02 全项目审计（three.js 能力矩阵 24 项：可用 4、部分 7、缺失 13；games/ 入口断裂与 2 个 WebGL2 致命 bug；编辑器 8fps 软渲染视口、无代码工作台、无 Play 模式、localStorage 5MB 持久化天花板）。
> **约束**：完全遵守 `CONTRACT.md`——零运行时依赖、无构建步骤、ES2022、DOM 隔离、行主序矩阵、确定性 `Rng`、红线 A–F。Software 后端仍为黄金参考；一切 GPU 能力按「CPU 参考先行 + parity 容差 2/255」推进（红线 D）。
> **计算驻留原则**：游戏与编辑器的**全部计算**（渲染/物理/烘焙/推理/序列化）驻留浏览器；`serve.mjs` 演进出的 companion 进程只做**文件 IO 与事件转发**（等同 Unity 编辑器的本地进程角色），不做任何游戏计算。

---

## 0. 现状基线（审计结论摘要）

**可用**：数学库（Mat4/Quat/AABB/Frustum/Rng，约定清晰）、CPU 软件光栅器（z-buffer + 透视校正 + js 着色器管线）、Web IDE 骨架（层级/检视器/gizmo/撤销/命令面板/gbhy 脚本台/时间轴）、2D 小游戏 3 款、工程纪律（10 smoke / 213 断言全绿，全在 Node）。

**断裂与缺陷（P0 必修）**：
1. games/ 双代代码断裂：4 个 `main.js` + `selftest.js` import `XxxGame` 类，但所有 `game.js` 均为无导出顶层脚本——新入口一加载即 SyntaxError。
2. WebGL2 矩阵上传转置 bug：行主序矩阵经 `uniformMatrix4fv(loc, false, m)` 上传等效 \(M^T\)，GLSL 路径与 Software 路径数学不一致。
3. WebGL2 从未启用 `gl.DEPTH_TEST`，`pipeline.depth` 参数被忽略——无遮挡正确性。
4. WebGPU 后端空壳但 caps 谎报 `compute/indirect/storageTextures:true`（违反红线 A 精神）。
5. 次要：`ecs_archetype.query` 仅精确签名匹配；meshlet 构建在 `asset_pipeline` 与 `render/meshlet` 重复实现；physics3d 冲量硬编码等质量假设、死导入 AABB。

**编辑器日常工作流缺口（P5/P7 必补，对标 Unity6）**：
- 视口软渲染**主动限帧 8 fps**（播放 20 fps），无 GPU 路径——场景浏览卡顿。
- 无 Play 模式（工具栏 ▶ 是时间轴关键帧回放，不是游戏运行）。
- 无代码工作台（无编辑器/补全/断点；gbhy 仅单行 REPL）。
- 热重载断链：浏览器侧 `HotReloader` 无真实文件监听，改代码=整页刷新。
- 持久化 = localStorage（约 5–10MB），装不下真实资产；无 OPFS/FSA API。
- `JobSystem.parallel` 实为顺序 await，无 Worker——导入/烘焙阻塞 UI 主线程。
- PerfHud 仅 2 个指标，无帧时间线/内存/draw call 剖析。
- 无版本管理、无多人协作、无 CI。

**结构性缺口（按本计划补全）**：GPU 渲染核心（多顶点布局/uniform 系统/纹理采样/RT/MRT）、材质与灯光与阴影、GLTF 与图片解码、骨骼蒙皮动画、粒子、后处理、instancing、文字精灵、可用 3D 物理（EPA/角色控制器/raycast）、WebAudio 播放、WebSocket 传输、15 个 CPU 参考模块（DDGI/ReSTIR/TAA/Hi-Z/Meshlet/VT/…）接入真实 GPU pass。

---

## 1. 目标与非目标

**目标（终局验收定义）**：
- **引擎**：用本引擎独立开发并运行一款完整 3D 游戏（GLTF 资产 + 骨骼动画 + 阴影 + 粒子 + 后处理 + 音效 + 物理），WebGL2 后端 1080p、中端 GPU ≥ 30fps；同一场景 Software 后端（降分辨率）parity 2/255。
- **编辑器（对标 Unity6 日常）**：一名游戏工程师从早到晚**只在浏览器内**完成——场景搭建（GPU 视口 60fps + gizmo + 多场景）、组件/材质编辑（注册表检视器）、写代码（内置代码工作台 + 外部 VS Code 双轨）、按 ▶ 立即试玩（暂停/单步/恢复，不改场景数据）、看日志/断言、剖析性能（帧时间线/内存/draw call）、导入资产（拖入 GLTF/贴图，后台 Worker 导入 + DDC 缓存）、改代码热重载秒级生效——全程无需整页刷新。
- **团队（多人协作）**：项目目录为**纯文本 git 仓库**（确定性序列化、对象级分文件），支持分支/合并/评审；2–10 人同时在线时可见彼此 presence 与对象级锁；push 后 CI（Node headless）自动跑全量 smoke + selftest。
- three.js 核心能力矩阵 24 项全部达到「可用」或「有明确等价实现」。

**非目标**：
- ❌ 引入 three.js / babylon / regl / cannon / rapier / Monaco 等任何第三方库（零依赖红线；companion 进程也只用 Node 内置模块）。
- ❌ 放弃 Software 黄金参考或降级链（红线 D/E）。
- ❌ 服务器端执行任何游戏计算（companion 只做文件 IO + 事件转发 + 静态服务）。
- ❌ AAA 规模（百人团队、GB 级资产库、FBX/USD/Substance 全链路 DCC 往返）——浏览器标签页内存上限与重型 DCC 生态是平台边界，明确不承诺。
- ❌ 支持全部 GLTF 扩展（核心子集 + 白名单扩展）。

---

## 2. 总体架构决策

| # | 决策 | 理由 |
|---|---|---|
| D1 | **渲染主战场 = WebGL2**；WebGPU 在 P8 真实化（先对等 WebGL2 能力，再补 compute） | WebGL2 覆盖面 100%，可先交付；WebGPU compute 依赖浏览器普及度，放后期不阻塞主线 |
| D2 | **矩阵约定不变**：行主序 + 列向量右乘；WebGL2 上传统一改 `uniformMatrix4fv(loc, true, m)`（GLES3 允许 transpose） | 一处修复消除双路径不一致；js 着色器无需改动 |
| D3 | **着色器双写维持 glsl + js**，扩展「uniform 声明表」：pipeline 声明 uniforms/samplers 布局，WebGL2 按表反射绑定，Software 按表取值 | 消灭「只有一个 uMVP」的硬编码；双写 parity 机制可复用 |
| D4 | **浏览器端 parity 验收页**：`tools/parity_browser.html` 在浏览器里对同一场景分别跑 WebGL2 与 Software，输出逐像素 diff 报告 | Node 无 GL 上下文；不引入 npm 依赖即可覆盖 GPU 路径回归 |
| D5 | **资产交换格式 = GLTF 2.0（.glb）**；自研 MSH1/TEX1 容器保留为 cooked 缓存（DDC 加速） | GLTF 是事实标准、自包含二进制；DDC 链路已存在 |
| D6 | **物理/动画/音频全自研升级**：GJK+EPA 从 C++ 版 M3.1 逐位移植；动画为「轨道采样 + 骨骼层级 + GPU 蒙皮」；音频在离线合成引擎外包一层 WebAudio 输出桥 | 零依赖红线；C++ 版已有 bit-exact 蓝图可移植 |
| D7 | **15 个 CPU 参考模块在 P4 起逐个接 GPU**：每个模块新增 GLSL 实现 + parity smoke，保持「CPU 黄金参考永不下线」 | 红线 D；模块已有 CPU 参考与 smoke，接 GPU 有清晰基准 |
| D8 | **图元生成器收编入引擎** `src/engine/render/primitives.js`，editor/games 引用之 | 消除三份重复实现 |
| D9 | **编辑器视口 GPU 优先**：viewport3d 增加 WebGL2 路径（同一套双写着色器），软渲染保留为降级与黄金参考；拾取保留 CPU AABB（引擎侧已有 `rayHit`），后期可加 GPU id-buffer | 根治 8fps 限帧；Unity6 视口即 GPU 60fps |
| D10 | **持久化 = OPFS（Origin Private File System）+ File System Access API 双轨**：项目目录结构镜像到磁盘（经 companion 写回或 FSA 直接写）；localStorage 仅留「最近打开/窗口布局」等 UI 状态 | 突破 5MB 配额；为 git 工作流铺路（磁盘上是真实文件树） |
| D11 | **companion 进程**（`serve.mjs` 演进为 `tools/companion.mjs`，仅 Node 内置模块）：静态服务 + 文件监听广播（SSE/WebSocket）+ HTTP PUT 保存 + presence/锁中继 + 多客户端事件总线。**不做任何游戏计算** | 浏览器无法自监听磁盘；等同 Unity 本地编辑器进程的角色定位；维持「计算 100% 在浏览器」 |
| D12 | **代码工作台双轨**：① 内置轻量代码面板（自研 tokenizer 高亮 + 补全骨架 + 多 Tab + 保存触发热重载，承接「浏览器 OS 无本地 IDE」场景）；② 外部 VS Code 直接编辑项目目录（companion 监听变更→热重载）——这正是 Unity6 的真实模式（代码也在外部 IDE 写） | 零依赖红线；两条轨共用同一热重载闭环 |
| D13 | **JobSystem Worker 化**：`job_worker.js`（浏览器原生 Worker，无依赖）承接资产导入/DDC 烘焙/GLTF 解析/纹理解码；主线程只做提交与 UI | 导入大资产不再冻结编辑器；Node 冒烟走顺序降级路径（红线 E） |
| D14 | **项目 = git 友好纯文本**：对象级分文件 + 确定性序列化（固定 key 序、LF、无时间戳、稳定 id）；场景清单与对象分离 | 多人分支合并大多自动；`node --check` 式 CI 可直接跑 |
| D15 | **Play 模式严格隔离**：运行时快照（内存深拷贝）上运行，红线 F 保证编辑数据不被反向改写；停止即丢弃快照回编辑态 | Unity Play 模式同语义；已有 `attachScene3d` 深拷贝雏形 |

---

## 3. 里程碑

### P0 — 止血：修复断裂与渲染正确性（阻塞一切）

| 任务 | 模块 | 验收 |
|---|---|---|
| 4 个 `game.js` 重构为**无 DOM 导出类**（API 以 `games/selftest.js` 现有调用为契约：`new XxxGame(seed, opts)` / `update(dt, input)` / `renderTo(batch)` / `camera()`）；DOM/主循环留在 `main.js`；`index.html` 切到 `main.js` | games/* | `node games/selftest.js` 全绿；浏览器 4 游戏经新入口可玩 |
| WebGL2 矩阵上传改 `transpose=true` | `rhi_webgl2.js` | 浏览器手动对比 WebGL2 vs Software 同帧一致 |
| `createPipeline` 消费 `depth` → `gl.enable/gl.depthFunc/gl.depthMask` | `rhi_webgl2.js` | 3D 场景遮挡正确 |
| WebGPU caps 改为诚实值（`compute:false, indirect:false, storageTextures:false`），实现后再翻真 | `rhi_webgpu.js` | `rhi_device_smoke` 断言 caps 与行为一致 |
| `ecs_archetype.query` 改为「包含匹配」；删除 physics3d 死导入；meshlet 构建统一走 `render/meshlet.js` | sim/、platform/ | sim_smoke 增补断言 |

**P0 出口**：现有 10 smoke + selftest 全绿，WebGL2 后端首次正确渲染 3D 三角形场景。

### P1 — WebGL2 渲染核心（把「89 行玩具」变成真 RHI）

| 任务 | 内容 | 验收 |
|---|---|---|
| 顶点布局系统 | WebGL2 消费 `vertexLayout`（任意 interleaved 布局），替代硬编码 stride=24；Software 同步支持 | `rhi_webgl2_layout` parity |
| Uniform 系统 | pipeline 声明 `{uniforms,samplers}`；`setConstants` 按表反射缓存 location；f32/vec2-4/mat4/数组 | 同上 |
| 纹理采样 | `bindTexture` 真实绑定 texture unit；GLSL `texture()`；过滤/wrap 由 createTexture 选项驱动；js 着色器同参数采样器 | `rhi_texture_parity` ≤2/255 |
| 渲染目标 | 真实 FBO：多 color attachment（MRT via `drawBuffers`）+ depth attachment；`beginPass({rt})` 绑定/恢复；RT 读回 | `rhi_rt_mrt_parity` |
| 光栅状态 | topology/cullMode/blend/winding 走到 GL 与 Software（Software 补背面剔除、近远平面裁剪、像素中心 +0.5） | `rhi_state_parity` |
| 引擎侧世界矩阵 | 渲染路径统一接受完整 `Mat4` 世界矩阵（消除 viewport.js TRS 近似） | editor_smoke 增断言 |
| 浏览器 parity 验收页 | `tools/parity_browser.html`：全部 parity 用例 + diff 图 | 手动打开全绿 |

**P1 出口**：RHI 层具备承载任意渲染管线的基础；WebGL2 与 Software 全特性 parity。

### P2 — 材质、灯光、阴影（画面立起来）

| 任务 | 内容 | 验收 |
|---|---|---|
| 真实 PBR 前向路径 | GGX/Cook-Torrance、metallic-roughness、能量守恒；先升级 `deferred_pbr.js` js 着色为完整 GGX（CPU 参考），再写 GLSL 对等 | `render_pbr_parity` |
| 灯光系统 | uniform 数组化灯表（directional/point/spot 各 N 盏上限）；衰减、聚光锥 | `render_light_parity` |
| 阴影 | 方向光深度预通行 + `sampler2DShadow` PCF；CPU 参考消费同一深度图；偏差/法线偏移 | `render_shadow_parity` + 视觉验收 |
| 雾 | 距离雾/指数雾 uniform；两后端同式 | parity smoke |
| 简化 IBL | 程序化天空 → CPU 烘 SH 环境光；镜面解析近似（P4 升预滤波） | `render_ibl_smoke` |
| 材质资源化 | `PbrMaterial`（albedo/roughness/metallic/emissive map 引用）挂 Scene3D mesh 组件与 GLTF | editor 检视器可编辑实时反映 |

**P2 出口**：典型 3D 场景（多灯+阴影+PBR+雾）WebGL2 正确渲染，与 Software 参考一致。

### P3 — 资产与动画（内容管线打通）

| 任务 | 内容 | 验收 |
|---|---|---|
| GLTF 2.0 加载器 | JSON + GLB chunk：accessor/bufferView、mesh primitive、node 层级 TRS、material、texture/sampler；扩展白名单 | `plat_gltf_smoke`（内置最小 .glb 夹具往返） |
| 图片解码 | 浏览器 `createImageBitmap`；Node 冒烟直喂 RGBA；ZTC/BC7 解压到 RGBA | `plat_image_smoke` |
| 图元收编 | `src/engine/render/primitives.js`（cube/sphere/plane/cylinder/cone/torus 参数化）；editor/games 改引用 | editor_smoke 不回退 |
| 骨骼动画 | 骨骼层级 + GLTF skin（inverseBindMatrices）+ CPU 蒙皮参考 + GPU 蒙皮（`uBones[N]`，N≤64 超限回退 CPU）+ AnimationMixer（clip 采样/循环/交叉淡入/混合权重） | `sim_anim_skinning_parity`；`sim_anim_mixer_smoke` |
| 动画与运行时接线 | GameRuntime 提供 mixer 步进、动画事件回调 | 演示验收 |

**P3 出口**：能加载外部 GLTF 角色与场景并播放骨骼动画。

### P4 — 高级渲染特性（把 15 个 CPU 参考接上 GPU）

| 任务 | 内容 | 验收 |
|---|---|---|
| Instancing | `drawElementsInstanced` + `vertexAttribDivisor`；Software 循环展开参考 | `render_instancing_parity` |
| 粒子系统 | `ParticleSystem`（CPU 模拟 + 确定性 Rng + 发射器/生命周期/曲线）→ instanced billboard quad | `render_particles_smoke` |
| 后处理链 | 全屏三角 + RT ping-pong：HDR→ACES tonemap、bloom、可选 vignette | `render_postfx_parity` |
| TAA 真接线 | prev-MVP 运动矢量 + jitter 写入投影 + 邻域 clamp（现有公式为参考） | `render_taa_parity` |
| 视锥剔除 + LOD + Hi-Z | `Frustum.intersects` 进提交路径；`selectLOD` 接入；Hi-Z 深度 mip 归约 pass + 遮挡剔除 | `render_cull_lod_smoke`（剔除计数两后端一致） |
| MSAA | multisample renderbuffer + `blitFramebuffer` | `rhi_msaa_smoke` |
| 文字/精灵 | canvas 2D 位图字体图集 → 纹理 → 批量 quad；sprite = 纹理 quad | `render_text_smoke` |
| Meshlet/VT（可后置） | meshlet 剔除接 instancing；VT 页表驱动流送 | `render_meshlet_smoke` |

**P4 出口**：画面特性达到「three.js + 常见后处理」可玩档次。

### P5 — 编辑器工作台（对标 Unity6 日常，本计划的一等公民）

> 目标：一名工程师**全天候只开浏览器**完成日常开发。依赖 P1（GPU 视口）；Play 模式先接现有 GameRuntime，P6 物理落地后自动增强。

| 任务 | 内容 | 验收 |
|---|---|---|
| **GPU 视口** | viewport3d WebGL2 路径（双写着色器复用）；视口 60fps、拖拽/导航零卡顿；软渲染按钮切换为「参考视图」；gizmo 叠加层从 canvas 2D 覆盖升级为同一 GPU pass 可选 | 1080p 视口 ≥ 60fps（perf_hud 实测）；parity 页覆盖编辑器视口路径 |
| **Play 模式** | ▶ = 编辑器内嵌 GameRuntime：运行快照（深拷贝，红线 F）→ 暂停/单步/恢复 → 停止回滚编辑态；game 视图与 scene 视图切换（game 视口 = 运行时相机）；运行时日志进 Console 面板 | 编辑场景对象→▶→脚本驱动运行→■→数据零污染（editor_smoke 断言序列化前后一致） |
| **代码工作台 v1** | `src/editor/code_editor.js`：多 Tab、文件树（VFS/OPFS）、tokenizer 语法高亮、括号配对、Ctrl+S 保存即热重载；补全 = 注册表组件名 + gbhy API + 引擎模块导出符号表（零依赖自研） | 编辑 scripts/*.js 保存→场景中行为更新（≤2s） |
| **热重载闭环** | companion v1（见 P7 前置，本阶段先做最小版：静态服务 + fs.watch + SSE 广播 + HTTP PUT 保存）；编辑器订阅 SSE → 模块失效（`import(url+版本查询串)`）→ 场景状态保持重载 | 外部 VS Code 改脚本→编辑器内行为更新；**全程无整页刷新** |
| **OPFS/FSA 持久化** | Project 存储 rewritten：项目目录（scenes/objects/assets/scripts/lib）落 OPFS；用户授权时经 FSA 直接映射磁盘目录（git 可见的真实文件树）；localStorage 只存 UI 状态 | 建千对象场景保存/加载 < 1s；磁盘文件树可被 git diff |
| **Worker 化** | `job_worker.js`：GLTF 解析/纹理解码/DDC 编译/网格压缩进 Worker；导入进度条；Node 冒烟走顺序降级 | 导入 50MB glb 时 UI 不冻结（主线程帧时间 < 16ms 持续） |
| **Profiler** | `src/editor/profiler.js`：帧时间线（CPU 分段：脚本/物理/提交/渲染；GPU 估段）、draw call/三角形计数、内存（performance.memory + 资源缓存统计）、快照导出 JSON | perf_hud 升级为可展开面板；帧时间线可对照 Unity Profiler 主指标 |
| **导入管线 UI** | 拖入文件 → import 向导（已有雏形扩展）：GLTF/贴图/OBJ 识别 → Worker 导入 → DDC 缓存 → 资产浏览器缩略图 | 拖入 .glb 出现可拖入场景的资产 |
| **多场景与 prefab 增强** | scene_tabs 已有多场景；prefab.js 接入「拖 prefab 进场景 = 实例 + override 记录」 | prefab 修改→实例同步；实例 override 不被覆盖 |
| **快捷键/工作流补全** | F 聚焦/W-E-R 工具切换（已有 gizmo）/Ctrl+D 复制/框选/对齐吸附 | 手感对照 Unity 常用键位表 |

**P5 出口**：「场景搭建→写代码→▶试玩→停止→改→再▶」核心循环全程浏览器内秒级完成，无刷新、无卡顿、无数据污染。

### P6 — 运行时系统（游戏性支撑）

| 任务 | 内容 | 验收 |
|---|---|---|
| 物理 3D 真实化 | GJK+EPA 从 C++ M3.1 逐位移植（接触点/法线/深度）；sequential-impulse（摩擦/恢复/迭代/休眠）；box/sphere/capsule/convex/网格三角；四元数旋转动力学 + 惯性张量；raycast；character controller（胶囊扫掠/滑墙/台阶） | `sim_physics3d_smoke`（含 C++ 对齐数值断言）；action3d v2 手感验收 |
| runtime 接物理 | `GameRuntime.stepPhysics` 换 physics3d 世界步进（红线 F 回写边界不变）；Play 模式自动获得完整物理 | plat_smoke 扩展 |
| 音频输出桥 | `AudioContext` 播放层（合成引擎 render() → AudioBufferSourceNode）、`decodeAudioData` 文件加载、loop/音量/总线、PannerNode 3D 音效（可选） | `plat_audio_smoke` |
| WebSocket 传输 | `WebSocketTransport` 与 `LoopbackTransport` 同接口（复用快照/插值/预测回滚复制层） | `plat_net_smoke` + companion 联调 |
| 编辑器视口最终整合 | 视口 GPU 路径吃 P2/P4 全部特性（阴影/后处理开关） | parity 页全量 |

**P6 出口**：物理/音频/网络达到可开发真实游戏的支撑度；Play 模式完整体验。

### P7 — 多人团队协作（git 工作流 + 在线协作，一等公民）

> 前置：P5 的 OPFS/FSA 磁盘镜像 + companion v1。companion 升级仅加「中继」能力，仍零游戏计算。

| 任务 | 内容 | 验收 |
|---|---|---|
| **companion v2** | `tools/companion.mjs`（Node 内置模块 only）：静态服务 + fs.watch 递归监听 + WebSocket 房间（presence 广播：谁打开哪个场景/正在编辑哪个对象）+ 对象级锁 API（编辑检视器获锁，他人只读并显示持有者）+ HTTP PUT 保存 | 两个浏览器实例互见 presence；同对象编辑被锁拦截并有可读提示（红线 A） |
| **git 友好项目布局** | 项目目录规范：`project.json`（清单）+ `scenes/<scene>.json`（场景轻清单：对象 id 列表+引用）+ `objects/<id>.json`（每对象一文件）+ `assets/`（源资产）+ `ddc-cache/`（.gitignore）+ `scripts/`。**确定性序列化**：固定 key 序（现有 serialize 已是构造序）、LF、结尾换行、无时间戳/无绝对路径、id 稳定 | 同一场景两次保存 byte-identical（smoke 断言）；git diff 只显示真实变更 |
| **语义合并工具** | `tools/merge_scene.mjs`：场景清单冲突时按对象 id 三方合并（对象文件级自动合并 + 冲突对象清单报告）；检视器内提供「解决冲突」面板 | 构造两人各改不同对象/同对象不同字段的合并用例：前者自动，后者报告并可手动选择 |
| **CI 流水线** | `.github/workflows`（或任意 runner）纯 `node` 步骤：`node --check` 全部 src + `node tools/run_smoke.js` + `node games/selftest.js` + 确定性序列化往返断言；产物：smoke 报告 + parity 页（手动/后续接浏览器 runner，不引依赖入项目） | 模拟 PR（改一个对象文件）→ CI 绿 |
| **团队评审流** | 对象级 diff 检视器：两个 project.json 版本的语义 diff（新增/删除/修改的对象与字段，非文本 diff） | 审查者看「灯 intensity 1→2」而非 JSON 行 |
| **资产引用与完整性** | 资产引用 = 相对路径 + 内容哈希（DDC 已有）；打开项目时校验缺失资产并列表（不静默，红线 A） | 删一个贴图文件→打开时报缺失清单 |

**P7 出口**：2–10 人团队按「分支→编辑（presence/锁防踩）→合并（对象级自动/报告）→PR→CI→主干」工作流日常协作。规模上限与对策见 §8 风险表。

### P8 — 终局验收 demo + WebGPU 真实化（不阻塞验收）

- **action3d v2「验收游戏」**：GLTF 骨骼角色 + 场景资产、阴影 + PBR + 雾、粒子、后处理、instancing 植被、文字 HUD、音效、角色控制器物理、存档（场景序列化）。硬指标：WebGL2 1080p ≥ 30fps（基准记录在案）；Software 160p parity 通过。**全程由本编辑器开发**（P5 工作流即开发方式，本身就是编辑器的验收）。
- **WebGPU 真实实现**：commandEncoder/renderPass 对等 WebGL2 + 真实 compute（WGSL）：Hi-Z 归约、DDGI 探针更新、ReSTIR 重采样（三个 CPU 参考 GPU 化，保持 parity）；caps 随实现逐步翻真。
- **导出/发布**：exporter 升级——「构建游戏」= 打包项目 + 引擎模块清单 + cooked 资产为单目录静态站点（无 companion 依赖，纯静态可托管）；standalone HTML 保留为玩具路径。
- **文档同步**：README/CONTRACT/docs/PORTING 更新到实况。

---

## 4. Unity6 编辑器能力对标矩阵（P5/P7 交付物）

| Unity6 能力 | 本项目对应 | 阶段 |
|---|---|---|
| Scene 视口（GPU 60fps/gizmo/导航） | viewport3d WebGL2 路径 + gizmo + camera_ctrl | P5 |
| Game 视图 + Play 模式（暂停/单步） | 编辑器内嵌 GameRuntime + 快照隔离 | P5 |
| Inspector（组件/材质编辑） | 注册表驱动检视器（已有，扩展 PbrMaterial） | P2/P5 |
| Hierarchy + 多场景 | hierarchy + scene_tabs（已有） | P5 增强 |
| Project 窗口 + 资产数据库 + 导入 | asset_browser + Worker 导入管线 + DDC | P5 |
| Timeline/Animation 窗口 | timeline（已有）+ 骨骼动画 mixer 接线 | P3/P5 |
| Console + 断言/错误可读 | console 面板 + 红线 A 贯穿 | P0 起 |
| Profiler（帧时间线/内存/draw call） | profiler.js | P5 |
| 代码编辑（外部 IDE + 热重载） | VS Code + companion 监听闭环（Unity 同款模式） | P5 |
| （浏览器 OS 补充）内置代码编辑 | code_editor.js 轻量版 | P5 |
| Package Manager | registry 驱动注册（组件即包） | P8 可选 |
| Version Control（git 集成） | 纯文本项目 + 对象级 diff | P7 |
| Collaborate / 多人 presence | companion v2 WebSocket 房间 + 锁 | P7 |
| Build Settings / 打包导出 | 静态站点构建导出 | P8 |
| Asset Server / 资产完整性 | 内容哈希引用 + 缺失校验 | P7 |

---

## 5. three.js 引擎能力映射（不变，摘录）

| three.js 能力 | 目标模块 | 阶段 |
|---|---|---|
| WebGLRenderer | rhi_webgl2（重写） | P0–P1 |
| WebGPURenderer | rhi_webgpu（真实化） | P8 |
| 场景图/层级 | scene3d + worldMatrix | P1 |
| 相机 | core/math + 运行时相机对象 | P1 |
| BufferGeometry | vertexLayout + primitives + gltf loader | P1/P3 |
| 材质（Standard/Physical） | PbrMaterial + GGX 双写 | P2 |
| 灯光（Dir/Point/Spot/Hemi） | 灯表 uniform + SH 环境 | P2 |
| 阴影 | 深度预通行 + PCF | P2 |
| 纹理/采样/压缩 | createTexture + 采样器 + ZTC/BC7 解压 | P1/P3 |
| GLTFLoader | asset_pipeline.gltf | P3 |
| 骨骼动画/SkinnedMesh + AnimationMixer | sim/animation + 蒙皮 + mixer | P3 |
| Raycaster | physics3d raycast + 视口拾取 | P6 |
| 粒子 / 后处理 / TAA / MSAA | P4 各项 | P4 |
| 雾/天空盒/IBL | fog + 程序化天空 + SH | P2/P4 |
| InstancedMesh / LOD | instancing / selectLOD 接线 | P4 |
| 文字/精灵 | 字体图集 + sprite quad | P4 |
| Audio | WebAudio 输出桥 | P6 |
| WebXR | 非目标（明确不做） | — |
| （外部）物理引擎 | physics3d 真实化 | P6 |

---

## 6. 多人团队工作流（P7 详细设计）

**项目目录（git 仓库根）**：
```
game.project/
  project.json            # 清单：场景列表、启动场景、组件注册表引用
  scenes/main.json        # 场景清单：对象 id 有序列表 + 场景级设置
  objects/1001.json       # 每对象一文件：transform/components/material/scripts
  objects/1002.json
  assets/                 # 源资产：.glb/.png/.obj（二进制走 git-lfs 或大文件警告）
  scripts/player.js       # ES module：export {onStart,onUpdate,onCollision}
  lib/                    # 项目级共享脚本
  ddc-cache/              # .gitignore：内容哈希派生缓存
```

**日常循环（对标 Unity + PlasticSCM 的体感）**：
1. `git checkout -b feat/level-2` → 编辑器打开项目（FSA 授权磁盘目录，或 OPFS + companion 镜像）。
2. 编辑场景/写脚本——companion 广播 presence，同对象被同事锁定时只读+提示。
3. Ctrl+S → 确定性序列化落盘 → `git add/commit`（diff 干净：只含真实变更对象文件）。
4. PR → CI（Node headless 全量 smoke + selftest + 序列化往返）→ 合并冲突时 `tools/merge_scene.mjs` 对象级三方合并。
5. 主干打开项目即最新（companion fs.watch 热更新资产）。

**红线映射**：F（编辑→运行时单向）保证 Play 模式不污染 git 工作区；A（不静默失败）保证锁冲突/资产缺失全部可见；E（可选层降级）保证无 companion 时编辑器仍单机可用（OPFS 模式 + 手动 git）。

---

## 7. 测试与验收策略

1. **Node smoke（既有机制）**：一切 CPU 参考/数据结构/解析器 → `tools/smoke/*.js` 全绿。新增：确定性序列化往返（同场景两次保存 byte-identical）、merge_scene 用例、companion 协议（Node 内回环）。
2. **浏览器 parity 页**：`tools/parity_browser.html` 覆盖所有「GPU vs Software」断言（2/255）；P1 起每个渲染 PR 先过此页；P5 起加编辑器视口路径。
3. **游戏自测**：`node games/selftest.js` 是 games 层回归门。
4. **编辑器工作流验收（P5）**：脚本化「场景搭建→代码修改→热重载→Play→停止」全流程用例（editor_smoke 扩展 + 浏览器手动清单）；主线程帧时间 < 16ms 持续（导入大资产期间）。
5. **协作验收（P7）**：双实例 presence/锁用例；三方合并用例矩阵（不同对象/同对象不同字段/同对象同字段）。
6. **CI**：纯 node 步骤（--check / run_smoke / selftest / 序列化断言），任何 runner 可执行，不引依赖。
7. **性能基准（P8）**：验收游戏固定场景固定相机路径，fps 记录 `docs/benchmark.md`；回归不超 15%。
8. **红线检查**：每阶段收尾跑全量 smoke + parity，确认 A（caps 诚实）/D（CPU 参考不下线）/E（缺 GPU 优雅降级）/F（Play 不污染）未破坏。

---

## 8. 风险与对策

| 风险 | 对策 |
|---|---|
| WebGL2 uniform 数量上限（蒙皮 64 骨×mat4 近顶） | 超限回退 CPU 蒙皮；或骨骼分批 draw |
| 双写着色器维护成本随特性数上升 | 公式集中 js 参考，GLSL 从声明表生成绑定；parity 页每特性一测 |
| 软件光栅器成为 parity 瓶颈 | parity 页允许降分辨率；数值路径逐位、像素路径 2/255 |
| GLTF 兼容面失控 | 核心子集 + 白名单；仓库自带最小 .glb 夹具锁定行为 |
| **浏览器标签页内存上限（~2–4GB）** | 资产按 DDC 惰性加载 + ResourceCache LRU 逐出（已有）；大项目分场景按需加载；明确不承诺 AAA 规模 |
| **自研代码编辑器上限**（对标不了 VS Code） | 双轨定位：内置版只保证「浏览器 OS 可用」基线；桌面环境主推外部 VS Code（Unity 同模式）；companion 闭环保证体验一致 |
| **协作规模天花板**（WebSocket 中继 + 对象级锁的承载上限） | 明确定位 2–10 人同场景在线；更大团队 = git 分支隔离（锁只防同场景踩踏，跨分支靠 CI）；companion 无状态可多实例分房间 |
| **companion 与「零后端」定位的边界争议** | 契约级澄清：companion 仅文件 IO/事件转发/静态服务，无游戏计算（D11）；离线单机（OPFS）与纯静态发布路径始终可用 |
| 零依赖红线与开发效率冲突 | 夹具/生成器自写进 tools/；验收页纯浏览器原生 |
| WebGPU compute 排期滑出 | P8 与 WebGL2 验收解耦，不阻塞「取代 three.js」结论 |

---

## 9. 规模与节奏估计

| 阶段 | 新增/重写规模（估） | 关键交付 |
|---|---|---|
| P0 | ~4 文件重构 + ~40 行修复 | 可玩、遮挡正确、caps 诚实 |
| P1 | rhi_webgl2 重写 ~600–900 行 + parity 页 | 真渲染核心 |
| P2 | ~500–700 行（含 GGX 双写） | PBR/灯/阴影 |
| P3 | ~800–1200 行（gltf+蒙皮+mixer） | 内容管线 |
| P4 | ~900–1300 行 | 画面档次 |
| P5 | ~1500–2200 行（GPU 视口/Play/代码工作台/热重载/OPFS/Worker/Profiler） | **Unity6 级日常工作流** |
| P6 | ~1000–1500 行（物理移植为主） | 游戏性支撑 |
| P7 | ~800–1200 行（companion/序列化/合并/CI/diff） | **多人团队协作** |
| P8 | demo + WebGPU（弹性） | 终局验收 |

合计约 +7000–10000 行核心代码（不含 smoke/夹具），9 个可独立验收阶段；每阶段出口保持「全量 smoke 绿 + parity 绿」，不做半成品硬编码（红线 B）。P0–P4 与 P5 的代码工作台/OPFS/Worker 子项可双人并行（互不触碰对方文件，符合契约并行开发约定）。
