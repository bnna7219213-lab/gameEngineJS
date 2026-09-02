// 场景 Tab：多场景并排打开（对应 python/ide 的 scene tabs）。
export class SceneTabs {
  constructor(ctx, el) { this.ctx = ctx; this.el = el; }
  render() {
    const el = this.el; el.innerHTML = '';
    const p = this.ctx.project;
    for (const name of p.scenes.keys()) {
      const t = document.createElement('div');
      t.className = 'tab' + (name === p.activeScene ? ' active' : '');
      const label = document.createElement('span'); label.textContent = name;
      const x = document.createElement('span'); x.className = 'x'; x.textContent = '×';
      x.title = '关闭场景';
      x.onclick = (e) => {
        e.stopPropagation();
        if (confirm(`关闭场景 ${name}？`)) { p.closeScene(name); this.ctx.refresh(); }
      };
      t.append(label, x);
      t.onclick = () => { p.activeScene = name; this.ctx.selection.clear(); this.ctx.refresh(); };
      t.ondblclick = () => {
        const n = prompt('重命名场景', name);
        if (n && n !== name) { if (!p.renameScene(name, n)) alert('名称冲突'); this.ctx.refresh(); }
      };
      el.appendChild(t);
    }
    const add = document.createElement('div'); add.className = 'tab-new'; add.textContent = '＋ 新场景';
    add.onclick = () => {
      const n = prompt('场景名', 'scene' + (p.scenes.size + 1));
      if (n) { p.createScene(n); p.activeScene = n; this.ctx.refresh(); }
    };
    el.appendChild(add);
  }
}
