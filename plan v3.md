# plan v3.md — Blender 式建模模块集成路线图（纯 JS 脚本后台 · 零依赖红线 · 2026-09-08 修订版）

> **修订背景**：v1（取代 three.js）已落地、v2 进行中（Q1 物理 ✅ + Q5 Worker 协议 ✅）。
> v3 在前两版之上新增**第二大能力轴：内容生产**——在浏览器编辑器内集成对标 Blender 的
> 建模工作流：任意手工拓扑建模、场景/视图/渲染/工具/输出/世界环境/物体/粒子/物理属性/
> 材质选项卡、修改器与约束绑定，以及一套**纯 JS 脚本命令后台**（对标 Blender bpy 的
> 「脚本驱动建模」能力，但命令全部为 JS 函数调用，不引入任何 Python）。
>
> **基线核实（2026-09-08）**：`node tools/run_smoke.js` = **PASS=50 FAIL=0 ASSERTIONS=1596**。
> src 共 10058 行。v1+v2 全部 smoke 在 v3 全程**不得回退**（红线 B）。
>
> **不变约束**：CONTRACT.md 全部红线（零运行时依赖、无构建步骤、ES2022、DOM 隔离、
> 行主序矩阵、确定性 Rng、CPU 黄金参考永不下线、可选层缺失即降级、编辑器→运行时单向）。
> 建模内核与脚本后台 100% 在浏览器，**纯 JS 实现**，禁止引入 three.js/babylon/Pyodide
> 或任何第三方库。
>
> **本次修订（v3.1）**：根据 2026-09-08 深度代码审计，修正 10 项硬伤（见 §0.1），
> 新增 M-A0 前置修复阶段，调整 M-A~M-F 任务边界与验收断言，新增「确定性哈希」与
> 「脏区域」两大关键抽象。

---

## 0. 审计结论（v3 需求 → 现状映射，2026-09-08 实测）

| # | v3 需求 | 现状证据（真实文件） | 缺口级别 |
|---|---|---|---|
| M0 | 拓扑可编辑网格 | `GameObject3D.components.mesh.customGeo={positions,normals,indices}` 可直改，但 viewport.syncScene **每帧全量重建**，无脏标记、无拓扑结构（纯三角索引） | 结构重建 |
| M1 | 任意手工拓扑 | `primitives.js` 仅 6 种参数化图元；Mesh={positions,normals,uvs,indices} 无 half-edge/邻接 | 全新 |
| M2 | JS 脚本后台 | 有 `ide_script_api.js`（gbhy REPL，`new Function` 注入 api 键）与 `script_compiler.js`；**无建模命令 API、无命令对象层、无 undo 合并** | 扩展 |
| M3 | 场景/物体 | `Scene3D{objects:Map}`、`GameObject3D{id,name,transform,parent,components,material,scripts,children}` ✅ 骨架可用 | 扩展 |
| M4 | 视图/工具 | 视口 orbit/pan/zoom/双击聚焦 ✅；gizmo **仅平移**（gizmo.js 85 行，且 line 60 有已知 bug），无旋转/缩放、无顶点/边/面拾取 | 扩展 |
| M5 | 渲染 | WebGL2 RHI + PBR + 阴影 + IBL + 后处理 ✅ 已达标；但 viewport3d.js `_renderLit` **每帧重建 shader/pipeline/vb**（性能天花板） | 复用 + 优化 |
| M6 | 输出 | `exporter.js` 仅 JSON + 内嵌 HTML；无网格/场景文件导出（OBJ/glTF 写出） | 扩展 |
| M7 | 世界环境 | Viewport3D 内部有 ambient/fog/ibl + setter，但**无 World 对象、无 UI、无序列化** | 全新 |
| M8 | 粒子 | `particles.js` SoA + emitter{rate,burst,lifetime,velocity,size,color,...} ✅ 基础可用；无力场/形状/朝向曲线 | 扩展 |
| M9 | 物理属性 | `world3d.js` GJK+EPA+sequential impulse ✅；`collider3d` 组件仅 shape/size 占位未消费；无关节 UI | 扩展 |
| M10 | 材质选项卡 | **无 Material 类**——材质=per-mesh 字段{albedo,rough,metal,emissive}；gltf 解析出 normalMap 但渲染不消费 | 结构重建 |
| M11 | 修改器/约束 | 无 Modifier/Constraint 概念 | 全新 |
| M12 | 属性选项卡框架 | `registry.js` 注册表驱动检视器 ✅ 机制就绪；FIELD_TYPES 仅 7 种（float/int/vec3/color/text/bool/select），无 tabs/meshRef/materialRef/enum 多列 | 扩展 |
| M13 | 撤销/重做 | `history.js` **整场景 JSON 快照**（limit 100）——拖动顶点每帧快照将爆炸内存 | 结构改造 |
| M14 | 模式状态机 | 编辑器**无任何 mode 概念**；快捷键全靠 gizmo.js 内部硬编码，无「编辑模式/物体模式」状态机 | 全新 |

