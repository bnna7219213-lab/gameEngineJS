// 组件注册表：驱动检视器的唯一事实来源（对应 C++ python/ide/registry.py）。
// 每个组件声明：标题 + 字段列表（path 相对组件数据，type 决定编辑器控件）。
// DOM-free：纯数据结构 + 查找函数，Node 下可测。
export const FIELD_TYPES = ['float', 'int', 'vec3', 'color', 'text', 'bool', 'select'];

// ---- v3 M-A / D31：扩展字段类型 + 选项卡分组（向后兼容：仅追加，不改既有 7 种语义）----
// 追加类型（检视器需按 type 渲染对应控件；未知类型回退 text）：
//   vec2       二维向量            curve      一维曲线（0..1 映射，粒子生命周期等）
//   colorRamp  颜色渐变带          meshRef    网格数据块引用
//   materialRef 材质数据块引用      textureRef 纹理资源引用
//   tabs       选项卡容器（其 fields 分组渲染，对标 Blender Properties 选项卡）
export const FIELD_TYPES_EXT = ['vec2', 'curve', 'colorRamp', 'meshRef', 'materialRef', 'textureRef', 'tabs'];
export const ALL_FIELD_TYPES = [...FIELD_TYPES, ...FIELD_TYPES_EXT];

// 选项卡定义（对标 Blender Properties 编辑器 13 选项卡；M-A 先建框架，逐阶段填充）。
export const PROPERTY_TABS = [
  { id: 'tool',      title: '工具' },
  { id: 'render',    title: '渲染' },
  { id: 'output',    title: '输出' },
  { id: 'viewlayer', title: '视图层' },
  { id: 'scene',     title: '场景' },
  { id: 'world',     title: '世界' },
  { id: 'object',    title: '物体' },
  { id: 'modifier',  title: '修改器' },
  { id: 'particle',  title: '粒子' },
  { id: 'physics',   title: '物理' },
  { id: 'constraint',title: '约束' },
  { id: 'material',  title: '材质' },
  { id: 'meshdata',  title: '网格数据' },
];
// 组件 -> 选项卡归属（检视器据此分组）。既有组件归入合理选项卡，不破坏现状。
export const COMPONENT_TAB = {
  transform: 'object', mesh: 'object', light: 'object', collider3d: 'physics', script: 'object',
  material: 'material', particle: 'particle', rigidbody: 'physics', constraint: 'constraint', modifier: 'modifier',
};
export function tabOfComponent(name) { return COMPONENT_TAB[name] || 'object'; }
export function isValidFieldType(type) { return ALL_FIELD_TYPES.includes(type); }

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
    defaults: () => ({ code: '// this = { obj, scene, dt }\\n' }),
  },
  // ---- v3 M-E：物理/粒子选项卡组件（注册表驱动检视器）----
  rigidbody: {
    title: 'Rigidbody（物理）',
    fields: [
      { key: 'mass', label: 'Mass', type: 'float', min: 0, step: 0.1 },
      { key: 'friction', label: 'Friction', type: 'float', min: 0, max: 1, step: 0.05 },
      { key: 'restitution', label: 'Restitution', type: 'float', min: 0, max: 1, step: 0.05 },
      { key: 'static', label: 'Static', type: 'bool' },
    ],
    defaults: () => ({ mass: 1, friction: 0.5, restitution: 0.3, static: false }),
  },
  particle: {
    title: 'Particle（粒子）',
    fields: [
      { key: 'rate', label: 'Rate/s', type: 'float', min: 0, step: 1 },
      { key: 'burst', label: 'Burst', type: 'int', min: 0 },
      { key: 'shape', label: 'Shape', type: 'select', options: ['point', 'sphere', 'cone', 'box', 'edge'] },
      { key: 'lifetime', label: 'Lifetime[min,max]', type: 'vec2' },
      { key: 'velocity', label: 'Velocity', type: 'vec3', step: 0.1 },
      { key: 'size', label: 'Size[start,end]', type: 'vec2' },
    ],
    defaults: () => ({ rate: 10, burst: 0, shape: 'point', lifetime: [0.6, 1.4], velocity: [0, 1, 0], size: [0.12, 0.02] }),
  },
  modifier: {
    title: 'Modifier（修改器栈）',
    fields: [
      { key: 'note', label: '修改器栈经检视器 Modifier 面板编辑', type: 'text' },
    ],
    defaults: () => ({ note: '' }),
  },
  constraint: {
    title: 'Constraint（约束）',
    fields: [
      { key: 'type', label: 'Type', type: 'select', options: ['COPY_LOCATION', 'COPY_ROTATION', 'COPY_SCALE', 'COPY_TRANSFORMS', 'TRACK_TO', 'LIMIT_LOCATION', 'LIMIT_ROTATION', 'LIMIT_SCALE'] },
      { key: 'target', label: 'Target(objId)', type: 'int' },
      { key: 'influence', label: 'Influence', type: 'float', min: 0, max: 1, step: 0.05 },
    ],
    defaults: () => ({ type: 'COPY_TRANSFORMS', target: 0, influence: 1 }),
  },
};

// ---- v3 M-F：输出选项卡字段定义（场景级，挂 project.output；非组件，故不入 registry）----
// 检视器 Output 选项卡与导出命令共用同一份定义，避免 UI 与导出逻辑漂移。
export const OUTPUT_FIELDS = [
  { key: 'format', label: '格式', type: 'select', options: ['obj', 'gltf', 'glb'] },
  { key: 'axis', label: '坐标/单位', type: 'select', options: ['YUP_M', 'YUP_CM', 'ZUP_M', 'ZUP_CM'] },
  { key: 'rotationUnit', label: '旋转单位', type: 'select', options: ['rad', 'deg'] },
];
export function defaultOutputSettings() { return { format: 'glb', axis: 'ZUP_M', rotationUnit: 'rad' }; }

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
