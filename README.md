# engine_tensorflow+js

`c:\engine_refactored`（C++17 + DX12/Software 双后端 RHI + Python Tkinter IDE）的
**全功能对等 JS 重构版**：在浏览器端用自研引擎（无需 three.js）实现计算与推理渲染，
并集成 **Blender 式建模模块**（任意手工拓扑 + 纯 JS 脚本命令后台）与 **Vue2 vdom diff（游戏版）**。

## 一句话定位

- **渲染**：自研引擎，WebGPU（L3，含 compute）→ WebGL2（L1/L2）→ Software（L0，黄金参考）三级后端。
- **建模**：Blender 式建模模块（half-edge 拓扑内核 + 修改器栈 + 属性选项卡），
  配套**纯 JS 脚本命令后台**（data/ctx/ops 三命名空间，GUI 与脚本共用命令总线，可撤销）。
- **vdom diff（游戏版）**：完整移植 Vue2 的 `patch/updateChildren` diff 内核（key 乱序/双端比较），
  平台无关——同一套算法可驱动 **Scene3D 游戏对象树** / **真实 DOM** / **内存 mock 树** 三种宿主；
  配套响应式封装（Proxy 自动 diff + watch/computed），参考 `Aether/pythonClasses/beginner/04_vue_global_data`。
- **计算推理**：TensorFlow.js 直接在浏览器端执行模型推理（神经材质 / DDGI 去噪 / 超分 / AI 策略），
  `@tensorflow/tfjs` 为**可选依赖**，缺失时降级到内置纯 JS 张量引擎 `NanoTensor`。
- **编辑器**：Web 版 IDE（原生 DOM，无框架，无构建步骤），功能对等 `python/ide`。
- **游戏**：`games/` 下可在浏览器直接运行。

## 运行

```bash
# 浏览器打开编辑器（ES module 需 http:// 而非 file://）
node serve.mjs            # 默认 http://localhost:8080/ ，打开后进入 src/editor/index.html
# 或任意静态服务器：python -m http.server 8080

# 全量 smoke 验收（Node 22，无需浏览器）
node tools/run_smoke.js          # 全部（当前 76 个 smoke / 2368 断言，全绿）
node tools/run_smoke.js core_    # 按前缀过滤（core_/render_/sim_/plat_/editor_/rhi_/...）
node tools/run_smoke.js plat_vdom  # vdom diff（Vue2 patch 内核 + 三 host + 响应式，81 断言）
node tools/run_smoke.js plat_modeling  # v3 建模内核（half-edge/命令/修改器/脚本 API）
node tools/run_smoke.js render_taa     # v2 Q3 TAA（运动矢量 + resolve，42 断言）
```

> 未安装 `@tensorflow/tfjs` 时**所有推理走 NanoTensor 参考路径**，smoke 必须仍然全绿（硬性要求）。

## 路线图

| 版本 | 主题 | 状态 | 文档 |
|---|---|---|---|
| v1 | 取代 three.js：自研 WebGL2/WebGPU/Software 三级后端 + Web IDE | ✅ 已落地 | `plan v1.md` |
| v2 | 对标 Unity6 日常开发闭环：物理 3D / 音频 / 网络 / WebGPU 真实化 / 多人协作 / 静态导出 | 🟢 进行中（Q1 物理 ✅ 含 runtime 接线 / Q2 音频+网络 ✅ / Q3 TAA 内核 ✅ / Q5 Worker 协议 ✅） | `plan.md` |
| v3 | **Blender 式建模模块**：任意手工拓扑 / 场景 / 视图 / 渲染 / 工具 / 输出 / 世界环境 / 物体 / 粒子 / 物理属性 / 材质选项卡 / 修改器与约束 / **纯 JS 脚本命令后台** | ✅ **M-A0~M-F 全部落地** | `plan v3.md` |
| vdom | **Vue2 vdom diff（游戏版）**：patch/updateChildren 内核 + Scene3D/DOM/mock 三宿主 + 响应式封装 | ✅ 已落地 | `docs/VDOM.md` |

**v3 状态总览**（详见 `plan v3.md`，逐阶段进度见该文件内 `> 2026-09-08 进度` 块）：

| 阶段 | 内容 | 状态 | 新增 smoke |
|---|---|---|---|
| M-A0 | 前置修复：H1 id 分裂 / H2 children 腐化 / H7 确定性哈希 / H10 命名规范 | ✅ | core_hash、plat_scene_id |
| M-A | half-edge 拓扑内核 + 命令总线 + 属性选项卡框架 + Material/World 数据块 + 模式状态机 | ✅ | plat_modeling_hedit、plat_modeling_undo、plat_material、editor_mode、editor_tabs |
| M-B | 建模交互视口：H5 gizmo 修复 / H8 视口资源缓存 / 顶点边面拾取 / P0 算子 GUI 化 / dirty 增量重建 | ✅ | render_viewport_cache、editor_gizmo、plat_modeling_ops、plat_modeling_pick、editor_modeling_session |
| M-C | 建模脚本 JS API：`data`/`ctx`/`ops`/`undoGroup` + gbhy 注入 | ✅ | editor_modeling_api |
| M-D | 修改器栈（Subdiv/Mirror/Array/Solidify/Bevel/Weld/Triangulate）+ 约束（Copy/TrackTo/Limit） | ✅ | sim_constraint、plat_modeling_modifier_cmd |
| M-E | 物理/粒子/材质选项卡吃全 + normalMap 真进渲染 + World 下发 | ✅ | editor_physics、sim_particles_ext、render_normalmap、plat_world_viewport |
| M-F | **输出**：OBJ/MTL 与 glTF/GLB 写出读回 + 坐标/单位变换层（D33） | ✅ | plat_export_mesh、editor_modeling_export |

