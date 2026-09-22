// editor_modeling_export smoke：脚本侧导出算子（ops.export.*）与 GUI 导出路径一致性（v3 M-F）。
// 关键断言：同一场景下「脚本导出」与「exportScene（GUI 走同一函数）」产物逐字节一致，
// 且导出不修改场景（红线 F）。DOM-free、Node 可测。
import { createModelingApi } from '../../src/editor/modeling/api.js';
import { EditSession } from '../../src/editor/modeling/edit_session.js';
import { Project, memoryStorage } from '../../src/editor/project.js';
import { Selection } from '../../src/editor/selection.js';
import { runScript } from '../../src/editor/ide_script_api.js';
import { exportScene } from '../../src/engine/platform/export_mesh.js';
import { applyModifiers } from '../../src/engine/modeling/modifier.js';
import { meshHash } from '../../src/engine/core/hash.js';
import { parseGLB } from '../../src/engine/platform/gltf.js';

export const name = 'editor-modeling-export';

function makeProject() {
  const p = new Project({ name: 'exp', storage: memoryStorage() });
  p.createScene('main');
  const a = p.spawn('cube', { position: [1, 0, 0], components: { mesh: { shape: 'cube', albedo: [220, 120, 90], rough: 0.6, metal: 0 } } });
  p.spawn('sphere', { position: [0, 2, 0], components: { mesh: { shape: 'sphere', albedo: [90, 160, 230], rough: 0.3, metal: 0.1 } } });
  return { p, a };
}

export async function run(t) {
  const { p, a } = makeProject();
  const sel = new Selection();
  const es = new EditSession({ scene: () => p.scene() });
  const api = createModelingApi(p, sel, es);

  // ---- ops.export 三格式可用 ----
  t.ok(api.ops.export && api.ops.export.obj && api.ops.export.gltf && api.ops.export.glb, 'ops.export 含 obj/gltf/glb');
  const rObj = api.ops.export.obj({ name: 'scene' });
  t.ok(rObj.ok, 'ops.export.obj 成功');
  t.eq(rObj.format, 'obj', '返回格式 obj');
  t.eq(rObj.axis, 'YUP_M', 'obj 默认 YUP_M');
  t.eq(rObj.files.map(f => f.name).join(','), 'scene.obj,scene.mtl', 'obj 产出 .obj + .mtl');
  t.eq(rObj.stats.objects, 2, '导出 2 个对象');
  t.eq(rObj.stats.triangles, 12 + 384, '三角形数 = cube 12 + sphere 384（默认 segU16/segV12）');

  const rGltf = api.ops.export.gltf({ name: 'scene' });
  t.eq(rGltf.axis, 'ZUP_M', 'gltf 默认 ZUP_M');
  t.ok(rGltf.files[0].text.includes('"asset"'), 'gltf 产物为 JSON 文本');
  const rGlb = api.ops.export.glb({ name: 'scene' });
  t.eq(rGlb.files[0].name, 'scene.glb', 'glb 文件名');
  t.eq(rGlb.files[0].text, undefined, 'glb 不返回文本（二进制形态由 GUI 下载层落盘）');

  // ---- 与 GUI 路径（exportScene）逐字节一致 ----
  const guiGlb = exportScene(p.scene(), {
    format: 'glb', name: 'scene', axis: 'ZUP_M',
    materialLibrary: p.materialLibrary || null,
    applyModifiersFn: (m, mods) => applyModifiers(m, mods),
  });
  t.eq(rGlb.stats.nodes, guiGlb.stats.nodes, '脚本与 GUI 节点数一致');
  t.eq(rGlb.stats.vertices, guiGlb.stats.vertices, '脚本与 GUI 顶点数一致');
  t.eq(rGlb.stats.materials, guiGlb.stats.materials, '脚本与 GUI 材质数一致');
  const guiObj = exportScene(p.scene(), {
    format: 'obj', name: 'scene', axis: 'YUP_M',
    materialLibrary: p.materialLibrary || null,
    applyModifiersFn: (m, mods) => applyModifiers(m, mods),
  });
  t.eq(rObj.files[0].text, guiObj.files[0].text, '脚本与 GUI 的 OBJ 文本逐字节一致');
  t.eq(rObj.files[1].text, guiObj.files[1].text, '脚本与 GUI 的 MTL 文本逐字节一致');

  // ---- 导出为只读：不修改场景几何/变换 ----
  const before = [...p.scene().objects.values()].map(o => meshHash({ positions: new Float32Array(o.transform.position) }));
  const posBefore = p.scene().get(a.id).transform.position.slice();
  api.ops.export.glb({});
  t.vnear(p.scene().get(a.id).transform.position, posBefore, 1e-9, '导出不修改对象变换（红线 F）');
  t.eq(before.length, 2, '场景对象数不变');

  // ---- 坐标/单位选项经脚本生效 ----
  const rCm = api.ops.export.obj({ name: 'cm', axis: 'ZUP_CM' });
  t.eq(rCm.axis, 'ZUP_CM', '脚本可指定轴向预设');
  t.ok(rCm.files[0].text.includes('scale=100'), 'OBJ 头注释记录单位尺度');
  t.throws(() => api.ops.export.obj({ axis: 'BAD' }), '非法预设抛错（红线 A）');

  // ---- runScript 注入：脚本内直接调用导出算子 ----
  const scriptApi = { ...api, help: () => 'ok' };
  const r1 = runScript(scriptApi, 'ops.export.glb({ name: "s" }).files[0].name');
  t.ok(r1.ok && r1.result === 's.glb', 'runScript 内调用导出算子');
  const r2 = runScript(scriptApi, 'ops.export.obj({ name: "s" }).stats.triangles');
  t.ok(r2.ok && r2.result === 396, 'runScript 读回导出统计');
  const r3 = runScript(scriptApi, 'ops.export.obj({ axis: "NOPE" })');
  t.ok(!r3.ok && /未知坐标预设/.test(r3.error), '非法参数在脚本内可见报错（红线 A）');

  // ---- 修改器栈：脚本导出走 evalModifiedMesh（非破坏性） ----
  const mo = p.scene().get(a.id);
  mo.transform.position = [2, 0, 0];       // 移离对称面，避免镜像重合
  mo.modifiers = [{ type: 'MIRROR', params: { axis: 'X' }, enabled: true }];
  const rMod = api.ops.export.glb({ name: 'mod' });
  t.eq(rMod.stats.vertices, 24 * 2 + 221, 'MIRROR 求值后导出顶点数翻倍（cube 48 + sphere 221）');
  t.eq((mo.modifiers || []).length, 1, '导出后修改器栈保留（非破坏性，D27）');
  const modDoc = parseGLB(exportScene(p.scene(), {
    format: 'glb', applyModifiersFn: (m, mods) => applyModifiers(m, mods),
  }).files[0].bytes);
  t.ok(modDoc.meshes[0].primitives[0].positions.length / 3 > 24, 'GLB 内为求值后几何');

  // ---- 无活动场景时抛可读错误 ----
  const p2 = new Project({ storage: memoryStorage() });
  const api2 = createModelingApi(p2, new Selection(), new EditSession({ scene: () => p2.scene() }));
  t.throws(() => api2.ops.export.glb({}), '无活动场景抛错（红线 A）');
}
