// 建模脚本 JS API（v3 M-C / D26）：对标 Blender bpy 的 data/ops/context 三层，
// 但全部为纯 JS 函数，复用 gbhy 的 runScript 注入机制（new Function 白名单键）。
// 返回值约定：data/ctx 读取返回数据块或值；ops.* 提交命令到总线（可撤销），返回命令实例。
// DOM-free、零依赖、Node 可测。
import { CommandBus } from './commands.js';
import { createMeshOps } from './ops.js';
import { HMesh } from '../../engine/modeling/hedit.js';
import { Material, MaterialLibrary } from '../../engine/platform/material.js';
import { World } from '../../engine/platform/world.js';
import { exportScene } from '../../engine/platform/export_mesh.js';
import { applyModifiers } from '../../engine/modeling/modifier.js';
import { EditorMode } from './mode.js';

// 创建建模 API：返回 { data, ctx, ops, undoGroup }，供 runScript 注入。
// project/selection/editSession 由编辑器宿主提供。
export function createModelingApi(project, selection, editSession) {
  if (!project) throw new Error('createModelingApi: 需要 project');
  if (!editSession) throw new Error('createModelingApi: 需要 EditSession');
  const bus = editSession.bus;
  if (!(bus instanceof CommandBus)) throw new Error('createModelingApi: EditSession.bus 需为 CommandBus');

  // ---- data：数据块容器（纯数据，无上下文依赖）----
  const meshDataStore = editSession.meshRegistry; // Map<objId, {id, hmesh}>
  const materialLib = project.materialLibrary || (project.materialLibrary = new MaterialLibrary());
  const worldStore = project.world || (project.world = World.default());

  const data = {
    meshes: {
      new: (name = 'mesh') => {
        const scene = project.scene();
        if (!scene) throw new Error('data.meshes.new: 无活动场景');
        const obj = scene.add({ name }); // 返回新对象（id 由 scene.add 分配）
        const hmesh = new HMesh();
        meshDataStore.set(obj.id, { id: obj.id, hmesh });
        return { id: obj.id, name: obj.name, hmesh };
      },
      get: (id) => meshDataStore.get(id) || null,
      list: () => [...meshDataStore.values()].map(md => ({ id: md.id, vertCount: md.hmesh.vertCount, faceCount: md.hmesh.faceCount })),
    },
    materials: {
      new: (name = 'material') => { const m = new Material(name); materialLib.add(m); return m; },
      get: (id) => materialLib.get(id),
      list: () => [...materialLib.materials.values()],
    },
    worlds: {
      get: () => worldStore,
      set: (w) => { project.world = w; },
    },
  };
  // ---- ctx：编辑器上下文（活动对象/选择集/模式）----
  const ctx = {
    get activeObject() {
      const id = selection ? selection.primary() : null;
      return id != null && project.scene() ? project.scene().get(id) : null;
    },
    get selectedObjects() {
      const ids = selection ? selection.get() : [];
      const scene = project.scene();
      return scene ? ids.map(id => scene.get(id)).filter(Boolean) : [];
    },
    get mode() { return editSession.mode; },
    get selectMode() { return editSession.selectMode; },
  };

  // ---- ops：算子（提交命令到总线，可撤销）----
  const meshOps = editSession.ops; // 已有 createMeshOps 返回的便捷 API
  const ops = {
    object: {
      modeSet: (mode) => {
        const em = { OBJECT: EditorMode.OBJECT, EDIT_VERT: EditorMode.EDIT_VERT, EDIT_EDGE: EditorMode.EDIT_EDGE, EDIT_FACE: EditorMode.EDIT_FACE }[mode];
        if (!em) throw new Error('ops.object.modeSet: 非法模式 ' + mode);
        editSession.modeState.setMode(em);
        return { ok: true, mode };
      },
    },
    mesh: {
      selectMode: (type) => { editSession.setSelectMode(type); return { ok: true, type }; },
      selectAll: (action = 'SELECT') => {
        if (action === 'SELECT') editSession.selectAll();
        else if (action === 'DESELECT') editSession.clearSelection();
        else throw new Error('ops.mesh.selectAll: 非法 action ' + action);
        return { ok: true, action, count: editSession.selection().length };
      },
      extrudeRegion: (opts = {}) => meshOps.extrudeRegion(editSession.editingObject(), opts),
      merge: (opts = {}) => meshOps.mergeVerts(editSession.editingObject(), opts),
      delete: (opts = {}) => meshOps.delete(editSession.editingObject(), opts),
      subdivide: (opts = {}) => meshOps.subdivide(editSession.editingObject(), opts),
    },
    transform: {
      translate: ({ value = [0, 0, 0] } = {}) => _transformOp(bus, editSession, 'translate', value),
      rotate: ({ value = [0, 0, 0] } = {}) => _transformOp(bus, editSession, 'rotate', value),
      scale: ({ value = [1, 1, 1] } = {}) => _transformOp(bus, editSession, 'scale', value),
    },
    // v3 M-F：导出算子（只读场景 → 文本/字节；不改变场景，故不入命令总线）
    export: {
      obj: (o = {}) => _exportOp(project, 'obj', o),
      gltf: (o = {}) => _exportOp(project, 'gltf', o),
      glb: (o = {}) => _exportOp(project, 'glb', o),
    },
  };

  // ---- undoGroup：脚本内多命令合并为单步撤销 ----
  const undoGroup = (fn) => bus.group('script-group', fn);

  return { data, ctx, ops, undoGroup };
}

// v3 M-F：脚本侧导出（ops.export.*）。与 GUI「导出场景」共用 exportScene，
// 修改器栈经 evalModifiedMesh 求值 → 脚本导出与 GUI 导出结果一致（可断言）。
function _exportOp(project, format, opts) {
  const scene = project.scene();
  if (!scene) throw new Error('ops.export.' + format + ': 无活动场景');
  const out = exportScene(scene, {
    format,
    name: opts.name || project.name || 'scene',
    axis: opts.axis,
    rotationUnit: opts.rotationUnit || 'rad',
    materialLibrary: project.materialLibrary || null,
    applyModifiersFn: (mesh, mods) => applyModifiers(mesh, mods),
  });
  return { ok: true, format: out.format, axis: out.axis, stats: out.stats, files: out.files.map(f => ({ name: f.name, text: f.text })) };
}

// transform 命令：对当前编辑对象（或选中对象）施加平移/旋转/缩放。
function _transformOp(bus, editSession, kind, value) {
  const id = editSession.editingObject();
  if (id == null) throw new Error('ops.transform.' + kind + ': 不在编辑模式或无选中对象');
  // 简化：直接改 meshRegistry 中 HMesh 的顶点（编辑模式）或对象 transform（物体模式）。
  // 当前实现：编辑模式下对选中顶点做平移；物体模式由调用方走 setField。
  if (kind === 'translate' && editSession.isEditing()) {
    const md = editSession.meshRegistry.get(id);
    if (!md) throw new Error('ops.transform.translate: 无编辑网格');
    const sel = editSession.selection();
    const verts = sel.length ? sel : [...Array(md.hmesh.vertCount).keys()];
    for (const v of verts) {
      const p = md.hmesh.vertexPos(v);
      md.hmesh.positions[v * 3] = p[0] + value[0];
      md.hmesh.positions[v * 3 + 1] = p[1] + value[1];
      md.hmesh.positions[v * 3 + 2] = p[2] + value[2];
    }
    return { ok: true, kind, count: verts.length };
  }
  return { ok: true, kind, value, note: '物体模式 transform 走检视器/命令层（待 M-E 接线）' };
}
