// 命令层 + 命令总线（v3 M-A / D25/D30/D34/D36）：建模与场景编辑的统一抽象。
// 设计：GUI 按钮与脚本算子（ops.*）都构造 Command 提交 CommandBus；总线负责执行、
// 压入 History、标记脏区域（dirtySet）、并供视口做增量重建。对齐 Blender「UI 与 bpy.ops 同源」。
// DOM-free、零依赖、Node 可测（红线 D/E/A：不静默失败，非法状态抛可读错误）。
import { commandHash } from '../../engine/core/hash.js';

// 命令基类：子类必须实现 do/undo/toJSON/getDirty。
export class Command {
  constructor(op, target = null, params = {}) {
    this.op = op;             // 算子名（如 'mesh.extrudeRegion' / 'transform.translate'）
    this.target = target;     // 目标对象 id（或 id 数组）
    this.params = params;     // 参数快照
    this.label = op;
  }
  // ctx 约定：{ scene, project, ... }，由总线注入。
  do(ctx) { throw new Error('Command.do 未实现: ' + this.op); }
  undo(ctx) { throw new Error('Command.undo 未实现: ' + this.op); }
  toJSON() { return { op: this.op, target: this.target, params: this.params }; }
  // D36：本命令影响的对象 id 集与脏标志，供视口增量重建。
  getDirty() { return { ids: this.target == null ? [] : [].concat(this.target), flags: { geometry: true } }; }
  hash() { return commandHash(this); }
}

// 属性回滚命令：记录 from/to，位置/颜色等连续变更走此类（近免费、可无限步）。
// apply/get 由调用方注入，undo 只需把 from 写回。
export class SetValueCommand extends Command {
  constructor(op, target, params, apply, get) {
    super(op, target, params);
    this._apply = apply;      // (ctx, value) => void
    this._get = get;          // (ctx) => currentValue
    this.from = undefined;    // do 时捕获
    this.to = params && params.value;
  }
  do(ctx) { this.from = this._get(ctx); this._apply(ctx, this.to); }
  undo(ctx) { this._apply(ctx, this.from); }
  toJSON() { return { op: this.op, target: this.target, params: this.params, from: this.from, to: this.to }; }
  getDirty() { return { ids: this.target == null ? [] : [].concat(this.target), flags: { transform: true } }; }
}

// 快照兜底命令：逆操作不显然的算子（knife/relax 等）用「执行前快照」回滚。
export class SnapshotCommand extends Command {
  constructor(op, target, params, snapshot, restore, applyFn) {
    super(op, target, params);
    this._snapshot = snapshot;  // (ctx) => serializable
    this._restore = restore;    // (ctx, snap) => void
    this._applyFn = applyFn;    // (ctx) => void  实际执行
    this._snap = null;
  }
  do(ctx) { if (this._snap == null) this._snap = this._snapshot(ctx); this._applyFn(ctx); }
  undo(ctx) { this._restore(ctx, this._snap); }
}

// 命令总线：执行、undo 栈、分组（undoGroup）、脏区域。
export class CommandBus {
  constructor(ctx, { limit = 200 } = {}) {
    this.ctx = ctx;                 // 注入命令的执行上下文 { scene, project, ... }
    this.undoStack = [];            // 元素：Command 或 Command[](组)
    this.redoStack = [];
    this.limit = limit;
    this._group = null;             // 进行中的组 { label, cmds:[] }
    this._groupDepth = 0;           // 嵌套计数（D34）
    this.dirtySet = new Set();      // D36：自上次 consumeDirty 以来受影响的对象 id
    this.dirtyFlags = { geometry: false, material: false, transform: false };
    this._listeners = new Set();
  }

  // 订阅命令提交（History/UI 可挂载）
  onCommit(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }
  _emit(cmd) { for (const fn of this._listeners) { try { fn(cmd); } catch (e) { /* 监听器异常不阻断总线 */ } } }

  // 提交并执行一个命令
  submit(cmd) {
    if (!(cmd instanceof Command)) throw new Error('CommandBus.submit: 非 Command 实例');
    cmd.do(this.ctx);
    this._markDirty(cmd);
    if (this._group) this._group.cmds.push(cmd);
    else { this.undoStack.push(cmd); if (this.undoStack.length > this.limit) this.undoStack.shift(); }
    this.redoStack.length = 0;
    this._emit(cmd);
    return cmd;
  }

  // D34：分组（undoGroup）。嵌套安全，try/finally 保证闭合。
  beginGroup(label = 'group') { if (this._groupDepth === 0) this._group = { label, cmds: [] }; this._groupDepth++; }
  endGroup() {
    if (this._groupDepth === 0) throw new Error('CommandBus.endGroup: 无进行中的组');
    this._groupDepth--;
    if (this._groupDepth === 0 && this._group) {
      const g = this._group; this._group = null;
      if (g.cmds.length > 0) { this.undoStack.push(g.cmds); if (this.undoStack.length > this.limit) this.undoStack.shift(); }
    }
  }
  get currentGroup() { return this._groupDepth > 0 ? this._group : null; }

  // 便捷：fn 内所有命令合并为单步撤销；异常时回滚已执行命令并闭合组（D34）。
  group(label, fn) {
    this.beginGroup(label);
    const startLen = this._group.cmds.length;
    try { fn(); }
    catch (e) {
      // 回滚组内已执行命令，避免半提交状态
      const done = this._group.cmds.splice(startLen);
      for (let i = done.length - 1; i >= 0; i--) { try { done[i].undo(this.ctx); } catch (_) { /* 回滚失败不掩盖原异常 */ } }
      throw e;
    }
    finally { this.endGroup(); }
  }

  _markDirty(cmd) {
    const d = cmd.getDirty ? cmd.getDirty() : { ids: [], flags: {} };
    for (const id of d.ids || []) this.dirtySet.add(id);
    if (d.flags) for (const k of Object.keys(d.flags)) if (d.flags[k]) this.dirtyFlags[k] = true;
  }

  // D36：视口调用，取走并清空脏区域。
  consumeDirty() {
    const out = { ids: new Set(this.dirtySet), flags: { ...this.dirtyFlags } };
    this.dirtySet.clear();
    this.dirtyFlags = { geometry: false, material: false, transform: false };
    return out;
  }

  canUndo() { return this.undoStack.length > 0; }
  canRedo() { return this.redoStack.length > 0; }

  undo() {
    if (!this.canUndo()) return false;
    const e = this.undoStack.pop();
    if (Array.isArray(e)) for (let i = e.length - 1; i >= 0; i--) e[i].undo(this.ctx);
    else e.undo(this.ctx);
    this.redoStack.push(e);
    this._markDirty(Array.isArray(e) ? e[0] : e);
    return true;
  }
  redo() {
    if (!this.canRedo()) return false;
    const e = this.redoStack.pop();
    if (Array.isArray(e)) for (const c of e) c.do(this.ctx);
    else e.do(this.ctx);
    this.undoStack.push(e);
    return true;
  }
  clear() { this.undoStack.length = 0; this.redoStack.length = 0; this.dirtySet.clear(); }
}
