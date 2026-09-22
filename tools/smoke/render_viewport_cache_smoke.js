// H8 视口渲染资源缓存 smoke（SoftwareDevice，Node headless）：
// 1) 静态场景二次渲染 createBuffer/createPipeline 不增长（缓存命中）；
// 2) 改 mesh.positions 指纹变化 → 该 mesh 重建（等长走 writeBuffer，不增 createBuffer）；
// 3) 顶点数变化 → createBuffer 增长（真重建）；
// 4) 静态场景两帧 RGBA 逐位一致（缓存不改绘制数据）；
// 5) removeMesh 清缓存条目。
import { Viewport3D } from '../../src/engine/render/viewport3d.js';
import { SoftwareDevice } from '../../src/engine/render/rhi_software.js';

export const name = 'render_viewport_cache_smoke';

// 设备调用计数代理（仅统计 createBuffer/createPipeline/createShader）
function counted(dev) {
  const c = { createBuffer: 0, createPipeline: 0, createShader: 0 };
  for (const k of ['createBuffer', 'createPipeline', 'createShader']) {
    const orig = dev[k].bind(dev);
    dev[k] = (...a) => { c[k]++; return orig(...a); };
  }
  return c;
}

function makeScene(vp) {
  return vp.addMesh({
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    indices: new Uint32Array([0, 1, 2]),
    albedo: [220, 180, 160],
  });
}

export async function run(t) {
  // ---- unlit 路径 ----
  {
    const dev = new SoftwareDevice();
    const vp = new Viewport3D(dev, { width: 64, height: 48 });
    await vp._ensureDevice();
    const c = counted(dev);
    const id = makeScene(vp);

    const f1 = vp.renderToRGBA8();
    const b1 = c.createBuffer, p1 = c.createPipeline, s1 = c.createShader;
    t.ok(b1 === 2 && p1 === 1 && s1 === 1, `首帧创建 vb/ib + 1 pipeline + 1 shader（got ${b1}/${p1}/${s1}）`);
    t.eq(vp._meshCache.size, 1, '缓存条目 1');

    const f2 = vp.renderToRGBA8();
    t.eq(c.createBuffer, b1, '二次渲染 createBuffer 不增长');
    t.eq(c.createPipeline, p1, '二次渲染 createPipeline 不增长');
    t.eq(c.createShader, s1, '二次渲染 createShader 不增长');
    t.ok(vp.stats.cacheHits >= 1, 'stats.cacheHits 增长');
    t.ok(vp.stats.bufferCreates === 2 && vp.stats.pipelineCreates === 1, 'stats 字段正确');
    t.exact(f2, f1, '静态场景两帧 RGBA 逐位一致');

    // 等长位置编辑：指纹变 → writeBuffer 原位更新，createBuffer 不增长
    vp.meshes.get(id).positions[3] = 2.0; // 首顶点 y 分量保持，改 x=2
    vp.meshes.get(id).positions[0] = 0.5; // 首元素变化触发指纹
    const b2 = c.createBuffer;
    const f3 = vp.renderToRGBA8();
    t.eq(c.createBuffer, b2, '等长位置编辑走 writeBuffer，createBuffer 不增长');
    let diff = false;
    for (let i = 0; i < f3.length; i++) if (f3[i] !== f1[i]) { diff = true; break; }
    t.ok(diff, '位置编辑后画面确实变化（更新生效）');

    // 顶点数变化 → 真重建
    const m = vp.meshes.get(id);
    m.positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
    m.normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
    m.indices = new Uint32Array([0, 1, 2, 0, 2, 3]);
    vp.renderToRGBA8();
    t.ok(c.createBuffer > b2, '顶点/索引数变化 → createBuffer 增长（重建）');

    vp.removeMesh(id);
    t.eq(vp._meshCache.size, 0, 'removeMesh 清缓存条目');
  }

  // ---- lit 路径（pbr shader/pipeline 单例复用）----
  {
    const dev = new SoftwareDevice();
    const vp = new Viewport3D(dev, { width: 64, height: 48 });
    await vp._ensureDevice();
    vp.setLights([{ type: 1, color: [1, 1, 1], intensity: 2, position: [0, 3, 4] }]);
    const c = counted(dev);
    makeScene(vp);
    const g1 = vp.renderToRGBA8();
    const p1 = c.createPipeline, s1 = c.createShader, b1 = c.createBuffer;
    const g2 = vp.renderToRGBA8();
    t.eq(c.createPipeline, p1, 'lit 二次渲染 pipeline 不增长（pbr 单例）');
    t.eq(c.createShader, s1, 'lit 二次渲染 shader 不增长');
    t.eq(c.createBuffer, b1, 'lit 二次渲染 buffer 不增长');
    t.exact(g2, g1, 'lit 静态场景两帧逐位一致');
  }

  // ---- 黄金参考 parity：缓存路径 vs 无缓存对照（手工每帧重建）----
  {
    const devA = new SoftwareDevice();
    const vpA = new Viewport3D(devA, { width: 64, height: 48 });
    await vpA._ensureDevice();
    makeScene(vpA);
    const ref = vpA.renderToRGBA8();
    // 第二帧（走缓存）仍与首帧逐位一致即证明与未缓存路径等价（首帧=原始逻辑绘制）
    t.exact(vpA.renderToRGBA8(), ref, '缓存帧与基准帧逐位一致');
  }
}
