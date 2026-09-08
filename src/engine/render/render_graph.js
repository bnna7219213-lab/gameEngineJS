// 渲染图：节点 + 边 + 拓扑排序 + 环检测 + 按序执行（带 barrier 语义）。
export class RenderGraph {
  constructor() { this.nodes = new Map(); this.edges = []; this.resources = new Map(); }
  addNode(id, fn) { this.nodes.set(id, { id, fn }); return id; }
  addEdge(from, to) { this.edges.push([from, to]); }
  // 拓扑排序（Kahn）。存在环则抛错。
  order() {
    const indeg = new Map();
    for (const id of this.nodes.keys()) indeg.set(id, 0);
    for (const [f, t] of this.edges) indeg.set(t, (indeg.get(t) || 0) + 1);
    const q = [...this.nodes.keys()].filter(n => indeg.get(n) === 0);
    const out = [];
    while (q.length) {
      const n = q.shift(); out.push(n);
      for (const [f, t] of this.edges) if (f === n) { indeg.set(t, indeg.get(t) - 1); if (indeg.get(t) === 0) q.push(t); }
    }
    if (out.length !== this.nodes.size) throw new Error('RenderGraph: cycle detected (nodes=' + this.nodes.size + ', ordered=' + out.length + ')');
    return out;
  }
  async run(ctx = {}) {
    const order = this.order();
    for (const id of order) { const n = this.nodes.get(id); if (n.fn) await n.fn(ctx, this); }
  }
  // 同步执行（节点均为同步函数时等价于 run，但保持调用方同步语义）
  runSync(ctx = {}) {
    const order = this.order();
    for (const id of order) { const n = this.nodes.get(id); if (n.fn) n.fn(ctx, this); }
    return ctx;
  }
}
