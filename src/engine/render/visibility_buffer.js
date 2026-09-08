// 可见性缓冲：逐像素写入物体 id，再解析为材质 id（延迟着色前的几何阶段）。
// 自带最小 CPU 光栅（仅写 id），便于 Node smoke 验证。
import { Mat4, Vec3 } from '../core/math.js';

export function rasterIds(meshes, vp, w, h) {
  const ids = new Uint32Array(w * h);
  for (const mesh of meshes) {
    const world = mesh.transform ? Mat4.compose(Vec3.of(...(mesh.transform.position || [0, 0, 0])), Vec3.of(...(mesh.transform.rotation || [0, 0, 0])), Vec3.of(...(mesh.transform.scale || [1, 1, 1]))) : Mat4.identity();
    const mvp = vp.mul(world);
    const pos = mesh.positions, idx = mesh.indices;
    for (let t = 0; t + 2 < idx.length; t += 3) {
      const pts = [idx[t], idx[t + 1], idx[t + 2]].map(vi => {
        const X = pos[vi * 3], Y = pos[vi * 3 + 1], Z = pos[vi * 3 + 2];
        const cx = mvp.m[0] * X + mvp.m[1] * Y + mvp.m[2] * Z + mvp.m[3];
        const cy = mvp.m[4] * X + mvp.m[5] * Y + mvp.m[6] * Z + mvp.m[7];
        const cz = mvp.m[8] * X + mvp.m[9] * Y + mvp.m[10] * Z + mvp.m[11];
        const cw = mvp.m[12] * X + mvp.m[13] * Y + mvp.m[14] * Z + mvp.m[15];
        if (Math.abs(cw) < 1e-9) return null;
        return [cx / cw, cy / cw, cz / cw];
      });
      if (pts.some(p => p === null)) continue;
      const px = pts.map(p => [((p[0] * 0.5 + 0.5) * w) | 0, ((1 - (p[1] * 0.5 + 0.5)) * h) | 0]);
      const minX = Math.max(0, Math.min(...px.map(p => p[0]))), maxX = Math.min(w - 1, Math.max(...px.map(p => p[0])));
      const minY = Math.max(0, Math.min(...px.map(p => p[1]))), maxY = Math.min(h - 1, Math.max(...px.map(p => p[1])));
      const denom = (px[1][1] - px[2][1]) * (px[0][0] - px[2][0]) + (px[2][0] - px[1][0]) * (px[0][1] - px[2][1]);
      if (Math.abs(denom) < 1e-6) continue;
      for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
        const w0 = ((px[1][1] - px[2][1]) * (x - px[2][0]) + (px[2][0] - px[1][0]) * (y - px[2][1])) / denom;
        const w1 = ((px[2][1] - px[0][1]) * (x - px[2][0]) + (px[0][0] - px[2][0]) * (y - px[2][1])) / denom;
        const w2 = 1 - w0 - w1;
        if (w0 < -1e-3 || w1 < -1e-3 || w2 < -1e-3) continue;
        ids[y * w + x] = mesh.id;
      }
    }
  }
  return ids;
}

export function resolve(ids, materialForId) {
  const out = new Uint32Array(ids.length);
  for (let i = 0; i < ids.length; i++) out[i] = ids[i] ? (materialForId(ids[i]) ?? 0) : 0;
  return out;
}

export function visibleIds(ids) { return [...new Set(ids)].filter(x => x !== 0); }
