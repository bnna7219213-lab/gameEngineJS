// 撤销/重做：基于 Scene3D 序列化快照（对应 python/ide 的 undo 栈）。
// DOM-free。快照粒度 = 一次用户操作；push 截断 redo 分支。
export class History {
  constructor(limit = 100) { this.undoStack = []; this.redoStack = []; this.limit = limit; }
  // 在修改「前」调用，保存现场
  push(scene, label = '') {
    this.undoStack.push({ label, json: scene.serialize() });
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
  }
  canUndo() { return this.undoStack.length > 0; }
  canRedo() { return this.redoStack.length > 0; }
  // 撤销：返回应恢复的快照；当前现场压入 redo
  undo(scene, Scene3D) {
    if (!this.canUndo()) return null;
    this.redoStack.push({ label: '', json: scene.serialize() });
    const e = this.undoStack.pop();
    return Scene3D.deserialize(e.json);
  }
  redo(scene, Scene3D) {
    if (!this.canRedo()) return null;
    this.undoStack.push({ label: '', json: scene.serialize() });
    const e = this.redoStack.pop();
    return Scene3D.deserialize(e.json);
  }
  clear() { this.undoStack.length = 0; this.redoStack.length = 0; }
}

// ---- v3 M-A / D30：命令级双轨撤销 ----
// 现有 History 是「整场景 JSON 快照」，适合结构性变更（增删对象/改层级）；
// 但顶点拖拽等高频连续编辑若每帧快照会内存爆炸（H3）。
// CommandHistory 改为挂到 CommandBus：只记录命令的逆操作，undo 时逐命令回滚。
// 两者并行：结构性变更仍走 History 快照，连续编辑走 CommandHistory。
import { CommandBus } from './modeling/commands.js';

export class CommandHistory {
  constructor(bus, { limit = 200 } = {}) {
    if (!(bus instanceof CommandBus)) throw new Error('CommandHistory: 需要 CommandBus 实例');
    this.bus = bus;
    this.limit = limit;
    // 复用 bus 的 undoStack/redoStack，不另存（总线即真相来源）。
  }
  canUndo() { return this.bus.canUndo(); }
  canRedo() { return this.bus.canRedo(); }
  undo() { return this.bus.undo(); }
  redo() { return this.bus.redo(); }
  clear() { this.bus.clear(); }
}