// 任务系统：并行（本环境单线程，按确定性顺序执行，但接口与多线程语义一致）+ 串行模式。
// 关键红线：串行模式结果必须逐位确定（用于回放/可复现）。
export class JobSystem {
  constructor(opts = {}) {
    this.threads = opts.threads || 1;
    this.stats = { dispatched: 0, completed: 0, parallel: 0, serial: 0 };
  }
  async parallel(tasks) {
    this.stats.dispatched += tasks.length;
    const r = new Array(tasks.length);
    for (let i = 0; i < tasks.length; i++) { r[i] = await tasks[i](); this.stats.completed++; }
    this.stats.parallel++;
    return r;
  }
  async serial(tasks) {
    const r = new Array(tasks.length);
    for (let i = 0; i < tasks.length; i++) r[i] = await tasks[i]();
    this.stats.serial++;
    return r;
  }
  async dispatch(fn, count) {
    const tasks = [];
    for (let i = 0; i < count; i++) { const idx = i; tasks.push(() => fn(idx)); }
    return this.parallel(tasks);
  }
}

export async function runParallel(tasks) { return new JobSystem().parallel(tasks); }
export async function runSerial(tasks) { return new JobSystem().serial(tasks); }
