// 代码工作台 v1（P5#3）：JS tokenizer + 语法高亮（自研，零依赖）+ 多 Tab/文件树 + Ctrl+S 保存触发热重载。
// tokenizer 为纯逻辑，可 Node 单测；UI 适配浏览器 DOM（mount 由编辑器调用）。红线 E：无文件系统依赖时退化为内存态。
import { buildFileTree, InMemoryFileSystem } from './file_system.js';

const KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do',
  'switch', 'case', 'break', 'continue', 'new', 'class', 'extends', 'super', 'this',
  'import', 'export', 'from', 'default', 'async', 'await', 'yield', 'try', 'catch',
  'finally', 'throw', 'typeof', 'instanceof', 'in', 'of', 'void', 'delete',
  'null', 'undefined', 'true', 'false', 'NaN', 'Infinity',
]);

// 词法分析：返回 [{ type, value, start, end }]，type ∈ ws|comment|string|number|keyword|ident|punct
export function tokenizeJS(src) {
  const toks = [];
  let i = 0; const n = src.length;
  const isIdStart = c => /[A-Za-z_$]/.test(c);
  const isId = c => /[A-Za-z0-9_$]/.test(c);
  const isDigit = c => /[0-9]/.test(c);
  while (i < n) {
    const c = src[i];
    if (/\s/.test(c)) { let j = i; while (j < n && /\s/.test(src[j])) j++; toks.push({ type: 'ws', value: src.slice(i, j), start: i, end: j }); i = j; continue; }
    if (c === '/' && src[i + 1] === '/') { let j = i; while (j < n && src[j] !== '\n') j++; toks.push({ type: 'comment', value: src.slice(i, j), start: i, end: j }); i = j; continue; }
    if (c === '/' && src[i + 1] === '*') { let j = i + 2; while (j < n && !(src[j] === '*' && src[j + 1] === '/')) j++; j = Math.min(n, j + 2); toks.push({ type: 'comment', value: src.slice(i, j), start: i, end: j }); i = j; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; let j = i + 1;
      while (j < n && src[j] !== q) { if (src[j] === '\\') j++; j++; }
      j = Math.min(n, j + 1); toks.push({ type: 'string', value: src.slice(i, j), start: i, end: j }); i = j; continue;
    }
    if (isDigit(c) || (c === '.' && isDigit(src[i + 1]))) {
      let j = i; while (j < n && /[0-9.eExXa-fA-F_]/.test(src[j])) j++; toks.push({ type: 'number', value: src.slice(i, j), start: i, end: j }); i = j; continue;
    }
    if (isIdStart(c)) {
      let j = i; while (j < n && isId(src[j])) j++;
      const w = src.slice(i, j);
      toks.push({ type: KEYWORDS.has(w) ? 'keyword' : 'ident', value: w, start: i, end: j }); i = j; continue;
    }
    toks.push({ type: 'punct', value: c, start: i, end: i + 1 }); i++;
  }
  return toks;
}

// 转高亮 HTML：按 token 类型套 class（零依赖，仅静态样式；换行保留）
export function highlightToHTML(src) {
  return highlightToLines(src).join('\n');
}

// 按行高亮：返回每行 HTML 字符串数组（用于逐行渲染 + 错误行标红，C 功能）。
export function highlightToLines(src) {
  const cls = { keyword: 'kw', string: 'str', comment: 'cmt', number: 'num', ident: 'id', punct: 'pn' };
  const lines = [''];
  let li = 0;
  for (const t of tokenizeJS(src)) {
    if (t.type === 'ws') {
      const parts = t.value.split('\n');
      for (let i = 0; i < parts.length; i++) {
        if (i > 0) { li++; lines[li] = ''; }
        lines[li] += esc(parts[i]);
      }
    } else {
      const c = cls[t.type] || 'pn';
      lines[li] += `<span class="tok-${c}">${esc(t.value)}</span>`;
    }
  }
  return lines;
}

function esc(s) { return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

// 代码编辑器模型：多 Tab + 文件树适配 + 保存回调（热重载钩子）。DOM 挂载由 mount() 完成（浏览器侧）。
export class CodeEditor {
  constructor(opts = {}) {
    this.tabs = [];           // { name, path, content }
    this.active = null;
    this.onSave = opts.onSave || null;            // (path, content) => void（热重载钩子）
    this.fileSystem = opts.fileSystem || new InMemoryFileSystem(); // VFS/OPFS 适配（缺省内存态，红线 E）
    this.fileTree = null;                            // buildFileTree 结果（文件树 UI 用）
    this._listeners = [];
  }
  on(cb) { this._listeners.push(cb); }            // 内容变更通知（编辑器订阅刷新）
  _emit() { for (const cb of this._listeners) cb(this.active); }
  openFile(path, content) {
    let tab = this.tabs.find(t => t.path === path);
    if (tab) { this.active = tab; return tab; }
    tab = { name: path.split('/').pop(), path, content: content || '' };
    this.tabs.push(tab); this.active = tab; return tab;
  }
  // 从文件系统读取并打开（OPFS 为异步；内存态同步返回 Promise）
  async openFromFS(path) {
    if (this.fileSystem && this.fileSystem.read) {
      const c = await this.fileSystem.read(path);
      if (c != null) { this.openFile(path, c); return true; }
    }
    return false;
  }
  // 由扁平文件列表构建文件树（供 UI 渲染）
  setTree(items) { this.fileTree = buildFileTree(items); return this.fileTree; }
  setContent(content) { if (this.active) { this.active.content = content; this._emit(); } }
  getContent() { return this.active ? this.active.content : ''; }
  closeTab(path) {
    this.tabs = this.tabs.filter(t => t.path !== path);
    if (this.active && this.active.path === path) this.active = this.tabs[0] || null;
  }
  // Ctrl+S：持久化（经 fileSystem；OPFS 异步则 fire-and-forget）+ 触发热重载。onSave 同步触发便于测试与即时重载。
  save() {
    if (!this.active) return false;
    const { path, content } = this.active;
    if (this.fileSystem && this.fileSystem.write) {
      const r = this.fileSystem.write(path, content);
      if (r && typeof r.then === 'function') r.catch(e => console.error('[code-editor] fs write failed', e));
    }
    if (this.onSave) this.onSave(path, content);
    return true;
  }
  // 括号配对：返回与给定位置字符匹配的另一括号位置（-1 无配对）。基于 token 扫描（编辑器可升级为 AST 级）。
  matchBracket(content, pos) {
    const open = '{[('; const close = '}])';
    const c = content[pos];
    if (open.includes(c)) { let depth = 0; for (let k = pos; k < content.length; k++) { if (open.includes(content[k])) depth++; else if (close.includes(content[k])) { depth--; if (depth === 0) return k; } } }
    if (close.includes(c)) { let depth = 0; for (let k = pos; k >= 0; k--) { if (close.includes(content[k])) depth++; else if (open.includes(content[k])) { depth--; if (depth === 0) return k; } } }
    return -1;
  }
}
