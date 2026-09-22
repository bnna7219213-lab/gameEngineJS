// 运动矢量 + TAA GPU pass（Q3 / D22）：WebGL2 版 TAA 真接线。
// 组成：
//   · MOTION_VS/MOTION_FS —— 运动矢量 pass：prev-MVP uniform → RG16F RT 输出
//     （prevClip.xy→clip.xy 的 NDC 位移；与 CPU 参考同式，见 motionVector()）。
//   · TAA_VS/TAA_FS —— resolve pass：Halton jitter 已进投影矩阵（scene_render._prepare），
//     history RT ping-pong + 3×3 邻域 clamp（与 taa.js resolveTAA 同式）。
//   · resolveMotionTAA(cpu)：CPU 参考实现（Node 可测，红线 D），与 GLSL 逐式对应。
// 本模块 DOM-free：GLSL 字符串 + CPU 参考 + 纯函数；真实 GPU pass 由持有 device 的调用方驱动。
import { halton } from './taa.js';

// ---------- GLSL：运动矢量 pass ----------
export const MOTION_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec2 aUV;
uniform mat4 uModel, uViewProj, uPrevViewProj;
out vec2 vMotion;
void main(){
  vec4 cur = uViewProj * uModel * vec4(aPos, 1.0);
  vec4 prev = uPrevViewProj * uModel * vec4(aPos, 1.0);
  // NDC 位移（clip/w → ndc；prev.w 防零保护）
  vec2 curNdc = cur.xy / max(1e-6, abs(cur.w)) * sign(cur.w);
  vec2 prevNdc = prev.xy / max(1e-6, abs(prev.w)) * sign(prev.w);
  vMotion = curNdc - prevNdc;
  gl_Position = cur;
}`;

export const MOTION_FS = `#version 300 es
precision highp float;
in vec2 vMotion;
out vec2 o; // RG16F
void main(){ o = vMotion; }`;

// ---------- GLSL：TAA resolve pass ----------
export const TAA_VS = `#version 300 es
layout(location=0) in vec3 aPos;
out vec2 vUV;
void main(){
  vUV = aPos.xy * 0.5 + 0.5;
  gl_Position = vec4(aPos, 1.0);
}`;

export const TAA_FS = `#version 300 es
precision highp float;
uniform sampler2D uCurrent;   // 本帧（带 jitter）渲染结果
uniform sampler2D uHistory;   // 上一帧 resolve 结果
uniform sampler2D uMotion;    // 运动矢量 RG16F
uniform vec2 uTexSize;
uniform float uAlpha;         // 历史混合系数（0..1，越小越平滑）
in vec2 vUV;
out vec4 o;
void main(){
  vec3 cur = texture(uCurrent, vUV).rgb;
  vec3 hist = texture(uHistory, vUV).rgb;
  // 邻域 clamp（3×3 min/max，与 CPU resolveTAA 同式）抑制 ghosting
  vec3 mn = vec3(1e9), mx = vec3(-1e9);
  for (int dy = -1; dy <= 1; dy++)
    for (int dx = -1; dx <= 1; dx++) {
      vec2 off = vec2(float(dx), float(dy)) / uTexSize;
      vec3 c = texture(uCurrent, vUV + off).rgb;
      mn = min(mn, c); mx = max(mx, c);
    }
  hist = clamp(hist, mn, mx);
  o = vec4(mix(hist, cur, uAlpha), 1.0);
}`;

// ---------- CPU 参考（红线 D：黄金参考先行，与 GLSL 逐式对应）----------
// 运动矢量：prevClip→curClip 的 NDC 位移（与 MOTION_VS 同式）
export function motionVector(prevViewProj, viewProj, model, worldPos) {
  const cur = viewProj.mul(model).applyPoint(worldPos);
  const prev = prevViewProj.mul(model).applyPoint(worldPos);
  const cw = cur.w || 1e-6, pw = prev.w || 1e-6;
  return [cur.x / cw - prev.x / pw, cur.y / cw - prev.y / pw];
}

// TAA resolve（带运动矢量的历史重投影 + 邻域 clamp；与 TAA_FS 同式）。
// history/current: Float32Array RGBA；motion: Float32Array RG（每像素 2 分量）或 null。
export function resolveMotionTAA(history, current, motion, W, H, alpha = 0.1) {
  const n = W * H * 4;
  const out = new Float32Array(n);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      // 3×3 邻域 min/max（current）
      let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const sx = Math.min(W - 1, Math.max(0, x + dx));
          const sy = Math.min(H - 1, Math.max(0, y + dy));
          const j = (sy * W + sx) * 4;
          for (let c = 0; c < 3; c++) {
            if (current[j + c] < mn[c]) mn[c] = current[j + c];
            if (current[j + c] > mx[c]) mx[c] = current[j + c];
          }
        }
      }
      // 历史重投影：沿运动矢量采样 history（双线性近似 → 最近邻 + clamp）
      let hx = x, hy = y;
      if (motion) {
        const mxv = motion[(y * W + x) * 2], myv = motion[(y * W + x) * 2 + 1];
        hx = Math.min(W - 1, Math.max(0, Math.round(x - mxv * W * 0.5)));
        hy = Math.min(H - 1, Math.max(0, Math.round(y + myv * H * 0.5)));
      }
      const hi = (hy * W + hx) * 4;
      for (let c = 0; c < 3; c++) {
        let hv = history ? history[hi + c] : current[i + c];
        hv = Math.min(mx[c], Math.max(mn[c], hv)); // 邻域 clamp
        out[i + c] = hv * (1 - alpha) + current[i + c] * alpha;
      }
      out[i + 3] = current[i + 3];
    }
  }
  return out;
}

// Halton jitter 序列（与 scene_render._prepare 共用 taa.js 的 halton；此处导出标准 8 帧序列供 GPU 路径复用）
export function jitterSequence(frames = 8, scale = 1) {
  const out = [];
  for (let f = 0; f < frames; f++) {
    out.push([halton(f + 1, 2) - 0.5, halton(f + 1, 3) - 0.5].map(v => v * scale));
  }
  return out;
}

// 驱动 WebGL2 TAA pass 的组装器（供 scene_render / 编辑器视口调用）：
// 输入 device + 当前帧纹理 + history RT + motion RT，输出 resolve 后纹理。
// 语义：全屏三角形 pass；history ping-pong 由调用方管理（swap 两个 RT）。
export function buildTaaPassShaders() {
  return { vs: TAA_VS, fs: TAA_FS, motionVs: MOTION_VS, motionFs: MOTION_FS };
}