### 0.1 深度审计发现的 10 项硬伤（v3 必须先修）

| # | 硬伤 | 证据 | 影响 | 修复阶段 |
|---|---|---|---|---|
| H1 | **反序列化 id 分裂** | scene3d.js:38 `new GameObject3D(o.name, o.transform)` 走 `nextId3d()` 生成新 id，但 `objects.set(+idStr, obj)` 用旧 id 做 key | 命令层/HMesh/Modifier 若用 id 引用，undo 后全断 | M-A0 |
| H2 | **children 双向腐化** | `remove(id)` 不清理父对象 `children[]`；deserialize 从 parent 重建 children | 拓扑编辑删除面/边后，父子引用残留野指针 | M-A0 |
| H3 | **History 快照爆炸** | `history.js` 每 push 全场景 JSON.stringify | 顶点拖拽每帧快照 = 内存爆炸 | M-A（命令栈替代） |
| H4 | **无脏区域契约** | viewport.syncScene 全量清空+重建 | 编辑模式 60fps 不可达 | M-A（新增脏标记） |
| H5 | **gizmo.js:60 已知 bug** | `dpx` 计算含死代码 `(my - this._grab.oy - (this._grab.my - this._grab.oy)) * 0`，y 分量被错误清零 | rotate/scale 会继承错误 | M-B |
| H6 | **无模式状态机** | 编辑器无 mode 概念，快捷键硬编码在 gizmo.js | 建模快捷键与现有冲突 | M-B |
| H7 | **无确定性哈希工具** | 无 sceneHash/meshHash | 「脚本与 GUI 一致性」无法断言 | M-A0 |
| H8 | **viewport 每帧重建资源** | viewport3d.js `_renderLit` 每帧 createShader/createPipeline/createBuffer | subdivide 10k 顶点网格性能崩溃 | M-B |
| H9 | **undoGroup 异常不闭合** | 未定义 bus 分组异常处理 | 脚本 throw 后组不闭合，后续命令错并 | M-A |
| H10 | **smoke 命名分层** | 现有惯例 `<layer>_<feature>_smoke.js`（editor_smoke/sim_physics3d_smoke） | 新 smoke 若另起 modeling_* 前缀，与现有过滤逻辑不完全兼容 | 全部 |

**结论**：渲染/物理/粒子底层已具备；v3 的核心是**新建三大件**——
(A) 可编辑拓扑内核（half-edge + 算子 + 派生渲染缓存），(B) 纯 JS 建模命令 API（复用
gbhy 脚本机制 + 命令对象 + 命令总线 + 统一 undo），(C) 属性面板框架（tabs + Material/World/Modifier
数据块）。**在此之前必须先修 H1/H2/H7（M-A0 阶段）**，否则命令层无法稳定引用对象。
所有功能必须同时被「GUI 交互」与「脚本命令」驱动，共用同一**命令总线**（对标 Blender
中 UI 按钮与 `bpy.ops` 同源的设计）。

---

## 1. 技术选型（已裁决）

