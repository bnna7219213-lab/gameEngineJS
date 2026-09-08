/* 生成《宣传+操作手册.pptx》 — Browser Game Engine
 * 所有概念图均用原生矢量形状绘制（无位图）。
 */
const pptxgen = require("pptxgenjs");

const p = new pptxgen();
p.layout = "LAYOUT_16x9"; // 10 x 5.625 in
p.author = "Browser Game Engine";
p.title = "Browser Game Engine — 宣传与操作手册";

// ---------- palette / fonts ----------
const C = {
  bgDark: "0B1526",
  dark2: "13253F",
  dark3: "1C3357",
  cyan: "35D6FF",
  cyanDark: "0891B2",
  green: "3BE08F",
  greenDark: "0E9F6E",
  amber: "FFC24B",
  red: "FF7A7A",
  purple: "9AA8FF",
  ink: "13233B",
  muted: "5C6B80",
  faint: "93A3B5",
  bgLight: "F3F7FB",
  card: "FFFFFF",
  line: "D9E3EF",
  chipBg: "E6F4FB",
  soft: "EDF3F9",
  grid: "E2EAF4",
};
const F = "Microsoft YaHei";
const CODE = "Consolas";

// OOXML preset geometry names (runtime-safe string shapes)
const S = {
  rect: "rect",
  round: "roundRect",
  oval: "ellipse",
  line: "line",
  arrowR: "rightArrow",
  arrowD: "downArrow",
  chev: "chevron",
  pie: "pie",
  blockArc: "blockArc",
  donut: "donut",
  tri: "triangle",
  para: "parallelogram",
  diamond: "diamond",
  plus: "plus",
  home: "homePlate",
};

const TOTAL = 19;
let pageNo = 0;

// ---------- helpers ----------
function newSlide(dark = false) {
  const s = p.addSlide();
  s.background = { color: dark ? C.bgDark : C.bgLight };
  pageNo += 1;
  if (pageNo > 1 && pageNo < TOTAL) {
    s.addText("Browser Game Engine · 宣传与操作手册", {
      x: 0.5, y: 5.36, w: 4.2, h: 0.2, fontSize: 7.5, color: dark ? C.faint : C.faint,
      fontFace: F, margin: 0,
    });
    s.addText(String(pageNo).padStart(2, "0") + " / " + TOTAL, {
      x: 8.6, y: 5.36, w: 0.9, h: 0.2, fontSize: 7.5, color: C.faint, align: "right",
      fontFace: F, margin: 0,
    });
  }
  return s;
}

function header(s, kicker, title, sub) {
  s.addShape(S.rect, { x: 0.5, y: 0.37, w: 0.15, h: 0.15, fill: { color: C.cyanDark } });
  s.addText(kicker, {
    x: 0.73, y: 0.3, w: 7.5, h: 0.28, fontSize: 10, bold: true, color: C.cyanDark,
    charSpacing: 2, fontFace: F, margin: 0, valign: "middle",
  });
  s.addText(title, {
    x: 0.5, y: 0.6, w: 9.0, h: 0.48, fontSize: 23, bold: true, color: C.ink,
    fontFace: F, margin: 0, valign: "middle",
  });
  if (sub) {
    s.addText(sub, {
      x: 0.5, y: 1.1, w: 9.0, h: 0.26, fontSize: 10.5, color: C.muted, fontFace: F, margin: 0,
    });
  }
}

function card(s, x, y, w, h, opts = {}) {
  s.addShape(S.round, {
    x, y, w, h, rectRadius: 0.055,
    fill: { color: opts.fill || C.card },
    line: { color: opts.line || C.line, width: opts.lw || 0.75 },
    shadow: opts.shadow
      ? { type: "outer", color: "8A9BB0", blur: 7, offset: 2, angle: 135, opacity: 0.22 }
      : undefined,
  });
}

function chip(s, x, y, w, text, opts = {}) {
  const h = opts.h || 0.3;
  s.addShape(S.round, {
    x, y, w, h, rectRadius: Math.min(0.05, h / 2.2),
    fill: { color: opts.fill || C.chipBg },
    line: opts.line ? { color: opts.line, width: 0.75, dashType: opts.dash || "solid" } : { color: opts.fill || C.chipBg, width: 0 },
  });
  s.addText(text, {
    x: x + 0.02, y, w: w - 0.04, h, fontSize: opts.fs || 9, bold: opts.bold !== false,
    color: opts.color || C.ink, align: opts.align || "center", valign: "middle",
    fontFace: opts.font || F, margin: 0,
  });
}

