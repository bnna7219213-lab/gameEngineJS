// 资源浏览器：工程资产列表（对应 python/ide 的 asset browser）。
// 资产存于 Project.assets（material/mesh/scene/text），可重命名/删除/双击应用到选中对象。
export class AssetBrowserPanel {
  constructor(ctx, el) { this.ctx = ctx; this.el = el; }
  render() {
    const el = this.el; el.innerHTML = '';
    const list = this.ctx.project.listAssets();
    if (!list.length) { el.innerHTML = '<div class="empty" style="padding:8px;color:var(--fg-dim)">无资产 — ＋登记 或 导入向导</div>'; return; }
    for (const a of list) {
      const row = document.createElement('div'); row.className = 'asset';
      const name = document.createElement('span'); name.textContent = a.path;
      const kind = document.createElement('span'); kind.className = 'kind'; kind.textContent = a.kind;
      row.append(name, kind);
      row.title = '双击应用到选中对象（material）';
      row.ondblclick = () => this._apply(a);
      row.oncontextmenu = (e) => { e.preventDefault(); this._menu(a); };
      el.appendChild(row);
    }
  }
  _apply(a) {
    const ctx = this.ctx;
    const id = ctx.selection.primary();
    const s = ctx.project.scene();
    const o = id != null && s ? s.get(id) : null;
    if (!o) { ctx.status('先在层级中选择对象'); return; }
    const asset = ctx.project.assets.get(a.path);
    if (asset && asset.kind === 'material') {
      ctx.history.push(s, 'apply-material');
      if (!o.components.mesh) o.components.mesh = { shape: 'cube' };
      Object.assign(o.components.mesh, asset.data);
      ctx.refresh(); ctx.status('已应用材质 ' + a.path);
    } else ctx.status('该资产类型不支持直接应用');
  }
  _menu(a) {
    const act = prompt(`资产 ${a.path}\n输入操作: rename / delete`, 'rename');
    if (act === 'delete') { this.ctx.project.removeAsset(a.path); this.render(); }
    else if (act === 'rename') {
      const n = prompt('新路径', a.path);
      if (n && n !== a.path) {
        const asset = this.ctx.project.assets.get(a.path);
        this.ctx.project.removeAsset(a.path);
        this.ctx.project.addAsset(n, asset.kind, asset.data);
        this.render();
      }
    }
  }
  addAsset() {
    const path = prompt('资产路径（如 materials/red.mat）', 'materials/mat' + Date.now() % 1000 + '.mat');
    if (!path) return;
    const kind = path.endsWith('.mat') ? 'material' : path.endsWith('.txt') ? 'text' : 'mesh';
    const data = kind === 'material' ? { albedo: [220, 80, 80], rough: 0.6, metal: 0 } : {};
    this.ctx.project.addAsset(path, kind, data);
    this.render();
  }
}
