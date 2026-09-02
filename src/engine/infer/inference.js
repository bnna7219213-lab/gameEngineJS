// InferenceRuntime：自动选择后端（tfjs 优先，否则 NanoTensor 参考实现），模型注册表 + 结果缓存 + 统计。
import { NanoTensor } from './tensor.js';
import { isAvailable } from './tfjs_backend.js';
import { Rng_ } from './tensor.js';

function hashTensor(t) {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < t.data.length; i++) { h ^= Math.fround(t.data[i]) >>> 0; h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

export class InferenceRuntime {
  constructor() {
    this.backendName = 'nano';
    this.available = false;
    this.models = new Map();
    this.cache = new Map();
    this._stats = { calls: 0, totalMs: 0, cacheHits: 0, cacheMiss: 0 };
    this._initPromise = null;
  }
  async init({ preferBackend = null } = {}) {
    if (this._initPromise) return this._initPromise;
    this._initPromise = (async () => {
      const ok = await isAvailable();
      this.available = ok;
      if (ok && preferBackend !== 'nano') this.backendName = 'tfjs';
      else this.backendName = 'nano';
      this._registerDefaults();
    })();
    return this._initPromise;
  }
  getBackendName() { return this.backendName; }

  _registerDefaults() {
    const rng = new Rng_(0x1234);
    // 神经材质 MLP：输入 9 (uv,viewDir,normal) → 输出 5 (albedo3,rough,metal)
    this.registerModel('neural-material', makeMLP(rng, [9, 16, 16, 5], ['tanh', 'tanh', 'sigmoid']));
    this.registerModel('neural-gi', makeMLP(rng, [16, 24, 16, 9], ['relu', 'relu', 'tanh']));
    this.registerModel('superres', makeMLP(rng, [12, 24, 12], ['relu', 'relu', 'tanh']));
    this.registerModel('ai-policy', makeMLP(rng, [8, 16, 8, 4], ['relu', 'relu', 'softmax']));
  }
  registerModel(name, model) { this.models.set(name, model); }
  getModel(name) { return this.models.get(name) || null; }

  async run(name, inputNano) {
    const t0 = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    const model = this.models.get(name);
    if (!model) throw new Error(`model not found: ${name}`);
    const key = name + '#' + hashTensor(inputNano);
    if (this.cache.has(key)) { this._stats.cacheHits++; this._stats.calls++; this._stats.totalMs += ((typeof performance !== 'undefined') ? performance.now() : Date.now()) - t0; return this.cache.get(key); }
    this._stats.cacheMiss++;
    const out = model.forward(inputNano);
    this.cache.set(key, out);
    this._stats.calls++;
    this._stats.totalMs += ((typeof performance !== 'undefined') ? performance.now() : Date.now()) - t0;
    if (this.cache.size > 512) this.cache.delete(this.cache.keys().next().value);
    return out;
  }
  stats() {
    return {
      backend: this.backendName,
      tfjsAvailable: this.available,
      calls: this._stats.calls,
      avgMs: this._stats.calls ? +(this._stats.totalMs / this._stats.calls).toFixed(4) : 0,
      cacheHitRate: this._stats.calls ? +(this._stats.cacheHits / this._stats.calls).toFixed(3) : 0,
      models: [...this.models.keys()],
    };
  }
}

function makeMLP(rng, layerDims, acts) {
  // 返回一个带 forward(nano) 的小网络（确定性权重）
  const weights = [];
  for (let l = 0; l < layerDims.length - 1; l++) {
    const inD = layerDims[l], outD = layerDims[l + 1];
    const s = Math.sqrt(2 / (inD + outD));
    const W = new Float32Array(inD * outD);
    const b = new Float32Array(outD);
    for (let i = 0; i < W.length; i++) W[i] = (rng.next() * 2 - 1) * s;
    for (let i = 0; i < outD; i++) b[i] = (rng.next() * 2 - 1) * 0.1;
    weights.push({ W, b, act: acts[l] });
  }
  return {
    forward(x) {
      let a = x;
      for (const { W, b, act } of weights) {
        const inD = W.length / b.length, outD = b.length;
        const out = new Float32Array(outD);
        for (let o = 0; o < outD; o++) {
          let acc = b[o];
          for (let i = 0; i < inD; i++) acc += a.data[i] * W[i * outD + o];
          out[o] = applyAct(act, acc);
        }
        a = new NanoTensor(out, [outD]);
      }
      return a;
    },
  };
}
function applyAct(act, x) {
  switch (act) {
    case 'relu': return x > 0 ? x : 0;
    case 'sigmoid': return 1 / (1 + Math.exp(-x));
    case 'tanh': return Math.tanh(x);
    case 'softmax': return x; // 由调用方对整向量 softmax
    default: return x;
  }
}
