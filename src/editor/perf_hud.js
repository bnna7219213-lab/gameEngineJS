// 性能 HUD：FPS / 帧耗时 / 对象数 / draw call（对应 python/ide 的 perf hud）。
export class PerfHud {
  constructor(el) {
    this.el = el; this.frames = 0; this.acc = 0; this.fps = 0; this.last = performance.now();
  }
  tick(viewportPanel, scene) {
    const now = performance.now();
    this.frames++; this.acc += now - this.last; this.last = now;
    if (this.acc >= 500) { this.fps = Math.round(this.frames * 1000 / this.acc); this.frames = 0; this.acc = 0; }
    const objs = scene ? scene.objects.size : 0;
    this.el.textContent =
      `fps ${this.fps}\nrender ${viewportPanel.lastMs.toFixed(1)} ms\nobjects ${objs}\ndraws ${viewportPanel.drawCalls}`;
  }
}
