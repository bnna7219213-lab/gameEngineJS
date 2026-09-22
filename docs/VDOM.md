# VDOM 游戏版 — Vue2 diff 在 GameEngineJS 的落地

> 对应参考：`C:\Users\bnna7\Aether\pythonClasses\beginner\04_vue_global_data`（vue_data.py / vue_demo.py）
> 与 `C:\Users\bnna7\Aether\IGame`（Unity TCP 桥）。
> 本文档说明 **GameEngineJS 侧的「游戏版 Vue2 diff」** 的架构、映射关系与全部调用接口。
> 实现位置：`src/engine/vdom/`（vnode.js / patch.js / modules.js / gnode_host.js / dom_host.js / index.js）。
> 测试：`tools/smoke/plat_vdom_smoke.js`（81 断言，Node 直跑）。

---

## 0. 这是什么

参考工程把 **Vue2 的「全局数据对象 + 响应式」** 映射到了 Python↔Unity 桥（vue_data.py 的 `this`）：
`this.objects.add/remove`、Watcher 轮询、Computed TTL 缓存。它解决的是**数据层的响应式**。

本工程把它推进到 **Vue2 的另一半 —— vdom diff（patch/updateChildren）**，并做「游戏版」平台适配：
diff 内核与 Vue2 `createPatchFunction` 同构（**平台无关**），宿主（host 适配器）决定「真实节点」是什么——
本工程提供三种宿主，让同一套 Vue2 diff 算法既能驱动 **Scene3D 游戏对象树**（DOM-free），
也能驱动 **真实 DOM**，还能在 **内存 mock 树** 上纯 Node 测试。

**与 Vue2 的取舍**（游戏版映射，红线 B 注明来源）：

| Vue2 机制 | 本工程游戏版 | 说明 |
|---|---|---|
| `createPatchFunction(nodeOps, modules)` | `createPatchFunction({ api })` | 同构：patch 内核不碰 DOM，全部平台操作经 `api`（nodeOps）注入 |
| `updateChildren` 双端比较 + key 映射 | **完整移植** | 乱序 key 复用、增删、移动、reverse 全部走 Vue2 原算法 |
| DOM 节点 | `GNode`（Scene3D 游戏对象壳）/ DOM / mock | 三 host 共用同一 diff 内核 |
| `attrs` / `props` 双通道 | **保留**（attrs=transform 标量+name；props=transform 数组+mesh 字段） | 数组保持结构化（不字符串化） |
| 组件系统（componentOptions） | **占位字段，恒空** | Vue 组件是实例机制而非 diff 的一部分；游戏版用 vnode 树直接描述场景 |
| `$refs` / `hook`（insert/destroy/remove） | **保留** | `data.ref` 注册到 `app.$refs`；生命周期钩子按 Vue2 队列制触发 |
| `this.$data`（vue_data.py） | `VDomReactive.data`（Proxy 递归劫持） | 写操作自动调度 diff（微任务批量） |
| `Watcher` 线程轮询 | `watch(getter, cb)` + `tick()` | 单进程 JS 无需后台线程；`tick()` 由帧循环驱动（确定性，避免遗留线程） |
| `Computed` TTL 缓存 | `computed(fn, ttl)` | 同 vue_data.py 语义 |

**红线遵守**：DOM-free 导入（host 按需创建）、零依赖、Node 可测；
红线 F（编辑器→运行时单向）：gnode host 只驱动 Scene3D，不被其反向改写；
数组/对象属性不字符串化（游戏对象属性需结构化数据）。

---

## 1. 架构分层

```
业务代码
   │  h('cube', { key, props }, [...])          ← 描述「想要的场景/界面」
   ▼
┌─────────────────────────────────────────────┐
│ VDomApp / VDomReactive        （index.js）    │  ← 持有当前 vnode 树，render() 触发 diff
├─────────────────────────────────────────────┤
│ createPatchFunction           （patch.js）    │  ← Vue2 diff 内核（平台无关）
│   createElm / patchVnode / updateChildren     │
│   + modules（attrs/class/props/style/on/ref） │  ← modules.js
├─────────────────────────────────────────────┤
│ host 适配器（nodeOps）                        │
│   gnode_host.js  → Scene3D GameObject3D 树   │  ← 游戏版「真实节点」
│   dom_host.js    → 浏览器 document           │
│   (mock host)    → 内存树（测试）             │
└─────────────────────────────────────────────┘
   │
   ▼
Scene3D 场景对象 / DOM / mock 树               ← diff 的最终落地
```

