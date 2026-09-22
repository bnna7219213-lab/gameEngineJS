// 网格/场景导出层（v3 M-F / D33）：OBJ + MTL 写出、glTF 2.0（.gltf / .glb）写出、OBJ/MTL 读回，
// 以及「坐标轴 + 单位」显式变换层。本文件是**仅文件 IO** 的纯函数层，不参与渲染热路径。
// 对应 C++ 版 platform 的网格导出分支（见 docs/PORTING.md）。
//
// 关键约定（红线 B：换算来源写明；红线 A：非法输入抛可读错误）：
//   · DOM-free / 零依赖 / Node 22 可 import（红线 C/E）；base64 编码优先 Buffer，缺失时回退 btoa。
//   · 引擎内部为右手系 Y-up 米制（CONTRACT §4）。导出层负责显式轴向/单位换算（D33），
//     轴向矩阵 det>0（纯旋转 × 均匀缩放）→ 手性保持，**不需翻转三角形缠绕**。
//   · 颜色：Material 数据块为 0..1 线性值；components.mesh.albedo/emissive 为 0..255 显示值
//     （与 editor/viewport.js 的 `/255` 约定一致）。glTF baseColorFactor 同为线性 → 直接搬运；
//     MTL 的 Kd/Ke 属显示参考 → 按 Color.toSRGB() 转出。
//   · 旋转单位：引擎渲染路径把 obj.transform.rotation 原样喂给 Mat4.compose（即按**弧度**解释，
//     见 render/viewport3d.js:157）。导出默认 rotationUnit:'rad' 保证「所见即所得」；
//     需要按检视器 UI 语义（度）导出时显式传 'deg'。
import { Mat4, Vec3, Color, DEG2RAD } from '../core/math.js';
import { primitive } from '../render/primitives.js';
import { stableStringify } from '../core/hash.js';

// ============================================================ 1. 坐标 / 单位变换层（D33）
// 预设 = { up 轴, forward, scale }。scale 语义：1 引擎米 = scale 个导出单位。
// forward 字段 = 「引擎前向（−Z）映射到的导出轴方向」，与主流 DCC 的换算一致：
//   Blender/glTF 的既定换算为 (x,y,z)→(x,−z,y)（Blender 导入 glTF 的官方行为），
//   故引擎 −Z 前向 → 导出 +Y；Z-up 系里「+Y 前向」即 Blender 导出选项中的 Y Forward。
export const AXIS_PRESETS = {
  YUP_M:  { id: 'YUP_M',  up: 'Y', forward: '-Z', scale: 1,   label: 'Y-up 米制（引擎内 / glTF 原生）' },
  YUP_CM: { id: 'YUP_CM', up: 'Y', forward: '-Z', scale: 100, label: 'Y-up 厘米' },
  ZUP_M:  { id: 'ZUP_M',  up: 'Z', forward: '+Y', scale: 1,   label: 'Z-up 米制（Blender 原生）' },
  ZUP_CM: { id: 'ZUP_CM', up: 'Z', forward: '+Y', scale: 100, label: 'Z-up 厘米（Blender 单位 cm）' },
};
export const AXIS_PRESET_IDS = Object.keys(AXIS_PRESETS);

export function presetOf(id) {
  const p = AXIS_PRESETS[id];
  if (!p) throw new Error('未知坐标预设: ' + id + '（可选 ' + AXIS_PRESET_IDS.join(' / ') + '）');
  return p;
}

// 3x3 行列式（取 4x4 行主序矩阵的左上角）
export function det3(m) {
  const a = m.m;
  return a[0] * (a[5] * a[10] - a[6] * a[9])
       - a[1] * (a[4] * a[10] - a[6] * a[8])
       + a[2] * (a[4] * a[9] - a[5] * a[8]);
}

// 法线矩阵 = 左上 3x3 的**逆转置**（非均匀缩放下法线不能用原矩阵变换）。
// 推导：曲面法线满足 n·t = 0（t 为切向）；t' = M·t ⇒ 需 n' = (M⁻¹)ᵀ·n。
// 返回长度 9 的行主序数组。
export function normalMatrix3(m) {
  const a = m.m;
  const t = [a[0], a[1], a[2], a[4], a[5], a[6], a[8], a[9], a[10]];
  const d = t[0] * (t[4] * t[8] - t[5] * t[7])
          - t[1] * (t[3] * t[8] - t[5] * t[6])
          + t[2] * (t[3] * t[7] - t[4] * t[6]);
  if (Math.abs(d) < 1e-12) throw new Error('normalMatrix3: 奇异矩阵（det≈0），无法求法线矩阵');
  const C = [
    (t[4] * t[8] - t[5] * t[7]) / d, -(t[3] * t[8] - t[5] * t[6]) / d, (t[3] * t[7] - t[4] * t[6]) / d,
    -(t[1] * t[8] - t[2] * t[7]) / d, (t[0] * t[8] - t[2] * t[6]) / d, -(t[0] * t[7] - t[1] * t[6]) / d,
    (t[1] * t[5] - t[2] * t[4]) / d, -(t[0] * t[5] - t[2] * t[3]) / d, (t[0] * t[4] - t[1] * t[3]) / d,
  ];
  return [C[0], C[3], C[6], C[1], C[4], C[7], C[2], C[5], C[8]]; // 逆转置 = 余子式矩阵的转置
}

