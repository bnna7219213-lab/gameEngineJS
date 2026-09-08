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
