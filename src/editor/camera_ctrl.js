// 相机控制：轨道(左拖)/平移(右拖或Shift+左拖)/缩放(滚轮)（对应 python/ide 的 camera_ctrl）。
export class CameraController {
  constructor(viewportPanel, canvas) {
    this.vp = viewportPanel; this.canvas = canvas;
    this._drag = null;
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('mousedown', e => this._down(e));
    canvas.addEventListener('mousemove', e => this._move(e));
    addEventListener('mouseup', () => { this._drag = null; });
    canvas.addEventListener('wheel', e => this._wheel(e), { passive: false });
    canvas.addEventListener('dblclick', e => this._focus(e));
  }
  _down(e) {
    if (e.button === 0 && !e.shiftKey) this._drag = { kind: 'orbit', x: e.clientX, y: e.clientY };
    else if (e.button === 2 || e.button === 1 || (e.button === 0 && e.shiftKey)) this._drag = { kind: 'pan', x: e.clientX, y: e.clientY };
  }
  _move(e) {
    if (!this._drag) return;
    const c = this.vp.cam;
    const dx = e.clientX - this._drag.x, dy = e.clientY - this._drag.y;
    this._drag.x = e.clientX; this._drag.y = e.clientY;
    if (this._drag.kind === 'orbit') {
      c.theta -= dx * 0.008;
      c.phi = Math.max(-1.5, Math.min(1.5, c.phi + dy * 0.008));
    } else {
      // 沿视口右/上方向平移 target
      const k = c.dist * 0.0016;
      const right = [Math.cos(c.theta), 0, -Math.sin(c.theta)];
      const up = [0, 1, 0];
      for (let i = 0; i < 3; i++) c.target[i] += (-dx * right[i] + dy * up[i]) * k;
    }
    this.vp._applyCam();
  }
  _wheel(e) {
    e.preventDefault();
    const c = this.vp.cam;
    c.dist = Math.max(1, Math.min(200, c.dist * (e.deltaY > 0 ? 1.1 : 0.9)));
    this.vp._applyCam();
  }
  _focus() {
    // 双击聚焦选中对象
    const ctx = this.vp.ctx;
    const id = ctx.selection.primary();
    const s = ctx.project.scene();
    const o = id != null && s ? s.get(id) : null;
    if (o) { this.vp.cam.target = [...o.transform.position]; this.vp._applyCam(); }
  }
}
