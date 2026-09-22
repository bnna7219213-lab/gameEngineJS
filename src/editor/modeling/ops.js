// 建模算子（v3 M-B / D25/D26）：把 half-edge 拓扑操作包装为命令，提交 CommandBus。
// 对标 Blender bpy.ops.mesh.*，但全部为纯 JS 函数；GUI 按钮与脚本共用同一入口。
// 每个算子返回一个 Command 实例（未提交），由调用方或 ops.* 便捷函数提交总线。
// DOM-free、零依赖、Node 可测；所有几何变更经 hedit.js HMesh 完成。
import { Command, CommandBus } from './commands.js';
import { HMesh } from '../../engine/modeling/hedit.js';
import { meshHash } from '../../engine/core/hash.js';

// ---- 几何命令基类：do 时应用 HMesh 操作并缓存渲染网格哈希，undo 时恢复 ----
class MeshCommand extends Command {
  constructor(op, meshData, params = {}) {
    super(op, meshData.id ?? null, params);
    this.meshData = meshData;   // { id, hmesh }  —— 命令持有 HMesh 引用（编辑器内唯一编辑源）
    this._beforeHash = null;
    this._afterHash = null;
  }
  do(ctx) {
    if (this._beforeHash == null) this._beforeHash = meshHash(this.meshData.hmesh.toRenderMesh());
    this._apply(ctx);
    this._afterHash = meshHash(this.meshData.hmesh.toRenderMesh());
  }
  undo(ctx) { this._revert(ctx); }
  // 子类实现：_apply 做正向变更，_revert 做逆向恢复。
  _apply(ctx) { throw new Error('MeshCommand._apply 未实现: ' + this.op); }
  _revert(ctx) { throw new Error('MeshCommand._revert 未实现: ' + this.op); }
  getDirty() { return { ids: this.target == null ? [] : [this.target], flags: { geometry: true } }; }
}

// ---- ExtrudeRegion：沿法线挤出选中面，生成侧面环 ----
export class ExtrudeRegionCommand extends MeshCommand {
  constructor(meshData, { faceIds = null, offset = 1 } = {}) {
    super('mesh.extrudeRegion', meshData, { faceIds, offset });
    this.faceIds = faceIds; this.offset = offset;
    this._created = null; // { vertIds, edgeIds, faceIds } 供 undo 删除
  }
  _apply() {
    const hm = this.meshData.hmesh;
    const faces = this.faceIds || _allFaceIds(hm);
    const created = { vertIds: [], edgeIds: [], faceIds: [] };
    // 简化实现：对每个选中面，沿法线复制顶点并桥接侧面。
    for (const fid of faces) {
      const vs = hm.faceVerts(fid);
      if (vs.length < 3) continue;
      // 计算面法线（Newell）
      const n = _faceNormal(hm, fid);
      const newVids = vs.map((v) => {
        const p = hm.vertexPos(v);
        return hm.addVertex(p[0] + n[0] * this.offset, p[1] + n[1] * this.offset, p[2] + n[2] * this.offset);
      });
      created.vertIds.push(...newVids);
      // 顶面
      created.faceIds.push(hm.addFace(newVids, 0));
      // 侧面（桥接原面与新面）
      for (let i = 0; i < vs.length; i++) {
        const a = vs[i], b = vs[(i + 1) % vs.length];
        const na = newVids[i], nb = newVids[(i + 1) % vs.length];
        created.faceIds.push(hm.addFace([a, b, nb, na], 0));
      }
    }
    this._created = created;
  }
  _revert() {
    const hm = this.meshData.hmesh;
    if (!this._created) return;
    // 逆操作：删除创建的面与顶点（边随之清理）
    for (const fid of this._created.faceIds) hm.deleteFace(fid);
    for (const vid of this._created.vertIds) hm._collectOrphanVerts();
    this._created = null;
  }
}

// ---- MergeVerts：合并顶点到目标（阈值或中心）----
export class MergeVertsCommand extends MeshCommand {
  constructor(meshData, { type = 'CENTER', vertexIds = [], threshold = 1e-4 } = {}) {
    super('mesh.merge', meshData, { type, vertexIds, threshold });
    this.type = type; this.vertexIds = vertexIds; this.threshold = threshold;
    this._snapshot = null;
  }
  _apply() {
    const hm = this.meshData.hmesh;
    this._snapshot = _snapshotMesh(hm);
    if (this.type === 'CENTER' && this.vertexIds.length >= 2) {
      // 计算中心点，全部合并到第一个顶点
      const keep = this.vertexIds[0];
      let cx = 0, cy = 0, cz = 0;
      for (const v of this.vertexIds) { const p = hm.vertexPos(v); cx += p[0]; cy += p[1]; cz += p[2]; }
      cx /= this.vertexIds.length; cy /= this.vertexIds.length; cz /= this.vertexIds.length;
      hm.positions[keep * 3] = cx; hm.positions[keep * 3 + 1] = cy; hm.positions[keep * 3 + 2] = cz;
      for (let i = 1; i < this.vertexIds.length; i++) hm.mergeVerts(keep, this.vertexIds[i]);
    }
  }
  _revert() { if (this._snapshot) _restoreMesh(this.meshData.hmesh, this._snapshot); }
}

