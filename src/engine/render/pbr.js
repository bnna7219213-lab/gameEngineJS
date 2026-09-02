// 真实 PBR 前向路径（P2 核心）：
//  - GGX / Cook-Torrance CPU 参考 pbrShade（Software 后端与单元冒烟的黄金基准，红线 D）
//  - 与 CPU 参考逐元素一致的 GLSL 源（WebGL2 路径，parity 容差 2/255）
//  - 距离雾（linear / exp）
//  - 方向光阴影：CPU 侧正交 shadow map 光栅 + 3×3 PCF；GLSL 走 R32F 深度纹理 + 同样的手工 PCF
// 双写约定（D3）：js 参考与 glsl 必须实现同一组公式、采用同一套常量。
import { Vec3, Mat4 } from '../core/math.js';
import { iblAmbient } from './ibl.js';

const PI = Math.PI;

// ----------------------------------------------------------- 小工具
function clamp01(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }
function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function norm3(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
function max0(x) { return x > 0 ? x : 0; }
function mix3(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function arrMul(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
function pow5(x) { const x2 = x * x; return x2 * x2 * x; }

// ----------------------------------------------------------- GGX 项
export function distributionGGX(ndh, rough) {
  const a = rough * rough; const a2 = a * a;
  const d = ndh * ndh * (a2 - 1) + 1;
  return a2 / (PI * d * d + 1e-7);
}
export function geometrySchlick(ndv, ndl, rough) {
  const r = rough + 1; const k = (r * r) / 8;
  const gv = ndv / (ndv * (1 - k) + k);
  const gl = ndl / (ndl * (1 - k) + k);
  return gv * gl;
}
export function fresnelSchlick(ct, F0) {
  const f = 1 - ct; const f5 = pow5(f);
  return [F0[0] + (1 - F0[0]) * f5, F0[1] + (1 - F0[1]) * f5, F0[2] + (1 - F0[2]) * f5];
}

// ----------------------------------------------------------- 雾
export function fogFactor(fog, dist) {
  if (fog.type === 'exp') { const d = fog.density * dist; return clamp01(1 - Math.exp(-d * d)); }
  const near = fog.near || 0, far = fog.far || 100;
  return clamp01((dist - near) / (far - near));
}

// ----------------------------------------------------------- 主着色
// opts: { N, V, P, albedo:[0..1], metallic, roughness, emissive:[0..1],
//         lights:[{type,color,intensity,position?,direction?,range?,cosInner?,cosOuter?}],
//         ambient:[0..1], fog?, dist?, shadow?[0..1] 每个灯一个阴影因子 }
export function pbrShade(opts) {
  const Nn = norm3(opts.N); const Vv = norm3(opts.V);
  const base = opts.albedo;
  const rough = Math.max(0.04, Math.min(1, opts.roughness));
  const metallic = opts.metallic || 0;
  const emissive = opts.emissive || [0, 0, 0];
  const ambient = opts.ambient || [0.04, 0.05, 0.07];
  const lights = opts.lights || [];
  let F0 = mix3([0.04, 0.04, 0.04], base, metallic);
  let Lo = [0, 0, 0];
  const ndv = max0(dot3(Nn, Vv));
  for (let i = 0; i < lights.length; i++) {
    const L = lights[i];
    let Ldir, radiance;
    if (L.type === 0) { // directional
      Ldir = norm3(L.direction);
      radiance = arrMul(L.color, L.intensity);
    } else {
      const dx = L.position[0] - opts.P[0], dy = L.position[1] - opts.P[1], dz = L.position[2] - opts.P[2];
      const distL = Math.hypot(dx, dy, dz) + 1e-4;
      Ldir = [dx / distL, dy / distL, dz / distL];
      let att = L.intensity / (distL * distL + 1);
      if (L.range && isFinite(L.range) && L.range > 0) att *= Math.max(0, 1 - distL / L.range);
      radiance = arrMul(L.color, att);
      if (L.type === 2) { // spot
        const cosA = dot3(Ldir, norm3(L.direction));
        const ci = L.cosInner, co = L.cosOuter;
        if (cosA < co) radiance = [0, 0, 0];
        else if (cosA < ci) { const fa = Math.max(0, (cosA - co) / (ci - co)); radiance = arrMul(radiance, fa); }
      }
    }
    const ndl = max0(dot3(Nn, Ldir));
    if (ndl <= 0) continue;
    const H = norm3([Ldir[0] + Vv[0], Ldir[1] + Vv[1], Ldir[2] + Vv[2]]);
    const ndh = max0(dot3(Nn, H));
    const vdh = max0(dot3(Vv, H));
    const NDF = distributionGGX(ndh, rough);
    const G = geometrySchlick(ndv, ndl, rough);
    const F = fresnelSchlick(vdh, F0);
    const denom = 4 * ndv * ndl + 1e-4;
    const spec = [(F[0] * NDF * G) / denom, (F[1] * NDF * G) / denom, (F[2] * NDF * G) / denom];
    const kd = [(1 - F[0]) * (1 - metallic), (1 - F[1]) * (1 - metallic), (1 - F[2]) * (1 - metallic)];
    const diffuse = [kd[0] * base[0] / PI, kd[1] * base[1] / PI, kd[2] * base[2] / PI];
    const sh = opts.shadow ? (opts.shadow[i] === undefined ? 1 : opts.shadow[i]) : 1;
    Lo[0] += (diffuse[0] + spec[0]) * radiance[0] * ndl * sh;
    Lo[1] += (diffuse[1] + spec[1]) * radiance[1] * ndl * sh;
    Lo[2] += (diffuse[2] + spec[2]) * radiance[2] * ndl * sh;
  }
  const ambMul = [base[0] * (1 - metallic) + F0[0] * metallic, base[1] * (1 - metallic) + F0[1] * metallic, base[2] * (1 - metallic) + F0[2] * metallic];
  let ambientTerm;
  if (opts.ibl) {
    const I = opts.ibl.intensity == null ? 1 : opts.ibl.intensity;
    ambientTerm = iblAmbient(opts.ibl.sh, opts.ibl.avg, I, Nn, Vv, rough, base, metallic, F0);
  } else {
    ambientTerm = [ambient[0] * ambMul[0], ambient[1] * ambMul[1], ambient[2] * ambMul[2]];
  }
  let col = [Lo[0] + ambientTerm[0] + emissive[0], Lo[1] + ambientTerm[1] + emissive[1], Lo[2] + ambientTerm[2]];
  if (opts.fog) {
    const f = fogFactor(opts.fog, opts.dist || 0);
    col = [col[0] * (1 - f) + opts.fog.color[0] * f, col[1] * (1 - f) + opts.fog.color[1] * f, col[2] * (1 - f) + opts.fog.color[2] * f];
  }
  return [clamp01(col[0]), clamp01(col[1]), clamp01(col[2])];
}

// ----------------------------------------------------------- 阴影（CPU 参考）
// meshes: [{ positions, indices, transform }]；lightVP: Mat4（方向光正交投影）；返回 size*size 的 light-space ndcZ 数组。
export function renderShadowMap(meshes, lightVP, size) {
  const depth = new Float32Array(size * size).fill(1e9);
  const clipOf = (positions, idx, transform, out) => {
    let x = positions[idx * 3], y = positions[idx * 3 + 1], z = positions[idx * 3 + 2];
    if (transform) {
      const w = transform.applyTo ? transform.applyTo(Vec3.of(x, y, z)) : Mat4.compose(Vec3.of(...(transform.position || [0, 0, 0])), Vec3.of(...(transform.rotation || [0, 0, 0])), Vec3.of(...(transform.scale || [1, 1, 1]))).transformPoint(Vec3.of(x, y, z));
      x = w.x; y = w.y; z = w.z;
    }
    const c = lightVP.transformH([x, y, z, 1]);
    const iw = 1 / (c[3] || 1);
    out[0] = c[0] * iw; out[1] = c[1] * iw; out[2] = c[2] * iw; out[3] = c[3] * iw;
  };
  const A = [0, 0, 0, 0], B = [0, 0, 0, 0], C = [0, 0, 0, 0];
  for (const m of meshes) {
    const pos = m.positions, idx = m.indices;
    for (let t = 0; t + 2 < idx.length; t += 3) {
      clipOf(pos, idx[t], m.transform, A); clipOf(pos, idx[t + 1], m.transform, B); clipOf(pos, idx[t + 2], m.transform, C);
      const toPix = (c) => [Math.round((c[0] * 0.5 + 0.5) * size), Math.round((1 - (c[1] * 0.5 + 0.5)) * size), c[2]];
      const Pa = toPix(A), Pb = toPix(B), Pc = toPix(C);
      const minX = Math.max(0, Math.min(Pa[0], Pb[0], Pc[0])), maxX = Math.min(size - 1, Math.max(Pa[0], Pb[0], Pc[0]));
      const minY = Math.max(0, Math.min(Pa[1], Pb[1], Pc[1])), maxY = Math.min(size - 1, Math.max(Pa[1], Pb[1], Pc[1]));
      const denom = (Pb[1] - Pc[1]) * (Pa[0] - Pc[0]) + (Pc[0] - Pb[0]) * (Pa[1] - Pc[1]);
      if (Math.abs(denom) < 1e-9) continue;
      for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
        const w0 = ((Pb[1] - Pc[1]) * (x - Pc[0]) + (Pc[0] - Pb[0]) * (y - Pc[1])) / denom;
        const w1 = ((Pc[1] - Pa[1]) * (x - Pc[0]) + (Pa[0] - Pc[0]) * (y - Pc[1])) / denom;
        const w2 = 1 - w0 - w1;
        if (w0 < -1e-3 || w1 < -1e-3 || w2 < -1e-3) continue;
        const z = w0 * A[2] + w1 * B[2] + w2 * C[2];
        const px = y * size + x;
        if (z < depth[px]) depth[px] = z;
      }
    }
  }
  return depth;
}

// 手工 3×3 PCF：worldPos 经 lightVP 投影后比对深度图（ndcZ）。返回 0..1 受光比例。
export function sampleShadow(map, size, lightVP, worldPos, bias = 0.0025) {
  const c = lightVP.transformH([worldPos[0], worldPos[1], worldPos[2], 1]);
  if (c[3] <= 0) return 1;
  const ndcX = c[0] / c[3], ndcY = c[1] / c[3], ndcZ = c[2] / c[3];
  const u = ndcX * 0.5 + 0.5, v = ndcY * 0.5 + 0.5;
  if (u < 0 || u > 1 || v < 0 || v > 1) return 1;
  const cur = ndcZ - bias;
  let sum = 0, cnt = 0;
  for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++) {
    const su = u + (xx + 0.5) / size, sv = v + (yy + 0.5) / size;
    if (su < 0 || su > 1 || sv < 0 || sv > 1) { sum += 1; cnt++; continue; }
    const px = (su * (size - 1)) | 0, py = (sv * (size - 1)) | 0;
    const d = map[py * size + px];
    if (d > cur) sum += 1; // 比当前片元更远才受光（最近表面更近 ⇒ 被遮挡）
    cnt++;
  }
  return sum / cnt;
}

// 构造方向光的正交投影视图矩阵（场景包围球 → 拟合视锥）。
export function orthoLightVP(direction, center, radius, near = -radius * 1.5, far = radius * 1.5) {
  const f = Vec3.of(-direction[0], -direction[1], -direction[2]).normalize();
  const eye = Vec3.of(center[0] - f.x * radius, center[1] - f.y * radius, center[2] - f.z * radius);
  const view = Mat4.lookAt(eye, Vec3.of(center[0], center[1], center[2]), Vec3.of(0, 1, 0));
  const proj = Mat4.ortho(-radius, radius, -radius, radius, near, far);
  return proj.mul(view);
}

// ====================================================================
// GLSL（WebGL2 路径）—— 与上方 CPU 参考逐一对应
// ====================================================================
export const PBR_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec2 aUV;
uniform mat4 uModel; uniform mat4 uViewProj; uniform mat4 uView;
out vec3 vWorld; out vec3 vNormal; out vec2 vUV; out float vViewZ;
void main(){
  vec4 wp = uModel * vec4(aPos,1.0);
  vWorld = wp.xyz;
  vNormal = mat3(uModel) * aNormal;
  vUV = aUV;
  vec4 vp = uView * wp;
  vViewZ = -vp.z;
  gl_Position = uViewProj * wp;
}`;

export const PBR_FS = `#version 300 es
precision highp float;
in vec3 vWorld; in vec3 vNormal; in vec2 vUV; in float vViewZ;
out vec4 o;
uniform vec3 uEye; uniform vec3 uAmbient;
uniform int uLightCount;
uniform int uLightType[8];
uniform vec3 uLightColor[8];
uniform vec3 uLightPos[8];
uniform vec3 uLightDir[8];
uniform vec4 uLightParam[8]; // x=intensity y=range z=cosInner w=cosOuter
uniform float uMetallic; uniform float uRoughness; uniform vec3 uAlbedo; uniform vec3 uEmissive;
uniform float uUseTex; uniform sampler2D uTex0;
uniform float uFogType; uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar; uniform float uFogDensity;
uniform int uShadowOn; uniform sampler2D uShadowMap; uniform mat4 uLightVP; uniform float uShadowBias;
uniform int uUseSH; uniform vec3 uSH[9]; uniform vec3 uSHAvg; uniform float uIBLIntensity;
const float PI = 3.141592653589793;
float distGGX(float ndh, float a){ float a2=a*a; float d=(ndh*ndh*(a2-1.0)+1.0); return a2/(PI*d*d+1e-7); }
float geom(float ndv, float ndl, float rough){ float r=rough+1.0; float k=(r*r)/8.0; float gv=ndv/(ndv*(1.0-k)+k); float gl=ndl/(ndl*(1.0-k)+k); return gv*gl; }
vec3 fres(float ct, vec3 F0){ float f=1.0-ct; float f5=f*f; f5=f5*f5*f; return F0 + (vec3(1.0)-F0)*f5; }
vec3 evalSHIrradiance(vec3 n){
  float x=n.x, y=n.y, z=n.z;
  return 0.886227*uSH[0]
       + 1.023327*(uSH[1]*y + uSH[2]*z + uSH[3]*x)
       + 0.858085*(uSH[4]*x*y + uSH[5]*y*z + uSH[7]*x*z)
       + 0.247708*uSH[6]*(3.0*z*z-1.0)
       + 0.429043*uSH[8]*(x*x-y*y);
}
float shadowPCF(vec3 wp){
  vec4 c = uLightVP * vec4(wp,1.0);
  if (c.w <= 0.0) return 1.0;
  vec2 uv = c.xy/c.w*0.5+0.5;
  float cur = c.z/c.w - uShadowBias;
  if (uv.x<0.0||uv.x>1.0||uv.y<0.0||uv.y>1.0) return 1.0;
  float sum=0.0;
  for (int yy=-1; yy<=1; yy++) for (int xx=-1; xx<=1; xx++){
    vec2 suv = uv + vec2(float(xx)+0.5,float(yy)+0.5)/float(textureSize(uShadowMap,0).x);
    if (suv.x<0.0||suv.x>1.0||suv.y<0.0||suv.y>1.0){ sum+=1.0; continue; }
    float d = texture(uShadowMap, suv).r;
    if (d > cur) sum += 1.0; // 比当前片元更远才受光（最近表面更近 ⇒ 被遮挡）
  }
  return sum/9.0;
}
void main(){
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uEye - vWorld);
  vec3 albedo = uAlbedo;
  if (uUseTex > 0.5){ vec3 t = texture(uTex0, vUV).rgb; albedo = albedo * t; }
  float rough = clamp(uRoughness, 0.04, 1.0);
  vec3 F0 = mix(vec3(0.04), albedo, uMetallic);
  vec3 Lo = vec3(0.0);
  float ndv = max(dot(N,V),0.0);
  for (int i=0;i<8;i++){
    if (i>=uLightCount) break;
    int type = uLightType[i];
    vec3 radiance; vec3 Ldir;
    if (type==0){ Ldir = normalize(uLightDir[i]); radiance = uLightColor[i]*uLightParam[i].x; }
    else {
      vec3 toL = uLightPos[i]-vWorld; float distL = length(toL)+1e-4; Ldir=toL/distL;
      float att = uLightParam[i].x/(distL*distL+1.0);
      float range = uLightParam[i].y;
      if (range>0.0) att *= max(0.0, 1.0-distL/range);
      radiance = uLightColor[i]*att;
      if (type==2){ float cosA=dot(Ldir, normalize(uLightDir[i])); float ci=uLightParam[i].z; float co=uLightParam[i].w; if (cosA<co) radiance=vec3(0.0); else if (cosA<ci){ float fa=max(0.0,(cosA-co)/(ci-co)); radiance*=fa; } }
    }
    float ndl = max(dot(N,Ldir),0.0);
    if (ndl<=0.0) continue;
    vec3 H = normalize(Ldir+V);
    float ndh = max(dot(N,H),0.0);
    float vdh = max(dot(V,H),0.0);
    float NDF = distGGX(ndh, rough);
    float G = geom(ndv, ndl, rough);
    vec3 F = fres(vdh, F0);
    vec3 spec = (F*NDF*G)/(4.0*ndv*ndl+0.0001);
    vec3 kd = (vec3(1.0)-F)*(1.0-uMetallic);
    vec3 diffuse = kd*albedo/PI;
    float sh = 1.0;
    if (type==0 && uShadowOn==1) sh = shadowPCF(vWorld);
    Lo += (diffuse+spec)*radiance*ndl*sh;
  }
  vec3 ambMul = albedo*(1.0-uMetallic) + F0*uMetallic;
  vec3 ambient;
  if (uUseSH == 1) {
    vec3 E = evalSHIrradiance(N) * uIBLIntensity;
    vec3 diffuse = (albedo*(1.0-uMetallic)) * (E/PI);
    vec3 R = reflect(-V, N);
    vec3 envR = evalSHIrradiance(R) * uIBLIntensity;
    float rg = clamp(uRoughness, 0.0, 1.0);
    vec3 envSpec = mix(envR, uSHAvg*uIBLIntensity, rg);
    vec3 F = fres(max(dot(N,V),0.0), F0);
    ambient = diffuse + F*envSpec;
  } else {
    ambient = uAmbient*ambMul;
  }
  vec3 col = Lo + ambient + uEmissive;
  float fogF = 0.0;
  if (uFogType > 1.5){ float dd = uFogDensity*vViewZ; fogF = 1.0 - exp(-dd*dd); }
  else if (uFogType > 0.5){ fogF = clamp((vViewZ-uFogNear)/(uFogFar-uFogNear),0.0,1.0); }
  col = mix(col, uFogColor, clamp(fogF,0.0,1.0));
  o = vec4(col, 1.0);
}`;

// 阴影预通行：把 light-space ndcZ 输出到 R32F 纹理
export const SHADOW_VS = `#version 300 es
layout(location=0) in vec3 aPos;
uniform mat4 uLightVP;
void main(){ gl_Position = uLightVP * vec4(aPos,1.0); }`;
export const SHADOW_FS = `#version 300 es
precision highp float;
out vec4 o;
void main(){ o = vec4(gl_FragCoord.z, 0.0, 0.0, 1.0); }`;

// 组装一个 PBR 着色器对象（含 glsl 与 js 双写），供 createShader 使用。
// 注意：js 路径直接调用 pbrShade；glsl 路径由 GPU 执行同一公式。
export function buildPbrShader() {
  return {
    glsl: { vs: PBR_VS, fs: PBR_FS },
    js: {
      vs: (a, uni) => {
        const w = uni.model.transformPoint(Vec3.of(a.position[0], a.position[1], a.position[2]));
        const n = uni.model.transformDir(Vec3.of(a.normal[0], a.normal[1], a.normal[2])).normalize();
        const clip = uni.viewProj.transformH([w.x, w.y, w.z, 1]);
        return { pos: clip, vary: { wp: [w.x, w.y, w.z], wn: [n.x, n.y, n.z], uv: a.uv || [0, 0] } };
      },
      fs: (v, uni) => {
        const N = norm3(v.wn);
        const toEye = [uni.eye[0] - v.wp[0], uni.eye[1] - v.wp[1], uni.eye[2] - v.wp[2]];
        const dist = Math.hypot(toEye[0], toEye[1], toEye[2]);
        const V = norm3(toEye);
        let albedo = uni.albedo || [0.8, 0.8, 0.8];
        if (uni.tex0) { const tx = sampleTexture(uni.tex0, v.uv); albedo = [albedo[0] * tx[0] / 255, albedo[1] * tx[1] / 255, albedo[2] * tx[2] / 255]; }
        const shadow = uni.shadows ? uni.shadows.map(s => s ? sampleShadow(s.map, s.size, s.vp, v.wp, s.bias) : 1) : null;
        const c = pbrShade({ N, V, P: v.wp, albedo, metallic: uni.metallic || 0, roughness: uni.roughness == null ? 0.8 : uni.roughness, emissive: uni.emissive || [0, 0, 0], lights: uni.lights || [], ambient: uni.ambient || [0.04, 0.05, 0.07], fog: uni.fog || null, dist, shadow });
        return [c[0] * 255, c[1] * 255, c[2] * 255, 255];
      },
    },
  };
}

function sampleTexture(tex, uv) {
  const w = tex.w, h = tex.h, d = tex.data;
  let x = Math.min(w - 1, Math.max(0, (uv[0] * w) | 0));
  let y = Math.min(h - 1, Math.max(0, (uv[1] * h) | 0));
  const i = (y * w + x) * 4;
  return [d[i], d[i + 1], d[i + 2]];
}
