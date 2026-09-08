// 统一渲染提交路径 smoke：SceneRenderer（RenderGraph 编排）在 Software 后端全 CPU 闭环验证。
// WebGL2 的逐像素 parity 由 parity_browser.html 在浏览器验收。
import { SceneRenderer } from '../../src/engine/render/scene_render.js';
import { SoftwareDevice } from '../../src/engine/render/rhi_software.js';
import { Mat4, Vec3 } from '../../src/engine/core/math.js';

function makeQuad() {
  return {
    positions: [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    uvs: [0, 0, 1, 0, 1, 1, 0, 1],
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  };
}
const cam = { eye: [0, 0, 3], target: [0, 0, 0], up: [0, 1, 0], fovY: Math.PI / 3, near: 0.1, far: 100 };

export const name = 'render_scene_graph_smoke.js';
export async function run(t) {
  const dev = new SoftwareDevice();
  await dev.init({ width: 64, height: 64 });

  // 1) 实例化：1 几何 + 4 实例矩阵 → 4 彩色象限
  {
    const quad = makeQuad();
    const scene = { meshes: [quad], instances: [{ mesh: 0, matrices: [
      Mat4.translation(-0.5, 0.5, 0), Mat4.translation(0.5, 0.5, 0), Mat4.translation(-0.5, -0.5, 0), Mat4.translation(0.5, -0.5, 0)
    ], colors: [[0.8, 0.2, 0.2], [0.2, 0.85, 0.2], [0.2, 0.2, 0.9], [0.95, 0.9, 0.2]] }] };
    const sr = new SceneRenderer(dev, { width: 64, height: 64 });
    sr.setCamera(cam); sr.setScene(scene);
    const out = sr.render();
    t.eq(out.width, 64, '输出宽度'); t.eq(out.height, 64, '输出高度');
    const px = (x, y) => { const i = (y * 64 + x) * 4; return [out.rgba[i], out.rgba[i + 1], out.rgba[i + 2]]; };
    // 用与 SceneRenderer 内部一致的 vp 把各实例中心投影到屏幕像素，采样其内点。
    // 应用透视后 4 个实例仍分处左上/右上/左下/右下四个屏幕象限，但不再是整块屏幕象限。
    const vp = Mat4.perspective(cam.fovY, 1, cam.near, cam.far).mul(Mat4.lookAt(Vec3.of(...cam.eye), Vec3.of(...cam.target), Vec3.of(...cam.up)));
    const projPx = (wx, wy, wz) => {
      const m = vp.m; const w = (m[12] * wx + m[13] * wy + m[14] * wz + m[15]) || 1e-9;
      const ndx = (m[0] * wx + m[1] * wy + m[2] * wz + m[3]) / w;
      const ndy = (m[4] * wx + m[5] * wy + m[6] * wz + m[7]) / w;
      return [Math.max(0, Math.min(63, Math.round((ndx * 0.5 + 0.5) * 64))), Math.max(0, Math.min(63, Math.round((1 - (ndy * 0.5 + 0.5)) * 64)))];
    };
    const centers = [[-0.5, 0.5, 0], [0.5, 0.5, 0], [-0.5, -0.5, 0], [0.5, -0.5, 0]];
    const [tl, tr, bl, br] = centers.map((c) => { const [sx, sy] = projPx(...c); return px(sx, sy); });
    t.ok(tl[0] > tl[1] && tl[0] > tl[2], '左上 = 红');
    t.ok(tr[1] > tr[0] && tr[1] > tr[2], '右上 = 绿');
    t.ok(bl[2] > bl[0] && bl[2] > bl[1], '左下 = 蓝');
    t.ok(br[0] >= br[2] && br[1] >= br[2], '右下 = 黄');
    const lit = [tl, tr, bl, br].every(c => (c[0] || 0) + (c[1] || 0) + (c[2] || 0) > 0);
    t.ok(lit, '四个象限均有实例绘制');
  }

  // 2) 视锥剔除：屏外网格被剔除
  {
    const vis = Object.assign(makeQuad(), { transform: Mat4.translation(0, 0, 0), color: [0.9, 0.9, 0.2] });
    const off = Object.assign(makeQuad(), { transform: Mat4.translation(10, 0, 0), color: [0.2, 0.9, 0.2] });
    const scene = { meshes: [vis, off] };
    const sr = new SceneRenderer(dev, { width: 64, height: 64 });
    sr.setCamera(cam); sr.setScene(scene);
    sr.render();
    t.eq(sr._lastVisible.length, 1, '2 网格中仅 1 个可见（剔除屏外）');
  }

  // 3) 后处理：HDR 亮色 → ACES+bloom → 8bit（无 NaN、范围合法）
  {
    const bright = Object.assign(makeQuad(), { transform: Mat4.translation(0, 0, 0), color: [3.0, 2.5, 0.5] });
    const scene = { meshes: [bright] };
    const sr = new SceneRenderer(dev, { width: 64, height: 64 });
    sr.setCamera(cam); sr.setScene(scene);
    sr.postParams = { threshold: 1.0, knee: 0.5, exposure: 1.0, bloomIntensity: 0.8, radius: 4 };
    const out = sr.render();
    let ok = true, inRange = true;
    for (let i = 0; i < out.rgba.length; i++) { if (!isFinite(out.rgba[i])) ok = false; if (out.rgba[i] < 0 || out.rgba[i] > 255) inRange = false; }
    t.ok(ok, '后处理输出无 NaN/Inf');
    t.ok(inRange, '后处理输出在 0..255');
    const i = (32 * 64 + 32) * 4;
    t.ok(out.rgba[i] > out.rgba[i + 1] && out.rgba[i] > out.rgba[i + 2], '中心亮区红主导');
  }

  // 4) 相机投影生效（UC9）：单红网格 + 透视相机(z=3)。
  // 中心像素应为红（网格投影到屏幕中心）；角落应为清屏黑（网格只占中心，未铺满整屏）。
  // 若 Software VS 回退为「忽略 uVP、模型坐标当 NDC」，网格会铺满整屏 → 角落也变红 → 此测试失败。
  {
    const q = Object.assign(makeQuad(), { transform: Mat4.identity(), color: [1, 0, 0] });
    const scene = { meshes: [q] };
    const sr = new SceneRenderer(dev, { width: 64, height: 64 });
    sr.setCamera(cam); sr.setScene(scene);
    const out = sr.render();
    const px = (x, y) => { const i = (y * 64 + x) * 4; return [out.rgba[i], out.rgba[i + 1], out.rgba[i + 2]]; };
    const center = px(32, 32), corner = px(2, 2);
    t.ok(center[0] > 120 && center[1] < 60 && center[2] < 60, '中心像素红主导（透视投影生效）');
    t.ok(corner[0] < 20 && corner[1] < 20 && corner[2] < 20, '角落为清屏黑（网格未铺满整屏）');
  }

  // 5) LOD：按相机距离选择几何变体
  {
    const base = makeQuad();
    const lo = Object.assign(makeQuad(), { indices: new Uint32Array([0, 1, 2]) }); // 低模（三角）
    const hi = Object.assign(makeQuad(), {});
    const mesh = Object.assign(makeQuad(), { lodVariants: [hi, lo], lodThresholds: [20, 50] });
    const scene = { meshes: [mesh] };
    const sr = new SceneRenderer(dev, { width: 64, height: 64 });
    sr.setCamera(cam); sr.setScene(scene);
    sr.render();
    t.eq(sr._lastVisible[0].mesh, hi, '近距离(距3) → 选高模');
    // 远距离（距 60 > 50）→ 选低模 lo
    const farCam = { eye: [0, 0, 60], target: [0, 0, 0], up: [0, 1, 0], fovY: Math.PI / 3, near: 0.1, far: 200 };
    const sr2 = new SceneRenderer(dev, { width: 64, height: 64 });
    sr2.setCamera(farCam); sr2.setScene(scene);
    sr2.render();
    t.eq(sr2._lastVisible[0].mesh, lo, '远距离(距60) → 选低模');
  }

  // 5) RenderGraph 编排结构
  {
    const sr = new SceneRenderer(dev, { width: 64, height: 64 });
    const g = sr.buildGraph();
    t.eq(typeof g.run, 'function', 'RenderGraph 可执行');
    const order = g.order();
    t.ok(order.indexOf('cull') < order.indexOf('draw') && order.indexOf('draw') < order.indexOf('post'), '节点顺序 cull→draw→post');
  }

  // 6) Hi-Z 遮挡剔除（统一提交路径）：CPU 深度预pass 构建 HiZBuffer，剔除被遮挡网格
  {
    const wall = {
      positions: [-2, -2, -1, 2, -2, -1, 2, 2, -1, -2, 2, -1],
      normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], uvs: [0, 0, 1, 0, 1, 1, 0, 1],
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]), occluder: true,
    };
    const hidden = {
      positions: [-0.25, -0.25, -3, 0.25, -0.25, -3, 0.25, 0.25, -3, -0.25, 0.25, -3],
      normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], uvs: [0, 0, 1, 0, 1, 1, 0, 1],
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]), color: [0.2, 0.9, 0.9],
    };
    const scene = { meshes: [wall, hidden] };

    // 关闭遮挡：两网格均可见
    const srOff = new SceneRenderer(dev, { width: 64, height: 64 });
    srOff.setCamera(cam); srOff.setScene(scene);
    const frameOff = srOff.render();
    t.eq(srOff._lastVisible.length, 2, '遮挡关闭：两网格均可见');
    const ci = (32 * 64 + 32) * 4; // 隐藏球屏幕中心像素
    t.ok(frameOff.rgba[ci] > 200 && frameOff.rgba[ci + 1] > 200 && frameOff.rgba[ci + 2] > 200,
      '遮挡关闭：中心像素为遮挡墙(白，深度测试已挡住其后小球)');

    // 开启遮挡：小球被墙遮挡 → 仅墙可见
    const srOn = new SceneRenderer(dev, { width: 64, height: 64 });
    srOn.setCamera(cam); srOn.setScene(scene); srOn.setOcclusion(true);
    const frameOn = srOn.render();
    t.eq(srOn._lastVisible.length, 1, '遮挡开启：被遮挡小球被剔除');
    t.eq(srOn._occlusionCulled, 1, '本帧被遮挡剔除数 = 1');
    t.eq(srOn._lastVisible[0].mesh, wall, '保留的是遮挡墙');
    t.ok(frameOn.rgba[ci] > 200 && frameOn.rgba[ci + 1] > 200 && frameOn.rgba[ci + 2] > 200,
      '遮挡开启：中心像素显示遮挡墙(白)而非隐藏球(青)');
    let pd = 0;
    for (let i = 0; i < frameOn.rgba.length; i++) pd = Math.max(pd, Math.abs(frameOn.rgba[i] - frameOff.rgba[i]));
    t.ok(pd <= 2, `遮挡剔除视觉无损（开启/关闭最大像素差=${pd}，<=2）`);

    // 开启遮挡但无任何 occluder：空深度缓冲不应误剔（minZ<1 恒成立）
    const a = Object.assign(makeQuad(), { transform: Mat4.translation(-1, 0, 0), color: [0.9, 0.2, 0.2] });
    const b = Object.assign(makeQuad(), { transform: Mat4.translation(1, 0, 0), color: [0.2, 0.9, 0.2] });
    const srEmpty = new SceneRenderer(dev, { width: 64, height: 64 });
    srEmpty.setCamera(cam); srEmpty.setScene({ meshes: [a, b] }); srEmpty.setOcclusion(true); srEmpty.render();
    t.eq(srEmpty._lastVisible.length, 2, '无 occluder 时不误剔');
  }

  // 6b) 实例化遮挡物（统一提交路径）：多个实例均需写入 HiZ，仅首实例写入是 bug
  {
    const wall = {
      positions: [-2, -2, -1, 2, -2, -1, 2, 2, -1, -2, 2, -1],
      normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], uvs: [0, 0, 1, 0, 1, 1, 0, 1],
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]), occluder: true,
    };
    const hidden = {
      positions: [-0.25, -0.25, -3, 0.25, -0.25, -3, 0.25, 0.25, -3, -0.25, 0.25, -3],
      normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], uvs: [0, 0, 1, 0, 1, 1, 0, 1],
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]), color: [0.2, 0.9, 0.9],
    };
    // 实例0移出屏幕(不挡中心)，实例1在中心(遮挡隐藏球)：若只写入首实例，隐藏球会漏剔
    const scene = { meshes: [wall, hidden], instances: [{ mesh: 0, matrices: [Mat4.translation(-10, 0, 0), Mat4.translation(0, 0, 0)] }] };
    const sr = new SceneRenderer(dev, { width: 64, height: 64 });
    sr.setCamera(cam); sr.setScene(scene); sr.setOcclusion(true); sr.render();
    t.eq(sr._occlusionCulled, 1, '实例化遮挡物：第二实例遮挡隐藏球，应剔除 1');
    t.eq(sr._lastVisible.length, 1, '实例化遮挡物：仅遮挡墙可见');
    t.eq(sr._lastVisible[0].mesh, wall, '实例化遮挡物：保留的是实例化墙');
  }

  // 6c) 叠放遮挡物（统一提交路径）：靠后的遮挡物须保留（自身豁免剔除），才能继续遮挡更远的物体
  {
    const mkQuad = (cx, cy, cz, s, extra = {}) => ({
      positions: [cx - s, cy - s, cz, cx + s, cy - s, cz, cx + s, cy + s, cz, cx - s, cy + s, cz],
      normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], uvs: [0, 0, 1, 0, 1, 1, 0, 1],
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]), ...extra,
    });
    const occluderNear = mkQuad(0, 0, -1, 2, { occluder: true });
    const occluderFar = mkQuad(0, 0, -2, 1, { occluder: true });
    const hidden = mkQuad(0, 0, -3, 0.25, { color: [0.2, 0.9, 0.9] });
    const scene = { meshes: [occluderNear, occluderFar, hidden] };
    const sr = new SceneRenderer(dev, { width: 64, height: 64 });
    sr.setCamera(cam); sr.setScene(scene); sr.setOcclusion(true); sr.render();
    t.eq(sr._lastVisible.length, 2, '叠放遮挡物：前后两遮挡墙均保留(靠后者豁免剔除)');
    t.eq(sr._occlusionCulled, 1, '叠放遮挡物：仅隐藏球被剔除');
  }

  // 7) TAA（统一提交路径）：逐帧 Halton 抖动 + 历史邻域 clamp 混合
  {
    const q = Object.assign(makeQuad(), { transform: Mat4.identity(), color: [1, 0, 0] });
    const scene = { meshes: [q] };
    const sr = new SceneRenderer(dev, { width: 64, height: 64 });
    sr.setCamera(cam); sr.setScene(scene);
    sr.setTAA(true, { alpha: 0.1, scale: 1 });
    const out0 = sr.render();
    const out1 = sr.render();
    t.eq(sr._frame, 2, 'TAA 逐帧前进帧计数');
    t.ok(sr._history != null && sr._history.length === 64 * 64 * 4, 'TAA 历史帧已维护');
    let ok = true, inRange = true;
    for (let i = 0; i < out1.rgba.length; i++) { if (!isFinite(out1.rgba[i])) ok = false; if (out1.rgba[i] < 0 || out1.rgba[i] > 255) inRange = false; }
    t.ok(ok, 'TAA 输出无 NaN/Inf');
    t.ok(inRange, 'TAA 输出在 0..255');
    const px = (x, y) => { const i = (y * 64 + x) * 4; return [out1.rgba[i], out1.rgba[i + 1], out1.rgba[i + 2]]; };
    const center = px(32, 32);
    t.ok(center[0] > 120 && center[1] < 60 && center[2] < 60, 'TAA 中心像素仍红主导（子像素抖动不破坏图像）');
    // TAA 静态场景应与无 TAA 基准接近（不漂移）
    const srNo = new SceneRenderer(dev, { width: 64, height: 64 });
    srNo.setCamera(cam); srNo.setScene(scene);
    const base = srNo.render();
    let maxDiff = 0;
    for (let i = 0; i < out1.rgba.length; i++) maxDiff = Math.max(maxDiff, Math.abs(out1.rgba[i] - base.rgba[i]));
    t.ok(maxDiff <= 24, `TAA 与无 TAA 基准接近（最大差=${maxDiff}，<=24）`);
    sr.resetTAA();
    t.ok(sr._history === null && sr._frame === 0, 'resetTAA 清空历史与帧计数');
  }

  // 8) 遮挡 + TAA 组合（统一提交路径）：两特性经同一 RenderGraph(prepass→cull→draw→post) 协同
  {
    const wall = {
      positions: [-2, -2, -1, 2, -2, -1, 2, 2, -1, -2, 2, -1],
      normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], uvs: [0, 0, 1, 0, 1, 1, 0, 1],
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]), occluder: true,
    };
    const hidden = {
      positions: [-0.25, -0.25, -3, 0.25, -0.25, -3, 0.25, 0.25, -3, -0.25, 0.25, -3],
      normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], uvs: [0, 0, 1, 0, 1, 1, 0, 1],
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]), color: [0.2, 0.9, 0.9],
    };
    const fg = Object.assign(makeQuad(), { transform: Mat4.translation(0, 0, 0.5), color: [1, 0, 0] }); // 前景红块（始终可见）
    const scene = { meshes: [wall, hidden, fg] };
    const sr = new SceneRenderer(dev, { width: 64, height: 64 });
    sr.setCamera(cam); sr.setScene(scene); sr.setOcclusion(true); sr.setTAA(true, { alpha: 0.1, scale: 1 });
    sr.render(); const out1 = sr.render();
    t.eq(sr._occlusionCulled, 1, '遮挡+TAA：隐藏球仍被剔除');
    t.eq(sr._lastVisible.length, 2, '遮挡+TAA：仅墙与前景可见');
    let finite = true, inRange = true;
    for (let i = 0; i < out1.rgba.length; i++) { if (!isFinite(out1.rgba[i])) finite = false; if (out1.rgba[i] < 0 || out1.rgba[i] > 255) inRange = false; }
    t.ok(finite && inRange, '遮挡+TAA：输出有限且在 0..255');
    // 与仅开启遮挡(无 TAA)的基准接近：抖动仅亚像素级差异，不应偏离
    const srO = new SceneRenderer(dev, { width: 64, height: 64 });
    srO.setCamera(cam); srO.setScene(scene); srO.setOcclusion(true);
    const base = srO.render();
    let md = 0; for (let i = 0; i < out1.rgba.length; i++) md = Math.max(md, Math.abs(out1.rgba[i] - base.rgba[i]));
    t.ok(md <= 24, `遮挡+TAA 与仅遮挡基准接近（最大差=${md}，<=24）`);
  }
}
