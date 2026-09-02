// 数学库 —— 与 C++ engine/include/engine/math.h (M5.0 统一约定) 逐元素对齐。
//
// 【存储约定】行主序 + 列向量右乘：Mat4.m[row * 4 + col]，变换写作 v' = M · v。
//   平移在第 4 列（m[3]/m[7]/m[11]），仿射矩阵末行恒为 (0,0,0,1)。
//   复合 A·B 表示「先施加 B 再施加 A」：model = T·R·S，vp = proj·view。
//   perspective/lookAt 与 meshlet_cull.h::perspectiveGL/lookAtRH 逐元素一致，
//   Frustum::fromViewProj 按 Gribb-Hartmann 提取（行主序按行取值）。
//
// 标量一律 number（IEEE754 double）。需要 bit-exact 的场景用 determinism.js 的定点。

export const EPS = 1e-6;
export const PI = Math.PI;
export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;

// ---------------------------------------------------------------- Vec2
export class Vec2 {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }
  static of(x, y) { return new Vec2(x, y); }
  clone() { return new Vec2(this.x, this.y); }
  set(x, y) { this.x = x; this.y = y; return this; }
  add(o) { return new Vec2(this.x + o.x, this.y + o.y); }
  sub(o) { return new Vec2(this.x - o.x, this.y - o.y); }
  scale(s) { return new Vec2(this.x * s, this.y * s); }
  len() { return Math.hypot(this.x, this.y); }
  lenSq() { return this.x * this.x + this.y * this.y; }
  normalize() { const l = this.len(); return l > EPS ? new Vec2(this.x / l, this.y / l) : new Vec2(0, 0); }
  toArray() { return [this.x, this.y]; }
  static dot(a, b) { return a.x * b.x + a.y * b.y; }
  static cross(a, b) { return a.x * b.y - a.y * b.x; }
  static lerp(a, b, t) { return new Vec2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t); }
  static dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
}

// ---------------------------------------------------------------- Vec3
export class Vec3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
  static of(x, y, z) { return new Vec3(x, y, z); }
  static zero() { return new Vec3(0, 0, 0); }
  static one() { return new Vec3(1, 1, 1); }
  static up() { return new Vec3(0, 1, 0); }
  clone() { return new Vec3(this.x, this.y, this.z); }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(o) { this.x = o.x; this.y = o.y; this.z = o.z; return this; }
  add(o) { return new Vec3(this.x + o.x, this.y + o.y, this.z + o.z); }
  sub(o) { return new Vec3(this.x - o.x, this.y - o.y, this.z - o.z); }
  mul(o) { return new Vec3(this.x * o.x, this.y * o.y, this.z * o.z); }
  scale(s) { return new Vec3(this.x * s, this.y * s, this.z * s); }
  neg() { return new Vec3(-this.x, -this.y, -this.z); }
  len() { return Math.hypot(this.x, this.y, this.z); }
  lenSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
  normalize() { const l = this.len(); return l > EPS ? new Vec3(this.x / l, this.y / l, this.z / l) : new Vec3(0, 0, 0); }
  toArray() { return [this.x, this.y, this.z]; }
  static fromArray(a) { return new Vec3(a[0], a[1], a[2]); }
  static dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
  static cross(a, b) {
    return new Vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
  }
  static lerp(a, b, t) { return new Vec3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t); }
  static dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }
  static min(a, b) { return new Vec3(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z)); }
  static max(a, b) { return new Vec3(Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z)); }
  // 任给一个与 n 不平行的向量构造正交基（Gram-Schmidt）
  static orthoBasis(n) {
    const a = Math.abs(n.x) < 0.9 ? new Vec3(1, 0, 0) : new Vec3(0, 1, 0);
    const t = a.sub(n.scale(Vec3.dot(a, n))).normalize();
    const b = Vec3.cross(n, t);
    return [t, b];
  }
}

