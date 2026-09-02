// 组件注册表：驱动检视器的唯一事实来源（对应 C++ python/ide/registry.py）。
// 每个组件声明：标题 + 字段列表（path 相对组件数据，type 决定编辑器控件）。
// DOM-free：纯数据结构 + 查找函数，Node 下可测。
export const FIELD_TYPES = ['float', 'int', 'vec3', 'color', 'text', 'bool', 'select'];

export const registry = {
  transform: {
    title: 'Transform',
    builtin: true, // transform 存在 GameObject3D.transform 上而非 components
    fields: [
      { key: 'position', label: 'Position', type: 'vec3', step: 0.1 },
      { key: 'rotation', label: 'Rotation (deg)', type: 'vec3', step: 1 },
      { key: 'scale', label: 'Scale', type: 'vec3', step: 0.1 },
    ],
  },
  mesh: {
    title: 'Mesh Renderer',
    fields: [
      { key: 'shape', label: 'Shape', type: 'select', options: ['cube', 'sphere', 'plane', 'cylinder'] },
      { key: 'albedo', label: 'Albedo', type: 'color' },
      { key: 'rough', label: 'Roughness', type: 'float', min: 0, max: 1, step: 0.05 },
      { key: 'metal', label: 'Metallic', type: 'float', min: 0, max: 1, step: 0.05 },
      { key: 'emissive', label: 'Emissive', type: 'color' },
    ],
    defaults: () => ({ shape: 'cube', albedo: [200, 200, 200], rough: 0.8, metal: 0, emissive: [0, 0, 0] }),
  },
  light: {
    title: 'Light',
    fields: [
      { key: 'kind', label: 'Kind', type: 'select', options: ['directional', 'point', 'spot'] },
      { key: 'color', label: 'Color', type: 'color' },
      { key: 'intensity', label: 'Intensity', type: 'float', min: 0, step: 0.1 },
    ],
    defaults: () => ({ kind: 'point', color: [255, 244, 214], intensity: 1 }),
  },
  collider3d: {
    title: 'Collider 3D',
    fields: [
      { key: 'shape', label: 'Shape', type: 'select', options: ['box', 'sphere'] },
      { key: 'size', label: 'Size', type: 'vec3', step: 0.1 },
    ],
    defaults: () => ({ shape: 'box', size: [1, 1, 1] }),
  },
  script: {
    title: 'Script',
    fields: [
      { key: 'code', label: 'onUpdate(dt) 代码体', type: 'text', multiline: true },
    ],
    defaults: () => ({ code: '// this = { obj, scene, dt }\n' }),
  },
};

// 列出某对象当前拥有的组件名（transform 恒在首位）
export function componentsOf(obj) {
  const names = ['transform'];
  for (const k of Object.keys(obj.components || {})) if (registry[k]) names.push(k);
  return names;
}

// 可添加的组件（对象尚未拥有且在注册表中非 builtin）
export function addableComponents(obj) {
  return Object.keys(registry).filter(k => !registry[k].builtin && !(obj.components || {})[k]);
}

// 读组件数据（transform 走 obj.transform）
export function getComponent(obj, name) {
  if (name === 'transform') return obj.transform;
  return (obj.components || {})[name] || null;
}

// 写组件字段；返回是否成功
export function setField(obj, name, key, value) {
  const c = getComponent(obj, name);
  if (!c) return false;
  c[key] = value;
  return true;
}

// 添加组件（用 defaults）
export function addComponent(obj, name) {
  const def = registry[name];
  if (!def || def.builtin) return false;
  if (!obj.components) obj.components = {};
  if (obj.components[name]) return false;
  obj.components[name] = def.defaults ? def.defaults() : {};
  return true;
}

// 移除组件
export function removeComponent(obj, name) {
  if (!obj.components || !obj.components[name] || registry[name]?.builtin) return false;
  delete obj.components[name];
  return true;
}
