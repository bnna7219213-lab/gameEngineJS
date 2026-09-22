// Gizmo：平移 / 旋转 / 缩放三模式（对标 Blender translate/rotate/scale）。
// 平移：轴世界方向投影到屏幕得 2D 方向，鼠标位移点积换算为轴上位移。
// 旋转：在轴垂直平面画圆环，绕轴心屏幕向量夹角变化 → rotation（度）。
// 缩放：轴端立方体手柄，沿轴屏幕方向拖拽 → scale 逐轴系数。

// ---------- 纯函数（Node smoke 可测，不依赖 DOM） ----------

// 点到圆环命中：|dist(p,c) - r| <= tol
export function hitCircle(mx, my, cx, cy, r, tol = 8) {
  return Math.abs(Math.hypot(mx - cx, my - cy) - r) <= tol;
}

// 绕屏幕圆心的有符号夹角变化（弧度）：from → to
export function angleDelta(cx, cy, fromX, fromY, toX, toY) {
  const a0 = Math.atan2(fromY - cy, fromX - cx);
  const a1 = Math.atan2(toY - cy, toX - cx);
  let d = a1 - a0;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

// 屏幕像素位移 → 缩放系数：plen 像素对应世界 len，dpx 沿轴方向的位移
export function axisScaleFactor(dpx, plen, len) {
  const k = dpx / Math.max(20, plen);
  return Math.max(0.01, 1 + k);
}

// 屏幕像素位移 → 轴上世界位移（平移用，dpx 已点积到轴屏幕方向）
export function axisWorldDelta(dpx, plen, len) {
  return (dpx / Math.max(20, plen)) * len;
}

// 点到轴线段命中（平移/缩放共用）
export function hitSegment(mx, my, ox, oy, ux, uy, plen, tol = 8) {
  const t = Math.max(0, Math.min(plen, (mx - ox) * ux + (my - oy) * uy));
  const px = ox + ux * t, py = oy + uy * t;
  return Math.hypot(mx - px, my - py) < tol;
}

const RAD2DEG = 180 / Math.PI;

export class Gizmo {
  constructor(viewportPanel, canvas) {
    this.vp = viewportPanel; this.canvas = canvas;
    this.mode = 'translate'; // 'translate' | 'rotate' | 'scale'
    this.activeAxis = -1; // 0=x 1=y 2=z
    this.axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    this.colors = ['#e05555', '#4fbf67', '#4f8cff'];
    this.len = 1.2;
    canvas.addEventListener('mousedown', e => this._down(e));
    canvas.addEventListener('mousemove', e => this._move(e));
    addEventListener('mouseup', () => { this.activeAxis = -1; });
  }
  setMode(mode) {
    if (!['translate', 'rotate', 'scale'].includes(mode)) throw new Error(`非法 gizmo 模式: ${mode}`);
    this.mode = mode;
    this.activeAxis = -1;
    this._grab = null;
  }
  _obj() {
    const ctx = this.vp.ctx;
    const id = ctx.selection.primary();
    const s = ctx.project.scene();
    return (id != null && s) ? s.get(id) : null;
  }
  _axisScreen(obj) {
    // 返回 [{ox,oy,ux,uy,plen,tip}] 每轴屏幕信息
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
  // 圆环（垂直于 axis 的平面）屏幕半径与采样点
  _ringScreen(obj, axis) {
    const p = obj.transform.position;
    const o = this.vp.vp.project(p);
    const [u, v] = axis === 0 ? [[0, 1, 0], [0, 0, 1]]
      : axis === 1 ? [[1, 0, 0], [0, 0, 1]]
        : [[1, 0, 0], [0, 1, 0]];
    const pts = [];
    const N = 48;
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * Math.PI * 2;
      const c = Math.cos(t) * this.len, s = Math.sin(t) * this.len;
      pts.push(this.vp.vp.project([
        p[0] + u[0] * c + v[0] * s,
        p[1] + u[1] * c + v[1] * s,
        p[2] + u[2] * c + v[2] * s,
      ]));
    }
    // 半径取首采样点屏幕距离
    const r = Math.hypot(pts[0].x - o.x, pts[0].y - o.y);
    return { cx: o.x, cy: o.y, r, pts };
  }
  _down(e) {
    if (e.button !== 0 || e.shiftKey) return;
    const obj = this._obj(); if (!obj) return;
    const r = this.canvas.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    if (this.mode === 'rotate') {
      for (let i = 0; i < 3; i++) {
        const ring = this._ringScreen(obj, i);
        if (hitCircle(mx, my, ring.cx, ring.cy, ring.r, 8)) {
          this.activeAxis = i;
          this._grab = { mx, my, rot: [...(obj.transform.rotation || [0, 0, 0])], ring: { cx: ring.cx, cy: ring.cy } };
          this.vp.ctx.history.push(this.vp.ctx.project.scene(), 'gizmo-rotate');
          e.stopPropagation(); e.preventDefault();
          return;
        }
      }
      return;
    }
    // translate / scale：共用轴线段命中
    const scr = this._axisScreen(obj);
    for (let i = 0; i < 3; i++) {
      const a = scr[i];
      if (hitSegment(mx, my, a.ox, a.oy, a.ux, a.uy, a.plen, 8)) {
        this.activeAxis = i;
        if (this.mode === 'scale') {
          this._grab = { mx, my, scale: [...(obj.transform.scale || [1, 1, 1])] };
          this.vp.ctx.history.push(this.vp.ctx.project.scene(), 'gizmo-scale');
        } else {
          this._grab = { mx, my, pos: [...obj.transform.position] };
          this.vp.ctx.history.push(this.vp.ctx.project.scene(), 'gizmo-move');
        }
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
    if (this.mode === 'rotate') {
      // 绕轴心屏幕向量夹角变化 → 度，叠加到抓取时的 rotation
      const d = angleDelta(this._grab.ring.cx, this._grab.ring.cy, this._grab.mx, this._grab.my, mx, my);
      const rot = [...this._grab.rot];
      rot[this.activeAxis] = rot[this.activeAxis] + d * RAD2DEG;
      obj.transform.rotation = rot;
      return;
    }
    const scr = this._axisScreen(obj)[this.activeAxis];
    // H5 修复：屏幕位移点积 = dx*ux + dy*uy（已删除 *0 死代码项）
    const dpx = (mx - this._grab.mx) * scr.ux + (my - this._grab.my) * scr.uy;
    if (this.mode === 'scale') {
      const f = axisScaleFactor(dpx, scr.plen, this.len);
      const s = [...this._grab.scale];
      s[this.activeAxis] = s[this.activeAxis] * f;
      obj.transform.scale = s;
      return;
    }
    // translate：屏幕像素 → 世界单位：轴满屏长度 = this.len
    const world = axisWorldDelta(dpx, scr.plen, this.len);
    obj.transform.position = [
      this._grab.pos[0] + this.axes[this.activeAxis][0] * world,
      this._grab.pos[1] + this.axes[this.activeAxis][1] * world,
      this._grab.pos[2] + this.axes[this.activeAxis][2] * world,
    ];
  }
  // 视口 render 之后调用，叠加 2D gizmo
  draw() {
    const obj = this._obj(); if (!obj) return;
    const g = this.canvas.getContext('2d');
    g.save();
    g.lineWidth = 2;
    if (this.mode === 'rotate') {
      for (let i = 0; i < 3; i++) {
        const ring = this._ringScreen(obj, i);
        g.strokeStyle = this.colors[i];
        g.globalAlpha = this.activeAxis === i ? 1 : 0.85;
        g.beginPath();
        ring.pts.forEach((p, k) => { k === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y); });
        g.stroke();
      }
      g.restore();
      return;
    }
    const scr = this._axisScreen(obj);
    for (let i = 0; i < 3; i++) {
      const a = scr[i];
      g.strokeStyle = this.colors[i];
      g.globalAlpha = this.activeAxis === i ? 1 : 0.85;
      g.beginPath(); g.moveTo(a.ox, a.oy); g.lineTo(a.tip.x, a.tip.y); g.stroke();
      g.fillStyle = this.colors[i];
      if (this.mode === 'scale') {
        // 立方体手柄
        const s = this.activeAxis === i ? 7 : 5;
        g.fillRect(a.tip.x - s / 2, a.tip.y - s / 2, s, s);
      } else {
        g.beginPath(); g.arc(a.tip.x, a.tip.y, this.activeAxis === i ? 6 : 4, 0, 7); g.fill();
      }
    }
    g.restore();
  }
}
