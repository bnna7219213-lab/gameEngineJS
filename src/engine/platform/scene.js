// 2D 场景数据模型：GameObject + Scene（增删、按 id/name 查询、JSON 序列化）。
let _sid = 0;
export function nid() { return ++_sid; }

export class GameObject {
  constructor(name, transform = null, parent = null) {
    this.id = nid();
    this.name = name;
    this.transform = transform || { x: 0, y: 0, rot: 0, scaleX: 1, scaleY: 1 };
    this.parent = parent;
    this.components = {};
    this.material = null;
    this.scripts = [];
    this.children = [];
  }
}

export class Scene {
  constructor() { this.objects = new Map(); }
  add(obj, parentId = null) {
    this.objects.set(obj.id, obj);
    if (parentId != null) { const p = this.objects.get(parentId); if (p) { obj.parent = p; p.children.push(obj.id); } }
  }
  remove(id) {
    const o = this.objects.get(id); if (!o) return;
    for (const c of o.children) this.remove(c);
    this.objects.delete(id);
  }
  get(id) { return this.objects.get(id); }
  findByName(name) { for (const o of this.objects.values()) if (o.name === name) return o; return null; }
  serialize() {
    const out = { objects: {} };
    for (const [id, o] of this.objects) out.objects[id] = { name: o.name, transform: o.transform, components: o.components, material: o.material, scripts: o.scripts, parent: o.parent ? o.parent.id : null };
    return JSON.stringify(out, null, 2);
  }
  static deserialize(json) {
    const s = new Scene(); const d = JSON.parse(json);
    for (const k in d.objects) { const o = d.objects[k]; const go = new GameObject(o.name, o.transform); go.components = o.components || {}; go.material = o.material || null; go.scripts = o.scripts || []; s.objects.set(+k, go); }
    for (const k in d.objects) { const o = d.objects[k]; const go = s.objects.get(+k); if (o.parent != null) { const p = s.objects.get(o.parent); if (p) { go.parent = p; p.children.push(go.id); } } }
    return s;
  }
}
