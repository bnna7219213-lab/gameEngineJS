export const name = 'render';
import { Mat4, Vec3 } from '../../src/engine/core/math.js';
import { buildMeshlets, cullMeshlets, frustumFromVP } from '../../src/engine/render/meshlet.js';
import { HiZBuffer } from '../../src/engine/render/hiz.js';
import { rasterIds, resolve, visibleIds } from '../../src/engine/render/visibility_buffer.js';
import { halton, jitter, resolveTAA } from '../../src/engine/render/taa.js';
import { computeShadingRates } from '../../src/engine/render/vrs.js';
import { VirtualTexture } from '../../src/engine/render/virtual_texturing.js';
import { bake } from '../../src/engine/render/lightmap.js';
import { DDGI } from '../../src/engine/render/ddgi.js';
import { Reservoir, spatiotemporalReuse } from '../../src/engine/render/restir.js';
import { buildClusters, decimate, selectLOD } from '../../src/engine/render/virtual_geometry.js';
import { interpolate, interpolateFrames } from '../../src/engine/render/frame_interp.js';
import { predict } from '../../src/engine/render/frame_predict.js';
import { TemporalAccumulator } from '../../src/engine/render/temporal.js';
import { pairedRender, qualityFirst, performanceFirst } from '../../src/engine/render/paired_render.js';
import { RenderGraph } from '../../src/engine/render/render_graph.js';
import { evaluate } from '../../src/engine/render/neural_material.js';
import { Viewport3D } from '../../src/engine/render/viewport3d.js';

