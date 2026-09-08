// GLTF 2.0 加载器 smoke：内置最小 GLB 夹具（列主序 JSON + BIN chunk），覆盖
// accessor/bufferView、mesh primitive、node TRS 层级、material、动画结构、matrix 节点、扩展白名单。
import { parseGLB, loadGLTF } from '../../src/engine/platform/gltf.js';

export const name = 'plat_gltf_smoke.js';

// 拼装 GLB（12 字节头 + JSON chunk + BIN chunk，各 chunk 4 字节对齐）
function buildGLB(json, bin) {
  const enc = new TextEncoder();
  let jb = enc.encode(JSON.stringify(json));
  const jpad = (4 - (jb.length % 4)) % 4; const jpadBytes = new Uint8Array(jpad).fill(0x20);
  const jChunk = new Uint8Array(jb.length + jpad); jChunk.set(jb); jChunk.set(jpadBytes, jb.length);
  const bpad = (4 - (bin.byteLength % 4)) % 4; const bpadBytes = new Uint8Array(bpad);
  const bChunk = new Uint8Array(bin.byteLength + bpad); bChunk.set(new Uint8Array(bin), 0); bChunk.set(bpadBytes, bin.byteLength);
  const total = 12 + 8 + jChunk.length + 8 + bChunk.length;
  const ab = new ArrayBuffer(total); const dv = new DataView(ab);
  dv.setUint32(0, 0x46546C67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  let off = 12;
  dv.setUint32(off, jChunk.length, true); dv.setUint32(off + 4, 0x4E4F534A, true); new Uint8Array(ab, off + 8, jChunk.length).set(jChunk); off += 8 + jChunk.length;
  dv.setUint32(off, bChunk.length, true); dv.setUint32(off + 4, 0x004E4942, true); new Uint8Array(ab, off + 8, bChunk.length).set(bChunk); off += 8 + bChunk.length;
  return ab;
}

export async function run(t) {
  // ---- 构造最小 GLB ----
  const pos = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);   // 三角形
  const nor = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]);
  const uv = new Float32Array([0, 0, 1, 0, 0, 1]);
  const idx = new Uint16Array([0, 1, 2]);
  const bin = new ArrayBuffer(36 + 36 + 24 + 6);
  new Float32Array(bin, 0, 9).set(pos);
  new Float32Array(bin, 36, 9).set(nor);
  new Float32Array(bin, 72, 6).set(uv);
  new Uint16Array(bin, 96, 3).set(idx);

  const json = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0, 2] }],
    nodes: [
      { name: 'root', translation: [0, 1, 0], mesh: 0, children: [1] },
      { name: 'child', translation: [2, 0, 0], scale: [1, 2, 1], rotation: [0, 0, 0, 1] },
      { name: 'matrixNode', matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 0, 0, 1] },
    ],
    meshes: [{ name: 'tri', primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 }] }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5126, count: 3, type: 'VEC3' },
      { bufferView: 2, componentType: 5126, count: 3, type: 'VEC2' },
      { bufferView: 3, componentType: 5123, count: 3, type: 'SCALAR' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 },
      { buffer: 0, byteOffset: 36, byteLength: 36 },
      { buffer: 0, byteOffset: 72, byteLength: 24 },
      { buffer: 0, byteOffset: 96, byteLength: 6 },
    ],
    buffers: [{ byteLength: bin.byteLength }],
    materials: [{ name: 'red', pbrMetallicRoughness: { baseColorFactor: [1, 0, 0, 1], metallicFactor: 0.1, roughnessFactor: 0.5 }, emissiveFactor: [0, 0, 1] }],
    extensionsUsed: ['KHR_materials_unlit', 'KHR_some_unknown_ext'],
  };

  const glb = buildGLB(json, bin);
  const doc = parseGLB(glb);

  // 1. mesh primitive 解析
  const prim = doc.meshes[0].primitives[0];
  t.eq(prim.positions.length, 9, 'POSITION 顶点数×3');
  t.vnear(Array.from(prim.positions), [0, 0, 0, 1, 0, 0, 0, 1, 0], 1e-5, 'POSITION 值');
  t.eq(prim.indices.length, 3, 'indices 数');
  t.eq(prim.indices[0], 0, 'index[0]');
  t.eq(prim.indices[2], 2, 'index[2]');
  t.eq(prim.normals.length, 9, 'NORMAL 存在');
  t.eq(prim.uvs.length, 6, 'TEXCOORD_0 存在');
  t.eq(prim.material, 0, 'primitive 绑定 material');

  // 2. material 解析
  const mat = doc.materials[0];
  t.vnear(mat.albedo, [1, 0, 0], 1e-6, 'albedo=[1,0,0]');
  t.near(mat.metal, 0.1, 1e-6, 'metallic=0.1');
  t.near(mat.rough, 0.5, 1e-6, 'rough=0.5');
  t.vnear(mat.emissive, [0, 0, 1], 1e-6, 'emissive=[0,0,1]');

  // 3. node 层级世界矩阵
  const nodes = doc.sceneNodes(0);
  t.eq(nodes.length, 3, '场景 3 个节点');
  const root = nodes.find(n => n.name === 'root');
  const p0 = root.world.applyPoint({ x: 0, y: 0, z: 0 });
  t.near(p0.x, 0, 1e-5, 'root 世界原点 x=0'); t.near(p0.y, 1, 1e-5, 'root 世界原点 y=1'); t.near(p0.z, 0, 1e-5, 'root 世界原点 z=0');
  const child = nodes.find(n => n.name === 'child');
  const pc = child.world.applyPoint({ x: 0, y: 0, z: 0 });
  t.near(pc.x, 2, 1e-4, 'child 世界原点 x=2'); t.near(pc.y, 1, 1e-4, 'child 世界原点 y=1 (root+local)'); t.near(pc.z, 0, 1e-4, 'child 世界原点 z=0');
  // scale 生效：child 局部 y 缩放 2
  const pcTop = child.world.applyPoint({ x: 0, y: 1, z: 0 });
  t.near(pcTop.y, 1 + 2, 1e-4, 'child y=1 缩放后 world y=3');

  // 4. matrix 节点（列主序 → 行主序转置）
  const mNode = nodes.find(n => n.name === 'matrixNode');
  const pm = mNode.world.applyPoint({ x: 0, y: 0, z: 0 });
  t.near(pm.x, 5, 1e-5, 'matrix 节点平移 x=5');

  // 5. 扩展白名单：未知扩展被记录而非崩溃
  t.ok(doc.unknownExtensions.includes('KHR_some_unknown_ext'), '未知扩展被记录');
  t.ok(!doc.unknownExtensions.includes('KHR_materials_unlit'), '白名单扩展不报未知');

  // 6. loadGLTF 直接路径（已解析 buffers 的等价调用）
  const doc2 = loadGLTF(json, [bin]);
  t.eq(doc2.meshes[0].primitives[0].positions.length, 9, 'loadGLTF 等价解析');
}
