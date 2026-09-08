// 预制体：嵌套、字段覆盖（overrides）、实例化、展开、序列化。
// 形式：{ name, transform, components, children:[{ref:'prefabName', transform:{position:[x,y,z]覆盖}}] }
export class Prefab {
  constructor(def) { this.def = def; }
  static fromObject(o) { return new Prefab(JSON.parse(JSON.stringify(o))); }
}

function mergeTransform(base, override) {
  if (!override) return JSON.parse(JSON.stringify(base || { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }));
  const t = JSON.parse(JSON.stringify(base || { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }));
  if (override.position) { for (let i = 0; i < 3; i++) t.position[i] += override.position[i]; }
  if (override.rotation) { for (let i = 0; i < 3; i++) t.rotation[i] += override.rotation[i]; }
  if (override.scale) { for (let i = 0; i < 3; i++) t.scale[i] *= override.scale[i]; }
  return t;
}

function composeTransform(parent, child) {
  const def = (t) => ({ position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], ...(t || {}) });
  const p = def(parent), c = def(child);
  return {
    position: [p.position[0] + c.position[0], p.position[1] + c.position[1], p.position[2] + c.position[2]],
    rotation: [p.rotation[0] + c.rotation[0], p.rotation[1] + c.rotation[1], p.rotation[2] + c.rotation[2]],
    scale: [p.scale[0] * c.scale[0], p.scale[1] * c.scale[1], p.scale[2] * c.scale[2]],
  };
}

// world 需提供：createEntity(name, transform, parentId) -> id
export function instantiate(prefab, world, registry = {}) {
  const ids = [];
  const rootDef = prefab.def;
  const rootWorld = rootDef.transform || { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
  const root = world.createEntity(rootDef.name, rootWorld, null, rootDef.components);
  ids.push(root);
  for (const child of (rootDef.children || [])) {
    let cdef, localT;
    if (child.ref) {
      const base = registry[child.ref];
      if (!base) throw new Error('prefab ref not found: ' + child.ref);
      cdef = JSON.parse(JSON.stringify(base.def));
      localT = mergeTransform(base.def.transform, child.transform);
    } else {
      cdef = child;
      localT = child.transform;
    }
    const worldT = composeTransform(rootWorld, localT);
    const cid = world.createEntity(cdef.name, worldT, root, cdef.components);
    ids.push(cid);
  }
  return ids;
}

// 展开为普通对象（不实例化，纯数据）
export function unpack(prefab) { return JSON.parse(JSON.stringify(prefab.def)); }

export function serialize(prefab) { return JSON.stringify(prefab.def, null, 2); }
