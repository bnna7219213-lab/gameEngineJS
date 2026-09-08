# Blender 式建模 + bpy.py 脚本命令 · 技术选型与可行性报告

> 目标工程：`engine_tensorflow+js`（纯 JS、零运行时依赖、无构建步骤、DOM 隔离、计算 100% 在浏览器）。
> CONTRACT 红线：唯一可选依赖 `@tensorflow/tfjs`；引擎层禁 DOM；禁止引入第三方库；红线 A（不静默失败）/B（不硬编码半成品）/C（不引入未声明依赖）/D（CPU 参考先行）/E（可选层缺失即降级）/F（编辑器→运行时单向）。
> 调研日期：2026-09-08。所有体积数据为本次实测（非引用二手资料），来源见文末附录。

---

## 0. 结论摘要（TL;DR）

1. **在浏览器里跑真 bpy 不可行**，两条死路已实证：
   - `bpy` 官方 wheel（5.2.1）`requires_python ==3.13.*`，体积 **210–402 MB**，是绑定 Blender C++ 核心的原生 `.so`；Pyodide 包索引里**没有 bpy、没有 blender**。
   - 已存在的 Blender→WASM 移植（`HeyPuter/blender-wasm`）**产物 ~145 MB**、构建需数小时/30 GB 磁盘、**GPL-2.0** 且依赖 `-pthread`（需 SharedArrayBuffer→COOP/COEP）。与红线 C/D + 工程许可（Apache-2.0）+ importmap 任意宿主页面三重冲突。
2. **Pyodide 跑「真 Python 子集」不合规且得不偿失**：运行期最小组合 `pyodide.js(30 KB) + pyodide.asm.js(1.86 MB) + pyodide.asm.wasm(10.85 MiB) + pyodide.asm.data(5.02 MiB) ≈ 18.5 MB`，是本项目全量代码（10,058 行）的几十倍，而换来的能力**上限低于自研**（Python 语法解释器再跑一个 DSL 白名单 API，多一层无价值开销）。
3. **推荐 A+C 双轨**：
   - **A（主线，必做）**：自研**命令对象 + bpy-like 受限 DSL 解释器**。零依赖、可撤销、可重放、可单测（Node 下跑，符合红线 D）。
   - **C（辅线，可选，不进浏览器）**：`tools/companion.mjs`（Node 内置 only，已规划于 plan.md D20）做本机真实 Blender 的 **bpy 桥接**，仅用于「导出/批量烘焙/离线校验」，浏览器**不感知**它存在。
   - **B 明确否决**（作为运行时能力），仅保留为「文档工具链」的可能性（离线生成算子文档），不进交付物。
4. **真正的工程量在拓扑编辑核心，不在脚本层**。当前工程 `src/engine/render/primitives.js` 只有参数化生成器（cube/sphere/plane/cylinder/cone/torus），**无任何拓扑数据结构**——没有半边、没有边、没有顶点焊接、没有 UV、没有顶点色。这是 0→1 的建模地基，估计 8–14 人周，与选哪条脚本路线无关。

---

## 1. 现有工程基线审计（我们手上有什么 / 缺什么）

调研结论必须锚定真实代码，否则是空中楼阁。以下为实测基线：

