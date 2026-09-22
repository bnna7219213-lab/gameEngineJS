// VDOM 游戏版对外接口封装（对标 pythonClasses 的 vue_data.py「this」单例 + Vue2 runtime API）。
// 职责：把 vnode/h/patch/host 组装成「业务可直接调用」的接口层，提供：
//   · VDomApp      —— 持有 patch 实例 + 当前 vnode 树的 diff 容器（对标 Vue 实例 render/update）
//   · createGameDiff —— 工厂：一行接 Scene3D（游戏对象树）或 DOM 容器
//   · VDomReactive  —— 响应式数据 + 自动 diff（对标 vue_data 的 GameData/GameObjects/Computed/Watcher）
// 关键约定：DOM-free 导入（host 按需提供）、零依赖、Node 可测。
import { h, VNode, createTextVNode } from './vnode.js';
import { createPatchFunction } from './patch.js';
import { createGNodeHost } from './gnode_host.js';
import { createDomHost, createMockHost } from './dom_host.js';

// ============================================================ 1. Diff 容器（对标 Vue 实例）
// 持有「当前 vnode 树」，render(newTree) 即触发一次 diff + host 写入。
// 对标 Vue2 的 vm._update(vm._render())；游戏版把「真实节点树」换成 GNode 树 / DOM。
export class VDomApp {
  constructor({ host, root } = {}) {
    if (!host) throw new Error('VDomApp: 需要 host 适配器（game/dom/mock）');
    this.host = host;
    this.root = root || host.root || host.createElement('__root__');
    this._patch = createPatchFunction({ api: host });
    this._vnode = null;      // 当前 vnode 树（首次 render 前为 null）
    this._el = null;         // 当前树对应的真实根节点
    this.$refs = {};         // data.ref 注册表（patch 的 ref 模块写入）
  }

  // 挂载 / 更新：首次 render 挂载，后续 render diff 复用
  // tree: vnode（h() 创建）或原始字符串/数字（转文本）
  render(tree) {
    const vnode = _asVNode(tree, this);
    if (this._vnode == null) {
      // 首次：patch 到根（真实节点替换/挂载语义）
      this._el = this._patch(_emptyRoot(this.host, this.root), vnode);
    } else {
      this._el = this._patch(this._vnode, vnode);
    }
    this._vnode = vnode;
    return this._el;
  }

  // 销毁：触发 destroy 钩子 + ref 解绑
  destroy() {
    if (this._vnode != null) this._patch(this._vnode, null);
    this._vnode = null;
    this._el = null;
    this.$refs = {};
  }

  get el() { return this._el; }
  get vnode() { return this._vnode; }
}

function _asVNode(tree, ctx) {
  if (tree == null) return null;
  if (tree instanceof VNode) { _setContext(tree, ctx); return tree; }
  if (typeof tree === 'string' || typeof tree === 'number') return createTextVNode(tree);
  if (Array.isArray(tree)) { const v = h('fragment', { key: 'root' }, tree); _setContext(v, ctx); return v; }
  throw new Error('VDomApp.render: 需要 vnode（h() 创建）或原始文本');
}

// context（ref 注册目标）传播到整棵子树：Vue2 中由组件实例继承，本游戏版无组件，
// 由 VDomApp 统一填充——ref 模块据此写 vm.$refs。
function _setContext(vnode, ctx) {
  vnode.context = ctx;
  if (vnode.children) for (const c of vnode.children) _setContext(c, ctx);
}

function _emptyRoot(host, root) {
  // 首次挂载的 oldVnode 用「与根同 tag 的空节点」：patch 会走 createElm + removeOld
  return new VNode(host.tagName ? host.tagName(root).toLowerCase() : '__root__', {}, [], undefined, root);
}

// ============================================================ 2. 工厂：一行接入不同宿主
// createGameDiff(scene, {root})   → 把 diff 接到 Scene3D 游戏对象树（DOM-free）
// createDomDiff(container, doc)   → 接到真实 DOM 容器
// createMockDiff()                → 内存 mock 树（测试用）
export function createGameDiff(scene, { root } = {}) {
  const host = createGNodeHost(scene, root);
  return new VDomApp({ host, root: host.root });
}

export function createDomDiff(container, documentRef = null) {
  if (!container) throw new Error('createDomDiff: 需要容器 DOM 节点');
  const host = createDomHost(documentRef);
  return new VDomApp({ host, root: container });
}

export function createMockDiff() {
  const host = createMockHost();
  return new VDomApp({ host, root: host.createElement('__root__') });
}

