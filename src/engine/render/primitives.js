// 图元几何收编（D8）：cube / sphere / plane / cylinder / cone / torus 参数化生成。
// 全部返回 { positions:Float32Array, normals:Float32Array, uvs:Float32Array, indices:Uint32Array }。
// 缠绕约定为 CCW 朝外（前表面），但两后端视口的 cull 均设为 none，故不影响 parity。
// CPU 参考，零依赖；editor/games 统一引用本模块，消除三份重复实现。
export function cube(size = 1) {
  const h = size / 2;
  const faces = [
    { n: [1, 0, 0], q: [[h, -h, -h], [h, h, -h], [h, h, h], [h, -h, h]] },
    { n: [-1, 0, 0], q: [[-h, -h, h], [-h, h, h], [-h, h, -h], [-h, -h, -h]] },
    { n: [0, 1, 0], q: [[-h, h, -h], [-h, h, h], [h, h, h], [h, h, -h]] },
    { n: [0, -1, 0], q: [[-h, -h, h], [-h, -h, -h], [h, -h, -h], [h, -h, h]] },
    { n: [0, 0, 1], q: [[-h, -h, h], [h, -h, h], [h, h, h], [-h, h, h]] },
    { n: [0, 0, -1], q: [[h, -h, -h], [-h, -h, -h], [-h, h, -h], [h, h, -h]] },
  ];
  const P = [], N = [], U = [], I = [];
  const uvQ = [[0, 0], [1, 0], [1, 1], [0, 1]];
  for (const f of faces) {
    const base = P.length / 3;
    for (let k = 0; k < 4; k++) {
      P.push(...f.q[k]); N.push(...f.n); U.push(...uvQ[k]);
    }
    I.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return pack(P, N, U, I);
}

export function sphere(radius = 0.5, segU = 16, segV = 12) {
  const P = [], N = [], U = [], I = [];
  for (let r = 0; r <= segV; r++) {
    const phi = r / segV * Math.PI;
    for (let s = 0; s <= segU; s++) {
      const th = s / segU * 2 * Math.PI;
      const x = Math.sin(phi) * Math.cos(th), y = Math.cos(phi), z = Math.sin(phi) * Math.sin(th);
      P.push(x * radius, y * radius, z * radius); N.push(x, y, z); U.push(s / segU, r / segV);
    }
  }
  for (let r = 0; r < segV; r++) for (let s = 0; s < segU; s++) {
    const a = r * (segU + 1) + s, b = a + segU + 1;
    I.push(a, b, a + 1, a + 1, b, b + 1);
  }
  return pack(P, N, U, I);
}

export function plane(size = 10) {
  const h = size / 2;
  const P = [-h, 0, -h, h, 0, -h, h, 0, h, -h, 0, h];
  const N = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0];
  const U = [0, 0, 1, 0, 1, 1, 0, 1];
  const I = [0, 1, 2, 0, 2, 3];
  return pack(P, N, U, I);
}

export function cylinder(radius = 0.5, height = 1, seg = 20) {
  const h = height / 2;
  const P = [], N = [], U = [], I = [];
  for (let i = 0; i <= seg; i++) {
    const th = i / seg * 2 * Math.PI, x = Math.cos(th) * radius, z = Math.sin(th) * radius;
    const nx = Math.cos(th), nz = Math.sin(th);
    P.push(x, -h, z, x, h, z); N.push(nx, 0, nz, nx, 0, nz); U.push(i / seg, 0, i / seg, 1);
  }
  for (let i = 0; i < seg; i++) { const a = i * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  // 顶/底盖
  const topC = P.length / 3; P.push(0, h, 0); N.push(0, 1, 0); U.push(0.5, 0.5);
  const botC = P.length / 3; P.push(0, -h, 0); N.push(0, -1, 0); U.push(0.5, 0.5);
  for (let i = 0; i < seg; i++) {
    const a = i * 2;
    I.push(topC, a + 1, a + 3);            // 顶（CCW 朝上）
    I.push(botC, a + 2 + 1, a + 2);        // 底
  }
  return pack(P, N, U, I);
}

export function cone(radius = 0.5, height = 1, seg = 20) {
  const h = height / 2;
  const P = [], N = [], U = [], I = [];
  const apex = P.length / 3; P.push(0, h, 0); N.push(0, 1, 0); U.push(0.5, 0.5);
  for (let i = 0; i <= seg; i++) {
    const th = i / seg * 2 * Math.PI, x = Math.cos(th) * radius, z = Math.sin(th) * radius;
    P.push(x, -h, z); N.push(Math.cos(th), 0, Math.sin(th)); U.push(i / seg, 0);
  }
  for (let i = 0; i < seg; i++) { const b = i + 1; I.push(apex, b, b + 1); }
  // 底盖
  const botC = P.length / 3; P.push(0, -h, 0); N.push(0, -1, 0); U.push(0.5, 0.5);
  const base0 = apex + 1;
  for (let i = 0; i < seg; i++) { const b = base0 + i; I.push(botC, b + 1, b); }
  return pack(P, N, U, I);
}

export function torus(radius = 0.5, tube = 0.2, segU = 32, segV = 16) {
  const P = [], N = [], U = [], I = [];
  for (let i = 0; i <= segU; i++) {
    const u = i / segU * 2 * Math.PI, cu = Math.cos(u), su = Math.sin(u);
    for (let j = 0; j <= segV; j++) {
      const v = j / segV * 2 * Math.PI, cv = Math.cos(v), sv = Math.sin(v);
      const rr = radius + tube * cv;
      P.push(rr * cu, tube * sv, rr * su);
      N.push(cv * cu, sv, cv * su); U.push(i / segU, j / segV);
    }
  }
  const row = segV + 1;
  for (let i = 0; i < segU; i++) for (let j = 0; j < segV; j++) {
    const a = i * row + j, b = a + row;
    I.push(a, b, a + 1, a + 1, b, b + 1);
  }
  return pack(P, N, U, I);
}

export function primitive(name, opts = {}) {
  switch (name) {
    case 'sphere': return sphere(opts.radius ?? 0.5, opts.segU ?? 16, opts.segV ?? 12);
    case 'plane': return plane(opts.size ?? 10);
    case 'cylinder': return cylinder(opts.radius ?? 0.5, opts.height ?? 1, opts.seg ?? 20);
    case 'cone': return cone(opts.radius ?? 0.5, opts.height ?? 1, opts.seg ?? 20);
    case 'torus': return torus(opts.radius ?? 0.5, opts.tube ?? 0.2, opts.segU ?? 32, opts.segV ?? 16);
    case 'cube':
    default: return cube(opts.size ?? 1);
  }
}

function pack(P, N, U, I) {
  return {
    positions: new Float32Array(P), normals: new Float32Array(N), uvs: new Float32Array(U), indices: new Uint32Array(I),
    vertexCount: P.length / 3, indexCount: I.length,
  };
}