**关键设计**：diff 内核（patch.js + modules.js）与 Vue2 逐行同构，只做**纯函数式**的节点增删移动；
「什么是节点、怎么建、怎么写属性」全部下沉到 host。这就是为什么同一套算法能同时驱动游戏对象树与 DOM。

---

## 2. 全部调用接口

统一入口：`import { ... } from 'src/engine/vdom/index.js'`

### 2.1 描述层（vnode）

```js
import { h, VNode, createTextVNode, cloneVNode, sameVnode } from 'src/engine/vdom/index.js';

// 创建元素 vnode：h(tag, data?, children?)
const tree = h('object', { key: 'world' }, [          // 容器节点
  h('cube',   { key: 'a', props: { name: 'hero', position: [0,1,0], albedo: [255,100,0] } }),
  h('sphere', { key: 'b', attrs: { name: 'ball', x: 3, sy: 2 } }),  // attrs 走标量通道
  'plain text',                                        // 原始值 → 文本节点
]);

// data 支持的键（Vue2 语义）：
//   key        diff 复用标识（强烈建议列表项都加）
//   attrs      特性（gnode: transform 标量 x/y/z/sx/sy/sz/rx/ry/rz + name）
//   props      属性（gnode: transform 数组 position/rotation/scale + mesh 字段 albedo/rough/metal/emissive/customGeo/shape + name）
//   class/style/on/directives/transition  UI 语义（DOM host 生效；gnode host 记录但不写场景）
//   ref        注册到 app.$refs
//   hook       { create, insert, remove, destroy, prepatch, postpatch }

sameVnode(a, b)        // Vue2 同款判断（key+tag+input type）
cloneVNode(v)          // 浅克隆（标 isCloned）
createTextVNode('x')   // 文本节点
```

### 2.2 Diff 容器（对标 Vue 实例）

```js
import { VDomApp } from 'src/engine/vdom/index.js';

const app = new VDomApp({ host, root });   // host 见 §2.4
app.render(tree);        // 首次 = 挂载；后续 = diff 复用（返回真实根节点）
app.render(newTree);     // 再次调用即 diff（Vue2 vm._update 语义）
app.destroy();           // 触发 destroy 钩子 + ref 解绑
app.el                   // 当前真实根节点（GNode / DOM 节点）
app.$refs                // data.ref 注册表
app.vnode                // 当前 vnode 树
```

### 2.3 工厂（一行接入宿主）

```js
import { createGameDiff, createDomDiff, createMockDiff } from 'src/engine/vdom/index.js';

// ① 接到 Scene3D 游戏对象树（游戏版核心；DOM-free，Node 可测）
import { Scene3D } from 'src/engine/platform/scene3d.js';
const scene = new Scene3D();
const app = createGameDiff(scene);
app.render(h('object', { key: 'w' }, [
  h('cube', { key: 'hero', props: { name: 'hero', position: [0,1,0], albedo: [255,100,0] } }),
]));
// → scene 里出现名为 hero 的 GameObject3D，components.mesh.shape='cube'

// ② 接到真实 DOM 容器（编辑器 UI 用）
const app2 = createDomDiff(document.getElementById('panel'));
app2.render(h('button', { on: { click: () => {} } }, ['Run']));

// ③ 内存 mock 树（纯 Node 测试 diff 算法）
const app3 = createMockDiff();
```

### 2.4 底层：自定义 host（高级）

```js
import { createPatchFunction, createGNodeHost, createDomHost, createMockHost } from 'src/engine/vdom/index.js';

// 自建 host：实现 nodeOps 接口即可把 diff 接到任意「真实节点树」
const myApi = {
  tagName(n){}, parentNode(n){}, nextSibling(n){},
  createElement(tag, data){}, createTextNode(t){}, createComment(t){},
  appendChild(p,c){}, insertBefore(p,n,r){}, removeChild(p,c){},
  setTextContent(n,t){}, setAttribute(n,k,v){}, removeAttribute(n,k){},
  // modules.js 调用面：
  setClass(n,c){}, setStyle(n,k,v){}, setAttr(n,k,v){}, removeAttr(n,k){},
  setProp(n,k,v){}, addEvent(n,name,fn,params){}, removeEvent(n,name,fn){}, applyDirective(n,dir,old){},
};
const patch = createPatchFunction({ api: myApi });
patch(oldVnode, newVnode);
```

