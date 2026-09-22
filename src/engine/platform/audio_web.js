// 音频输出桥（Q2 / D18）：把 sim/audio 的确定性混音（AudioEngine.render→Float32Array PCM）
// 接到 WebAudio 输出。双轨设计（红线 E）：
//   · 本模块（platform 层）：AudioContext 包装，lazy init 于用户手势；Node 下注入 mock 句柄即可测。
//   · 引擎侧混音仍走 audio.js（纯计算，确定性），本模块只做「PCM → 播放」的桥。
// 对标 Unity AudioSource/Listener：play(loop/gain/bus)、decode 文件加载、3D Panner。

// AudioSink：WebAudio 输出包装。ctx 可注入（Node 测试用 mock）。
export class AudioSink {
  constructor({ ctx = null, sampleRate = 44100 } = {}) {
    this._ctx = ctx;                 // AudioContext 或 mock
    this.sampleRate = sampleRate;
    this._master = null;
    this._buses = new Map();         // name -> GainNode
    this._sources = new Set();       // 活跃的 AudioBufferSourceNode
    this.state = 'closed';           // 'closed' | 'running' | 'suspended'
  }
  // lazy init：浏览器在用户手势后调用；注入 mock ctx（Node 测试）时同样建立总线图
  async init() {
    if (this.state === 'running') return this;
    if (!this._ctx) {
      const AC = typeof AudioContext !== 'undefined' ? AudioContext : null;
      if (!AC) throw new Error('AudioSink.init: 无 AudioContext（浏览器需用户手势后调用；Node 请注入 mock ctx）');
      this._ctx = new AC();
    }
    this._master = this._ctx.createGain();
    this._master.connect(this._ctx.destination);
    for (const name of ['sfx', 'music']) {
      const g = this._ctx.createGain();
      g.connect(this._master);
      this._buses.set(name, g);
    }
    this.state = 'running';
    return this;
  }
  get ctx() { return this._ctx; }
  // 播放一段 PCM（Float32Array 单声道）；返回句柄 { stop(), setGain(), loop }
  play(pcm, { loop = false, gain = 1, bus = 'sfx', rate = null } = {}) {
    if (!this._ctx) throw new Error('AudioSink.play: 未 init（先在用户手势中调用 init）');
    const ctx = this._ctx;
    const buf = ctx.createBuffer(1, pcm.length, rate || this.sampleRate);
    buf.getChannelData(0).set(pcm);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = !!loop;
    const g = ctx.createGain();
    g.gain.value = gain;
    const dest = this._buses.get(bus) || this._master;
    src.connect(g); g.connect(dest);
    src.start();
    this._sources.add(src);
    src.onended = () => this._sources.delete(src);
    return {
      stop: () => { try { src.stop(); } catch (_) {} this._sources.delete(src); },
      setGain: (v) => { g.gain.value = v; },
      get playing() { return src.playbackState === undefined || this._sources.has(src); },
    };
  }
  // 文件解码（浏览器 decodeAudioData；mock 环境由注入的 ctx 提供）
  async decode(arrayBuffer) {
    if (!this._ctx) throw new Error('AudioSink.decode: 未 init');
    return await this._ctx.decodeAudioData(arrayBuffer);
  }
  // 播放已解码的 AudioBuffer
  playBuffer(audioBuffer, { loop = false, gain = 1, bus = 'sfx' } = {}) {
    if (!this._ctx) throw new Error('AudioSink.playBuffer: 未 init');
    const src = this._ctx.createBufferSource();
    src.buffer = audioBuffer;
    src.loop = !!loop;
    const g = this._ctx.createGain();
    g.gain.value = gain;
    src.connect(g); g.connect(this._buses.get(bus) || this._master);
    src.start();
    this._sources.add(src);
    src.onended = () => this._sources.delete(src);
    return { stop: () => { try { src.stop(); } catch (_) {} this._sources.delete(src); }, setGain: (v) => { g.gain.value = v; } };
  }
  // 3D 声源：PannerNode 包装（对标 Unity AudioSource spatial）
  play3D(pcm, { position = [0, 0, 0], refDistance = 1, maxDistance = 100, ...opts } = {}) {
    if (!this._ctx) throw new Error('AudioSink.play3D: 未 init');
    const ctx = this._ctx;
    const buf = ctx.createBuffer(1, pcm.length, this.sampleRate);
    buf.getChannelData(0).set(pcm);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    let panner = null;
    if (ctx.createPanner) {
      panner = ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = refDistance;
      panner.maxDistance = maxDistance;
      if (panner.positionX) {
        panner.positionX.value = position[0]; panner.positionY.value = position[1]; panner.positionZ.value = position[2];
      } else if (panner.setPosition) {
        panner.setPosition(position[0], position[1], position[2]);
      }
      src.connect(panner); panner.connect(this._buses.get(opts.bus || 'sfx') || this._master);
    } else {
      src.connect(this._buses.get(opts.bus || 'sfx') || this._master);
    }
    src.start();
    this._sources.add(src);
    src.onended = () => this._sources.delete(src);
    return {
      stop: () => { try { src.stop(); } catch (_) {} this._sources.delete(src); },
      setPosition: (p) => {
        if (!panner) return;
        if (panner.positionX) { panner.positionX.value = p[0]; panner.positionY.value = p[1]; panner.positionZ.value = p[2]; }
        else if (panner.setPosition) panner.setPosition(p[0], p[1], p[2]);
      },
    };
  }
  // 监听器位姿（对标 Unity AudioListener）
  setListener({ position = [0, 0, 0], forward = [0, 0, -1], up = [0, 1, 0] } = {}) {
    if (!this._ctx || !this._ctx.listener) return;
    const L = this._ctx.listener;
    if (L.positionX) {
      L.positionX.value = position[0]; L.positionY.value = position[1]; L.positionZ.value = position[2];
      L.forwardX.value = forward[0]; L.forwardY.value = forward[1]; L.forwardZ.value = forward[2];
      L.upX.value = up[0]; L.upY.value = up[1]; L.upZ.value = up[2];
    } else if (L.setPosition) {
      L.setPosition(position[0], position[1], position[2]);
      L.setOrientation(forward[0], forward[1], forward[2], up[0], up[1], up[2]);
    }
  }
  // 总线增益（dB）
  setBusGain(bus, db) {
    const g = this._buses.get(bus);
    if (g) g.gain.value = Math.pow(10, db / 20);
  }
  setMasterGain(db) { if (this._master) this._master.gain.value = Math.pow(10, db / 20); }
  suspend() { if (this._ctx && this._ctx.suspend) { this._ctx.suspend(); this.state = 'suspended'; } }
  resume() { if (this._ctx && this._ctx.resume) { this._ctx.resume(); this.state = 'running'; } }
  get activeCount() { return this._sources.size; }
}

// 游戏音频组件：把 AudioEngine（确定性混音）与 AudioSink 组合，供实体脚本使用。
// 用法：const gameAudio = new GameAudio(sink); gameAudio.playShot(); // 内部走 sim/audio 合成
export class GameAudio {
  constructor(sink, engine = null) {
    this.sink = sink;
    this.engine = engine; // audio.js 的 AudioEngine（可选；直接 PCM 播放可不依赖）
  }
  // 播放合成音效：voiceSpec 走 audio.js 的 Voice 参数
  playVoice(voiceSpec, opts = {}) {
    if (!this.engine) throw new Error('GameAudio.playVoice: 需要 AudioEngine');
    this.engine.clear();
    this.engine.addVoice(voiceSpec, opts.bus || 'sfx');
    const pcm = this.engine.render(Math.ceil(voiceSpec.dur * this.engine.rate));
    return this.sink.play(pcm, opts);
  }
  playPCM(pcm, opts = {}) { return this.sink.play(pcm, opts); }
  play3D(pcm, opts = {}) { return this.sink.play3D(pcm, opts); }
  setListener(pose) { this.sink.setListener(pose); }
}