### 1.1 脚本后台：纯 JS 命令 API（复用 gbhy 机制，零解释器）

脚本后台**不引入 Python、不写解释器**，直接复用现有 `ide_script_api.js` 的成熟机制
（`createApi()` 返回 JS 对象 + `runScript()` 用 `new Function` 注入白名单键），新增一个
建模命令 API 对象。对标 Blender bpy 的「data/ops/context」三层，但全部是 JS camelCase
函数：

| Blender bpy 概念 | 本方案 JS 等价 | 说明 |
|---|---|---|
| `bpy.data`（数据块容器） | `data` 对象 | data.meshes / data.materials / data.worlds / data.collections |
| `bpy.context`（活动对象/选择集） | `ctx` 对象 | ctx.activeObject / ctx.selectedObjects / ctx.mode / ctx.selectMode |
| `bpy.ops`（算子） | `ops` 对象 | ops.object.modeSet / ops.mesh.extrudeRegion / ops.transform.translate |
| `bpy.types`（ID 类型） | 引擎既有类 | GameObject3D / Material / World / HMesh |
| undo buffer + id_undo_group | 命令总线 + undoGroup | 见 D25/D30/D34 |

**关键优势**：脚本就是 JS，无需 tokenizer/parser/AST（那条 Python 子集解释器路线被废弃）；
脚本内可用 `for`/`if`/数组/解构等 ES2022 全能力，范围外语法天然由 JS 引擎报错（红线 A 直接满足）。

### 1.2 关键架构决策（v3 增量，沿用 D 编号接 v2 的 D16–D23）

| # | 决策 | 理由 |
|---|---|---|
| D24 | **拓扑内核用 half-edge，渲染层派生 SoA 三角缓存**：编辑层每个有向边记 {vertex,next,prev,twin,face}；渲染层 Float32Array positions/normals/uvs + Uint32Array indices，拓扑变更时增量重建，纯位置变更只改 positions 缓冲 | 三角索引无法 O(1) 邻接查询；half-edge 是 inset/bevel/loopcut/knife 的工业标准 |
| D25 | **一切编辑 = 命令对象（Command Pattern）+ 命令总线**：`Command{op,target,params,do(),undo(),toJSON()}`；GUI 按钮与脚本算子都向 `CommandBus` 提交命令，总线负责执行、压入 History、标记脏区域、触发视口增量更新 | 对齐 bpy.ops「算子+undo buffer」模型；GUI 与脚本结果天然一致；红线 B |
| D26 | **建模脚本 API = `data`/`ctx`/`ops` 三命名空间 + 命令总线绑定**：`ops.mesh.*` 每个函数构造一个 Command 提交总线；脚本内 `undoGroup(fn)` 把循环展开的 N 个命令合并为单步 | 复用 gbhy `runScript`，零解释器；对齐 bpy.ops 语义 |
| D27 | **Modifier 惰性求值栈 + Apply**：`obj.modifiers=[{type,params,enabled}]`，渲染/拾取用「基础网格经栈求值后的派生网格」，Apply 把求值结果写回基础网格（命令化） | 对标 Blender Modifier 栈；非破坏性编辑 |
| D28 | **Material 抽出为独立数据块**：`project.materials: Map<id,Material>`，对象持 materialId 引用；序列化顶级资产表 materials[]/textures[] 去重 | 对齐 data.materials；消除 per-mesh 内联 |
| D29 | **World 为场景级数据块**：`Scene3D.world={ambient,fog,sky,ibl,sunDir}`，序列化入 project，hydrate/syncScene 下发 Viewport3D | 补齐 M7；向后兼容（缺失=默认世界） |
| D30 | **history.js 升级为命令栈**：保留场景快照作「结构性变更」兜底；新增命令级 undo（`History.pushCommand(cmd)`），连续位置拖拽合并为单步（undoGroup） | 整场景快照每帧拖动会 OOM |
| D31 | **物理/粒子/约束选项卡全部注册表驱动**：扩展 FIELD_TYPES（tabs/enum/vec2/colorRamp/curve/meshRef/materialRef/textureRef），检视器按 tab 分组渲染 | 复用现有机制，零新 UI 框架 |
| D32 | **脚本执行沙箱 = 同步命令提交 + 可选 Worker**：建模算子主线程同步（编辑需即时反馈）；重计算（细分/布尔/烘焙）经 job_worker.js 卸载（Q5 协议已就绪）；脚本 API 不暴露 DOM | 红线 DOM 隔离；大网格不冻 UI |
| D33 | **坐标系/单位**：引擎维持右手系 Y-up 米制；导出层（OBJ/glTF）负责 Y-up/m ↔ Z-up/cm 显式变换（仅文件 IO，不涉运行时） | 与主流 DCC 工具互操作 |
| D34 | **undoGroup 异常兜底**：`bus.beginGroup/endGroup` 用 try/finally 保证闭合；提供 `bus.currentGroup` 查询；脚本 throw 时自动回滚未闭合组 | 防止组错配（H9） |
| D35 | **确定性哈希**：新增 `core/hash.js`，提供 `sceneHash(scene)` / `meshHash(hmesh)` / `commandHash(cmd)`，基于确定性序列化（固定 key 序）+ fnv1a | 「脚本与 GUI 一致性」「do/undo 往返」必须可断言（H7） |
| D36 | **脏区域契约**：命令总线维护 `dirtySet: Set<objId>` 与 `dirtyFlags: {geometry, material, transform}`；viewport.syncScene 改为「仅重建 dirtySet 中对象」，其余复用缓存 | 编辑模式 60fps 前提（H4） |
| D37 | **模式状态机**：新增 `editor/mode.js`，`EditorMode = { OBJECT, EDIT_VERT, EDIT_EDGE, EDIT_FACE }`；快捷键按 mode 路由；DOM 层监听 keydown 按 mode 分发 | 建模快捷键与现有 gizmo/控制台隔离（H6） |
| D38 | **smoke 命名统一**：v3 新增 smoke 一律用 `plat_modeling_*` / `editor_modeling_*` 前缀，保持 `<layer>_<feature>_smoke.js` 分层惯例 | 与 run_smoke.js 前缀过滤兼容（H10） |

