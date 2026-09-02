// smoke 运行器：node tools/run_smoke.js [前缀过滤]
// 自动发现 tools/smoke/*.js，逐个 import 并执行 run(t)。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { T } from './harness.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DIR = path.join(ROOT, 'tools', 'smoke');
const filter = process.argv[2] || '';

const files = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith('.js'))
  .filter((f) => (filter ? f.startsWith(filter) : true))
  .sort();

let pass = 0, fail = 0, asserts = 0;
const lines = [];

for (const f of files) {
  const mod = await import(pathToFileURL(path.join(DIR, f)).href);
  if (typeof mod.run !== 'function') {
    lines.push(`SKIP  ${f} (无 run 导出)`);
    continue;
  }
  const t = new T(mod.name || f);
  const t0 = Date.now();
  try {
    await mod.run(t);
    const ms = Date.now() - t0;
    pass++;
    asserts += t.assertions;
    lines.push(`PASS  ${f.padEnd(34)} ${String(t.assertions).padStart(4)} assertions  ${ms}ms`);
    for (const n of t.notes) lines.push(`      note: ${n}`);
  } catch (e) {
    fail++;
    asserts += t.assertions;
    lines.push(`FAIL  ${f.padEnd(34)} ${String(t.assertions).padStart(4)} assertions`);
    lines.push(`      ${e.message}`);
  }
}

const summary = `PASS=${pass} FAIL=${fail} ASSERTIONS=${asserts} :: ${fail === 0 ? 'ALL_DONE' : 'HAS_FAILURES'}`;
console.log(lines.join('\n'));
console.log('');
console.log(summary);
fs.writeFileSync(path.join(ROOT, 'tools', 'smoke_report.txt'), lines.join('\n') + '\n\n' + summary + '\n');
process.exit(fail === 0 ? 0 : 1);