// ---------------------------------------------------------------- Vec4
export class Vec4 {
  constructor(x = 0, y = 0, z = 0, w = 0) {
    this.x = x; this.y = y; this.z = z; this.w = w;
  }
  toArray() { return [this.x, this.y, this.z, this.w]; }
  static dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w; }
}

// ---------------------------------------------------------------- Mat4
export class Mat4 {
  constructor(m) {
    this.m = m ? Float32Array.from(m) : new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  }
  static identity() { return new Mat4(); }
  clone() { return new Mat4(this.m); }
  get(i, j) { return this.m[i * 4 + j]; }
  set(i, j, v) { this.m[i * 4 + j] = v; return this; }

  static translation(x, y, z) {
    const t = new Mat4();
    t.m[3] = x; t.m[7] = y; t.m[11] = z;
    return t;
  }
  static scale(x, y, z) {
    const s = new Mat4();
    s.m[0] = x; s.m[5] = y; s.m[10] = z;
    return s;
  }
  // 右手系：+X 转向 +Y
  static rotationZ(rad) {
    const r = new Mat4();
    const c = Math.cos(rad), s = Math.sin(rad);
    r.m[0] = c; r.m[1] = -s;
    r.m[4] = s; r.m[5] = c;
    return r;
  }
  // 右手系：+Y 转向 +Z
  static rotationX(rad) {
    const r = new Mat4();
    const c = Math.cos(rad), s = Math.sin(rad);
    r.m[5] = c; r.m[6] = -s;
    r.m[9] = s; r.m[10] = c;
    return r;
  }
  // 右手系：+Z 转向 +X
  static rotationY(rad) {
    const r = new Mat4();
    const c = Math.cos(rad), s = Math.sin(rad);
    r.m[0] = c; r.m[2] = s;
    r.m[8] = -s; r.m[10] = c;
    return r;
  }
  // 由四元数构造旋转（行主序）
  static fromQuat(q) {
    const { x, y, z, w } = q;
    const r = new Mat4();
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2;
    const yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;
    r.m[0] = 1 - (yy + zz); r.m[1] = xy - wz;       r.m[2] = xz + wy;
    r.m[4] = xy + wz;       r.m[5] = 1 - (xx + zz); r.m[6] = yz - wx;
    r.m[8] = xz - wy;       r.m[9] = yz + wx;       r.m[10] = 1 - (xx + yy);
    return r;
  }
  // 透视投影（右手系，NDC z ∈ [-1,1]；与 C++ perspective 逐元素一致）
  static perspective(fovy, aspect, zn, zf) {
    const m = new Mat4();
    m.m.fill(0);
    const f = 1 / Math.tan(fovy * 0.5);
    m.m[0] = f / aspect;
    m.m[5] = f;
    m.m[10] = (zf + zn) / (zn - zf);
    m.m[11] = (2 * zf * zn) / (zn - zf);
    m.m[14] = -1; // 末行 (0,0,-1,0)：w_clip = -z_view
    return m;
  }
  // 正交投影
  static ortho(l, r, b, t, zn, zf) {
    const m = new Mat4();
    m.m.fill(0);
    m.m[0] = 2 / (r - l);
    m.m[5] = 2 / (t - b);
    m.m[10] = -2 / (zf - zn);
    m.m[3] = -(r + l) / (r - l);
    m.m[7] = -(t + b) / (t - b);
    m.m[11] = -(zf + zn) / (zf - zn);
    m.m[15] = 1;
    return m;
  }
  // 视图矩阵（右手系 look-at；旋转部分基向量按行排布，平移在第 4 列）
  static lookAt(eye, center, up) {
    const f = center.sub(eye).normalize();
    const s = Vec3.cross(f, up).normalize();
    const u = Vec3.cross(s, f);
    const m = new Mat4();
    m.m[0] = s.x; m.m[1] = s.y; m.m[2] = s.z; m.m[3] = -Vec3.dot(s, eye);
    m.m[4] = u.x; m.m[5] = u.y; m.m[6] = u.z; m.m[7] = -Vec3.dot(u, eye);
    m.m[8] = -f.x; m.m[9] = -f.y; m.m[10] = -f.z; m.m[11] = Vec3.dot(f, eye);
    m.m[12] = 0; m.m[13] = 0; m.m[14] = 0; m.m[15] = 1;
    return m;
  }

