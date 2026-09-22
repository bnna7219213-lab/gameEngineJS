// 简化 IBL（P2 收尾）：程序化天空 → CPU 烘 SH（球谐）环境光。
//  - 三级（9 个）实球谐系数，RGB 各一套。
//  - 漫反射 IBL：SH 解析辐照度（Ramamoorthi 闭合式），diffuse = albedo/π · E。
//  - 镜面 IBL：解析近似（反射方向 SH 取值，按粗糙度向环境均值模糊；P4 升预滤波 MIP）。
// 双写约定（D3）：evalSHIrradiance / iblAmbient 的 js 实现与 pbr.js 的 GLSL 必须逐元素一致。
const PI = Math.PI;
const FOUR_PI = PI * 4;

// 实球谐基（L2，归一化）：输入单位方向 (x,y,z)，返回 9 个基值 [Y00..Y22]
function shBasis(x, y, z) {
  return [
    0.282095,                 // Y00
    0.488603 * y,             // Y1-1
    0.488603 * z,             // Y10
    0.488603 * x,             // Y11
    1.092548 * x * y,         // Y2-2
    1.092548 * y * z,         // Y2-1
    0.315392 * (3 * z * z - 1), // Y20
    1.092548 * x * z,         // Y21
    0.546274 * (x * x - y * y), // Y22
  ];
}

// 把方向函数 radianceFn(dir)->[r,g,b] 投影为 9 个 RGB 球谐系数（蒙特卡洛/Fibonacci 球均匀采样）
export function projectSH(radianceFn, samples = 64) {
  const coeff = [];
  for (let k = 0; k < 9; k++) coeff.push([0, 0, 0]);
  const golden = Math.PI * (3 - Math.sqrt(5));
  const w = FOUR_PI / samples;
  for (let i = 0; i < samples; i++) {
    const yy = 1 - ((i + 0.5) / samples) * 2;       // 1 → -1
    const rr = Math.sqrt(Math.max(0, 1 - yy * yy));
    const th = i * golden;
    const x = Math.cos(th) * rr, z = Math.sin(th) * rr, y = yy;
    const rad = radianceFn([x, y, z]);
    const B = shBasis(x, y, z);
    for (let k = 0; k < 9; k++) { coeff[k][0] += rad[0] * B[k] * w; coeff[k][1] += rad[1] * B[k] * w; coeff[k][2] += rad[2] * B[k] * w; }
  }
  return coeff;
}

// 解析辐照度：由辐射 SH 系数求某法线方向的漫反射辐照度 E（已含余弦-lobe 卷积闭式系数）
export function evalSHIrradiance(sh, n) {
  const c0 = sh[0], c1 = sh[1], c2 = sh[2], c3 = sh[3], c4 = sh[4], c5 = sh[5], c6 = sh[6], c7 = sh[7], c8 = sh[8];
  const x = n[0], y = n[1], z = n[2];
  const r = 0.886227 * c0[0]
    + 1.023327 * (c1[0] * y + c2[0] * z + c3[0] * x)
    + 0.858085 * (c4[0] * x * y + c5[0] * y * z + c7[0] * x * z)
    + 0.247708 * c6[0] * (3 * z * z - 1)
    + 0.429043 * c8[0] * (x * x - y * y);
  const g = 0.886227 * c0[1]
    + 1.023327 * (c1[1] * y + c2[1] * z + c3[1] * x)
    + 0.858085 * (c4[1] * x * y + c5[1] * y * z + c7[1] * x * z)
    + 0.247708 * c6[1] * (3 * z * z - 1)
    + 0.429043 * c8[1] * (x * x - y * y);
  const b = 0.886227 * c0[2]
    + 1.023327 * (c1[2] * y + c2[2] * z + c3[2] * x)
    + 0.858085 * (c4[2] * x * y + c5[2] * y * z + c7[2] * x * z)
    + 0.247708 * c6[2] * (3 * z * z - 1)
    + 0.429043 * c8[2] * (x * x - y * y);
  return [r, g, b];
}

// 程序化天空辐射（仅渐变天地，不含太阳盘——太阳由方向光承担；IBL 只取环境间接光）
export function skyRadiance(dir, opts = {}) {
  const zenith = opts.zenith || [0.25, 0.45, 0.85];
  const horizon = opts.horizon || [0.7, 0.75, 0.82];
  const ground = opts.ground || [0.18, 0.16, 0.14];
  const up = dir[1];
  const t = Math.pow(Math.min(1, Math.max(0, Math.abs(up))), 0.5);
  const sky = [horizon[0] + (zenith[0] - horizon[0]) * t, horizon[1] + (zenith[1] - horizon[1]) * t, horizon[2] + (zenith[2] - horizon[2]) * t];
  if (up < 0) {
    const g = Math.pow(Math.min(1, Math.max(0, -up)), 0.5);
    return [sky[0] + (ground[0] - sky[0]) * g, sky[1] + (ground[1] - sky[1]) * g, sky[2] + (ground[2] - sky[2]) * g];
  }
  return sky;
}

// 烘焙程序化天空为 SH 环境光
export function bakeSkySH(opts = {}) {
  const sh = projectSH((d) => skyRadiance(d, opts), opts.samples || 64);
  const avg = [sh[0][0] * 0.282095, sh[0][1] * 0.282095, sh[0][2] * 0.282095]; // 全球面平均辐射
  return { sh, avg };
}

// IBL 环境光（漫反射 + 简化镜面），CPU 参考。与 pbr.js 的 GLSL 同式。
// Nn 单位法线，Vv 单位视线（指向眼睛），rough∈[0,1]，albedo/metallic 0..1，F0 镜面反射比。
export function iblAmbient(sh, avg, intensity, Nn, Vv, rough, albedo, metallic, F0) {
  const E = evalSHIrradiance(sh, Nn);
  const diffuse = [
    (albedo[0] * (1 - metallic)) * (E[0] / PI) * intensity,
    (albedo[1] * (1 - metallic)) * (E[1] / PI) * intensity,
    (albedo[2] * (1 - metallic)) * (E[2] / PI) * intensity,
  ];
  // 反射方向
  const ndv = Math.max(0, Nn[0] * Vv[0] + Nn[1] * Vv[1] + Nn[2] * Vv[2]);
  const R = [2 * ndv * Nn[0] - Vv[0], 2 * ndv * Nn[1] - Vv[1], 2 * ndv * Nn[2] - Vv[2]];
  const envR = evalSHIrradiance(sh, R);
  const r = Math.min(1, Math.max(0, rough));
  const envSpec = [
    envR[0] * (1 - r) + avg[0] * r,
    envR[1] * (1 - r) + avg[1] * r,
    envR[2] * (1 - r) + avg[2] * r,
  ];
  const f = 1 - ndv, f5 = f * f * f * f * f;
  const F = [F0[0] + (1 - F0[0]) * f5, F0[1] + (1 - F0[1]) * f5, F0[2] + (1 - F0[2]) * f5];
  const spec = [F[0] * envSpec[0] * intensity, F[1] * envSpec[1] * intensity, F[2] * envSpec[2] * intensity];
  return [diffuse[0] + spec[0], diffuse[1] + spec[1], diffuse[2] + spec[2]];
}