### 1.3 建模脚本 API 命名空间（纯 JS，对标 Blender 4.x 算子语义）

```js
// 数据块（data）：纯数据，无上下文依赖，可脚本化构造
data.meshes.new(name)                 // -> MeshData(id,name)
data.materials.new(name)              // -> Material(id,name)
data.worlds.new(name)                 // -> World(id,name)

// 上下文（ctx）：编辑器内为真
ctx.activeObject                     // GameObject3D | null
ctx.selectedObjects                  // GameObject3D[]
ctx.mode                             // 'OBJECT' | 'EDIT_VERT' | 'EDIT_EDGE' | 'EDIT_FACE'
ctx.selectMode                       // 'VERT' | 'EDGE' | 'FACE'

// 算子（ops）：动词，走命令总线，可撤销
ops.object.modeSet('EDIT_VERT')      // 进出编辑模式
ops.mesh.selectMode('VERT')          // 顶点/边/面选择模式
ops.mesh.selectAll('SELECT'|'DESELECT')
ops.mesh.selectLinked()
ops.transform.translate({value:[x,y,z]})
ops.transform.rotate({value:[x,y,z]})
ops.transform.scale({value:[x,y,z]})
ops.mesh.extrudeRegion({translate:true})
ops.mesh.extrudeManifold()
ops.mesh.loopCut({cuts:1})
ops.mesh.inset({thickness:0.1})
ops.mesh.insetIndividual({thickness:0.1})
ops.mesh.bevel({width:0.1, segments:1})
ops.mesh.merge({type:'VERT'|'CENTER', threshold:0.0001})
ops.mesh.subdivide({cuts:1})
ops.mesh.delete({type:'VERT'|'EDGE'|'FACE'})
ops.mesh.dissolveFaces() / dissolveEdges() / dissolveVerts()
ops.mesh.normalsMakeConsistent()
ops.mesh.bridgeEdgeLoops()
ops.mesh.quadsConvertToTris()
ops.mesh.separate({type:'SELECTED'|'LOOSE'|'BY_MATERIAL'})
ops.mesh.symmetrize({axis:'X'|'Y'|'Z'})
ops.modifier.add({type:'MIRROR'|'SUBSURF'|...})
ops.modifier.apply('MIRROR')
ops.modifier.remove(index)

// 脚本结构：undoGroup 合并多命令为单步撤销
undoGroup(() => {
  for (let i = 0; i < 10; i++) {
    ops.mesh.extrudeRegion({ translate: true });
    ops.transform.translate({ value: [0, 1, 0] });
  }
});   // 整段程序化建塔 = 一步撤销
```