  // 行主序乘法：r[i][j] = Σ_k a[i][k] * b[k][j]
  mul(o) {
    const r = new Mat4();
    const a = this.m, b = o.m, c = r.m;
    for (let i = 0; i < 4; ++i)
      for (let j = 0; j < 4; ++j) {
        let v = 0;
        for (let k = 0; k < 4; ++k) v += a[i * 4 + k] * b[k * 4 + j];
        c[i * 4 + j] = v;
      }
    return r;
  }
  static multiply(a, b) { return a.mul(b); }

  // 仿射变换点（隐含 w=1，不做透视除法）
  applyPoint(p) {
    const m = this.m;
    return new Vec3(
      m[0] * p.x + m[1] * p.y + m[2] * p.z + m[3],
      m[4] * p.x + m[5] * p.y + m[6] * p.z + m[7],
      m[8] * p.x + m[9] * p.y + m[10] * p.z + m[11]
    );
  }
  // 变换方向向量（w=0，忽略平移）
  applyDir(p) {
    const m = this.m;
    return new Vec3(
      m[0] * p.x + m[1] * p.y + m[2] * p.z,
      m[4] * p.x + m[5] * p.y + m[6] * p.z,
      m[8] * p.x + m[9] * p.y + m[10] * p.z
    );
  }
  // 变换到裁剪空间，返回 {x,y,z,w}
  applyClip(p) {
    const m = this.m;
    return {
      x: m[0] * p.x + m[1] * p.y + m[2] * p.z + m[3],
      y: m[4] * p.x + m[5] * p.y + m[6] * p.z + m[7],
      z: m[8] * p.x + m[9] * p.y + m[10] * p.z + m[11],
      w: m[12] * p.x + m[13] * p.y + m[14] * p.z + m[15]
    };
  }
  transpose() {
    const r = new Mat4();
    for (let i = 0; i < 4; ++i) for (let j = 0; j < 4; ++j) r.m[i * 4 + j] = this.m[j * 4 + i];
    return r;
  }
  // 通用 4x4 求逆（Gauss-Jordan）；奇异返回 identity
  invert() {
    const a = Array.from(this.m);
    const inv = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    for (let i = 0; i < 4; ++i) {
      let piv = i;
      for (let r = i + 1; r < 4; ++r) if (Math.abs(a[r * 4 + i]) > Math.abs(a[piv * 4 + i])) piv = r;
      if (Math.abs(a[piv * 4 + i]) < 1e-12) return Mat4.identity();
      if (piv !== i) {
        for (let k = 0; k < 4; ++k) {
          [a[i * 4 + k], a[piv * 4 + k]] = [a[piv * 4 + k], a[i * 4 + k]];
          [inv[i * 4 + k], inv[piv * 4 + k]] = [inv[piv * 4 + k], inv[i * 4 + k]];
        }
      }
      const d = a[i * 4 + i];
      for (let k = 0; k < 4; ++k) { a[i * 4 + k] /= d; inv[i * 4 + k] /= d; }
      for (let r = 0; r < 4; ++r) {
        if (r === i) continue;
        const f = a[r * 4 + i];
        if (f === 0) continue;
        for (let k = 0; k < 4; ++k) {
          a[r * 4 + k] -= f * a[i * 4 + k];
          inv[r * 4 + k] -= f * inv[i * 4 + k];
        }
      }
    }
    return new Mat4(inv);
  }
  // 点变换（含平移，齐次 w=1）
  transformPoint(v) {
    const x = v.x !== undefined ? v.x : (v[0] || 0);
    const y = v.y !== undefined ? v.y : (v[1] || 0);
    const z = v.z !== undefined ? v.z : (v[2] || 0);
    const m = this.m;
    return Vec3.of(
      m[0] * x + m[1] * y + m[2] * z + m[3],
      m[4] * x + m[5] * y + m[6] * z + m[7],
      m[8] * x + m[9] * y + m[10] * z + m[11],
    );
  }
  // 齐次变换：返回 [x, y, z, w]（含第四行，透视除法前的完整齐次坐标）。
  // 供软件光栅器的近/远平面裁剪与透视正确插值使用；等价 GLSL 的 gl_Position。
  transformH(v) {
    const x = v.x !== undefined ? v.x : (v[0] || 0);
    const y = v.y !== undefined ? v.y : (v[1] || 0);
    const z = v.z !== undefined ? v.z : (v[2] || 0);
    const m = this.m;
    return [
      m[0] * x + m[1] * y + m[2] * z + m[3],
      m[4] * x + m[5] * y + m[6] * z + m[7],
      m[8] * x + m[9] * y + m[10] * z + m[11],
      m[12] * x + m[13] * y + m[14] * z + m[15],
    ];
  }
  // 方向变换（不含平移，齐次 w=0）
  transformDir(v) {
    const x = v.x !== undefined ? v.x : (v[0] || 0);
    const y = v.y !== undefined ? v.y : (v[1] || 0);
    const z = v.z !== undefined ? v.z : (v[2] || 0);
    const m = this.m;
    return Vec3.of(m[0] * x + m[1] * y + m[2] * z, m[4] * x + m[5] * y + m[6] * z, m[8] * x + m[9] * y + m[10] * z);
  }
  // 由 T/R/S 组合（先缩放，再旋转，最后平移）
  static compose(t, rEuler, s) {
    const rx = Mat4.rotationX(rEuler.x), ry = Mat4.rotationY(rEuler.y), rz = Mat4.rotationZ(rEuler.z);
    return Mat4.translation(t.x, t.y, t.z).mul(ry.mul(rx).mul(rz)).mul(Mat4.scale(s.x, s.y, s.z));
  }
  isAffine() {
    return Math.abs(this.m[12]) < 1e-9 && Math.abs(this.m[13]) < 1e-9 &&
           Math.abs(this.m[14]) < 1e-9 && Math.abs(this.m[15] - 1) < 1e-9;
  }
}

