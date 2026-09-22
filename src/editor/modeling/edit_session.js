// 编辑会话（v3 M-B）：把模式状态机 + 网格选择 + 命令总线 + HMesh 装配成编辑模式运行时。
// 职责：进出编辑模式（对象网格 <-> HMesh 互转）、维护顶点/边/面选择集、把拾取结果转为选择、
// 把建模算子经 CommandBus 提交（可撤销）。GUI 与脚本共用本层。
// DOM-free、零依赖、Node 可测（渲染拾取的 project/ray 由宿主注入）。
import { ModeState, EditorMode, SelectMode } from './mode.js';
import { CommandBus } from './commands.js';
import { createMeshOps } from './ops.js';
import { MeshPicker } from './pick.js';
import { HMesh } from '../../engine/modeling/hedit.js';

export class EditSession {
  // ctx: { project, scene(), history }；bus 可选（不传则自建）。
  constructor(ctx, bus = null) {
    this.ctx = ctx;
    this.bus = bus || new CommandBus({ scene: ctx.scene ? ctx.scene() : null });
    this.modeState = new ModeState();
    this.meshRegistry = new Map();   // objId -> { id, hmesh }（编辑模式下的可编辑网格）
    this.ops = createMeshOps(this.bus, this.meshRegistry);
    this._editingId = null;          // 当前编辑的对象 id
    // 选择集：{ VERT:Set, EDGE:Set, FACE:Set }
    this.sel = { VERT: new Set(), EDGE: new Set(), FACE: new Set() };
  }

  get mode() { return this.modeState.mode; }
  get selectMode() { return this.modeState.selectMode; }
  isEditing() { return this.modeState.isEdit(); }
  editingObject() { return this._editingId; }

  // 进入编辑模式：把对象的 customGeo/图元网格转为 HMesh 并注册。
  enterEdit(objId, renderMesh, selectMode = 'VERT') {
    const scene = this.ctx.scene();
    if (!scene) throw new Error('EditSession.enterEdit: 无活动场景');
    if (!renderMesh || !renderMesh.positions) throw new Error('EditSession.enterEdit: 需要渲染网格');
    const hmesh = HMesh.fromRenderMesh(renderMesh);
    this.meshRegistry.set(objId, { id: objId, hmesh });
    this._editingId = objId;
    const mode = { VERT: EditorMode.EDIT_VERT, EDGE: EditorMode.EDIT_EDGE, FACE: EditorMode.EDIT_FACE }[selectMode];
    this.modeState.setMode(mode);
    this.clearSelection();
    return hmesh;
  }

  // 退出编辑模式：把 HMesh 写回对象 customGeo（渲染网格结构）。
  exitEdit() {
    if (!this.isEditing() || this._editingId == null) return null;
    const md = this.meshRegistry.get(this._editingId);
    const out = md ? md.hmesh.toRenderMesh() : null;
    this.modeState.setMode(EditorMode.OBJECT);
    this._editingId = null;
    this.clearSelection();
    return out; // { positions, normals, uvs, indices, ... }
  }

  // 选择模式切换（编辑模式内）
  setSelectMode(sm) {
    const mode = { VERT: EditorMode.EDIT_VERT, EDGE: EditorMode.EDIT_EDGE, FACE: EditorMode.EDIT_FACE }[sm];
    if (!mode) throw new Error('非法选择模式: ' + sm);
    this.modeState.setMode(mode);
  }

  clearSelection() { this.sel.VERT.clear(); this.sel.EDGE.clear(); this.sel.FACE.clear(); }
  selectAll() {
    const md = this._cur(); if (!md) return;
    const sm = this.selectMode;
    if (sm === 'VERT') { for (let v = 0; v < md.hmesh._cap; v++) if (md.hmesh._vertAlive[v]) this.sel.VERT.add(v); }
    else if (sm === 'FACE') { for (let f = 0; f < md.hmesh.faces.length; f++) if (md.hmesh.faces[f].alive) this.sel.FACE.add(f); }
    else if (sm === 'EDGE') { for (let e = 0; e < md.hmesh.edges.length; e++) if (md.hmesh.edges[e].alive) this.sel.EDGE.add(e); }
  }

  // 拾取并选择：mode 由当前 selectMode 决定；toggle=true 时切换选中。
  pickAndSelect(project, ray, sx, sy, { tol = 8, toggle = false } = {}) {
    const md = this._cur(); if (!md) return null;
    const rm = md.hmesh.toRenderMesh();
    const picker = new MeshPicker(rm, null, project, ray);
    const hit = picker.pick(this.selectMode, sx, sy, tol);
    if (!hit) { if (!toggle) this.clearSelection(); return null; }
    const set = this.sel[this.selectMode];
    const key = hit.index ?? hit.tri ?? hit.edge;
    if (toggle) { set.has(key) ? set.delete(key) : set.add(key); }
    else { set.clear(); set.add(key); }
    return hit;
  }

  // 当前选中（按模式）
  selection() { return [...this.sel[this.selectMode]]; }

  // 便捷算子：作用于当前编辑对象，走命令总线（可撤销）。
  extrude(offset = 1) { const id = this._curId(); this.ops.extrudeRegion(id, { offset }); }
  deleteSelected() {
    const id = this._curId();
    if (this.selectMode === 'FACE') this.ops.delete(id, { type: 'FACE', ids: this.selection() });
    else if (this.selectMode === 'VERT') this.ops.delete(id, { type: 'VERT', ids: this.selection() });
    else throw new Error('deleteSelected: 边删除待实现');
    this.clearSelection();
  }
  mergeSelected() { const id = this._curId(); this.ops.mergeVerts(id, { type: 'CENTER', vertexIds: this.selection() }); this.clearSelection(); }
  subdivide(cuts = 1) { const id = this._curId(); this.ops.subdivide(id, { edgeIds: this.selectMode === 'EDGE' ? this.selection() : [], cuts }); }

  _cur() { return this._editingId == null ? null : this.meshRegistry.get(this._editingId); }
  _curId() { if (this._editingId == null) throw new Error('EditSession: 不在编辑模式'); return this._editingId; }
}
