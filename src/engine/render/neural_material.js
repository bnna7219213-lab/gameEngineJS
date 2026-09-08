// 神经材质：薄封装到 infer/neural 的 CPU 参考路径（可选 TF.js 路径由上层接入）。
import { neuralMaterial, neuralGI, superResolve, aiPolicy } from '../infer/neural.js';

export function evaluate(materialId, params) { return neuralMaterial(materialId, params); }
export function evaluateBatch(ids, paramsList) { return ids.map((id, i) => neuralMaterial(id, paramsList[i])); }
export function irradiance(probeData) { return neuralGI(probeData); }
export function superResolveRGBA(rgba, w, h) { return superResolve(rgba, w, h); }
export function policy(state) { return aiPolicy(state); }
