// 网络复制：权威快照 + 增量（基线 + 变更）压缩 + 客户端插值 + 预测/回滚 + 回环传输。
export class LoopbackTransport {
  constructor() { this.recv = []; }
  send(msg) { for (const h of this.recv) h(msg); }
  onRecv(fn) { this.recv.push(fn); }
}

export class Replicator {
  constructor(transport) {
    this.transport = transport;
    this.state = new Map();      // 权威状态
    this.prev = null;            // 上一帧快照（用于 delta）
    this.client = new Map();     // 客户端当前状态
    this.history = [];           // 插值快照缓冲
    this.predicted = [];         // 预测帧栈
    this.bandwidth = 0;
    this.csent = 0;
    if (transport) transport.onRecv((m) => this._onMsg(m));
  }
  // —— 权威端 ——
  set(id, data) { this.state.set(id, JSON.parse(JSON.stringify(data))); }
  del(id) { this.state.delete(id); }
  snapshot() { const s = {}; for (const [k, v] of this.state) s[k] = JSON.parse(JSON.stringify(v)); return s; }

  // —— 增量编码：基线 + 变更位图（这里用 changed 列表近似）——
  encodeDelta(prev, cur) {
    const changed = [];
    for (const k in cur) if (!prev || JSON.stringify(prev[k]) !== JSON.stringify(cur[k])) changed.push([k, cur[k]]);
    const removed = [];
    if (prev) for (const k in prev) if (!(k in cur)) removed.push(k);
    const delta = { changed, removed };
    this.bandwidth += JSON.stringify(delta).length;
    return delta;
  }
  applyDelta(prev, delta) {
    const s = prev ? JSON.parse(JSON.stringify(prev)) : {};
    for (const [k, v] of delta.changed) s[k] = v;
    for (const k of delta.removed) delete s[k];
    return s;
  }
  sendSnapshot() { const snap = this.snapshot(); const delta = this.encodeDelta(this.prev, snap); this.prev = snap; this.transport && this.transport.send({ type: 'delta', delta }); return delta; }
  _onMsg(m) { if (m.type === 'delta') this.client = this.applyDelta(this.client, m.delta); }

  // —— 客户端插值 ——
  pushSnapshot(snap) { this.history.push({ t: (this.history.length ? this.history[this.history.length - 1].t : 0) + 1, snap }); if (this.history.length > 8) this.history.shift(); }
  interpolate(id, alpha) {
    if (this.history.length < 2) return JSON.parse(JSON.stringify(this.client.get ? this.client : this.client));
    const a = this.history[this.history.length - 2].snap, b = this.history[this.history.length - 1].snap;
    const out = {};
    for (const k in b) {
      if (a[k] && typeof b[k] === 'object') { const o = {}; for (const f in b[k]) o[f] = (a[k][f] ?? b[k][f]) + ((b[k][f] ?? 0) - (a[k][f] ?? 0)) * alpha; out[k] = o; }
      else out[k] = b[k];
    }
    return out;
  }

  // —— 预测 + 回滚 ——
  predict(id, inputFn) {
    const p = JSON.parse(JSON.stringify(this.client[id] || {}));
    inputFn(p);
    this.predicted.push({ id, state: JSON.parse(JSON.stringify(p)) });
    this.client[id] = p;
    return p;
  }
  reconcile(authoritative) {
    let rollback = 0;
    for (const pr of this.predicted) {
      const a = authoritative[pr.id];
      if (a && JSON.stringify(a) !== JSON.stringify(pr.state)) rollback++;
    }
    this.predicted = [];
    return rollback;
  }
  stats() { return { bandwidth: this.bandwidth, clientCount: Object.keys(this.client).length, history: this.history.length }; }
}
