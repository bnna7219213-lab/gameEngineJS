// render_taa_gpu smoke：Q3 运动矢量 + TAA resolve（CPU 参考与 GLSL 同式，红线 D）。
// Node headless 验证：motionVector 语义、resolveMotionTAA（静态收敛/运动重投影/邻域 clamp）、
// jitter 序列与 taa.js 共用 Halton 表、GLSL 源完整性（可被 WebGL2 createShader 消费的形状）。
import {
  motionVector, resolveMotionTAA, jitterSequence, buildTaaPassShaders,
  MOTION_VS, MOTION_FS, TAA_VS, TAA_FS,
} from '../../src/engine/render/taa_gpu.js';
import { resolveTAA, halton, jitter } from '../../src/engine/render/taa.js';
import { Mat4, Vec3 } from '../../src/engine/core/math.js';

export const name = 'render-taa-gpu';

function frame(W, H, fill) {
  const a = new Float32Array(W * H * 4);
  for (let i = 0; i < W * H; i++) { a[i * 4] = fill[0]; a[i * 4 + 1] = fill[1]; a[i * 4 + 2] = fill[2]; a[i * 4 + 3] = 255; }
  return a;
}

export async function run(t) {
  // ---------- 1. motionVector：静止物体零运动，平移物体有位移 ----------
  const vp0 = Mat4.perspective(Math.PI / 3, 1, 0.1, 100).mul(Mat4.lookAt(Vec3.of(0, 0, 5), Vec3.of(0, 0, 0), Vec3.of(0, 1, 0)));
  const model = Mat4.identity();
  const p0 = motionVector(vp0, vp0, model, Vec3.of(0, 0, 0));
  t.near(p0[0], 0, 1e-6, '静止物体运动矢量 x=0');
  t.near(p0[1], 0, 1e-6, '静止物体运动矢量 y=0');
  // 相机平移 → 偏离视点的世界点产生非零运动矢量
  // （注意：视点原点在相机平移后仍居中，NDC 位移为 0 属正确行为；须取偏心点）
  const vp1 = Mat4.perspective(Math.PI / 3, 1, 0.1, 100).mul(Mat4.lookAt(Vec3.of(0.5, 0, 5), Vec3.of(0, 0, 0), Vec3.of(0, 1, 0)));
  const worldPt = Vec3.of(1, 0, 0);           // 偏离视点的点
  const p1 = motionVector(vp0, vp1, model, worldPt);
  t.ok(Math.abs(p1[0]) > 1e-4, '相机平移使偏心点产生非零运动矢量（x=' + p1[0].toFixed(4) + '）');
  // 视点原点居中：平移相机但保持看向原点 → 原点 NDC 位移为 0（正确行为）
  t.near(motionVector(vp0, vp1, model, Vec3.of(0, 0, 0))[0], 0, 1e-6, '视点原点恒居中（NDC 位移 0）');
  // 与 GLSL 同式：NDC 位移 = cur/w − prev/w（手工验证）
  const curClip = vp1.mul(model).applyClip(worldPt);
  const prevClip = vp0.mul(model).applyClip(worldPt);
  t.near(p1[0], curClip.x / curClip.w - prevClip.x / prevClip.w, 1e-6, '与 GLSL 公式逐式一致');

  // ---------- 2. resolveMotionTAA：静态帧收敛 ----------
  const W = 8, H = 8;
  const cur = frame(W, H, [200, 100, 50]);
  const f1 = resolveMotionTAA(null, cur, null, W, H, 0.1);
  t.near(f1[0], 200, 1e-4, '首帧（无历史）= 当前帧');
  // 历史稳定 → 收敛到当前值（邻域 clamp 不改变同色块）
  let f = f1;
  for (let i = 0; i < 30; i++) f = resolveMotionTAA(f, cur, null, W, H, 0.1);
  t.near(f[0], 200, 1e-3, '静态帧 30 次迭代收敛到 200');
  t.near(f[1], 100, 1e-3, 'G 通道收敛');

  // ---------- 3. 邻域 clamp 抑制 ghosting：历史越界被钳回 ----------
  // 当前帧左半红右半绿，历史帧全蓝 → clamp 后历史被钳到邻域 min/max，输出趋向当前帧
  const split = new Float32Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const red = x < W / 2;
    split[i] = red ? 255 : 0; split[i + 1] = red ? 0 : 255; split[i + 2] = 0; split[i + 3] = 255;
  }
  const badHist = frame(W, H, [0, 0, 255]);
  const out = resolveMotionTAA(badHist, split, null, W, H, 0.5);
  // 左侧像素：历史蓝(0,0,255) 被邻域 clamp 到红域 → 输出偏红而非蓝
  const li = (2 * W + 2) * 4;
  t.ok(out[li + 2] < 128, '邻域 clamp 抑制 ghosting（蓝分量被钳制，b=' + out[li + 2].toFixed(0) + '）');
  t.ok(out[li] > 64, 'clamp 后趋向当前帧红色（r=' + out[li].toFixed(0) + '）');

  // ---------- 4. 运动矢量重投影：运动物体从历史正确位置取样本 ----------
  // 关键：邻域 clamp 用**当前帧**的 3×3 邻域做 min/max，故当前帧必须有梯度，
  // 否则邻域退化为单点、任何历史都被钳回该值，重投影效果不可观测。
  // 构造：当前帧水平渐变 base = 100 + x*10（中心 x=4 → 140，邻域 x∈[3,5] → 130..150）；
  //       历史帧在 x=2 处 = 145（落在邻域内，不被 clamp），在 x=4 处 = 0（远低于邻域 min，必被 clamp）。
  const W2 = 8, H2 = 8;
  const grad = new Float32Array(W2 * H2 * 4);
  for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
    const i = (y * W2 + x) * 4;
    const v = 100 + x * 10;
    grad[i] = v; grad[i + 1] = v; grad[i + 2] = v; grad[i + 3] = 255;
  }
  const histGrad = new Float32Array(W2 * H2 * 4);
  for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
    const i = (y * W2 + x) * 4;
    const v = x === 2 ? 145 : (x === 4 ? 0 : 120);
    histGrad[i] = v; histGrad[i + 1] = v; histGrad[i + 2] = v; histGrad[i + 3] = 255;
  }
  // 运动矢量：mx=0.5 → 重投影偏移 round(0.5 * 8 * 0.5) = 2 像素（向左取历史样本）
  const motion2 = new Float32Array(W2 * H2 * 2);
  for (let i = 0; i < W2 * H2; i++) { motion2[i * 2] = 0.5; motion2[i * 2 + 1] = 0; }
  const noMotion = resolveMotionTAA(histGrad, grad, null, W2, H2, 0.5);
  const withMotion = resolveMotionTAA(histGrad, grad, motion2, W2, H2, 0.5);
  const ci = (4 * W2 + 4) * 4;
  t.ok(withMotion[ci] > noMotion[ci],
    '运动重投影改变采样来源（with=' + withMotion[ci].toFixed(1) + ' > without=' + noMotion[ci].toFixed(1) + '）');
  // 无运动时历史被 clamp 到邻域 min（130）；有运动时取到邻域内的 145，不被 clamp
  t.near(noMotion[ci], 130 * 0.5 + 140 * 0.5, 0.5, '无运动：历史越界被 clamp 到邻域 min(130) 后混合');
  t.near(withMotion[ci], 145 * 0.5 + 140 * 0.5, 0.5, '有运动：取到邻域内历史(145)，未被 clamp');

  // ---------- 5. 与既有 resolveTAA（无运动矢量版）行为兼容 ----------
  const a1 = resolveTAA(null, cur, 0.1);
  const a2 = resolveMotionTAA(null, cur, null, W, H, 0.1);
  let same = true;
  for (let i = 0; i < cur.length; i++) if (Math.abs(a1[i] - a2[i]) > 1e-4) same = false;
  t.ok(same, '无运动矢量时与旧 resolveTAA 输出一致（向后兼容）');

  // ---------- 6. jitter 序列与 taa.js 共用 Halton 表 ----------
  const seq = jitterSequence(8, 1);
  t.eq(seq.length, 8, '8 帧 jitter 序列');
  for (let f = 0; f < 8; f++) {
    const j = jitter(f, W, H, 1);
    t.near(seq[f][0], j.x, 1e-9, 'jitter[' + f + '].x 与 taa.js 同源');
    t.near(seq[f][1], j.y, 1e-9, 'jitter[' + f + '].y 与 taa.js 同源');
  }
  // Halton(1,2)=0.5 → 第一帧 x 偏移 0
  t.near(halton(1, 2), 0.5, 1e-9, 'Halton 基准值');

  // ---------- 7. GLSL 源完整性（可被 createShader 消费的形状）----------
  const sh = buildTaaPassShaders();
  t.ok(sh.vs.includes('#version 300 es') && sh.fs.includes('#version 300 es'), 'TAA GLSL 为 GLSL ES 3.00');
  t.ok(sh.motionVs.includes('uPrevViewProj') && sh.motionFs.startsWith('#version'), '运动矢量 GLSL 含 prev-MVP uniform');
  t.ok(TAA_FS.includes('clamp(hist, mn, mx)'), 'TAA FS 含邻域 clamp（与 CPU 同式）');
  t.ok(TAA_FS.includes('mix(hist, cur, uAlpha)'), 'TAA FS 含历史混合');
  t.ok(MOTION_FS.includes('out vec2'), '运动矢量输出 RG（vec2）');
  // uniform 声明齐全（驱动层反射需要）
  for (const u of ['uCurrent', 'uHistory', 'uMotion', 'uTexSize', 'uAlpha']) {
    t.ok(TAA_FS.includes('uniform ' + (u === 'uTexSize' ? 'vec2' : u === 'uAlpha' ? 'float' : 'sampler2D') + ' ' + u + ';'), 'TAA FS 声明 ' + u);
  }

  t.note('Q3 出口：运动矢量 CPU/GLSL 同式 + TAA resolve（收敛/ghosting 抑制/重投影）+ jitter 同源');
}
