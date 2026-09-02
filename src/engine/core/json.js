// JSON 工具：安全解析 + 稳定排序序列化（用于确定性比对/校验和）。
export function parse(s) { return JSON.parse(s); }
export function stringify(v, pretty = false) { return JSON.stringify(v, null, pretty ? 2 : 0); }

function sortKeys(o) {
  if (Array.isArray(o)) return o.map(sortKey);
  if (o && typeof o === 'object') {
    const r = {};
    for (const k of Object.keys(o).sort()) r[k] = sortKey(o[k]);
    return r;
  }
  return o;
}
function sortKey(o) { return sortKeys(o); }

export function stringifyStable(v) { return JSON.stringify(sortKeys(v)); }
export function safeParse(s, def = null) { try { return JSON.parse(s); } catch (e) { return def; } }
