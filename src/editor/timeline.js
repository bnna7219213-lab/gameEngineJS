// 时间轴：关键帧动画（对应 python/ide 的 timeline）。
// DOM-free：轨道 = { objId, prop:'position'|'rotation'|'scale', keys:[{t, v:[x,y,z]}] }；
// 线性插值求值；play/pause/scrub 由 UI 驱动。
import { lerp } from '../engine/core/math.js';

export class Timeline {
  constructor() { this.tracks = []; this.time = 0; this.duration = 5; this.playing = false; this.fps = 60; }
  addTrack(objId, prop) {
    if (this.tracks.some(t => t.objId === objId && t.prop === prop)) return null;
    const tr = { objId, prop, keys: [{ t: 0, v: null }, { t: this.duration, v: null }] };
    this.tracks.push(tr); return tr;
  }
  removeTrack(objId, prop) { this.tracks = this.tracks.filter(t => !(t.objId === objId && t.prop === prop)); }
  // 在当前时间记录关键帧（v 省略时由 UI 传入对象当前值）
  key(objId, prop, v, t = this.time) {
    const tr = this.tracks.find(x => x.objId === objId && x.prop === prop);
    if (!tr) return false;
    const ex = tr.keys.find(k => Math.abs(k.t - t) < 1e-6);
    if (ex) ex.v = [...v]; else { tr.keys.push({ t, v: [...v] }); tr.keys.sort((a, b) => a.t - b.t); }
    return true;
  }
  // 求某轨道在 t 时刻的值；无关键帧值时返回 null
  eval(tr, t) {
    const keys = tr.keys.filter(k => k.v);
    if (!keys.length) return null;
    if (t <= keys[0].t) return [...keys[0].v];
    if (t >= keys[keys.length - 1].t) return [...keys[keys.length - 1].v];
    for (let i = 0; i < keys.length - 1; i++) {
      const a = keys[i], b = keys[i + 1];
      if (t >= a.t && t <= b.t) {
        const k = (t - a.t) / Math.max(1e-9, b.t - a.t);
        return a.v.map((x, j) => lerp(x, b.v[j], k));
      }
    }
    return null;
  }
  // 把 t 时刻所有轨道值写回场景对象；返回写入数量
  apply(scene, t = this.time) {
    let n = 0;
    for (const tr of this.tracks) {
      const obj = scene.get(tr.objId); if (!obj) continue;
      const v = this.eval(tr, t); if (!v) continue;
      obj.transform[tr.prop] = v; n++;
    }
    return n;
  }
  play() { this.playing = true; }
  pause() { this.playing = false; }
  stop() { this.playing = false; this.time = 0; }
  scrub(t) { this.time = Math.max(0, Math.min(this.duration, t)); }
  // 推进（真实秒）；返回是否仍在播放
  tick(dtSec, scene) {
    if (!this.playing) return false;
    this.time += dtSec;
    if (this.time >= this.duration) { this.time = this.duration; this.playing = false; }
    if (scene) this.apply(scene, this.time);
    return this.playing;
  }
}
