// GLTF 2.0 加载器（P3.2）：JSON + GLB 二进制容器。
// 解析 accessor/bufferView、mesh primitive（POSITION/NORMAL/TEXCOORD_0）、node 层级 TRS/matrix、
// material（pbrMetallicRoughness + emissiveFactor）、texture/sampler、scene 扁平化（世界矩阵）。
// 扩展白名单：未知扩展不报错（仅记录），避免脆性失败（红线 A：可见而非静默崩溃）。
// 图像解码（createImageBitmap / decodeAudioData）在浏览器运行时完成，本模块只解析结构并暴露 images 列表。
import { Mat4, Quat, Vec3 } from '../core/math.js';

const COMP_SIZE = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const NUM_COMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
const GLB_MAGIC = 0x46546C67, CHUNK_JSON = 0x4E4F534A, CHUNK_BIN = 0x004E4942;

export const ALLOWED_EXTENSIONS = new Set([
  'KHR_materials_pbrSpecularGlossiness', 'KHR_materials_unlit', 'KHR_materials_emissive_strength',
  'KHR_texture_transform', 'KHR_draco_mesh_compression', 'KHR_materials_clearcoat',
  'EXT_mesh_gpu_instancing',
]);

const _dv = (buf, off = 0, len) => new DataView(buf, off, len == null ? buf.byteLength - off : len);

// 列主序 glTF 矩阵 → 本引擎行主序 Mat4
function fromGLTFMatrix(a) {
  const rm = new Array(16);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) rm[r * 4 + c] = a[c * 4 + r];
  return new Mat4(rm);
}

function readAccessor(gltf, buffers, i) {
  const a = gltf.accessors[i];
  if (a.bufferView == null) {
    const n = NUM_COMP[a.type];
    return { count: a.count, array: new Float32Array(a.count * n), type: a.type, componentType: a.componentType };
  }
  const bv = gltf.bufferViews[a.bufferView];
  const buf = buffers[bv.buffer || 0];
  const comp = COMP_SIZE[a.componentType];
  const nc = NUM_COMP[a.type];
  const stride = bv.byteStride || comp * nc;
  const dv = _dv(buf, (a.byteOffset || 0) + (bv.byteOffset || 0));
  const isInt = a.componentType !== 5126;
  const out = isInt ? new Uint32Array(a.count * nc) : new Float32Array(a.count * nc);
  const norm = a.normalized ? normScale(a.componentType) : 1;
  for (let e = 0; e < a.count; e++) {
    const base = e * stride;
    for (let c = 0; c < nc; c++) {
      const off = base + c * comp;
      let val;
      switch (a.componentType) {
        case 5126: val = dv.getFloat32(off, true); break;
        case 5125: val = dv.getUint32(off, true); break;
        case 5123: val = dv.getUint16(off, true); break;
        case 5121: val = dv.getUint8(off); break;
        case 5122: val = dv.getInt16(off, true); break;
        case 5120: val = dv.getInt8(off); break;
        default: val = 0;
      }
      out[e * nc + c] = val * norm;
    }
  }
  return { count: a.count, array: out, type: a.type, componentType: a.componentType };
}

function normScale(ct) {
  switch (ct) {
    case 5121: return 1 / 255; case 5123: return 1 / 65535;
    case 5120: return 1 / 127; case 5122: return 1 / 32767;
    default: return 1;
  }
}

function resolvePrimitive(gltf, buffers, prim) {
  const attr = prim.attributes || {};
  const pos = readAccessor(gltf, buffers, attr.POSITION);
  const nor = attr.NORMAL != null ? readAccessor(gltf, buffers, attr.NORMAL) : null;
  const uv = attr.TEXCOORD_0 != null ? readAccessor(gltf, buffers, attr.TEXCOORD_0) : null;
  const idx = prim.indices != null ? readAccessor(gltf, buffers, prim.indices) : null;
  const jnt = attr.JOINTS_0 != null ? readAccessor(gltf, buffers, attr.JOINTS_0) : null;
  const wgt = attr.WEIGHTS_0 != null ? readAccessor(gltf, buffers, attr.WEIGHTS_0) : null;
  // GLTF 网格级 GPU 实例化：per-instance 的 TRS 属性
  let instances = null;
  const gpuInst = (prim.extensions || {})['EXT_mesh_gpu_instancing'];
  if (gpuInst && gpuInst.attributes) {
    const a = gpuInst.attributes;
    const t = a.TRANSLATION != null ? readAccessor(gltf, buffers, a.TRANSLATION) : null;
    const r = a.ROTATION != null ? readAccessor(gltf, buffers, a.ROTATION) : null;
    const s = a.SCALE != null ? readAccessor(gltf, buffers, a.SCALE) : null;
    const count = t ? t.count : (r ? r.count : (s ? s.count : 0));
    instances = { count, translation: t ? t.array : null, rotation: r ? r.array : null, scale: s ? s.array : null };
  }
  return {
    positions: pos.array,
    normals: nor ? nor.array : null,
    uvs: uv ? uv.array : null,
    indices: idx ? new Uint32Array(idx.array) : null,
    joints: jnt ? jnt.array : null,
    weights: wgt ? wgt.array : null,
    instances,
    material: prim.material != null ? prim.material : null,
    mode: prim.mode == null ? 4 : prim.mode,
  };
}

