// 只读水合：把 Scene3D 合成为渲染项（含层级世界变换）。红线 F：绝不反向改写 Scene3D。
import { Mat4, Vec3 } from '../core/math.js';

const tv = (v) => (v == null) ? [0, 0, 0] : (v.x !== undefined ? [v.x, v.y, v.z] : [v[0], v[1], v[2]]);

export function hydrate(scene3d) {
  const byId = new Map();
  for (const o of scene3d.objects.values()) byId.set(o.id, o);
  const cache = new Map();
  const worldOf = (o) => {
    if (cache.has(o.id)) return cache.get(o.id);
    let m = Mat4.compose(
      Vec3.of(tv(o.transform.position)[0], tv(o.transform.position)[1], tv(o.transform.position)[2]),
      Vec3.of(tv(o.transform.rotation)[0], tv(o.transform.rotation)[1], tv(o.transform.rotation)[2]),
      Vec3.of(tv(o.transform.scale)[0], tv(o.transform.scale)[1], tv(o.transform.scale)[2]),
    );
    if (o.parent) m = worldOf(o.parent).mul(m);
    cache.set(o.id, m);
    return m;
  };

  const items = [];
  for (const o of scene3d.objects.values()) {
    const wm = worldOf(o);
    const mesh = o.components && o.components.mesh ? o.components.mesh : null;
    let aabb = null;
    if (mesh && mesh.bounds) {
      let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
      for (const p of mesh.bounds) {
        const wp = wm.transformPoint(Vec3.of(p[0], p[1], p[2]));
        for (let c = 0; c < 3; c++) { const wc = c === 0 ? wp.x : c === 1 ? wp.y : wp.z; mn[c] = Math.min(mn[c], wc); mx[c] = Math.max(mx[c], wc); }
      }
      aabb = { min: mn, max: mx };
    }
    items.push({
      id: o.id, name: o.name,
      mesh, material: o.material,
      worldTransform: wm.m.slice(),
      aabb, parent: o.parent ? o.parent.id : null,
    });
  }
  return items;
}