### 2.5 响应式封装（对标 vue_data.py 的 `this`）

```js
import { VDomReactive, createGameDiff } from 'src/engine/vdom/index.js';

const app = createGameDiff(scene);
const r = new VDomReactive(app, {
  // render(data) → vnode：只写「数据 → 树」的纯函数
  render: (d) => h('object', { key: 'root' },
    d.objects.map(o => h(o.shape, { key: o.id, props: { name: o.id, position: o.pos, albedo: o.color } }))),
});

// 改数据 → 自动 diff（微任务批量；同 tick 多次写只 render 一次）
r.data.objects.push({ id: 'enemy', shape: 'sphere', pos: [3,1,0], color: [200,0,0] });
r.data.objects[0].pos = [5, 1, 0];

// watch：getter 返回值变化时回调（sample() 手动驱动，或 tick() 帧驱动）
const w = r.watch(() => r.data.objects.length, (nv, ov) => console.log(ov, '->', nv));
w.sample();          // 手动采样一次
r.tick();            // 驱动全部 watcher（挂到引擎帧循环，确定性）

// computed：TTL 缓存（对标 vue_data.Computed）
const dist = r.computed(() => Math.hypot(...), 0.5);
dist.value;          // 缓存期内不重算
dist.invalidate();   // 强制重算

r.dump();            // 状态面板（refs/computeds/watchers/vnode 计数）
r.update();          // 手动强制 render 一次
```

**与 vue_data.py 的行为差异**（有意为之，红线 B 注明）：
- vue_data.py 的 `Watcher` 是**后台线程轮询**（跨进程不得不拉）；本工程单进程 JS，
  `watch` 用 `sample()/tick()` **显式驱动**——避免后台线程污染测试（呼应「清理遗留线程」的教训），
  并保证确定性（红线 F）。
- vue_data.py 的 `objects.add/remove` 是**命令式增删**；本工程 `data.objects.push/splice`
  是**声明式**——你只改数组，`VDomReactive` 自动算出 diff 并落到场景。

---

## 3. 完整示例：数据驱动的场景

```js
import { Scene3D } from 'src/engine/platform/scene3d.js';
import { createGameDiff, VDomReactive, h } from 'src/engine/vdom/index.js';

const scene = new Scene3D();
const app = createGameDiff(scene);
const game = new VDomReactive(app, {
  render: (d) => h('object', { key: 'world' },
    d.entities.map(e => h(e.kind, {
      key: e.id,
      props: { name: e.id, position: e.pos, albedo: e.color, rough: e.rough },
    }))),
});

game.data.entities.push({ id: 'hero',  kind: 'cube',   pos: [0, 1, 0], color: [255, 100, 0], rough: 0.5 });
game.data.entities.push({ id: 'enemy', kind: 'sphere', pos: [3, 1, 0], color: [200, 0, 0],   rough: 0.3 });

// 游戏循环里：改数据即可，场景自动同步
game.watch(() => game.data.entities.length, () => console.log('实体数变化'));
function onFrame() {
  game.data.entities[0].pos = [game.data.entities[0].pos[0] + 0.1, 1, 0];
  game.tick();   // 驱动 watcher
}
```

---

## 4. 测试与验证

```bash
node tools/run_smoke.js plat_vdom    # 81 断言：算法 + 三 host + 响应式
node tools/run_smoke.js              # 全量回归（当前 76 smoke / 2368 断言全绿）
```

覆盖点：`h/sameVnode`（含 input type 特例）、挂载/文本/注释、`updateChildren`（key 乱序/增删/移动复用/reverse）、
无 key 按位置复用、attrs/class/props/style/on 模块、ref 注册/解绑、gnode host（Scene3D 增删/乱序/attrs 与 props 通道隔离）、
VDomReactive（Proxy 自动 diff/watch/computed/dump）、边界抛错（红线 A）。
