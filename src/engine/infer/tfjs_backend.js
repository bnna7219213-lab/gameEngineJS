// TF.js 适配：可选依赖，缺失必须优雅降级（红线 E）。所有函数在不装 tfjs 时返回 null。
let _tf = undefined; // undefined=未探测, null=不可用, object=已加载

export async function isAvailable() {
  if (_tf === undefined) {
    try { _tf = await import('@tensorflow/tfjs'); }
    catch (e) { _tf = null; }
  }
  return _tf !== null;
}

export async function load() {
  if (await isAvailable()) return _tf;
  return null;
}

export async function setBackend(name) {
  const tf = await load();
  if (!tf) return false;
  try { await tf.setBackend(name); await tf.ready(); return true; }
  catch (e) { return false; }
}

export async function bestBackend() {
  const tf = await load();
  if (!tf) return null;
  for (const b of ['webgpu', 'webgl', 'cpu']) {
    try { if (await tf.backend() === b || (await tf.setBackend(b), true)) return b; } catch (e) {}
  }
  return null;
}

export async function fromNano(t) {
  const tf = await load();
  if (!tf) return null;
  return tf.tensor(t.data, t.shape);
}

export async function toNano(t) {
  const tf = await load();
  if (!tf) return null;
  const data = await t.data();
  return new (await import('./tensor.js')).NanoTensor(new Float32Array(data), t.shape);
}

export async function predict(modelOrFn, inputNano) {
  const tf = await load();
  if (!tf) return null;
  const t = await fromNano(inputNano);
  if (!t) return null;
  const res = typeof modelOrFn === 'function' ? modelOrFn(t) : modelOrFn.predict(t);
  return toNano(res);
}
