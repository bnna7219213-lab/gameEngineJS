// 控制台变量控制台：分词（支持引号）+ 命令注册/执行/历史/补全。
export function tokenize(line) {
  const out = [];
  let i = 0, cur = '', q = null;
  while (i < line.length) {
    const c = line[i];
    if (q) { if (c === q) q = null; else cur += c; }
    else if (c === '"' || c === "'") q = c;
    else if (c === ' ' || c === '\t') { if (cur) { out.push(cur); cur = ''; } }
    else cur += c;
    i++;
  }
  if (cur) out.push(cur);
  return out;
}

export class Console {
  constructor() { this.cmds = new Map(); this.history = []; this.hidx = -1; }
  register(name, fn, opts = {}) {
    this.cmds.set(name, { fn, desc: opts.desc || '', usage: opts.usage || '', complete: opts.complete || null });
    return this;
  }
  async exec(line) {
    const t = tokenize(line);
    if (!t.length) return null;
    const name = t[0];
    const cmd = this.cmds.get(name);
    if (!cmd) throw new Error('unknown command: ' + name);
    this.history.push(line); this.hidx = this.history.length;
    return await cmd.fn(t.slice(1), line);
  }
  up() { if (this.history.length && this.hidx > 0) { this.hidx--; return this.history[this.hidx]; } return ''; }
  down() { if (this.hidx < this.history.length - 1) { this.hidx++; return this.history[this.hidx]; } return ''; }
  complete(prefix) {
    const names = [...this.cmds.keys()];
    if (prefix.includes(' ')) {
      const [n, ...rest] = prefix.split(' ');
      const cmd = this.cmds.get(n);
      if (cmd && cmd.complete) return cmd.complete(rest.join(' '));
      return [];
    }
    return names.filter(k => k.startsWith(prefix));
  }
}
