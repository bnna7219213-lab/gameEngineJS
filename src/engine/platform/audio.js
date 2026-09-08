// 音频混音：合成振荡器 + ADSR + 总线（master/sfx/music 增益 dB）+ 简化混响 + render 纯计算输出 Float32Array。
export function osc(type, phase) {
  switch (type) {
    case 'sine': return Math.sin(phase * 2 * Math.PI);
    case 'square': return phase < 0.5 ? 1 : -1;
    case 'saw': return 2 * (phase - Math.floor(phase + 0.5));
    case 'noise': return phase; // 由调用方提供伪随机相位
    default: return 0;
  }
}

export class ADSR {
  constructor(a = 0.01, d = 0.05, s = 0.7, r = 0.1, peak = 1) { this.a = a; this.d = d; this.s = s; this.r = r; this.peak = peak; }
  gain(t, dur) {
    if (t < this.a) return (t / this.a) * this.peak;
    if (t < this.a + this.d) return this.peak * (1 - (1 - this.s) * ((t - this.a) / this.d));
    if (t < dur - this.r) return this.peak * this.s;
    return this.peak * this.s * (1 - (t - (dur - this.r)) / this.r);
  }
}

export class Bus {
  constructor(name, gainDb = 0) { this.name = name; this.gain = Math.pow(10, gainDb / 20); this.nodes = []; }
  add(node) { this.nodes.push(node); }
  mix(buf, rate, startSample) {
    for (const n of this.nodes) n.mixInto(buf, rate, startSample, this.gain);
  }
}

export class Voice {
  constructor({ type = 'sine', freq = 440, dur = 1, gain = 1, adsr = new ADSR(), noiseSeed = 0 }) {
    this.type = type; this.freq = freq; this.dur = dur; this.gain = gain; this.adsr = adsr; this.phase = noiseSeed % 1;
  }
  mixInto(buf, rate, startSample, parentGain) {
    const n0 = startSample, n1 = Math.min(buf.length, startSample + Math.floor(this.dur * rate));
    for (let i = n0; i < n1; i++) {
      const t = (i - n0) / rate;
      let s = osc(this.type, (t * this.freq) % 1);
      if (this.type === 'noise') { this.phase = (this.phase * 1103515245 + 12345) & 0x7fffffff; s = ((this.phase / 0x7fffffff) * 2 - 1); }
      s *= this.gain * this.adsr.gain(t, this.dur) * parentGain;
      buf[i] += s;
    }
  }
}

// 简化混响：反馈延迟
export class Reverb {
  constructor(rate = 44100, delaySec = 0.03, fb = 0.35, wet = 0.25) {
    this.buf = new Float32Array(Math.max(1, Math.floor(delaySec * rate)));
    this.idx = 0; this.fb = fb; this.wet = wet;
  }
  process(buf) {
    for (let i = 0; i < buf.length; i++) {
      const d = this.buf[this.idx];
      this.buf[this.idx] = buf[i] * this.wet + d * this.fb;
      this.idx = (this.idx + 1) % this.buf.length;
      buf[i] += d * this.wet;
    }
  }
}

export class AudioEngine {
  constructor(rate = 44100) {
    this.rate = rate;
    this.master = new Bus('master', 0);
    this.sfx = new Bus('sfx', -3);
    this.music = new Bus('music', -6);
    this.sfx.parent = this.master; this.music.parent = this.master;
    this.reverb = new Reverb(rate);
  }
  addVoice(voice, bus = 'sfx') { (this[bus] || this.sfx).add(voice); }
  render(samples) {
    const out = new Float32Array(samples);
    // 子总线先混入，再经 master
    this.sfx.mix(out, this.rate, 0);
    this.music.mix(out, this.rate, 0);
    this.master.mix(out, this.rate, 0); // master 含自身节点（空）
    this.reverb.process(out);
    // 软裁剪
    for (let i = 0; i < out.length; i++) out[i] = Math.tanh(out[i]);
    return out;
  }
  clear() { this.sfx.nodes = []; this.music.nodes = []; this.master.nodes = []; }
}
