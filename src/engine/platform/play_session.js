// Play 模式快照隔离（P5#2）：编辑器进入 Play 时，对场景做完全独立的深拷贝（经 Scene3D 序列化往返），
// 在其上跑 GameRuntime；停止即丢弃快照，编辑态原封不动（红线 F：运行时绝不反向改写传入的 Scene3D）。
import { GameRuntime } from './runtime.js';
import { Scene3D, GameObject3D } from './scene3d.js';
import { attachSceneScripts } from '../../editor/script_compiler.js';

// 完全独立的深拷贝：保留原 id（快照隔离但 id 稳定，供编辑器选择/拾取与 _sync 一致性），
// 且所有嵌套结构走 JSON 往返以切断引用共享。任何对副本的修改都不会波及原始编辑场景。
export function cloneScene(scene) {
  const s = new Scene3D();
  s.name = scene.name;
  const deep = (v) => JSON.parse(JSON.stringify(v));
  for (const [id, o] of scene.objects) {
    const obj = new GameObject3D(o.name);
    obj.id = id;                                  // 保留原 id（Scene3D.deserialize 会重排，这里显式稳定）
    obj.transform = deep(o.transform);
    obj.components = deep(o.components || {});
    obj.material = o.material ? deep(o.material) : null;
    obj.scripts = deep(o.scripts || []);
    s.objects.set(id, obj);
  }
  // parent / children 按 id 重新指向克隆对象
  for (const [id, o] of scene.objects) {
    const c = s.objects.get(id);
    c.parent = o.parent ? s.objects.get(o.parent.id) || null : null;
    c.children = (o.children || []).map(cid => s.objects.get(cid)).filter(Boolean).map(x => x.id);
  }
  return s;
}

export class PlaySession {
  constructor(scene, { scripts = [], compileScripts = true } = {}) {
    this.original = scene;
    this.snapshot = cloneScene(scene);
    this.runtime = new GameRuntime();
    this.runtime.attachScene3d(this.snapshot);
    this.scriptErrors = [];
    if (compileScripts) this.scriptErrors = attachSceneScripts(this.runtime, this.snapshot);
    for (const s of scripts) this.runtime.addScript(s);
    this.playing = false;
    this.paused = false;
  }
  start() { this.playing = true; this.paused = false; this.runtime.start(); }
  pause() { this.paused = true; }
  resume() { this.paused = false; this.runtime.clearBreak(); }
  // 推进一帧真实毫秒；暂停或非播放态无效。命中断点则自动暂停（红线：不吞异常，仅停帧）
  step(dtMs) {
    if (!this.playing || this.paused) return;
    this.runtime.update(dtMs);
    if (this.runtime.breakRequested) this.paused = true;
    this._sync();
  }
  // debug 单步：无论暂停与否，精确推进一个固定步长（1/60s）并同步快照。
  // 配合暂停可逐帧观察实体状态变化（边调试边运行）。命中断点同样转为暂停。
  stepFrame() {
    if (!this.playing) return;
    if (this.runtime.breakRequested) { this.paused = true; return; }
    this.runtime.fixedStep(this.runtime.fixedDt);
    if (this.runtime.breakRequested) this.paused = true;
    this._sync();
  }
  // 热重载：把编辑器中保存的脚本代码替换进运行中的会话（不停止）。
  // entityId/index 定位到对象脚本槽位。返回 { ok, error? }。
  hotReload(entityId, index, src) {
    if (!this.runtime) return { ok: false, error: '未运行' };
    return this.runtime.hotReload(entityId, index, src);
  }
  // 把运行时实体变换写回快照（快照即运行时场景，非编辑场景）——供视口渲染
  _sync() {
    for (const e of this.runtime.entities) {
      const o = this.snapshot.get(e.id);
      if (o) o.transform = e.transform;
    }
  }
  // 供视口渲染的当前场景（运行时快照）
  getRenderScene() { return this.snapshot; }
  get time() { return this.runtime.time; }
  // 停止：丢弃运行时快照，编辑场景零污染（红线 F）
  stop() {
    this.playing = false; this.paused = false;
    this.runtime.destroy();
    this.snapshot = null;
  }
}