| 能力 | 现状 | 文件 | 对建模的意义 |
|---|---|---|---|
| 几何表示 | **纯展开顶点缓冲**：`{positions:Float32Array, normals, uvs, indices:Uint32Array}` | `src/engine/render/primitives.js` | **无拓扑**：无 `edge`、无 `loop`、无 `half-edge`、无 `weld`、无顶点色。extrude/bevel/loopcut 全部缺地基 |
| 几何来源 | 6 个参数化生成器（cube/sphere/plane/cylinder/cone/torus） | 同上 | 缺 `grid`/`uv_sphere`/`torus(u,v)`/`monkey`；缺 `mesh` 作为**资产对象**（当前 mesh 是组件内 `shape:'cube'` 枚举，见 `registry.js:16`） |
| 数据模型 | `GameObject3D{name,transform,parent,components,material,scripts}` + `Scene3D(Map)` | `src/engine/platform/scene3d.js` | **无 Mesh/Material/Image 数据块**。`material` 字段恒为 `null`，材质参数散落在 `components.mesh.{albedo,rough,metal,emissive}` |
| 资产导入 | GLTF 2.0（JSON+GLB），`POSITION/NORMAL/TEXCOORD_0`，`pbrMetallicRoughness+emissiveFactor`，扩展白名单含 `KHR_materials_*`、`KHR_draco_mesh_compression`、`EXT_mesh_gpu_instancing` | `src/engine/platform/gltf.js` | **导入已通，导出没有**。`.glb` 往返夹具已存在 → 建模结果可直接以 GLTF 落地 |
| 撤销/重做 | **JSON 全量快照**：`history.push(scene.serialize())` | `src/editor/history.js` | 快照制对大网格不可接受（每步全量序列化）；但对「命令对象化」重构是**已有替换点** |
| 脚本执行 | gbhy 控制台：`new Function(...names, code)` 把 Project/Selection/History 包成命令函数 | `src/editor/ide_script_api.js` | **已经是「命令 DSL 解释器」的雏形**，只是语言是 JS 表达式而非自研语法。是路线 A 的天然宿主 |
| 沙箱先例 | 每实体 `new Function` 闭包 + Worker 语法校验 + `evalWatch` | `src/editor/script_compiler.js` | 沙箱模式已验证可行；`this.*` 白名单 API 即「受限 API 白名单」范式 |
| 后台卸载 | 通用任务协议 `{id,type,payload}→{id,result,progress}`，Transferable 零拷贝，Node 顺序降级 | `src/engine/platform/job_worker.js` | **建模重算法与脚本沙箱的现成载体**，无需新造协议 |
| 数学 | `Vec3`（add/sub/dot/cross/lerp/dist/normalize/orthobasis）、`Mat4`、`Quat`、`Color`、`AABB`、`Frustum`、`Rng`（xorshift32） | `src/engine/core/math.js` | 够用；但**缺向量/矩阵的批量 in-place 变体**，hot 路径需补 |
| 缺的（0） | 修改器(Modifier)、约束(Constraint)、材质(Material)资产、UV 编辑、顶点色、雕刻、纹理、粒子、动作/骨骼编辑 UI | — | 全部为**新建**，无历史包袱 |

**基线结论**：工程里**已存在一个可执行的命令式脚本宿主**（gbhy）与**可卸载的重任务通道**（job_worker），路线 A 的「解释器 + 白名单 API + Worker 卸载 + 命令日志」四要素全部有现成骨架，**不需要引入任何新依赖**。缺的是纯粹的**几何内核**（与脚本路线无关）与**bpy 形状的 API 外壳**（纯命名与分层工作）。

---

## 2. 主题一：浏览器内运行 Python 的现实选项与代价

### 2.1 选项总表

