// plat_worker_smoke.js — Worker 池通用协议验收（Node 顺序降级路径）
export const name = 'plat_worker';

export async function run(t) {
  const { WorkerPool, registerTask, taskRegistry } = await import('../../src/engine/platform/job_worker.js');

  // 1. 注册自定义任务
  registerTask('sum', async ({ a, b }, progress) => {
    if (progress) progress(0.5);
    await new Promise(r => setTimeout(r, 0));
    return a + b;
  });

  // 2. 内置任务：全部已注册
  t.ok(taskRegistry.has('import-gltf'), 'import-gltf 已注册');
  t.ok(taskRegistry.has('decode-image'), 'decode-image 已注册');
  t.ok(taskRegistry.has('ddc-bake'), 'ddc-bake 已注册');
  t.ok(taskRegistry.has('mesh-compress'), 'mesh-compress 已注册');
  t.ok(taskRegistry.has('custom'), 'custom 已注册');

  // 3. 提交任务（Node 降级路径）
  const pool = new WorkerPool({ useWorker: false });

  const r1 = await pool.submit('sum', { a: 3, b: 4 });
  t.eq(r1.result, 7, 'sum 3+4 = 7');

  // mesh-compress：9 个 float = 3 个顶点
  const r2 = await pool.submit('mesh-compress', {
    vertices: new Float32Array([0,0,0, 1,0,0, 0,1,0]),
    indices: [0,1,2]
  });
  t.eq(r2.result.vertexCount, 3, 'mesh-compress 顶点数');
  t.eq(r2.result.indexCount, 3, 'mesh-compress 索引数');
  t.ok(r2.result.compressed, 'mesh-compress 压缩标记');
  t.ok(r2.result.hash > 0, 'mesh-compress 返回哈希');

  // 4. 进度回调
  let progressCalled = false;
  await pool.submit('sum', { a: 1, b: 2 }, {
    onProgress: (p) => { progressCalled = true; }
  });
  t.ok(progressCalled, '进度回调触发');

  // 5. 未知任务类型报错
  try {
    await pool.submit('nonexistent', {});
    t.ok(false, '未知类型应报错');
  } catch (err) {
    t.ok(err.error.includes('未知任务类型'), '未知类型错误消息');
  }

  // 6. 空网格报错
  try {
    await pool.submit('mesh-compress', { vertices: [], indices: [] });
    t.ok(false, '空网格应报错');
  } catch (err) {
    t.ok(err.error.includes('空网格'), '空网格错误消息');
  }

  // 7. ddc-bake 返回哈希
  const r3 = await pool.submit('ddc-bake', { key: 'texture_abc', params: { width: 256 } });
  t.ok(r3.result.hash > 0, 'ddc-bake 返回正数哈希');
  t.eq(r3.result.key, 'texture_abc', 'ddc-bake key 回显');
  t.ok(r3.result.data.baked, 'ddc-bake baked 标记');

  // 8. decode-image PNG 魔数
  const pngBytes = new Uint8Array([
    137, 80, 78, 71, 13, 10, 26, 10,
    0, 0, 0, 13,
    73, 72, 68, 82,
    0, 0, 0, 8,
    0, 0, 0, 8,
    8, 6, 0, 0, 0,
    0, 0, 0, 0,
  ]);
  const r4 = await pool.submit('decode-image', { buffer: pngBytes.buffer });
  t.eq(r4.result.format, 'png', 'PNG 格式识别');
  t.eq(r4.result.width, 8, 'PNG 宽度');
  t.eq(r4.result.height, 8, 'PNG 高度');

  // 9. import-gltf JSON 路径
  const r5 = await pool.submit('import-gltf', { json: { nodes: [{name:'root'}], meshes: [{name:'cube'}], materials: [{name:'pbr'}] } });
  t.eq(r5.result.scene.nodes.length, 1, 'GLTF node 数');
  t.eq(r5.result.scene.meshes.length, 1, 'GLTF mesh 数');
  t.eq(r5.result.scene.materials.length, 1, 'GLTF material 数');
  t.eq(r5.result.scene.nodes[0].name, 'root', 'GLTF node 名');

  // 10. stats
  const s = pool.stats();
  t.ok(s.submitted >= 8, 'stats.submitted');
  t.ok(s.completed >= 6, 'stats.completed');
  t.ok(s.failed >= 2, 'stats.failed');

  // 11. 错误消息可读性
  const errors = [];
  const pool2 = new WorkerPool({ useWorker: false });
  try { await pool2.submit('decode-image', { buffer: new ArrayBuffer(4) }); }
  catch (e) { errors.push(e.error); }
  t.ok(errors[0].includes('未知图像格式'), '图像解码错误可读');
  t.ok(errors[0].length > 5, '错误消息有实质内容');

  // 12. custom task
  registerTask('transform', async ({ data, scale }) => {
    return data.map(v => v * scale);
  });
  const r6 = await pool.submit('transform', { data: [1, 2, 3], scale: 2 });
  t.eq(r6.result[0], 2, 'transform 结果[0]');
  t.eq(r6.result[2], 6, 'transform 结果[2]');

  // 13. 多任务并发
  const pool3 = new WorkerPool({ useWorker: false });
  const results = await Promise.all([
    pool3.submit('sum', { a: 10, b: 20 }),
    pool3.submit('sum', { a: 30, b: 40 }),
    pool3.submit('sum', { a: 50, b: 60 }),
  ]);
  t.eq(results[0].result, 30, '并发任务1');
  t.eq(results[1].result, 70, '并发任务2');
  t.eq(results[2].result, 110, '并发任务3');

  // 14. Transferable ArrayBuffer
  const ab = new ArrayBuffer(16);
  const view = new Float32Array(ab);
  view.fill(42);
  const r7 = await pool.submit('mesh-compress', { vertices: new Float32Array(ab), indices: [0,1,2] });
  t.ok(r7.result.compressed, 'Transferable 后压缩标记');

  // 15. WorkerPool._seq 递增
  t.ok(WorkerPool._seq >= 14, 'seq 递增');
}
