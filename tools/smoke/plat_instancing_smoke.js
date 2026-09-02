// GLTF 实例合批 smoke：解析 EXT_mesh_gpu_instancing、计算每实例矩阵、构建场景实例批（含同 mesh 复用合批）。
import { parseGLB, computeInstanceMatrices, buildInstanceBatches } from '../../src/engine/platform/gltf.js';
import { buildGLB } from './_glb_helper.js';

export const name = 'plat_instancing_smoke.js';

export async function run(t) {
  // bin 布局：POSITION(36) + indices(6) + pad(2) + TRANSLATION(36)
  const bin = new ArrayBuffer(80);
  const f32 = new Float32Array(bin), u16 = new Uint16Array(bin);
  // POSITION：三角形 (0,0,0)(1,0,0)(0,1,0)（mesh0 与 mesh1 复用同一几何）
  f32[0] = 0; f32[1] = 0; f32[2] = 0; f32[3] = 1; f32[4] = 0; f32[5] = 0; f32[6] = 0; f32[7] = 1; f32[8] = 0;
  // indices
  u16[18] = 0; u16[19] = 1; u16[20] = 2;
  // TRANSLATION（@ off44 → f32 11..19）：(0,0,0)(1,0,0)(2,0,0)
  f32[11] = 0; f32[12] = 0; f32[13] = 0;
  f32[14] = 1; f32[15] = 0; f32[16] = 0;
  f32[17] = 2; f32[18] = 0; f32[19] = 0;

  const doc = parseGLB(buildGLB({
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0, 1, 2] }],
    extensionsUsed: ['EXT_mesh_gpu_instancing'],
    nodes: [
      { name: 'n0', mesh: 0, translation: [0, 0, 0] }, // 实例化 mesh
      { name: 'n1', mesh: 1, translation: [5, 0, 0] }, // 复用 mesh1
      { name: 'n2', mesh: 1, translation: [9, 0, 0] }, // 复用 mesh1
    ],
    meshes: [
      {
        primitives: [{
          attributes: { POSITION: 0 },
          indices: 1,
          extensions: { 'EXT_mesh_gpu_instancing': { attributes: { TRANSLATION: 2 } } },
        }],
      },
      { primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }, // 非实例化，供合批复用
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' },
      { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' },
      { bufferView: 2, componentType: 5126, count: 3, type: 'VEC3' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 },
      { buffer: 0, byteOffset: 36, byteLength: 6 },
      { buffer: 0, byteOffset: 44, byteLength: 36 },
    ],
    buffers: [{ byteLength: bin.byteLength }],
  }, bin));

  // 1. 图元实例属性解析
  const prim0 = doc.meshes[0].primitives[0];
  t.ok(prim0.instances != null, '图元含 instances');
  t.eq(prim0.instances.count, 3, '实例数=3');
  t.vnear(prim0.instances.translation, [0, 0, 0, 1, 0, 0, 2, 0, 0], 1e-6, '实例平移数组');

  // 2. 每实例局部矩阵
  const mats = computeInstanceMatrices(prim0);
  t.eq(mats.length, 3, '实例矩阵数=3');
  const got = mats.map(m => m.applyPoint({ x: 0, y: 0, z: 0 }));
  t.near(got[1].x, 1, 1e-5, '实例1 平移 x=1');
  t.near(got[2].x, 2, 1e-5, '实例2 平移 x=2');

  // 3. 场景实例批：n0 含 3 实例矩阵；n1/n2 各复用 mesh1 → 1 实例矩阵
  const batches = buildInstanceBatches(doc, 0);
  t.eq(batches.length, 3, '批数=3（n0 实例化 + n1 + n2 复用）');
  const n0 = batches.find(b => b.nodeIndex === 0);
  const n1 = batches.find(b => b.nodeIndex === 1);
  const n2 = batches.find(b => b.nodeIndex === 2);
  t.eq(n0.matrices.length, 3, 'n0 批含 3 实例矩阵');
  t.eq(n1.matrices.length, 1, 'n1 批含 1 实例矩阵');
  t.eq(n2.matrices.length, 1, 'n2 批含 1 实例矩阵');
  // n0 实例世界矩阵 = 节点世界(单位) × 实例局部 → x 平移 0/1/2
  const n0x = n0.matrices.map(m => m.applyPoint({ x: 0, y: 0, z: 0 }).x);
  t.vnear(n0x, [0, 1, 2], 1e-5, 'n0 实例世界 x = [0,1,2]');
  t.near(n1.matrices[0].applyPoint({ x: 0, y: 0, z: 0 }).x, 5, 1e-5, 'n1 复用 mesh 平移 x=5');
  t.near(n2.matrices[0].applyPoint({ x: 0, y: 0, z: 0 }).x, 9, 1e-5, 'n2 复用 mesh 平移 x=9');

  // 4. 合批示意：按 meshIndex 归并，2 份几何服务 5 个实例变换（3+1+1）
  const byMesh = new Map();
  for (const b of batches) {
    if (!byMesh.has(b.meshIndex)) byMesh.set(b.meshIndex, []);
    byMesh.get(b.meshIndex).push(...b.matrices);
  }
  t.eq(byMesh.get(0).length, 3, 'mesh0 合批后 3 实例');
  t.eq(byMesh.get(1).length, 2, 'mesh1 合批后 2 实例（n1+n2 复用）');
}
