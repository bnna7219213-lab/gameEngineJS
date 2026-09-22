// 编辑模式拾取（v3 M-B）：顶点/边/面的 CPU 射线拾取与屏幕点选。
// 对标 Blender Edit Mode 的点选（VERT/EDGE/FACE 三种选择模式）。
// 纯 JS / 零 DOM / 零依赖，Node 可测。渲染 mesh 结构 = { positions, indices }。
// 依赖 Viewport3D.ray(sx,sy) 提供世界空间射线；本模块只做几何求交，不触碰渲染。

// ---- 射线-三角形求交（Möller–Trumbore）----
// 返回最近交点距离 t，未命中返回 null。
export function rayTriangle(ro, rd, a, b, c) {
  const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
  const acx = c[0] - a[0], acy = c[1] - a[1], acz = c[2] - a[2];
  const px = rd[1] * acz - rd[2] * acy, py = rd[2] * acx - rd[0] * acz, pz = rd[0] * acy - rd[1] * acx;
  const det = abx * px + aby * py + abz * pz;
  if (Math.abs(det) < 1e-12) return null; // 平行
  const inv = 1 / det;
  const tx = ro[0] - a[0], ty = ro[1] - a[1], tz = ro[2] - a[2];
  const u = (tx * px + ty * py + tz * pz) * inv;
  if (u < 0 || u > 1) return null;
  const qx = ty * abz - tz * aby, qy = tz * abx - tx * abz, qz = tx * aby - ty * abx;
  const v = (rd[0] * qx + rd[1] * qy + rd[2] * qz) * inv;
  if (v < 0 || u + v > 1) return null;
  const tt = (acx * qx + acy * qy + acz * qz) * inv;
  return tt > 1e-6 ? tt : null;
}

// ---- 屏幕空间距离 ----
export function pointToSegmentDist2D(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

// ---- 拾取器：对单个 mesh 做顶点/边/面选择 ----
// mesh: { positions, indices }（本地空间）；transform: {position,rotation,scale} 或 null。
// project: (worldPos)->{x,y}（Viewport3D.project）；ray: (sx,sy)->{o,d}（Viewport3D.ray）。
export class MeshPicker {
  constructor(mesh, transform, project, ray) {
    this.mesh = mesh; this.transform = transform;
    this.project = project; this.ray = ray;
    this._world = null; // 惰性缓存世界坐标顶点
  }
  _worldVerts() {
    if (this._world) return this._world;
    const P = this.mesh.positions, n = P.length / 3, out = new Float32Array(n * 3);
    const tp = (this.transform && this.transform.position) || [0, 0, 0];
    for (let i = 0; i < n; i++) { out[i * 3] = P[i * 3] + tp[0]; out[i * 3 + 1] = P[i * 3 + 1] + tp[1]; out[i * 3 + 2] = P[i * 3 + 2] + tp[2]; }
    this._world = out; return out;
  }
  invalidate() { this._world = null; } // 网格变更后调用

  // 拾取顶点：屏幕点到各顶点投影点最近且 < tol（像素）。
  pickVertex(sx, sy, tol = 8) {
    const W = this._worldVerts(), n = W.length / 3;
    let best = -1, bestD = tol;
    for (let i = 0; i < n; i++) {
      const p = this.project([W[i * 3], W[i * 3 + 1], W[i * 3 + 2]]);
      const d = Math.hypot(p.x - sx, p.y - sy);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  // 拾取边：屏幕点到各边投影线段最近且 < tol。返回三角形边索引对 {tri, edge, a, b}。
  pickEdge(sx, sy, tol = 8) {
    const W = this._worldVerts(), I = this.mesh.indices;
    let best = null, bestD = tol;
    for (let k = 0; k < I.length; k += 3) {
      const tri = [I[k], I[k + 1], I[k + 2]];
      const edges = [[tri[0], tri[1]], [tri[1], tri[2]], [tri[2], tri[0]]];
      for (let e = 0; e < 3; e++) {
        const a = edges[e][0], b = edges[e][1];
        const pa = this.project([W[a * 3], W[a * 3 + 1], W[a * 3 + 2]]);
        const pb = this.project([W[b * 3], W[b * 3 + 1], W[b * 3 + 2]]);
        const d = pointToSegmentDist2D(sx, sy, pa.x, pa.y, pb.x, pb.y);
        if (d < bestD) { bestD = d; best = { tri: k / 3, edge: e, a, b }; }
      }
    }
    return best;
  }

  // 拾取面：世界射线与各三角形求交，返回最近 {tri, t}。
  pickFace(sx, sy) {
    const { o, d } = this.ray(sx, sy);
    const W = this._worldVerts(), I = this.mesh.indices;
    let best = null, bestT = Infinity;
    for (let k = 0; k < I.length; k += 3) {
      const a = I[k], b = I[k + 1], c = I[k + 2];
      const t = rayTriangle(o, d,
        [W[a * 3], W[a * 3 + 1], W[a * 3 + 2]],
        [W[b * 3], W[b * 3 + 1], W[b * 3 + 2]],
        [W[c * 3], W[c * 3 + 1], W[c * 3 + 2]]);
      if (t != null && t < bestT) { bestT = t; best = { tri: k / 3, t }; }
    }
    return best;
  }

  // 统一入口：按选择模式分派
  pick(mode, sx, sy, tol = 8) {
    if (mode === 'VERT') { const v = this.pickVertex(sx, sy, tol); return v >= 0 ? { type: 'VERT', index: v } : null; }
    if (mode === 'EDGE') { const e = this.pickEdge(sx, sy, tol); return e ? { type: 'EDGE', ...e } : null; }
    if (mode === 'FACE') { const f = this.pickFace(sx, sy); return f ? { type: 'FACE', ...f } : null; }
    throw new Error('MeshPicker.pick: 非法模式 ' + mode);
  }
}
