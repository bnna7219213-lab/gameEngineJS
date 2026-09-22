// 虚拟 DOM 节点（vdom 游戏版，对标 Vue2 src/core/vdom/vnode.js）。
// 职责：VNode 结构 + h() 创建 + sameVnode/key 工具，为 patch.js 的 diff 提供输入。
// 关键约定：DOM-free、零依赖、Node 可测（红线 C/D/E）。
// 与 Vue2 的差异（游戏版映射，详见 docs/VDOM.md）：
//   · 不含组件系统（componentOptions/asyncFactory 为占位字段，恒 null/undefined）——
//     Vue 组件是实例机制而非 diff 的一部分；游戏版用「vnode 树直接描述场景/界面」。
//   · elm 由 host 适配器定义：DOM 节点 / GNode（Scene3D 游戏对象包装）/ 任意 mock 树。

// ---- 基础谓词（与 Vue2 shared/util 同名同义）----
export function isUndef(v) { return v === undefined || v === null; }
export function isDef(v) { return v !== undefined && v !== null; }
export function isTrue(v) { return v === true; }
export function isFalse(v) { return v === false; }
export function isPrimitive(v) {
  return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || typeof v === 'symbol';
}

export class VNode {
  constructor(tag, data, children, text, elm, context, componentOptions, asyncFactory) {
    this.tag = tag;                       // 元素标签（'div' / 'cube' / 'object'）；undefined 表示纯文本
    this.data = data;                     // 属性包 {key, ref, attrs, props, class, style, on, directives, hook, ...}
    this.children = children;             // VNode[] | undefined
    this.text = text;                     // 文本节点内容
    this.elm = elm;                       // host 节点引用（patch 后填充）
    this.ns = undefined;                  // 命名空间（svg 等）
    this.context = context;               // 渲染上下文（ref 注册目标）
    this.fnContext = undefined;
    this.fnOptions = undefined;
    this.fnScopeId = undefined;
    this.key = data && data.key;          // diff 复用标识
    this.componentOptions = componentOptions; // 占位（无组件系统）
    this.componentInstance = null;
    this.parent = undefined;              // 占位 vnode（组件根用；游戏版通常 undefined）
    this.raw = false;
    this.isStatic = false;                // 静态子树（sameVnode 后直接复用 elm，跳过 diff）
    this.isRootInsert = true;
    this.isComment = false;
    this.isCloned = false;
    this.isOnce = false;
    this.asyncFactory = asyncFactory;     // 占位（无异步组件）
    this.asyncMeta = undefined;
    this.isAsyncPlaceholder = false;
  }
}

// 空节点 / 注释节点
export const createEmptyVNode = (text = '') => {
  const node = new VNode();
  node.text = text;
  node.isComment = true;
  return node;
};

// 文本节点
export function createTextVNode(val) {
  return new VNode(undefined, undefined, undefined, String(val));
}

// 克隆 vnode（浅拷贝 children 数组；标记 isCloned 供 patch 识别）
export function cloneVNode(vnode) {
  const cloned = new VNode(
    vnode.tag, vnode.data,
    vnode.children && vnode.children.slice(),
    vnode.text, vnode.elm, vnode.context,
    vnode.componentOptions, vnode.asyncFactory,
  );
  cloned.ns = vnode.ns;
  cloned.isStatic = vnode.isStatic;
  cloned.key = vnode.key;
  cloned.isComment = vnode.isComment;
  cloned.fnContext = vnode.fnContext;
  cloned.fnOptions = vnode.fnOptions;
  cloned.fnScopeId = vnode.fnScopeId;
  cloned.asyncMeta = vnode.asyncMeta;
  cloned.isCloned = true;
  return cloned;
}

export function cloneVNodes(vnodes) {
  const len = vnodes.length;
  const res = new Array(len);
  for (let i = 0; i < len; i++) res[i] = cloneVNode(vnodes[i]);
  return res;
}

// h(tag, data?, children?) — 创建元素/文本 vnode。
// children 省略或为原始值 → 文本 vnode；数组 → 元素 vnode（null 过滤、原始值转文本节点）。
export function h(tag, data, children) {
  if (data != null && (Array.isArray(data) || isPrimitive(data))) {
    children = data;
    data = undefined;
  }
  if (isPrimitive(children)) return new VNode(tag, data, undefined, String(children), undefined);
  let ch;
  if (Array.isArray(children)) {
    ch = [];
    for (let i = 0; i < children.length; i++) {
      const c = children[i];
      if (isUndef(c) || isFalse(c)) continue;
      ch.push(isPrimitive(c) ? createTextVNode(c) : c);
    }
  }
  return new VNode(tag, data, ch, undefined, undefined);
}

// ---- diff 核心工具 ----

// 判断两个 vnode 是否「同一个可复用节点」（Vue2 sameVnode）。
// key 相同 + tag 相同 + 注释属性一致 + data 有无一致 + input 的 type 相同。
export function sameVnode(a, b) {
  return (
    a.key === b.key &&
    a.asyncFactory === b.asyncFactory && (
      (
        a.tag === b.tag &&
        a.isComment === b.isComment &&
        isDef(a.data) === isDef(b.data) &&
        sameInputType(a, b)
      ) || (
        isTrue(a.isAsyncPlaceholder) &&
        isUndef(b.asyncFactory)
      )
    )
  );
}

// <input> 特例：type 不同的 input 不复用（Vue2 sameInputType）
function sameInputType(a, b) {
  if (a.tag !== 'input') return true;
  let i;
  const typeA = isDef(i = a.data) && isDef(i = i.attrs) && i.type;
  const typeB = isDef(i = b.data) && isDef(i = i.attrs) && i.type;
  return typeA === typeB || (isTextInputType(typeA) && isTextInputType(typeB));
}
const isTextInputType = (t) => t === 'text' || t === 'number' || t === 'password' || t === 'search' || t === 'email' || t === 'tel' || t === 'url';

// 建立 key -> 旧子节点下标 映射（updateChildren 乱序匹配用）
export function createKeyToOldIdx(children, beginIdx, endIdx) {
  const map = {};
  for (let i = beginIdx; i <= endIdx; ++i) {
    const key = children[i].key;
    if (isDef(key)) map[key] = i;
  }
  return map;
}

// 无 key 的新节点在旧子数组中按 sameVnode 线性查找
export function findIdxInOld(node, oldCh, start, end) {
  for (let i = start; i < end; i++) {
    const c = oldCh[i];
    if (isDef(c) && sameVnode(node, c)) return i;
  }
}
