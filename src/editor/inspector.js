// 检视器：注册表驱动的属性编辑（对应 python/ide 的 inspector）。
// 字段值修改前压入历史快照；支持添加/移除组件。
import { registry, componentsOf, addableComponents, getComponent, addComponent, removeComponent, setField } from './registry.js';

export class InspectorPanel {
  constructor(ctx, el) {
    this.ctx = ctx; this.el = el;
    ctx.selection.onChange(() => this.render());
  }
  obj() {
    const id = this.ctx.selection.primary();
    const s = this.ctx.project.scene();
    return (id != null && s) ? s.get(id) : null;
  }
  render() {
    const el = this.el; el.innerHTML = '';
    const obj = this.obj();
    if (!obj) { el.innerHTML = '<div class="placeholder">在层级或视口中选择一个对象</div>'; return; }
    const ctx = this.ctx;
    // 名称
    const name = document.createElement('input');
    name.className = 'obj-name'; name.value = obj.name;
    name.onchange = () => { ctx.history.push(ctx.project.scene(), 'rename'); obj.name = name.value; ctx.refresh(); };
    el.appendChild(name);
    for (const cname of componentsOf(obj)) el.appendChild(this._compCard(obj, cname));
    // 对象脚本（A：检视器内联编辑，可热加载到运行会话）
    el.appendChild(this._scriptCard(obj));
    // 添加组件
    const addable = addableComponents(obj);
    if (addable.length) {
      const row = document.createElement('div'); row.className = 'add-row';
      const sel = document.createElement('select');
      for (const c of addable) { const o = document.createElement('option'); o.value = c; o.textContent = registry[c].title; sel.appendChild(o); }
      const btn = document.createElement('button'); btn.textContent = '添加组件';
      btn.onclick = () => {
        ctx.history.push(ctx.project.scene(), 'add-component');
        addComponent(obj, sel.value); ctx.refresh();
      };
      row.append(sel, btn); el.appendChild(row);
    }
  }
  // 对象脚本卡：检视器内联编辑 object.scripts，可在 Play 运行时热加载（A 功能）
  _scriptCard(obj) {
    const ctx = this.ctx;
    const card = document.createElement('div'); card.className = 'comp';
    const head = document.createElement('div'); head.className = 'comp-head';
    head.appendChild(document.createTextNode('脚本 Scripts'));
    card.appendChild(head);
    if (!Array.isArray(obj.scripts)) obj.scripts = [];
    obj.scripts.forEach((src, i) => {
      const slot = document.createElement('div'); slot.className = 'script-slot';
      const ta = document.createElement('textarea'); ta.className = 'script-ta';
      ta.value = typeof src === 'string' ? src : (src && src.code || '');
      ta.oninput = () => { obj.scripts[i] = ta.value; };               // 实时写入（不压历史）
      ta.onchange = () => { ctx.history.push(ctx.project.scene(), 'edit-script'); this._applyScript(obj, i, ta.value); };
      slot.appendChild(ta);
      const bar = document.createElement('div'); bar.className = 'script-bar';
      const reload = document.createElement('button'); reload.textContent = '热加载';
      reload.onclick = () => { ctx.history.push(ctx.project.scene(), 'hotreload-script'); this._applyScript(obj, i, ta.value); };
      const del = document.createElement('button'); del.textContent = '删除';
      del.onclick = () => { obj.scripts.splice(i, 1); ctx.history.push(ctx.project.scene(), 'del-script'); ctx.refresh(); };
      bar.append(reload, del);
      slot.appendChild(bar);
      card.appendChild(slot);
    });
    const add = document.createElement('button'); add.className = 'add-row-btn'; add.textContent = '+ 新增脚本';
    add.onclick = () => { obj.scripts.push('// 新脚本\nthis.move(0, 0, 0);'); ctx.history.push(ctx.project.scene(), 'add-script'); ctx.refresh(); };
    card.appendChild(add);
    return card;
  }
  _applyScript(obj, i, code) {
    obj.scripts[i] = code;
    const ps = this.ctx.getPlaySession && this.ctx.getPlaySession();
    if (ps && ps.playing) {
      const r = ps.hotReload(obj.id, i, code);
      if (r.ok) this.ctx.status('已热加载脚本 #' + i + '（运行中，红线 F 仅改运行时）');
      else this.ctx.status('热加载失败：' + (r.error || ''));
    }
    this.ctx.refresh();
  }
  _compCard(obj, cname) {
    const ctx = this.ctx;
    const def = registry[cname];
    const card = document.createElement('div'); card.className = 'comp';
    const head = document.createElement('div'); head.className = 'comp-head';
    head.appendChild(document.createTextNode(def.title));
    if (!def.builtin) {
      const rm = document.createElement('span'); rm.className = 'rm'; rm.textContent = '移除';
      rm.onclick = () => { ctx.history.push(ctx.project.scene(), 'rm-component'); removeComponent(obj, cname); ctx.refresh(); };
      head.appendChild(rm);
    }
    card.appendChild(head);
    const data = getComponent(obj, cname);
    for (const f of def.fields) card.appendChild(this._field(obj, cname, f, data));
    return card;
  }
  _field(obj, cname, f, data) {
    const ctx = this.ctx;
    const row = document.createElement('div'); row.className = 'field';
    const lab = document.createElement('label'); lab.textContent = f.label; row.appendChild(lab);
    const commit = (val) => {
      ctx.history.push(ctx.project.scene(), 'edit-' + f.key);
      setField(obj, cname, f.key, val); ctx.refresh();
    };
    const v = data[f.key];
    if (f.type === 'vec3') {
      const arr = Array.isArray(v) ? v : [0, 0, 0];
      arr.forEach((x, i) => {
        const inp = document.createElement('input');
        inp.type = 'number'; inp.step = String(f.step || 0.1); inp.value = String(x);
        inp.onchange = () => { const nv = [...arr]; nv[i] = parseFloat(inp.value) || 0; commit(nv); };
        row.appendChild(inp);
      });
    } else if (f.type === 'color') {
      const inp = document.createElement('input');
      inp.type = 'color'; inp.value = rgbToHex(Array.isArray(v) ? v : [200, 200, 200]);
      inp.onchange = () => commit(hexToRgb(inp.value));
      row.appendChild(inp);
    } else if (f.type === 'bool') {
      const inp = document.createElement('input'); inp.type = 'checkbox'; inp.checked = !!v;
      inp.onchange = () => commit(inp.checked); row.appendChild(inp);
    } else if (f.type === 'select') {
      const sel = document.createElement('select');
      for (const op of f.options) { const o = document.createElement('option'); o.value = op; o.textContent = op; sel.appendChild(o); }
      sel.value = String(v ?? f.options[0]);
      sel.onchange = () => commit(sel.value); row.appendChild(sel);
    } else if (f.type === 'text' && f.multiline) {
      const ta = document.createElement('textarea'); ta.value = String(v ?? '');
      ta.onchange = () => commit(ta.value); row.appendChild(ta);
    } else {
      const inp = document.createElement('input');
      inp.type = f.type === 'text' ? 'text' : 'number';
      if (f.step) inp.step = String(f.step);
      if (f.min != null) inp.min = String(f.min);
      if (f.max != null) inp.max = String(f.max);
      inp.value = String(v ?? 0);
      inp.onchange = () => commit(f.type === 'text' ? inp.value : (parseFloat(inp.value) || 0));
      row.appendChild(inp);
    }
    return row;
  }
}

export function rgbToHex([r, g, b]) {
  const h = (x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0');
  return '#' + h(r) + h(g) + h(b);
}
export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex); if (!m) return [200, 200, 200];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