// ---------------------------------------------------------------- Quat
export class Quat {
  constructor(x = 0, y = 0, z = 0, w = 1) {
    this.x = x; this.y = y; this.z = z; this.w = w;
  }
  static identity() { return new Quat(); }
  // XYZ 内旋（与 Mat4.rotationY*rotationX*rotationZ 一致的欧拉序）
  static fromEuler(x, y, z) {
    const cx = Math.cos(x * 0.5), sx = Math.sin(x * 0.5);
    const cy = Math.cos(y * 0.5), sy = Math.sin(y * 0.5);
    const cz = Math.cos(z * 0.5), sz = Math.sin(z * 0.5);
    return new Quat(
      sx * cy * cz + cx * sy * sz,
      cx * sy * cz - sx * cy * sz,
      cx * cy * sz + sx * sy * cz,
      cx * cy * cz - sx * sy * sz
    );
  }
  toMat4() { return Mat4.fromQuat(this); }
  normalize() {
    const l = Math.hypot(this.x, this.y, this.z, this.w) || 1;
    return new Quat(this.x / l, this.y / l, this.z / l, this.w / l);
  }
  mul(o) {
    return new Quat(
      this.w * o.x + this.x * o.w + this.y * o.z - this.z * o.y,
      this.w * o.y - this.x * o.z + this.y * o.w + this.z * o.x,
      this.w * o.z + this.x * o.y - this.y * o.x + this.z * o.w,
      this.w * o.w - this.x * o.x - this.y * o.y - this.z * o.z
    );
  }
  static slerp(a, b, t) {
    let d = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
    let bb = b;
    if (d < 0) { bb = new Quat(-b.x, -b.y, -b.z, -b.w); d = -d; }
    if (d > 0.9995) {
      return new Quat(a.x + (bb.x - a.x) * t, a.y + (bb.y - a.y) * t,
        a.z + (bb.z - a.z) * t, a.w + (bb.w - a.w) * t).normalize();
    }
    const th = Math.acos(d), s = Math.sin(th);
    const wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
    return new Quat(a.x * wa + bb.x * wb, a.y * wa + bb.y * wb,
      a.z * wa + bb.z * wb, a.w * wa + bb.w * wb).normalize();
  }
}

