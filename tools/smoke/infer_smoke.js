export const name = 'infer';
import { NanoTensor, Dense, Sequential, Rng_ } from '../../src/engine/infer/tensor.js';
import { InferenceRuntime } from '../../src/engine/infer/inference.js';
import { neuralMaterial, neuralGI, superResolve, aiPolicy } from '../../src/engine/infer/neural.js';

export async function run(t) {
  // NanoTensor
  const a = new NanoTensor([1, 2, 3], [3]); t.eq(a.size, 3); t.near(a.data[2], 3);
  const b = new NanoTensor([1, 0, 0, 1], [2, 2]);
  const c = b.matmul(new NanoTensor([1, 1], [2, 1]));
  t.eq(c.shape[0], 2); t.vnear(c.data, [1, 1], 1e-6);
  const z = NanoTensor.zeros([2, 2]); t.eq(z.data[0], 0);

  // Dense + Sequential
  const rng = new Rng_(1); const net = new Sequential(rng);
  net.add(new Dense(3, { inputDim: 2 })); net.add(new Dense(1, { inputDim: 3 }));
  const out = net.forward(new NanoTensor([1, 2], [2])); t.eq(out.shape[0], 1);
  net.train([new NanoTensor([1, 2], [2])], [new NanoTensor([1], [1])], { epochs: 3 });

  // InferenceRuntime (NanoTensor 后端，TF.js 缺失优雅降级)
  const rt = new InferenceRuntime(); await rt.init({ preferBackend: 'nano' });
  t.eq(rt.getBackendName(), 'nano', 'tfjs optional -> nano backend');
  const o = await rt.run('neural-material', new NanoTensor(new Float32Array([0.1,0.2,0.3,0,0,1,0,0,1]), [9]));
  t.eq(o.shape[0], 5);

  // neural 纯 CPU 参考
  const m = neuralMaterial('metal', { uv: [0.5,0.5,0], viewDir: [0,0,1], normal: [0,0,1] });
  t.eq(m.albedo.length, 3); t.ok(m.rough >= 0 && m.rough <= 1);
  const gi = neuralGI([[1,2,3],[4,5,6]]); t.near(gi.r, (1 + 4) / 2, 1e-6);
  const sr = superResolve(new Float32Array([1,2,3,4, 5,6,7,8, 9,10,11,12, 13,14,15,16]), 2, 2);
  t.eq(sr.w, 4); t.eq(sr.h, 4);
  const pol = aiPolicy([1,0,0,0,0,0,0,0]); t.eq(pol.length, 4);
  let sum = 0; for (const x of pol) sum += x; t.near(sum, 1, 1e-5, 'softmax sums to 1');
}
