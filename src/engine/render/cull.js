// 视锥剔除 + LOD 选择（P4 参考核心，CPU 侧，与后端无关）。
// FrustumCuller 决定哪些对象可见 + 每个可见对象选哪级 LOD；
// 两后端共用同一结果（红线 D：Software 与 WebGL2 的剔除/LOD 计数必须一致）。
import { Vec3 } from '../core/math.js';

// 按距离阈值选 LOD 等级：thresholds 升序（如 [20, 50] → 0:<20, 1:20~50, 2:>50）
export function selectLOD(distance, thresholds) {
  if (!thresholds || thresholds.length === 0) return 0;
  let lod = 0;
  for (let i = 0; i < thresholds.length; i++) {
    if (distance >= thresholds[i]) lod = i + 1; else break;
  }
  return lod;
}

function aabbCenter(b) {
  return new Vec3((b.min.x + b.max.x) * 0.5, (b.min.y + b.max.y) * 0.5, (b.min.z + b.max.z) * 0.5);
}

export class FrustumCuller {
  constructor(frustum, cameraPos = null) {
    this.frustum = frustum;
    this.cameraPos = cameraPos; // Vec3，用于 LOD 距离估算
  }
  // objects: [{ aabb?, lodThresholds?, lodHint? }]
  // 返回 [{ object, visible, lod }]（保持输入顺序）
  cull(objects) {
    const out = [];
    for (const o of objects) {
      if (!o.aabb) { out.push({ object: o, visible: true, lod: 0 }); continue; }
      if (this.frustum.intersects(o.aabb)) {
        let d = 0;
        if (o.lodDistance != null) d = o.lodDistance;
        else if (this.cameraPos) {
          const c = aabbCenter(o.aabb);
          d = Math.hypot(c.x - this.cameraPos.x, c.y - this.cameraPos.y, c.z - this.cameraPos.z);
        }
        out.push({ object: o, visible: true, lod: selectLOD(d, o.lodThresholds) });
      } else {
        out.push({ object: o, visible: false, lod: 0 });
      }
    }
    return out;
  }
  visible(objects) {
    return this.cull(objects).filter(r => r.visible).map(r => r.object);
  }
  // 仅返回可见对象的 { object, lod } 列表（渲染提交用）
  visibleWithLOD(objects) {
    return this.cull(objects).filter(r => r.visible);
  }
}