function parseMaterial(m) {
  const pbr = m.pbrMetallicRoughness || {};
  const base = pbr.baseColorFactor || [1, 1, 1, 1];
  const emis = m.emissiveFactor || [0, 0, 0];
  return {
    name: m.name || null,
    albedo: [base[0], base[1], base[2]],
    alpha: base[3] == null ? 1 : base[3],
    rough: pbr.roughnessFactor == null ? 1 : pbr.roughnessFactor,
    metal: pbr.metallicFactor == null ? 1 : pbr.metallicFactor,
    emissive: [emis[0], emis[1], emis[2]],
    albedoMap: pbr.baseColorTexture ? pbr.baseColorTexture.index : null,
    emissiveMap: m.emissiveTexture ? m.emissiveTexture.index : null,
    normalMap: m.normalTexture ? m.normalTexture.index : null,
    doubleSided: !!m.doubleSided,
  };
}

// skin：joints（节点索引数组）+ inverseBindMatrices（MAT4 accessor → Mat4[]）
// 注意 glTF 矩阵以列主序存储，须转置为本引擎行主序 Mat4
function parseSkin(gltf, buffers, s) {
  const ibm = readAccessor(gltf, buffers, s.inverseBindMatrices);
  const invBinds = [];
  for (let i = 0; i < ibm.count; i++) {
    const src = ibm.array.subarray(i * 16, i * 16 + 16);
    const m = new Array(16);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) m[r * 4 + c] = src[c * 4 + r];
    invBinds.push(new Mat4(m));
  }
  return { joints: s.joints.slice(), inverseBindMatrices: invBinds, skeleton: s.skeleton != null ? s.skeleton : null };
}

function nodeLocal(node) {
  if (node.matrix) return fromGLTFMatrix(node.matrix);
  const t = node.translation || [0, 0, 0];
  const q = node.rotation ? new Quat(node.rotation[0], node.rotation[1], node.rotation[2], node.rotation[3]) : Quat.identity();
  const s = node.scale || [1, 1, 1];
  return Mat4.translation(t[0], t[1], t[2]).mul(Mat4.fromQuat(q)).mul(Mat4.scale(s[0], s[1], s[2]));
}

// 解析已解析 buffers（ArrayBuffer[]）的 glTF JSON
export function loadGLTF(gltf, buffers) {
  const meshes = (gltf.meshes || []).map(m => ({ name: m.name, primitives: (m.primitives || []).map(p => resolvePrimitive(gltf, buffers, p)) }));
  const materials = (gltf.materials || []).map(parseMaterial);
  const textures = (gltf.textures || []).map(tx => ({ source: tx.source != null ? tx.source : null, sampler: tx.sampler != null ? tx.sampler : null }));
  const images = (gltf.images || []).map(im => ({ mimeType: im.mimeType || null, uri: im.uri || null, bufferView: im.bufferView != null ? im.bufferView : null }));
  const animations = (gltf.animations || []).map(a => parseAnimation(gltf, buffers, a));
  const skins = (gltf.skins || []).map(s => parseSkin(gltf, buffers, s));
  const samplers = gltf.samplers;

  const unknownExt = new Set();
  const usedExt = gltf.extensionsUsed;
  for (const ext of (Array.isArray(usedExt) ? usedExt : Object.keys(usedExt || {}))) if (!ALLOWED_EXTENSIONS.has(ext)) unknownExt.add(ext);

  const api = {
    json: gltf, meshes, materials, textures, images, animations, samplers, skins, buffers,
    defaultScene: gltf.scene != null ? gltf.scene : 0,
    unknownExtensions: [...unknownExt],
    sceneNodes(sceneIndex) {
      const si = sceneIndex != null ? sceneIndex : api.defaultScene;
      const out = [];
      const scene = (gltf.scenes || [])[si];
      if (!scene) return out;
      const visit = (idx, parent) => {
        const node = gltf.nodes[idx];
        const local = nodeLocal(node);
        const world = parent ? parent.mul(local) : local;
        out.push({ index: idx, name: node.name || null, node, world, mesh: node.mesh != null ? node.mesh : null, skin: node.skin != null ? node.skin : null });
        for (const ch of node.children || []) visit(ch, world);
      };
      for (const n of scene.nodes) visit(n, null);
      return out;
    },
  };
  return api;
}

