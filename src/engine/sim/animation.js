// 骨骼动画：关键帧轨道采样 + 姿态混合（参考实现）。
export class Clip {
  constructor(name, duration, tracks = {}) { this.name = name; this.duration = duration; this.tracks = tracks; }
}

// 单条轨道线性采样（t 超出范围按端点钳制）
export function sampleTrack(track, t) {
  if (track.length === 0) return [0, 0, 0];
  if (t <= track[0].t) return track[0].value.slice();
  if (t >= track[track.length - 1].t) return track[track.length - 1].value.slice();
  for (let i = 0; i < track.length - 1; i++) {
    if (t >= track[i].t && t <= track[i + 1].t) {
      const span = (track[i + 1].t - track[i].t) || 1;
      const a = (t - track[i].t) / span;
      return track[i].value.map((v, j) => v + (track[i + 1].value[j] - v) * a);
    }
  }
  return track[track.length - 1].value.slice();
}

// 按时间采样整条 Clip（自动回环）
export function sampleClip(clip, t) {
  const tt = (((t % clip.duration) + clip.duration) % clip.duration);
  const out = {};
  for (const k in clip.tracks) out[k] = sampleTrack(clip.tracks[k], tt);
  return out;
}

// 两个姿态按 alpha 混合
export function blendPose(a, b, alpha) {
  const out = {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const va = a[k] || [0, 0, 0], vb = b[k] || [0, 0, 0];
    out[k] = va.map((v, j) => v + (vb[j] - v) * alpha);
  }
  return out;
}
