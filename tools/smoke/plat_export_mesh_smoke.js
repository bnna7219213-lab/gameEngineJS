// plat_export_mesh smoke：OBJ/MTL 写出读回、glTF/GLB 写出、坐标/单位变换层（v3 M-F / D33）。
// 覆盖验收表：写出→读回 顶点数/meshHash 一致；导出→外部工具读入方向/尺度断言。
import { Scene3D, GameObject3D } from '../../src/engine/platform/scene3d.js';
import { parseGLB } from '../../src/engine/platform/gltf.js';
import { meshHash } from '../../src/engine/core/hash.js';
import { Mat4, Vec3 } from '../../src/engine/core/math.js';
import { cube, sphere } from '../../src/engine/render/primitives.js';
import { Material, MaterialLibrary } from '../../src/engine/platform/material.js';
import {
  AXIS_PRESETS, AXIS_PRESET_IDS, presetOf, axisMatrix, det3, normalMatrix3, convertMesh, axisConvert,
  localMatrix, worldMatrixOf, baseMeshOf, materialOf, collectExportItems, normalizeMesh,
  indexComponentType, GLTF_INDEX_LIMIT, writeMTL, writeOBJ, parseOBJMesh, parseMTL,
  decomposeWorld, writeGLTF, exportScene,
} from '../../src/engine/platform/export_mesh.js';

export const name = 'plat-export-mesh';

// 构造最小场景：父级平移 + 子级平移/缩放，各带一个网格
function makeScene() {
  const s = new Scene3D(); s.name = 'demo';
  const parent = new GameObject3D('parent');
  parent.transform.position = [1, 0, 0];
  parent.components = { mesh: { shape: 'cube', albedo: [255, 0, 0], rough: 0.4, metal: 0.2 } };
  s.add(parent);
  const child = new GameObject3D('child');
  child.transform.position = [0, 2, 0];
  child.transform.scale = [2, 2, 2];
  child.components = { mesh: { shape: 'sphere', albedo: [0, 128, 255], rough: 0.9, metal: 0 } };
  s.add(child, parent.id);
  return { s, parent, child };
}