// 坐标轴/单位变换矩阵：x'=s·x, y'=−s·z, z'=s·y（Y-up → Z-up）。
// 推导：两系同为右手系，采用 Blender 官方 glTF 换算 (x,y,z)→(x,−z,y)：
//   引擎 +Y（上）→ 导出 +Z ✓（z' = y）；引擎 −Z（前）→ 导出 +Y ✓（y' = −z）；引擎 +X → 导出 +X ✓。
// 行列式 = s³ > 0，手性保持；含镜像时抛错（红线 A），避免静默产生反面几何。
export function axisMatrix(preset) {
  const p = typeof preset === 'string' ? presetOf(preset) : preset;
  if (!p) throw new Error('axisMatrix: 需要预设 id 或预设对象');
  const s = p.scale == null ? 1 : p.scale;
  const m = new Mat4();
  m.m.fill(0);
  if (p.up === 'Z') {
    m.m[0] = s; m.m[6] = -s; m.m[9] = s;   // 行1 [s,0,0] / 行2 [0,0,−s] / 行3 [0,s,0]
  } else {
    m.m[0] = s; m.m[5] = s; m.m[10] = s;   // Y-up：仅单位缩放
  }
  m.m[15] = 1;
  if (!(det3(m) > 0)) throw new Error('axisMatrix: 变换含镜像（det<=0），会破坏三角形缠绕');
  return m;
}

// 用矩阵变换网格（顶点用 M，法线用逆转置后归一化；uv/索引原样拷贝）。
export function convertMesh(mesh, m) {
  if (!mesh || !mesh.positions) throw new Error('convertMesh: 需要含 positions 的网格');
  const nm = normalMatrix3(m);
  const p = mesh.positions, n = mesh.normals;
  const out = new Float32Array(p.length);
  const a = m.m;
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i], y = p[i + 1], z = p[i + 2];
    out[i]     = a[0] * x + a[1] * y + a[2] * z + a[3];
    out[i + 1] = a[4] * x + a[5] * y + a[6] * z + a[7];
    out[i + 2] = a[8] * x + a[9] * y + a[10] * z + a[11];
  }
  let on = null;
  if (n && n.length === p.length) {
    on = new Float32Array(n.length);
    for (let i = 0; i < n.length; i += 3) {
      const x = n[i], y = n[i + 1], z = n[i + 2];
      const nx = nm[0] * x + nm[1] * y + nm[2] * z;
      const ny = nm[3] * x + nm[4] * y + nm[5] * z;
      const nz = nm[6] * x + nm[7] * y + nm[8] * z;
      const l = Math.hypot(nx, ny, nz) || 1;
      on[i] = nx / l; on[i + 1] = ny / l; on[i + 2] = nz / l;
    }
  }
  const idx = mesh.indices ? new Uint32Array(mesh.indices) : new Uint32Array(0);
  return {
    positions: out, normals: on,
    uvs: mesh.uvs ? new Float32Array(mesh.uvs) : null,
    indices: idx, vertexCount: p.length / 3, indexCount: idx.length,
  };
}

// 按预设 id 变换网格（axisConvert(mesh,'ZUP_CM')）。
export function axisConvert(mesh, preset) { return convertMesh(mesh, axisMatrix(preset)); }

// ============================================================ 2. 场景 → 导出项收集
// 网格解析优先级：components.mesh.customGeo（建模结果）→ 修改器栈求值 → 参数化图元。
// 材质解析优先级：project.materialLibrary 中的 Material 数据块（obj.materialId）→
// components.mesh 内联字段（0..255 显示值）→ null（导出为默认材质）。
export function localMatrix(obj, rotationScale = 1) {
  const t = obj.transform || {};
  const p = t.position || [0, 0, 0], r = t.rotation || [0, 0, 0], s = t.scale || [1, 1, 1];
  return Mat4.compose(
    Vec3.of(p[0], p[1], p[2]),
    Vec3.of(r[0] * rotationScale, r[1] * rotationScale, r[2] * rotationScale),
    Vec3.of(s[0], s[1], s[2]),
  );
}

// 世界矩阵（行主序；parent·local 逐级左乘）。父链断裂/自环时抛错（红线 A）。
export function worldMatrixOf(obj, rotationScale = 1) {
  const chain = [];
  const seen = new Set();
  let cur = obj;
  while (cur) {
    if (seen.has(cur.id)) throw new Error('worldMatrixOf: 父链存在环，对象 #' + obj.id);
    seen.add(cur.id);
    chain.push(cur);
    cur = cur.parent || null;
  }
  let m = Mat4.identity();
  for (let i = chain.length - 1; i >= 0; i--) m = m.mul(localMatrix(chain[i], rotationScale));
  return m;
}

// 读取对象的基础渲染网格（不含修改器）
export function baseMeshOf(obj) {
  const mc = (obj.components || {}).mesh;
  if (!mc) return null;
  const cg = mc.customGeo;
  if (cg && cg.positions && cg.indices) {
    const idx = cg.indices instanceof Uint32Array ? cg.indices : new Uint32Array(cg.indices);
    const p = cg.positions instanceof Float32Array ? cg.positions : new Float32Array(cg.positions);
    return {
      positions: p,
      normals: cg.normals ? (cg.normals instanceof Float32Array ? cg.normals : new Float32Array(cg.normals)) : null,
      uvs: cg.uvs ? (cg.uvs instanceof Float32Array ? cg.uvs : new Float32Array(cg.uvs)) : null,
      indices: idx, vertexCount: p.length / 3, indexCount: idx.length,
    };
  }
  return primitive(mc.shape || 'cube');
}

