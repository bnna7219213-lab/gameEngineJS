# engine_tensorflow+js · 模块契约（并行开发唯一事实来源）

本文件是多个实现者并行开发时的**唯一约定**。任何实现与本文件冲突时，以本文件为准。

## 1. 项目定位

`c:\engine_refactored`（C++17 + Python IDE）的 **JS 版全功能对等实现**：

- **渲染**：不用 three.js，自研引擎。WebGPU（L3，含 compute）→ WebGL2（L1/L2）→ Software（L0，黄金参考）三级后端。
- **计算推理**：TensorFlow.js 直接在浏览器端执行模型推理（神经材质、DDGI/ReSTIR 的神经网络变体、AI 行为、超分），`@tensorflow/tfjs` 为**可选依赖**，缺失时降级到内置纯 JS 张量引擎 `NanoTensor`。
- **编辑器**：Web 版 IDE，功能对等 `python/ide`（层级树、注册表驱动检视器、3D 视口 + Gizmo、资源浏览器、IDE Script 控制台 `gbhy`、时间轴、性能 HUD、命令面板、多场景 Tab、导入向导、多预览窗口、主题、撤销/重做）。
- **游戏**：`games/` 下可直接在浏览器运行的示例。

## 2. 技术约束（硬性）

| 项 | 约束 |
| --- | --- |
| 模块 | 原生 ES Module（`"type":"module"`）。**无构建步骤**，浏览器直接 `import`。 |
| 扩展名 | 一律 `.js`（不用 `.mjs`/`.ts`/`.jsx`）。 |
| 依赖 | **零运行时依赖**。唯一可选依赖 `@tensorflow/tfjs`（浏览器用 importmap 从 CDN 取；Node 用 optionalDependency）。禁止引入其它 npm 包。 |
| 语法 | ES2022。可用 `class`、`async/await`、`??`、`?.`、`at()`。避免提案阶段语法。 |
| Node 兼容 | 所有**非 DOM 相关**模块必须能在 Node 22 下 `import` 并运行（smoke 在 Node 跑）。 |
| DOM 隔离 | 只有 `src/editor/**` 允许触碰 `document`/`window`/`canvas`。引擎层禁止引用 DOM（除 RHI 后端的 canvas 参数）。 |
| 注释 | 中文。每个文件头 3-10 行说明「职责 + 与 C++ 版哪个文件对应 + 关键约定」。 |
| 数值 | 线性空间计算，输出前转 sRGB（`Color.toSRGB()`）。矩阵行主序（见 §4）。 |
| 确定性 | 随机一律用 `math.js` 的 `Rng`（xorshift32），禁止 `Math.random()`。禁止依赖对象遍历顺序影响结果。 |

## 3. 目录结构（文件归属）

```
engine_tensorflow+js/
  package.json  serve.mjs  index.html  README.md  CONTRACT.md  verify.bat
  src/engine/
    core/       math.js ✔  capability.js ✔  contracts.js ✔
                memory.js  job.js  determinism.js  profiler.js  cvar.js
                json.js  log.js  engine.js
    render/     rhi.js ✔
                rhi_software.js  rhi_webgl2.js  rhi_webgpu.js
                render_graph.js  deferred_pbr.js  meshlet.js  hiz.js
                visibility_buffer.js  taa.js  vrs.js  virtual_texturing.js
                lightmap.js  ddgi.js  restir.js  neural_material.js
                virtual_geometry.js  paired_render.js  frame_predict.js
                frame_interp.js  temporal.js  viewport3d.js
    sim/        ecs.js  ecs_archetype.js  physics.js  physics3d.js  cloth.js
                solver_ode.js  solver_linear.js  fluid.js  solver_pde.js
                ai.js  animation.js
    platform/   vfs.js  asset_pipeline.js  ddc.js  prefab.js  hot_reload.js
                cvar_console.js  scene.js  scene3d.js  hydrator.js  exporter.js
                runtime.js  scripting.js  network.js  audio.js  resource.js
    infer/      tensor.js  tfjs_backend.js  inference.js  neural.js
  src/editor/   index.html  styles.css  main.js  theme.js  registry.js
                inspector.js  hierarchy.js  viewport.js  camera_ctrl.js
                gizmo.js  selection.js  history.js  asset_browser.js
                console.js  ide_script_api.js  timeline.js  perf_hud.js
                command_palette.js  scene_tabs.js  import_wizard.js
                preview.js  project.js
  tools/        harness.js ✔  run_smoke.js
    smoke/      core_*.js  rhi_*.js  render_*.js  sim_*.js  plat_*.js
                gi_*.js  infer_*.js  editor_*.js
  games/        breakout/  space_shooter/  match3/  action3d/  index.js
  docs/         architecture.md  PORTING.md  INFERENCE.md
```

✔ = 已由主实现者写好，**不要修改**（如需改动，在文件末尾追加导出，不要改既有签名）。

## 4. 共享 API（必须按此使用）

### `src/engine/core/math.js`
```js
import { Vec2, Vec3, Vec4, Mat4, Quat, Color, AABB, Frustum, Rng,
         clamp, lerp, saturate, smoothstep, DEG2RAD, RAD2DEG, EPS } from '../core/math.js';
```
- **矩阵行主序** `m[row*4+col]`，列向量右乘 `v' = M·v`，平移在 `m[3]/m[7]/m[11]`。
  `A·B` = 先 B 后 A；`vp = proj.mul(view)`；`model = T·R·S`。