**v3 要点**：
- **拓扑内核**：half-edge 编辑内核（`engine/modeling/hedit.js`）+ 派生 SoA 三角渲染缓存，
  支持挤出/环切/倒角/合并/细分/桥接等算子；`validate()` 校验 6 项不变量。
- **脚本后台**：纯 JS 命令 API（`data`/`ctx`/`ops` 三命名空间 + `undoGroup`），复用 gbhy 机制，
  零解释器、零 Python；GUI 按钮与脚本算子走同一命令总线，结果可撤销且 meshHash 一致。
- **属性选项卡**：对标 Blender Properties 编辑器（工具/渲染/输出/视图层/场景/世界/物体/修改器/
  粒子/物理/约束/材质/网格数据 13 个选项卡），注册表驱动。
- **前置修复（M-A0）**：修复场景反序列化 id 分裂、children 双向腐化，新增确定性哈希工具，
  为命令层提供稳定引用与可断言基础。
- **输出（M-F）**：OBJ+MTL / glTF / GLB 三格式写出与读回，`exportScene()` 场景级入口，
  四个坐标/单位预设（YUP_M/YUP_CM/ZUP_M/ZUP_CM），法线用逆转置矩阵，含镜像/奇异矩阵显式报错。
  脚本侧 `ops.export.obj/gltf/glb` 与 GUI 导出共用同一函数（产物逐字节一致）。
- **vdom diff**：完整移植 Vue2 `patch/updateChildren`（key 乱序/双端比较/移动复用），
  平台无关——同一套算法驱动 Scene3D 游戏对象树 / 真实 DOM / 内存 mock 树；
  配套 `VDomReactive`（Proxy 自动 diff + watch/computed）。

## 代码工作台：边调试边热加载边运行（Debug 模式）

工具栏「代码工作台」打开一个零依赖 JS 编辑器（自研 tokenizer + 语法高亮 + 文件树 + OPFS 持久化）。
配合 **Play 模式**（工具栏「Play 模式」按钮或 `Ctrl+P`）即可进入 **Debug 模式**，实现「边调试 · 边热加载 · 边运行」：

**Debug 工作流**：进入 Play →（可暂停或边运行）在代码工作台/检视器改脚本 → `Ctrl+S` 热加载进运行会话（游戏不重启）→ 切回继续或单步，实时面板观察实体 `pos`、`this.log` 日志、监视表达式。

1. **运行**：先点 `▶Run`（`Ctrl+P`）进入 Play，游戏在场景深拷贝快照上独立运行（红线 F：停止即回滚，编辑态零污染）。
2. **调试工具条**（代码工作台底部）：`⏸ 暂停 / ▶ 继续`、`⏭ 单步`（精确推进 1/60s 一帧）、`🔄 热重载`。
   - 暂停后游戏冻结，可**逐帧单步**观察实体状态变化；下方实时面板显示每个实体的 `pos(x,y,z)` 与脚本 `api.log` 输出；
     并提供「**监视表达式**」输入（如 `pos[0]`、`sqrt(pos[0]^2+pos[2]^2)`），对选中实体实时求值。
3. **热加载**：游戏运行中直接改脚本按 `Ctrl+S` → 新代码**立即热加载进运行中的会话**（不停止游戏），
   同时写回编辑器对象脚本（下次 Play 也生效）。语法错误会被拦截并提示，旧脚本继续运行不中断。
4. **检视器脚本卡（A）**：Inspector 直接内联编辑对象的 `scripts` 文本区，每个槽位带「热加载 / 删除」按钮；
   运行中编辑即时编译并热加载到该对象（红线 F：仅改运行时，停止回滚）。也可用「+ 新增脚本」加槽位。
5. **断点（B）**：脚本内 `this.breakpoint([msg])` 命中点自动暂停会话（状态栏显示「⏸ 命中断点」），配合单步逐帧排查；
   单脚本异常被隔离，不影响其它脚本与编辑数据。
