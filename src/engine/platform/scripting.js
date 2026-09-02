// 脚本宿主：事件总线 + 沙箱（脚本只能通过 context 访问世界）+ stepScripts。
export class ScriptContext {
  constructor() { this.scripts = []; this.bus = {}; }
  register(obj) { if (obj && typeof obj === 'object') this.scripts.push(obj); return obj; }
  on(evt, fn) { (this.bus[evt] || (this.bus[evt] = [])).push(fn); }
  emit(evt, data) { for (const fn of (this.bus[evt] || [])) fn(data); }
  // 沙箱世界：脚本只能经由这些方法与外界交互
  createWorld() {
    const self = this;
    return {
      emit: (e, d) => self.emit(e, d),
      on: (e, f) => self.on(e, f),
      addEntity: (name) => ({ id: 'e' + (self._ec = (self._ec || 0) + 1), name }),
      log: (m) => self.emit('log', m),
    };
  }
  stepScripts(dt) { for (const s of this.scripts) if (s.onUpdate) s.onUpdate(dt, this.createWorld()); }
  collision(a, b) { for (const s of this.scripts) if (s.onCollision) s.onCollision(a, b); }
}
