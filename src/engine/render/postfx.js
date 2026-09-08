// 后处理链（P4 参考核心，CPU 侧纯函数；GPU 端为对等 GLSL pass）。
// 全部操作线性 HDR（Float32Array RGBA，可 >1）；输出仍线性，由调用方再做最终量化。
// 流程：HDR 场景 → brightPass(阈值提取高光) → separableBlur(降采样模糊) → combine(叠加 bloom) → tonemap(ACES) → 量化 8bit。

// Narkowicz ACES filmic 近似（单/三通道）。x 为线性 HDR（非负），返回约 [0,1]。
// 负输入（应不会在 HDR 出现）夹到 0，保证 tonemap 不反向。
export function aces(x, exposure = 1) {
  const v = Math.max(0, x * exposure);
  const a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  const f = (t) => (t * (a * t + b)) / (t * (c * t + d) + e);
  return f(v);
}
export function aces3(x, exposure = 1) {
  return [aces(x[0], exposure), aces(x[1], exposure), aces(x[2], exposure)];
}

// 整图 tonemap（就地或返回新缓冲）
export function tonemapACES(rgba, w, h, exposure = 1) {
  const out = new Float32Array(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    out[i] = aces(rgba[i], exposure);
    out[i + 1] = aces(rgba[i + 1], exposure);
    out[i + 2] = aces(rgba[i + 2], exposure);
    out[i + 3] = rgba[i + 3];
  }
  return out;
}

// 亮度高光提取：保留超过阈值的像素（平滑 knee）
export function brightPass(rgba, w, h, threshold = 1.0, knee = 0.5) {
  const out = new Float32Array(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    const l = 0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2];
    const k = threshold + knee;
    const s = l < k ? Math.max(0, l - threshold) / knee : 1;
    out[i] = rgba[i] * s; out[i + 1] = rgba[i + 1] * s; out[i + 2] = rgba[i + 2] * s; out[i + 3] = rgba[i + 3];
  }
  return out;
}

// 可分离高斯模糊（单通道权重近似；对 RGBA 逐通道）。axis: 'x' | 'y'。
export function separableBlur(src, w, h, radius = 4, axis = 'x') {
  const dst = new Float32Array(src.length);
  const r = Math.max(0, radius | 0);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let acc0 = 0, acc1 = 0, acc2 = 0, acc3 = 0, wsum = 0;
    for (let k = -r; k <= r; k++) {
      const wgt = 1 - Math.abs(k) / (r + 1); // 三角权重（参考实现）
      let sx = x, sy = y;
      if (axis === 'x') sx = Math.min(w - 1, Math.max(0, x + k)); else sy = Math.min(h - 1, Math.max(0, y + k));
      const si = (sy * w + sx) * 4;
      acc0 += src[si] * wgt; acc1 += src[si + 1] * wgt; acc2 += src[si + 2] * wgt; acc3 += src[si + 3] * wgt; wsum += wgt;
    }
    const di = (y * w + x) * 4;
    dst[di] = acc0 / wsum; dst[di + 1] = acc1 / wsum; dst[di + 2] = acc2 / wsum; dst[di + 3] = acc3 / wsum;
  }
  return dst;
}

// 组合基础 HDR + bloom（bloom 已模糊、可能降分辨率，此处按最近邻采样叠加）
export function combineBloom(base, bw, bh, bloom, blw, blh, intensity = 1.0) {
  const out = new Float32Array(base.length);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    const bi = (y * bw + x) * 4;
    const bx = Math.min(blw - 1, (x * blw / bw) | 0), by = Math.min(blh - 1, (y * blh / bh) | 0);
    const li = (by * blw + bx) * 4;
    out[bi] = base[bi] + bloom[li] * intensity;
    out[bi + 1] = base[bi + 1] + bloom[li + 1] * intensity;
    out[bi + 2] = base[bi + 2] + bloom[li + 2] * intensity;
    out[bi + 3] = base[bi + 3];
  }
  return out;
}

// 线性 HDR(Float32) → 8bit sRGB-ish 量化（仅做 gamma，保持参考简单；GPU 端可走 sRGB 纹理）
export function quantize8(rgba) {
  const out = new Uint8Array(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    out[i] = Math.max(0, Math.min(255, Math.round(Math.pow(Math.max(0, rgba[i]), 1 / 2.2) * 255)));
    out[i + 1] = Math.max(0, Math.min(255, Math.round(Math.pow(Math.max(0, rgba[i + 1]), 1 / 2.2) * 255)));
    out[i + 2] = Math.max(0, Math.min(255, Math.round(Math.pow(Math.max(0, rgba[i + 2]), 1 / 2.2) * 255)));
    out[i + 3] = Math.max(0, Math.min(255, rgba[i + 3] * 255));
  }
  return out;
}
