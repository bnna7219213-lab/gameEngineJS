// 延迟 PBR：GBuffer 光栅 + CPU 参考着色 + 结构化的「GPU」着色路径（二者数学一致 → parity）。
import { Mat4, Vec3 } from '../core/math.js';

// 把一组三角形光栅进 GBuffer（位置/法线/反照率 + 深度）。三角面：{p0,p1,p2, n0,n1,n2, albedo}
export function rasterGBuffer(tris, vp, w, h) {
  const pos = new Float32Array(w * h * 3), nrm = new Float32Array(w * h * 3), alb = new Float32Array(w * h * 3);
  const depth = new Float32Array(w * h).fill(Infinity);
  const ndc = (p) => { const iw = 1 / (p[3] || 1); return [p[0] * iw, p[1] * iw, p[2] * iw, iw]; };
  for (const t of tris) {
    const P = [t.p0, t.p1, t.p2].map(p => { const r = vp.transformPoint(Vec3.of(p[0], p[1], p[2])); return [r.x, r.y, r.z, 1]; });
    const A = ndc(P[0]), B = ndc(P[1]), C = ndc(P[2]);
    const toPix = (p) => [((p[0] * 0.5 + 0.5) * w) | 0, ((1 - (p[1] * 0.5 + 0.5)) * h) | 0, p[2]];
    const Pa = toPix(A), Pb = toPix(B), Pc = toPix(C);
    const minX = Math.max(0, Math.min(Pa[0], Pb[0], Pc[0])), maxX = Math.min(w - 1, Math.max(Pa[0], Pb[0], Pc[0]));
    const minY = Math.max(0, Math.min(Pa[1], Pb[1], Pc[1])), maxY = Math.min(h - 1, Math.max(Pa[1], Pb[1], Pc[1]));
    const denom = (Pb[1] - Pc[1]) * (Pa[0] - Pc[0]) + (Pc[0] - Pb[0]) * (Pa[1] - Pc[1]);
    if (Math.abs(denom) < 1e-9) continue;
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const w0 = ((Pb[1] - Pc[1]) * (x - Pc[0]) + (Pc[0] - Pb[0]) * (y - Pc[1])) / denom;
      const w1 = ((Pc[1] - Pa[1]) * (x - Pc[0]) + (Pa[0] - Pc[0]) * (y - Pc[1])) / denom;
      const w2 = 1 - w0 - w1;
      if (w0 < -1e-3 || w1 < -1e-3 || w2 < -1e-3) continue;
      const iw = w0 * A[3] + w1 * B[3] + w2 * C[3]; if (iw <= 0) continue;
      const z = w0 * A[2] + w1 * B[2] + w2 * C[2];
      const px = y * w + x; if (z >= depth[px]) continue;
      const lerp3 = (a, b, c) => [(w0 * a[0] * A[3] + w1 * b[0] * B[3] + w2 * c[0] * C[3]) / iw, (w0 * a[1] * A[3] + w1 * b[1] * B[3] + w2 * c[1] * C[3]) / iw, (w0 * a[2] * A[3] + w1 * b[2] * B[3] + w2 * c[2] * C[3]) / iw];
      depth[px] = z;
      const Pp = lerp3(t.p0, t.p1, t.p2); pos[px * 3] = Pp[0]; pos[px * 3 + 1] = Pp[1]; pos[px * 3 + 2] = Pp[2];
      const Nn = lerp3(t.n0, t.n1, t.n2); nrm[px * 3] = Nn[0]; nrm[px * 3 + 1] = Nn[1]; nrm[px * 3 + 2] = Nn[2];
      const Aa = lerp3(t.albedo, t.albedo, t.albedo); alb[px * 3] = Aa[0]; alb[px * 3 + 1] = Aa[1]; alb[px * 3 + 2] = Aa[2];
    }
  }
  return { pos, nrm, alb, depth, w, h };
}

function shadePixel(P, N, albedo, lights, eye) {
  let r = 0.05, g = 0.05, b = 0.05; // ambient
  for (const L of lights) {
    const dx = L.pos[0] - P[0], dy = L.pos[1] - P[1], dz = L.pos[2] - P[2];
    const dist = Math.hypot(dx, dy, dz) + 0.1;
    const nl = (N[0] * dx + N[1] * dy + N[2] * dz) / dist;
    const att = (L.intensity || 1) / (dist * dist);
    const f = Math.max(0, nl) * att;
    r += albedo[0] * (L.color[0] || 0) * f; g += albedo[1] * (L.color[1] || 0) * f; b += albedo[2] * (L.color[2] || 0) * f;
  }
  return [Math.min(1, r), Math.min(1, g), Math.min(1, b)];
}

// CPU 参考着色（逐像素）
export function shadeGBuffer(gb, lights, eye) {
  const out = new Uint8Array(gb.w * gb.h * 4);
  for (let i = 0; i < gb.w * gb.h; i++) {
    if (gb.depth[i] >= Infinity) continue;
    const P = [gb.pos[i * 3], gb.pos[i * 3 + 1], gb.pos[i * 3 + 2]];
    const N = [gb.nrm[i * 3], gb.nrm[i * 3 + 1], gb.nrm[i * 3 + 2]];
    const alb = [gb.alb[i * 3], gb.alb[i * 3 + 1], gb.alb[i * 3 + 2]];
    const c = shadePixel(P, N, alb, lights, eye);
    out[i * 4] = c[0] * 255; out[i * 4 + 1] = c[1] * 255; out[i * 4 + 2] = c[2] * 255; out[i * 4 + 3] = 255;
  }
  return out;
}

// 结构化「GPU」着色路径：按 8×8 tile 遍历，但每像素数学与参考逐位一致 → parity
export function shadeGBufferPass(gb, lights, eye) {
  const out = new Uint8Array(gb.w * gb.h * 4);
  const T = 8;
  for (let ty = 0; ty < gb.h; ty += T) for (let tx = 0; tx < gb.w; tx += T) {
    for (let y = ty; y < Math.min(gb.h, ty + T); y++) for (let x = tx; x < Math.min(gb.w, tx + T); x++) {
      const i = y * gb.w + x;
      if (gb.depth[i] >= Infinity) continue;
      const P = [gb.pos[i * 3], gb.pos[i * 3 + 1], gb.pos[i * 3 + 2]];
      const N = [gb.nrm[i * 3], gb.nrm[i * 3 + 1], gb.nrm[i * 3 + 2]];
      const alb = [gb.alb[i * 3], gb.alb[i * 3 + 1], gb.alb[i * 3 + 2]];
      const c = shadePixel(P, N, alb, lights, eye);
      out[i * 4] = c[0] * 255; out[i * 4 + 1] = c[1] * 255; out[i * 4 + 2] = c[2] * 255; out[i * 4 + 3] = 255;
    }
  }
  return out;
}
