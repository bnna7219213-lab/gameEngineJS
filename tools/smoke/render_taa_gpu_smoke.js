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
  // 相机平移 → 所有物体产生反向运动矢量
  const vp1 = Mat4.perspective(Math.PI / 3, 1, 0.1, 100).mul(Mat4.lookAt(Vec3.of(0.5, 0, 5), Vec3.of(0, 0, 0), Vec3.of(0, 1, 0)));
  const p1 = motionVector(vp0, vp1, model, Vec3.of(0, 0, 0));
  t.ok(Math.abs(p1[0]) > 1e-4, '相机平移产生非零运动矢量（x=' + p1[0].toFixed(4) + '）');
  // 与 GLSL 同式：NDC 位移 = cur/w − prev/w（手工验证）
  const cur = vp1.mul(model).applyPoint(Vec3.of(0, 0, 0));
  const prev = vp0.mul(model).applyPoint(Vec3.of(0, 0, 0));
  t.near(p1[0], cur.x / cur.w - prev.x / prev.w, 1e-6, '与 GLSL 公式逐式一致');

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
  // 构造运动矢量场：全屏向右 0.5 NDC → 重投影取历史左移样本
  const motion = new Float32Array(W * H * 2);
  for (let i = 0; i < W * H; i++) { motion[i * 2] = 0.5; motion[i * 2 + 1] = 0; }
  const hist = frame(W, H, [10, 200, 10]);   // 历史是绿色
  const curM = frame(W, H, [200, 10, 10]);   // 当前是红色
  const out2 = resolveMotionTAA(hist, curM, motion, W, H, 0.5);
  // 中心像素重投影到左侧历史（绿）→ 输出混合绿分量高于无运动时
  const ci = (4 * W + 4) * 4;
  t.ok(out2[ci + 1] > 50, '运动重投影取到历史绿样本（g=' + out2[ci + 1].toFixed(0) + '）');

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
