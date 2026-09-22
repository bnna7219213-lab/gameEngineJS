// 修改器栈挂载与命令化（v3 M-D / D27）：obj.modifiers=[{type,params,enabled}]，
// 渲染/导出时经 applyModifiers 惰性求值；Apply 把求值结果写回基础网格（命令化，可撤销）。
// DOM-free、零依赖、Node 可测。
import { Command } from './commands.js';
import { applyModifiers } from '../../engine/modeling/modifier.js';
import { HMesh } from '../../engine/modeling/hedit.js';
import { meshHash } from '../../engine/core/hash.js';

// 读取对象修改器栈（惰性初始化）
export function modifiersOf(obj) { return obj.modifiers || (obj.modifiers = []); }

// 求值对象网格：基础渲染网格经修改器栈求值后的派生网格。
export function evalModifiedMesh(obj, baseMesh) {
  const mods = modifiersOf(obj).filter(m => m && m.enabled !== false);
  if (!mods.length) return baseMesh;
  return applyModifiers(baseMesh, mods);
}

// ---- AddModifierCommand：向对象栈追加修改器 ----
export class AddModifierCommand extends Command {
  constructor(objId, obj, { type, params = {}, enabled = true } = {}) {
    super('modifier.add', objId, { type, params, enabled });
    this.obj = obj;
  }
  do() { modifiersOf(this.obj).push({ type: this.params.type, params: this.params.params, enabled: this.params.enabled }); }
  undo() { modifiersOf(this.obj).pop(); }
  getDirty() { return { ids: [this.target], flags: { geometry: true } }; }
}

// ---- RemoveModifierCommand：按索引删除 ----
export class RemoveModifierCommand extends Command {
  constructor(objId, obj, index) {
    super('modifier.remove', objId, { index });
    this.obj = obj; this.index = index; this._removed = null;
  }
  do() { const mods = modifiersOf(this.obj); if (this.index < 0 || this.index >= mods.length) throw new Error('modifier.remove: 索引越界 ' + this.index); this._removed = mods.splice(this.index, 1)[0]; }
  undo() { if (this._removed) modifiersOf(this.obj).splice(this.index, 0, this._removed); this._removed = null; }
  getDirty() { return { ids: [this.target], flags: { geometry: true } }; }
}

// ---- MoveModifierCommand：调整栈顺序（顺序敏感，D27）----
export class MoveModifierCommand extends Command {
  constructor(objId, obj, from, to) {
    super('modifier.move', objId, { from, to });
    this.obj = obj; this.from = from; this.to = to;
  }
  do() { this._swap(this.from, this.to); }
  undo() { this._swap(this.to, this.from); }
  _swap(a, b) {
    const mods = modifiersOf(this.obj);
    if (a < 0 || a >= mods.length || b < 0 || b >= mods.length) throw new Error('modifier.move: 索引越界');
    const [m] = mods.splice(a, 1); mods.splice(b, 0, m);
  }
  getDirty() { return { ids: [this.target], flags: { geometry: true } }; }
}

// ---- SetModifierParamCommand：改参数/开关（属性回滚）----
export class SetModifierParamCommand extends Command {
  constructor(objId, obj, index, key, value) {
    super('modifier.setParam', objId, { index, key, value });
    this.obj = obj; this.index = index; this.key = key; this.value = value; this._old = undefined;
  }
  do() {
    const mods = modifiersOf(this.obj);
    const m = mods[this.index];
    if (!m) throw new Error('modifier.setParam: 索引越界 ' + this.index);
    this._old = this.key === 'enabled' ? m.enabled : m.params[this.key];
    if (this.key === 'enabled') m.enabled = this.value; else m.params[this.key] = this.value;
  }
  undo() {
    const m = modifiersOf(this.obj)[this.index];
    if (this.key === 'enabled') m.enabled = this._old; else m.params[this.key] = this._old;
  }
  getDirty() { return { ids: [this.target], flags: { geometry: true } }; }
}

// ---- ApplyModifierCommand：把栈顶（或指定）修改器求值结果写回基础网格，并从栈移除。
// 作用于编辑模式 HMesh（meshRegistry），或对象 customGeo。逆操作 = 恢复原网格 + 恢复栈。
export class ApplyModifierCommand extends Command {
  constructor(objId, obj, meshData, index = 0) {
    super('modifier.apply', objId, { index });
    this.obj = obj; this.meshData = meshData; this.index = index;
    this._before = null; this._mod = null;
  }
  do() {
    const mods = modifiersOf(this.obj);
    if (this.index < 0 || this.index >= mods.length) throw new Error('modifier.apply: 索引越界 ' + this.index);
    // 快照基础网格（undo 恢复）
    const base = this.meshData.hmesh.toRenderMesh();
    this._before = { positions: Array.from(base.positions), normals: Array.from(base.normals), uvs: Array.from(base.uvs), indices: Array.from(base.indices), vertexCount: base.vertexCount, indexCount: base.indexCount };
    this._mod = mods[this.index];
    // 只求值到该修改器为止（含）的栈
    const upto = mods.slice(0, this.index + 1).filter(m => m.enabled !== false);
    const baked = applyModifiers(base, upto);
    // 写回 HMesh
    const restored = HMesh.fromRenderMesh(baked);
    const hm = this.meshData.hmesh;
    hm.positions = restored.positions; hm._vertAlive = restored._vertAlive; hm._liveVerts = restored._liveVerts;
    hm.edges = restored.edges; hm.faces = restored.faces; hm._liveFaces = restored._liveFaces;
    hm._liveEdges = restored._liveEdges; hm._pair = restored._pair; hm._cap = restored._cap;
    mods.splice(this.index, 1); // 从栈移除
  }
  undo() {
    if (!this._before) return;
    const rm = { positions: new Float32Array(this._before.positions), normals: new Float32Array(this._before.normals), uvs: new Float32Array(this._before.uvs), indices: new Uint32Array(this._before.indices), vertexCount: this._before.vertexCount, indexCount: this._before.indexCount };
    const restored = HMesh.fromRenderMesh(rm);
    const hm = this.meshData.hmesh;
    hm.positions = restored.positions; hm._vertAlive = restored._vertAlive; hm._liveVerts = restored._liveVerts;
    hm.edges = restored.edges; hm.faces = restored.faces; hm._liveFaces = restored._liveFaces;
    hm._liveEdges = restored._liveEdges; hm._pair = restored._pair; hm._cap = restored._cap;
    modifiersOf(this.obj).splice(this.index, 0, this._mod); // 恢复栈
    this._before = null;
  }
  getDirty() { return { ids: [this.target], flags: { geometry: true } }; }
}
