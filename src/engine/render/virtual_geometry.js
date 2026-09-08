// 虚拟几何（Nanite 简化）：三角簇构建 + 按距离选择 LOD（每簇多级简化网格）。
export function buildClusters(mesh, maxTrisPerCluster = 128) {
  const idx = mesh.indices || new Uint32Array(0);
  const clusters = [];
  for (let i = 0; i < idx.length; i += 3 * maxTrisPerCluster) {
    const triCount = Math.min(maxTrisPerCluster, (idx.length - i) / 3);
    const cidx = idx.subarray(i, i + triCount * 3);
    clusters.push({ startIndex: i, triCount, cidx: Array.from(cidx), id: clusters.length });
  }
  return clusters;
}

// 由原始网格 + 簇生成一个 LOD（丢弃偶数三角，粗略简化）
export function decimate(mesh, level) {
  const idx = mesh.indices || new Uint32Array(0);
  const keep = Math.max(1, 1 << level); // 保留每 keep 个三角中的 1 个
  const out = [];
  for (let t = 0; t + 2 < idx.length; t += 3) {
    if ((t / 3) % keep === 0) out.push(idx[t], idx[t + 1], idx[t + 2]);
  }
  return new Uint32Array(out);
}

export function selectLOD(distance, thresholds = [10, 25, 50]) {
  let lod = 0;
  for (let i = 0; i < thresholds.length; i++) if (distance > thresholds[i]) lod = i + 1;
  return lod;
}