- `Mat4.perspective(fovy,aspect,zn,zf)`：NDC z∈[-1,1]，末行 `(0,0,-1,0)`。
- `Mat4.lookAt(eye,center,up)`：与 C++ `lookAtRH` 逐元素一致。
- `m.applyPoint(p)` / `m.applyDir(p)` / `m.applyClip(p) → {x,y,z,w}`。
- `Frustum.fromViewProj(vp)`（Gribb-Hartmann 按行提取）→ `.intersects(aabb)` / `.contains(aabb)`。
- `AABB.{min,max,center,extent,contains,overlaps,expand,union,transformed,rayHit}`。
- `Color` 分量 **0..1**；`toRGBA8()` → `[r,g,b,a]` 0..255；`toLinear()` / `toSRGB()`。
- `Rng(seed)`：`.next() .range(a,b) .int(n) .unitVec3()`。**禁止 `Math.random()`**。

### `src/engine/render/rhi.js`
```js
import { RenderAPI, Format, BufferUsage, TextureUsage, Topology, CullMode,
         IndexFormat, DeviceCaps, IRenderDevice, vertexLayout, packVertices,
         unpackVertices, layoutStride, createRenderDevice, detectBackends,
         writePPM } from './rhi.js';
```
- `IRenderDevice` 方法签名见文件内定义；后端实现**必须**实现：
  `init / createBuffer / writeBuffer / createTexture / createShader / createPipeline /
   createRenderTarget / beginFrame / beginPass / setPipeline / setVertexBuffer /
   setIndexBuffer / setConstants / bindTexture / draw / drawIndexed / endPass /
   endFrame / present / snapshot / destroy`。
  `drawIndirect / dispatch / bindStorage / readTexture` 为**可选**：不支持时抛
  `Error('unsupported')`，上层按 `caps.indirect / caps.compute` 降级。
- **着色器双写**：`createShader({ name, glsl:{vs,fs,cs}, js:{vs,fs,cs} })`。
  - `js.vs(attr, uni) → { pos:[x,y,z,w], vary:{ name: number|[..] } }`
  - `js.fs(vary, uni) → 单目标 [r,g,b,a]；MRT 时 [[r,g,b,a],…]`（顺序 = `pipeline.targets`）
  - 软件后端执行 `js.*`，GPU 后端执行 `glsl.*`。两者**必须产生一致结果**（容差 2/255，由 `render_pbr_parity_smoke` 断言）。
- `createRenderDevice(pref='auto', {canvas,width,height})` → WebGPU → WebGL2 → Software 自动下探。
- `snapshot()` → `Uint8Array` RGBA8（宽 `device.width`，高 `device.height`），**行序从上到下**。

### `src/engine/core/capability.js`
`CapLevel`（0..3）、`FEATURES` 表、`CapabilityDetector.detect()`、`renderConfigFor(cap)`。

### `src/engine/core/contracts.js`
`Contract / ContractResult / ContractHarness / IRHIContract / ICullingContract / compareBuffers(ref, got, tol)`。
每个后端设备都应能通过 `IRHIContract.run(dev)`。

### `tools/harness.js`
```js
export class T { ok eq near vnear exact throws note }
```
smoke 文件形状：
```js
export const name = 'rhi-software';           // 唯一名
export async function run(t) { /* 用 t.ok(...) 断言 */ }
```
`node tools/run_smoke.js` 自动发现 `tools/smoke/*.js` 并汇总。

## 5. 红线（沿用 C++ 版，违反即返工）

- **A. 不静默失败**：能力缺失要抛可读错误或显式降级并返回降级原因，禁止 catch 后返回空结果。
- **B. 不做半成品硬编码**：禁止为了 smoke 通过写死期望值；解析值必须有推导来源（注释写清公式）。
- **C. 不引入未声明依赖**。
- **D. CPU 参考先行**：GPU 路径必须有对应 CPU 参考实现 + parity smoke。
- **E. 可选层缺失即降级，不崩溃**（TF.js/WebGPU/Worker 全部可选）。
- **F. 编辑器 → 运行时单向**：编辑器数据模型不被运行时反向改写（运行时写回需经显式 `applyToScene`）。

## 6. 交付与验收

每个实现者交付后必须：
1. 对自己写的每个文件跑 `node --check <file>`（语法检查）。
2. 在 `tools/smoke/` 下写**至少一个** smoke（前缀见 §3），并 `node tools/run_smoke.js <前缀>` 全绿。
3. 禁止修改 §3 中标注 ✔ 的文件，以及**其它实现者归属的文件**。
4. 在模块内 `export` 干净、无副作用导入（`import` 不得触发设备创建/网络请求）。

## 7. 命名与风格

- 类名 PascalCase，函数/变量 camelCase，常量 UPPER_SNAKE。
- 文件内先 `import`，再常量，再类/函数，最后 `export`。
- 数值数组优先 `Float32Array`/`Uint8Array`，避免普通数组做大数据缓冲。
- 颜色/向量在热路径返回**新对象**（不可变风格），批量处理时可原地写但要写明。
