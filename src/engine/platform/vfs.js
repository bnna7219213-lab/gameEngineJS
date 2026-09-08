// 虚拟文件系统：VFS + MemoryRoot + DirectoryRoot（Node 真实枚举）+ PakRoot（自研打包格式）。
// 所有 API 为 async，便于浏览器降级（红线 E：缺失能力返回空/抛可读错误）。
export function normalize(p) {
  p = String(p).replace(/\\/g, '/').replace(/^\/+/, '');
  const out = [];
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') { if (out.length) out.pop(); continue; }
    out.push(seg);
  }
  return out.join('/');
}

export class MemoryRoot {
  constructor() { this.files = new Map(); }
  async read(p) { const n = normalize(p); if (!this.files.has(n)) throw new Error('not found: ' + n); return this.files.get(n); }
  async write(p, data) { this.files.set(normalize(p), data); }
  async list(prefix) { const n = normalize(prefix); const r = []; for (const k of this.files.keys()) if (k.startsWith(n)) r.push(k); return r; }
  async exists(p) { return this.files.has(normalize(p)); }
  async stat(p) { const n = normalize(p); if (!this.files.has(n)) return null; const d = this.files.get(n); return { size: d.length, isDir: false }; }
}

export class DirectoryRoot {
  constructor(dir) { this.dir = dir; this._fs = null; }
  async _fs() { if (this._fs === null) { try { this._fs = await import('node:fs'); } catch (e) { this._fs = false; } } return this._fs || null; }
  async read(p) {
    const fs = await this._fs(); if (!fs) throw new Error('DirectoryRoot: no fs in this environment');
    const n = normalize(p); const fp = (this.dir + '/' + n).replace(/\/+/g, '/');
    if (!fs.existsSync(fp)) throw new Error('not found: ' + n);
    return fs.readFileSync(fp, 'utf8');
  }
  async write(p, data) {
    const fs = await this._fs(); if (!fs) throw new Error('DirectoryRoot: no fs in this environment');
    const n = normalize(p); const fp = (this.dir + '/' + n).replace(/\/+/g, '/');
    fs.mkdirSync(dirname(fp), { recursive: true });
    fs.writeFileSync(fp, data);
  }
  async list(prefix) {
    const fs = await this._fs(); const out = [];
    if (!fs) return out;
    const base = normalize(prefix); const root = this.dir.replace(/\/+/g, '/');
    const walk = (d) => {
      let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
      for (const e of ents) {
        const fp = (d + '/' + e.name).replace(/\/+/g, '/');
        if (e.isDirectory()) walk(fp);
        else if (e.isFile()) { const rel = fp.slice(root.length + 1); if (rel.startsWith(base)) out.push(rel); }
      }
    };
    walk(root);
    return out;
  }
  async exists(p) { const fs = await this._fs(); if (!fs) return false; return fs.existsSync((this.dir + '/' + normalize(p)).replace(/\/+/g, '/')); }
  async stat(p) { const fs = await this._fs(); if (!fs) return null; const fp = (this.dir + '/' + normalize(p)).replace(/\/+/g, '/'); try { const s = fs.statSync(fp); return { size: s.size, isDir: s.isDirectory() }; } catch (e) { return null; } }
}

export class PakRoot {
  constructor() { this.index = new Map(); this.blob = null; }
  // 打包：entries={name:string}, 返回 {magic, entries:[{name,offset,size}], data:Uint8Array}
  static pack(files) {
    const enc = new TextEncoder();
    const entries = []; const parts = []; let off = 0;
    for (const [name, content] of files) {
      const c = typeof content === 'string' ? enc.encode(content) : new Uint8Array(content);
      entries.push({ name, offset: off, size: c.length });
      parts.push(c); off += c.length;
    }
    const nameBytes = enc.encode(JSON.stringify(entries));
    const header = new Uint8Array(4 + 4 + nameBytes.length);
    const dv = new DataView(header.buffer);
    dv.setUint32(0, 0x50414b31, true); // 'PAK1'
    dv.setUint32(4, nameBytes.length, true);
    header.set(nameBytes, 8);
    const total = off + header.length;
    const out = new Uint8Array(total);
    out.set(header, 0);
    let p = header.length;
    for (const c of parts) { out.set(c, p); p += c.length; }
    return out;
  }
  load(buffer) {
    const dv = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const magic = dv.getUint32(0, true);
    if (magic !== 0x50414b31) throw new Error('PakRoot: bad magic');
    const len = dv.getUint32(4, true);
    const names = new TextDecoder().decode(new Uint8Array(buffer.buffer, buffer.byteOffset + 8, len));
    this.index.clear();
    for (const e of JSON.parse(names)) this.index.set(e.name, { offset: 8 + len + e.offset, size: e.size });
    this.blob = buffer;
  }
  async read(p) {
    const n = normalize(p); const e = this.index.get(n);
    if (!e) throw new Error('not found: ' + n);
    const bytes = this.blob.slice(e.offset, e.offset + e.size);
    return new TextDecoder().decode(bytes);
  }
  async list(prefix) { const n = normalize(prefix); const r = []; for (const k of this.index.keys()) if (k.startsWith(n)) r.push(k); return r; }
  async exists(p) { return this.index.has(normalize(p)); }
}

export class VFS {
  constructor() { this.roots = []; }
  mount(root) { this.roots.push(root); }
  async read(p) { for (let i = this.roots.length - 1; i >= 0; i--) { if (await this.roots[i].exists(p)) return this.roots[i].read(p); } throw new Error('VFS: not found ' + p); }
  async write(p, data) { if (!this.roots.length) throw new Error('VFS: no root'); return this.roots[this.roots.length - 1].write(p, data); }
  async list(prefix) { const seen = new Set(); const out = []; for (const r of this.roots) for (const k of await r.list(prefix)) if (!seen.has(k)) { seen.add(k); out.push(k); } return out; }
  async exists(p) { for (const r of this.roots) if (await r.exists(p)) return true; return false; }
  async stat(p) { for (let i = this.roots.length - 1; i >= 0; i--) { const s = await this.roots[i].stat(p); if (s) return s; } return null; }
}