// ============================================================ 3. 响应式封装（对标 vue_data.py 的 this/GameData）
// 目标：业务只改数据，VDomReactive 自动触发 diff。与 vue_data.py 的映射：
//   | vue_data.py（Python/Unity 桥）      | VDomReactive（本工程）                 |
//   |-------------------------------------|----------------------------------------|
//   | this.objects.add/remove（增删同步） | data.objects（Proxy 数组劫持）→ 自动 diff |
//   | Watcher 线程轮询                    | watch(getter, cb) 手动/帧驱动采样       |
//   | Computed TTL 缓存                   | computed(fn, ttl)                       |
//   | this.data 全量视图                  | data 直接即 vnode 描述源                |
//   | this.dump() 状态面板                | dump()                                  |
//
// 说明：本工程是**单进程 JS**，数据就在内存，无需跨进程轮询；
// watch 提供「手动 sample()」与「挂到引擎帧回调」两种驱动方式（确定性，红线 F）。

export class VDomReactive {
  constructor(app, { render } = {}) {
    if (!app) throw new Error('VDomReactive: 需要 VDomApp');
    if (typeof render !== 'function') throw new Error('VDomReactive: 需要 render(data)→vnode 函数');
    this.app = app;
    this._render = render;
    this._watchers = [];
    this._computeds = {};
    // 响应式数据：Proxy 包装，任何写操作 → 调度一次 render
    this.data = _reactiveRoot(this);
    this._scheduled = false;
    this.update(); // 首次渲染
  }

  update() {
    const tree = this._render(this.data);
    this.app.render(tree);
    this._scheduled = false;
  }

  // 数据变更后调度（同步批量：同 tick 多次写只 render 一次）
  schedule() {
    if (this._scheduled) return;
    this._scheduled = true;
    // 微任务批量（浏览器/Node 均可用 queueMicrotask）
    queueMicrotask(() => { if (this._scheduled) this.update(); });
  }

  computed(fn, ttl = 0.5) {
    const c = new Computed(fn, ttl);
    this._computeds[fn.name || ('computed_' + Object.keys(this._computeds).length)] = c;
    return c;
  }

  // watch：sample() 手动推进一帧（或挂 engine 帧回调），值变化触发 cb(new, old)
  watch(getter, cb) {
    const w = { getter, cb, last: undefined, started: false };
    this._watchers.push(w);
    return {
      sample: () => this._sampleWatcher(w),
      stop: () => { const i = this._watchers.indexOf(w); if (i >= 0) this._watchers.splice(i, 1); },
    };
  }

  _sampleWatcher(w) {
    let cur;
    try { cur = w.getter(); } catch (_) { return; }
    if (!w.started) { w.started = true; w.last = cur; return; }
    if (!_shallowEq(cur, w.last)) { const old = w.last; w.last = cur; w.cb(cur, old); }
  }

  // 帧驱动：由调用方在每帧调用（确定性，避免后台线程污染——呼应记忆中「清理遗留线程」的教训）
  tick() { for (const w of [...this._watchers]) this._sampleWatcher(w); }

  dump() {
    return [
      'VDomReactive = {',
      '  refs: [' + Object.keys(this.app.$refs).join(', ') + ']',
      '  computeds: [' + Object.keys(this._computeds).join(', ') + ']',
      '  watchers: ' + this._watchers.length,
      '  vnode: ' + (this.app._vnode ? this.app._vnode.tag : 'null'),
      '}',
    ].join('\n');
  }
}

// 响应式根：递归 Proxy，写操作（含数组 push/splice）→ schedule()
function _reactiveRoot(owner) {
  const make = (target) => new Proxy(target, {
    get(t, k) {
      const v = t[k];
      if (v && typeof v === 'object') return make(v);
      return v;
    },
    set(t, k, v) {
      t[k] = v;
      owner.schedule();
      return true;
    },
    deleteProperty(t, k) {
      delete t[k];
      owner.schedule();
      return true;
    },
  });
  return make({ objects: [], meta: {} });
}

// Computed（TTL 缓存，对标 vue_data.Computed）
class Computed {
  constructor(fn, ttl) { this._fn = fn; this._ttl = ttl; this._value = null; this._at = -1e9; }
  get value() {
    const now = Date.now() / 1000;
    if (now - this._at > this._ttl) { this._value = this._fn(); this._at = now; }
    return this._value;
  }
  invalidate() { this._at = -1e9; }
}

function _shallowEq(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every(k => a[k] === b[k]);
}

// ============================================================ 4. 再导出（统一入口）
export { h, VNode, createTextVNode, createEmptyVNode, cloneVNode, sameVnode } from './vnode.js';
export { createPatchFunction } from './patch.js';
export { createGNodeHost } from './gnode_host.js';
export { createDomHost, createMockHost } from './dom_host.js';
