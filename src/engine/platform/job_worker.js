// 通用 Worker 协议：{id,type,payload}→{id,result|error,progress}。
// 浏览器用 Web Worker（Transferable ArrayBuffer 零拷贝）；Node 走微任务队列顺序降级。
// 任务类型：import-gltf / decode-image / ddc-bake / mesh-compress / custom。
import { fnv1a } from '../core/determinism.js';

// ---- 任务处理函数注册表（Worker 端 + Node 降级共用）----
export const taskRegistry = new Map();
export function registerTask(type, handler) {
  taskRegistry.set(type, handler);
}

// 内置默认任务处理器（纯计算，无 DOM 依赖）
registerTask('import-gltf', async ({ buffer, json }, progress) => {
  if (json) return { scene: { nodes: (json.nodes||[]).map(n=>({name:n.name})), meshes: (json.meshes||[]).map(m=>({name:m.name})), materials: (json.materials||[]).map(m=>({name:m.name})) } };
  if (!buffer) throw new Error('import-gltf 需要 buffer 或 json 参数');
  const dv = new DataView(buffer);
  const magic = dv.getUint32(0, true);
  if (magic !== 0x46546C67) throw new Error('GLB magic 不匹配');
  progress?.(0.1);
  const jsonLen = dv.getUint32(8, true);
  const js = new TextDecoder().decode(new Uint8Array(buffer, 12, jsonLen));
  const gj = JSON.parse(js);
  progress?.(0.4);
  return { scene: { nodes: (gj.nodes||[]).map(()=>({})), meshes: (gj.meshes||[]).map(()=>({})), materials: (gj.materials||[]).map(()=>({})) }, extensions: Object.keys(gj.extensionsUsed||[]) };
});

registerTask('decode-image', async ({ buffer }, progress) => {
  if (!buffer) throw new Error('decode-image 需要 buffer 参数');
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 8 && bytes[0]===137 && bytes[1]===80 && bytes[2]===78 && bytes[3]===71) {
    progress?.(0.1);
    const dv = new DataView(buffer);
    const w = dv.getUint32(16, false), h = dv.getUint32(20, false);
    progress?.(0.3);
    return { format: 'png', width: w, height: h, data: bytes };
  }
  if (bytes.length >= 3 && bytes[0]===0xFF && bytes[1]===0xD8 && bytes[2]===0xFF) {
    progress?.(0.1);
    return { format: 'jpeg', data: bytes };
  }
  throw new Error('未知图像格式');
});

registerTask('ddc-bake', async ({ key, params }, progress) => {
  progress?.(0.1);
  const hash = fnv1a(key + JSON.stringify(params));
  progress?.(0.3);
  return { key, hash, data: { baked: true, params: { ...params } } };
});

registerTask('mesh-compress', async ({ vertices, indices }, progress) => {
  if (!vertices || !vertices.length) throw new Error('空网格');
  progress?.(0.1);
  const idx = new Uint32Array(indices);
  progress?.(0.3);
  return { vertexCount: vertices.length / 3, indexCount: idx.length, compressed: true, hash: fnv1a(String(vertices.length) + '-' + String(idx.length)) };
});

registerTask('custom', async ({ fn, args }, progress) => {
  if (typeof fn === 'function') return fn(...(args||[]));
  throw new Error('custom task 需要 fn 参数');
});

// ---- 节点端顺序降级执行器 ----
function executeTask(id, type, payload, progress, resolve, reject) {
  (async () => {
    try {
      const fn = taskRegistry.get(type);
      if (!fn) throw new Error(`未知任务类型: ${type}`);
      const result = await fn(payload, progress);
      resolve({ id, result });
    } catch (err) {
      reject({ id, error: err.message || String(err) });
    }
  })();
}

// ---- 浏览器 Worker 端入口（若作为 Worker script 加载）----
if (typeof self !== 'undefined' && typeof self.onmessage === 'undefined') {
  self.onmessage = (e) => {
    const msg = e.data || {};
    const { id, type, payload } = msg;
    (async () => {
      try {
        const fn = taskRegistry.get(type);
        if (!fn) throw new Error(`未知任务类型: ${type}`);
        const result = await fn(payload, msg.progress ? (p) => self.postMessage({ id, progress: p }) : null);
        self.postMessage({ id, result });
      } catch (err) {
        self.postMessage({ id, error: err.message || String(err) });
      }
    })();
  };
}

// ---- Worker 池主类 ----
export class WorkerPool {
  constructor({ workers = 1, useWorker = false, workerUrl = null } = {}) {
    this.workers = [];
    this.useWorker = useWorker && typeof Worker !== 'undefined' && workerUrl;
    if (this.useWorker) {
      for (let i = 0; i < workers; i++) {
        const w = new Worker(workerUrl);
        w._busy = false;
        w._queue = [];
        this.workers.push(w);
      }
    }
    this.jobs = new Map();
    this._stats = { submitted: 0, completed: 0, failed: 0 };
  }

  submit(type, payload, { onProgress = null, transfer = null } = {}) {
    this._stats.submitted++;
    const id = ++WorkerPool._seq;
    return new Promise((resolve, reject) => {
      this.jobs.set(id, { resolve, reject, onProgress });
      if (this.useWorker && this.workers.length) {
        const w = this._pickWorker();
        const msg = { id, type, payload };
        if (transfer) w.postMessage(msg, transfer);
        else w.postMessage(msg);
        if (onProgress && !w._progressHandler) {
          w.addEventListener('message', (e) => {
            const { id: mid, progress, result, error } = e.data;
            if (mid !== undefined && progress !== undefined) {
              const job = this.jobs.get(mid);
              if (job && job.onProgress) job.onProgress(progress);
            }
          });
          w._progressHandler = true;
        }
      } else {
        executeTask(id, type, payload, onProgress, (r) => {
          this._stats.completed++;
          this.jobs.get(id)?.resolve(r);
          this.jobs.delete(id);
        }, (r) => {
          this._stats.failed++;
          this.jobs.get(id)?.reject(r);
          this.jobs.delete(id);
        });
      }
    });
  }

  _pickWorker() {
    let best = this.workers[0], load = Infinity;
    for (const w of this.workers) {
      const l = w._queue.length;
      if (l < load) { load = l; best = w; }
    }
    best._queue.push({ id: null });
    return best;
  }

  handleResponse({ id, result, error }) {
    const job = this.jobs.get(id);
    if (!job) return;
    if (error) { this._stats.failed++; job.reject({ id, error }); }
    else { this._stats.completed++; job.resolve({ id, result }); }
    for (const w of this.workers) { const i = w._queue.findIndex(q => q.id === id); if (i >= 0) w._queue.splice(i, 1); }
    this.jobs.delete(id);
  }

  stats() { return { ...this._stats, size: this.jobs.size, workers: this.workers.length }; }
}
WorkerPool._seq = 0;