function bulletRows(s, x, y, w, items, opts = {}) {
  const rh = opts.rh || 0.34;
  items.forEach((it, i) => {
    const yy = y + i * rh;
    s.addShape(S.rect, {
      x, y: yy + (opts.rowH || rh) / 2 - 0.045, w: 0.09, h: 0.09,
      fill: { color: opts.sq || C.cyanDark }, line: { color: opts.sq || C.cyanDark, width: 0 },
    });
    s.addText(it, {
      x: x + 0.2, y: yy, w: w - 0.2, h: opts.rowH || rh, fontSize: opts.fs || 10.5,
      color: opts.color || C.ink, fontFace: F, margin: 0, valign: "middle",
    });
  });
}

function arrowR(s, x, y, color) {
  s.addShape(S.arrowR, { x, y, w: 0.26, h: 0.16, fill: { color: color || C.cyanDark }, line: { color: color || C.cyanDark, width: 0 } });
}

// =====================================================================
// Slide 7 — 编辑器与工具链（编辑器 UI 矢量示意图）
// =====================================================================
(() => {
  const s = newSlide();
  header(s, "EDITOR / 编辑器与工具链", "编辑器：打开浏览器即是完整 IDE", "GPU 视口 · 检视器 · 代码工作台 · Play 模式 · Profiler · OPFS 持久化");
  // ---- editor mockup (vector) ----
  const mx = 0.5, my = 1.42, mw = 4.7, mh = 3.78;
  card(s, mx, my, mw, mh, { shadow: true });
  // title bar
  s.addShape(S.rect, { x: mx, y: my, w: mw, h: 0.3, fill: { color: C.dark2 }, line: { color: C.dark2, width: 0 } });
  ["FF7A7A", "FFC24B", "3BE08F"].forEach((c, i) => {
    s.addShape(S.oval, { x: mx + 0.14 + i * 0.17, y: my + 0.1, w: 0.1, h: 0.1, fill: { color: c }, line: { color: c, width: 0 } });
  });
  s.addText("src/editor/index.html", { x: mx + 0.75, y: my, w: 3.0, h: 0.3, fontSize: 8, color: "B9C9DC", fontFace: CODE, margin: 0, valign: "middle" });
  // left tree
  const px = mx, py = my + 0.3, pw = 0.95, ph = 2.55;
  s.addShape(S.rect, { x: px, y: py, w: pw, h: ph, fill: { color: "F7FAFD" }, line: { color: C.line, width: 0.5 } });
  ["cube", "sun", "enemy", "coin", "ground", "camera"].forEach((t, i) => {
    s.addShape(S.rect, { x: px + 0.12, y: py + 0.18 + i * 0.36 + 0.05, w: 0.08, h: 0.08, fill: { color: i === 0 ? C.cyanDark : C.faint }, line: { color: C.faint, width: 0 } });
    s.addText(t, { x: px + 0.26, y: py + 0.12 + i * 0.36, w: pw - 0.3, h: 0.2, fontSize: 8, color: i === 0 ? C.cyanDark : C.muted, fontFace: CODE, margin: 0, bold: i === 0 });
    if (i === 0) s.addShape(S.rect, { x: px + 0.04, y: py + 0.1 + i * 0.36, w: pw - 0.08, h: 0.26, fill: { type: "none" }, line: { color: C.cyanDark, width: 0.75 } });
  });
  s.addText("层级树", { x: px + 0.1, y: py + ph - 0.26, w: pw - 0.2, h: 0.2, fontSize: 7, color: C.faint, fontFace: F, margin: 0 });
  // viewport
  const vx = px + pw, vw = mw - pw - 1.15, vy = py, vh = ph;
  s.addShape(S.rect, { x: vx, y: vy, w: vw, h: vh, fill: { color: C.dark2 }, line: { color: C.dark2, width: 0 } });
  for (let i = 1; i < 6; i++) {
    s.addShape(S.line, { x: vx + (vw / 6) * i, y: vy, w: 0, h: vh, line: { color: "1E3452", width: 0.5 } });
  }
  for (let i = 1; i < 5; i++) {
    s.addShape(S.line, { x: vx, y: vy + (vh / 5) * i, w: vw, h: 0, line: { color: "1E3452", width: 0.5 } });
  }
  // horizon + mesh
  s.addShape(S.line, { x: vx, y: vy + vh * 0.62, w: vw, h: 0, line: { color: "33527D", width: 1 } });
  s.addShape(S.tri, { x: vx + vw * 0.3, y: vy + vh * 0.3, w: vw * 0.36, h: vh * 0.32, fill: { color: C.cyan, transparency: 72 }, line: { color: C.cyan, width: 1 } });
  // gizmo
  const gx = vx + vw * 0.48, gy = vy + vh * 0.46;
  s.addShape(S.line, { x: gx, y: gy, w: 0.42, h: 0, line: { color: C.red, width: 1.75, endArrowType: "triangle" } });
  s.addShape(S.line, { x: gx, y: gy, w: 0, h: 0.42, line: { color: C.green, width: 1.75, endArrowType: "triangle" } });
  s.addShape(S.line, { x: gx, y: gy, w: 0.3, h: 0.3, flipV: true, line: { color: "6FA8FF", width: 1.75, endArrowType: "triangle" } });
  s.addText("GPU 视口 + Gizmo", { x: vx + 0.06, y: vy + vh - 0.24, w: vw - 0.12, h: 0.2, fontSize: 7, color: "7E93AC", fontFace: F, margin: 0 });
  // inspector
  const ix = vx + vw, iw = mw - pw - vw;
  s.addShape(S.rect, { x: ix, y: py, w: iw, h: ph, fill: { color: "F7FAFD" }, line: { color: C.line, width: 0.5 } });
  s.addText("检视器", { x: ix + 0.08, y: py + 0.06, w: iw - 0.16, h: 0.2, fontSize: 8, bold: true, color: C.ink, fontFace: F, margin: 0 });
  ["position", "rotation", "scale", "material", "particle"].forEach((t, i) => {
    s.addShape(S.round, { x: ix + 0.08, y: py + 0.34 + i * 0.3, w: iw - 0.16, h: 0.24, rectRadius: 0.035, fill: { color: C.soft }, line: { color: C.line, width: 0.5 } });
    s.addText(t, { x: ix + 0.14, y: py + 0.34 + i * 0.3, w: iw - 0.28, h: 0.24, fontSize: 7.5, color: C.muted, fontFace: CODE, margin: 0, valign: "middle" });
  });
  // bottom bar: timeline
  const by = my + 0.3 + ph;
  s.addShape(S.rect, { x: mx, y: by, w: mw, h: mh - 0.3 - ph, fill: { color: "FFFFFF" }, line: { color: C.line, width: 0.5 } });
  ["⏸", "⏭", "▶"].forEach((t, i) => {
    s.addShape(S.round, { x: mx + 0.1 + i * 0.3, y: by + 0.16, w: 0.26, h: 0.26, rectRadius: 0.04, fill: { color: C.soft }, line: { color: C.line, width: 0.5 } });
    s.addText(t, { x: mx + 0.1 + i * 0.3, y: by + 0.16, w: 0.26, h: 0.26, fontSize: 9, color: C.ink, align: "center", valign: "middle", fontFace: F, margin: 0 });
  });
  s.addShape(S.line, { x: mx + 1.15, y: by + 0.29, w: mw - 1.35, h: 0, line: { color: C.line, width: 2 } });
  s.addShape(S.line, { x: mx + 1.15, y: by + 0.29, w: (mw - 1.35) * 0.4, h: 0, line: { color: C.cyanDark, width: 2 } });
  s.addShape(S.oval, { x: mx + 1.15 + (mw - 1.35) * 0.4 - 0.045, y: by + 0.245, w: 0.09, h: 0.09, fill: { color: C.cyanDark }, line: { color: "FFFFFF", width: 0.75 } });
  s.addText("时间轴 / 动画 / 粒子生命周期", { x: mx + 1.15, y: by + 0.38, w: mw - 1.3, h: 0.16, fontSize: 6.5, color: C.faint, fontFace: F, margin: 0 });
  // ---- right feature lists ----
  card(s, 5.4, 1.42, 4.1, 2.28);
  s.addText("编辑器功能", { x: 5.62, y: 1.54, w: 3.0, h: 0.28, fontSize: 12.5, bold: true, color: C.ink, fontFace: F, margin: 0 });
  bulletRows(s, 5.65, 1.9, 3.7, [
    "GPU 视口（实时渲染 + Gizmo + 网格/坐标轴）",
    "层级树 + 检视器（transform/material/particle）",
    "撤销重做 / 命令面板 / 多场景管理",
    "Play 模式：暂停 / 单步 / 热重载 / 断点",
    "代码工作台：Worker 语法校验 / tokenizer 高亮",
    "Profiler：帧时间线 / draw call / 内存面板",
  ], { rh: 0.29, fs: 9 });
  card(s, 5.4, 3.86, 4.1, 1.34);
  s.addText("平台层", { x: 5.62, y: 3.96, w: 3.0, h: 0.26, fontSize: 12.5, bold: true, color: C.ink, fontFace: F, margin: 0 });
  bulletRows(s, 5.65, 4.26, 3.7, [
    "OPFS + File System Access 持久化",
    "GLTF 2.0（.glb 往返）/ 骨骼动画 + mixer",
    "图片解码 / DDC 编译缓存 / Worker 池",
  ], { rh: 0.29, fs: 9, sq: C.green });
})();


p.writeFile({ fileName: "c:/Users/bnna7/workspace/gameEngineJS/build/t_range.pptx" }).then(() => console.log("RANGE_DONE"));
