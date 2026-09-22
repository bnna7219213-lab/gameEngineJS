// 平台无关的属性/样式/事件/类更新模块（对标 Vue2 src/platforms/web/runtime/modules/*）。
// 区别：不触碰真实 DOM；每个 update 函数接收 host 适配器 `api`，由其决定如何写入。
// 供 patch.js 与 host 适配器（dom_host / gnode_host / mock host）复用，规则集中在此。
import { isUndef, isDef } from './vnode.js';

const emptyObject = Object.freeze({});

function genClassForVnode(vnode) {
  let data = vnode.data;
  let dynamicClass = data.class;
  let staticClass = data.staticClass;
  while (isDef(vnode.componentInstance)) { // 游戏版无组件，防御性保留
    if (isDef(vnode = vnode.componentInstance._vnode) && isDef(data = vnode.data)) {
      dynamicClass = data.class || dynamicClass;
      staticClass = data.staticClass || staticClass;
    }
    vnode = vnode.parent;
  }
  return { dynamicClass, staticClass };
}

function normalizeClassData(data) {
  let res = '';
  const d = data.class;
  if (isDef(d)) {
    if (typeof d === 'string') res = d;
    else if (Array.isArray(d)) res = d.map(normalizeClassData).join(' ');
    else if (typeof d === 'object') {
      for (const key in d) if (d[key]) res += (res ? ' ' : '') + key;
    }
  }
  if (isDef(data.staticClass)) res = (res ? data.staticClass + ' ' + res : data.staticClass);
  return res.trim();
}

export function updateClass(vnode, api) {
  const el = vnode.elm;
  const data = vnode.data;
  const oldData = vnode.context && vnode.context._vnode && vnode.context._vnode.data; // 由 patch 传入上下文时不依赖
  const { staticClass, dynamicClass } = genClassForVnode(vnode);
  const cls = normalizeClassData({ class: dynamicClass, staticClass });
  const old = vnode.data.__oldClass;
  vnode.data.__oldClass = cls;
  if (old !== cls) api.setClass(el, cls);
}

function normalizeStyleBinding(bindingStyle) {
  if (Array.isArray(bindingStyle)) return toObject(bindingStyle);
  if (typeof bindingStyle === 'string') return parseStyleText(bindingStyle);
  return bindingStyle || {};
}
function toObject(arr) {
  const res = {};
  for (const item of arr) Object.assign(res, item);
  return res;
}
function parseStyleText(cssText) {
  const res = {};
  for (const item of cssText.split(';')) {
    if (item) {
      const tmp = item.split(':');
      if (tmp.length > 1) res[tmp[0].trim()] = tmp[1].trim();
    }
  }
  return res;
}

export function updateStyle(vnode, api) {
  const data = vnode.data || emptyObject;
  const el = vnode.elm;
  const style = normalizeStyleBinding(data.style);
  const oldStyle = vnode.data.__oldStyle;
  vnode.data.__oldStyle = style;
  for (const key in style) api.setStyle(el, key, style[key]);
  if (oldStyle) for (const key in oldStyle) if (isUndef(style[key])) api.setStyle(el, key, '');
}

const MUST_USE_PROP = ['value', 'checked', 'selected', 'muted'];
function isAttr(key) { return !MUST_USE_PROP.includes(key); }

export function updateAttrs(vnode, api) {
  const data = vnode.data || emptyObject;
  const el = vnode.elm;
  const oldAttrs = data.__oldAttrs;
  data.__oldAttrs = data.attrs || emptyObject;
  const attrs = data.attrs || emptyObject;
  for (const key in attrs) {
    const cur = attrs[key];
    if (cur == null) api.removeAttr(el, key);
    else api.setAttr(el, key, cur);   // 数组/对象保持原值（gnode host 直接消费结构化数据）
  }
  if (oldAttrs) for (const key in oldAttrs) if (isUndef(attrs[key])) api.removeAttr(el, key);
}