// 材质 → 导出用线性 PBR 参数（0..1）
export function materialOf(obj, materialLibrary = null) {
  const mc = (obj.components || {}).mesh || {};
  const id = obj.materialId != null ? obj.materialId : null;
  if (id != null && materialLibrary) {
    const m = materialLibrary.get ? materialLibrary.get(id) : null;
    if (!m) throw new Error('materialOf: 材质引用失效 id=' + id + '（对象 #' + obj.id + '）');
    return {
      name: m.name || ('material' + m.id),
      albedo: [m.albedo[0], m.albedo[1], m.albedo[2]], alpha: m.alpha == null ? 1 : m.alpha,
      roughness: m.roughness == null ? 0.5 : m.roughness, metallic: m.metallic == null ? 0 : m.metallic,
      emissive: [m.emissive[0], m.emissive[1], m.emissive[2]], doubleSided: !!m.doubleSided,
      source: 'block', maps: { albedoMap: m.albedoMap, normalMap: m.normalMap, emissiveMap: m.emissiveMap },
    };
  }
  if (mc.albedo || mc.rough != null || mc.metal != null) {
    const a = mc.albedo || [200, 200, 200], e = mc.emissive || [0, 0, 0];
    return {
      name: (obj.name || 'obj') + '_mat',
      albedo: [a[0] / 255, a[1] / 255, a[2] / 255], alpha: 1,
      roughness: mc.rough == null ? 0.8 : mc.rough, metallic: mc.metal == null ? 0 : mc.metal,
      emissive: [e[0] / 255, e[1] / 255, e[2] / 255], doubleSided: false,
      source: 'inline', maps: {},
    };
  }
  return null;
}

// 收集场景导出项。opts:
//   materialLibrary   材质表（MaterialLibrary）
//   applyModifiersFn  修改器栈求值函数（对象含修改器时必须注入，否则抛错，红线 A）
//   rotationUnit      'rad'（默认，与渲染路径 Mat4.compose 一致）| 'deg'（按检视器 UI 语义）
// 返回 [{ id, name, mesh, world, local, material, parentId, children }]，顺序按 id 升序（确定性）。
export function collectExportItems(scene, opts = {}) {
  if (!scene) throw new Error('collectExportItems: 需要场景');
  const lib = opts.materialLibrary || null;
  const evalFn = opts.applyModifiersFn || null;
  const unit = opts.rotationUnit || 'rad';
  if (unit !== 'rad' && unit !== 'deg') throw new Error("collectExportItems: rotationUnit 只能是 'rad' 或 'deg'");
  const rs = unit === 'deg' ? DEG2RAD : 1; // 度 → 弧度（Mat4.compose 只接受弧度）
  const items = [];
  const objs = [...scene.objects.values()].sort((a, b) => a.id - b.id);
  for (const o of objs) {
    let mesh = baseMeshOf(o);
    if (!mesh) continue; // 非网格对象（灯光/空物体）不参与几何导出
    const mods = (o.modifiers || []).filter(m => m && m.enabled !== false);
    if (mods.length) {
      if (!evalFn) throw new Error('collectExportItems: 对象 #' + o.id + ' 含修改器栈，需注入 applyModifiersFn');
      mesh = evalFn(mesh, mods);
    }
    items.push({
      id: o.id, name: o.name || ('obj' + o.id), mesh,
      world: worldMatrixOf(o, rs),
      local: localMatrix(o, rs),
      material: materialOf(o, lib),
      parentId: o.parent ? o.parent.id : null,
      children: (o.children || []).slice(),
    });
  }
  return items;
}

// ============================================================ 3. 网格归一化
// 索引组件类型选择：顶点数 ≤ 65535 用 UNSIGNED_SHORT(5123)，否则 UNSIGNED_INT(5125)。
// 依据 glTF 2.0 规范（indices accessor 允许 5121/5123/5125，常用 5123/5125）；
// 上限 65535 = 2^16−1（u16 可表示的最大索引值）。
export const GLTF_INDEX_LIMIT = 65535;
export function indexComponentType(vertexCount) {
  return vertexCount <= GLTF_INDEX_LIMIT ? 5123 : 5125;
}

// 把任意来源（GLTF 解析结果 / customGeo / 手写对象）的网格补齐 vertexCount/indexCount 与类型，
// 使 meshHash 可直接比较（导出→读回一致性断言依赖此函数）。
export function normalizeMesh(mesh) {
  if (!mesh || !mesh.positions) throw new Error('normalizeMesh: 需要含 positions 的网格');
  const positions = mesh.positions instanceof Float32Array ? mesh.positions : new Float32Array(mesh.positions);
  const indices = mesh.indices == null ? new Uint32Array(0)
    : (mesh.indices instanceof Uint32Array ? mesh.indices : new Uint32Array(mesh.indices));
  const normals = mesh.normals == null ? null
    : (mesh.normals instanceof Float32Array ? mesh.normals : new Float32Array(mesh.normals));
  const uvs = mesh.uvs == null ? null : (mesh.uvs instanceof Float32Array ? mesh.uvs : new Float32Array(mesh.uvs));
  return { positions, normals, uvs, indices, vertexCount: positions.length / 3, indexCount: indices.length };
}

// 数值格式化：String() 给出 float64 的最短往返表示；值来自 Float32Array 时解析回 float32 逐位一致。
// 仅做两处规范化：-0 → 0（避免 "-0" 歧义）、非有限值抛错（红线 A：不写坏文件）。
function _f(x) {
  if (!Number.isFinite(x)) throw new Error('导出数值非有限: ' + x);
  return Object.is(x, -0) ? '0' : String(x);
}

