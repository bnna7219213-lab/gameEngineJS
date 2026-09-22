// 世界环境数据块（对标 Blender scene.world）
// 纯数据、零依赖、零 DOM；颜色分量一律 0..1。
// 序列化输出确定性：固定键序、无时间戳；deserialize 是 serialize 的逆。

// 默认天空
const DEFAULT_SKY = {
  type: 'gradient',
  top: [0.15, 0.25, 0.45],
  bottom: [0.02, 0.02, 0.03],
  intensity: 1,
};
const DEFAULT_AMBIENT = [0.04, 0.05, 0.07];
const DEFAULT_SUN_DIR = [0.5, -1, 0.35];

function cloneColor(c) {
  return c ? [...c] : null;
}

// fog / ibl 深拷贝（null 安全）
function cloneFog(fog) {
  if (!fog) return null;
  const out = { type: fog.type, color: [...fog.color] };
  if (fog.type === 'exp') {
    out.density = fog.density;
  } else {
    out.near = fog.near;
    out.far = fog.far;
  }
  return out;
}

function cloneIbl(ibl) {
  if (!ibl) return null;
  return {
    sh: Array.from(ibl.sh), // 序列化为普通数组（确定性 JSON）
    avg: [...ibl.avg],
    intensity: ibl.intensity,
  };
}

export class World {
  constructor() {
    this.ambient = [...DEFAULT_AMBIENT]; // 环境光 0..1
    this.fog = null; // null | {type:'exp',density,color} | {type:'linear',near,far,color}
    this.sky = {
      type: DEFAULT_SKY.type,
      top: [...DEFAULT_SKY.top],
      bottom: [...DEFAULT_SKY.bottom],
      intensity: DEFAULT_SKY.intensity,
    };
    this.ibl = null; // null | {sh:27, avg:[3], intensity}
    this.sunDir = [...DEFAULT_SUN_DIR];
  }

  // 合理默认：弱环境光、无雾、渐变天空
  static default() {
    return new World();
  }

  // 确定性序列化：固定键序
  serialize() {
    return {
      ambient: [...this.ambient],
      fog: cloneFog(this.fog),
      sky: {
        type: this.sky.type,
        top: [...this.sky.top],
        bottom: [...this.sky.bottom],
        intensity: this.sky.intensity,
      },
      ibl: cloneIbl(this.ibl),
      sunDir: [...this.sunDir],
    };
  }

  static deserialize(obj) {
    const w = new World();
    if (obj.ambient) w.ambient = [...obj.ambient];
    w.fog = cloneFog(obj.fog);
    if (obj.sky) {
      w.sky = {
        type: obj.sky.type ?? DEFAULT_SKY.type,
        top: obj.sky.top ? [...obj.sky.top] : [...DEFAULT_SKY.top],
        bottom: obj.sky.bottom ? [...obj.sky.bottom] : [...DEFAULT_SKY.bottom],
        intensity: obj.sky.intensity ?? DEFAULT_SKY.intensity,
      };
    }
    w.ibl = cloneIbl(obj.ibl);
    if (obj.sunDir) w.sunDir = [...obj.sunDir];
    return w;
  }
}
