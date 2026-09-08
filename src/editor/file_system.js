// 代码工作台文件系统适配（文件树 / OPFS 持久化，P5#3 深化）：
//  - InMemoryFileSystem：纯内存，Node 单测友好（红线 E：无外部依赖时退化为内存态）。
//  - OPFSFileSystem：浏览器 OPFS（navigator.storage.getDirectory），异步、特性探测后启用。
//  - buildFileTree：把扁平路径列表转为嵌套树，供文件树 UI 渲染。
// 统一接口（同步用 InMemory，异步用 OPFS）：read/write/list。

export class InMemoryFileSystem {
  constructor(initial = {}) { this.files = Object.assign({}, initial); }
  read(path) { return Object.prototype.hasOwnProperty.call(this.files, path) ? this.files[path] : null; }
  write(path, content) { this.files[path] = content; }
  list() { return Object.keys(this.files); }
}

// OPFS 适配：路径以 '/' 分段的虚拟目录结构，映射为 OPFS 文件。全部异步（OPFS 原生 API）。
export class OPFSFileSystem {
  constructor(rootName = 'codeworkbench') { this.rootName = rootName; this._root = null; }
  async _root() {
    if (this._root) return this._root;
    const dir = await navigator.storage.getDirectory();
    this._root = await dir.getDirectoryHandle(this.rootName, { create: true });
    return this._root;
  }
  async _navigate(path, create) {
    const root = await this._root();
    const parts = path.split('/').filter(Boolean);
    let d = root;
    for (let i = 0; i < parts.length - 1; i++) d = await d.getDirectoryHandle(parts[i], { create });
    return { dir: d, file: parts[parts.length - 1] };
  }
  async read(path) {
    try { const { dir, file } = await this._navigate(path, false); const h = await dir.getFileHandle(file); const f = await h.getFile(); return await f.text(); }
    catch { return null; }
  }
  async write(path, content) {
    const { dir, file } = await this._navigate(path, true);
    const h = await dir.getFileHandle(file, { create: true });
    const f = await h.createWritable();
    await f.write(content); await f.close();
  }
  async list() {
    const out = []; const root = await this._root();
    const walk = async (d, prefix) => {
      for await (const [name, h] of d.entries()) {
        if (h.kind === 'file') out.push(prefix + name);
        else await walk(h, prefix + name + '/');
      }
    };
    await walk(root, '');
    return out;
  }
}

// 工厂：优先 OPFS（浏览器且支持时），否则内存态。OPFS 为异步——调用方用 await fs.write/read。
export function createFileSystem() {
  if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.getDirectory === 'function') {
    try { return new OPFSFileSystem(); } catch { /* fall through */ }
  }
  return new InMemoryFileSystem();
}

// 把扁平路径数组（含可选 content）转为嵌套树：
//   [{ path:'a/b.js', content:'...' }] -> { dirs:{ a:{ files:[{name:'b.js',path:...,content:...}] } }, files:[...] }
export function buildFileTree(items) {
  const root = { name: '', dirs: {}, files: [] };
  for (const it of items) {
    const path = it.path || it;
    const parts = String(path).split('/').filter(Boolean);
    const fileName = parts[parts.length - 1];
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i];
      if (!node.dirs[seg]) node.dirs[seg] = { name: seg, dirs: {}, files: [] };
      node = node.dirs[seg];
    }
    node.files.push({ name: fileName, path, content: it.content != null ? it.content : null });
  }
  // 排序：目录在前、文件在后，均按名升序
  const sortNode = (n) => {
    n.files.sort((a, b) => a.name.localeCompare(b.name));
    for (const k of Object.keys(n.dirs)) sortNode(n.dirs[k]);
  };
  sortNode(root);
  return root;
}
