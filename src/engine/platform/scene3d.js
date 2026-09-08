// 3D 场景数据模型：GameObject3D + Scene3D（含 3D 组件；parent 字段仅当非 None 落盘）。
let _id = 0;
export function nextId3d() { return ++_id; }

export class GameObject3D {
  constructor(name, transform = null) {
    this.id = nextId3d();
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
  remove(id) { this.objects.delete(id); }
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
    for (const idStr in d.objects) { const o = d.objects[idStr]; const obj = new GameObject3D(o.name, o.transform); obj.components = o.components || {}; obj.material = o.material || null; obj.scripts = o.scripts || []; s.objects.set(+idStr, obj); }
    for (const idStr in d.objects) { const o = d.objects[idStr]; if (o.parent != null) { const child = s.objects.get(+idStr); const p = s.objects.get(o.parent); if (p) { child.parent = p; if (!p.children) p.children = []; p.children.push(child.id); } } }
    return s;
  }
}
