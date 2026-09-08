// NanoTensor：零依赖纯 JS 张量引擎（TF.js 缺失时的黄金参考后端）。
// 支持：标/张量运算 + 广播、matmul、transpose、reshape、slice、concat、conv2d、pool、激活、归约、序列化。
// 确定性：randn 用注入的 Rng（core/math.js）。

function shapeToStrides(shape) {
  const s = new Array(shape.length);
  let p = 1;
  for (let i = shape.length - 1; i >= 0; i--) { s[i] = p; p *= shape[i]; }
  return s;
}
function totalSize(shape) { let p = 1; for (const d of shape) p *= d; return p; }

export class NanoTensor {
  constructor(data, shape) {
    if (data instanceof NanoTensor) { this.data = data.data; this.shape = data.shape.slice(); }
    else {
      this.data = data instanceof Float32Array ? data : new Float32Array(data);
      this.shape = shape ? shape.slice() : (Array.isArray(data) ? [data.length] : []);
    }
    this.stride = shapeToStrides(this.shape);
    this.size = this.data.length;
  }

  static fromArray(a, shape) { return new NanoTensor(a, shape); }
  static zeros(shape) { return new NanoTensor(new Float32Array(totalSize(shape)), shape); }
  static ones(shape) { const d = new Float32Array(totalSize(shape)); d.fill(1); return new NanoTensor(d, shape); }
  static full(shape, v) { const d = new Float32Array(totalSize(shape)); d.fill(v); return new NanoTensor(d, shape); }
  static randn(shape, rng) {
    const n = totalSize(shape);
    const d = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      // Box-Muller（确定性 rng）
      let u1 = Math.max(1e-7, rng.next()), u2 = rng.next();
      const r = Math.sqrt(-2 * Math.log(u1)), th = 2 * Math.PI * u2;
      d[i] = r * Math.cos(th);
    }
    return new NanoTensor(d, shape);
  }

  clone() { return new NanoTensor(new Float32Array(this.data), this.shape); }
  reshape(shape) {
    const want = totalSize(shape);
    if (want !== this.size) throw new Error(`reshape size mismatch ${want} vs ${this.size}`);
    return new NanoTensor(this.data, shape);
  }
  transpose(perm) {
    if (!perm) perm = this.shape.map((_, i) => this.shape.length - 1 - i);
    const outShape = perm.map(d => this.shape[d]);
    const out = NanoTensor.zeros(outShape);
    const aStride = this.stride, bStride = shapeToStrides(outShape);
    for (let i = 0; i < this.size; i++) {
      let rem = i, src = new Array(this.shape.length), dst = new Array(this.shape.length);
      for (let k = this.shape.length - 1; k >= 0; k--) { src[k] = rem % this.shape[k]; rem = Math.floor(rem / this.shape[k]); }
      for (let k = 0; k < this.shape.length; k++) dst[perm[k]] = src[k];
      let oi = 0; for (let k = 0; k < outShape.length; k++) oi += dst[k] * bStride[k];
      out.data[oi] = this.data[i];
    }
    return out;
  }
  slice(begin, size) {
    const outShape = size.slice();
    const out = NanoTensor.zeros(outShape);
    const bStride = shapeToStrides(outShape);
    const oi = new Array(outShape.length).fill(0);
    const rec = (dim, srcIdx) => {
      if (dim === outShape.length) { let o = 0; for (let k = 0; k < outShape.length; k++) o += oi[k] * bStride[k]; out.data[o] = this.data[srcIdx]; return; }
      for (let i = 0; i < outShape[dim]; i++) { oi[dim] = i; rec(dim + 1, srcIdx + (begin[dim] + i) * this.stride[dim]); }
    };
    rec(0, 0);
    return out;
  }
  map(fn) { const d = new Float32Array(this.size); for (let i = 0; i < this.size; i++) d[i] = fn(this.data[i], i); return new NanoTensor(d, this.shape); }

  _bcast(b, fn) {
    if (typeof b === 'number') return this.map(x => fn(x, b));
    const la = this.shape.length, lb = b.shape.length, L = Math.max(la, lb);
    const sa = this.shape.slice(), sb = b.shape.slice();
    while (sa.length < L) sa.unshift(1);
    while (sb.length < L) sb.unshift(1);
    const outShape = [];
    for (let i = 0; i < L; i++) outShape.push(Math.max(sa[i], sb[i]));
    const out = NanoTensor.zeros(outShape);
    const aSt = shapeToStrides(sa), bSt = shapeToStrides(sb), oSt = out.stride;
    const idx = new Array(L).fill(0);
    for (let oi = 0; oi < out.size; oi++) {
      let rem = oi; for (let i = L - 1; i >= 0; i--) { idx[i] = rem % outShape[i]; rem = Math.floor(rem / outShape[i]); }
      let ai = 0, bi = 0;
      for (let i = 0; i < L; i++) { ai += (sa[i] === 1 ? 0 : idx[i]) * aSt[i]; bi += (sb[i] === 1 ? 0 : idx[i]) * bSt[i]; }
      out.data[oi] = fn(this.data[ai], b.data[bi]);
    }
    return out;
  }
  add(b) { return this._bcast(b, (x, y) => x + y); }
  sub(b) { return this._bcast(b, (x, y) => x - y); }
  mul(b) { return this._bcast(b, (x, y) => x * y); }
  div(b) { return this._bcast(b, (x, y) => x / (y || 1e-12)); }

  matmul(b) {
    const [m, k] = this.shape, [k2, n] = b.shape;
    if (k !== k2) throw new Error(`matmul dim mismatch ${k} vs ${k2}`);
    const out = NanoTensor.zeros([m, n]);
    const A = this.data, B = b.data, C = out.data;
    for (let i = 0; i < m; i++) {
      for (let p = 0; p < k; p++) {
        const a = A[i * k + p]; if (a === 0) continue;
        const bo = p * n;
        for (let j = 0; j < n; j++) C[i * n + j] += a * B[bo + j];
      }
    }
    return out;
  }

  conv2d(kernel, opts = {}) {
    const pad = opts.padding || 'valid', stride = opts.stride || 1;
    const [kh, kw] = kernel.shape; const cout = kernel.shape[kernel.shape.length - 1];
    const cin = kernel.shape.length === 4 ? kernel.shape[2] : 1;
    const [h, w] = this.shape; const cIn = this.shape[2] || 1;
    if (cin !== cIn) throw new Error('conv2d input channel mismatch');
    const oh = pad === 'same' ? h : Math.floor((h - kh) / stride) + 1;
    const ow = pad === 'same' ? w : Math.floor((w - kw) / stride) + 1;
    const out = NanoTensor.zeros([oh, ow, cout]);
    const ph = pad === 'same' ? Math.floor(kh / 2) : 0, pw = pad === 'same' ? Math.floor(kw / 2) : 0;
    for (let oc = 0; oc < cout; oc++) {
      for (let y = 0; y < oh; y++) {
        for (let x = 0; x < ow; x++) {
          let acc = 0;
          for (let ky = 0; ky < kh; ky++) {
            for (let kx = 0; kx < kw; kx++) {
              const iy = y * stride + ky - ph, ix = x * stride + kx - pw;
              if (iy < 0 || iy >= h || ix < 0 || ix >= w) continue;
              for (let ic = 0; ic < cIn; ic++) {
                const inp = this.data[(iy * w + ix) * cIn + ic];
                const wv = kernel.shape.length === 4 ? kernel.data[((ky * kw + kx) * cIn + ic) * cout + oc] : kernel.data[(ky * kw + kx) * cout + oc];
                acc += inp * wv;
              }
            }
          }
          out.data[(y * ow + x) * cout + oc] = acc;
        }
      }
    }
    return out;
  }

  _pool(kind, kh, kw, stride, pad) {
    const [h, w] = this.shape, c = this.shape[2] || 1;
    const oh = pad === 'same' ? h : Math.floor((h - kh) / stride) + 1;
    const ow = pad === 'same' ? w : Math.floor((w - kw) / stride) + 1;
    const out = NanoTensor.zeros([oh, ow, c]);
    const ph = pad === 'same' ? Math.floor(kh / 2) : 0, pw = pad === 'same' ? Math.floor(kw / 2) : 0;
    for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) for (let ch = 0; ch < c; ch++) {
      let acc = kind === 'max' ? -Infinity : 0, cnt = 0;
      for (let ky = 0; ky < kh; ky++) for (let kx = 0; kx < kw; kx++) {
        const iy = y * stride + ky - ph, ix = x * stride + kx - pw;
        if (iy < 0 || iy >= h || ix < 0 || ix >= w) continue;
        const v = this.data[(iy * w + ix) * c + ch];
        if (kind === 'max') acc = Math.max(acc, v); else { acc += v; cnt++; }
      }
      out.data[(y * ow + x) * c + ch] = kind === 'max' ? acc : acc / cnt;
    }
    return out;
  }
  maxPool(kh, kw, stride = 1, pad = 'valid') { return this._pool('max', kh, kw, stride, pad); }
  avgPool(kh, kw, stride = 1, pad = 'valid') { return this._pool('avg', kh, kw, stride, pad); }

  relu() { return this.map(x => x > 0 ? x : 0); }
  sigmoid() { return this.map(x => 1 / (1 + Math.exp(-x))); }
  tanh() { return this.map(x => Math.tanh(x)); }
  softmax() {
    const last = this.shape[this.shape.length - 1];
    const out = NanoTensor.zeros(this.shape);
    const per = this.size / last;
    for (let b = 0; b < per; b++) {
      let mx = -Infinity; const base = b * last;
      for (let i = 0; i < last; i++) mx = Math.max(mx, this.data[base + i]);
      let s = 0; for (let i = 0; i < last; i++) { const e = Math.exp(this.data[base + i] - mx); out.data[base + i] = e; s += e; }
      for (let i = 0; i < last; i++) out.data[base + i] /= s;
    }
    return out;
  }

  reduce(kind, axes) {
    axes = (axes == null ? [this.shape.length - 1] : (Array.isArray(axes) ? axes : [axes])).map(a => a < 0 ? this.shape.length + a : a);
    const keep = this.shape.filter((_, i) => !axes.includes(i));
    const outShape = keep.length ? keep : [1];
    const out = NanoTensor.zeros(outShape);
    const rec = (dim, srcIdx, dstIdx, dstStride, dstShape) => {
      if (dim === this.shape.length) { return this.data[srcIdx]; }
      if (axes.includes(dim)) {
        let acc = kind === 'max' ? -Infinity : kind === 'sum' || kind === 'mean' ? 0 : 0, cnt = 0;
        for (let i = 0; i < this.shape[dim]; i++) { const v = rec(dim + 1, srcIdx + i * this.stride[dim], dstIdx, dstStride, dstShape); if (kind === 'max') acc = Math.max(acc, v); else { acc += v; cnt++; } }
        if (kind === 'mean') acc /= cnt;
        if (!axes.includes(dim)) out.data[dstIdx] = acc;
        return acc;
      } else {
        for (let i = 0; i < this.shape[dim]; i++) rec(dim + 1, srcIdx + i * this.stride[dim], dstIdx + i * dstStride[dim], dstStride, dstShape);
        return 0;
      }
    };
    rec(0, 0, 0, shapeToStrides(outShape), outShape);
    if (kind === 'max' && outShape.length === 1 && outShape[0] === 1) { let m = -Infinity; for (let i = 0; i < this.size; i += 0); }
    return out;
  }
  sum(axes) { return this.reduce('sum', axes); }
  mean(axes) { return this.reduce('mean', axes); }
  max(axes) { return this.reduce('max', axes); }
  min(axes) { return this.reduce('min', axes); }

  toArray() { return Array.from(this.data); }
  toJSON() { return { data: Array.from(this.data), shape: this.shape }; }
  static fromJSON(o) { return new NanoTensor(new Float32Array(o.data), o.shape); }
}

