// 模式状态机（v3 M-A / D37）：编辑器交互模式（物体/编辑：顶点/边/面）+ 快捷键路由。
// 职责：维护当前模式；DOM 层 keydown 经本模块按模式分发，避免建模快捷键与 gizmo/控制台冲突。
// DOM-free、零依赖、Node 可测。对标 Blender「Object Mode / Edit Mode(Vert/Edge/Face)」。
export const EditorMode = Object.freeze({
  OBJECT: 'OBJECT',
  EDIT_VERT: 'EDIT_VERT',
  EDIT_EDGE: 'EDIT_EDGE',
  EDIT_FACE: 'EDIT_FACE',
});
export const SelectMode = Object.freeze({ VERT: 'VERT', EDGE: 'EDGE', FACE: 'FACE' });

const EDIT_MODES = new Set([EditorMode.EDIT_VERT, EditorMode.EDIT_EDGE, EditorMode.EDIT_FACE]);

export class ModeState {
  constructor() {
    this.mode = EditorMode.OBJECT;
    this._listeners = new Set();
    // 各模式下的快捷键表：key -> commandId（由 DOM 层注册，ModeState 只路由）
    this._bindings = { OBJECT: new Map(), EDIT_VERT: new Map(), EDIT_EDGE: new Map(), EDIT_FACE: new Map() };
  }
  isEdit() { return EDIT_MODES.has(this.mode); }
  isObject() { return this.mode === EditorMode.OBJECT; }
  // 选择模式与编辑模式联动
  get selectMode() {
    if (this.mode === EditorMode.EDIT_VERT) return SelectMode.VERT;
    if (this.mode === EditorMode.EDIT_EDGE) return SelectMode.EDGE;
    if (this.mode === EditorMode.EDIT_FACE) return SelectMode.FACE;
    return null;
  }
  setMode(mode) {
    if (!EditorMode[mode]) throw new Error('非法模式: ' + mode);
    if (mode === this.mode) return false;
    const prev = this.mode; this.mode = mode;
    for (const fn of this._listeners) { try { fn(mode, prev); } catch (e) { /* 监听器异常不阻断 */ } }
    return true;
  }
  onChange(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }
  // 注册快捷键：bind('OBJECT', 'g', 'move')；返回解绑函数
  bind(mode, key, commandId) {
    if (!this._bindings[mode]) throw new Error('bind: 非法模式 ' + mode);
    this._bindings[mode].set(key, commandId);
    return () => this._bindings[mode].delete(key);
  }
  // 路由：返回当前模式下该键映射的 commandId，无映射返回 null。
  route(key) {
    const m = this._bindings[this.mode];
    if (!m) return null;
    return m.get(key) ?? null;
  }
  clearBindings(mode) { if (mode) this._bindings[mode]?.clear(); else for (const k of Object.keys(this._bindings)) this._bindings[k].clear(); }
}