// sRGB 显示值 → 线性（Color.toLinear 的数组版，写回材质数据块用）
function lin3(c) {
  const l = new Color(c[0], c[1], c[2], 1).toLinear();
  return [l.r, l.g, l.b];
}

// ============================================================ 4. OBJ / MTL 写出
// MTL 的 Kd/Ke 属显示参考（渲染器按 sRGB 解释），故从线性 albedo 经 Color.toSRGB() 转出。
function srgb3(linear) {
  const c = new Color(linear[0], linear[1], linear[2], 1).toSRGB();
  return [c.r, c.g, c.b];
}

// 生成 MTL 文本。materials: [{name, albedo(线性), emissive(线性), alpha, roughness, metallic}]
export function writeMTL(materials, { header = '# engine_tensorflow+js MTL (v3 M-F)' } = {}) {
  const lines = [header];
  for (const m of materials || []) {
    const kd = srgb3(m.albedo || [1, 1, 1]);
    const ke = srgb3(m.emissive || [0, 0, 0]);
    lines.push('newmtl ' + m.name);
    lines.push('Kd ' + kd.map(_f).join(' '));
    lines.push('Ke ' + ke.map(_f).join(' '));
    lines.push('Ka 0 0 0');
    // Ns = Blinn-Phong 高光指数：由粗糙度线性映射 Ns = 2/roughness² − 2（粗糙→低指数），
    // 上限 1000（MTL 惯例）。该式为导出侧近似，仅供不支持 PBR 扩展的读入器参考。
    const r = Math.max(0.04, Math.min(1, m.roughness == null ? 0.5 : m.roughness));
    const ns = Math.max(0, Math.min(1000, 2 / (r * r) - 2));
    lines.push('Ns ' + _f(Math.round(ns)));
    lines.push('d ' + _f(m.alpha == null ? 1 : m.alpha));
    // Pr/Pm 为 PBR 扩展（非官方，但 Blender/部分工具可读），保留原始线性值
    lines.push('Pr ' + _f(m.roughness == null ? 0.5 : m.roughness));
    lines.push('Pm ' + _f(m.metallic == null ? 0 : m.metallic));
    lines.push('');
  }
  return lines.join('\n');
}

// 写出 OBJ。opts:
//   axis     坐标/单位预设 id（默认 'YUP_M' 引擎原生）
//   mtlName  mtllib 行引用的 .mtl 文件名（null 则不写 mtllib）
// 顶点/法线/uv 全局序号按「项顺序 × 项内网格顶点顺序」推进，1-based；三角形保持原索引顺序。
export function writeOBJ(items, opts = {}) {
  const axis = opts.axis || 'YUP_M';
  const A = axisMatrix(axis);
  const lines = ['# engine_tensorflow+js OBJ (v3 M-F)',
    '# axis=' + axis + ' up=' + presetOf(axis).up + ' scale=' + presetOf(axis).scale,
    '# 顶点/法线/UV 已按对象世界矩阵烘焙（engine: Y-up 米制）'];
  if (opts.mtlName) lines.push('mtllib ' + opts.mtlName);

  const mats = [];
  const seenMat = new Set();
  let vBase = 1, nBase = 1, tBase = 1;
  const faceBlocks = [];

  for (const it of items) {
    const m = normalizeMesh(it.mesh);
    const M = A.mul(it.world);        // 顶点：M = A · world（先对象世界变换，再坐标轴/单位变换）
    const nm = normalMatrix3(M);
    const a = M.m;
    lines.push('o ' + it.name);
    if (it.material && !seenMat.has(it.material.name)) {
      seenMat.add(it.material.name);
      mats.push(it.material);
    }
    const p = m.positions;
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i], y = p[i + 1], z = p[i + 2];
      lines.push('v ' + _f(a[0] * x + a[1] * y + a[2] * z + a[3]) + ' '
        + _f(a[4] * x + a[5] * y + a[6] * z + a[7]) + ' '
        + _f(a[8] * x + a[9] * y + a[10] * z + a[11]));
    }
    const hasN = !!(m.normals && m.normals.length === p.length);
    if (hasN) {
      for (let i = 0; i < p.length; i += 3) {
        const x = m.normals[i], y = m.normals[i + 1], z = m.normals[i + 2];
        const nx = nm[0] * x + nm[1] * y + nm[2] * z;
        const ny = nm[3] * x + nm[4] * y + nm[5] * z;
        const nz = nm[6] * x + nm[7] * y + nm[8] * z;
        const l = Math.hypot(nx, ny, nz) || 1;
        lines.push('vn ' + _f(nx / l) + ' ' + _f(ny / l) + ' ' + _f(nz / l));
      }
    }
    const hasU = !!(m.uvs && m.uvs.length === m.vertexCount * 2);
    if (hasU) {
      for (let i = 0; i < m.uvs.length; i += 2) lines.push('vt ' + _f(m.uvs[i]) + ' ' + _f(m.uvs[i + 1]));
    }
    // 面块（材质行 + f 行）暂存，保证 o/v/vn/vt 分组不被 usemtl 打断
    const fb = [];
    if (it.material) fb.push('usemtl ' + it.material.name);
    const idx = m.indices;
    for (let i = 0; i + 2 < idx.length; i += 3) {
      const f = [];
      for (let k = 0; k < 3; k++) {
        const slot = idx[i + k];
        let s = String(slot + vBase);
        if (hasU || hasN) s += '/' + (hasU ? String(slot + tBase) : '');
        if (hasN) s += '/' + String(slot + nBase);
        f.push(s);
      }
      fb.push('f ' + f.join(' '));
    }
    faceBlocks.push(fb.join('\n'));
    vBase += m.vertexCount;
    if (hasN) nBase += m.vertexCount;
    if (hasU) tBase += m.vertexCount;
  }
  lines.push(...faceBlocks);
  return { obj: lines.join('\n') + '\n', mtl: mats.length ? writeMTL(mats) : null, materials: mats };
}