完整算子清单见 §3 M-B/M-C 验收表；命名采用「Blender 算子名 camelCase 化」，脚本可读性对标
Blender 用户心智，但语义是纯 JS。

### 1.4 属性选项卡（对标 Blender Properties 编辑器）

| 选项卡 | 数据归属 | 内容 |
|---|---|---|
| 工具 Tool | 编辑器状态 | 当前工具/gizmo 模式/吸附设置 |
| 渲染 Render | project.render | 后端选择、分辨率、采样、后处理开关 |
| 输出 Output | project.output | 导出格式（JSON/OBJ/glTF）、路径、帧范围 |
| 视图层 ViewLayer | scene.viewLayers | 集合可见性/禁用 |
| 场景 Scene | scene | 重力、单位、活动相机 |
| 世界 World | scene.world (D29) | ambient/fog/sky/ibl/sunDir |
| 物体 Object | obj.transform + 关系 | 变换、父级、集合归属、可见性 |
| 修改器 Modifier | obj.modifiers (D27) | 修改器栈增删/排序/参数/Apply |
| 粒子 Particle | obj.components.particle | 发射器参数全集（M8 扩展现有） |
| 物理 Physics | obj.components.rigidbody/collider | 质量/摩擦/恢复/形状/关节/碰撞组 |
| 约束 Constraint | obj.constraints | CopyTransforms/TrackTo/Limit* 等 |
| 材质 Material | project.materials (D28) | 着色参数 + 贴图槽 + 预览球 |
| 数据 Mesh Data | obj mesh 数据块 | 顶点组/UV 层/顶点色/法线/形状键 |

---

## 2. 数据模型设计

### 2.1 可编辑网格（`src/engine/modeling/hedit.js`，零 DOM）

```js
class HMesh {                      // half-edge 编辑内核
  verts: Float32Array  // xyz 打包；liveCount
  edges: [{v0,v1, twin, next, prev, face}]
  faces: [{edge, materialIndex}]   // 支持 n-gon（loop>=3）
  addVert/addFace/splitEdge/mergeVerts/delete/...
  toRenderMesh(): {positions,normals,uvs,indices}  // n-gon 扇形三角化+法线重算
  static fromRenderMesh(mesh)      // 由三角索引重建（weld 同位点）
}
```

### 2.2 修改器栈（`src/engine/modeling/modifier.js`）

`applyStack(hmesh, modifiers) -> HMesh`（纯函数，可进 Worker）。首批：
SubdivisionSurface(简单细分→Catmull-Clark)、Mirror、Array、Solidify、Bevel、
Decimate、Weld(merge by distance)、Triangulate。Boolean 列为 P3（CSG 自研，坑多）。

### 2.3 命令层 + 命令总线（`src/editor/modeling/commands.js`）

```js
class Command { do(ctx); undo(ctx); toJSON(); getDirty(); }
class CommandBus {
  submit(cmd);              // 执行 + pushCommand + 标记 dirtySet
  beginGroup(label); endGroup();   // 组 = 单步撤销；try/finally 兜底（D34）
  currentGroup;             // 查询当前组（调试用）
  dirtySet: Set<objId>;     // D36：本次提交影响的对象
  consumeDirty(): {ids, flags};  // viewport 调用后清空
}
// 位置类：MoveVerts{ids,from[],to[]}（属性回滚，可无限步）
// 拓扑类：ExtrudeCmd{新元素id区间→undo=删除}；MergeCmd 必须记录合并前每顶点坐标与拓扑
//        （否则 un-merge 无法复原，这是此类撤销失败头号原因）
// 兜底：SnapshotCmd（knife/relax 等逆不显然算子）
// 脚本 API（ops.*）与 GUI 按钮均向 CommandBus 提交命令；History 订阅总线。
```

