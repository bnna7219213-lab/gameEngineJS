// 编辑器入口：组装所有面板 + 主循环 + 快捷键（对应 python/ide 的 main）。
import { Project } from './project.js';
import { Selection } from './selection.js';
import { History } from './history.js';
import { Timeline } from './timeline.js';
import { createApi } from './ide_script_api.js';
import { applyTheme, currentTheme, toggleTheme } from './theme.js';
import { HierarchyPanel } from './hierarchy.js';
import { InspectorPanel } from './inspector.js';
import { ViewportPanel, createViewportDevice } from './viewport.js';
import { CameraController } from './camera_ctrl.js';
import { Gizmo } from './gizmo.js';
import { detectBackends, pickViewportBackend } from '../engine/render/rhi.js';
import { ProfilerPanel } from './profiler_panel.js';
import { PlaySession } from '../engine/platform/play_session.js';
import { CodeEditor, highlightToHTML, highlightToLines } from './code_editor.js';
import { createFileSystem, buildFileTree } from './file_system.js';
import { validateScript, createEntityApi, evalWatch } from './script_compiler.js';
import { AssetBrowserPanel } from './asset_browser.js';
import { ConsolePanel } from './console.js';
import { PerfHud } from './perf_hud.js';
import { CommandPalette } from './command_palette.js';
import { SceneTabs } from './scene_tabs.js';
import { ImportWizard } from './import_wizard.js';
import { PreviewManager } from './preview.js';
import { Scene3D } from '../engine/platform/scene3d.js';

const $ = (id) => document.getElementById(id);

applyTheme(currentTheme());

// ---------- 上下文 ----------
const storage = (() => { try { return localStorage; } catch { return undefined; } })();
const project = Project.load('default', { storage }) || new Project({ name: 'default', storage });
if (!project.scenes.size) {
  project.createScene('main');
  // 初始演示场景
  const api0 = createApi(project, null, null);
  api0.spawn('ground', { position: [0, 0, 0], components: { mesh: { shape: 'plane', albedo: [90, 96, 110], rough: 0.9, metal: 0 } } });
  api0.spawn('cube', { position: [0, 0.6, 0], components: { mesh: { shape: 'cube', albedo: [220, 120, 90], rough: 0.6, metal: 0 } } });
  api0.spawn('sun', { position: [3, 4, 2], components: { light: { kind: 'point', color: [255, 244, 214], intensity: 1 } } });
  // 预置对象脚本：进入 Play 即见效果（E 演示验证；由代码工作台 Ctrl+S 可热重载覆盖）
  const byName = (sc, n) => { for (const o of sc.objects.values()) if (o.name === n) return o; return null; };
  const dscene = project.scene();
  const cubeObj = byName(dscene, 'cube'); if (cubeObj) cubeObj.scripts = ['this.setPosition(Math.sin(this.time) * 2.4, 0.6, Math.cos(this.time) * 2.4);'];
  const sunObj = byName(dscene, 'sun'); if (sunObj) sunObj.scripts = ['this.rotate(0, this.dt * 0.8, 0);'];
}
const selection = new Selection();
const history = new History();
const timeline = new Timeline();
const api = createApi(project, selection, history);

const status = (msg) => { $('status').textContent = msg; };

const ctx = {
  project, selection, history, timeline, api, status,
  refresh() { refresh(); },
  getPlaySession: () => playSession,
};

// ---------- 面板 ----------
const hierarchy = new HierarchyPanel(ctx, $('hierarchy'));
const inspector = new InspectorPanel(ctx, $('inspector'));
let viewport, gizmo; // 异步构建（GPU 探测 + 设备创建可能 await）
const assets = new AssetBrowserPanel(ctx, $('asset-browser'));
const consolePanel = new ConsolePanel(ctx, $('console-log'), $('console-input'));
const hud = new PerfHud($('perf-hud'));
const tabs = new SceneTabs(ctx, $('scene-tabs'));
const wizard = new ImportWizard(ctx);
const previews = new PreviewManager(ctx);

