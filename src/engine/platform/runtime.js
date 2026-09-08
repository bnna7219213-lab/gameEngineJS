// 游戏运行时：固定步长 60Hz、脚本 onUpdate、输入分发、生命周期、物理步进、热重载、断点、计时器、生成/碰撞查询。
// 红线 F：物理只回写运行时内部实体表，绝不反向改写传入的 Scene3D（生成对象也只增在运行时快照内）。
import { compileObjectScript, createEntityApi } from '../../editor/script_compiler.js';
import { GameObject3D } from './scene3d.js';

export class GameRuntime {
  constructor(opts = {}) {
    this.fixedDt = 1 / 60;
    this.acc = 0;
    this.time = 0;
    this.scripts = [];
    this.input = { keys: new Set(), mouse: { x: 0, y: 0, down: false } };
    this.entities = [];
    this._prev = new Map();
    this.started = false;
    this.logBuffer = [];   // debug 控制台日志缓冲（脚本 api.log 写入）
    this.maxLog = 200;
    // —— 新增：事件总线 / 计时器 / 生成 / 断点 ——
    this.sceneRef = null;            // 运行时的场景快照引用（spawn/despawn 需要）
    this._handlers = {};             // entityId -> { keydown:[], keyup:[], mousedown:[], mouseup:[], mousemove:[] }
    this.keyEvents = [];             // DOM 推入的键盘事件队列 { type, key }
    this.mouseEvents = [];           // DOM 推入的鼠标事件队列 { type, data:{x,y} }
    this._timers = [];               // { t, cb, entityId }
    this.breakRequested = false;     // 命中断点后置位，阻止后续帧推进
    this.breakInfo = null;           // { entityId, msg, time }
    this._spawnSeq = 0;
  }
  attachScene3d(scene3d) {
    this.entities = [];
    this._prev = new Map();
    this.sceneRef = scene3d;
    this._handlers = {};
    this.keyEvents = []; this.mouseEvents = [];
    this._timers = [];
    this.breakRequested = false; this.breakInfo = null;
    for (const o of scene3d.objects.values()) {
      const t = JSON.parse(JSON.stringify(o.transform)); // 深拷贝，独立维护
      this.entities.push({ id: o.id, name: o.name, transform: t, vel: [0, 0, 0], parent: o.parent ? o.parent.id : null });
      this._prev.set(o.id, JSON.parse(JSON.stringify(t)));
    }
  }
  addScript(s) { this.scripts.push(s); }
  // debug 日志：脚本 api.log 调用，写入环形缓冲供调试面板读取
  log(msg) { this.logBuffer.push({ t: +this.time.toFixed(3), msg: String(msg) }); if (this.logBuffer.length > this.maxLog) this.logBuffer.shift(); }
  setInput(key, down) { if (down) this.input.keys.add(key); else this.input.keys.delete(key); }
  start() {
    this.started = true;
    this.breakRequested = false; this.breakInfo = null;
    this._timers = [];
    for (const s of this.scripts) if (s.onStart) s.onStart(this);
  }
  update(realDtMs) {
    this.acc += Math.min(0.1, realDtMs / 1000);
    let steps = 0;
    while (this.acc >= this.fixedDt && steps < 5) {
      if (this.breakRequested) { this.acc = 0; break; }   // 断点命中点：停止推进
      this.fixedStep(this.fixedDt); this.acc -= this.fixedDt; steps++;
    }
  }
  fixedStep(dt) {
    this.time += dt;
    this._handlers = {};   // 每帧重建监听：脚本在 onUpdate 内 onKeyDown 注册，避免回调累积
    for (const s of this.scripts) { if (this.breakRequested) break; if (s.onUpdate) s.onUpdate(dt, this.input); }
    this._dispatchEvents(dt);  // 派发本帧（已注册的）输入事件
    // 计时器到期触发
    if (this._timers.length) {
      for (const tm of this._timers) tm.t -= dt;
      const due = this._timers.filter(t => t.t <= 0);
      if (due.length) {
        this._timers = this._timers.filter(t => t.t > 0);
        for (const t of due) { const api = createEntityApi(this, t.entityId); api.dt = dt; api.input = this.input; try { t.cb.call(api); } catch (e) { console.error('[timer]', e); } }
      }
    }
    if (!this.breakRequested) this.stepPhysics(dt);
    for (const e of this.entities) this._prev.set(e.id, JSON.parse(JSON.stringify(e.transform)));
  }
  stepPhysics(dt) {
    for (const e of this.entities) {
      e.transform.position[1] += e.vel[1] * dt;
      e.vel[1] -= 9.8 * dt;
      if (e.transform.position[1] < 0) { e.transform.position[1] = 0; e.vel[1] = 0; }
    }
  }
  getRuntimeTransform(id) { const e = this.entities.find(x => x.id === id); return e ? e.transform : null; }
  // —— 输入事件总线 ——
  registerHandler(entityId, cat, cb) {
    if (!this._handlers[entityId]) this._handlers[entityId] = { keydown: [], keyup: [], mousedown: [], mouseup: [], mousemove: [] };
    if (this._handlers[entityId][cat]) this._handlers[entityId][cat].push(cb);
  }
  pushKey(type, key) { this.keyEvents.push({ type, key }); }
  pushMouse(type, data) { this.mouseEvents.push({ type, data }); }
  _dispatchEvents(dt) {
    const fire = (cat, arg) => {
      for (const id in this._handlers) {
        const arr = this._handlers[id][cat]; if (!arr || !arr.length) continue;
        const api = createEntityApi(this, id); api.dt = dt; api.input = this.input;
        for (const cb of arr) { try { cb.call(api, arg); } catch (e) { console.error('[handler ' + cat + ']', e); } }
      }
    };
    for (const ev of this.keyEvents) fire(ev.type, ev.key);
    for (const ev of this.mouseEvents) fire(ev.type, ev.data);
    this.keyEvents = []; this.mouseEvents = [];
  }
  // —— 生成 / 销毁 ——
  spawn(name, opts = {}) {
    const id = 'spawn_' + (++this._spawnSeq);
    const transform = {
      position: opts.position ? [...opts.position] : [0, 0, 0],
      rotation: opts.rotation ? [...opts.rotation] : [0, 0, 0],
      scale: opts.scale ? [...opts.scale] : [1, 1, 1],
    };
    this.entities.push({ id, name, transform: JSON.parse(JSON.stringify(transform)), vel: [0, 0, 0], parent: null });
    const obj = new GameObject3D(name);
    obj.id = id; obj.transform = JSON.parse(JSON.stringify(transform));
    obj.components = opts.components ? JSON.parse(JSON.stringify(opts.components)) : {};
    obj.material = opts.material ? JSON.parse(JSON.stringify(opts.material)) : null;
    obj.scripts = opts.scripts ? opts.scripts.map(s => (typeof s === 'string' ? s : (s && s.code) || '')) : [];
    if (this.sceneRef) this.sceneRef.objects.set(id, obj);
    // 编译并挂载新对象的脚本
    for (let i = 0; i < obj.scripts.length; i++) {
      const r = compileObjectScript(obj.scripts[i], { entityId: id, name: name + '#' + i, runtime: this, index: i });
      if (!r.error) this.scripts.push(r);
    }
    return id;
  }
  despawn(id) {
    this.entities = this.entities.filter(e => e.id !== id);
    if (this.sceneRef) this.sceneRef.objects.delete(id);
    this.scripts = this.scripts.filter(s => s._entityId !== id);
    delete this._handlers[id];
    this._timers = this._timers.filter(t => t.entityId !== id);
  }
  // —— 计时器 ——
  addTimer(entityId, sec, cb) { this._timers.push({ t: sec, cb, entityId }); }
  // —— 断点 ——
  debugBreak(entityId, msg) { this.breakRequested = true; this.breakInfo = { entityId, msg: msg || '', time: this.time }; }
  clearBreak() { this.breakRequested = false; this.breakInfo = null; }
  // —— 碰撞 / 查询 ——
  distanceTo(a, b) {
    const ea = this.entities.find(e => e.id === a), eb = this.entities.find(e => e.id === b);
    if (!ea || !eb) return Infinity;
    const p = ea.transform.position, q = eb.transform.position;
    return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  }
  queryRadius(entityId, radius) {
    const e = this.entities.find(x => x.id === entityId); if (!e) return [];
    const p = e.transform.position; const out = [];
    for (const o of this.entities) {
      if (o.id === entityId) continue;
      const q = o.transform.position; const d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
      if (d <= radius) out.push({ id: o.id, name: o.name, dist: d });
    }
    return out.sort((a, b) => a.dist - b.dist);
  }
  // 沿 dir（单位向量）从实体发射射线，返回 maxDist 内最近的命中实体 id（球体近似）
  raycast(entityId, dir, maxDist = 10) {
    const e = this.entities.find(x => x.id === entityId); if (!e) return null;
    const p = e.transform.position;
    const d = dir && dir.length === 3 ? dir : [0, 0, 1];
    const n = Math.hypot(d[0], d[1], d[2]) || 1; const u = [d[0] / n, d[1] / n, d[2] / n];
    let best = null, bestT = Infinity;
    for (const o of this.entities) {
      if (o.id === entityId) continue;
      const q = o.transform.position;
      const w = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
      const t = w[0] * u[0] + w[1] * u[1] + w[2] * u[2];
      if (t <= 0 || t > maxDist) continue;
      const perp = Math.hypot(w[0] - u[0] * t, w[1] - u[1] * t, w[2] - u[2] * t);
      if (perp < 0.6 && t < bestT) { bestT = t; best = o.id; }
    }
    return best;
  }
  // 热重载：把运行中某个实体某槽位的脚本替换为新代码（不停止会话）。
  // 若槽位本无脚本但实体存在，则新增（支持从空对象热加载首个脚本）。
  // 返回 { ok, error?, created? }。编译失败不影响仍在跑的旧脚本。
  hotReload(entityId, index, src) {
    const i = this.scripts.findIndex(s => s._entityId === entityId && s._index === index);
    if (i >= 0) {
      const r = compileObjectScript(src, { entityId, name: this.scripts[i].name, runtime: this, index });
      if (r.error) return { ok: false, error: r.error };
      this.scripts[i] = r;
      return { ok: true };
    }
    if (!this.entities.some(e => e.id === entityId)) return { ok: false, error: '运行时无该实体 #' + entityId };
    const r = compileObjectScript(src, { entityId, name: 'hot#' + index, runtime: this, index });
    if (r.error) return { ok: false, error: r.error };
    this.scripts.push(r);
    return { ok: true, created: true };
  }
  destroy() {
    this.started = false; this.scripts = []; this.logBuffer = [];
    this._handlers = {}; this.keyEvents = []; this.mouseEvents = []; this._timers = [];
    this.breakRequested = false; this.breakInfo = null;
  }
}
