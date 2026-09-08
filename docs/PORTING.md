# 移植映射：engine_refactored (C++/Python) → engine_tensorflow+js

本表把原项目的子系统逐一映射到 JS 版文件，便于对照与定位实现。

| 原 C++ / Python 子系统 | 原文件 | JS 版文件 | 说明 |
| --- | --- | --- | --- |
| 数学 / 3D 物理约定 | `engine/math.h` | `src/engine/core/math.js` | 行主序 Mat4、Vec3/Quat/AABB/Frustum 逐元素对齐 |
| 矩阵约定 | `docs/子系统-矩阵约定与3D物理.md` | `src/engine/core/math.js` 头注释 | M5.0 统一约定 |
| 内存分层 | `engine/memory.h` | `src/engine/core/memory.js` | Arena/Pool/Stack |
| 任务系统 | `engine/job_system.h` | `src/engine/core/job.js` | 并行 + 确定性串行模式 |
| 确定性 | `engine/determinism.h` | `src/engine/core/determinism.js` | Q16.16 / 哈希 / 输入录制回放 |
| 性能分析 | `engine/profiler.h` | `src/engine/core/profiler.js` | CPU 区段 + Chrome Trace |
| 控制台变量 | `engine/cvar.h` | `src/engine/core/cvar.js` + `platform/cvar_console.py` | 注册表 + 控制台 |
| 能力分级 | `engine/capability.h` | `src/engine/core/capability.js` | L0–L3 降级 |
| 契约测试 | `engine/contracts.h` | `src/engine/core/contracts.js` | IRHIContract 等 |
| RHI 抽象 | `engine/rhi.h` | `src/engine/render/rhi.js` + `rhi_software/webgl2/webgpu.js` | 三级后端 |
| 渲染图 | `engine/render_graph.h` | `src/engine/render/render_graph.js` | 拓扑 + 环检测 + barrier |
| 延迟 PBR | `engine/render_backend.h` | `src/engine/render/deferred_pbr.js` | CPU 参考 + GPU，parity |
| Meshlet | `engine/meshlet_cull.h` | `src/engine/render/meshlet.js` | 构建 + 剔除 |
| Hi-Z | `engine/gpu_occlusion_cull.h` | `src/engine/render/hiz.js` | 深度金字塔 + 遮挡 |
| Visibility Buffer | `engine/visibility_buffer.h` | `src/engine/render/visibility_buffer.js` | 延迟材质解析 |
| TAA | `engine/temporal.h` | `src/engine/render/taa.js` | 抖动 + 历史 clamp |
| VRS / VT | `engine/vrs.h` / `virtual_texturing.h` | `src/engine/render/vrs.js` / `virtual_texturing.js` | |
| 光照烘焙 | `engine/lightmap_baker.h` | `src/engine/render/lightmap.js` | CPU 烘焙 |
| DDGI | `engine/ddgi.h` / `ddgi_gpu.h` | `src/engine/render/ddgi.js` | 探针网格 + 可选 TF.js |
| ReSTIR | `engine/restir.h` | `src/engine/render/restir.js` | |
| 神经材质 | `engine/neural_material.h` | `src/engine/render/neural_material.js` + `src/engine/infer/` | |
| 虚拟几何 | `engine/virtual_geometry.h` | `src/engine/render/virtual_geometry.js` | 简化 Nanite |
| 帧预测/插值 | `engine/frame_predict.h` / `frame_interp.h` | `src/engine/render/frame_predict.js` / `frame_interp.js` | |
| ECS | `engine/ecs.h` / `ecs_archetype.h` | `src/engine/sim/ecs.js` / `ecs_archetype.js` | |
| 3D 物理 | `engine/physics3d.h` + `platform_core/physics3d_mirror.py` | `src/engine/sim/physics3d.js` | GJK/EPA |
| 2D 物理 | `engine/physics.h` | `src/engine/sim/physics.js` | |
| 布料 | `engine/*`(cloth) | `src/engine/sim/cloth.js` | |
| 求解器 | `solver_ode/linear/pde.h` + `fluid_solver.h` | `src/engine/sim/solver_*.js` / `fluid.js` | |
| AI | `engine/ai.h` | `src/engine/sim/ai.js` | 转向/FSM/行为树 |
| 骨骼动画 | `engine/skeleton_anim.h` + `animation.py` | `src/engine/sim/animation.js` | |
| VFS | `engine/filesystem.h` | `src/engine/platform/vfs.js` | **目录根真枚举**（C++ 版曾为空桩） |
| 资产管线 | `engine/asset_pipeline.h` | `src/engine/platform/asset_pipeline.js` | OBJ/ZTC4x4/BC7 |
| DDC | `engine/asset_ddc.h` | `src/engine/platform/ddc.js` | |
| Prefab | `engine/prefab.h` | `src/engine/platform/prefab.js` | |
| 热重载 | `engine/file_watchdog.h` | `src/engine/platform/hot_reload.js` | |
| 场景/水合 | `scene.h` / `scene3d.h` / `scene_hydrator.h` | `platform/scene.js` / `scene3d.js` / `hydrator.js` | 水合只读 |
| 网络复制 | `engine/net_replication.h` | `src/engine/platform/network.js` | 快照/插值/预测 |
| 音频混音 | `engine/audio_mixer.h` | `src/engine/platform/audio.js` | |
| 编辑器（IDE） | `python/ide/*` | `src/editor/*` | 视口/层级/检视器/资源/控制台/时间轴… |

## 与原项目的关键差异

1. **无 three.js**：全部渲染由自研 `rhi_*` 后端完成；Software 后端是黄金参考（CPU 光栅 + 逐元素 parity）。
2. **推理下沉到浏览器**：`src/engine/infer/` 提供 `NanoTensor`（零依赖参考实现）+ 可选 TF.js，神经材质/DDGI/超分/AI 策略统一走 `InferenceRuntime`。
3. **编辑器即网页**：`python/ide` 的 Tkinter 实现被原生 DOM 编辑器取代，功能对齐（含 gbhy 式 IDE Script）。
