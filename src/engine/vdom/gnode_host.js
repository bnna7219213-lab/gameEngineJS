// 游戏对象树 host（GNode）—— vdom diff 的「游戏版真实节点」。
// 职责：把 Scene3D 的 GameObject3D 包装成与 DOM 同构的可 diff 节点树，
// 让 createPatchFunction 能直接在「游戏场景对象树」上做 Vue2 式增删/移动/属性更新。
// 对应参考：pythonClasses/beginner/04_vue_global_data 中 GameObjects.add/remove（数组方法劫持的游戏版）。
// DOM-free、零依赖、Node 可测；红线 F（编辑器→运行时单向）：本模块只驱动 Scene3D，不被其反向改写。
import { GameObject3D } from '../platform/scene3d.js';

// ---- 原始 tag -> 图元组件（cube/sphere/plane/cylinder/cone/torus）----
const PRIMITIVES = new Set(['cube', 'sphere', 'plane', 'cylinder', 'cone', 'torus']);

// 解析 vnode data 为 transform + mesh 参数（游戏对象属性模型）。tag 由调用方（GNode.tag）传入。
function resolveObjectData(tag, data = {}) {
  const a = data.attrs || {};
  const p = data.props || {};
  const tr = {
    position: [...(p.position || a.position || [0, 0, 0])],
    rotation: [...(p.rotation || a.rotation || [0, 0, 0])],
    scale: [...(p.scale || a.scale || [1, 1, 1])],
  };
  const mesh = PRIMITIVES.has(tag) ? { shape: tag } : null;
  const meshFields = {};
  for (const k of ['albedo', 'rough', 'metal', 'emissive', 'customGeo']) {
    if (p[k] != null) meshFields[k] = p[k];
    else if (a[k] != null) meshFields[k] = a[k];
  }
  return { tr, mesh, meshFields };
}

// GNode：游戏对象节点（与 DOM 节点同构的适配壳）
// 关键属性：tag / key / obj（GameObject3D 引用）/ _children（有序子 GNode 数组）
export class GNode {
  constructor(tag, data = {}, obj = null) {
    this.tag = tag;               // 标签（图元名 / 'object' / '__root__'）
    this.key = data.key;          // diff 复用标识
    this.data = data;             // {attrs, props, class, style, on, directives, ref, hook}
    this.obj = obj;               // GameObject3D 或 null（__root__ 场景容器）
    this._parent = null;          // GNode 树父节点（diff 结构，与场景父子关系分离维护）
    this._children = [];          // 有序子节点（Vue2 语义：顺序 = vnode children 顺序）
    this._attrs = {};             // 已生效的 attrs 缓存
    this._props = {};             // 已生效的 props 缓存
    this._class = '';
    this._style = {};
    this._listeners = new Map();  // name -> [{fn,params}]
    this._directives = [];
  }

  get children() { return this._children; }
  get name() { return this.obj ? this.obj.name : this.tag; }
}

