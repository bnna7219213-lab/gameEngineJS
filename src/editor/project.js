// 工程管理：多场景打开状态 + 资产目录 + 持久化（localStorage / 导入导出 JSON）。
// DOM-free（storage 通过参数注入，Node 下可用内存存根）。
import { Scene3D, GameObject3D } from '../engine/platform/scene3d.js';

export class Project {
  constructor({ name = 'untitled', storage = null } = {}) {
    this.name = name;
    this.scenes = new Map();      // sceneName -> Scene3D
    this.activeScene = null;      // sceneName
    this.assets = new Map();      // assetPath -> { kind, data }
    this.storage = storage || memoryStorage();
  }
  createScene(name) {
    const s = new Scene3D(); s.name = name;
    this.scenes.set(name, s);
    if (!this.activeScene) this.activeScene = name;
    return s;
  }
  scene(name = this.activeScene) { return this.scenes.get(name) || null; }
  closeScene(name) {
    if (!this.scenes.has(name)) return false;
    this.scenes.delete(name);
    if (this.activeScene === name) this.activeScene = this.scenes.keys().next().value || null;
    return true;
  }
  renameScene(oldName, newName) {
    const s = this.scenes.get(oldName); if (!s || this.scenes.has(newName)) return false;
    this.scenes.delete(oldName); s.name = newName; this.scenes.set(newName, s);
    if (this.activeScene === oldName) this.activeScene = newName;
    return true;
  }
  addAsset(path, kind, data) { this.assets.set(path, { kind, data }); }
  removeAsset(path) { return this.assets.delete(path); }
  listAssets(kind = null) {
    const out = [];
    for (const [p, a] of this.assets) if (!kind || a.kind === kind) out.push({ path: p, kind: a.kind });
    return out.sort((a, b) => a.path < b.path ? -1 : 1);
  }
  // 生成一个新对象并加入活动场景；返回对象
  spawn(name, { position = [0, 0, 0], components = {} } = {}) {
    const s = this.scene(); if (!s) return null;
    const obj = new GameObject3D(name);
    obj.transform.position = [...position];
    obj.components = components;
    s.add(obj);
    return obj;
  }
  serialize() {
    const scenes = {};
    for (const [n, s] of this.scenes) scenes[n] = JSON.parse(s.serialize());
    const assets = {};
    for (const [p, a] of this.assets) assets[p] = a;
    return JSON.stringify({ name: this.name, activeScene: this.activeScene, scenes, assets }, null, 2);
  }
  static deserialize(json, opts = {}) {
    const d = JSON.parse(json);
    const p = new Project({ name: d.name, storage: opts.storage });
    for (const n in d.scenes) { const s = Scene3D.deserialize(JSON.stringify(d.scenes[n])); s.name = n; p.scenes.set(n, s); }
    p.activeScene = d.activeScene;
    for (const ap in (d.assets || {})) p.assets.set(ap, d.assets[ap]);
    return p;
  }
  save() { this.storage.setItem('project:' + this.name, this.serialize()); }
  static load(name, opts = {}) {
    const st = opts.storage || memoryStorage();
    const j = st.getItem('project:' + name);
    return j ? Project.deserialize(j, opts) : null;
  }
  static listSaved(storage) {
    const st = storage || memoryStorage(); const out = [];
    for (let i = 0; i < st.length; i++) { const k = st.key(i); if (k && k.startsWith('project:')) out.push(k.slice(8)); }
    return out;
  }
}

export function memoryStorage() {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: k => { m.delete(k); },
    key: i => [...m.keys()][i],
    get length() { return m.size; },
  };
}