// ---- DeleteCommand：删除顶点/边/面 ----
export class DeleteCommand extends MeshCommand {
  constructor(meshData, { type = 'FACE', ids = [] } = {}) {
    super('mesh.delete', meshData, { type, ids });
    this.type = type; this.ids = ids;
    this._snapshot = null;
  }
  _apply() {
    const hm = this.meshData.hmesh;
    this._snapshot = _snapshotMesh(hm);
    if (this.type === 'FACE') for (const fid of this.ids) hm.deleteFace(fid);
    else if (this.type === 'VERT') for (const vid of this.ids) _deleteVertex(hm, vid);
    // EDGE 删除待 half-edge 完善后实现
  }
  _revert() { if (this._snapshot) _restoreMesh(this.meshData.hmesh, this._snapshot); }
}

// ---- 便捷 API（对标 bpy.ops.mesh.*）：构造命令并提交总线 ----
export function createMeshOps(bus, meshRegistry) {
  if (!(bus instanceof CommandBus)) throw new Error('createMeshOps: 需要 CommandBus');
  // meshRegistry: Map<meshId, meshData>；meshData = { id, hmesh }
  const _mesh = (id) => {
    const md = meshRegistry.get(id);
    if (!md) throw new Error('createMeshOps: 未找到 mesh id=' + id);
    return md;
  };
  return {
    // 挤出选中面
    extrudeRegion: (meshId, opts) => bus.submit(new ExtrudeRegionCommand(_mesh(meshId), opts)),
    // 合并顶点
    mergeVerts: (meshId, opts) => bus.submit(new MergeVertsCommand(_mesh(meshId), opts)),
    // 删除
    delete: (meshId, opts) => bus.submit(new DeleteCommand(_mesh(meshId), opts)),
    // 细分（调用 hedit 的 splitEdge 实现）
    subdivide: (meshId, { edgeIds = [], cuts = 1 } = {}) => bus.submit(new SubdivideCommand(_mesh(meshId), { edgeIds, cuts })),
  };
}

// ---- SubdivideCommand：边中点细分 ----
export class SubdivideCommand extends MeshCommand {
  constructor(meshData, { edgeIds = [], cuts = 1 } = {}) {
    super('mesh.subdivide', meshData, { edgeIds, cuts });
    this.edgeIds = edgeIds; this.cuts = cuts;
    this._snapshot = null;
  }
  _apply() {
    const hm = this.meshData.hmesh;
    this._snapshot = _snapshotMesh(hm);
    for (let c = 0; c < this.cuts; c++) {
      const edges = this.edgeIds.length ? [...this.edgeIds] : _allEdgeIds(hm);
      for (const eid of edges) { try { hm.splitEdge(eid); } catch (e) { /* 跳过已死边 */ } }
    }
  }
  _revert() { if (this._snapshot) _restoreMesh(this.meshData.hmesh, this._snapshot); }
}

// ---- 内部工具 ----
function _allFaceIds(hm) { const out = []; for (let i = 0; i < hm.faces.length; i++) if (hm.faces[i].alive) out.push(i); return out; }
function _allEdgeIds(hm) { const out = []; for (let i = 0; i < hm.edges.length; i++) if (hm.edges[i].alive) out.push(i); return out; }

function _faceNormal(hm, fid) {
  const vs = hm.faceVerts(fid);
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < vs.length; i++) {
    const a = vs[i], b = vs[(i + 1) % vs.length];
    const pa = hm.vertexPos(a), pb = hm.vertexPos(b);
    nx += (pa[1] - pb[1]) * (pa[2] + pb[2]);
    ny += (pa[2] - pb[2]) * (pa[0] + pb[0]);
    nz += (pa[0] - pb[0]) * (pa[1] + pb[1]);
  }
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}

function _deleteVertex(hm, vid) {
  // 删除顶点：先删所有引用它的面，再清理孤立顶点
  const faces = [];
  for (let eid = 0; eid < hm.edges.length; eid++) {
    const e = hm.edges[eid];
    if (e.alive && (e.v0 === vid || e.v1 === vid) && e.face !== -1) faces.push(e.face);
  }
  for (const fid of new Set(faces)) hm.deleteFace(fid);
  hm._collectOrphanVerts();
}

// 快照/恢复：用于逆操作复杂的算子（Merge/Delete/Subdivide）。
function _snapshotMesh(hm) {
  const rm = hm.toRenderMesh();
  return {
    positions: Array.from(rm.positions),
    normals: Array.from(rm.normals),
    uvs: Array.from(rm.uvs),
    indices: Array.from(rm.indices),
    vertexCount: rm.vertexCount,
    indexCount: rm.indexCount,
  };
}
function _restoreMesh(hm, snap) {
  const rm = {
    positions: new Float32Array(snap.positions),
    normals: new Float32Array(snap.normals),
    uvs: new Float32Array(snap.uvs),
    indices: new Uint32Array(snap.indices),
    vertexCount: snap.vertexCount,
    indexCount: snap.indexCount,
  };
  const restored = HMesh.fromRenderMesh(rm);
  // 替换 hm 内部状态
  hm.positions = restored.positions;
  hm._vertAlive = restored._vertAlive;
  hm._liveVerts = restored._liveVerts;
  hm.edges = restored.edges;
  hm.faces = restored.faces;
  hm._liveFaces = restored._liveFaces;
  hm._liveEdges = restored._liveEdges;
  hm._pair = restored._pair;
  hm._cap = restored._cap;
}