// 创建 game host 适配器（供 createPatchFunction 使用）。
// scene: Scene3D；root: 可选根 GNode（默认场景级虚拟根）。
export function createGNodeHost(scene, root = null) {
  if (!scene) throw new Error('createGNodeHost: 需要 Scene3D');
  const rootNode = root || new GNode('__root__', {}, null);
  const objToNode = new Map();   // GameObject3D.id -> GNode

  // 把一个 GNode 与其子树注册进 scene（从 parent 挂下）。
  // 注意：vnode 的 attrs/props 在 createElm 阶段（GNode 建出、obj 尚未绑定）就经 setAttr/setProp
  // 写入了 GNode 缓存（_attrs/_props）；此处 bind 时把缓存一次性应用到 GameObject3D。
  function bindTree(node, parentGNode) {
    if (node.tag === '__root__') return;
    const { tr, mesh, meshFields } = resolveObjectData(node.tag, node.data);
    const obj = new GameObject3D(node.name !== node.tag ? node.name : (node.data.props?.name || node.data.attrs?.name || node.tag + '_' + scene.objects.size), tr);
    if (mesh) obj.components.mesh = { ...mesh, ...meshFields };
    else if (Object.keys(meshFields).length) obj.components.mesh = meshFields;
    node.obj = obj;
    scene.add(obj, parentGNode && parentGNode.obj ? parentGNode.obj.id : null);
    objToNode.set(obj.id, node);
    // 把 createElm 阶段缓存到 GNode 的 attrs/props 应用到 obj（标量/数组 transform + mesh 字段）
    for (const k of Object.keys(node._attrs)) _applyAttrField(obj, k, node._attrs[k]);
    for (const k of Object.keys(node._props)) _applyPropField(obj, k, node._props[k]);
    for (const c of node._children) bindTree(c, node);
  }

  function unbindTree(node) {
    if (node.obj) {
      scene.removeRecursive(node.obj.id);
      objToNode.delete(node.obj.id);
      node.obj = null;
    }
  }

  const api = {
    // ---- nodeOps（createPatchFunction 调用面）----
    tagName(node) { return node.tag; },
    parentNode(node) {
      // GNode 树的父关系由 _parent 显式维护（diff 结构），
      // 与 GameObject3D 的场景父链解耦——场景父链只表达"渲染层级"，diff 树表达"vnode 层级"。
      return node._parent || null;
    },
    nextSibling(node) {
      const parent = api.parentNode(node);
      if (!parent) return null;
      const list = parent._children;
      const i = list.indexOf(node);
      return i >= 0 && i + 1 < list.length ? list[i + 1] : null;
    },
    createElement(tag, data) {
      return new GNode(tag, data || {});
    },
    createTextNode(text) {
      const n = new GNode('#text', {});
      n.text = text;
      return n;
    },
    createComment(text) {
      const n = new GNode('#comment', {});
      n.text = text;
      return n;
    },
    appendChild(parent, child) {
      if (!parent._children.includes(child)) parent._children.push(child);
      child._parent = parent;
      if (child.obj) {
        scene.add(child.obj, parent.obj ? parent.obj.id : null);
      } else {
        bindTree(child, parent);
      }
    },
    insertBefore(parent, newNode, refNode) {
      const list = parent._children;
      // 从旧父节点摘除（移动场景：节点跨父或同父换序）
      if (newNode._parent && newNode._parent !== parent) {
        const oi = newNode._parent._children.indexOf(newNode);
        if (oi >= 0) newNode._parent._children.splice(oi, 1);
      }
      const i = list.indexOf(refNode);
      if (i >= 0) list.splice(i, 0, newNode);
      else list.push(newNode);
      newNode._parent = parent;
      // 同步 scene 父子关系（顺序由 GNode 列表承载，GameObject3D.children 只作存在性）
      if (newNode.obj) scene.add(newNode.obj, parent.obj ? parent.obj.id : null);
      else bindTree(newNode, parent);
    },
    removeChild(parent, child) {
      const i = parent._children.indexOf(child);
      if (i >= 0) parent._children.splice(i, 1);
      child._parent = null;
      unbindTree(child);
    },
    setTextContent(node, text) { node.text = text; },
    setAttribute(node, key, val) { node._attrs[key] = val; api._applyAttr(node, key, val); },
    removeAttribute(node, key) { delete node._attrs[key]; api._applyAttr(node, key, undefined); },

    // ---- 属性/样式/事件/类模块接口（modules.js 调用面）----
    setClass(node, cls) { node._class = cls; },
    setStyle(node, key, val) { if (val === '') delete node._style[key]; else node._style[key] = val; },
    setAttr(node, key, val) { node._attrs[key] = val; api._applyAttr(node, key, val); },
    removeAttr(node, key) { delete node._attrs[key]; api._applyAttr(node, key, undefined); },
    setProp(node, key, val) { node._props[key] = val; api._applyProp(node, key, val); },
    addEvent(node, name, fn, params) {
      if (!node._listeners.has(name)) node._listeners.set(name, []);
      node._listeners.get(name).push({ fn, params });
    },
    removeEvent(node, name, fn) {
      const list = node._listeners.get(name);
      if (!list) return;
      const i = list.findIndex(x => x.fn === fn);
      if (i >= 0) list.splice(i, 1);
    },
    applyDirective(node, dir, oldValue) {
      node._directives = node._directives.filter(d => d.name !== dir.name);
      if (dir.value !== undefined) node._directives.push(dir);
    },

    // 内部：把 attrs/props 写回 GameObject3D。
    // Vue2 语义：attrs 与 props 是**独立通道**（各自增删互不影响）；
    // 游戏对象字段按「通道归属」划分，避免 updateProps 清理 attrs 写入的值（反之亦然）。
    _applyAttr(node, key, val) {
      if (!node.obj) return;
      _applyAttrField(node.obj, key, val);
    },
    _applyProp(node, key, val) {
      if (!node.obj) return;
      _applyPropField(node.obj, key, val);
    },

    // 根节点
    root: rootNode,
    // 工具：按 vnode 树同步根容器（便捷入口，见 index.js）
    _bindTree: bindTree,
    _objToNode: objToNode,
  };

  // attrs 通道：transform 标量 + name（DOM 语义的"特性"，映射到对象变换/标识）
  function _applyAttrField(obj, key, val) {
    if (['x', 'y', 'z'].includes(key)) {
      const i = { x: 0, y: 1, z: 2 }[key];
      obj.transform.position[i] = val === undefined ? 0 : Number(val);
    } else if (['sx', 'sy', 'sz'].includes(key)) {
      const i = { sx: 0, sy: 1, sz: 2 }[key];
      obj.transform.scale[i] = val === undefined ? 1 : Number(val);
    } else if (['rx', 'ry', 'rz'].includes(key)) {
      const i = { rx: 0, ry: 1, rz: 2 }[key];
      obj.transform.rotation[i] = val === undefined ? 0 : Number(val);
    } else if (key === 'name') {
      if (val != null) obj.name = String(val);
    }
  }

  // props 通道：transform 数组（position/rotation/scale）+ mesh 组件字段
  // （DOM 语义的"属性"，映射到结构化对象数据——数组保持原值不字符串化）
  function _applyPropField(obj, key, val) {
    if (key === 'position' && Array.isArray(val)) obj.transform.position = [...val];
    else if (key === 'rotation' && Array.isArray(val)) obj.transform.rotation = [...val];
    else if (key === 'scale' && Array.isArray(val)) obj.transform.scale = [...val];
    else if (key === 'name') { if (val != null) obj.name = String(val); }
    else if (['albedo', 'rough', 'metal', 'emissive', 'customGeo', 'shape'].includes(key)) {
      if (!obj.components.mesh) obj.components.mesh = {};
      if (val === undefined) delete obj.components.mesh[key];
      else obj.components.mesh[key] = val;
    }
  }

  return api;
}