### 2.4 建模脚本 API（`src/editor/modeling/api.js`）

`createModelingApi(project, selection, bus, history) -> { data, ctx, ops, undoGroup }`，
复用 `ide_script_api.runScript` 的 `new Function` 注入机制，把四个键作为局部变量注入
控制台脚本。每个 `ops.*` 函数构造对应 Command 提交总线；`undoGroup(fn)` 用
`bus.beginGroup/endGroup`（try/finally 包裹）执行 fn。

### 2.5 确定性哈希（`src/engine/core/hash.js`）

```js
export function fnv1a(str)                    // 32 位 FNV-1a
export function stableStringify(obj)           // 固定 key 序的 JSON.stringify
export function sceneHash(scene)               // stableStringify + fnv1a
export function meshHash(hmesh)                // 顶点/边/面数组 + fnv1a
export function commandHash(cmd)               // cmd.toJSON() + fnv1a
```

用于「do/undo 往返一致」「脚本与 GUI 结果一致」「导出往返一致」等关键断言。

---

## 3. 里程碑（v3）

### M-A0 — 前置修复（~300 行，**必须先于一切**）

| 任务 | 验收 |
|---|---|
| 修 H1：GameObject3D 构造函数接受可选 id 参数，deserialize 用原 id 恢复 | `plat_scene_id_smoke.js`：serialize→deserialize 后对象内存 id 与序列化 id 一致 |
| 修 H2：Scene3D.remove 同步清理父对象 children[]；增加 removeRecursive | `plat_scene_children_smoke.js`：remove 后父对象 children 无残留 |
| 修 H7：core/hash.js（fnv1a + stableStringify + sceneHash/meshHash） | `core_hash_smoke.js`：同一场景两次哈希一致；改一顶点哈希必变 |
| 修 H10 准备：确立 `plat_modeling_*` / `editor_modeling_*` 命名规范 | 文档化进 CONTRACT.md §3 注释 |

**出口**：50+3 smoke 全绿；id 引用稳定，children 无腐化，哈希工具就绪。

### M-A — 拓扑内核 + 命令总线 + 属性面板框架（根基，~1800 行）

| 任务 | 验收 |
|---|---|
| hedit.js：HMesh + addVert/addFace/splitEdge/delete/toRenderMesh/fromRenderMesh | `plat_modeling_hedit_smoke.js`：cube 往返（fromRenderMesh→toRenderMesh 顶点/面一致）、splitEdge 邻接正确 |
| commands.js：Command 基类 + MoveVerts/AddFace/Delete + CommandBus（含 dirtySet/D36、undoGroup try/finally/D34） | `plat_modeling_undo_smoke.js`：do/undo×N 网格 meshHash 往返一致；beginGroup/endGroup 单步回滚；异常时组自动闭合 |
| history.js 升级：命令栈 + 场景快照双轨（D30） | 现有 editor_smoke 不回退 + 新断言 |
| registry.js：FIELD_TYPES 扩展 + tabs 分组 + meshRef/materialRef | `editor_tabs_smoke.js` |
| Material 数据块 + World 数据块（D28/D29）+ 序列化 | `plat_material_smoke.js`：材质去重/引用/往返；world 序列化→viewport 下发 |
| 模式状态机 mode.js（D37） | `editor_mode_smoke.js`：模式切换、快捷键按 mode 路由 |

**出口**：50+9 smoke 全绿；顶点可在数据层移动并撤销；脏区域机制就绪。

### M-B — 建模交互视口（手工拓扑核心，~2200 行）

