# 架构：engine_tensorflow+js

本文是总体架构说明；模块级契约见 [CONTRACT.md](../CONTRACT.md)，C++ 映射见 [PORTING.md](./PORTING.md)。

## 分层

```
┌──────────────────────────────────────────────────────┐
│ games/  (breakout · space_shooter · match3 · action3d)│
├──────────────────────────────────────────────────────┤
│ src/editor/  Web IDE（原生 DOM，无框架）               │
│   UI 面板：hierarchy inspector viewport gizmo ...     │
│   DOM-free 核心：registry selection history project   │
│                  ide_script_api(gbhy) timeline        │
├──────────────────────────────────────────────────────┤
│ src/engine/                                          │
│  platform/  vfs asset_pipeline ddc prefab hot_reload  │
│             scene scene3d hydrator exporter runtime   │
│             scripting network audio resource          │
│  sim/       ecs ecs_archetype physics(3d) cloth       │
│             solver_ode/linear/pde fluid ai animation  │
│  render/    rhi（抽象）+ software(L0) / webgl2(L1/2)  │
│             / webgpu(L3) · render_graph deferred_pbr  │
│             meshlet hiz visibility_buffer taa vrs vt  │
│             lightmap ddgi restir neural_material      │
│             virtual_geometry frame_predict/interp     │
│  infer/     tensor(NanoTensor) tfjs_backend inference │
│             neural                                    │
│  core/      math capability contracts memory job      │
│             determinism profiler cvar json log engine │
└──────────────────────────────────────────────────────┘
```

## 关键数据流

1. 编辑器编辑 → `Scene3D`（数据模型，可序列化 JSON）。
2. 编辑器视口渲染：`Scene3D → 图元几何 → Viewport3D(SoftwareDevice) → RGBA8 → canvas`。
3. 游戏运行：`GameRuntime` 固定步长驱动 scripts + physics；渲染走 RHI 三级后端。
4. 推理：`inference.js` 统一入口，`tfjs_backend` 存在时走 TF.js，否则降级 `NanoTensor`（红线 E）。

## 渲染后端策略

- `createRenderDevice('auto')`：WebGPU → WebGL2 → Software 自动下探。
- L0 Software 是黄金参考：任何 GPU 路径必须有 CPU 参考 + parity smoke（红线 D），
  容差 2/255（`rhi_parity_smoke` 断言）。
- 着色器双写 `glsl.*` + `js.*`，同一份 pipeline 在两种后端产出一致结果。

## 编辑器架构

- **单向数据流**（红线 F）：面板只改 `Scene3D`；运行时写回必须经显式 `applyToScene`。
- **撤销/重做**：操作前 `History.push(scene.serialize())` 快照；undo/redo 用
  `Scene3D.deserialize` 恢复，粒度 = 用户操作。
- **注册表驱动检视器**：`registry.js` 声明组件字段（类型/范围/默认值），
  `inspector.js` 据此生成控件 —— 新组件只需注册，不改 UI 代码。
- **gbhy 控制台**：`ide_script_api.js` 把 Project/Selection/History 包成命令函数，
  `runScript` 支持表达式与多语句；所有函数返回可读错误（红线 A）。
- **DOM 隔离**：仅 `src/editor/**` 触碰 DOM；DOM-free 核心（registry/selection/
  history/project/ide_script_api/timeline）在 Node 下由 `editor_smoke` 覆盖。

## 确定性

- 所有随机走 `math.js` 的 `Rng`（xorshift32），禁止 `Math.random()`。
- 游戏与 smoke 使用固定 seed，行为可复现。
- `determinism.js` 提供 Q16.16 定点与输入录制回放。