6. **内联错误标记（C）**：代码工作台按行高亮，语法错误行标红并显示「第 N 行: 错误」提示（校验在浏览器内零依赖进行）。
7. **脚本 API 扩展（D）**（在脚本内以 `this` 调用）：
   - 输入回调：`onKeyDown/onKeyUp/onMouseDown/onMouseUp/onMouseMove`（事件式；红线 E：无输入则永不触发）。
   - 生成/销毁：`spawn(name, {position, rotation, components, material, scripts})`、`despawn(id)`。
   - 计时器：`timer(sec, cb)` / `after(sec, cb)` 在运行时秒后触发一次回调。
   - 碰撞/查询：`distanceTo(id)`、`queryRadius(r)`（返回 `{id, name, dist}` 数组）、`raycast(dir, maxDist)`。
   - 基础：`move/rotate/setPosition/setRotation`、`position/rotation/scale/time/dt/input`、`log`。
   - Action3D 类玩法现已可**完全由对象脚本驱动**（`src/engine/platform/demo_action3d.js` 即示例：方向键移动、空格跳跃、靠近敌人/金币触发 `despawn`）。
8. **文件约定**：`scripts/<对象名>[#槽位].js` 对应同名对象的脚本槽位（示例 `scripts/cube.js` → 名为 `cube` 的对象），
   多脚本用 `#0`/`#1` 区分。空槽位热加载会自动新增首个脚本。默认 `cube`/`sun` 已预置演示脚本（沿路径移动 / 自转）。
9. **Worker 化**：语法校验在后台 Web Worker 进行，不阻塞主线程；不可用环境自动回退同步校验（红线 E/A）。

> 配套单测：`tools/smoke/debug_mode_smoke.js`（单步 / 热重载 / 日志 / 暂停拦截 / 空槽创建）、
> `tools/smoke/api_extension_smoke.js`（input/spawn/timer/碰撞/breakpoint/watch）、
> `tools/smoke/action3d_script_smoke.js`（对象脚本驱动动作游戏：移动/跳跃/收集/销毁）、
> `tools/smoke/script_compiler_smoke.js`、`tools/smoke/file_system_smoke.js`、`tools/smoke/profiler_timeline_smoke.js`。

## 目录

```
src/engine/core/      math / memory / job / determinism / profiler / cvar / capability / contracts /
                      json / log / engine / hash(v3 新增：确定性哈希)
src/engine/render/    rhi(抽象) / rhi_software / rhi_webgl2 / rhi_webgpu / render_graph / deferred_pbr /
                      meshlet / hiz / visibility_buffer / taa / taa_gpu(运动矢量+TAA resolve, Q3) /
                      vrs / virtual_texturing / lightmap / ddgi / restir / neural_material /
                      virtual_geometry / paired_render / frame_predict / frame_interp / temporal /
                      viewport3d / pbr / postfx / ibl / lights / cull / instance_buffer / primitives /
                      text / scene_render / skin
src/engine/sim/       ecs / ecs_archetype / physics / physics3d / world3d / epa / character /
                      cloth / solver_ode / solver_linear / fluid / solver_pde / ai / animation / particles
src/engine/modeling/  hedit(half-edge 内核) / modifier(修改器栈)   【v3 新增】
src/engine/platform/  vfs / asset_pipeline / ddc / prefab / hot_reload / cvar_console / scene / scene3d /
                      hydrator / exporter / export_mesh(OBJ/glTF 导出, M-F) / runtime / scripting /
                      network / net_ws(WebSocket 传输, Q2) / audio / audio_web(WebAudio 桥, Q2) /
                      resource / gltf / image / job_worker / play_session / texture_bridge / demo_action3d
src/engine/infer/     tensor(NanoTensor) / tfjs_backend / inference / neural
src/engine/vdom/      vnode / patch(Vue2 diff 内核) / modules / gnode_host(Scene3D 游戏对象树) /
                      dom_host(真实 DOM+mock) / index(VDomApp/VDomReactive/工厂)   【vdom 新增】
src/editor/           index.html + 视口/层级/检视器/资源/控制台(gbhy)/时间轴/性能HUD/命令面板/.../
                      modeling/(建模命令层/脚本 API) / mode(模式状态机)   【v3 新增】
tools/smoke/          *_smoke.js 测试套件（run_smoke.js 自动发现，前缀分层 core_/render_/sim_/plat_/
                      editor_/rhi_/gi_/infer_，v3 新增 plat_modeling_*/editor_modeling_*，vdom 新增 plat_vdom_*）
games/                breakout / space_shooter / match3 / action3d
docs/                 架构 / 移植映射 / 推理说明 / VDOM(vdom diff 游戏版)
```

## 设计铁律（沿用于 C++ 版）

- **D. CPU 参考先行**：任何 GPU 路径先有 CPU 参考实现，GPU 结果在容差内与之对齐；Software 为黄金基准，永不下线。
- **E. 可选层缺失即降级，不崩溃**：WebGPU / WebGL2 / TF.js / Worker 全部可选。
- **F. 编辑器 → 运行时单向**：编辑器数据模型不被运行时反向改写。
- **矩阵行主序**：`m[row*4+col]`，列向量右乘 `v' = M·v`，平移在第 4 列；`vp = proj·view`。
- **零运行时依赖**：禁止引入 three.js/babylon/Pyodide 或任何第三方库（建模脚本后台为纯 JS）。

详见 `CONTRACT.md`（并行开发的唯一事实来源）、`docs/PORTING.md`（C++ 子系统 → JS 文件映射）、
`plan.md`（v2 路线图）与 `plan v3.md`（v3 建模模块路线图）。