| 任务 | 验收 |
|---|---|
| 修 H5：gizmo.js line 60 dpx 计算 bug | `editor_gizmo_smoke.js`：y 轴拖动位移正确 |
| 修 H8：viewport3d.js `_renderLit` 资源缓存化（shader/pipeline/vb 按 mesh 缓存，脏才重建） | `render_viewport_cache_smoke.js`：静态场景连续渲染 10 帧，buffer 创建计数=0 |
| 编辑模式/物体模式切换 + 顶点/边/面选择（射线拾取 + overlay 高亮线框） | `plat_modeling_pick_smoke.js`：CPU 射线拾取命中断言 |
| gizmo.js：补齐 rotate/scale（activeMode translate/rotate/scale） | `editor_gizmo_smoke.js` 扩展 |
| 视口 dirty 追踪：接入 CommandBus.consumeDirty（D36），仅重建脏对象 | `editor_viewport_dirty_smoke.js`：改一对象后重建计数=1 |
| P0 算子 GUI 化：extrude/loopcut/merge/delete/selectAll（走命令总线） | `plat_modeling_ops_smoke.js`：每算子 do/undo meshHash 断言 |
| 挤出交互：拖面生成新几何 | 浏览器手动验收 + 数据层断言 |

**出口**：50+16 smoke 全绿；浏览器内可徒手挤出/环切/合并出一个非平凡网格并全程撤销；
静态场景重建计数=0，编辑模式视口 60fps。

### M-C — 建模脚本 JS API（差异化卖点，~800 行）

| 任务 | 验收 |
|---|---|
| api.js：createModelingApi 返回 data/ctx/ops/undoGroup；§1.3 全量算子映射命令层 | `editor_modeling_api_smoke.js`：每个 ops.* 与 GUI 走同一命令，meshHash 一致 |
| 脚本控制台集成：gbhy 注入 data/ctx/ops；脚本内循环 undoGroup 合并 | 10 行脚本建塔→单步撤销整体回滚 |
| 错误报告：行号+可读信息（红线 A），非法算子/参数抛错 | 断言非法调用抛错含算子名 |
| data 层直构：data.meshes.new / data.materials.new 无上下文依赖可脚本化 | `plat_modeling_data_smoke.js` |

**出口**：50+20 smoke 全绿；一段 JS 脚本（`for` 循环 + `ops.mesh.extrudeRegion`）可直接
粘贴运行生成程序化模型，与 GUI 建模共享同一命令栈，meshHash 一致。

### M-D — 修改器与约束（~1000 行）

| 任务 | 验收 |
|---|---|
| modifier.js：纯函数栈求值（Subdiv/Mirror/Array/Solidify/Bevel/Weld/Triangulate） | `plat_modeling_modifier_smoke.js`：各修改器几何断言 + 栈顺序敏感性 |
| Apply 命令化 + 非破坏编辑（开关/排序/参数） | 检视器手动验收 + 命令断言 |
| 约束：CopyTransforms/TrackTo/Limit{Location,Rotation,Scale} | `sim_constraint_smoke.js`：约束后 transform 断言 |

### M-E — 物理/粒子/材质选项卡吃全（~900 行）

| 任务 | 验收 |
|---|---|
| rigidbody 组件消费 world3d.js（质量/摩擦/恢复/形状/休眠）+ 选项卡 | `editor_physics_smoke.js`：设参→step→结果断言 |
| 粒子扩展：发射器形状(sphere/cone/box)/力场/生命周期曲线（colorRamp/curve 字段类型） | `sim_particles_smoke.js` 扩展不回退 |
| 材质选项卡：normalMap 真进渲染（pbr.js 消费 tangent/normalMap）+ 预览球 | `render_normalmap_parity.js`（GPU/CPU 2/255） |
| World UI：天空渐变/雾/IBL 强度编辑即时生效 | 手动验收 |

### M-F — 输出（终局，~500 行）