export function updateProps(vnode, api) {
  const data = vnode.data || emptyObject;
  const el = vnode.elm;
  const oldProps = data.__oldProps;
  data.__oldProps = data.props || emptyObject;
  const props = data.props || emptyObject;
  for (const key in props) {
    // 数组/对象保持原值（游戏对象属性如 position/albedo 需结构化数据；
    // DOM host 中 value 等标量属性不受影响）。仅标量走直传。
    const cur = props[key];
    api.setProp(el, key, cur);
  }
  if (oldProps) for (const key in oldProps) if (isUndef(props[key])) api.setProp(el, key, undefined);
}

export function updateDOMListeners(vnode, api) {
  const data = vnode.data || emptyObject;
  const el = vnode.elm;
  const on = data.on || emptyObject;
  const oldOn = data.__oldOn;
  data.__oldOn = on;
  const added = new Set();
  for (const name in on) {
    const cur = on[name];
    const old = oldOn ? oldOn[name] : undefined;
    if (isUndef(cur)) continue;
    const event = parseEventName(name);
    // 直接函数比较：函数引用不同则换绑（Vue2 用 invoker 包装，本游戏版简化）
    if (isUndef(old) || cur !== old) {
      if (isDef(old)) api.removeEvent(el, event.name, old);
      api.addEvent(el, event.name, cur, event.params);
    }
    added.add(event.name);
  }
  if (oldOn) {
    for (const name in oldOn) {
      const event = parseEventName(name);
      if (!added.has(event.name) && isDef(oldOn[name])) {
        api.removeEvent(el, event.name, oldOn[name]);
      }
    }
  }
}

function parseEventName(name) {
  const m = name.match(/^([a-z]+)(?:\.([a-z]+))?/i);
  return { name: m ? m[1].toLowerCase() : name, params: m && m[2] ? m[2] : undefined };
}

export function updateDirectives(vnode, api) {
  const data = vnode.data || emptyObject;
  const el = vnode.elm;
  const dirs = data.directives || [];
  const oldDirs = data.__oldDirs || [];
  data.__oldDirs = dirs;
  for (const dir of dirs) {
    if (isDef(dir.value) || dir.oldValue == null) api.applyDirective(el, dir, undefined);
  }
  for (const dir of oldDirs) {
    if (!dirs.some(d => d.name === dir.name)) api.applyDirective(el, { ...dir, value: undefined }, dir.value);
  }
}

export function updateRef(vnode, api, isRemoval) {
  const ref = vnode.data && vnode.data.ref;
  if (!isDef(ref)) return;
  const vm = vnode.context;
  if (!vm) return;
  if (isRemoval) {
    if (vm.$refs && vm.$refs[ref] === vnode.elm) vm.$refs[ref] = undefined;
  } else {
    vm.$refs = vm.$refs || {};
    vm.$refs[ref] = vnode.elm;
  }
}

export function updateTransition(vnode, api) {
  const data = vnode.data || emptyObject;
  const el = vnode.elm;
  const t = data.transition;
  if (isDef(t) && isDef(t.enterClass)) api.setClass(el, normalizeClassData({ class: t.enterClass }));
  if (isDef(t) && isDef(t.leaveClass)) api.setClass(el, normalizeClassData({ class: t.leaveClass }));
}

// 供 patch.js 一次性更新全部模块（顺序固定：attrs→class→props→style→on→directives→ref）
export function updateAllModules(vnode, oldVnode, api) {
  vnode.data = vnode.data || {};
  vnode.data.__oldAttrs = oldVnode.data ? oldVnode.data.__oldAttrs : undefined;
  vnode.data.__oldProps = oldVnode.data ? oldVnode.data.__oldProps : undefined;
  vnode.data.__oldClass = oldVnode.data ? oldVnode.data.__oldClass : undefined;
  vnode.data.__oldStyle = oldVnode.data ? oldVnode.data.__oldStyle : undefined;
  vnode.data.__oldOn = oldVnode.data ? oldVnode.data.__oldOn : undefined;
  vnode.data.__oldDirs = oldVnode.data ? oldVnode.data.__oldDirs : undefined;
  updateAttrs(vnode, api);
  updateClass(vnode, api);
  updateProps(vnode, api);
  updateStyle(vnode, api);
  updateDOMListeners(vnode, api);
  updateDirectives(vnode, api);
  updateRef(vnode, api, false);
  updateTransition(vnode, api);
}