// ============================================================ 5. OBJ / MTL 读回
// 与 asset_pipeline.parseOBJ 的差异：按文件 `v`/`vn`/`vt` 行顺序编号（不 weld、不按面展开），
// 因此「本模块写出 → 本模块读回」可逐位还原顶点/uv/法线数组（导出往返断言的前提）。
// 两遍解析：先收集 v/vn/vt 与面，再按文件顶点顺序装配输出（面索引 = v 序号，1:1）。
// 已知语义边界：同一 v 序号被多个 (vt,vn) 组合引用时，只取首个组合的属性
// （引擎网格为「顶点 SoA + 独立 uv/normal 数组」，无法表达 OBJ 的逐角点属性差异）。
export function parseOBJMesh(text) {
  const v = [], vn = [], vt = [];
  const faces = [];         // [{ corners:[[vi,ti,ni],...], group }]
  const groups = [];        // [{ name, start, count, material }]
  let curGroup = null;
  const resolve = (len, rawIdx) => { const n = parseInt(rawIdx, 10); return n < 0 ? len + n : n - 1; }; // OBJ 1-based，负数自尾计
  for (const raw of String(text).split('\n')) {
    const line = raw.trim();
    if (!line || line[0] === '#') continue;
    const sp = line.split(/\s+/);
    switch (sp[0]) {
      case 'v': v.push([+sp[1], +sp[2], +sp[3]]); break;
      case 'vn': vn.push([+sp[1], +sp[2], +sp[3]]); break;
      case 'vt': vt.push([+sp[1], +sp[2]]); break;
      case 'o': case 'g':
        curGroup = { name: sp.slice(1).join(' ') || sp[0], start: 0, count: 0, material: null };
        groups.push(curGroup);
        break;
      case 'usemtl': if (curGroup) curGroup.material = sp.slice(1).join(' '); break;
      case 'f': {
        const corners = [];
        for (let i = 1; i < sp.length; i++) {
          const parts = sp[i].split('/');
          const vi = resolve(v.length, parts[0]);
          if (!v[vi]) throw new Error('parseOBJMesh: 面引用了不存在的顶点 ' + parts[0]);
          const ti = parts[1] ? resolve(vt.length, parts[1]) : -1;
          const ni = parts[2] ? resolve(vn.length, parts[2]) : -1;
          if (ti >= 0 && !vt[ti]) throw new Error('parseOBJMesh: 面引用了不存在的 UV ' + parts[1]);
          if (ni >= 0 && !vn[ni]) throw new Error('parseOBJMesh: 面引用了不存在的法线 ' + parts[2]);
          corners.push([vi, ti, ni]);
        }
        faces.push({ corners, group: curGroup });
        break;
      }
      default: break; // mtllib / s / 未知行：忽略（结构性错误已在上面显式抛出）
    }
  }
  if (!faces.length || !v.length) throw new Error('parseOBJMesh: 文件无有效 v/f 数据');

  // 第二遍：输出顶点槽位 = 文件 v 序号；uv/normal 取首个引用它的角点组合
  const uvOf = new Array(v.length).fill(null);
  const nOf = new Array(v.length).fill(null);
  for (const f of faces) for (const [vi, ti, ni] of f.corners) {
    if (uvOf[vi] == null && ti >= 0) uvOf[vi] = vt[ti];
    if (nOf[vi] == null && ni >= 0) nOf[vi] = vn[ni];
  }
  const used = new Array(v.length).fill(false);
  const indices = [];
  for (const f of faces) {
    const cs = f.corners;
    for (const [vi] of cs) used[vi] = true;
    if (f.group) f.group.count += Math.max(0, cs.length - 2) * 3;
    for (let i = 1; i + 1 < cs.length; i++) indices.push(cs[0][0], cs[i][0], cs[i + 1][0]); // n-gon 扇形三角化
  }
  const outP = [], outT = [], outN = [];
  for (let i = 0; i < v.length; i++) {
    if (!used[i]) continue; // 未被任何面引用的孤立 v 行不进入渲染网格
    outP.push(v[i][0], v[i][1], v[i][2]);
    outT.push(uvOf[i] ? uvOf[i][0] : 0, uvOf[i] ? uvOf[i][1] : 0);
    outN.push(nOf[i] ? nOf[i][0] : 0, nOf[i] ? nOf[i][1] : 0, nOf[i] ? nOf[i][2] : 1);
  }
  return {
    positions: new Float32Array(outP), normals: new Float32Array(outN), uvs: new Float32Array(outT),
    indices: new Uint32Array(indices), vertexCount: outP.length / 3, indexCount: indices.length,
    groups, materials: [...new Set(groups.map(g => g.material).filter(Boolean))],
  };
}