export async function run(t) {
  // ---------- 1. 坐标/单位变换层（D33） ----------
  t.eq(AXIS_PRESET_IDS.join(','), 'YUP_M,YUP_CM,ZUP_M,ZUP_CM', '四个轴向/单位预设');
  t.eq(AXIS_PRESETS.ZUP_CM.scale, 100, 'ZUP_CM 尺度 100（米→厘米）');
  t.throws(() => presetOf('NOPE'), '未知预设抛错（红线 A）');

  // 变换矩阵：Y-up → Z-up 的轴映射（引擎 +Y 上 → 导出 +Z；引擎 −Z 前 → 导出 −Y）
  const A = axisMatrix('ZUP_M');
  const up = A.applyDir(Vec3.of(0, 1, 0));      // 引擎上 → 导出 (0,0,1)
  t.vnear([up.x, up.y, up.z], [0, 0, 1], 1e-6, '引擎 +Y(上) → 导出 +Z');
  const fwd = A.applyDir(Vec3.of(0, 0, -1));    // 引擎前 → 导出 (0,1,0)
  t.vnear([fwd.x, fwd.y, fwd.z], [0, 1, 0], 1e-6, '引擎 −Z(前) → 导出 +Y（Blender 换算 (x,y,z)→(x,−z,y)）');
  const right = A.applyDir(Vec3.of(1, 0, 0));   // 右轴不变
  t.vnear([right.x, right.y, right.z], [1, 0, 0], 1e-6, '引擎 +X(右) → 导出 +X');
  t.ok(det3(A) > 0, '轴向变换 det>0（手性保持，无需翻缠绕）');
  // 尺度：ZUP_CM 把 1 米变 100 厘米
  const Acm = axisMatrix('ZUP_CM');
  const scaled = Acm.applyPoint(Vec3.of(0, 1, 0));
  t.vnear([scaled.x, scaled.y, scaled.z], [0, 0, 100], 1e-4, '1 米 → 100 厘米且轴上移');
  t.near(det3(Acm), 1e6, 1e-3, 'ZUP_CM det = 100³（纯缩放保手性）');

  // YUP_M 为恒等（仅单位），YUP_CM 为纯缩放
  const I = axisMatrix('YUP_M');
  t.eq(I.m[0], 1, 'YUP_M 单位阵 [0,0]');
  t.eq(I.m[5], 1, 'YUP_M 单位阵 [1,1]');
  const AcmY = axisMatrix('YUP_CM');
  t.near(AcmY.m[0], 100, 1e-6, 'YUP_CM 仅缩放 x');
  t.eq(AcmY.m[6], 0, 'YUP_CM 不换轴');

  // 法线矩阵：非均匀缩放下法线用逆转置（否则会被压扁成错误方向）
  const S = Mat4.scale(1, 4, 1);
  const nm = normalMatrix3(S);
  // 逆转置(diag(1,4,1)) = diag(1,1/4,1)
  t.near(nm[0], 1, 1e-6, '法线矩阵 [0,0] = 1');
  t.near(nm[4], 0.25, 1e-6, '法线矩阵 [1,1] = 1/4（逆转置，非 4）');
  t.throws(() => normalMatrix3(Mat4.scale(0, 0, 0)), '奇异矩阵求法线矩阵抛错（红线 A）');

  // convertMesh：顶点走 M、法线走逆转置并归一化
  const src = cube(2);
  const conv = convertMesh(normalizeMesh(src), Acm);
  t.eq(conv.vertexCount, src.vertexCount, 'convertMesh 顶点数不变');
  t.eq(conv.indexCount, src.indexCount, 'convertMesh 索引数不变');
  let allUnit = true;
  for (let i = 0; i < conv.normals.length; i += 3) {
    const l = Math.hypot(conv.normals[i], conv.normals[i + 1], conv.normals[i + 2]);
    if (Math.abs(l - 1) > 1e-5) allUnit = false;
  }
  t.ok(allUnit, 'convertMesh 后法线仍归一化');
  // +X 面法线经 ZUP_CM 仍朝 +X
  let px = false;
  for (let i = 0; i < conv.vertexCount; i++) if (conv.normals[i * 3] > 0.99 && conv.positions[i * 3] > 99) px = true;
  t.ok(px, 'ZUP_CM 后 +X 面法线与位置同向（厘米尺度生效）');

  // ---------- 2. 世界矩阵 / 网格 / 材质解析 ----------
  const { s, parent, child } = makeScene();
  const wp = worldMatrixOf(parent), wc = worldMatrixOf(child);
  t.vnear([wp.m[3], wp.m[7], wp.m[11]], [1, 0, 0], 1e-6, '父世界平移');
  t.vnear([wc.m[3], wc.m[7], wc.m[11]], [1, 2, 0], 1e-6, '子世界平移 = 父 + 子（层级累加）');
  t.near(wc.m[5], 2, 1e-6, '子世界缩放继承自身 scale');
  // 父链环检测（红线 A）
  const a = new GameObject3D('a'), b = new GameObject3D('b');
  a.parent = b; b.parent = a;
  t.throws(() => worldMatrixOf(a), '父链成环抛错（红线 A）');

  t.eq(baseMeshOf(parent).vertexCount, 24, 'baseMeshOf 参数化图元');
  t.eq(baseMeshOf({ components: {} }), null, '无 mesh 组件返回 null');
  const cgObj = new GameObject3D('custom');
  cgObj.components = { mesh: { customGeo: { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], normals: [0, 0, 1, 0, 0, 1, 0, 0, 1], indices: [0, 1, 2] } } };
  t.eq(baseMeshOf(cgObj).vertexCount, 3, 'customGeo 优先于 shape');

  // 材质：inline 0..255 → 线性 0..1
  const mi = materialOf(parent, null);
  t.eq(mi.source, 'inline', 'inline 材质来源标记');
  t.near(mi.albedo[0], 1, 1e-6, 'albedo 255 → 1.0');
  t.near(mi.albedo[1], 0, 1e-6, 'albedo 0 → 0.0');
  t.near(mi.roughness, 0.4, 1e-6, 'roughness 直传');
  t.eq(materialOf({ components: {}, id: 9 }, null), null, '无材质字段返回 null');
  // 材质数据块（materialId 引用）
  const lib = new MaterialLibrary();
  const mat = new Material('steel'); mat.albedo = [0.2, 0.3, 0.4]; mat.roughness = 0.15; mat.metallic = 1; mat.doubleSided = true;
  lib.add(mat);
  parent.materialId = mat.id;
  const mb = materialOf(parent, lib);
  t.eq(mb.source, 'block', '数据块材质来源标记');
  t.eq(mb.name, 'steel', '材质名取自数据块');
  t.near(mb.albedo[2], 0.4, 1e-6, '数据块 albedo 直传（已是线性）');
  t.ok(mb.doubleSided, 'doubleSided 透传');
  parent.materialId = 99999;
  t.throws(() => materialOf(parent, lib), '材质引用失效抛错（红线 A）');
  parent.materialId = null;

  // ---------- 3. OBJ 写出 → 读回（顶点数 / meshHash 一致） ----------
  const items = collectExportItems(s, { materialLibrary: lib });
  t.eq(items.length, 2, 'collectExportItems 收集 2 个网格对象');
  t.eq(items[0].id < items[1].id, true, '导出项按 id 升序（确定性）');

  const objOut = writeOBJ(items, { axis: 'YUP_M', mtlName: 'demo.mtl' });
  t.ok(objOut.obj.includes('mtllib demo.mtl'), 'OBJ 含 mtllib 行');
  t.ok(objOut.obj.includes('o parent') && objOut.obj.includes('o child'), 'OBJ 含两个对象分组');
  t.ok(objOut.obj.includes('usemtl'), 'OBJ 含 usemtl 材质绑定');
  t.ok(objOut.mtl && objOut.mtl.includes('newmtl'), 'MTL 写出');
  const back = parseOBJMesh(objOut.obj);
  t.eq(back.vertexCount, items[0].mesh.vertexCount + items[1].mesh.vertexCount, 'OBJ 读回顶点数 = 各对象之和');
  t.eq(back.indexCount, items[0].mesh.indexCount + items[1].mesh.indexCount, 'OBJ 读回索引数一致');
  t.eq(back.groups.length, 2, 'OBJ 读回两个分组');
  t.eq(back.groups[0].name, 'parent', '分组名保留');

  // 逐对象比对：OBJ 无节点变换，世界矩阵已烘焙进顶点 ⇒ 期望值 = convertMesh(mesh, A·world)
  const perObj = (it) => convertMesh(normalizeMesh(it.mesh), axisMatrix('YUP_M').mul(it.world));
  const e0 = perObj(items[0]), e1 = perObj(items[1]);
  const back0 = {
    positions: back.positions.subarray(0, e0.vertexCount * 3),
    normals: back.normals.subarray(0, e0.vertexCount * 3),
    uvs: back.uvs.subarray(0, e0.vertexCount * 2),
    indices: back.indices.subarray(0, e0.indexCount),
    vertexCount: e0.vertexCount, indexCount: e0.indexCount,
  };
  t.eq(meshHash(back0), meshHash(e0), 'OBJ 读回 meshHash 与 A·world 烘焙结果一致');
  const off = e0.vertexCount;
  const back1 = {
    positions: back.positions.subarray(off * 3),
    normals: back.normals.subarray(off * 3),
    uvs: back.uvs.subarray(off * 2),
    indices: back.indices.subarray(e0.indexCount).map(x => x - off),
    vertexCount: e1.vertexCount, indexCount: e1.indexCount,
  };
  t.eq(meshHash(back1), meshHash(e1), '第二个对象 meshHash 亦一致（全局序号偏移正确）');

  // ZUP_CM 导出：顶点应落在厘米尺度且轴上移
  const objCm = writeOBJ(items, { axis: 'ZUP_CM' });
  const backCm = parseOBJMesh(objCm.obj);
  const eCm = convertMesh(normalizeMesh(items[0].mesh), axisMatrix('ZUP_CM').mul(items[0].world));
  t.eq(meshHash({ ...backCm, positions: backCm.positions.subarray(0, eCm.vertexCount * 3), normals: backCm.normals.subarray(0, eCm.vertexCount * 3), uvs: backCm.uvs.subarray(0, eCm.vertexCount * 2), indices: backCm.indices.subarray(0, eCm.indexCount), vertexCount: eCm.vertexCount, indexCount: eCm.indexCount }), meshHash(eCm), 'ZUP_CM OBJ 往返一致');
  // 父对象位于引擎 (1,0,0)、cube(1) 首顶点 (0.5,-0.5,-0.5) → 世界 (1.5,-0.5,-0.5)
  // → ZUP_CM (x,−z,y)×100 = (150, 50, −50)
  t.vnear([backCm.positions[0], backCm.positions[1], backCm.positions[2]], [150, 50, -50], 1e-3, 'ZUP_CM 首顶点 = 世界坐标经 (x,−z,y)×100');
  const maxAbs = Math.max(...Array.from(backCm.positions).map(Math.abs));
  t.ok(maxAbs > 50, 'ZUP_CM 导出坐标量级为厘米（>50）');

  // OBJ 数值往返精度：解析回 float32 后逐位相等
  let bitEqual = true;
  for (let i = 0; i < e0.positions.length; i++) if (back0.positions[i] !== e0.positions[i]) bitEqual = false;
  t.ok(bitEqual, 'OBJ 顶点数值 float32 逐位往返');
  let nBit = true;
  for (let i = 0; i < e0.normals.length; i++) if (back0.normals[i] !== e0.normals[i]) nBit = false;
  t.ok(nBit, 'OBJ 法线数值 float32 逐位往返');
  let uBit = true;
  for (let i = 0; i < e0.uvs.length; i++) if (back0.uvs[i] !== e0.uvs[i]) uBit = false;
  t.ok(uBit, 'OBJ UV 数值 float32 逐位往返');

  // ---------- 4. MTL 往返（Kd/Ke 为 sRGB 显示值 ↔ 线性） ----------
  const mats = parseMTL(objOut.mtl);
  t.eq(mats.length, 2, 'MTL 读回两个材质');
  t.eq(mats[0].name, items[0].material.name, 'MTL 材质名一致');
  // 线性 1.0 → sRGB 1.0 → 线性 1.0；线性 0 → 0
  t.near(mats[0].albedo[0], items[0].material.albedo[0], 1e-5, 'MTL albedo 线性往返');
  t.near(mats[1].albedo[2], items[1].material.albedo[2], 1e-5, 'MTL 第二材质 albedo 线性往返');
  // 中灰往返：线性 0.5 → sRGB 0.7354 → 线性 0.5
  const mid = writeMTL([{ name: 'mid', albedo: [0.5, 0.5, 0.5], emissive: [0, 0, 0], roughness: 0.5, metallic: 0 }]);
  t.ok(mid.includes('Kd 0.735'), 'Kd 为 sRGB 显示值（线性 0.5 → 0.7354）');
  t.near(parseMTL(mid)[0].albedo[0], 0.5, 1e-5, '中灰 sRGB↔线性往返');
  t.ok(/Ns \d+/.test(mid), 'MTL 含 Ns 高光指数');
  t.ok(mid.includes('Pr 0.5') && mid.includes('Pm 0'), 'MTL 含 PBR 扩展 Pr/Pm（线性值）');

  // ---------- 5. glTF / GLB 写出（.glb 用引擎自带加载器读回） ----------
  const gb = writeGLTF(items, { binary: true, axis: 'ZUP_CM' });
  t.eq(gb.nodeCount, 2, 'GLB 节点数');
  t.eq(gb.meshCount, 2, 'GLB 网格数');
  const doc = parseGLB(gb.glb);
  t.eq(doc.meshes.length, 2, 'GLB 读回网格数');
  const prim0 = doc.meshes[0].primitives[0];
  t.eq(prim0.positions.length / 3, items[0].mesh.vertexCount, 'GLB 顶点数一致');
  t.eq(prim0.indices.length, items[0].mesh.indexCount, 'GLB 索引数一致');
  t.eq(prim0.mode, 4, 'primitive mode=TRIANGLES');
  t.ok(doc.materials.length >= 1, 'GLB 含材质');
  t.near(doc.materials[0].albedo[0], items[0].material.albedo[0], 1e-6, 'GLB baseColorFactor 线性直传');
  t.near(doc.materials[0].rough, items[0].material.roughness, 1e-6, 'GLB roughnessFactor');
  t.near(doc.materials[0].metal, items[0].material.metallic, 1e-6, 'GLB metallicFactor');

  // 顶点几何：glTF 的 mesh 顶点为**局部坐标**（对象/世界变换由节点承载），
  // 故应与原网格逐位一致；「A·world 世界变换」由节点 TRS 表达（下一条断言验证）。
  const Aexp = axisMatrix('ZUP_CM');
  const want0 = normalizeMesh(items[0].mesh);
  t.vnear(Array.from(prim0.positions), Array.from(want0.positions), 1e-6, 'GLB 顶点 = 网格局部坐标（变换在节点上）');
  t.exact(Array.from(prim0.positions), Array.from(want0.positions), 'GLB 顶点局部坐标逐位一致');

  // 节点层级：glTF 场景图与引擎同为 parent·local ⇒ 读回世界矩阵应等于 A·原世界
  const nodes = doc.sceneNodes(0);
  t.eq(nodes.length, 2, 'GLB 场景节点数');
  const byName = new Map(nodes.map(n => [n.name, n]));
  for (const it of items) {
    const n = byName.get(it.name);
    const want = Aexp.mul(it.world).m;
    let d = 0;
    for (let i = 0; i < 16; i++) d = Math.max(d, Math.abs(n.world.m[i] - want[i]));
    t.ok(d < 1e-3, '节点 ' + it.name + ' 世界矩阵 = A·原世界（层级正确）');
  }
  // 层级关系保留（child 挂在 parent 下）
  const pn = doc.json.nodes.find(n => n.name === 'parent');
  t.ok(Array.isArray(pn.children) && pn.children.length === 1, 'GLB 父子关系保留');
  t.eq(doc.json.scenes[0].nodes.length, 1, 'GLB 仅一个根节点');

  // 方向断言（导出→外部工具读入）：引擎 +Y 上 → glTF Z-up 导出应为 +Z
  const upNode = byName.get('parent');
  const upAxis = Mat4.translation(0, 1, 0);
  const mapped = Aexp.mul(upAxis).applyPoint(Vec3.of(0, 0, 0));
  t.vnear([mapped.x, mapped.y, mapped.z], [0, 0, 100], 1e-4, '引擎上方 1m → 导出 +Z 100cm');
  const upDir = upNode.world.applyDir(Vec3.of(0, 1, 0));
  const ul = Math.hypot(upDir.x, upDir.y, upDir.z);
  t.vnear([upDir.x / ul, upDir.y / ul, upDir.z / ul], [0, 0, 1], 1e-5, '节点把引擎上轴映射到导出 +Z（方向正确）');
  t.vnear([upNode.world.m[3], upNode.world.m[7], upNode.world.m[11]], [100, 0, 0], 1e-3, '节点平移亦按厘米换算（(1,0,0)m → (100,0,0)cm）');

  // .gltf 文本形态：内嵌 base64 buffer，bufferView 偏移 4 字节对齐
  const gt = writeGLTF(items, { axis: 'ZUP_M' });
  const j = JSON.parse(gt.gltf);
  t.ok(j.buffers[0].uri.startsWith('data:application/octet-stream;base64,'), '.gltf 内嵌 base64 buffer');
  t.ok(j.bufferViews.every(b => b.byteOffset % 4 === 0), '.gltf bufferView 偏移 4 字节对齐');
  t.ok(j.accessors.every(a => a.componentType === 5126 || a.componentType === 5123 || a.componentType === 5125), 'accessor componentType 合法');
  // glb 读回与 gltf 读回几何一致
  const b64 = Buffer.from(j.buffers[0].uri.split(',')[1], 'base64');
  const binAb = b64.buffer.slice(b64.byteOffset, b64.byteOffset + b64.byteLength);
  const gltfMod = await import('../../src/engine/platform/gltf.js');
  const docT = gltfMod.loadGLTF(j, [binAb]);
  t.vnear(Array.from(docT.meshes[0].primitives[0].positions), Array.from(prim0.positions), 1e-4, '.gltf 与 .glb 几何一致');
  t.eq(docT.meshes[0].primitives[0].indices.length, prim0.indices.length, '.gltf 索引数一致');

  // 索引类型决策：u16 上限 65535
  t.eq(indexComponentType(3), 5123, '小网格用 u16 索引');
  t.eq(indexComponentType(GLTF_INDEX_LIMIT), 5123, '顶点数 = 65535 仍用 u16');
  t.eq(indexComponentType(GLTF_INDEX_LIMIT + 1), 5125, '超 65535 顶点用 u32 索引');

  // 材质去重（D28）：两个对象引用**同一材质数据块**时只落一份
  const dupScene = new Scene3D();
  const sharedLib = new MaterialLibrary();
  const shared = new Material('shared');
  shared.albedo = [0.1, 0.2, 0.3]; shared.roughness = 0.5; shared.metallic = 0;
  sharedLib.add(shared);
  for (const n of ['a', 'b']) {
    const o = new GameObject3D(n);
    o.components = { mesh: { shape: 'cube', albedo: [10, 20, 30], rough: 0.5, metal: 0 } };
    o.materialId = shared.id;
    dupScene.add(o);
  }
  const dupItems = collectExportItems(dupScene, { materialLibrary: sharedLib });
  const dup = writeGLTF(dupItems, { binary: true });
  t.eq(dup.materialCount, 1, '共享材质数据块去重为 1 份');
  t.eq(dup.meshCount, 2, '网格不去重（各自独立）');
  t.eq(dupItems[0].material.name, 'shared', '导出材质名取自数据块');
  // 不同参数（含不同名字的内联材质）各自保留
  const dup2Scene = new Scene3D();
  for (const [n, c] of [['a', [10, 20, 30]], ['b', [40, 50, 60]]]) {
    const o = new GameObject3D(n);
    o.components = { mesh: { shape: 'cube', albedo: c, rough: 0.5, metal: 0 } };
    dup2Scene.add(o);
  }
  t.eq(writeGLTF(collectExportItems(dup2Scene, {}), { binary: true }).materialCount, 2, '不同材质参数各留一份');

  // ---------- 6. TRS 分解（glTF 节点） ----------
  const trs = decomposeWorld(Mat4.translation(1, 2, 3).mul(Mat4.scale(2, 4, 6)));
  t.vnear(trs.t, [1, 2, 3], 1e-5, 'decomposeWorld 平移');
  t.vnear(trs.s, [2, 4, 6], 1e-5, 'decomposeWorld 缩放（列长）');
  t.vnear(trs.r, [0, 0, 0, 1], 1e-5, '无旋转时四元数为恒等');
  // 旋转往返：绕 Y 轴 90° 的矩阵 → 四元数 → 重建矩阵应一致
  const rot = Mat4.rotationY(Math.PI / 2);
  const d2 = decomposeWorld(rot);
  t.near(Math.abs(d2.r[1]), Math.sin(Math.PI / 4), 1e-5, '绕 Y 90° 四元数 y 分量 = sin45°');
  t.throws(() => decomposeWorld(Mat4.scale(0, 1, 1)), '零缩放轴分解抛错（红线 A）');
  // 镜像（det<0）：glTF 无法表示负缩放 → 抛错
  const mirror = Mat4.scale(-1, 1, 1);
  t.throws(() => decomposeWorld(mirror), '镜像世界矩阵分解抛错（红线 A）');
  t.ok(det3(mirror) < 0, '镜像矩阵 det<0（前置条件成立）');

  // ---------- 7. exportScene 场景级入口 + 修改器栈求值 ----------
  const eObj = exportScene(s, { format: 'obj', name: 'demo' });
  t.eq(eObj.format, 'obj', 'exportScene obj 格式');
  t.eq(eObj.axis, 'YUP_M', 'obj 默认 YUP_M（引擎原生，DCC 可直接读）');
  t.eq(eObj.files.length, 2, 'obj 导出两个文件（.obj + .mtl）');
  t.eq(eObj.files[0].name, 'demo.obj', '文件名取自场景名');
  t.eq(eObj.stats.objects, 2, 'stats 对象数');
  t.eq(eObj.stats.triangles, Math.floor(items[0].mesh.indexCount / 3) + Math.floor(items[1].mesh.indexCount / 3), 'stats 三角形数');

  const eGlb = exportScene(s, { format: 'glb', name: 'demo' });
  t.eq(eGlb.axis, 'ZUP_M', 'glb 默认 ZUP_M（Blender/DCC 原生）');
  t.ok(eGlb.files[0].bytes instanceof ArrayBuffer, 'glb 产物为二进制');
  t.ok(eGlb.stats.nodes === 2, 'glb stats 含节点数');

  const eGltf = exportScene(s, { format: 'gltf', name: 'demo' });
  t.eq(eGltf.axis, 'ZUP_M', 'gltf 默认 ZUP_M');
  t.ok(typeof eGltf.files[0].text === 'string', 'gltf 产物为文本');
  t.throws(() => exportScene(s, { format: 'stl' }), '未知格式抛错（红线 A）');

  // 修改器栈：未注入求值函数 → 抛错；注入后顶点数翻倍（MIRROR）
  const ms = new Scene3D();
  const mo = new GameObject3D('mirrored');
  mo.components = { mesh: { shape: 'cube', albedo: [100, 100, 100] } };
  mo.transform.position = [2, 0, 0];   // 移离 X=0 对称面，避免镜像重合
  ms.add(mo);
  mo.modifiers = [{ type: 'MIRROR', params: { axis: 'X' }, enabled: true }];
  t.throws(() => exportScene(ms, { format: 'glb' }), '含修改器但未注入求值函数时抛错（红线 A）');
  const { applyModifiers } = await import('../../src/engine/modeling/modifier.js');
  const eMod = exportScene(ms, { format: 'glb', applyModifiersFn: (m, mods) => applyModifiers(m, mods) });
  t.eq(eMod.stats.vertices, 48, 'MIRROR 求值后导出顶点翻倍（24→48）');
  const modDoc = parseGLB(eMod.files[0].bytes);
  t.eq(modDoc.meshes[0].primitives[0].positions.length / 3, 48, 'GLB 内实际写入求值后几何');

  // 禁用修改器不参与求值
  mo.modifiers = [{ type: 'MIRROR', params: { axis: 'X' }, enabled: false }];
  const eOff = exportScene(ms, { format: 'glb', applyModifiersFn: (m, mods) => applyModifiers(m, mods) });
  t.eq(eOff.stats.vertices, 24, 'enabled=false 修改器不求值');

  // ---------- 8. 确定性（同一场景两次导出逐字节一致） ----------
  const r1 = exportScene(s, { format: 'glb', name: 'demo' });
  const r2 = exportScene(s, { format: 'glb', name: 'demo' });
  t.exact(new Uint8Array(r1.files[0].bytes), new Uint8Array(r2.files[0].bytes), 'GLB 两次导出逐字节一致（确定性）');
  const o1 = exportScene(s, { format: 'obj', name: 'demo' });
  const o2 = exportScene(s, { format: 'obj', name: 'demo' });
  t.eq(o1.files[0].text, o2.files[0].text, 'OBJ 两次导出文本一致（确定性）');

  // 导出不修改场景（红线 F：导出为只读）
  const beforeHash = meshHash(normalizeMesh(baseMeshOf(child)));
  exportScene(s, { format: 'glb' });
  t.eq(meshHash(normalizeMesh(baseMeshOf(child))), beforeHash, '导出不修改场景几何（只读）');

  // ---------- 9. 旋转单位选项 ----------
  const rs = new Scene3D();
  const ro = new GameObject3D('rot');
  ro.transform.rotation = [90, 0, 0];  // 数值 90
  ro.components = { mesh: { shape: 'cube' } };
  rs.add(ro);
  const radItem = collectExportItems(rs, { rotationUnit: 'rad' });
  const degItem = collectExportItems(rs, { rotationUnit: 'deg' });
  t.near(radItem[0].world.m[5], Math.cos(90), 1e-4, "rotationUnit 'rad'：90 按弧度解释（与渲染路径一致）");
  t.near(degItem[0].world.m[5], Math.cos(Math.PI / 2), 1e-4, "rotationUnit 'deg'：90 按度解释");
  t.throws(() => collectExportItems(rs, { rotationUnit: 'turn' }), '非法 rotationUnit 抛错（红线 A）');

  // ---------- 10. 边界与错误 ----------
  const empty = new Scene3D();
  const eEmpty = exportScene(empty, { format: 'glb' });
  t.eq(eEmpty.stats.objects, 0, '空场景导出 0 对象');
  t.ok(eEmpty.files[0].bytes instanceof ArrayBuffer, '空场景仍产出合法 GLB');
  const emptyDoc = parseGLB(eEmpty.files[0].bytes);
  t.eq(emptyDoc.json.scenes[0].nodes.length, 0, '空场景根节点为空');
  t.throws(() => parseOBJMesh('# 只有注释\n'), '无 v/f 的 OBJ 读回抛错（红线 A）');
  t.throws(() => parseOBJMesh('v 0 0 0\nf 1 2 3\n'), '引用不存在顶点抛错（红线 A）');
  t.throws(() => collectExportItems(null, {}), 'collectExportItems 空场景抛错（红线 A）');
  t.throws(() => normalizeMesh({}), 'normalizeMesh 缺 positions 抛错（红线 A）');
  t.throws(() => writeMTL([{ name: 'bad', albedo: [Infinity, 0, 0] }]), '非有限数值写出抛错（红线 A）');

  // 索引越界的 OBJ（顶点数 < 索引）不静默：读回顶点数按实际引用展开
  const tiny = parseOBJMesh('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n');
  t.eq(tiny.vertexCount, 3, '最小三角面读回 3 顶点');
  t.eq(tiny.indexCount, 3, '最小三角面读回 3 索引');
  t.near(tiny.positions[3], 1, 1e-6, '顶点坐标正确');

  // 四边形面（n-gon）扇形三角化
  const quad = parseOBJMesh('v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nf 1 2 3 4\n');
  t.eq(quad.indexCount, 6, '四边形面三角化为 2 个三角形');
  t.eq(quad.vertexCount, 4, '四边形面保留 4 顶点');
  t.exact(quad.indices, [0, 1, 2, 0, 2, 3], 'n-gon 扇形三角化索引正确');

  // 负数索引（OBJ 合法语义：自尾计）
  const neg = parseOBJMesh('v 0 0 0\nv 1 0 0\nv 0 1 0\nf -3 -2 -1\n');
  t.exact(neg.indices, [0, 1, 2], '负数索引按自尾计解析');

  // 非网格对象（灯光）被跳过
  const ls = new Scene3D();
  const lo = new GameObject3D('sun');
  lo.components = { light: { kind: 'point', color: [255, 244, 214], intensity: 1 } };
  ls.add(lo);
  t.eq(collectExportItems(ls, {}).length, 0, '灯光对象不参与几何导出');
  t.eq(exportScene(ls, { format: 'obj' }).files.length, 1, '无材质时不写 .mtl');

  // 高顶点数网格走 u32 索引（构造 65536+ 顶点的平面网格）
  const N = 260; // (N+1)² = 68121 > 65535
  const big = { positions: new Float32Array((N + 1) * (N + 1) * 3), normals: null, uvs: null, indices: [] };
  for (let y = 0; y <= N; y++) for (let x = 0; x <= N; x++) {
    const i = (y * (N + 1) + x) * 3;
    big.positions[i] = x / N; big.positions[i + 1] = 0; big.positions[i + 2] = y / N;
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const a = y * (N + 1) + x, b = a + 1, c = a + (N + 1), d = c + 1;
    big.indices.push(a, c, b, b, c, d);
  }
  big.indices = new Uint32Array(big.indices);
  big.vertexCount = big.positions.length / 3; big.indexCount = big.indices.length;
  const bigScene = new Scene3D();
  const bo = new GameObject3D('big');
  bo.components = { mesh: { customGeo: big } };
  bigScene.add(bo);
  const bigOut = writeGLTF(collectExportItems(bigScene, {}), { binary: true });
  const bigDoc = parseGLB(bigOut.glb);
  t.ok(big.vertexCount > GLTF_INDEX_LIMIT, '大网格顶点数超 u16 上限');
  t.eq(bigDoc.json.accessors[bigDoc.json.meshes[0].primitives[0].indices].componentType, 5125, '大网格用 u32 索引');
  t.eq(bigDoc.meshes[0].primitives[0].indices.length, big.indexCount, '大网格索引数一致');

  t.note('M-F 出口：OBJ/glTF/GLB 可写出并读回，坐标/单位变换经 DCC 方向断言');
}
