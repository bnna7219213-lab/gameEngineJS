// half-edge 可编辑拓扑内核（v3 建模地基）。
// 纯 JS / 零 DOM / 零依赖，Node 可直接运行。
// 数据结构：
//   顶点 SoA：positions: Float32Array(3*cap) 动态倍增，_vertAlive 记录存活。
//   半边：edges 数组，每项 { v0, v1, twin, next, prev, face, alive }；twin 可为 -1（边界）。
//   面：faces 数组，每项 { edge, materialIndex, alive }；支持 n-gon（loop >= 3）。
// 渲染层消费结构见 toRenderMesh()（与 render/primitives.js 的 pack 返回格式一致）。

const WELD_EPS = 1e-6; // 顶点焊接容差

function quantKey(x, y, z, eps) {
  return `${Math.round(x / eps)},${Math.round(y / eps)},${Math.round(z / eps)}`;
}

export class HMesh {
  constructor() {
    this._cap = 64;                          // 顶点容量
    this.positions = new Float32Array(this._cap * 3);
    this._vertAlive = new Uint8Array(this._cap);
    this._liveVerts = 0;
    this.edges = [];                         // 半边（含墓碑）
    this.faces = [];                         // 面（含墓碑）
    this._liveFaces = 0;
    this._liveEdges = 0;
    this._pair = new Map();                  // "v0,v1" -> eid（仅存活半边）
  }

  // ---- 计数 ----
  get vertCount() { return this._liveVerts; }
  get faceCount() { return this._liveFaces; }
  get edgeCount() { return this._liveEdges; }

  // ---- 顶点 ----
  addVertex(x, y, z) {
    let vid = -1;
    for (let i = 0; i < this._cap; i++) { if (!this._vertAlive[i]) { vid = i; break; } }
    if (vid === -1) { // 扩容倍增
      const ncap = this._cap * 2;
      const np = new Float32Array(ncap * 3); np.set(this.positions);
      const na = new Uint8Array(ncap); na.set(this._vertAlive);
      this.positions = np; this._vertAlive = na; vid = this._cap; this._cap = ncap;
    }
    this.positions[vid * 3] = x; this.positions[vid * 3 + 1] = y; this.positions[vid * 3 + 2] = z;
    this._vertAlive[vid] = 1; this._liveVerts++;
    return vid;
  }

  vertexPos(vid) {
    return [this.positions[vid * 3], this.positions[vid * 3 + 1], this.positions[vid * 3 + 2]];
  }

  // ---- 半边内部助手 ----
  _newEdge(v0, v1) {
    const e = { v0, v1, twin: -1, next: -1, prev: -1, face: -1, alive: true };
    this.edges.push(e);
    const eid = this.edges.length - 1;
    this._pair.set(v0 + ',' + v1, eid);
    this._liveEdges++;
    return eid;
  }

  _killEdge(eid) {
    const e = this.edges[eid];
    if (!e.alive) return;
    this._pair.delete(e.v0 + ',' + e.v1);
    e.alive = false; e.twin = e.next = e.prev = e.face = -1;
    this._liveEdges--;
  }

  _linkTwin(eid) {
    const e = this.edges[eid];
    const t = this._pair.get(e.v1 + ',' + e.v0);
    if (t !== undefined && this.edges[t].alive && this.edges[t].twin === -1) {
      e.twin = t; this.edges[t].twin = eid;
    }
  }

  // ---- 建面 ----
  addFace(vids, materialIndex = 0) {
    if (!Array.isArray(vids) || vids.length < 3) throw new Error('addFace: 至少 3 个顶点');
    const n = vids.length;
    const he = [];
    for (let i = 0; i < n; i++) {
      const a = vids[i], b = vids[(i + 1) % n];
      if (!this._vertAlive[a] || !this._vertAlive[b]) throw new Error('addFace: 顶点不存活');
      if (a === b) throw new Error('addFace: 退化边');
      he.push(this._newEdge(a, b));
    }
    const fid = this.faces.length;
    this.faces.push({ edge: he[0], materialIndex, alive: true });
    this._liveFaces++;
    for (let i = 0; i < n; i++) {
      const e = this.edges[he[i]];
      e.next = he[(i + 1) % n];
      e.prev = he[(i - 1 + n) % n];
      e.face = fid;
    }
    for (const eid of he) this._linkTwin(eid);
    return fid;
  }