// 解析 MTL（Kd/Ke 为 sRGB 显示值 → 线性；Pr/Pm 为线性 PBR）
export function parseMTL(text) {
  const out = []; let cur = null;
  for (const raw of String(text).split('\n')) {
    const line = raw.trim();
    if (!line || line[0] === '#') continue;
    const sp = line.split(/\s+/);
    if (sp[0] === 'newmtl') {
      cur = { name: sp.slice(1).join(' '), albedo: [1, 1, 1], emissive: [0, 0, 0], alpha: 1, roughness: 0.5, metallic: 0 };
      out.push(cur); continue;
    }
    if (!cur) continue;
    if (sp[0] === 'Kd') cur.albedo = lin3([+sp[1], +sp[2], +sp[3]]);
    else if (sp[0] === 'Ke') cur.emissive = lin3([+sp[1], +sp[2], +sp[3]]);
    else if (sp[0] === 'd') cur.alpha = +sp[1];
    else if (sp[0] === 'Pr') cur.roughness = +sp[1];
    else if (sp[0] === 'Pm') cur.metallic = +sp[1];
  }
  return out;
}

// ============================================================ 6. glTF 2.0 写出（.gltf JSON + .glb 二进制）
const GLB_MAGIC = 0x46546C67, CHUNK_JSON = 0x4E4F534A, CHUNK_BIN = 0x004E4942;
const COMP_COUNT = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

// base64：Node 优先 Buffer，浏览器回退 btoa（零依赖，红线 C）
function _toBase64(u8) {
  if (typeof Buffer !== 'undefined' && Buffer.from) return Buffer.from(u8).toString('base64');
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
}

// 字节对齐补齐（4 字节；JSON chunk 用 0x20 空格，BIN chunk 用 0x00）
function pad4(u8, fill) {
  const p = (4 - (u8.length % 4)) % 4;
  if (!p) return u8;
  const out = new Uint8Array(u8.length + p);
  out.set(u8); if (fill) out.fill(fill, u8.length);
  return out;
}

// 紧凑 glTF 结构：accessor/bufferView 按写入顺序收集（确定性输出）。
class GltfBuilder {
  constructor() {
    this.json = {
      asset: { version: '2.0', generator: 'engine_tensorflow+js v3 (M-F)' },
      scene: 0, scenes: [{ nodes: [] }], nodes: [], meshes: [], materials: [],
      accessors: [], bufferViews: [], buffers: [],
    };
    this.bin = [];      // Uint8Array 段
    this.binLen = 0;
    this._matKey = new Map();
  }
  _align() { const p = (4 - (this.binLen % 4)) % 4; if (p) { this.bin.push(new Uint8Array(p)); this.binLen += p; } }
  _addView(u8, target) {
    this._align();
    const off = this.binLen;
    this.bin.push(u8); this.binLen += u8.length;
    const bv = { buffer: 0, byteOffset: off, byteLength: u8.length };
    if (target) bv.target = target;
    this.json.bufferViews.push(bv);
    return this.json.bufferViews.length - 1;
  }
  // 数值 accessor：data 为 Float32Array/Uint32Array/Uint16Array；type 为 VEC3/VEC2/SCALAR
  addAccessor(data, type, componentType, { min = null, max = null, target = null } = {}) {
    const bv = this._addView(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), target);
    const acc = { bufferView: bv, componentType, count: data.length / COMP_COUNT[type], type };
    if (min) acc.min = min;
    if (max) acc.max = max;
    this.json.accessors.push(acc);
    return this.json.accessors.length - 1;
  }
  // 材质：按「线性 PBR 参数」去重，返回索引（同参数材质只落一份，D28 的去重语义）
  addMaterial(mat) {
    if (!mat) {
      if (!this._matKey.has('__default__')) {
        this._matKey.set('__default__', 0);
        this.json.materials.push({ name: 'default', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.8 } });
      }
      return this._matKey.get('__default__');
    }
    const key = stableStringify({ n: mat.name, a: mat.albedo, al: mat.alpha, r: mat.roughness, m: mat.metallic, e: mat.emissive, d: !!mat.doubleSided });
    if (this._matKey.has(key)) return this._matKey.get(key);
    const j = {
      name: mat.name,
      pbrMetallicRoughness: {
        baseColorFactor: [mat.albedo[0], mat.albedo[1], mat.albedo[2], mat.alpha == null ? 1 : mat.alpha],
        metallicFactor: mat.metallic == null ? 0 : mat.metallic,
        roughnessFactor: mat.roughness == null ? 0.5 : mat.roughness,
      },
      emissiveFactor: [mat.emissive[0], mat.emissive[1], mat.emissive[2]],
    };
    if (mat.doubleSided) j.doubleSided = true;
    this.json.materials.push(j);
    const idx = this.json.materials.length - 1;
    this._matKey.set(key, idx);
    return idx;
  }
  // 网格：positions/normals/uvs 均为 Float32；索引按最大顶点数选 u16/u32。
  // glTF 规定 u16 索引 accessor 的字节偏移须 4 字节对齐 → 走 u16 时显式补齐。
  addMesh(name, mesh, materialIndex) {
    const m = normalizeMesh(mesh);
    const pos = m.positions;
    if (pos.length % 3 !== 0) throw new Error('addMesh: positions 长度非 3 的倍数');
    const idxArr = (m.indices && m.indices.length)
      ? (indexComponentType(m.vertexCount) === 5123 ? new Uint16Array(m.indices) : new Uint32Array(m.indices))
      : null;
    const ct = idxArr ? indexComponentType(m.vertexCount) : null;
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) {
      const x = pos[i + k]; if (x < min[k]) min[k] = x; if (x > max[k]) max[k] = x;
    }
    const attrs = { POSITION: this.addAccessor(pos, 'VEC3', 5126, { min, max, target: 34962 }) };
    if (m.normals && m.normals.length === pos.length) attrs.NORMAL = this.addAccessor(m.normals, 'VEC3', 5126, { target: 34962 });
    if (m.uvs && m.uvs.length === m.vertexCount * 2) attrs.TEXCOORD_0 = this.addAccessor(m.uvs, 'VEC2', 5126, { target: 34962 });
    const prim = { attributes: attrs, mode: 4 };
    if (idxArr) {
      if (ct === 5123) { const need = this.binLen % 4; if (need) { this.bin.push(new Uint8Array(4 - need)); this.binLen += 4 - need; } }
      prim.indices = this.addAccessor(idxArr, 'SCALAR', ct, { target: 34963 });
    }
    if (materialIndex != null) prim.material = materialIndex;
    this.json.meshes.push({ name: name || 'mesh', primitives: [prim] });
    return this.json.meshes.length - 1;
  }
  // 节点：T 直接取世界平移；R/S 由 world 矩阵分解（见 decomposeWorld 推导）
  addNode(name, world, { mesh = null, children = [] } = {}) {
    const { t, r, s } = decomposeWorld(world);
    const node = { name, translation: t, rotation: r, scale: s };
    if (mesh != null) node.mesh = mesh;
    if (children.length) node.children = children;
    this.json.nodes.push(node);
    return this.json.nodes.length - 1;
  }
  // 组装 .gltf（内嵌 base64 buffer，单文件可直读）
  toGLTF() {
    const bin = this._binBytes();
    const j = JSON.parse(JSON.stringify(this.json));
    j.buffers = [{ byteLength: bin.length, uri: 'data:application/octet-stream;base64,' + _toBase64(bin) }];
    return JSON.stringify(j, null, 2);
  }
  // 组装 .glb（12 字节头 + JSON chunk + BIN chunk，各 chunk 4 字节对齐）
  toGLB() {
    const bin = this._binBytes();
    const j = JSON.parse(JSON.stringify(this.json));
    j.buffers = [{ byteLength: bin.length }];
    const jc = pad4(new TextEncoder().encode(JSON.stringify(j)), 0x20);
    const bc = pad4(bin, 0x00);
    const total = 12 + 8 + jc.length + 8 + bc.length;
    const ab = new ArrayBuffer(total); const dv = new DataView(ab);
    dv.setUint32(0, GLB_MAGIC, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
    let off = 12;
    dv.setUint32(off, jc.length, true); dv.setUint32(off + 4, CHUNK_JSON, true);
    new Uint8Array(ab, off + 8, jc.length).set(jc); off += 8 + jc.length;
    dv.setUint32(off, bc.length, true); dv.setUint32(off + 4, CHUNK_BIN, true);
    new Uint8Array(ab, off + 8, bc.length).set(bc);
    return ab;
  }
  _binBytes() {
    const out = new Uint8Array(this.binLen);
    let o = 0;
    for (const seg of this.bin) { out.set(seg, o); o += seg.length; }
    return out;
  }
}

