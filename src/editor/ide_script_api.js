// IDE Script API（gbhy 控制台的脚本接口）：对应 python/ide 的 IDE Script 控制台。
// DOM-free：所有操作直接作用于 Project/Scene3D，返回值可序列化，Node 下可测。
// 约定：每个函数返回 { ok, result?, error? }，不静默失败（红线 A）。
import { GameObject3D } from '../engine/platform/scene3d.js';
import { addComponent, removeComponent, setField, getComponent } from './registry.js';

export function createApi(project, selection, history) {
  const scene = () => {
    const s = project.scene();
    if (!s) throw new Error('no active scene');
    return s;
  };
  const snap = (label) => { if (history) history.push(scene(), label); };
  return {
    // 场景信息
    help() {
      return 'gbhy API: spawn(name,opts) | find(name) | list() | del(id) | rename(id,name) | move(id,[x,y,z]) | ' +
        'rotate(id,[x,y,z]) | scale(id,[x,y,z]) | add(id,comp) | remove(id,comp) | set(id,comp,key,val) | ' +
        'get(id,comp) | select(id) | sel() | scenes() | useScene(name) | newScene(name) | save()';
    },
    list() {
      const out = [];
      for (const o of scene().objects.values()) out.push({ id: o.id, name: o.name, parent: o.parent ? o.parent.id : null, comps: Object.keys(o.components || {}) });
      return out;
    },
    scenes() { return { active: project.activeScene, all: [...project.scenes.keys()] }; },
    newScene(name) { project.createScene(name || ('scene' + (project.scenes.size + 1))); return true; },
    useScene(name) { if (!project.scenes.has(name)) throw new Error('scene not found: ' + name); project.activeScene = name; return true; },
    spawn(name = 'obj', opts = {}) {
      snap('spawn');
      const o = new GameObject3D(name);
      if (opts.position) o.transform.position = [...opts.position];
      if (opts.rotation) o.transform.rotation = [...opts.rotation];
      if (opts.scale) o.transform.scale = [...opts.scale];
      if (opts.components) o.components = opts.components;
      scene().add(o, opts.parentId ?? null);
      return o.id;
    },
    find(name) { const o = scene().findByName(name); return o ? o.id : null; },
    del(id) { snap('delete'); const s = scene(); if (!s.get(id)) throw new Error('object not found: ' + id); s.remove(id); if (selection) selection.clear(); return true; },
    rename(id, name) { snap('rename'); const o = mustObj(scene(), id); o.name = name; return true; },
    move(id, p) { snap('move'); mustObj(scene(), id).transform.position = [...p]; return true; },
    rotate(id, r) { snap('rotate'); mustObj(scene(), id).transform.rotation = [...r]; return true; },
    scale(id, s) { snap('scale'); mustObj(scene(), id).transform.scale = [...s]; return true; },
    reparent(id, parentId) {
      snap('reparent'); const s = scene(); const o = mustObj(s, id);
      o.parent = parentId != null ? mustObj(s, parentId) : null; return true;
    },
    add(id, comp) { snap('add-component'); if (!addComponent(mustObj(scene(), id), comp)) throw new Error('cannot add component: ' + comp); return true; },
    remove(id, comp) { snap('remove-component'); if (!removeComponent(mustObj(scene(), id), comp)) throw new Error('cannot remove component: ' + comp); return true; },
    set(id, comp, key, val) { snap('set-field'); if (!setField(mustObj(scene(), id), comp, key, val)) throw new Error('set failed: ' + comp + '.' + key); return true; },
    get(id, comp) { const c = getComponent(mustObj(scene(), id), comp); if (!c) throw new Error('component not found: ' + comp); return JSON.parse(JSON.stringify(c)); },
    select(id) { if (!selection) return false; selection.set(id); return true; },
    sel() { return selection ? selection.get() : []; },
    save() { project.save(); return true; },
  };
}

function mustObj(scene, id) { const o = scene.get(id); if (!o) throw new Error('object not found: ' + id); return o; }

// 执行一段 gbhy 脚本：api 作为局部变量注入；返回 { ok, result, error }
export function runScript(api, code) {
  const names = Object.keys(api);
  const args = names.map(n => api[n]);
  try {
    // 先按表达式求值；语法不符则按语句体执行（支持分号多语句 + 末尾表达式/return）
    let fn;
    try { fn = new Function(...names, '"use strict"; return (' + code + ');'); }
    catch { fn = new Function(...names, '"use strict";' + (/;/.test(code) && !/return/.test(code) ? code.replace(/;([^;]*)$/, ';return ($1)') : code)); }
    return { ok: true, result: fn(...args) };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}
