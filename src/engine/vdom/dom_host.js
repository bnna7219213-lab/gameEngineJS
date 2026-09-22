// 真实 DOM host —— 把 vdom diff 接到浏览器 document（仅 src/editor/** 允许触碰 DOM 的边界之外
// 也可在 Node 下用「mock host」测试，见 tests/vdom_mock_host.js）。
// 与 Vue2 web runtime 的 nodeOps 一一对应；样式/类/事件直接写 DOM。
// 注意：本文件属 engine/vdom，但因**只在被调用时**才接触 document（模块级不引用 DOM），
// 仍满足「引擎层禁止引用 DOM」的导入期约束（红线 C：import 不得触发副作用）。

export function createDomHost(documentRef = null) {
  const doc = documentRef || (typeof document !== 'undefined' ? document : null);
  if (!doc) throw new Error('createDomHost: 需要 document（浏览器环境或注入 mock）');

  const api = {
    tagName(node) { return node.tagName; },
    parentNode(node) { return node.parentNode; },
    nextSibling(node) { return node.nextSibling; },
    createElement(tag) { return doc.createElement(tag); },
    createTextNode(text) { return doc.createTextNode(text); },
    createComment(text) { return doc.createComment(text); },
    appendChild(parent, child) { parent.appendChild(child); },
    insertBefore(parent, newNode, refNode) { parent.insertBefore(newNode, refNode); },
    removeChild(parent, child) { parent.removeChild(child); },
    setTextContent(node, text) { node.textContent = text; },
    setAttribute(node, key, val) { node.setAttribute(key, val); },
    removeAttribute(node, key) { node.removeAttribute(key); },

    // modules.js 调用面
    setClass(node, cls) { node.className = cls; },
    setStyle(node, key, val) {
      if (val === '') node.style.removeProperty(key);
      else node.style[key] = val;
    },
    setAttr(node, key, val) { node.setAttribute(key, val); },
    removeAttr(node, key) { node.removeAttribute(key); },
    setProp(node, key, val) {
      try { node[key] = val; } catch (_) { node.setAttribute(key, val); }
    },
    addEvent(node, name, fn, params) {
      const opts = params ? params.split('.').reduce((o, p) => (o[p] = true, o), {}) : false;
      node.addEventListener(name, fn, opts);
      fn.__domOpts = opts;
    },
    removeEvent(node, name, fn) { node.removeEventListener(name, fn, fn.__domOpts || false); },
    applyDirective(node, dir) { /* DOM host 不内置指令语义；v-model 等由业务层消费 */ },
  };
  return api;
}

// Mock host（Node 测试用）：极简 DOM 语义实现，验证 diff 算法不依赖真实浏览器。
// 结构：{ tagName, parentNode, childNodes[], attrs{}, style{}, listeners{} }
export function createMockHost() {
  function makeEl(tag) {
    const isText = tag === '#text' || tag === '#comment';
    return {
      tagName: isText ? tag : tag.toUpperCase(),   // 元素节点模拟 DOM 大写 tagName；文本/注释保留原名
      nodeType: tag === '#text' ? 3 : (tag === '#comment' ? 8 : 1),
      parentNode: null,
      childNodes: [],
      textContent: '',
      className: '',
      style: {},
      attrs: {},
      listeners: {},
      get nextSibling() {
        const p = this.parentNode;
        if (!p) return null;
        const i = p.childNodes.indexOf(this);
        return i >= 0 && i + 1 < p.childNodes.length ? p.childNodes[i + 1] : null;
      },
      setAttribute(k, v) { this.attrs[k] = v; },
      removeAttribute(k) { delete this.attrs[k]; },
      appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; this.childNodes.push(c); },
      insertBefore(c, ref) {
        if (c.parentNode) c.parentNode.removeChild(c);
        c.parentNode = this;
        if (!ref) { this.childNodes.push(c); return; }
        const i = this.childNodes.indexOf(ref);
        if (i >= 0) this.childNodes.splice(i, 0, c);
        else this.childNodes.push(c);
      },
      removeChild(c) {
        const i = this.childNodes.indexOf(c);
        if (i >= 0) { this.childNodes.splice(i, 1); c.parentNode = null; }
      },
      addEventListener(n, f) { (this.listeners[n] = this.listeners[n] || []).push(f); },
      removeEventListener(n, f) { const l = this.listeners[n]; if (l) { const i = l.indexOf(f); if (i >= 0) l.splice(i, 1); } },
    };
  }
  const api = {
    tagName(n) { return n.tagName; },
    parentNode(n) { return n.parentNode; },
    nextSibling(n) { return n.nextSibling; },
    createElement(tag) { return makeEl(tag); },
    createTextNode(t) { const n = makeEl('#text'); n.textContent = t; return n; },
    createComment(t) { const n = makeEl('#comment'); n.textContent = t; return n; },
    appendChild(p, c) { p.appendChild(c); },
    insertBefore(p, c, r) { p.insertBefore(c, r); },
    removeChild(p, c) { p.removeChild(c); },
    setTextContent(n, t) { n.textContent = t; },
    setAttribute(n, k, v) { n.setAttribute(k, v); },
    removeAttribute(n, k) { n.removeAttribute(k); },
    setClass(n, c) { n.className = c; },
    setStyle(n, k, v) { if (v === '') delete n.style[k]; else n.style[k] = v; },
    setAttr(n, k, v) { n.setAttribute(k, v); },
    removeAttr(n, k) { n.removeAttribute(k); },
    setProp(n, k, v) { n[k] = v; },
    addEvent(n, name, fn) { n.addEventListener(name, fn); },
    removeEvent(n, name, fn) { n.removeEventListener(name, fn); },
    applyDirective() {},
  };
  return api;
}
