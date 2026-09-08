// IBL smoke：SH 投影/辐照度/程序化天空烘焙/IBL 环境光；CPU 参考与数值辐照度积分对照。
// 红线 D：本文件验证 CPU IBL 数学正确；GLSL 同式由 tools/parity.html（浏览器）视觉验收。
import { bakeSkySH, projectSH, evalSHIrradiance, skyRadiance, iblAmbient } from '../../src/engine/render/ibl.js';
import { pbrShade } from '../../src/engine/render/pbr.js';
import { Viewport3D } from '../../src/engine/render/viewport3d.js';
import { SoftwareDevice } from '../../src/engine/render/rhi_software.js';

export const name = 'render_ibl_smoke.js';

// 数值辐照度积分：∫ sky(d)·max(dot(d,n),0) dω（大量采样，用于对照 SH 近似质量）
function numericIrradiance(radianceFn, n, N = 4000) {
  const golden = Math.PI * (3 - Math.sqrt(5));
  let r = 0, g = 0, b = 0, wsum = 0;
  for (let i = 0; i < N; i++) {
    const yy = 1 - ((i + 0.5) / N) * 2;
    const rr = Math.sqrt(Math.max(0, 1 - yy * yy));
    const th = i * golden;
    const x = Math.cos(th) * rr, z = Math.sin(th) * rr, y = yy;
    const d = [x, y, z];
    const c = Math.max(0, d[0] * n[0] + d[1] * n[1] + d[2] * n[2]);
    const rad = radianceFn(d);
    r += rad[0] * c; g += rad[1] * c; b += rad[2] * c; wsum += c;
  }
  const A = 4 * Math.PI / N;
  return [r * A, g * A, b * A];
}

export async function run(t) {
  // 1. 常量辐射 L=1 投影：仅 C0≈3.5449，其余≈0
  const C = projectSH(() => [1, 1, 1], 256);
  t.near(C[0][0], 3.5449, 1e-2, 'C0 常量投影');
  for (let k = 1; k < 9; k++) t.near(C[k][0], 0, 1e-2, `C${k} 常量投影≈0`);

  // 2. SH 辐照度还原常量：E(n)≈π 于任意法线
  for (const n of [[0, 1, 0], [0, 0, 1], [1, 0, 0], [0.5774, 0.5774, 0.5774]]) {
    const E = evalSHIrradiance(C, n);
    t.near(E[0], Math.PI, 1e-2, `常量 E(n)[0]≈π`);
  }

  // 3. 程序化天空烘焙 + SH 辐照度对照数值积分（SH 对平滑天空近似良好）
  const ibl = bakeSkySH({ samples: 256 });
  for (const n of [[0, 1, 0], [0, 0, 1], [0, -1, 0], [0.5774, 0.5774, 0.5774]]) {
    const E = evalSHIrradiance(ibl.sh, n);
    const En = numericIrradiance((d) => skyRadiance(d), n);
    for (let c = 0; c < 3; c++) t.ok(Math.abs(E[c] - En[c]) <= 0.08 * (En[c] + 1e-6) + 0.02, `SH 辐照度≈数值积分[${c}] (E=${E[c].toFixed(3)} num=${En[c].toFixed(3)})`);
  }

  // 4. iblAmbient：metallic=0 & F0=0 ⇒ 仅漫反射 = albedo/π·E·intensity
  const Nn = [0, 0, 1], Vv = [0, 0, 1];
  const alb = [0.8, 0.4, 0.2];
  const a = iblAmbient(ibl.sh, ibl.avg, 1, Nn, Vv, 0.5, alb, 0, [0, 0, 0]);
  const E = evalSHIrradiance(ibl.sh, Nn);
  const diff = [alb[0] * E[0] / Math.PI, alb[1] * E[1] / Math.PI, alb[2] * E[2] / Math.PI];
  t.vnear(a, diff, 1e-4, 'iblAmbient(F0=0,metal=0)=漫反射');

  // 5. iblAmbient：rough=1 ⇒ 镜面混入环境均值 avg（有限、非 NaN）
  const a1 = iblAmbient(ibl.sh, ibl.avg, 1.0, Nn, Vv, 1.0, alb, 0.0, [0.04, 0.04, 0.04]);
  for (let c = 0; c < 3; c++) t.ok(Number.isFinite(a1[c]) && a1[c] >= 0, `iblAmbient(rough=1)[${c}] 有限非负`);

  // 6. 强度缩放：intensity 线性
  const a2 = iblAmbient(ibl.sh, ibl.avg, 2.0, Nn, Vv, 1.0, alb, 0.0, [0, 0, 0]);
  const a3 = iblAmbient(ibl.sh, ibl.avg, 1.0, Nn, Vv, 1.0, alb, 0.0, [0, 0, 0]);
  t.vnear(a2, a3.map((x) => x * 2), 1e-4, 'IBL 强度线性');

  // 7. pbrShade 接入 IBL：与直接 iblAmbient 一致（无直接光、无雾、无阴影）
  // pbrShade 内部 F0 = mix([0.04], albedo, metallic)，期望值须用同一 F0
  const F0p = [0.04 + (alb[0] - 0.04) * 0.1, 0.04 + (alb[1] - 0.04) * 0.1, 0.04 + (alb[2] - 0.04) * 0.1];
  const sh01 = iblAmbient(ibl.sh, ibl.avg, 1, Nn, Vv, 0.3, alb, 0.1, F0p);
  const col = pbrShade({
    N: Nn, V: Vv, P: [0, 0, 0], albedo: alb, metallic: 0.1, roughness: 0.3,
    emissive: [0, 0, 0], lights: [], ambient: [0.04, 0.05, 0.07], ibl,
  });
  t.vnear(col, sh01, 1e-4, 'pbrShade(IBL)≈iblAmbient');

  // 8. 集成：Viewport3D + Software 设备渲染带 IBL 的球，输出有限
  const dev = new SoftwareDevice();
  const vp = new Viewport3D(dev, { width: 32, height: 32 });
  vp.setIBL(bakeSkySH({ samples: 64 }));
  vp.setCamera({ eye: [0, 0, 4], target: [0, 0, 0] });
  vp.setLights([{ type: 0, direction: [0.3, 0.8, 0.4], color: [255, 255, 255], intensity: 1.0 }]);
  // 简易球
  const pos = [], idx = [];
  for (let i = 0; i <= 12; i++) for (let j = 0; j <= 12; j++) {
    const v = i / 12 * Math.PI, u = j / 12 * Math.PI * 2;
    pos.push(Math.sin(v) * Math.cos(u), Math.cos(v), Math.sin(v) * Math.sin(u));
  }
  for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) {
    const a = i * 13 + j, b = a + 13; idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  vp.addMesh({ positions: new Float32Array(pos), normals: new Float32Array(pos), indices: new Uint32Array(idx), albedo: [200, 200, 200], rough: 0.5, metal: 0 });
  const rgba = vp.renderToRGBA8();
  let finite = true;
  for (const v of rgba) if (!Number.isFinite(v)) finite = false;
  t.ok(finite, 'Viewport3D+IBL 渲染输出有限');

  // 9. 无 IBL 时 pbrShade 退化为平铺 ambient（与旧行为一致）
  const colOld = pbrShade({ N: Nn, V: Vv, P: [0, 0, 0], albedo: alb, metallic: 0.1, roughness: 0.3, emissive: [0, 0, 0], lights: [], ambient: [0.04, 0.05, 0.07] });
  t.ok(Array.isArray(colOld) && colOld.length === 3 && Number.isFinite(colOld[0]), '无 IBL 退化为平铺 ambient');
}
