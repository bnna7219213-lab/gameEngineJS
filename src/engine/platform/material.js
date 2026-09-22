// 材质数据块（对标 Blender data.materials）
// 纯数据、零依赖、零 DOM；颜色分量一律 0..1（与 pbr.js 内部线性空间一致）。
// 序列化输出确定性：固定键序、无时间戳。

let NEXT_MATERIAL_ID = 1; // 模块内自增 id

// 材质字段默认值
const DEFAULTS = {
  name: 'material',
  albedo: [1, 1, 1],
  roughness: 0.5,
  metallic: 0,
  emissive: [0, 0, 0],
  alpha: 1,
  albedoMap: null,
  normalMap: null,
  roughnessMap: null,
  metallicMap: null,
  emissiveMap: null,
  occlusionMap: null,
  doubleSided: false,
};

export class Material {
  constructor(name = 'material') {
    this.id = Material.nextId();
    this.name = name;
    // PBR 参数（0..1）
    this.albedo = [...DEFAULTS.albedo];
    this.roughness = DEFAULTS.roughness;
    this.metallic = DEFAULTS.metallic;
    this.emissive = [...DEFAULTS.emissive];
    this.alpha = DEFAULTS.alpha;
    // 贴图槽（纹理资源 id/path，可为 null）
    this.albedoMap = null;
    this.normalMap = null;
    this.roughnessMap = null;
    this.metallicMap = null;
    this.emissiveMap = null;
    this.occlusionMap = null;
    this.doubleSided = false;
  }

  static nextId() {
    return NEXT_MATERIAL_ID++;
  }

  // 确定性序列化：固定键序
  serialize() {
    return {
      id: this.id,
      name: this.name,
      albedo: [...this.albedo],
      roughness: this.roughness,
      metallic: this.metallic,
      emissive: [...this.emissive],
      alpha: this.alpha,
      albedoMap: this.albedoMap,
      normalMap: this.normalMap,
      roughnessMap: this.roughnessMap,
      metallicMap: this.metallicMap,
      emissiveMap: this.emissiveMap,
      occlusionMap: this.occlusionMap,
      doubleSided: !!this.doubleSided,
    };
  }

  // serialize 的逆；缺失字段回退默认值（保证往返相等）
  static deserialize(obj) {
    const m = Object.create(Material.prototype);
    m.id = obj.id ?? Material.nextId();
    m.name = obj.name ?? DEFAULTS.name;
    m.albedo = obj.albedo ? [...obj.albedo] : [...DEFAULTS.albedo];
    m.roughness = obj.roughness ?? DEFAULTS.roughness;
    m.metallic = obj.metallic ?? DEFAULTS.metallic;
    m.emissive = obj.emissive ? [...obj.emissive] : [...DEFAULTS.emissive];
    m.alpha = obj.alpha ?? DEFAULTS.alpha;
    m.albedoMap = obj.albedoMap ?? null;
    m.normalMap = obj.normalMap ?? null;
    m.roughnessMap = obj.roughnessMap ?? null;
    m.metallicMap = obj.metallicMap ?? null;
    m.emissiveMap = obj.emissiveMap ?? null;
    m.occlusionMap = obj.occlusionMap ?? null;
    m.doubleSided = !!obj.doubleSided;
    return m;
  }
}

// 项目级材质表：按 id 存取 + 按名去重查找
export class MaterialLibrary {
  constructor() {
    this.materials = new Map(); // id -> Material
  }

  add(mat) {
    this.materials.set(mat.id, mat);
    return mat.id;
  }

  get(id) {
    return this.materials.get(id) ?? null;
  }

  findByName(name) {
    for (const m of this.materials.values()) {
      if (m.name === name) return m;
    }
    return null;
  }

  remove(id) {
    return this.materials.delete(id);
  }

  // 确定性：按 id 升序输出
  serialize() {
    return [...this.materials.values()]
      .sort((a, b) => a.id - b.id)
      .map((m) => m.serialize());
  }

  static deserialize(arr) {
    const lib = new MaterialLibrary();
    for (const obj of arr ?? []) {
      lib.add(Material.deserialize(obj));
    }
    return lib;
  }
}