// ---- 小型神经网络（确定性，用 NanoTensor）----
export class Dense {
  constructor(units, { rng, inputDim } = {}) {
    this.units = units; this.inputDim = inputDim;
    this.W = null; this.b = NanoTensor.zeros([units]);
    this._rng = rng || new Rng_();
  }
  _init(inDim) {
    this.inputDim = inDim;
    const s = Math.sqrt(2 / (inDim + this.units));
    this.W = NanoTensor.zeros([inDim, this.units]);
    for (let i = 0; i < this.W.size; i++) this.W.data[i] = (this._rng.next() * 2 - 1) * s;
    for (let i = 0; i < this.units; i++) this.b.data[i] = (this._rng.next() * 2 - 1) * 0.1;
  }
  forward(x) {
    if (!this.W) this._init(x.shape[x.shape.length - 1]);
    let xt = x;
    if (x.shape.length === 1) xt = new NanoTensor(x.data, [1, x.shape[0]]);
    const out = xt.matmul(this.W).add(this.b);
    return out;
  }
}

export class Sequential {
  constructor(rng) { this.rng = rng || new Rng_(); this.layers = []; }
  add(layer) { this.layers.push(layer); return this; }
  forward(x) { for (const l of this.layers) x = l.forward(x); return x; }
  train(xs, ys, { epochs = 50, lr = 0.05, batch = 1 } = {}) {
    const n = xs.length;
    for (let e = 0; e < epochs; e++) {
      let loss = 0;
      for (let i = 0; i < n; i++) {
        const x = xs[i], y = ys[i];
        const pred = this.forward(x);
        // 简单 MSE 梯度（数值/解析：对最后一层 + SGD 近似）
        const out = pred.shape[pred.shape.length - 1];
        for (let o = 0; o < out; o++) {
          const err = pred.data[o] - y.data[o];
          loss += err * err;
          const d = err * lr;
          const l = this.layers[this.layers.length - 1];
          if (l.W && l.b) {
            const inDim = l.inputDim;
            for (let k = 0; k < inDim; k++) l.W.data[k * out + o] -= d * x.data[k];
            l.b.data[o] -= d;
          }
        }
      }
      if (e % 10 === 0) { /* console.log('epoch',e,'loss',(loss/n).toFixed(4)) */ }
    }
    return this;
  }
}

// 轻量 Rng（与 core/math.js Rng 兼容的最小实现，避免循环依赖）
class Rng_ {
  constructor(seed = 0x9e3779b9) { this.s = seed >>> 0; }
  next() { this.s = (Math.imul(this.s ^ (this.s >>> 15), 0x2c1b3c6d) ^ (this.s << 13)) >>> 0; return this.s / 4294967296; }
}
export { Rng_ };
