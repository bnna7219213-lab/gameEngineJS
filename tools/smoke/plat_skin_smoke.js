// 骨骼动画 smoke（P3.4）：内置带 skin+动画 GLB 夹具，验证
// 动画采样（slerp/线性）、节点世界矩阵、skinning 矩阵、CPU 蒙皮顶点。
import { parseGLB } from '../../src/engine/platform/gltf.js';
import { skinVertex, skinPositions } from '../../src/engine/platform/skin.js';
import { Mat4, Quat } from '../../src/engine/core/math.js';

export const name = 'plat_skin_smoke.js';

function buildGLB(json, bin) {
  const enc = new TextEncoder();
  let jb = enc.encode(JSON.stringify(json));
  const jpad = (4 - (jb.length % 4)) % 4;
  const jChunk = new Uint8Array(jb.length + jpad); jChunk.set(jb); jChunk.set(new Uint8Array(jpad).fill(0x20), jb.length);
  const bpad = (4 - (bin.byteLength % 4)) % 4;
  const bChunk = new Uint8Array(bin.byteLength + bpad); bChunk.set(new Uint8Array(bin), 0); bChunk.set(new Uint8Array(bpad), bin.byteLength);
  const total = 12 + 8 + jChunk.length + 8 + bChunk.length;
  const ab = new ArrayBuffer(total); const dv = new DataView(ab);
  dv.setUint32(0, 0x46546C67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  let off = 12;
  dv.setUint32(off, jChunk.length, true); dv.setUint32(off + 4, 0x4E4F534A, true); new Uint8Array(ab, off + 8, jChunk.length).set(jChunk); off += 8 + jChunk.length;
  dv.setUint32(off, bChunk.length, true); dv.setUint32(off + 4, 0x004E4942, true); new Uint8Array(ab, off + 8, bChunk.length).set(bChunk); off += 8 + bChunk.length;
  return ab;
}

export async function run(t) {
  // ---- 构造带骨骼+动画的 GLB ----
  const bin = new ArrayBuffer(228);
  const f32 = new Float32Array(bin);
  const u16 = new Uint16Array(bin);
  const u8 = new Uint8Array(bin);
  // POSITION (1,0,0)
  f32[0] = 1; f32[1] = 0; f32[2] = 0;
  // WEIGHTS_0 (1,0,0,0) @ off12
  f32[3] = 1; f32[4] = 0; f32[5] = 0; f32[6] = 0;
  // JOINTS_0 (1,0,0,0) UBYTE @ off28
  u8[28] = 1; u8[29] = 0; u8[30] = 0; u8[31] = 0;
  // indices [0] USHORT @ off32
  u16[16] = 0; // 16*2 = 32
  // inverseBind MAT4×2 @ off36 (float idx 9..)
  // ibm0 = identity
  const id = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (let i = 0; i < 16; i++) f32[9 + i] = id[i];
  // ibm1 = T(-1,0,0)
  const ibm1 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -1, 0, 0, 1];
  for (let i = 0; i < 16; i++) f32[9 + 16 + i] = ibm1[i];
  // animInput times [0,1] @ off164 (float idx 41)
  f32[41] = 0; f32[42] = 1;
  // animOutputR rotation VEC4×2 @ off172 (float idx 43)
  f32[43] = 0; f32[44] = 0; f32[45] = 0; f32[46] = 1;          // t0: identity
  f32[47] = 0; f32[48] = 0; f32[49] = Math.SQRT1_2; f32[50] = Math.SQRT1_2; // t1: 90° about Z
  // animOutputT translation VEC3×2 @ off204 (float idx 51)
  f32[51] = 0; f32[52] = 0; f32[53] = 0;
  f32[54] = 0; f32[55] = 2; f32[56] = 0;

  const json = {
    asset: { version: '2.0' }, scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [
      { name: 'j0', translation: [0, 0, 0], mesh: 0, children: [1] },
      { name: 'j1', translation: [1, 0, 0] },
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, JOINTS_0: 2, WEIGHTS_0: 1 }, indices: 3, material: 0 }] }],
    materials: [{ name: 'm', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1] } }],
    skins: [{ joints: [0, 1], inverseBindMatrices: 4 }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 1, type: 'VEC3' },
      { bufferView: 1, componentType: 5126, count: 1, type: 'VEC4' },
      { bufferView: 2, componentType: 5121, count: 1, type: 'VEC4' },
      { bufferView: 3, componentType: 5123, count: 1, type: 'SCALAR' },
      { bufferView: 4, componentType: 5126, count: 2, type: 'MAT4' },
      { bufferView: 5, componentType: 5126, count: 2, type: 'SCALAR' },
      { bufferView: 6, componentType: 5126, count: 2, type: 'VEC4' },
      { bufferView: 7, componentType: 5126, count: 2, type: 'VEC3' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 12 },
      { buffer: 0, byteOffset: 12, byteLength: 16 },
      { buffer: 0, byteOffset: 28, byteLength: 4 },
      { buffer: 0, byteOffset: 32, byteLength: 2 },
      { buffer: 0, byteOffset: 36, byteLength: 128 },
      { buffer: 0, byteOffset: 164, byteLength: 8 },
      { buffer: 0, byteOffset: 172, byteLength: 32 },
      { buffer: 0, byteOffset: 204, byteLength: 24 },
    ],
    buffers: [{ byteLength: bin.byteLength }],
    animations: [{
      samplers: [
        { input: 5, output: 6, interpolation: 'LINEAR' },
        { input: 5, output: 7, interpolation: 'LINEAR' },
      ],
      channels: [
        { sampler: 0, target: { node: 1, path: 'rotation' } },
        { sampler: 1, target: { node: 0, path: 'translation' } },
      ],
    }],
  };

  const doc = parseGLB(buildGLB(json, bin));

  // 1. skin 解析
  t.eq(doc.skins.length, 1, 'skins 数');
  t.vnear(doc.skins[0].joints, [0, 1], 0, 'skin joints=[0,1]');
  t.eq(doc.skins[0].inverseBindMatrices.length, 2, 'inverseBindMatrices 数=2');
  t.near(doc.skins[0].inverseBindMatrices[1].m[3], -1, 1e-5, 'ibm1 平移 x=-1（引擎行主序 m[3]）');
  t.near(doc.skins[0].inverseBindMatrices[0].m[0], 1, 1e-5, 'ibm0 单位阵 m00=1');

  // 2. 图元 JOINTS/WEIGHTS
  const prim = doc.meshes[0].primitives[0];
  t.ok(prim.joints != null, '图元含 joints');
  t.ok(prim.weights != null, '图元含 weights');
  t.eq(prim.weights[0], 1, 'weight[0]=1');

  // 3. 动画采样：t=1 旋转 90° about Z
  const sampled1 = sampleAt(doc, 1);
  t.vnear(sampled1[1].r, [0, 0, Math.SQRT1_2, Math.SQRT1_2], 1e-5, 't=1 旋转=90°Z');
  // t=0.5 线性平移 → (0,1,0)
  const sampled05 = sampleAt(doc, 0.5);
  t.vnear(sampled05[0].t, [0, 1, 0], 1e-5, 't=0.5 平移线性插值=(0,1,0)');
  // t=0.5 旋转 slerp 45°
  t.vnear(sampled05[1].r, [0, 0, Math.sin(Math.PI / 8), Math.cos(Math.PI / 8)], 1e-5, 't=0.5 旋转 slerp=45°');

  // 4. 世界矩阵（节点静态 translation 须保留：joint1 平移 (1,0,0) + 父节点平移 (0,2,0)）
  const world = computeWorld(doc, sampled1);
  const j1o = world[1].applyPoint({ x: 0, y: 0, z: 0 });
  t.near(j1o.x, 1, 1e-5, 'world[1] 原点 x=1'); t.near(j1o.y, 2, 1e-5, 'world[1] 原点 y=2'); t.near(j1o.z, 0, 1e-5, 'world[1] 原点 z=0');

  // 5. skinning 矩阵 = world * inverseBind（作用于 (1,0,0) → (1,2,0)）
  const jm = skinMat(doc, 0, world);
  t.eq(jm.length, 2, 'skinning 矩阵数=2');
  const p = jm[1].applyPoint({ x: 1, y: 0, z: 0 });
  t.near(p.x, 1, 1e-5, 'jm1*(1,0,0) x=1'); t.near(p.y, 2, 1e-5, 'jm1*(1,0,0) y=2');

  // 6. CPU 蒙皮顶点：单顶点权重全给 joint1 → 结果 (1,2,0)
  const skinned = skinPositions(prim, jm);
  t.near(skinned[0], 1, 1e-4, '蒙皮 x=1'); t.near(skinned[1], 2, 1e-4, '蒙皮 y=2'); t.near(skinned[2], 0, 1e-4, '蒙皮 z=0');

  // 7. skinVertex 直接验证旋转矩阵
  const Rz90 = Mat4.fromQuat(new Quat(0, 0, Math.SQRT1_2, Math.SQRT1_2));
  const sv = skinVertex([1, 0, 0], [0, 0, 0, 0], [1, 0, 0, 0], [Rz90]);
  t.near(sv.x, 0, 1e-5, 'skinVertex 旋转 x=0'); t.near(sv.y, 1, 1e-5, 'skinVertex 旋转 y=1');
}

// 取 gltf.js 的导出函数（动态 import 同模块）
import { sampleAnimation, computeWorldMatrices, skinMatrices } from '../../src/engine/platform/gltf.js';
function sampleAt(doc, time) { return sampleAnimation(doc, 0, time); }
function computeWorld(doc, sampled) { return computeWorldMatrices(doc, 0, sampled); }
function skinMat(doc, i, world) { return skinMatrices(doc, i, world); }
