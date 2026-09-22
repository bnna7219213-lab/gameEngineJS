// 稀疏/稠密线性求解：共轭梯度法（求解 SPD 系统 A·x = b）。
const vsub = (a, b) => a.map((x, i) => x - b[i]);
const vadd = (a, b) => a.map((x, i) => x + b[i]);
const vscale = (a, s) => a.map((x) => x * s);
const vdot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const matVec = (A, x) => A.map((row) => row.reduce((s, v, j) => s + v * x[j], 0));

export function conjugateGradient(A, b, x0, iters = 200, tol = 1e-10) {
  let x = x0.slice();
  let r = vsub(b, matVec(A, x));
  let p = r.slice();
  let rs = vdot(r, r);
  if (rs < tol) return x;
  for (let k = 0; k < iters; k++) {
    const Ap = matVec(A, p);
    const ap = vdot(p, Ap);
    if (Math.abs(ap) < 1e-30) break;
    const alpha = rs / ap;
    x = vadd(x, vscale(p, alpha));
    r = vsub(r, vscale(Ap, alpha));
    const rsnew = vdot(r, r);
    if (rsnew < tol) break;
    p = vadd(r, vscale(p, rsnew / rs));
    rs = rsnew;
  }
  return x;
}