  // ---- 面 loop 遍历 ----
  faceLoop(fid) {
    const f = this.faces[fid];
    if (!f || !f.alive) return [];
    const out = [];
    let e = f.edge;
    do {
      out.push(e);
      e = this.edges[e].next;
    } while (e !== f.edge && e !== -1 && out.length < 1e6);
    return out;
  }

  faceVerts(fid) {
    return this.faceLoop(fid).map((e) => this.edges[e].v0);
  }

  // ---- 由三角渲染 mesh 重建（先按位置 weld，再建半边与 twin）----
  static fromRenderMesh(mesh) {
    const hm = new HMesh();
    const P = mesh.positions, I = mesh.indices;
    const map = new Map();
    const remap = new Uint32Array(mesh.vertexCount);
    for (let i = 0; i < mesh.vertexCount; i++) {
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      const k = quantKey(x, y, z, WELD_EPS);
      let vid = map.get(k);
      if (vid === undefined) { vid = hm.addVertex(x, y, z); map.set(k, vid); }
      remap[i] = vid;
    }
    for (let t = 0; t < mesh.indexCount; t += 3) {
      const a = remap[I[t]], b = remap[I[t + 1]], c = remap[I[t + 2]];
      if (a === b || b === c || a === c) continue; // 跳过 weld 后退化三角形
      hm.addFace([a, b, c], 0);
    }
    return hm;
  }

  // ---- n-gon 扇形三角化 + 逐面法线重算，输出渲染结构 ----
  toRenderMesh() {
    const P = [], N = [], U = [], I = [];
    const weld = new Map(); // (pos,normal) 量化键 -> 输出顶点，避免 cube 24->36 顶点膨胀
    const emit = (vid, n) => {
      const x = this.positions[vid * 3], y = this.positions[vid * 3 + 1], z = this.positions[vid * 3 + 2];
      const k = quantKey(x, y, z, WELD_EPS) + '|' + quantKey(n[0], n[1], n[2], 1e-4);
      let o = weld.get(k);
      if (o === undefined) {
        o = P.length / 3;
        P.push(x, y, z); N.push(n[0], n[1], n[2]); U.push(0, 0);
        weld.set(k, o);
      }
      return o;
    };
    for (let fid = 0; fid < this.faces.length; fid++) {
      const f = this.faces[fid];
      if (!f.alive) continue;
      const vs = this.faceVerts(fid);
      // Newell 法求逐面法线（对 n-gon 稳健），CCW 朝外
      let nx = 0, ny = 0, nz = 0;
      for (let i = 0; i < vs.length; i++) {
        const a = vs[i], b = vs[(i + 1) % vs.length];
        const ax = this.positions[a * 3], ay = this.positions[a * 3 + 1], az = this.positions[a * 3 + 2];
        const bx = this.positions[b * 3], by = this.positions[b * 3 + 1], bz = this.positions[b * 3 + 2];
        nx += (ay - by) * (az + bz);
        ny += (az - bz) * (ax + bx);
        nz += (ax - bx) * (ay + by);
      }
      const len = Math.hypot(nx, ny, nz) || 1;
      const n = [nx / len, ny / len, nz / len];
      const base = vs.map((v) => emit(v, n));
      for (let i = 1; i + 1 < vs.length; i++) I.push(base[0], base[i], base[i + 1]); // 扇形三角化
    }
    return {
      positions: new Float32Array(P), normals: new Float32Array(N), uvs: new Float32Array(U),
      indices: new Uint32Array(I), vertexCount: P.length / 3, indexCount: I.length,
    };
  }