// 由世界矩阵提取 TRS（引擎为「T·R·S」分解，见 CONTRACT §4）：
//   平移 = m[3],m[7],m[11]（第 4 列，行主序）。
//   设 R 为旋转矩阵、S = diag(sx,sy,sz)，则 M₃ₓ₃ = R·S ⇒ 第 j 列 = R 第 j 列 × s_j
//   ⇒ s_j = ‖M 第 j 列‖，R 第 j 列 = M 第 j 列 / s_j。
//   再由 R 反解四元数用标准 Shepperd 分支（取最大对角元分支，数值稳定）。
// 含镜像（det<0）时抛错：glTF 不支持负缩放节点（红线 A：不静默产出错误几何）。
export function decomposeWorld(m) {
  const a = m.m;
  const t = [a[3], a[7], a[11]];
  const cols = [[a[0], a[4], a[8]], [a[1], a[5], a[9]], [a[2], a[6], a[10]]];
  const s = cols.map(c => Math.hypot(c[0], c[1], c[2]));
  if (s.some(x => !(x > 1e-12))) throw new Error('decomposeWorld: 存在零缩放轴，无法分解 TRS');
  const c0 = cols[0].map(x => x / s[0]), c1 = cols[1].map(x => x / s[1]), c2 = cols[2].map(x => x / s[2]);
  const R = [c0[0], c1[0], c2[0], c0[1], c1[1], c2[1], c0[2], c1[2], c2[2]]; // 行主序旋转矩阵
  const det = R[0] * (R[4] * R[8] - R[5] * R[7]) - R[1] * (R[3] * R[8] - R[5] * R[6]) + R[2] * (R[3] * R[7] - R[4] * R[6]);
  if (det < 0) throw new Error('decomposeWorld: 世界矩阵含镜像（det<0），glTF 无法表示负缩放');
  const tr = R[0] + R[4] + R[8];
  let q;
  if (tr > 0) {
    const S = Math.sqrt(tr + 1) * 2;
    q = [(R[7] - R[5]) / S, (R[2] - R[6]) / S, (R[3] - R[1]) / S, S / 4];
  } else if (R[0] > R[4] && R[0] > R[8]) {
    const S = Math.sqrt(1 + R[0] - R[4] - R[8]) * 2;
    q = [S / 4, (R[1] + R[3]) / S, (R[2] + R[6]) / S, (R[7] - R[5]) / S];
  } else if (R[4] > R[8]) {
    const S = Math.sqrt(1 + R[4] - R[0] - R[8]) * 2;
    q = [(R[1] + R[3]) / S, S / 4, (R[5] + R[7]) / S, (R[2] - R[6]) / S];
  } else {
    const S = Math.sqrt(1 + R[8] - R[0] - R[4]) * 2;
    q = [(R[2] + R[6]) / S, (R[5] + R[7]) / S, S / 4, (R[3] - R[1]) / S];
  }
  const ql = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return { t, r: [q[0] / ql, q[1] / ql, q[2] / ql, q[3] / ql], s };
}