| 任务 | 验收 |
|---|---|
| OBJ 写出 + glTF 写出（mesh+material+scene） | `plat_export_mesh_smoke.js`：写出→读回 顶点数/meshHash 一致 |
| 单位/坐标变换层（D33）：Y-up/m ↔ Z-up/cm（仅导出层） | 导出→外部工具读入方向/尺度断言 |

**出口**：模型可导出 OBJ/glTF，与主流 DCC（含 Blender）互操作。

---

## 4. 阶段依赖与并行

```
M-A0 前置修复（H1/H2/H7/H10）─┬─ M-A 内核/命令总线/面板框架 ─┬─ M-B 交互视口 ─┬─ M-D 修改器
                              │                            └─ M-C 脚本 API ──┘        │
                              └─ M-E 选项卡（依赖 M-A 的 registry/材质/World）──────────┼─ M-F 输出

M-A0 必须先于一切（id/children/哈希是命令层根基）；
M-C 与 M-B 共用命令总线（M-A 先行），文件零重叠可并行；M-E 与 M-D 可并行。
```

每阶段出口保持「全量 smoke 绿 + parity 绿」；新增 smoke 一律 Node headless 优先
（建模内核/命令/脚本 API 全零 DOM，天然可测），浏览器 parity 页仅覆盖 GPU 断言。

## 5. 规模估计

| 阶段 | 规模（估） | 关键交付 |
|---|---|---|
| M-A0 | ~300 行 | id/children/哈希修复 + 命名规范 |
| M-A | ~1800 行 | half-edge 内核 + 命令总线 + 面板框架 + Material/World + 模式状态机 |
| M-B | ~2200 行 | 编辑模式交互 + P0 算子 + gizmo 补全 + 视口缓存化 |
| M-C | ~800 行 | 建模脚本 JS API（data/ctx/ops/undoGroup） |
| M-D | ~1000 行 | 修改器栈 + 约束 |
| M-E | ~900 行 | 物理/粒子/材质选项卡 + normalMap |
| M-F | ~500 行 | OBJ/glTF 导出 + 坐标变换 |

合计约 +7500 行核心代码 + smoke/夹具；7 个独立可验收阶段（含 M-A0）。
基线 50 smoke / 1596 断言全程不得回退。

## 6. 风险与不可行点

1. **大网格内存**：单标签堆 2–4GB 上限；Worker 内 SharedArrayBuffer 需 COOP/COEP 头
   （静态托管不可控）→ 重计算默认 Transferable 拷贝，不依赖共享内存。
2. **merge/dissolve 撤销**：必须记录合并前逐顶点坐标与拓扑，否则 un-merge 不可复原。
3. **序列化往返损失**：glTF/OBJ 丢失 crease/bevel weight/自定义法线 → 自定义 JSON 边车。
4. **Boolean 修改器**（流形 CSG）自研复杂度高 → 列 P3，不阻塞主线。
5. **快捷键冲突**：建模快捷键（E 挤出/G 抓取/Ctrl+Z）与编辑器全局快捷键需显式路由
   （DOM 层按 `ctx.mode` 分发，引擎层不受影响；M-A 模式状态机是前提）。
6. **命令总线与脚本一致性的边界**：脚本内异步（setTimeout/Promise）不保证顺序，建模
   命令一律同步提交；异步重计算走 Worker 回调后再次同步提交结果命令。
7. **undoGroup 嵌套**：脚本 `undoGroup` 内再调 `ops.*`（内部又可能分组）需显式栈计数 +
   try/finally 闭合（D34），避免组错配。
8. **gizmo 扩展与现有平移共用拾取**：rotate/scale 需在 gizmo.js 内按 activeMode 切换命中
   区域与拖动映射，保持平移行为不回退；同时必须先修 line 60 已知 bug（H5）。
9. **视口缓存化的正确性**：资源缓存（H8）若脏标记遗漏，会出现「改了数据但画面不更新」；
   必须保证 CommandBus.dirtySet 覆盖所有变更路径，并有「强制全量重建」调试开关。
10. **确定性哈希的性能**：stableStringify 对大 mesh 可能慢；哈希仅用于 smoke 断言与
    关键节点校验，不用于每帧热路径。