// GPU 视口启用（P5#1）：能力探测 → 选后端 → 创建设备 → 构造视口；
// 任意环节失败一律安全回退软渲染（红线 A/D：计算 100% 浏览器内、软件参考永不下线）。
(async () => {
  const detect = await detectBackends();
  const backend = pickViewportBackend(detect);
  const device = await createViewportDevice(backend);
  const realBackend = device ? 'webgl2' : 'software';
  viewport = new ViewportPanel(ctx, $('viewport'), { device, backend: realBackend });
  new CameraController(viewport, $('viewport'));
  gizmo = new Gizmo(viewport, $('viewport'));
  status('就绪 — ' + [...project.scenes.keys()].join(', ') + (realBackend === 'webgl2' ? ' [GPU]' : ' [Software]'));
})();

// Profiler 展开面板（P5#7）：接入渲染循环，驱动分段计时/计数/内存报告
const profiler = new ProfilerPanel($('profiler-panel'));
if (profiler.el) profiler.el.hidden = false;

// Play 模式快照隔离（P5#2）：▶Run 进入编辑器内嵌 GameRuntime（场景深拷贝快照），
// 运行时只写快照，停止即丢弃，编辑态原封不动（红线 F：零污染）。
let playSession = null;
function togglePlayMode() {
  if (playSession) {
    playSession.stop(); playSession = null;
    status('编辑模式（Play 已停止，场景回滚，红线 F）');
  } else {
    try {
      const scene = project.scene();
      if (!scene) return;
      playSession = new PlaySession(scene);
      playSession.start();
      const errs = playSession.scriptErrors.length;
      status(errs ? ('Play 模式（' + errs + ' 个脚本编译错误，已跳过；其余运行）') : 'Play 模式（脚本已编译并运行，停止回滚编辑态，红线 F）');
    } catch (e) { console.error(e); status('Play 启动失败: ' + (e && e.message)); }
  }
  refresh();
}