// ---------------------------------------------------------------- Color
// 分量 0..1（渲染管线内部统一线性值）；toRGBA8 输出 0..255 字节。
export class Color {
  constructor(r = 1, g = 1, b = 1, a = 1) {
    this.r = r; this.g = g; this.b = b; this.a = a;
  }
  static fromRGB8(r, g, b, a = 255) { return new Color(r / 255, g / 255, b / 255, a / 255); }
  static fromHex(hex) {
    const v = parseInt(hex.replace('#', ''), 16);
    return new Color(((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255, 1);
  }
  toRGBA8() {
    const q = (x) => Math.max(0, Math.min(255, Math.round(x * 255)));
    return [q(this.r), q(this.g), q(this.b), q(this.a)];
  }
  toHex() {
    const [r, g, b] = this.toRGBA8();
    return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
  }
  scale(s) { return new Color(this.r * s, this.g * s, this.b * s, this.a); }
  lerp(o, t) {
    return new Color(this.r + (o.r - this.r) * t, this.g + (o.g - this.g) * t,
      this.b + (o.b - this.b) * t, this.a + (o.a - this.a) * t);
  }
  // sRGB -> linear（渲染/光照计算前必须转换）
  toLinear() {
    const f = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    return new Color(f(this.r), f(this.g), f(this.b), this.a);
  }
  // linear -> sRGB（输出前）
  toSRGB() {
    const f = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
    return new Color(f(this.r), f(this.g), f(this.b), this.a);
  }
}

// ---------------------------------------------------------------- AABB
export class AABB {
  constructor(min = new Vec3(1e30, 1e30, 1e30), max = new Vec3(-1e30, -1e30, -1e30)) {
    this.min = min;
    this.max = max;
  }
  static fromPoints(pts) {
    let mn = new Vec3(1e30, 1e30, 1e30), mx = new Vec3(-1e30, -1e30, -1e30);
    for (const p of pts) { mn = Vec3.min(mn, p); mx = Vec3.max(mx, p); }
    return new AABB(mn, mx);
  }
  center() { return this.min.add(this.max).scale(0.5); }
  extent() { return this.max.sub(this.min).scale(0.5); }
  contains(p) {
    return p.x >= this.min.x && p.x <= this.max.x && p.y >= this.min.y &&
           p.y <= this.max.y && p.z >= this.min.z && p.z <= this.max.z;
  }
  overlaps(o) {
    return this.min.x <= o.max.x && this.max.x >= o.min.x &&
           this.min.y <= o.max.y && this.max.y >= o.min.y &&
           this.min.z <= o.max.z && this.max.z >= o.min.z;
  }
  expand(p) { return new AABB(Vec3.min(this.min, p), Vec3.max(this.max, p)); }
  union(o) { return new AABB(Vec3.min(this.min, o.min), Vec3.max(this.max, o.max)); }
  // 保守变换包围（行主序）：中心仿射变换，半长按各行绝对值和缩放
  transformed(m) {
    const c = this.center(), e = this.extent();
    const nc = m.applyPoint(c);
    const sx = Math.abs(m.m[0]) + Math.abs(m.m[1]) + Math.abs(m.m[2]);
    const sy = Math.abs(m.m[4]) + Math.abs(m.m[5]) + Math.abs(m.m[6]);
    const sz = Math.abs(m.m[8]) + Math.abs(m.m[9]) + Math.abs(m.m[10]);
    return new AABB(nc.sub(new Vec3(sx * e.x, sy * e.y, sz * e.z)),
      nc.add(new Vec3(sx * e.x, sy * e.y, sz * e.z)));
  }
  // 射线相交（slab 法）；返回 {tmin,tmax} 或 null
  rayHit(ro, rd) {
    let tmin = -Infinity, tmax = Infinity;
    for (const ax of ['x', 'y', 'z']) {
      const inv = 1 / (rd[ax] || 1e-20);
      let t1 = (this.min[ax] - ro[ax]) * inv;
      let t2 = (this.max[ax] - ro[ax]) * inv;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
    return { tmin, tmax };
  }
  toArray() { return [...this.min.toArray(), ...this.max.toArray()]; }
}

// ---------------------------------------------------------------- Frustum
// 6 平面；n·p + d >= 0 表示在内部
export class Frustum {
  constructor() {
    this.n = new Array(6);
    this.d = new Float64Array(6);
  }
  // 由视图投影矩阵（行主序，clip = M · world）按 Gribb-Hartmann 提取
  static fromViewProj(vp) {
    const f = new Frustum();
    const row = (i) => new Vec3(vp.m[i * 4 + 0], vp.m[i * 4 + 1], vp.m[i * 4 + 2]);
    const w = (i) => vp.m[i * 4 + 3];
    const r0 = row(0), r1 = row(1), r2 = row(2), r3 = row(3);
    const pn = [r3.add(r0), r3.sub(r0), r3.add(r1), r3.sub(r1), r3.add(r2), r3.sub(r2)];
    const pd = [w(3) + w(0), w(3) - w(0), w(3) + w(1), w(3) - w(1), w(3) + w(2), w(3) - w(2)];
    for (let i = 0; i < 6; ++i) {
      const l = pn[i].len();
      f.n[i] = pn[i].scale(1 / l);
      f.d[i] = pd[i] / l;
    }
    return f;
  }
  intersects(b) {
    for (let i = 0; i < 6; ++i) {
      const n = this.n[i];
      const p = new Vec3(n.x >= 0 ? b.max.x : b.min.x, n.y >= 0 ? b.max.y : b.min.y, n.z >= 0 ? b.max.z : b.min.z);
      if (Vec3.dot(n, p) + this.d[i] < 0) return false;
    }
    return true;
  }
  contains(b) {
    for (let i = 0; i < 6; ++i) {
      const n = this.n[i];
      const p = new Vec3(n.x >= 0 ? b.min.x : b.max.x, n.y >= 0 ? b.min.y : b.max.y, n.z >= 0 ? b.min.z : b.max.z);
      if (Vec3.dot(n, p) + this.d[i] < 0) return false;
    }
    return true;
  }
}

// ---------------------------------------------------------------- 工具
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
export const saturate = (v) => clamp(v, 0, 1);

// 确定性伪随机（xorshift32）：给定种子，跨端/跨浏览器结果完全一致
export class Rng {
  constructor(seed = 0x12345678) { this.s = seed >>> 0 || 1; }
  nextU32() {
    let x = this.s;
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    this.s = x;
    return x >>> 0;
  }
  next() { return this.nextU32() / 4294967296; }
  range(a, b) { return a + (b - a) * this.next(); }
  int(n) { return this.nextU32() % n; }
  unitVec3() {
    const z = this.range(-1, 1);
    const a = this.range(0, Math.PI * 2);
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    return new Vec3(r * Math.cos(a), r * Math.sin(a), z);
  }
}