export async function run(t) {
  // meshlet
  const mesh = { positions: new Float32Array([0,0,0, 1,0,0, 1,1,0, 0,1,0, 2,0,0, 2,1,0]), indices: new Uint32Array([0,1,2, 0,2,3, 3,2,4, 3,4,5]) };
  const mls = buildMeshlets(mesh);
  t.ok(mls.length >= 1);
  t.ok(mls[0].indices.length % 3 === 0);
  const kept = cullMeshlets(mls, frustumFromVP(Mat4.identity()));
  t.eq(kept.length, mls.length);

  // hiz（HiZBuffer：深度 mip 归约 + 遮挡查询）
  const depth = new Float32Array(64 * 64).fill(1.0);
  const hz = new HiZBuffer(); hz.build(depth, 64, 64);
  t.ok(hz.mips.length >= 2 && hz.mips.length <= 8);
  t.eq(hz.mips[1].length, 32 * 32);
  t.eq(typeof hz.isOccluded({ minX: -1, maxX: 1, minY: -1, maxY: 1, maxZ: 0.1 }), 'boolean');

  // visibility buffer
  const vp = Mat4.perspective(Math.PI / 3, 1, 0.1, 100).mul(Mat4.lookAt(Vec3.of(0,0,5), Vec3.of(0,0,0), Vec3.of(0,1,0)));
  const mmesh = { id: 7, positions: [-0.5,-0.5,0, 0.5,-0.5,0, 0,0.5,0], indices: [0,1,2], transform: { position:[0,0,0], rotation:[0,0,0], scale:[1,1,1] } };
  const ids = rasterIds([mmesh], vp, 64, 64);
  let cnt = 0; for (const v of ids) if (v === 7) cnt++;
  t.ok(cnt > 0, 'id rasterized (got ' + cnt + ')');
  const mat = resolve(ids, () => 100);
  t.eq(mat.length, ids.length);
  t.ok(visibleIds(ids).includes(7));

  // taa
  t.near(halton(1, 2), 0.5); t.near(halton(1, 3), 1 / 3, 1e-6);
  const j = jitter(0, 64, 64, 1); t.ok(isFinite(j.x) && isFinite(j.y));
  const cur = new Float32Array(4 * 8 * 8).fill(0.5);
  const outT = resolveTAA(null, cur, 0.1);
  t.eq(outT.length, cur.length); t.ok(outT.every(x => isFinite(x)));

  // vrs
  const grad0 = new Float32Array(64 * 64);
  const r0 = computeShadingRates(grad0, 64, 64, 8);
  t.eq(r0.length, 8 * 8); t.eq(r0[0], 2);
  const grad5 = new Float32Array(64 * 64).fill(0.5);
  t.eq(computeShadingRates(grad5, 64, 64, 8)[0], 0);

  // virtual texturing
  const vt = new VirtualTexture(16, 4);
  let loaderCalls = 0;
  const rr = vt.request(0, 0, () => { loaderCalls++; return [1, 2, 3]; });
  t.ok(rr.resident && rr.data);
  vt.request(0, 0);
  t.eq(loaderCalls, 1, 'loader called once per page');

  // lightmap
  const lb = bake([], [{ pos: [0, 5, 0], color: [1, 1, 1], intensity: 1 }], 16, 16);
  t.eq(lb.length, 16 * 16 * 3);
  t.ok(lb[(8 * 16 + 8) * 3] >= lb[0 * 3], 'center brighter than far corner');

  // ddgi
  const ddgi = new DDGI([[0,0,0],[6,6,6]], 3);
  t.ok(ddgi.probes.length > 0);
  const irr = ddgi.sample(() => [1, 1, 1], [3, 3, 3]);
  t.vnear(irr, [1, 1, 1], 1e-5);

  // restir
  let seed = 1; const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const res = new Reservoir(); res.update([1,0,0], 2, rand); res.update([0,1,0], 3, rand);
  t.eq(res.M, 2); t.ok(res.y !== null);
  const reuse = spatiotemporalReuse([res], [0], rand);
  t.eq(reuse.length, 1); t.ok(reuse[0].M > 0);

  // virtual geometry
  const vmesh = { indices: new Uint32Array([0,1,2, 3,4,5, 6,7,8, 9,10,11]) };
  t.eq(buildClusters(vmesh, 2).length, 2);
  t.ok(decimate(vmesh, 1).length < vmesh.indices.length);
  t.eq(selectLOD(5), 0); t.eq(selectLOD(15), 1); t.eq(selectLOD(30), 2); t.eq(selectLOD(60), 3);

  // frame interp / predict / temporal
  const a = new Float32Array([0, 0]), b = new Float32Array([1, 1]);
  t.near(interpolate(a, b, 0.5)[0], 0.5);
  t.vnear(interpolateFrames([a, b], 0.5), new Float32Array([0.5, 0.5]), 1e-5);
  t.vnear(predict([a, b], 1)[0], new Float32Array([2, 2]), 1e-5);
  const acc = new TemporalAccumulator();
  acc.accumulate(new Float32Array([1, 1]));
  const acc2 = acc.accumulate(new Float32Array([3, 3]), 0.5);
  t.near(acc2[0], 2, 1e-5);

  // paired render
  t.eq(pairedRender(() => 1, () => 2, (x, y) => y), 2);
  t.eq(qualityFirst(1, 2), 2); t.eq(qualityFirst(1, null), 1);
  t.eq(performanceFirst(1, 2), 1); t.eq(performanceFirst(null, 2), 2);

  // render graph
  const g = new RenderGraph(); g.addNode('a', async () => {}); g.addNode('b', async () => {}); g.addEdge('a', 'b');
  const ord = g.order(); t.eq(ord[0], 'a'); t.eq(ord[1], 'b');
  const g2 = new RenderGraph(); g2.addNode('x'); g2.addNode('y'); g2.addEdge('x', 'y'); g2.addEdge('y', 'x');
  let threw = false; try { g2.order(); } catch (e) { threw = true; }
  t.ok(threw, 'cycle detected');

  // neural material (CPU 参考路径)
  const nm = evaluate('wood', { uv: [0.5, 0.5, 0], viewDir: [0, 0, 1], normal: [0, 0, 1] });
  t.ok(nm && nm.albedo && nm.albedo.length === 3);
  t.ok(nm.rough >= 0 && nm.rough <= 1 && nm.metal >= 0 && nm.metal <= 1, 'material params in [0,1]');

  // viewport3d (built on SoftwareDevice)
  const v3 = new Viewport3D(null, { width: 64, height: 64 });
  v3.setCamera({ eye: [0, 0, 5], target: [0, 0, 0] });
  v3.addMesh({ positions: new Float32Array([0,0,0, 1,0,0, 0,1,0]), normals: new Float32Array([0,0,1,0,0,1,0,0,1]), indices: new Uint32Array([0,1,2]), albedo: [200,180,120] });
  const rgba = v3.renderToRGBA8();
  t.eq(rgba.length, 64 * 64 * 4);
  let nonClear = 0; for (let i = 0; i < rgba.length; i += 4) if (!(rgba[i] === 18 && rgba[i+1] === 18 && rgba[i+2] === 26)) nonClear++;
  t.ok(nonClear > 0, 'mesh rasterized');
  const pr = v3.project([0, 0, 0]); t.ok(isFinite(pr.x) && isFinite(pr.y));
  const ray = v3.ray(32, 32); t.ok(isFinite(ray.o[0]) && isFinite(ray.d[0]));
}
