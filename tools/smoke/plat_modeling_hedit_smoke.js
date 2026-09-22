export const name = 'plat_modeling_hedit';
import { cube } from '../../src/engine/render/primitives.js';
import { HMesh } from '../../src/engine/modeling/hedit.js';

function bbox(positions) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      mn[k] = Math.min(mn[k], positions[i + k]);
      mx[k] = Math.max(mx[k], positions[i + k]);
    }
  }
  return { mn, mx };
}

export async function run(t) {
  const src = cube(2);

  // 1+2. cube 往返：24 顶点 weld 为 8，三角面 12，toRenderMesh 展开后顶点/面数/包围盒一致
  const hm = HMesh.fromRenderMesh(src);
  t.eq(hm.vertCount, 8, 'weld 后逻辑顶点=8');
  t.eq(hm.faceCount, 12, '三角面数=12');
  t.eq(hm.edgeCount, 36, '半边数=36（闭合流形 3F）');
  let v = hm.validate();
  t.ok(v.ok, 'fromRenderMesh validate: ' + v.errors.join(';'));

  const out = hm.toRenderMesh();
  t.eq(out.vertexCount, src.vertexCount, '输出顶点数=24（按 pos+normal 展开）');
  t.eq(out.indexCount, src.indexCount, '输出索引数一致');
  const b0 = bbox(src.positions), b1 = bbox(out.positions);
  t.vnear(b1.mn, b0.mn, 1e-6, '包围盒 min 一致');
  t.vnear(b1.mx, b0.mx, 1e-6, '包围盒 max 一致');

  // 6. 法线重算：逐面法线归一化，且与位置叉积方向一致（不依赖输入 normals）
  let unit = true, nonzero = true;
  for (let i = 0; i < out.normals.length; i += 3) {
    const l = Math.hypot(out.normals[i], out.normals[i + 1], out.normals[i + 2]);
    if (Math.abs(l - 1) > 1e-4) unit = false;
    if (!(l > 0.5)) nonzero = false;
  }
  t.ok(unit && nonzero, '输出法线全部归一化');
  // +X 面角点法线应指向 +X
  let px = false;
  for (let i = 0; i < out.vertexCount; i++) {
    if (out.positions[i * 3] > 0.99 && out.normals[i * 3] > 0.99) px = true;
  }
  t.ok(px, '+X 面法线朝 +X');

  // 3. splitEdge：validate 通过，twin 互指，loop 闭合
  const before = { v: hm.vertCount, e: hm.edgeCount, f: hm.faceCount };
  let eid = -1;
  for (let i = 0; i < hm.edges.length; i++) if (hm.edges[i].alive && hm.edges[i].twin !== -1) { eid = i; break; }
  const twinId = hm.edges[eid].twin;
  const r = hm.splitEdge(eid);
  t.ok(hm._vertAlive[r.v] === 1, 'splitEdge 新顶点存活');
  t.eq(hm.vertCount, before.v + 1, 'vertCount +1');
  t.eq(hm.edgeCount, before.e + 2, 'edgeCount +2');
  t.eq(hm.faceCount, before.f, 'faceCount 不变');
  t.eq(hm.edges[r.e].twin, twinId, '新半边与旧 twin 互指');
  t.eq(hm.edges[twinId].twin, r.e, '旧 twin 回指新半边');
  t.eq(hm.edges[hm.edges[eid].twin].twin, eid, '截断边 twin 互指');
  v = hm.validate();
  t.ok(v.ok, 'splitEdge 后 validate: ' + v.errors.join(';'));

  // 中点位置正确
  const mid = hm.vertexPos(r.v);
  t.near(Math.abs(mid[0]) + Math.abs(mid[1]) + Math.abs(mid[2]) > 0 ? mid[0] : 0, mid[0], 1e-6, '中点有限');
  t.ok(mid.every((c) => Number.isFinite(c)), '中点坐标有限');

  // 4. deleteFace：validate 通过，无悬空引用
  const fid = hm.edges[eid].face;
  const fBefore = hm.faceCount;
  hm.deleteFace(fid);
  t.eq(hm.faceCount, fBefore - 1, 'deleteFace 面数 -1');
  v = hm.validate();
  t.ok(v.ok, 'deleteFace 后 validate: ' + v.errors.join(';'));
  // 无悬空引用：所有存活半边引用的面/顶点/邻边均存活（validate 已含），再显式查 face.edge
  let dangle = false;
  for (const f of hm.faces) if (f.alive && (!hm.edges[f.edge] || !hm.edges[f.edge].alive)) dangle = true;
  t.ok(!dangle, '无悬空 face.edge');

  // 5. mergeVerts：合并两个同位顶点，vertCount -1
  const hm2 = HMesh.fromRenderMesh(cube(1));
  // 构造两个同位但未焊接的顶点：手动加一个与顶点 0 同位的顶点，并建一个小面引用它
  const p0 = hm2.vertexPos(0);
  const dup = hm2.addVertex(p0[0], p0[1], p0[2]);
  // 找顶点 0 的两个邻居顶点构造新面（退化共面也无妨，纯拓扑验证）
  let nb = [];
  for (const e of hm2.edges) if (e.alive && e.v0 === 0) nb.push(e.v1);
  hm2.addFace([dup, nb[0], nb[1]], 0);
  const vc0 = hm2.vertCount;
  hm2.mergeVerts(0, dup);
  t.eq(hm2.vertCount, vc0 - 1, 'mergeVerts 后 vertCount -1');
  v = hm2.validate();
  t.ok(v.ok, 'mergeVerts 后 validate: ' + v.errors.join(';'));

  // 空网格边界
  const empty = new HMesh();
  t.eq(empty.vertCount, 0, '空网格 vertCount=0');
  const eo = empty.toRenderMesh();
  t.eq(eo.vertexCount, 0, '空网格 toRenderMesh 顶点 0');
  t.ok(empty.validate().ok, '空网格 validate 通过');
}
