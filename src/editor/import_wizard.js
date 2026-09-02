// 导入向导：模态框导入图元批量/迷你 OBJ 文本/工程 JSON（对应 python/ide 的 import wizard）。
import { runScript } from './ide_script_api.js';

export class ImportWizard {
  constructor(ctx) { this.ctx = ctx; }
  open() {
    const root = document.getElementById('modal-root');
    root.innerHTML = '';
    const m = el('div', 'modal');
    m.appendChild(head('导入向导', () => root.innerHTML = ''));
    const body = el('div', 'm-body');
    body.innerHTML = `
      <div class="row"><label>模式</label>
        <select id="iw-mode">
          <option value="prims">批量图元</option>
          <option value="obj">OBJ 文本（v/f）</option>
          <option value="json">工程 JSON</option>
        </select></div>
      <div class="row" id="iw-prims-row"><label>图元×数量</label>
        <select id="iw-shape"><option>cube</option><option>sphere</option><option>cylinder</option><option>plane</option></select>
        <input id="iw-count" type="number" value="5" min="1" max="100" style="width:70px"></div>
      <textarea id="iw-text" style="display:none" placeholder="粘贴 OBJ 或工程 JSON"></textarea>`;
    m.appendChild(body);
    const foot = el('div', 'm-foot');
    const ok = document.createElement('button'); ok.textContent = '导入';
    const cancel = document.createElement('button'); cancel.textContent = '取消';
    cancel.onclick = () => root.innerHTML = '';
    ok.onclick = () => this._run(root);
    foot.append(cancel, ok);
    m.appendChild(foot);
    root.appendChild(m);
    const mode = body.querySelector('#iw-mode');
    mode.onchange = () => {
      body.querySelector('#iw-prims-row').style.display = mode.value === 'prims' ? '' : 'none';
      body.querySelector('#iw-text').style.display = mode.value === 'prims' ? 'none' : '';
    };
  }
  _run(root) {
    const mode = document.getElementById('iw-mode').value;
    const ctx = this.ctx;
    try {
      if (mode === 'prims') {
        const shape = document.getElementById('iw-shape').value;
        const n = Math.max(1, Math.min(100, +document.getElementById('iw-count').value || 1));
        ctx.history.push(ctx.project.scene(), 'import-prims');
        for (let i = 0; i < n; i++) {
          const ang = i / n * Math.PI * 2;
          ctx.api.spawn(shape + i, {
            position: [Math.cos(ang) * 3, 0.5, Math.sin(ang) * 3],
            components: { mesh: { shape, albedo: [120 + (i * 37) % 130, 160, 220 - (i * 23) % 120], rough: 0.7, metal: 0 } },
          });
        }
      } else if (mode === 'obj') {
        const text = document.getElementById('iw-text').value;
        const n = importObjText(ctx, text);
        ctx.status(`OBJ 导入 ${n} 个对象`);
      } else {
        const text = document.getElementById('iw-text').value;
        const json = JSON.parse(text);
        // 工程 JSON：合并场景
        for (const sn in (json.scenes || {})) {
          ctx.api.newScene(sn in ctx.project.scenes ? sn + '_imp' : sn);
        }
        ctx.status('工程 JSON 场景已登记（数据合并为简化实现）');
      }
      ctx.refresh();
      root.innerHTML = '';
    } catch (e) {
      alert('导入失败: ' + (e.message || e));
    }
  }
}

// 迷你 OBJ：解析 v/f，整体作为一个 mesh 对象导入（法线取面法线平均）
export function importObjText(ctx, text) {
  const vs = [], fs = [];
  for (const line of text.split('\n')) {
    const p = line.trim().split(/\s+/);
    if (p[0] === 'v') vs.push([+p[1], +p[2], +p[3]]);
    else if (p[0] === 'f') {
      const ids = p.slice(1).map(s => parseInt(s.split('/')[0], 10) - 1);
      for (let i = 1; i + 1 < ids.length; i++) fs.push([ids[0], ids[i], ids[i + 1]]);
    }
  }
  if (!vs.length || !fs.length) throw new Error('OBJ 无有效 v/f 数据');
  // 计算包围盒中心，归一化到单位尺度
  let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (const v of vs) for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], v[i]); mx[i] = Math.max(mx[i], v[i]); }
  const c = mn.map((x, i) => (x + mx[i]) / 2), sc = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) || 1;
  const pos = new Float32Array(vs.flatMap(v => [(v[0] - c[0]) / sc, (v[1] - c[1]) / sc, (v[2] - c[2]) / sc]));
  const nor = new Float32Array(pos.length);
  const idx = new Uint32Array(fs.flat());
  // 面积加权法线
  for (const [a, b, d] of fs) {
    const pa = [pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2]];
    const pb = [pos[b * 3], pos[b * 3 + 1], pos[b * 3 + 2]];
    const pc = [pos[d * 3], pos[d * 3 + 1], pos[d * 3 + 2]];
    const u = pb.map((x, i) => x - pa[i]), w = pc.map((x, i) => x - pa[i]);
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    for (const k of [a, b, d]) for (let i = 0; i < 3; i++) nor[k * 3 + i] += n[i];
  }
  for (let i = 0; i < nor.length; i += 3) {
    const l = Math.hypot(nor[i], nor[i + 1], nor[i + 2]) || 1;
    nor[i] /= l; nor[i + 1] /= l; nor[i + 2] /= l;
  }
  const s = ctx.project.scene();
  ctx.history.push(s, 'import-obj');
  const id = ctx.api.spawn('imported_obj', { position: [0, 0.5, 0], components: { mesh: { shape: 'cube', albedo: [190, 190, 200], rough: 0.8, metal: 0 } } });
  // 自定义几何挂到对象上，视口 syncScene 优先用 customGeo
  const obj = s.get(id);
  obj.components.mesh.customGeo = { positions: Array.from(pos), normals: Array.from(nor), indices: Array.from(idx) };
  return 1;
}

function el(tag, cls) { const d = document.createElement(tag); if (cls) d.className = cls; return d; }
function head(title, onClose) {
  const h = el('div', 'm-head');
  h.appendChild(document.createTextNode(title));
  const x = el('span', 'x'); x.textContent = '✕'; x.onclick = onClose;
  h.appendChild(x);
  return h;
}
