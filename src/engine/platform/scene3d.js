// 3D 场景数据模型：GameObject3D + Scene3D（含 3D 组件；parent 字段仅当非 None 落盘）。
// M-A0 修复：H1 反序列化 id 分裂 / H2 children 双向腐化。
let _id = 0;
export function nextId3d() { return ++_id; }

export class GameObject3D {
  constructor(name, transform = null, id = null) {
    // H1 修复：允许显式传入 id（反序列化时恢复原 id），否则自增。
    // 传入 id 时同步推进 _id 计数器，避免后续新建对象与恢复 id 冲突。
    if (id != null) { this.id = id; if (id > _id) _id = id; }
    else this.id = nextId3d();
    this.name = name;
    this.transform = transform || { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
    this.parent = null;
    this.components = {}; // mesh / collider3d / light / ecs
    this.material = null;
    this.scripts = [];
    this.children = [];
  }
}

export class Scene3D {
  constructor() { this.objects = new Map(); this.name = 'scene'; }
  add(obj, parentId = null) {
    this.objects.set(obj.id, obj);
    if (parentId != null) { const p = this.objects.get(parentId); if (p) { obj.parent = p; if (!p.children) p.children = []; p.children.push(obj.id); } }
  }
  remove(id) {
    // H2 修复：删除对象时同步清理其父对象 children[]，避免残留野指针。
    const o = this.objects.get(id);
    if (o && o.parent && Array.isArray(o.parent.children)) {
      const i = o.parent.children.indexOf(id);
      if (i >= 0) o.parent.children.splice(i, 1);
      o.parent = null;
    }
    this.objects.delete(id);
  }
  // 递归删除对象及其全部子孙（拓扑编辑/命令层删除子树用）。
  removeRecursive(id) {
    const o = this.objects.get(id);
    if (!o) return;
    for (const cid of [...(o.children || [])]) this.removeRecursive(cid);
    this.remove(id);
  }
  get(id) { return this.objects.get(id); }
  findByName(name) { for (const o of this.objects.values()) if (o.name === name) return o; return null; }
  serialize() {
    const out = { objects: {} };
    for (const [id, o] of this.objects) {
      const j = { name: o.name, transform: o.transform, components: o.components, material: o.material, scripts: o.scripts };
      if (o.parent) j.parent = o.parent.id; // 红线：仅当非 None 才落盘
      out.objects[id] = j;
    }
    return JSON.stringify(out, null, 2);
  }
  static deserialize(json) {
    const s = new Scene3D(); const d = JSON.parse(json);
    // H1 修复：用原 id 构造对象（传入 id 参数），保证内存 id == 序列化 id，
    // 使命令层/引用可按 id 稳定索引（undo 后不断裂）。
    for (const idStr in d.objects) { const o = d.objects[idStr]; const obj = new GameObject3D(o.name, o.transform, +idStr); obj.components = o.components || {}; obj.material = o.material || null; obj.scripts = o.scripts || []; s.objects.set(+idStr, obj); }
    for (const idStr in d.objects) { const o = d.objects[idStr]; if (o.parent != null) { const child = s.objects.get(+idStr); const p = s.objects.get(o.parent); if (p) { child.parent = p; if (!p.children) p.children = []; p.children.push(child.id); } } }
    return s;
  }
}
