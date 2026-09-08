// 平移 Gizmo：在视口 2D 覆盖层绘制 XYZ 三轴并拖动（对应 python/ide 的 gizmo）。
// 拖动模型：轴世界方向投影到屏幕得 2D 方向，鼠标位移点积换算为轴上位移。
export class Gizmo {
  constructor(viewportPanel, canvas) {
    this.vp = viewportPanel; this.canvas = canvas;
    this.activeAxis = -1; // 0=x 1=y 2=z
    this.axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    this.colors = ['#e05555', '#4fbf67', '#4f8cff'];
    this.len = 1.2;
    canvas.addEventListener('mousedown', e => this._down(e));
    canvas.addEventListener('mousemove', e => this._move(e));
    addEventListener('mouseup', () => { this.activeAxis = -1; });
  }
  _obj() {
    const ctx = this.vp.ctx;
    const id = ctx.selection.primary();
    const s = ctx.project.scene();
    return (id != null && s) ? s.get(id) : null;
  }
  _axisScreen(obj) {
    // 返回 [{dx,dy,len,tipX,tipY,ox,oy}] 每轴屏幕信息
    const o = this.vp.vp.project(obj.transform.position);
    return this.axes.map(a => {
      const tip = this.vp.vp.project([
        obj.transform.position[0] + a[0] * this.len,
        obj.transform.position[1] + a[1] * this.len,
        obj.transform.position[2] + a[2] * this.len,
      ]);
      const dx = tip.x - o.x, dy = tip.y - o.y;
      const l = Math.hypot(dx, dy) || 1e-6;
      return { ox: o.x, oy: o.y, ux: dx / l, uy: dy / l, plen: l, tip };
    });
  }
  _down(e) {
    if (e.button !== 0 || e.shiftKey) return;
    const obj = this._obj(); if (!obj) return;
    const r = this.canvas.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const scr = this._axisScreen(obj);
    for (let i = 0; i < 3; i++) {
      const a = scr[i];
      // 点到轴线段距离
      const t = Math.max(0, Math.min(a.plen, (mx - a.ox) * a.ux + (my - a.oy) * a.uy));
      const px = a.ox + a.ux * t, py = a.oy + a.uy * t;
      if (Math.hypot(mx - px, my - py) < 8) {
        this.activeAxis = i;
        this._grab = { mx, my, pos: [...obj.transform.position] };
        this.vp.ctx.history.push(this.vp.ctx.project.scene(), 'gizmo-move');
        e.stopPropagation(); e.preventDefault();
        return;
      }
    }
  }
  _move(e) {
    if (this.activeAxis < 0 || !this._grab) return;
    const obj = this._obj(); if (!obj) return;
    const r = this.canvas.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const scr = this._axisScreen(obj)[this.activeAxis];
    const dpx = (mx - this._grab.mx) * scr.ux + (my - this._grab.oy - (this._grab.my - this._grab.oy)) * 0 + (my - this._grab.my) * scr.uy;
    // 屏幕像素 → 世界单位：轴满屏长度 = this.len
    const world = (dpx / Math.max(20, scr.plen)) * this.len;
    obj.transform.position = [
      this._grab.pos[0] + this.axes[this.activeAxis][0] * world,
      this._grab.pos[1] + this.axes[this.activeAxis][1] * world,
      this._grab.pos[2] + this.axes[this.activeAxis][2] * world,
    ];
  }
  // 视口 render 之后调用，叠加 2D 轴
  draw() {
    const obj = this._obj(); if (!obj) return;
    const g = this.canvas.getContext('2d');
    const scr = this._axisScreen(obj);
    g.save();
    g.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const a = scr[i];
      g.strokeStyle = this.colors[i];
      g.globalAlpha = this.activeAxis === i ? 1 : 0.85;
      g.beginPath(); g.moveTo(a.ox, a.oy); g.lineTo(a.tip.x, a.tip.y); g.stroke();
      g.beginPath(); g.arc(a.tip.x, a.tip.y, this.activeAxis === i ? 6 : 4, 0, 7); g.fillStyle = this.colors[i]; g.fill();
    }
    g.restore();
  }
}
