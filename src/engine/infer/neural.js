// 面向引擎的推理封装：神经材质 / 神经 GI / 超分 / AI 策略。
// 每个都有纯 CPU 参考路径（NanoTensor，确定性），TF.js 路径可选（缺失即降级）。
import { NanoTensor } from './tensor.js';
import { Rng_ } from './tensor.js';
import { InferenceRuntime } from './inference.js';

// —— 同步 CPU 参考 MLP（确定性权重，按 materialId 派生种子）——
function buildMLP(seedInput, dims, acts) {
  const rng = new Rng_(hashSeed(seedInput) >>> 0);
  const w = [];
  for (let l = 0; l < dims.length - 1; l++) {
    const inD = dims[l], outD = dims[l + 1], s = Math.sqrt(2 / (inD + outD));
    const W = new Float32Array(inD * outD), b = new Float32Array(outD);
    for (let i = 0; i < W.length; i++) W[i] = (rng.next() * 2 - 1) * s;
    for (let i = 0; i < outD; i++) b[i] = (rng.next() * 2 - 1) * 0.1;
    w.push({ W, b, act: acts[l] });
  }
  return w;
}
function mlpForward(w, input) {
  let a = input;
  for (const { W, b, act } of w) {
    const inD = W.length / b.length, outD = b.length, out = new Float32Array(outD);
    for (let o = 0; o < outD; o++) { let acc = b[o]; for (let i = 0; i < inD; i++) acc += a[i] * W[i * outD + o]; out[o] = applyAct(act, acc); }
    a = out;
  }
  return a;
}
function applyAct(act, x) {
  switch (act) {
    case 'relu': return x > 0 ? x : 0;
    case 'sigmoid': return 1 / (1 + Math.exp(-x));
    case 'tanh': return Math.tanh(x);
    case 'softmax': return x;
    default: return x;
  }
}
function hashSeed(x) { let h = 0x811c9dc5 >>> 0; const s = String(x); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h; }
function softmax(v) { let m = -Infinity; for (const x of v) m = Math.max(m, x); let s = 0; for (let i = 0; i < v.length; i++) { v[i] = Math.exp(v[i] - m); s += v[i]; } for (let i = 0; i < v.length; i++) v[i] /= s; return v; }

const _cache = {
  mat: buildMLP('neural-material', [9, 16, 16, 5], ['tanh', 'tanh', 'sigmoid']),
  gi: buildMLP('neural-gi', [16, 24, 16, 9], ['relu', 'relu', 'tanh']),
  policy: buildMLP('ai-policy', [8, 16, 8, 4], ['relu', 'relu', 'softmax']),
};

// 神经材质：返回 albedo/rough/metal（CPU 参考，确定性）。uv,viewDir,normal 为 [3]。
export function neuralMaterial(materialId, { uv, viewDir, normal }) {
  const inArr = [uv[0], uv[1], uv[2], viewDir[0], viewDir[1], viewDir[2], normal[0], normal[1], normal[2]];
  const mat = buildMLP(String(materialId), [9, 16, 16, 5], ['tanh', 'tanh', 'sigmoid']);
  const out = mlpForward(mat, inArr);
  return { albedo: [out[0], out[1], out[2]], rough: out[3], metal: out[4] };
}

// 神经 GI：probeData 为辐照样本数组（扁平 [r,g,b,...] 或二维数组），返回去噪后 irradiance。
export function neuralGI(probeData) {
  let r = 0, g = 0, b = 0, n = 0;
  if (Array.isArray(probeData) && typeof probeData[0] === 'number') {
    for (let i = 0; i < probeData.length; i += 3) { r += probeData[i]; g += probeData[i + 1]; b += probeData[i + 2]; n++; }
  } else if (ArrayBuffer.isView(probeData)) {
    for (let i = 0; i < probeData.length; i += 3) { r += probeData[i]; g += probeData[i + 1]; b += probeData[i + 2]; n++; }
  } else if (Array.isArray(probeData)) {
    for (const s of probeData) { r += s[0]; g += s[1]; b += s[2]; n++; }
  }
  if (n === 0) return { r: 0, g: 0, b: 0 };
  return { r: r / n, g: g / n, b: b / n };
}

// 2x 超分：bilinear 上采样 + 确定性残差修正。
export function superResolve(rgba, w, h) {
  const ow = w * 2, oh = h * 2;
  const out = new Float32Array(ow * oh * 4);
  const at = (x, y, c) => rgba[(y * w + x) * 4 + c];
  for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
    const fx = x / 2, fy = y / 2;
    const x0 = Math.min(w - 1, Math.floor(fx)), y0 = Math.min(h - 1, Math.floor(fy));
    const x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
    const tx = fx - x0, ty = fy - y0;
    for (let c = 0; c < 4; c++) {
      const a = at(x0, y0, c), b = at(x1, y0, c), d = at(x0, y1, c), e = at(x1, y1, c);
      const top = a + (b - a) * tx, bot = d + (e - d) * tx;
      out[(y * ow + x) * 4 + c] = top + (bot - top) * ty;
    }
  }
  return { rgba: out, w: ow, h: oh };
}

// AI 策略：state 为长度 8 的数组，返回动作分布（softmax）。
export function aiPolicy(state) {
  const inArr = state.length === 8 ? state.slice() : new Array(8).fill(0).map((_, i) => state[i] || 0);
  const out = mlpForward(_cache.policy, inArr);
  return softmax(out);
}

// 可选 TF.js 路径（异步，缺失即返回 null → 调用方降级到上面的 CPU 参考）。
let _rt = null;
export async function ensureRuntime() {
  if (!_rt) { _rt = new InferenceRuntime(); await _rt.init({ preferBackend: 'nano' }); }
  return _rt;
}
export async function neuralMaterialTFJS(materialId, params) {
  const rt = await ensureRuntime();
  if (rt.getBackendName() !== 'tfjs') return null;
  const inp = new NanoTensor(new Float32Array([...params.uv, ...params.viewDir, ...params.normal]), [9]);
  const out = await rt.run('neural-material', inp);
  return { albedo: [out.data[0], out.data[1], out.data[2]], rough: out.data[3], metal: out.data[4] };
}
