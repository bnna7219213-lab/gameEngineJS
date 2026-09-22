// 接口契约测试层 —— 对应 C++ engine/include/engine/contracts.h。
// 目的（红线 D）：任何 GPU 路径都先有 CPU 参考实现；契约测试把「参考实现」与
// 「被测实现」的同一组输入结果做比对，把"特性耦合无契约"变成可执行的约束。

export class ContractResult {
  constructor(name) {
    this.name = name;
    this.passed = 0;
    this.failed = 0;
    this.messages = [];
  }
  check(cond, msg) {
    if (cond) this.passed++;
    else { this.failed++; this.messages.push(msg); }
    return cond;
  }
  get ok() { return this.failed === 0; }
  toString() { return `${this.name}: ${this.passed} passed, ${this.failed} failed`; }
}

// 契约：一组具名断言函数 { 描述: (ctx) => boolean }
export class Contract {
  constructor(name, cases = {}) {
    this.name = name;
    this.cases = cases;
  }
  run(ctx) {
    const r = new ContractResult(this.name);
    for (const [desc, fn] of Object.entries(this.cases)) {
      let ok = false, err = null;
      try { ok = !!fn(ctx); } catch (e) { err = e; }
      r.check(ok, err ? `${desc} :: ${err.message}` : desc);
    }
    return r;
  }
}

export class ContractHarness {
  constructor() { this.contracts = new Map(); }
  add(c) { this.contracts.set(c.name, c); return this; }
  runAll(ctx = {}) {
    const results = [...this.contracts.values()].map((c) => c.run(ctx));
    return {
      results,
      ok: results.every((r) => r.ok),
      passed: results.reduce((a, r) => a + r.passed, 0),
      failed: results.reduce((a, r) => a + r.failed, 0)
    };
  }
}

// ---------------------------------------------------------------- RHI 契约
// 任何后端设备都须通过该契约：能画一个三角形，且清屏色正确。
export const IRHIContract = new Contract('IRHIContract', {
  'init 后宽高有效': (d) => d.width > 0 && d.height > 0,
  '清屏色与设定一致': (d) => {
    d.beginFrame();
    d.beginPass({ clearColor: [0.2, 0.4, 0.6, 1] });
    d.endPass();
    d.endFrame();
    const px = d.snapshot().rgba;
    const q = (v) => Math.round(v * 255);
    return q(0.2) === px[0] && q(0.4) === px[1] && q(0.6) === px[2];
  },
  '三角形覆盖中心像素': (d) => {
    const buf = d.createBuffer({ byteLength: 3 * 3 * 4 });
    d.writeBuffer(buf, new Float32Array([0, 0.5, 0, -0.5, -0.5, 0, 0.5, -0.5, 0]));
    const sh = d.createShader({
      name: 'tri',
      glsl: {
        vs: `#version 300 es
layout(location=0) in vec3 aPos; void main(){ gl_Position=vec4(aPos,1.0); }`,
        fs: `#version 300 es
precision mediump float; out vec4 o; void main(){ o=vec4(1.0,0.0,0.0,1.0); }`
      },
      js: {
        vs: (a) => ({ pos: [a.pos[0], a.pos[1], a.pos[2], 1], vary: {} }),
        fs: () => [255, 0, 0, 255]
      }
    });
    const p = d.createPipeline({
      shader: sh,
      vertexLayout: [{ name: 'pos', type: 'f32x3', offset: 0 }],
      cull: 'none'
    });
    d.beginFrame();
    d.beginPass({ clearColor: [0, 0, 0, 1] });
    d.setPipeline(p);
    d.setVertexBuffer(buf);
    d.draw(3);
    d.endPass();
    d.endFrame();
    const px = d.snapshot().rgba;
    const cx = ((d.height >> 1) * d.width + (d.width >> 1)) * 4;
    return px[cx] > 200 && px[cx + 1] < 60;
  }
});

// ---------------------------------------------------------------- 剔除契约
export const ICullingContract = new Contract('ICullingContract', {
  '视锥内物体不被剔除': ({ culler, frustum, inside }) => culler(frustum, inside) === true,
  '视锥外物体被剔除': ({ culler, frustum, outside }) => culler(frustum, outside) === false,
  '结果数量不超过输入': ({ culler, frustum, items }) =>
    items.filter((it) => culler(frustum, it)).length <= items.length
});

// ---------------------------------------------------------------- 数值契约
// 参考实现与被测实现的逐元素比对（容差可配；bit-exact 场景传 0）
export function compareBuffers(ref, got, tol = 2 / 255) {
  if (ref.length !== got.length) {
    return { ok: false, msg: `长度不一致 ref=${ref.length} got=${got.length}`, maxDiff: Infinity };
  }
  let maxDiff = 0, at = -1;
  for (let i = 0; i < ref.length; ++i) {
    const d = Math.abs(ref[i] - got[i]);
    if (d > maxDiff) { maxDiff = d; at = i; }
  }
  return { ok: maxDiff <= tol, msg: `maxDiff=${maxDiff} @${at}`, maxDiff, at };
}
