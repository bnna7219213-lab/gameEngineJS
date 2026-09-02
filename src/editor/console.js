// gbhy 控制台面板：命令输入 + 历史（对应 python/ide 的 IDE Script 控制台）。
// 执行走 ide_script_api.runScript，结果格式化输出；↑/↓ 翻历史。
import { runScript } from './ide_script_api.js';

export class ConsolePanel {
  constructor(ctx, logEl, inputEl) {
    this.ctx = ctx; this.logEl = logEl; this.input = inputEl;
    this.history = []; this.hi = -1;
    inputEl.addEventListener('keydown', e => this._key(e));
    this.print('gbhy 控制台就绪。输入 help() 查看 API。', 'out');
  }
  print(text, cls = 'out') {
    const d = document.createElement('div');
    d.className = cls; d.textContent = text;
    this.logEl.appendChild(d);
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }
  _key(e) {
    if (e.key === 'Enter') {
      const code = this.input.value.trim();
      if (!code) return;
      this.input.value = '';
      this.history.push(code); this.hi = this.history.length;
      this.print('› ' + code, 'in');
      const r = runScript(this.ctx.api, code);
      if (r.ok) {
        this.print(fmt(r.result), 'out');
        this.ctx.refresh();
      } else this.print('Error: ' + r.error, 'err');
    } else if (e.key === 'ArrowUp') {
      if (this.hi > 0) { this.hi--; this.input.value = this.history[this.hi] || ''; e.preventDefault(); }
    } else if (e.key === 'ArrowDown') {
      if (this.hi < this.history.length) { this.hi++; this.input.value = this.history[this.hi] || ''; e.preventDefault(); }
    }
  }
}

function fmt(v) {
  if (v === undefined) return 'undefined';
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v, null, 2); } catch { return String(v); }
}
