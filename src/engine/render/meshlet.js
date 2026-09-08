// Meshlet：构建 + 视锥剔除。CPU 参考（与 GPU mesh shader 行为一致）。
import { AABB, Vec3, Frustum } from '../core/math.js';

export function buildMeshlets(mesh, { maxVerts = 64, maxPrims = 124 } = {}) {
  const idx = mesh.indices || new Uint32Array(0);
  const pos = mesh.positions;
  const out = [];
  let unique = [], remap = new Map(), prim = 0;
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  const resetBounds = () => { mn = [Infinity, Infinity, Infinity]; mx = [-Infinity, -Infinity, -Infinity]; };
  const expand = (v) => { for (let c = 0; c < 3; c++) { mn[c] = Math.min(mn[c], v[c]); mx[c] = Math.max(mx[c], v[c]); } };
  for (let i = 0; i < idx.length; i += 3) {
    const tri = [idx[i], idx[i + 1], idx[i + 2]];
    for (const x of tri) {
      if (!remap.has(x)) { remap.set(x, unique.length); unique.push(x); const v = [pos[x * 3], pos[x * 3 + 1], pos[x * 3 + 2]]; expand(v); }
    }
    prim++;
    const flush = unique.length >= maxVerts || prim >= maxPrims || i + 3 >= idx.length;
    if (flush) {
      const local = tri.map(x => remap.get(x));
      out.push({
        vertices: unique.slice(), indices: local.slice(), primCount: Math.ceil(local.length / 3),
        aabb: { min: mn.slice(), max: mx.slice() },
      });
      unique = []; remap = new Map(); prim = 0; resetBounds();
    }
  }
  return out;
}

export function cullMeshlets(meshlets, frustum) {
  return meshlets.filter(m => frustum.intersects(new AABB(Vec3.of(...m.aabb.min), Vec3.of(...m.aabb.max))));
}

export function frustumFromVP(vp) { return Frustum.fromViewProj(vp); }