// 代码工作台 v1（P5#3 深化）：文件树 + OPFS 持久化 + Worker 语法校验 + Ctrl+S 热重载
let codeEditor = null;
let scriptWorker = null;
// 惰性创建 Worker（后台语法校验）。失败/不支持则置 false，避免重复尝试（红线 A）。
function getScriptWorker() {
  if (scriptWorker !== null) return scriptWorker || null;
  if (typeof Worker === 'undefined') { scriptWorker = false; return null; }
  try { scriptWorker = new Worker(new URL('./script_compiler.worker.js', import.meta.url)); return scriptWorker; }
  catch (e) { scriptWorker = false; return null; }
}
// 后台校验脚本语法（Worker 化）；无 Worker 时回退同步校验
function validateInWorker(code, cb) {
  const w = getScriptWorker();
  if (!w) { const r = validateScript(code); cb(r.ok ? [] : [r.error]); return; }
  const id = 'v' + Math.random().toString(36).slice(2);
  const onMsg = (e) => { if (e.data && e.data.id === id) { w.removeEventListener('message', onMsg); cb(e.data.errors || []); } };
  w.addEventListener('message', onMsg);
  w.postMessage({ id, scripts: [{ name: 'active', code }] });
}
function openCodeEditor() {
  try {
    const el = $('code-editor');
    if (!el) return;
    el.hidden = false;
    if (!codeEditor) {
      codeEditor = new CodeEditor({
        fileSystem: createFileSystem(),         // OPFS（浏览器）/ 内存态（红线 E）
        onSave: (path, content) => {
          validateInWorker(content, (errs) => {
            if (errs.length) { status('脚本语法错误：' + errs[0]); console.error('[code-editor]', errs); }
            else {
              const hr = hotReloadFromPath(path, content);
              if (hr.applied) {
                // 同时写回编辑器对象脚本（绑定持久化：下次 Play 也生效）
                const edScene = project.scene();
                const eo = edScene && edScene.get(hr.eid);
                if (eo) { if (!Array.isArray(eo.scripts)) eo.scripts = []; eo.scripts[hr.index] = content; }
                status('已热重载 ' + path + ' → 运行中' + (playSession && playSession.paused ? '（暂停态）' : '') + '，编辑态已同步');
              } else {
                status('已保存 ' + path + (hr.message ? '（' + hr.message + '）' : '，热重载跳过'));
              }
            }
          });
        },
      });
      codeEditor.openFile('scripts/cube.js',
        '// 边调试边热加载：先点 ▶Run 进入 Play，再改这里 Ctrl+S 立即生效\n' +
        'this.move(0.5 * dt, 0, 0);\n');
      codeEditor.watches = [];   // 监视表达式列表（debug 面板用）
    }
    renderCodeEditor();
    if (!el._dbg) { bindDbg(el); el._dbg = true; }
    updateCodeEditorDebug();
    status('代码工作台已打开（Ctrl+S 热重载；⏸暂停/⏭单步/🔄热重载 边调试边运行）');
  } catch (e) { console.error(e); status('代码工作台打开失败: ' + (e && e.message)); }
}
function renderCodeEditor() {
  const el = $('code-editor'); if (!el || !codeEditor) return;
  const draw = (paths) => {
    const arr = Array.isArray(paths) ? paths : [];
    codeEditor.setTree(arr.map(p => ({ path: p })));
    const tree = renderTreeHTML(codeEditor.fileTree);
    // C：逐行渲染 + 错误行标红（同步校验，零依赖）
    const content = codeEditor.getContent();
    const v = validateScript(content);
    codeEditor._errLine = v.ok ? -1 : (v.line || -1);
    const codeLines = highlightToLines(content);
    const codeHtml = codeLines.map((h, i) =>
      '<div class="ce-line' + ((i + 1) === codeEditor._errLine ? ' ce-line-err' : '') + '" data-line="' + (i + 1) + '">' + (h || '&nbsp;') + '</div>'
    ).join('');
    el.innerHTML =
      '<div class="ce-tree">' + (tree || '') + '</div>' +
      '<div class="ce-tabs">' + codeEditor.tabs.map(t => '<span class="ce-tab' + (t === codeEditor.active ? ' active' : '') + '">' + ceEsc(t.name) + '</span>').join('') + '</div>' +
      '<div class="ce-code">' + codeHtml + '</div>' +
      (codeEditor._errLine > 0 ? '<div class="ce-err">✖ 第 ' + codeEditor._errLine + ' 行: ' + ceEsc(v.error) + '</div>' : '') +
      '<div class="ce-debug">' +
        '<div class="ce-dbg-bar">' +
          '<button class="ce-btn" data-dbg="toggle">⏸ 暂停</button>' +
          '<button class="ce-btn" data-dbg="step">⏭ 单步</button>' +
          '<button class="ce-btn" data-dbg="reload">🔄 热重载</button>' +
          '<span id="ce-dbg-state" class="ce-dbg-state"></span>' +
        '</div>' +
        '<div class="ce-sub">实体状态（实时）</div>' +
        '<div id="ce-dbg-entities" class="ce-dbg-box"></div>' +
        '<div class="ce-sub">监视表达式（实时求值选中实体）</div>' +
        '<div class="ce-watch-bar"><input id="ce-watch-input" class="ce-watch-input" placeholder="如 pos[0] 或 sqrt(pos[0]^2+pos[2]^2)" /><button class="ce-btn" data-dbg="addwatch">+ 监视</button></div>' +
        '<div id="ce-dbg-watch" class="ce-dbg-box"></div>' +
        '<div class="ce-sub">脚本日志（api.log）</div>' +
        '<div id="ce-dbg-console" class="ce-dbg-box"></div>' +
      '</div>';
    const wi = el.querySelector('#ce-watch-input');
    if (wi) wi.addEventListener('keydown', (e) => { if (e.key === 'Enter' && wi.value.trim()) { codeEditor.watches.push(wi.value.trim()); wi.value = ''; updateCodeEditorDebug(); } });
    updateCodeEditorDebug();
  };
  const paths = codeEditor.fileSystem.list();
  if (paths && typeof paths.then === 'function') paths.then(draw).catch(() => draw([]));
  else draw(paths);
}
// debug 工具条交互：暂停/继续、单步、热重载
function bindDbg(el) {
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-dbg]'); if (!b) return;
    const act = b.dataset.dbg;
    if (act === 'toggle') {
      if (!playSession) status('先进入 Play 模式（▶Run / Ctrl+P）');
      else { if (playSession.paused) playSession.resume(); else playSession.pause(); }
    } else if (act === 'step') {
      if (!playSession) status('先进入 Play 模式（▶Run / Ctrl+P）');
      else playSession.stepFrame();
    } else if (act === 'reload') {
      if (!codeEditor || !codeEditor.active) return;
      if (!playSession) { status('先进入 Play 模式再热重载'); }
      else { const r = hotReloadFromPath(codeEditor.active.path, codeEditor.active.content); status(r.applied ? ('已热重载 ' + codeEditor.active.path + ' → 运行中') : ('热重载失败：' + (r.message || ''))); }
    } else if (act === 'addwatch') {
      const inp = el.querySelector('#ce-watch-input');
      if (inp && inp.value.trim()) { codeEditor.watches.push(inp.value.trim()); inp.value = ''; }
      updateCodeEditorDebug();
    }
    updateCodeEditorDebug();
  });
}
// 实时刷新 debug 面板（实体状态 + 脚本日志 + 按钮态）
function updateCodeEditorDebug() {
  const el = $('code-editor'); if (!el || el.hidden || !codeEditor || !el.querySelector('#ce-dbg-state')) return;
  const stateEl = el.querySelector('#ce-dbg-state');
  const entEl = el.querySelector('#ce-dbg-entities');
  const conEl = el.querySelector('#ce-dbg-console');
  const watchEl = el.querySelector('#ce-dbg-watch');
  if (!playSession) {
    stateEl.textContent = '未运行（点 ▶Run / Ctrl+P 进入 Play）';
    entEl.innerHTML = ''; conEl.innerHTML = '';
    if (watchEl) watchEl.innerHTML = '<div class="ce-log dim">（运行 Play 后监视选中实体）</div>';
    const t = el.querySelector('[data-dbg="toggle"]'); if (t) t.textContent = '⏸ 暂停';
    return;
  }
  // 断点指示
  if (playSession.runtime.breakRequested) {
    stateEl.textContent = '⏸ 命中断点' + (playSession.runtime.breakInfo && playSession.runtime.breakInfo.msg ? '：' + playSession.runtime.breakInfo.msg : '');
    stateEl.style.color = '#ffd24a';
  } else {
    stateEl.textContent = (playSession.paused ? '⏸ 暂停' : '▶ 运行') + '  t=' + playSession.time.toFixed(2) + 's';
    stateEl.style.color = '';
  }
  const t = el.querySelector('[data-dbg="toggle"]'); if (t) t.textContent = playSession.paused ? '▶ 继续' : '⏸ 暂停';
  let ents = '';
  for (const o of playSession.snapshot.objects.values()) {
    const p = o.transform.position;
    ents += '<div class="ce-ent">' + ceEsc(o.name) + ' #' + o.id + '  pos(' + p[0].toFixed(2) + ', ' + p[1].toFixed(2) + ', ' + p[2].toFixed(2) + ')</div>';
  }
  entEl.innerHTML = ents;
  const logs = playSession.runtime.logBuffer.slice(-14);
  conEl.innerHTML = logs.length
    ? logs.map(l => '<div class="ce-log">[t=' + l.t.toFixed(2) + '] ' + ceEsc(l.msg) + '</div>').join('')
    : '<div class="ce-log dim">（暂无日志，脚本里用 this.log(...) 输出）</div>';
  // 监视表达式：对选中实体实时求值
  if (watchEl) {
    if (!codeEditor.watches || !codeEditor.watches.length) { watchEl.innerHTML = '<div class="ce-log dim">（添加表达式监视选中实体）</div>'; }
    else {
      const selId = selection.primary();
      const eid = (selId != null && playSession.snapshot.objects.has(selId)) ? selId : null;
      let html = '';
      for (const expr of codeEditor.watches) {
        let val = '—';
        if (eid != null) { const api = createEntityApi(playSession.runtime, eid); api.dt = playSession.runtime.fixedDt; api.input = playSession.runtime.input; val = evalWatch(expr, api); }
        html += '<div class="ce-log">' + ceEsc(expr) + ' = ' + ceEsc(val) + '</div>';
      }
      watchEl.innerHTML = html;
    }
  }
}
// 文件名 → 对象名/槽位：scripts/<对象名>[#槽位].js
function parseScriptPath(path) {
  const m = String(path).match(/scripts\/([^#/]+?)(?:#(\d+))?\.js$/);
  if (!m) return null;
  return { objectName: m[1], index: m[2] ? parseInt(m[2], 10) : 0 };
}
function findEntityByName(scene, name) {
  for (const o of scene.objects.values()) if (o.name === name) return o.id;
  return null;
}
// 把编辑器保存的脚本热加载进运行中的 Play 会话（若缺槽位则新增；运行时无该对象则失败）
function hotReloadFromPath(path, content) {
  const p = parseScriptPath(path);
  if (!p) return { applied: false, message: '文件名需匹配 scripts/<对象名>[#槽位].js' };
  if (!playSession || !playSession.playing) return { applied: false, message: '未运行（先 ▶Run）' };
  const eid = findEntityByName(playSession.snapshot, p.objectName);
  if (eid == null) return { applied: false, message: '运行时无对象「' + p.objectName + '」' };
  const res = playSession.hotReload(eid, p.index, content);
  if (!res.ok) return { applied: false, message: res.error };
  return { applied: true, eid, index: p.index };
}
function renderTreeHTML(node, depth) {
  depth = depth || 0; if (!node) return '';
  let out = '';
  for (const k of Object.keys(node.dirs || {})) {
    const d = node.dirs[k];
    out += '<div class="ce-dir" style="padding-left:' + (depth * 12) + 'px">▾ ' + ceEsc(d.name) + '</div>';
    out += renderTreeHTML(d, depth + 1);
  }
  for (const f of (node.files || [])) out += '<div class="ce-file" style="padding-left:' + ((depth + 1) * 12) + 'px">' + ceEsc(f.name) + '</div>';
  return out;
}
function ceEsc(s) { return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

// 视口点选（mousedown 未命中 gizmo 时拾取）
$('viewport').addEventListener('mousedown', (e) => {
  if (e.button !== 0 || e.shiftKey || gizmo.activeAxis >= 0) return;
  const r = e.target.getBoundingClientRect();
  const id = viewport.pick(e.clientX - r.left, e.clientY - r.top);
  if (e.ctrlKey || e.metaKey) { if (id != null) selection.toggle(id); }
  else selection.set(id);
  refresh();
});

// ---------- 工具栏命令 ----------
const commands = [
  { id: 'save', title: '保存工程', kbd: 'Ctrl+S', run: () => { project.save(); status('已保存 ' + new Date().toLocaleTimeString()); } },
  { id: 'undo', title: '撤销', kbd: 'Ctrl+Z', run: undo },
  { id: 'redo', title: '重做', kbd: 'Ctrl+Y', run: redo },
  { id: 'spawn-cube', title: '生成立方体', run: () => spawnPrim('cube') },
  { id: 'spawn-sphere', title: '生成球体', run: () => spawnPrim('sphere') },
  { id: 'spawn-light', title: '生成点光源', run: () => {
    const s = project.scene(); if (!s) return;
    history.push(s, 'spawn');
    selection.set(api.spawn('light', { position: [2, 3, 2], components: { light: { kind: 'point', color: [255, 244, 214], intensity: 1 } } }));
    refresh();
  } },
  { id: 'play', title: '播放/暂停时间轴', kbd: 'Space', run: togglePlay },
  { id: 'stop', title: '停止播放', run: () => { timeline.stop(); $('tl-scrub').value = '0'; updateTlLabel(); refresh(); } },
  { id: 'import', title: '导入向导', run: () => wizard.open() },
  { id: 'preview', title: '新预览窗口', run: () => previews.open() },
  { id: 'play-game', title: 'Play 模式（运行时快照隔离）', kbd: 'Ctrl+P', run: togglePlayMode },
  { id: 'code', title: '代码工作台', run: openCodeEditor },
  { id: 'palette', title: '命令面板', kbd: 'Ctrl+K', run: () => palette.open() },
  { id: 'theme', title: '切换主题', run: () => applyTheme(toggleTheme()) },
  { id: 'export', title: '导出工程 JSON', run: exportProject },
  { id: 'grid', title: '开关网格', run: () => { viewport.showGrid = !viewport.showGrid; } },
];
const palette = new CommandPalette(ctx, commands);

function spawnPrim(shape) {
  const s = project.scene(); if (!s) return;
  history.push(s, 'spawn');
  const colors = { cube: [220, 130, 90], sphere: [90, 160, 230] };
  selection.set(api.spawn(shape, { position: [0, 0.6, 0], components: { mesh: { shape, albedo: colors[shape] || [200, 200, 200], rough: 0.6, metal: 0 } } }));
  refresh();
}
function undo() {
  const s = project.scene(); if (!s) return;
  const restored = history.undo(s, Scene3D);
  if (restored) { project.scenes.set(project.activeScene, restored); selection.clear(); refresh(); }
}
function redo() {
  const s = project.scene(); if (!s) return;
  const restored = history.redo(s, Scene3D);
  if (restored) { project.scenes.set(project.activeScene, restored); selection.clear(); refresh(); }
}
function togglePlay() {
  if (timeline.playing) timeline.pause();
  else { history.push(project.scene(), 'timeline'); timeline.play(); }
  $('tl-play').textContent = timeline.playing ? '⏸' : '▶';
}
function exportProject() {
  const blob = new Blob([project.serialize()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = project.name + '.project.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

for (const btn of document.querySelectorAll('#toolbar [data-cmd]')) {
  const c = commands.find(x => x.id === btn.dataset.cmd);
  if (c) btn.onclick = () => c.run();
}
$('btn-add-obj').onclick = () => hierarchy.addEmpty();
$('btn-add-asset').onclick = () => assets.addAsset();

// ---------- 时间轴 UI ----------
$('tl-play').onclick = togglePlay;
$('tl-scrub').max = String(timeline.duration);
$('tl-scrub').oninput = () => { timeline.scrub(+$('tl-scrub').value); timeline.apply(project.scene()); updateTlLabel(); };
$('tl-add-track').onclick = () => {
  const id = selection.primary();
  if (id == null) { status('先选择对象'); return; }
  const o = project.scene().get(id);
  const tr = timeline.addTrack(id, 'position');
  if (tr) { timeline.key(id, 'position', o.transform.position, 0); status('已为 #' + id + ' 添加 position 轨道'); }
  else status('该对象已有 position 轨道');
};
$('tl-key').onclick = () => {
  const id = selection.primary();
  if (id == null) { status('先选择对象'); return; }
  const o = project.scene().get(id);
  if (timeline.key(id, 'position', o.transform.position)) status('关键帧 @ ' + timeline.time.toFixed(2) + 's');
  else status('该对象无 position 轨道');
};
function updateTlLabel() {
  $('tl-time').textContent = timeline.time.toFixed(2) + ' / ' + timeline.duration.toFixed(2) + 's';
  $('tl-scrub').value = String(timeline.time);
}

// ---------- 快捷键 ----------
addEventListener('keydown', (e) => {
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); commands.find(c => c.id === 'save').run(); }
  else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
  else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); redo(); }
  else if (e.key === ' ') { e.preventDefault(); togglePlay(); }
  else if (e.key === 'Delete' || e.key === 'Backspace') {
    const id = selection.primary();
    if (id != null) { history.push(project.scene(), 'delete'); api.del(id); selection.clear(); refresh(); }
  } else if (e.key.toLowerCase() === 'f') {
    const id = selection.primary(); const o = id != null ? project.scene().get(id) : null;
    if (o) { viewport.cam.target = [...o.transform.position]; viewport._applyCam(); }
  }
});

// ---------- 刷新与主循环 ----------
function refresh() {
  tabs.render(); hierarchy.render(); inspector.render(); assets.render();
  updateTlLabel();
}

let lastRender = 0;
let prevNow = 0;
function loop(now) {
  if (!viewport || !gizmo) { requestAnimationFrame(loop); return; }
  const dt = now - (prevNow || now); prevNow = now;
  viewport.resize();
  timeline.tick(1 / 60, project.scene());
  if (timeline.playing) { updateTlLabel(); }
  // GPU 视口解高帧率：webgl2 目标 60fps；软渲染仍限帧以省 CPU（红线 D：参考路径够用即可）
  const targetFps = viewport.backend === 'webgl2' ? 60 : 8;
  const interval = timeline.playing ? Math.min(1000 / 20, 1000 / targetFps) : 1000 / targetFps;
  if (now - lastRender > interval) {
    lastRender = now;
    const scene = playSession ? playSession.getRenderScene() : project.scene();
    if (playSession) playSession.step(dt);
    const renderFn = () => viewport.render(scene);
    // Profiler 计时（P5#7）：仅当面板存在时统计 render 分段与 drawCalls
    if (profiler.el) { profiler.beginFrame(); profiler.timed('render', renderFn); profiler.count('drawCalls', viewport.drawCalls); profiler.endFrame(); profiler.update(); }
    else renderFn();
    gizmo.draw();
    previews.update($('viewport'));
  }
  const ce = $('code-editor'); if (!codeEditor || !ce || ce.hidden) { /* debug 面板未开，跳过 */ } else updateCodeEditorDebug();
  hud.tick(viewport, project.scene());
  requestAnimationFrame(loop);
}

refresh();
status('就绪 — ' + [...project.scenes.keys()].join(', '));
requestAnimationFrame(loop);