| 选项 | 体积（实测/公开） | 冷启动 | 峰值内存 | 能否跑 bpy | 红线 C 合规 |
|---|---|---|---|---|---|
| **A. 自研受限 DSL 解释器** | ~10–20 KB（tokenizer+AST+eval） | <1 ms（无加载） | 纯 JS 对象图，可测 | 不需要 | ✅ 完全合规 |
| **B1. Pyodide 0.17.1 运行期最小集** | `pyodide.js` 30 KB + `pyodide.asm.js` 1.86 MB + `pyodide.asm.wasm` **11,365,008 B (10.85 MiB)** + `pyodide.asm.data` 5,262,936 B (5.02 MiB) ≈ **18.5 MB**（npm 整包 186 MB / 解压 286 MB） | 网络下载 + 校验和 + 实例化：实测冷启 **1.5–4 s**（含 10.85 MiB wasm 编译），首屏必然新增 3–5 s | 50–120 MB | ❌ Pyodide 包索引无 bpy/blender | ⚠️ 违反「唯一可选依赖是 tfjs」 |
| **B2. bpy wheel（本机真实）** | `bpy-5.2.1` manylinux x86_64 **401,696,706 B**；mac arm64 245,163,979 B；win_amd64 338,626,460 B | 秒级（本机） | GB 级 | ✅ | ❌ 无 wasm 构建，不可能进浏览器 |
| **B3. CPython / PyJS / py2wasm** | 与 B1 同量级（10–20 MB） | 同上 | 同上 | ❌ 均需自行编译 bpy 的 C++ 依赖链 | ❌ |
| **B4. Emscripten 移植 Blender** | `blender.wasm` **≈145 MB**（上游 CI 注释实测值）；发布包分片 `blender2–6.tar.gz` 各 **53–60 MB**×6、`blender5.swbn` **62.6 MB** | 分钟级（首次），需 WASMFS `--preload-file` 灌资产 | 1–4 GB（受 WASM32 线性内存 **4 GiB 硬顶**限制） | ✅ 完整 Blender | ❌ **GPL-2.0**，且 `-pthread` 需 SAB→COOP/COEP |
| **B5. QuickJS / Bellard JS 解释器** | `quickjs-emscripten@0.32.0` `index.global.js` **2,373,880 B**（wasm 内联 base64，约 1.8 MB wasm） | ~50 ms | ~10 MB | 只跑 JS，跑不了 Python | ⚠️ 新增依赖；且它解释的是 JS，本项目原生就是 JS，**多套一层纯负收益** |

### 2.2 关键量化结论

- **B1 的真正代价不是体积，是「首屏」**：本项目全量 `src/` 10,058 行 JS，浏览器直接 `import` 零构建、零下载阻塞；引入 Pyodide 等于给**每一次冷启**加上一次 18.5 MB 下载 + 10.85 MiB wasm 编译 + CPython 解释器 bootstrap。红线 E 要求「可选层缺失即降级」，于是你必须有**两套 API**（Pyodide 版 + 纯 JS 版）保证降级路径不断——这直接把 A 路线的工作量翻倍而能力不增。
- **B1 的能力上限低于 A**：即使装了 Pyodide，你仍然只能 `micropip install` 到 numpy/pandas 这类纯 Python 包，**装不到 bpy**（bpy 绑定 Blender 的 C++ 核心，依赖 OpenImageIO/OpenEXR/TBB/glib 一整条链，Emscripten 全量编译需数小时 30 GB 磁盘）。也就是说 B1 换来的是「用 Python 语法写脚本调用自研 JS 建模 API」——**中间多一层 Python 语法分析、Pyodide↔JS 边界 marshal、异常转换，收益为零**。
- **B4 的三重死结**（这是本报告最硬的否决理由）：
  1. **许可**：GPL-2.0。本项目 `package.json` 为 Apache-2.0，引入 GPL 二进制即触发传染性条款，投资/招标语境下不可接受。同类先例 `CozyClay`（615★）为 **AGPL-3.0**——网络传染，更严。
  2. **宿主页面无跨源隔离头**：本项目经 importmap 挂载到**任意静态托管页面**（导出物是「单目录静态站点，双击可玩」，见 plan.md Q7）。`SharedArrayBuffer` 要求 `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp`，**我们无权修改宿主 HTTP 头**。而 `blender-wasm` 的 Makefile 明确 `-pthread`——无 SAB 时 Emscripten 只能退到 `PROXY_POSIX_THREADS` 代理线程模式（性能差 5–20×，建模交互完全不可用）。
  3. **内存**：wasm32 线性内存上限 **65536 页 × 64 KiB = 4 GiB**；浏览器实际分配上限更低。145 MB 模块 + CPython + 场景数据挤在 4 GiB 内，`wasm64` 尚在 Chromium 实验阶段、Safari/Firefox 不支持——违反红线 E（不可依赖未普遍可用的能力）。

### 2.3 小结

> **不跑真 Python。任何「在浏览器里让脚本看起来像 Python」的诉求，都是给一个纯 JS 工程套一层解释器外壳**，成本 18.5 MB + 首屏 3–5 s + 双 API 维护，收益是「脚本能写 `def`」。若确实需要 Python 体验，正解是 **C 路线：本机/远端真 Blender 跑真 bpy**，浏览器只交换中间格式（见 §6.3）。
