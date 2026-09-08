// smoke 测试骨架：所有 tools/smoke/*.js 共用。
// 约定：每个 smoke 文件 export  name: string 与  run(t): Promise<void>|void
// 断言失败抛异常；run_smoke.js 捕获并按文件统计 PASS/FAIL。

export class AssertError extends Error {}

function fmt(v) {
  if (v instanceof Float32Array || v instanceof Uint8Array || ArrayBuffer.isView(v)) {
    return `[${Array.from(v).map((x) => (typeof x === 'number' ? x.toFixed(6) : String(x))).join(', ')}]`;
  }
  if (Array.isArray(v)) return `[${v.map(fmt).join(', ')}]`;
  if (v && typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export class T {
  constructor(name) {
    this.name = name;
    this.assertions = 0;
    this.notes = [];
  }
  ok(cond, msg = 'ok') {
    this.assertions++;
    if (!cond) throw new AssertError(`FAIL ${this.name}: ${msg}`);
    return true;
  }
  eq(a, b, msg = 'eq') {
    this.assertions++;
    if (a !== b) throw new AssertError(`FAIL ${this.name}: ${msg} (got ${fmt(a)}, want ${fmt(b)})`);
    return true;
  }
  near(a, b, eps = 1e-5, msg = 'near') {
    this.assertions++;
    if (!(Math.abs(a - b) <= eps)) {
      throw new AssertError(`FAIL ${this.name}: ${msg} (got ${fmt(a)}, want ${fmt(b)} eps=${eps})`);
    }
    return true;
  }
  // 数组/类数组逐元素近似比较
  vnear(a, b, eps = 1e-5, msg = 'vnear') {
    this.assertions++;
    const n = a.length;
    if (n !== b.length) throw new AssertError(`FAIL ${this.name}: ${msg} len ${n} != ${b.length}`);
    for (let i = 0; i < n; ++i) {
      if (!(Math.abs(a[i] - b[i]) <= eps)) {
        throw new AssertError(`FAIL ${this.name}: ${msg} [${i}] got ${fmt(a[i])} want ${fmt(b[i])} eps=${eps}`);
      }
    }
    return true;
  }
  // 精确位比较（bit-exact 用：定点/整数/字节）
  exact(a, b, msg = 'exact') {
    this.assertions++;
    const n = a.length;
    if (n !== b.length) throw new AssertError(`FAIL ${this.name}: ${msg} len ${n} != ${b.length}`);
    for (let i = 0; i < n; ++i) {
      if (a[i] !== b[i]) {
        throw new AssertError(`FAIL ${this.name}: ${msg} [${i}] got ${fmt(a[i])} want ${fmt(b[i])}`);
      }
    }
    return true;
  }
  throws(fn, msg = 'throws') {
    this.assertions++;
    let threw = false;
    try {
      fn();
    } catch (e) {
      threw = true;
    }
    if (!threw) throw new AssertError(`FAIL ${this.name}: ${msg} (expected exception)`);
    return true;
  }
  note(s) {
    this.notes.push(String(s));
  }
}

// 供 smoke 内部构造子用例分组（不计断言，仅日志）
export function section(title) {
  return `  · ${title}`;
}
