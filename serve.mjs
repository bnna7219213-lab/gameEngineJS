// 零依赖静态服务器：node serve.mjs [port]
// 用于本地打开编辑器 index.html（ES module 需要 http:// 而非 file://）。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] || 8080);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.wasm': 'application/wasm',
  '.bin': 'application/octet-stream',
  '.obj': 'text/plain; charset=utf-8',
  '.glsl': 'text/plain; charset=utf-8',
  '.wgsl': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

http
  .createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const full = path.join(ROOT, path.normalize(p).replace(/^([/\\])+/, ''));
    if (!full.startsWith(ROOT)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    fs.readFile(full, (err, buf) => {
      if (err) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('404 ' + p);
        return;
      }
      res.writeHead(200, {
        'content-type': MIME[path.extname(full).toLowerCase()] || 'application/octet-stream',
        'cache-control': 'no-store'
      });
      res.end(buf);
    });
  })
  .listen(PORT, () => {
    console.log(`engine_tensorflow+js editor: http://localhost:${PORT}/`);
  });
