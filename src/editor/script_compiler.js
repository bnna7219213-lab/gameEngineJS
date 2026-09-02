// 对象脚本编译器（Play 模式接入对象脚本编译）：把 GameObject3D.scripts（代码字符串或 {code}）
// 编译为 GameRuntime 可执行的 { name, onUpdate(dt,input) } 脚本，并经由 per-entity 沙箱 API 操作运行时实体。
// 设计要点：
//  - 纯逻辑、DOM-free、可在 Web Worker 内跑（validateScript 仅做语法校验，不依赖主线程闭包）。
//  - 每个脚本通过 this.* 访问其所属实体（move/rotate/setPosition/...），绝不直接碰 Scene3D（红线 F）。
//  - 单脚本运行时异常被吞掉，不污染其它脚本与编辑数据。

// 为某个运行时实体构造沙箱 API。脚本以 `this` 调用（也兼容 api.*）。
// 仅能经这些方法改写运行时实体表，绝不反向触达传入的 Scene3D（红线 F）。
export function createEntityApi(runtime, entityId) {
  const getE = () => runtime.entities.find(e => e.id === entityId);
  const api = {
    get id() { return entityId; },
    get time() { return runtime.time; },
    dt: 0,
    input: null,
    get position() { const e = getE(); return e ? e.transform.position : [0, 0, 0]; },
    get rotation() { const e = getE(); return e ? e.transform.rotation : [0, 0, 0]; },
    get scale() { const e = getE(); return e ? e.transform.scale : [1, 1, 1]; },
    move(dx, dy, dz) { const e = getE(); if (e) { e.transform.position[0] += dx || 0; e.transform.position[1] += dy || 0; e.transform.position[2] += dz || 0; } },
    setPosition(x, y, z) { const e = getE(); if (e) e.transform.position = [x, y, z]; },
    rotate(rx, ry, rz) { const e = getE(); if (e) { e.transform.rotation[0] += rx || 0; e.transform.rotation[1] += ry || 0; e.transform.rotation[2] += rz || 0; } },
    setRotation(x, y, z) { const e = getE(); if (e) e.transform.rotation = [x, y, z]; },
    log(m) { if (runtime.log) runtime.log('[' + entityId + '] ' + m); console.log('[script:' + entityId + ']', m); },
    // —— 输入事件回调（运行时事件总线派发；红线 E：无输入则永不触发）——
    onKeyDown(cb) { runtime.registerHandler(entityId, 'keydown', cb); },
    onKeyUp(cb) { runtime.registerHandler(entityId, 'keyup', cb); },
    onMouseDown(cb) { runtime.registerHandler(entityId, 'mousedown', cb); },
    onMouseUp(cb) { runtime.registerHandler(entityId, 'mouseup', cb); },
    onMouseMove(cb) { runtime.registerHandler(entityId, 'mousemove', cb); },
    // —— 生成 / 销毁 ——
    spawn(name, opts) { return runtime.spawn(name, opts); },
    despawn(id) { return runtime.despawn(id); },
    // —— 计时器 ——
    timer(sec, cb) { return runtime.addTimer(entityId, sec, cb); },
    after(sec, cb) { return runtime.addTimer(entityId, sec, cb); },
    // —— 碰撞 / 查询 ——
    distanceTo(id) { return runtime.distanceTo(entityId, id); },
    queryRadius(r) { return runtime.queryRadius(entityId, r); },
    raycast(dir, maxDist) { return runtime.raycast(entityId, dir, maxDist); },
    // —— 断点（命中点暂停会话，配合 debug 面板）——
    breakpoint(msg) { runtime.debugBreak(entityId, msg); },
  };
  return api;
}

// 校验一段脚本代码语法（Worker-safe：仅 new Function 尝试，不捕获实体闭包）。
// 返回 { ok, error, line?, col? }，line/col 为尽力而为（基于 V8 栈解析，已扣除 "use strict" 前缀行）。
export function validateScript(code) {
  try { new Function('dt', 'input', '"use strict";\n' + (code || '')); return { ok: true }; }
  catch (e) {
    const msg = String(e && e.message || e);
    let line = -1, col = -1;
    const stack = String(e && e.stack || '');
    const m = stack.match(/<anonymous>:(\d+):(\d+)/);
    if (m) { line = Math.max(1, parseInt(m[1], 10) - 1); col = parseInt(m[2], 10); }
    return { ok: false, error: msg, line, col };
  }
}

// 监视表达式求值（debug 面板用）：在实体 API 作用域内求值，返回可显示字符串。
// 用非严格模式 + with(scope) 以允许 pos/rot/t/id 等简写；失败返回错误信息。
export function evalWatch(expr, api) {
  const scope = {
    pos: api.position, rot: api.rotation, scale: api.scale, t: api.time, id: api.id, dt: api.dt, input: api.input,
    floor: Math.floor, round: Math.round, abs: Math.abs, sqrt: Math.sqrt, min: Math.min, max: Math.max, Math,
  };
  try {
    const f = new Function('scope', 'with(scope){ return (' + expr + '); }');
    const r = f(scope);
    return (r && typeof r === 'object') ? JSON.stringify(r) : String(r);
  } catch (e) { return 'ERR: ' + (e && e.message || e); }
}

// 编译单个对象脚本源（字符串或 { name, code }）为运行时脚本对象。
// runtime 在闭包中捕获，从而 onUpdate 能定位到对应实体。单个脚本编译失败仅返回 { error }，不抛。
// 成功产物带 _entityId/_index 元数据，供热重载（hotReload）精准定位并就地替换。
export function compileObjectScript(src, { entityId, name = 'script', runtime, index = 0 } = {}) {
  const body = typeof src === 'string' ? src : (src && src.code) || '';
  let fn;
  try { fn = new Function('dt', 'input', '"use strict";\n' + body); }
  catch (e) { return { error: String(e && e.message || e), name }; }
  return {
    name,
    _entityId: entityId,
    _index: index,
    onUpdate(dt, input) {
      const api = createEntityApi(runtime, entityId);
      api.dt = dt; api.input = input;
      try { fn.call(api, dt, input); }
      catch (e) { console.error('[script ' + name + ']', e); }
    },
  };
}

// 从场景（快照/编辑场景皆可）收集所有对象脚本并编译。
// 返回 { scripts: [运行时脚本...], errors: [{ name, error }] }
export function compileSceneScripts(runtime, scene) {
  const scripts = [];
  const errors = [];
  for (const o of scene.objects.values()) {
    const arr = o.scripts || [];
    for (let i = 0; i < arr.length; i++) {
      const r = compileObjectScript(arr[i], { entityId: o.id, name: o.name + '#' + i, runtime, index: i });
      if (r.error) errors.push({ name: r.name, error: r.error });
      else scripts.push(r);
    }
  }
  return { scripts, errors };
}

// PlaySession 助手：把场景对象脚本编译并挂到运行时（snapshot 的 id 与实体 id 一致）。
export function attachSceneScripts(runtime, scene) {
  const { scripts, errors } = compileSceneScripts(runtime, scene);
  for (const s of scripts) runtime.addScript(s);
  return errors;
}