function parseAnimation(gltf, buffers, a) {
  // 收集各通道采样：time → value（value 为原始 accessor 读数）
  const samplers = (a.samplers || []).map(s => ({
    input: readAccessorArray(gltf, buffers, s.input),
    output: readAccessorArray(gltf, buffers, s.output),
    interpolation: s.interpolation || 'LINEAR',
  }));
  const channels = (a.channels || []).map(ch => ({ sampler: ch.sampler, target: ch.target.node != null ? ch.target.node : ch.target.id, path: ch.target.path }));
  return { name: a.name || null, samplers, channels };
}
function readAccessorArray(gltf, buffers, i) { return readAccessor(gltf, buffers, i).array; }

// 从 GLB ArrayBuffer 解析（自动抽取 BIN chunk 作为 buffers[0]）
export function parseGLB(arrayBuffer) {
  const dv = new DataView(arrayBuffer);
  if (dv.getUint32(0, true) !== GLB_MAGIC) throw new Error('parseGLB: bad magic');
  const length = dv.getUint32(8, true);
  const chunks = [];
  let off = 12;
  while (off + 8 <= length && off + 8 <= arrayBuffer.byteLength) {
    const clen = dv.getUint32(off, true); const ctype = dv.getUint32(off + 4, true);
    const data = arrayBuffer.slice(off + 8, off + 8 + clen);
    chunks.push({ type: ctype, data });
    off += 8 + clen + ((4 - (clen % 4)) % 4);
  }
  const jsonChunk = chunks.find(c => c.type === CHUNK_JSON);
  const binChunk = chunks.find(c => c.type === CHUNK_BIN);
  const gltf = JSON.parse(new TextDecoder().decode(jsonChunk.data));
  const buffers = [binChunk ? binChunk.data : new ArrayBuffer(0)];
  return loadGLTF(gltf, buffers);
}

// 把 asset_pipeline 风格的 data URI 解码为 ArrayBuffer（用于内嵌 .gltf）
export function decodeDataURI(uri) {
  const m = /^data:([^;]+);base64,(.*)$/.exec(uri);
  if (!m) throw new Error('decodeDataURI: 非 base64 data URI');
  const bin = atob(m[2]);
  const ab = new ArrayBuffer(bin.length);
  const u8 = new Uint8Array(ab);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return ab;
}

// ---- 骨骼动画采样（P3.4）----
// 在给定时间对动画采样，返回 { [nodeIndex]: {t:[x,y,z], r:[x,y,z,w], s:[x,y,z]} }
export function sampleAnimation(doc, animIndex, time) {
  const a = doc.animations[animIndex];
  if (!a) return {};
  const out = {};
  for (const ch of a.channels) {
    const s = a.samplers[ch.sampler];
    const comps = ch.path === 'rotation' ? 4 : 3;
    const v = sampleTrack(s.input, s.output, comps, time, s.interpolation);
    if (!out[ch.target]) out[ch.target] = {};
    if (ch.path === 'translation') out[ch.target].t = v;
    else if (ch.path === 'rotation') out[ch.target].r = v;
    else if (ch.path === 'scale') out[ch.target].s = v;
  }
  return out;
}

function sampleTrack(times, vals, comps, time, interp) {
  const n = times.length;
  if (time <= times[0]) return Array.from(vals.subarray(0, comps));
  if (time >= times[n - 1]) return Array.from(vals.subarray((n - 1) * comps, n * comps));
  let i = 0; while (i < n - 1 && times[i + 1] < time) i++;
  const t0 = times[i], t1 = times[i + 1];
  const f = (time - t0) / Math.max(1e-9, t1 - t0);
  const a = Array.from(vals.subarray(i * comps, i * comps + comps));
  const b = Array.from(vals.subarray((i + 1) * comps, (i + 1) * comps + comps));
  if (interp === 'STEP') return a;
  if (comps === 4) return slerp(a, b, f); // 旋转四元数球面插值
  return a.map((x, k) => x + (b[k] - x) * f);
}