  // ---- 边中点插入顶点，正确重连 next/prev/twin/face ----
  splitEdge(eid) {
    const e = this.edges[eid];
    if (!e || !e.alive) throw new Error('splitEdge: 边不存活');
    const a = e.v0, b = e.v1;
    const pa = this.vertexPos(a), pb = this.vertexPos(b);
    const m = this.addVertex((pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, (pa[2] + pb[2]) / 2);

    // 原边 a->b 截为 a->m，新建 e2: m->b 接在同一 face loop 中
    this._pair.delete(a + ',' + b);
    e.v1 = m;
    this._pair.set(a + ',' + m, eid);
    const e2 = this._newEdge(m, b);
    const e2o = this.edges[e2];
    e2o.face = e.face; e2o.next = e.next; e2o.prev = eid;
    this.edges[e.next].prev = e2;
    e.next = e2;

    const t = e.twin;
    if (t !== -1) {
      // twin 侧 b->a 截为 b->m，新建 t2: m->a
      const to = this.edges[t];
      this._pair.delete(b + ',' + a);
      to.v1 = m;
      this._pair.set(b + ',' + m, t);
      const t2 = this._newEdge(m, a);
      const t2o = this.edges[t2];
      t2o.face = to.face; t2o.next = to.next; t2o.prev = t;
      this.edges[to.next].prev = t2;
      to.next = t2;
      // twin 互指重接：e(a->m)<->t2(m->a)，e2(m->b)<->t(b->m)
      e.twin = t2; t2o.twin = eid;
      e2o.twin = t; to.twin = e2;
    } else {
      e.twin = -1; e2o.twin = -1; // 边界边
    }
    return { v: m, e: e2 };
  }

  // ---- 删面并清理孤立半边/顶点 ----
  deleteFace(fid) {
    const f = this.faces[fid];
    if (!f || !f.alive) return;
    const loop = this.faceLoop(fid);
    f.alive = false; f.edge = -1; this._liveFaces--;
    for (const eid of loop) {
      const e = this.edges[eid];
      if (!e.alive) continue;
      const t = e.twin;
      if (t !== -1 && this.edges[t].alive) {
        const tf = this.edges[t].face;
        if (tf !== -1 && this.faces[tf].alive) {
          // 邻面仍存活：twin 变边界，本半边死亡
          this.edges[t].twin = -1;
          this._killEdge(eid);
        } else {
          this._killEdge(t); this._killEdge(eid); // 两侧都无面，整边删除
        }
      } else {
        this._killEdge(eid);
      }
    }
    this._collectOrphanVerts();
  }

  // 清理没有任何存活半边引用的顶点
  _collectOrphanVerts() {
    const used = new Uint8Array(this._cap);
    for (const e of this.edges) if (e.alive) { used[e.v0] = 1; used[e.v1] = 1; }
    for (let v = 0; v < this._cap; v++) {
      if (this._vertAlive[v] && !used[v]) { this._vertAlive[v] = 0; this._liveVerts--; }
    }
  }

  // ---- 拓扑合并顶点：removeVid 所有引用改指 keepVid，退化边/面随之清理 ----
  mergeVerts(keepVid, removeVid) {
    if (keepVid === removeVid) return;
    if (!this._vertAlive[keepVid] || !this._vertAlive[removeVid]) throw new Error('mergeVerts: 顶点不存活');
    for (let eid = 0; eid < this.edges.length; eid++) {
      const e = this.edges[eid];
      if (!e.alive) continue;
      if (e.v0 === removeVid) { this._pair.delete(e.v0 + ',' + e.v1); e.v0 = keepVid; }
      if (e.v1 === removeVid) { this._pair.delete(e.v0 + ',' + e.v1); e.v1 = keepVid; }
      if (e.alive) this._pair.set(e.v0 + ',' + e.v1, eid);
    }
    this._vertAlive[removeVid] = 0; this._liveVerts--;
    // 清理退化边（v0==v1）：从 loop 中摘除，连同 twin 一起杀死
    let changed = true;
    while (changed) {
      changed = false;
      for (let eid = 0; eid < this.edges.length; eid++) {
        const e = this.edges[eid];
        if (!e.alive || e.v0 !== e.v1) continue;
        const t = e.twin;
        const fid = e.face;
        if (this.edges[e.next].alive) { this.edges[e.prev].next = e.next; this.edges[e.next].prev = e.prev; }
        if (fid !== -1 && this.faces[fid].alive) {
          const rest = this.faceLoop(fid).filter((x) => x !== eid && this.edges[x].alive);
          if (rest.length < 3) { this.faces[fid].alive = false; this._liveFaces--; }
          else this.faces[fid].edge = rest[0];
        }
        if (t !== -1 && this.edges[t].alive) {
          const to = this.edges[t];
          const tf = to.face;
          if (this.edges[to.next].alive) { this.edges[to.prev].next = to.next; this.edges[to.next].prev = to.prev; }
          if (tf !== -1 && this.faces[tf].alive) {
            const rest = this.faceLoop(tf).filter((x) => x !== t && this.edges[x].alive);
            if (rest.length < 3) { this.faces[tf].alive = false; this._liveFaces--; }
            else this.faces[tf].edge = rest[0];
          }
          this._killEdge(t);
        }
        this._killEdge(eid);
        changed = true;
        break; // 索引失效，重新扫描
      }
    }
    // twin 重链：同一对顶点可能出现重复半边，尽量互配
    for (let eid = 0; eid < this.edges.length; eid++) {
      const e = this.edges[eid];
      if (e.alive && e.twin === -1) this._linkTwin(eid);
    }
    this._collectOrphanVerts();
  }

  // ---- 不变量检查 ----
  validate() {
    const errors = [];
    for (let eid = 0; eid < this.edges.length; eid++) {
      const e = this.edges[eid];
      if (!e.alive) continue;
      if (!this._vertAlive[e.v0] || !this._vertAlive[e.v1]) errors.push(`edge ${eid}: 引用死亡顶点`);
      if (e.v0 === e.v1) errors.push(`edge ${eid}: 退化边 v0==v1`);
      if (e.twin !== -1) {
        const t = this.edges[e.twin];
        if (!t || !t.alive) errors.push(`edge ${eid}: twin 死亡/缺失`);
        else {
          if (t.twin !== eid) errors.push(`edge ${eid}: twin 不互指`);
          if (t.v0 !== e.v1 || t.v1 !== e.v0) errors.push(`edge ${eid}: twin 端点不反向`);
        }
      }
      const nx = this.edges[e.next], pv = this.edges[e.prev];
      if (!nx || !nx.alive) errors.push(`edge ${eid}: next 死亡/缺失`);
      else if (nx.prev !== eid) errors.push(`edge ${eid}: next.prev 不回指`);
      if (!pv || !pv.alive) errors.push(`edge ${eid}: prev 死亡/缺失`);
      else if (pv.next !== eid) errors.push(`edge ${eid}: prev.next 不回指`);
      if (nx && nx.alive && nx.face !== e.face) errors.push(`edge ${eid}: next.face 不一致`);
      if (e.face !== -1) {
        const f = this.faces[e.face];
        if (!f || !f.alive) errors.push(`edge ${eid}: face 死亡/缺失`);
      }
    }
    for (let fid = 0; fid < this.faces.length; fid++) {
      const f = this.faces[fid];
      if (!f.alive) continue;
      const start = f.edge;
      const se = this.edges[start];
      if (!se || !se.alive || se.face !== fid) { errors.push(`face ${fid}: face.edge 无效`); continue; }
      // loop 闭合检查
      let e = start, n = 0;
      do {
        e = this.edges[e].next; n++;
        if (n > this.edges.length + 1) { errors.push(`face ${fid}: loop 不闭合`); break; }
      } while (e !== start && e !== -1);
      if (e !== start) errors.push(`face ${fid}: loop 未回到起点`);
      else if (n < 3) errors.push(`face ${fid}: loop 长度 ${n} < 3`);
    }
    // 存活计数一致性
    let ec = 0, fc = 0, vc = 0;
    for (const e of this.edges) if (e.alive) ec++;
    for (const f of this.faces) if (f.alive) fc++;
    for (let v = 0; v < this._cap; v++) vc += this._vertAlive[v];
    if (ec !== this._liveEdges) errors.push(`edgeCount 不一致: ${ec} != ${this._liveEdges}`);
    if (fc !== this._liveFaces) errors.push(`faceCount 不一致: ${fc} != ${this._liveFaces}`);
    if (vc !== this._liveVerts) errors.push(`vertCount 不一致: ${vc} != ${this._liveVerts}`);
    return { ok: errors.length === 0, errors };
  }
}

export default HMesh;
