// 命令面板：Ctrl+K 模糊搜索命令（对应 python/ide 的 command palette）。
export class CommandPalette {
  constructor(ctx, commands) {
    this.ctx = ctx;
    this.commands = commands; // [{id, title, kbd, run}]
    this.el = null; this.idx = 0;
    addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); this.toggle(); }
      if (e.key === 'Escape' && this.el) this.close();
    });
  }
  toggle() { this.el ? this.close() : this.open(); }
  open() {
    this.close();
    const root = document.createElement('div'); root.id = 'palette';
    const inp = document.createElement('input');
    inp.placeholder = '输入命令…';
    const list = document.createElement('div');
    root.append(inp, list);
    document.body.appendChild(root);
    this.el = root; this.inp = inp; this.list = list; this.idx = 0;
    inp.oninput = () => this._render();
    inp.onkeydown = (e) => {
      const items = this._filtered();
      if (e.key === 'ArrowDown') { this.idx = Math.min(items.length - 1, this.idx + 1); this._render(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { this.idx = Math.max(0, this.idx - 1); this._render(); e.preventDefault(); }
      else if (e.key === 'Enter') { const c = items[this.idx]; this.close(); if (c) c.run(); }
    };
    this._render();
    inp.focus();
  }
  close() { if (this.el) { this.el.remove(); this.el = null; } }
  _filtered() {
    const q = (this.inp?.value || '').toLowerCase();
    return this.commands.filter(c => !q || c.title.toLowerCase().includes(q) || c.id.includes(q));
  }
  _render() {
    const items = this._filtered();
    this.list.innerHTML = '';
    items.slice(0, 12).forEach((c, i) => {
      const d = document.createElement('div');
      d.className = 'item' + (i === this.idx ? ' active' : '');
      const t = document.createElement('span'); t.textContent = c.title;
      const k = document.createElement('span'); k.className = 'kbd'; k.textContent = c.kbd || '';
      d.append(t, k);
      d.onclick = () => { this.close(); c.run(); };
      this.list.appendChild(d);
    });
  }
}