// 写出 glTF 场景。opts:
//   axis       坐标/单位预设（默认 'ZUP_M'：glTF 生态中 Blender 等 DCC 期望 Z-up 米制）
//   binary     true → 返回 { glb: ArrayBuffer }；false → { gltf: string }
//   itemFilter (item) => boolean，默认全部导出
// 节点变换约定（推导）：glTF 场景图与引擎同为「T·R·S + parent·local」。设 A 为轴向/单位矩阵，
//   目标世界 W' = A·W = A·(P·L) = (A·P)·L
//   ⇒ **仅在根节点施加 A**（根节点写 A·world），子节点保持自身局部 TRS 不变即可。
// 父节点不在导出集内（被过滤/非网格对象）时该子节点上提为根，此时同样写 A·world，
// 保证其最终世界变换与「A·原世界」逐位一致，不丢层级语义。
export function writeGLTF(items, opts = {}) {
  const axis = opts.axis || 'ZUP_M';
  const A = axisMatrix(axis);
  const b = new GltfBuilder();
  const list = opts.itemFilter ? items.filter(opts.itemFilter) : items;
  const inSet = new Set(list.map(x => x.id));
  const nodeOf = new Map();
  const nodeIdx = [];
  for (const it of list) {
    const isRoot = it.parentId == null || !inSet.has(it.parentId);
    const L = isRoot ? A.mul(it.world) : it.local;
    const mi = b.addMesh(it.name, it.mesh, b.addMaterial(it.material));
    nodeIdx.push(b.addNode(it.name, L, { mesh: mi }));
    nodeOf.set(it.id, nodeIdx[nodeIdx.length - 1]);
  }
  // 父子关系：先收集再落盘，保证 children 数组只在非空时写入（glTF 允许省略空数组）
  const kids = new Map();
  for (let k = 0; k < list.length; k++) {
    const pid = list[k].parentId;
    if (pid != null && nodeOf.has(pid)) {
      const pi = nodeOf.get(pid);
      if (!kids.has(pi)) kids.set(pi, []);
      kids.get(pi).push(nodeIdx[k]);
    } else {
      b.json.scenes[0].nodes.push(nodeIdx[k]);
    }
  }
  for (const [pi, cs] of kids) b.json.nodes[pi].children = cs;
  const out = { axis, nodeCount: nodeIdx.length, meshCount: b.json.meshes.length, materialCount: b.json.materials.length };
  if (opts.binary) return { ...out, glb: b.toGLB() };
  return { ...out, gltf: b.toGLTF() };
}

// ============================================================ 7. 场景级便捷导出（GUI / 脚本共用入口）
// exportScene(scene, { format, axis, materialLibrary, applyModifiersFn, rotationUnit, name, binary })
// 返回 { format, axis, files: [{name, text|bytes}], stats }，files 可直接交给下载/写盘层。
// 红线 A：未知格式抛可读错误；含修改器但未注入求值函数时抛错而非静默丢修改器。
export function exportScene(scene, opts = {}) {
  const format = opts.format || 'glb';
  const name = opts.name || scene.name || 'scene';
  const axis = opts.axis || (format === 'obj' ? 'YUP_M' : 'ZUP_M');
  const items = collectExportItems(scene, {
    materialLibrary: opts.materialLibrary || null,
    applyModifiersFn: opts.applyModifiersFn || null,
    rotationUnit: opts.rotationUnit || 'rad',
  });
  const stats = {
    objects: items.length,
    vertices: items.reduce((s, it) => s + it.mesh.vertexCount, 0),
    triangles: items.reduce((s, it) => s + Math.floor(it.mesh.indexCount / 3), 0),
    materials: new Set(items.map(it => it.material && it.material.name).filter(Boolean)).size,
  };
  switch (format) {
    case 'obj': {
      const r = writeOBJ(items, { axis, mtlName: r2(opts.mtlName, name + '.mtl') });
      const files = [{ name: name + '.obj', text: r.obj }];
      if (r.mtl) files.push({ name: r2(opts.mtlName, name + '.mtl'), text: r.mtl });
      return { format, axis, files, stats };
    }
    case 'gltf': {
      const r = writeGLTF(items, { axis, binary: false });
      return { format, axis, files: [{ name: name + '.gltf', text: r.gltf }], stats: { ...stats, nodes: r.nodeCount } };
    }
    case 'glb': {
      const r = writeGLTF(items, { axis, binary: true });
      return { format, axis, files: [{ name: name + '.glb', bytes: r.glb }], stats: { ...stats, nodes: r.nodeCount } };
    }
    default:
      throw new Error('exportScene: 未知导出格式 ' + format + "（可选 'obj' / 'gltf' / 'glb'）");
  }
}
function r2(v, d) { return v == null ? d : v; }