function slerp(a, b, f) {
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let bb = b;
  if (dot < 0) { bb = b.map(x => -x); dot = -dot; }
  if (dot > 0.9995) { const r = a.map((x, k) => x + (bb[k] - x) * f); const L = Math.hypot(r[0], r[1], r[2], r[3]); return r.map(x => x / L); }
  const th = Math.acos(dot), st = Math.sin(th);
  const wa = Math.sin((1 - f) * th) / st, wb = Math.sin(f * th) / st;
  return a.map((x, k) => x * wa + bb[k] * wb);
}

function trsToMat(t, r, s) {
  return Mat4.translation(t[0], t[1], t[2]).mul(Mat4.fromQuat(new Quat(r[0], r[1], r[2], r[3]))).mul(Mat4.scale(s[0], s[1], s[2]));
}

// 计算场景树各节点世界矩阵（动画采样会覆盖对应节点的 TRS）
export function computeWorldMatrices(doc, sceneIndex, sampled) {
  const gltf = doc.json;
  const si = sceneIndex != null ? sceneIndex : doc.defaultScene;
  const scene = (gltf.scenes || [])[si];
  const world = new Array(gltf.nodes.length);
  if (!scene) return world;
  const visit = (idx, parent) => {
    const node = gltf.nodes[idx];
    const sp = sampled ? sampled[idx] : null;
    const base = { t: node.translation || [0, 0, 0], r: node.rotation || [0, 0, 0, 1], s: node.scale || [1, 1, 1] };
    const tt = (sp && sp.t) ? sp.t : base.t;
    const rr = (sp && sp.r) ? sp.r : base.r;
    const ss = (sp && sp.s) ? sp.s : base.s;
    const local = trsToMat(tt, rr, ss);
    const w = parent ? parent.mul(local) : local;
    world[idx] = w;
    for (const ch of node.children || []) visit(ch, w);
  };
  for (const n of scene.nodes) visit(n, null);
  return world;
}

// 计算 skinning 矩阵：jointMatrix[j] = world[joints[j]] * inverseBindMatrices[j]
export function skinMatrices(doc, skinIndex, worldMatrices) {
  const skin = doc.skins[skinIndex];
  return skin.joints.map((j, i) => worldMatrices[j].mul(skin.inverseBindMatrices[i]));
}

// ---- GLTF 实例合批（EXT_mesh_gpu_instancing + 同 mesh 复用）----
// 计算单个图元的每实例局部矩阵（mesh 空间，未乘节点世界）
export function computeInstanceMatrices(prim) {
  const inst = prim.instances;
  if (!inst || inst.count <= 0) return [];
  const mats = [];
  for (let i = 0; i < inst.count; i++) {
    const t = inst.translation ? [inst.translation[i * 3], inst.translation[i * 3 + 1], inst.translation[i * 3 + 2]] : [0, 0, 0];
    const r = inst.rotation ? [inst.rotation[i * 4], inst.rotation[i * 4 + 1], inst.rotation[i * 4 + 2], inst.rotation[i * 4 + 3]] : [0, 0, 0, 1];
    const s = inst.scale ? [inst.scale[i * 3], inst.scale[i * 3 + 1], inst.scale[i * 3 + 2]] : [1, 1, 1];
    mats.push(Mat4.translation(t[0], t[1], t[2]).mul(Mat4.fromQuat(new Quat(r[0], r[1], r[2], r[3]))).mul(Mat4.scale(s[0], s[1], s[2])));
  }
  return mats;
}

// 遍历场景，产出「绘制批」：每个图元一份，matrices 为该批所有实例的世界矩阵
// （GPU 实例化 → 多实例矩阵；普通节点 → 单实例节点世界矩阵）。渲染端据此合批降 draw call。
export function buildInstanceBatches(doc, sceneIndex) {
  const gltf = doc.json;
  const si = sceneIndex != null ? sceneIndex : doc.defaultScene;
  const scene = (gltf.scenes || [])[si];
  const batches = [];
  if (!scene) return batches;
  const visit = (idx, parent) => {
    const node = gltf.nodes[idx];
    const local = nodeLocal(node);
    const world = parent ? parent.mul(local) : local;
    if (node.mesh != null) {
      const resolved = doc.meshes[node.mesh].primitives;
      resolved.forEach((prim, pi) => {
        let matrices;
        if (prim.instances && prim.instances.count > 0) {
          matrices = computeInstanceMatrices(prim).map(m => world.mul(m));
        } else {
          matrices = [world];
        }
        batches.push({ nodeIndex: idx, meshIndex: node.mesh, primIndex: pi, matrices });
      });
    }
    for (const ch of node.children || []) visit(ch, world);
  };
  for (const n of scene.nodes) visit(n, null);
  return batches;
}
