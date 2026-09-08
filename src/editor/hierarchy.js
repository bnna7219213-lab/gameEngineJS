// 层级面板：Scene3D 对象树（对应 python/ide 的 hierarchy）。
// 支持：选中、重命名(双击)、删除、重定父级(拖拽)、新建空对象。
export class HierarchyPanel {
  constructor(ctx, el) {
    this.ctx = ctx; this.el = el;
    ctx.selection.onChange(() => this.render());
  }
  scene() { return this.ctx.project.scene(); }
  render() {
    const s = this.scene(); const el = this.el;
    el.innerHTML = '';
    if (!s) { el.innerHTML = '<div class="empty">无活动场景</div>'; return; }
    const roots = [];
    for (const o of s.objects.values()) if (!o.parent || !s.get(o.parent.id)) roots.push(o);
    roots.sort((a, b) => a.id - b.id);
    if (!roots.length) el.innerHTML = '<div class="empty">空场景 — 用 ＋ 或工具栏创建对象</div>';
    for (const o of roots) this._node(el, o, 0);
  }
  _node(parentEl, obj, depth) {
    const ctx = this.ctx;
    const row = document.createElement('div');
    row.className = 'node' + (ctx.selection.has(obj.id) ? ' sel' : '');
    row.style.paddingLeft = (6 + depth * 14) + 'px';
    row.draggable = true;
    const label = document.createElement('span');
    label.textContent = obj.name + '  #' + obj.id;
    const ops = document.createElement('span'); ops.className = 'ops';
    const ren = document.createElement('span'); ren.textContent = '✎'; ren.title = '重命名';
    ren.onclick = (e) => { e.stopPropagation(); this._rename(obj); };
    const del = document.createElement('span'); del.textContent = '✕'; del.title = '删除';
    del.onclick = (e) => { e.stopPropagation(); this._del(obj); };
    ops.append(ren, del);
    row.append(label, ops);
    row.onclick = (e) => {
      const s = this.scene();
      ctx.history.push(s, 'select');
      if (e.ctrlKey || e.metaKey) ctx.selection.toggle(obj.id); else ctx.selection.set(obj.id);
      ctx.refresh();
    };
    row.ondblclick = () => this._rename(obj);
    row.ondragstart = (e) => e.dataTransfer.setData('text/obj-id', String(obj.id));
    row.ondragover = (e) => e.preventDefault();
    row.ondrop = (e) => {
      e.preventDefault();
      const id = +e.dataTransfer.getData('text/obj-id');
      if (id && id !== obj.id) { ctx.history.push(this.scene(), 'reparent'); ctx.api.reparent(id, obj.id); ctx.refresh(); }
    };
    parentEl.appendChild(row);
    const s = this.scene();
    for (const cid of (obj.children || [])) { const c = s.get(cid); if (c) this._node(parentEl, c, depth + 1); }
  }
  _rename(obj) {
    const n = prompt('重命名对象', obj.name);
    if (n && n !== obj.name) { this.ctx.history.push(this.scene(), 'rename'); obj.name = n; this.ctx.refresh(); }
  }
  _del(obj) {
    if (!confirm(`删除 ${obj.name} (#${obj.id})？`)) return;
    this.ctx.history.push(this.scene(), 'delete');
    this.scene().remove(obj.id);
    this.ctx.selection.clear();
    this.ctx.refresh();
  }
  addEmpty() {
    const s = this.scene(); if (!s) return;
    this.ctx.history.push(s, 'spawn');
    const id = this.ctx.api.spawn('obj' + Date.now() % 10000);
    this.ctx.selection.set(id);
    this.ctx.refresh();
  }
}
