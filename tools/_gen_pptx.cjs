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
// Slide 1 — 封面
// =====================================================================
(() => {
  const s = newSlide(true);
  // decorative vector stack (parallelograms = engine layers)
  const layers = [
    { x: 6.55, y: 3.35, c: C.cyan, t: 62 },
    { x: 6.95, y: 2.75, c: C.green, t: 62 },
    { x: 7.35, y: 2.15, c: C.amber, t: 55 },
  ];
  layers.forEach((L) => {
    s.addShape(S.para, {
      x: L.x, y: L.y, w: 2.1, h: 0.72, fill: { color: L.c, transparency: L.t },
      line: { color: L.c, width: 1.25 },
    });
  });
  s.addText("RUNTIME / EDITOR / CORE", {
    x: 6.55, y: 4.14, w: 2.9, h: 0.24, fontSize: 8, color: C.faint, fontFace: CODE, margin: 0, align: "center",
  });
  // wireframe triangle
  s.addShape(S.tri, {
    x: 8.3, y: 0.28, w: 1.1, h: 0.92, fill: { type: "none" },
    line: { color: C.cyan, width: 1.5, transparency: 20 },
  });
  s.addShape(S.oval, { x: 8.79, y: 0.2, w: 0.11, h: 0.11, fill: { color: C.amber }, line: { color: C.amber, width: 0 } });
  s.addShape(S.oval, { x: 8.24, y: 1.14, w: 0.1, h: 0.1, fill: { color: C.cyan }, line: { color: C.cyan, width: 0 } });
  s.addShape(S.oval, { x: 9.34, y: 1.14, w: 0.1, h: 0.1, fill: { color: C.green }, line: { color: C.green, width: 0 } });
  // faint grid
  for (let i = 0; i < 5; i++) {
    s.addShape(S.line, { x: 0.5, y: 4.72 + i * 0.001, w: 0, h: 0, line: { color: C.bgDark, width: 0 } });
  }
  // tag chips
  const tags = [
    ["WebGL2 / WebGPU 双后端", 2.35],
    ["零后端算力", 1.05],
    ["零运行时依赖", 1.25],
    ["纯 ES2022", 1.1],
  ];
  let tx = 0.62;
  tags.forEach(([t, w]) => {
    chip(s, tx, 2.62, w, t, { fill: C.dark2, color: C.cyan, fs: 9.5, line: C.dark3 });
    tx += w + 0.15;
  });
  s.addText("BROWSER GAME ENGINE", {
    x: 0.62, y: 1.02, w: 8.0, h: 0.3, fontSize: 13, bold: true, color: C.cyan,
    charSpacing: 5, fontFace: CODE, margin: 0,
  });
  s.addText("取代 Three.js 的真正游戏引擎", {
    x: 0.6, y: 1.35, w: 8.0, h: 0.75, fontSize: 34, bold: true, color: "FFFFFF", fontFace: F, margin: 0,
  });
  s.addText("浏览器端独立运行完整 3D 游戏 · 对标 Unity6 浏览器端能力", {
    x: 0.62, y: 2.22, w: 6.5, h: 0.3, fontSize: 13, color: "C9D8EA", fontFace: F, margin: 0,
  });
  s.addShape(S.line, { x: 0.62, y: 4.5, w: 8.76, h: 0, line: { color: C.dark3, width: 1 } });
  s.addText([
    { text: "项目代号 Browser Game Engine", options: {} },
    { text: "    ·    ", options: { color: C.dark3 } },
    { text: "2026-09", options: {} },
    { text: "    ·    ", options: { color: C.dark3 } },
    { text: "v2 Roadmap", options: {} },
    { text: "    ·    ", options: { color: C.dark3 } },
    { text: "宣传 + 操作手册", options: { color: C.cyan } },
  ], { x: 0.62, y: 4.62, w: 8.8, h: 0.3, fontSize: 11, color: "AFC2D6", fontFace: F, margin: 0 });
})();

// =====================================================================
// Slide 2 — 为什么需要它（四象限概念图）
// =====================================================================
(() => {
  const s = newSlide();
  header(s, "WHY / 市场空白", "为什么需要它", "Three.js 是渲染库，Unity 依赖后端，Godot Web 受限 —— 「打开浏览器就能做游戏」的位置仍然空着");
  // left pain points
  card(s, 0.5, 1.42, 4.35, 3.78);
  s.addText("行业痛点", { x: 0.72, y: 1.58, w: 3.9, h: 0.3, fontSize: 13, bold: true, color: C.ink, fontFace: F, margin: 0 });
  const pains = [
    ["Three.js 是渲染库，不是游戏引擎", "无物理 / 无音频 / 无编辑器 / 无协作 / 无导出"],
    ["Unity / Unreal 需要后端服务器", "无法纯浏览器部署，打包链路重"],
    ["Godot Web 版本性能受限", "WASM + WebGL1，体积与启动慢"],
    ["教育 / 原型 / 轻量游戏缺工具", "没有「打开浏览器就能做游戏」的选项"],
  ];
  pains.forEach((pn, i) => {
    const yy = 1.95 + i * 0.8;
    s.addShape(S.round, { x: 0.72, y: yy, w: 0.26, h: 0.26, rectRadius: 0.05, fill: { color: "FDECEC" }, line: { color: C.red, width: 0.75 } });
    s.addText("!", { x: 0.72, y: yy, w: 0.26, h: 0.26, fontSize: 12, bold: true, color: C.red, align: "center", valign: "middle", fontFace: F, margin: 0 });
    s.addText(pn[0], { x: 1.1, y: yy - 0.03, w: 3.6, h: 0.28, fontSize: 11.5, bold: true, color: C.ink, fontFace: F, margin: 0 });
    s.addText(pn[1], { x: 1.1, y: yy + 0.25, w: 3.6, h: 0.26, fontSize: 9.5, color: C.muted, fontFace: F, margin: 0 });
  });
  // right: quadrant concept chart (vector)
  card(s, 5.05, 1.42, 4.45, 3.78);
  s.addText("四象限定位图", { x: 5.27, y: 1.58, w: 3.9, h: 0.3, fontSize: 13, bold: true, color: C.ink, fontFace: F, margin: 0 });
  const qx = 5.55, qy = 2.05, qw = 3.45, qh = 2.5;
  s.addShape(S.rect, { x: qx, y: qy, w: qw, h: qh, fill: { color: "FAFCFE" }, line: { color: C.line, width: 0.75 } });
  s.addShape(S.line, { x: qx + qw / 2, y: qy, w: 0, h: qh, line: { color: C.line, width: 1 } });
  s.addShape(S.line, { x: qx, y: qy + qh / 2, w: qw, h: 0, line: { color: C.line, width: 1 } });
  // axis labels
  s.addText("← 浏览器", { x: qx, y: qy + qh + 0.02, w: 1.2, h: 0.18, fontSize: 8.5, color: C.faint, fontFace: F, margin: 0 });
  s.addText("原生 →", { x: qx + qw - 1.0, y: qy + qh + 0.02, w: 1.0, h: 0.18, fontSize: 8.5, color: C.faint, align: "right", fontFace: F, margin: 0 });
  s.addText("完整引擎 ↑", { x: qx + 0.1, y: qy + 0.08, w: 1.0, h: 0.2, fontSize: 8.5, color: C.faint, fontFace: F, margin: 0 });
  s.addText("渲染库 ↓", { x: qx + qw - 1.1, y: qy + qh - 0.28, w: 1.0, h: 0.2, fontSize: 8.5, color: C.faint, align: "right", fontFace: F, margin: 0 });
  function dot(x, y, label, hot) {
    s.addShape(S.oval, {
      x: x - 0.09, y: y - 0.09, w: 0.18, h: 0.18,
      fill: { color: hot ? C.cyanDark : C.muted }, line: { color: "FFFFFF", width: 1 },
    });
    s.addText(label, {
      x: x - 0.75, y: y + 0.1, w: 1.5, h: 0.22, fontSize: 9, bold: !!hot,
      color: hot ? C.cyanDark : C.muted, align: "center", fontFace: F, margin: 0,
    });
  }
  dot(qx + 0.85, qy + 1.95, "Three.js", false);      // browser + library
  dot(qx + 1.05, qy + 0.78, "Godot Web", false);      // browser + engine-ish
  dot(qx + 2.75, qy + 0.62, "Unity", false);          // native + engine
  dot(qx + 0.62, qy + 0.55, "本引擎", true);          // browser + full engine
  s.addShape(S.oval, {
    x: qx + 0.62 - 0.22, y: qy + 0.55 - 0.22, w: 0.44, h: 0.44,
    fill: { color: C.cyan, transparency: 75 }, line: { color: C.cyanDark, width: 0.75 },
  });
  // our positioning strip
  s.addShape(S.round, { x: 5.27, y: 4.72, w: 4.0, h: 0.34, rectRadius: 0.05, fill: { color: "E4FBF1" }, line: { color: C.green, width: 0.75 } });
  s.addText("本引擎 = 浏览器 × 完整引擎 的唯一交点", {
    x: 5.27, y: 4.72, w: 4.0, h: 0.34, fontSize: 10.5, bold: true, color: C.greenDark, align: "center", valign: "middle", fontFace: F, margin: 0,
  });
})();

// =====================================================================
// Slide 3 — 当前状态一览（仪表盘：7 个环形进度）
// =====================================================================
(() => {
  const s = newSlide();
  header(s, "STATUS / 当前状态", "当前状态一览", "v1 全量交付 + v2 Q1/Q5 已完成，50 个 smoke · 1596 断言全绿");
  const qs = [
    ["Q1", "物理 3D", 80, true],
    ["Q2", "音频/网络", 0, false],
    ["Q3", "TAA/Hi-Z", 0, false],
    ["Q4", "WebGPU", 0, false],
    ["Q5", "Worker 池", 40, true],
    ["Q6", "多人协作", 0, false],
    ["Q7", "导出/游戏", 0, false],
  ];
  const rw = 0.92, gap = (9.0 - 7 * rw) / 6;
  qs.forEach((q, i) => {
    const x = 0.5 + i * (rw + gap);
    const y = 1.62;
    // track
    s.addShape(S.donut, { x, y, w: rw, h: rw, fill: { color: C.grid }, line: { color: C.grid, width: 0 } });
    if (q[2] > 0) {
      const sweep = (q[2] / 100) * 360;
      const end = 270 + sweep;
      s.addShape(S.blockArc, {
        x: x - 0.02, y: y - 0.02, w: rw + 0.04, h: rw + 0.04,
        fill: { color: C.green }, line: { color: C.green, width: 0 },
        angleRange: [270, end > 360 ? end - 360 : end], arcThicknessRatio: 0.22,
      });
    } else {
      s.addShape(S.blockArc, {
        x: x - 0.02, y: y - 0.02, w: rw + 0.04, h: rw + 0.04,
        fill: { color: C.faint }, line: { color: C.faint, width: 0 },
        angleRange: [270, 282], arcThicknessRatio: 0.22,
      });
    }
    s.addText(q[2] > 0 ? q[2] + "%" : "—", {
      x: x - 0.1, y: y + 0.22, w: rw + 0.2, h: 0.48, fontSize: 13, bold: true,
      color: q[2] > 0 ? C.greenDark : C.faint, align: "center", valign: "middle", fontFace: F, margin: 0,
    });
    s.addText(q[0], { x, y: y + rw + 0.08, w: rw, h: 0.24, fontSize: 11, bold: true, color: C.ink, align: "center", fontFace: F, margin: 0 });
    s.addText(q[1], { x: x - 0.18, y: y + rw + 0.3, w: rw + 0.36, h: 0.22, fontSize: 8.5, color: C.muted, align: "center", fontFace: F, margin: 0 });
  });
  // delivered table card
  card(s, 0.5, 3.32, 9.0, 1.86);
  s.addText("已交付（v1 + v2 部分）", { x: 0.72, y: 3.46, w: 4.0, h: 0.28, fontSize: 12.5, bold: true, color: C.ink, fontFace: F, margin: 0 });
  const rows = [
    ["引擎源码", "109 个 JS 模块"],
    ["自动化测试", "50 个 smoke / 1596 断言 全绿"],
    ["游戏 Demo", "4 个（action3d / breakout / match3 / space_shooter）"],
    ["渲染后端", "WebGL2 RHI（完整）+ Software 黄金参考 + WebGPU（空壳）"],
    ["物理 / 编辑器 / 平台", "GJK+EPA 刚体 · GPU 视口 · Play 模式 · OPFS / GLTF / 骨骼动画 / DDC"],
  ];
  rows.forEach((r, i) => {
    const yy = 3.8 + i * 0.27;
    s.addShape(S.rect, { x: 0.75, y: yy + 0.075, w: 0.08, h: 0.08, fill: { color: C.cyanDark }, line: { color: C.cyanDark, width: 0 } });
    s.addText(r[0], { x: 0.95, y: yy, w: 2.0, h: 0.24, fontSize: 10, bold: true, color: C.ink, fontFace: F, margin: 0, valign: "middle" });
    s.addText(r[1], { x: 3.0, y: yy, w: 6.3, h: 0.24, fontSize: 10, color: C.muted, fontFace: F, margin: 0, valign: "middle" });
  });
})();

// =====================================================================
// Slide 4 — 架构图（全景，4 层矢量堆叠）
// =====================================================================
(() => {
  const s = newSlide();
  header(s, "ARCHITECTURE / 全景架构", "架构图（全景）", "编辑器 → 运行时单向依赖；CPU 黄金参考永不下线；确定性可重现");
  const lx = 0.5, lw = 6.3;
  const layer = (y, h, name, fill, textColor, chips) => {
    s.addShape(S.round, { x: lx, y, w: lw, h, rectRadius: 0.05, fill: { color: fill }, line: { color: fill, width: 0 } });
    s.addText(name, { x: lx + 0.22, y: y + 0.06, w: 1.9, h: 0.3, fontSize: 12.5, bold: true, color: textColor, fontFace: F, margin: 0, valign: "middle" });
    let cx = lx + 0.24;
    const cy = y + 0.42;
    chips.forEach((c) => {
      const w = 0.24 + c.length * 0.105;
      if (cx + w > lx + lw - 0.2) return;
      s.addShape(S.round, { x: cx, y: cy, w, h: 0.28, rectRadius: 0.045, fill: { color: "FFFFFF", transparency: 82 }, line: { color: textColor, width: 0.5 } });
      s.addText(c, { x: cx, y: cy, w, h: 0.28, fontSize: 8.5, color: textColor, align: "center", valign: "middle", fontFace: F, margin: 0 });
      cx += w + 0.1;
    });
  };
  layer(1.42, 0.78, "Editor 编辑器", C.dark2, "FFFFFF", ["层级树", "检视器", "代码工作台", "视口", "Profiler", "命令面板"]);
  layer(2.28, 1.42, "Runtime 运行时", C.dark3, "FFFFFF", []);
  // runtime inner columns
  const cols = [
    ["Render", "WebGL2 · PBR", "PostFX · Hi-Z"],
    ["Sim", "Physics GJK/EPA", "Char · Raycast"],
    ["Infer", "Neural · Net", "NanoTensor"],
    ["Platform", "GLTF · Image", "DDC · Cache"],
    ["EditorCode", "Scripts · Debug", "Worker"],
  ];
  const cw = (lw - 0.48 - 4 * 0.12) / 5;
  cols.forEach((c, i) => {
    const x = lx + 0.24 + i * (cw + 0.12);
    s.addShape(S.round, { x, y: 2.7, w: cw, h: 0.86, rectRadius: 0.045, fill: { color: "0E2038" }, line: { color: "2C4B77", width: 0.75 } });
    s.addText(c[0], { x: x + 0.06, y: 2.74, w: cw - 0.12, h: 0.24, fontSize: 9.5, bold: true, color: C.cyan, fontFace: F, margin: 0 });
    s.addText(c[1] + "\n" + c[2], { x: x + 0.06, y: 2.98, w: cw - 0.12, h: 0.54, fontSize: 7.5, color: "B9C9DC", fontFace: F, margin: 0 });
  });
  s.addText("GameRuntime · ScriptEngine · PlaySession", { x: lx + 2.2, y: 2.33, w: 4.0, h: 0.26, fontSize: 9.5, color: "B9C9DC", fontFace: F, margin: 0, valign: "middle" });
  layer(3.78, 0.78, "Core 核心", "22406B", "FFFFFF", ["数学", "Rng", "JSON", "Profiler", "确定性"]);
  // dependency arrows
  [2.2, 3.7].forEach((yy) => {
    s.addShape(S.arrowD, { x: 6.95, y: yy, w: 0.3, h: 0.34, fill: { color: C.cyanDark }, line: { color: C.cyanDark, width: 0 } });
  });
  s.addText("单向依赖", { x: 6.78, y: 4.06, w: 0.9, h: 0.2, fontSize: 8, color: C.muted, align: "center", fontFace: F, margin: 0 });
  // principles
  card(s, 7.55, 1.42, 1.95, 3.78);
  s.addText("设计原则", { x: 7.72, y: 1.56, w: 1.6, h: 0.28, fontSize: 12, bold: true, color: C.ink, fontFace: F, margin: 0 });
  bulletRows(s, 7.72, 1.94, 1.68, ["单后端自包含", "非微服务", "CPU 黄金参考", "parity 断言", "编辑器→运行时", "单向依赖", "确定性可重现", "固定 key 序"], { rh: 0.39, fs: 9.5 });
})();

// =====================================================================
// Slide 5 — 渲染管线（矢量流程）
// =====================================================================
(() => {
  const s = newSlide();
  header(s, "RENDERING / 渲染管线", "WebGL2 RHI 完整渲染管线", "VertexLayout / FBO / MRT / MSAA / Instancing · PBR GGX · PCF 阴影 · IBL · 后处理链");
  const stages = ["Draw Call", "Geometry", "Lighting", "Shadow", "PostFX", "TAA", "Output"];
  const colors = ["13253F", "1B3355", "24426C", "2D5182", "0891B2", "0AA6C9", "35D6FF"];
  let x = 0.5;
  stages.forEach((st, i) => {
    const w = 1.36;
    const last = i === stages.length - 1;
    s.addShape(S.chev, { x, y: 1.5, w, h: 0.52, fill: { color: colors[i] }, line: { color: colors[i], width: 0 } });
    s.addText(st, { x: x + 0.1, y: 1.5, w: w - 0.08, h: 0.52, fontSize: 10, bold: true, color: last ? "0B1526" : "FFFFFF", align: "center", valign: "middle", fontFace: F, margin: 0 });
    x += 1.225;
  });
  // GPU lane
  card(s, 0.5, 2.28, 4.4, 1.5);
  s.addShape(S.rect, { x: 0.5, y: 2.28, w: 0.09, h: 1.5, fill: { color: C.cyanDark }, line: { color: C.cyanDark, width: 0 } });
  s.addText("GPU 路径 · WebGL2 / WebGPU", { x: 0.75, y: 2.38, w: 4.0, h: 0.26, fontSize: 11.5, bold: true, color: C.cyanDark, fontFace: F, margin: 0 });
  bulletRows(s, 0.78, 2.7, 4.0, ["PBR GGX（Albedo/Rough/Metal/Normal/Emission）", "PCF 阴影 / 灯光表 / IBL / 雾 / 后处理链", "VertexLayout / Uniform 声明表 / RGB·Float·SRGB 纹理"], { rh: 0.34, fs: 9.5 });
  // CPU lane
  card(s, 5.1, 2.28, 4.4, 1.5);
  s.addShape(S.rect, { x: 5.1, y: 2.28, w: 0.09, h: 1.5, fill: { color: C.green }, line: { color: C.green, width: 0 } });
  s.addText("CPU 路径 · Software 黄金参考", { x: 5.35, y: 2.38, w: 4.0, h: 0.26, fontSize: 11.5, bold: true, color: C.greenDark, fontFace: F, margin: 0 });
  bulletRows(s, 5.38, 2.7, 4.0, ["纯 JS 光栅器，任何环境可运行", "Parity 断言：WebGL2 vs Software 逐像素对比", "容差 ≤ 2/255，数值正确性可验证"], { rh: 0.34, fs: 9.5, sq: C.green });
  // parity badge
  s.addShape(S.round, { x: 3.55, y: 3.92, w: 2.9, h: 0.34, rectRadius: 0.06, fill: { color: C.ink }, line: { color: C.ink, width: 0 } });
  s.addText("PARITY ≤ 2/255 · 逐像素对齐", { x: 3.55, y: 3.92, w: 2.9, h: 0.34, fontSize: 9.5, bold: true, color: C.cyan, align: "center", valign: "middle", fontFace: CODE, margin: 0 });
  // pending
  s.addText("待完成（Q3/Q4）", { x: 0.5, y: 4.34, w: 2.2, h: 0.26, fontSize: 11, bold: true, color: C.ink, fontFace: F, margin: 0 });
  chip(s, 0.5, 4.64, 2.7, "TAA：Halton jitter + 运动矢量", { fill: "FFFFFF", line: C.amber, color: "8A6210", fs: 9.5 });
  chip(s, 3.35, 4.64, 2.7, "Hi-Z GPU 归约 + 遮挡剔除", { fill: "FFFFFF", line: C.amber, color: "8A6210", fs: 9.5 });
  chip(s, 6.2, 4.64, 3.3, "WebGPU 后端：WGSL 双轨 + compute", { fill: "FFFFFF", line: C.amber, color: "8A6210", fs: 9.5 });
})();

// =====================================================================
// Slide 6 — 物理 3D（Q1 ✅）
// =====================================================================
(() => {
  const s = newSlide();
  header(s, "PHYSICS 3D / Q1 已完成", "物理 3D：GJK + EPA + Sequential Impulse", "真实物理管线在浏览器端 100% 运行，无 WASM、无第三方库");
  card(s, 0.5, 1.42, 4.5, 2.6);
  s.addText("已实现", { x: 0.72, y: 1.54, w: 3.0, h: 0.28, fontSize: 12.5, bold: true, color: C.ink, fontFace: F, margin: 0 });
  bulletRows(s, 0.75, 1.9, 4.1, [
    "GJK 稳健版（_resolve3/_resolve4 · 26 方向采样）",
    "EPA 穿透深度（多面体扩展 · 4 面退化处理）",
    "Sequential Impulse（摩擦锥 / 恢复系数 / Baumgarte）",
    "多点接触（box-plane 8 顶点采样）+ 休眠双阈值",
    "形状：Box / Sphere / Capsule / Plane / Convex",
    "Raycast 全形状 + CharacterController（扫掠/滑墙/台阶）",
  ], { rh: 0.34, fs: 9.5, sq: C.green });
  // test results
  card(s, 5.2, 1.42, 4.3, 2.6);
  s.addText("测试结果（Node headless）", { x: 5.42, y: 1.54, w: 3.8, h: 0.28, fontSize: 12.5, bold: true, color: C.ink, fontFace: F, margin: 0 });
  const tests = [
    ["sim_physics3d", "21", "球-球 / 盒-盒 / 堆叠稳定 / 休眠"],
    ["sim_raycast", "14", "全形状 + 旋转盒 + Capsule"],
    ["sim_raycast_convex", "3", "AABB 预检 + 二分命中"],
    ["sim_character", "9", "重力 / 台阶 / 坡度 / 碰撞"],
  ];
  tests.forEach((t, i) => {
    const yy = 1.92 + i * 0.5;
    s.addText(t[1], { x: 5.45, y: yy, w: 0.62, h: 0.42, fontSize: 19, bold: true, color: C.greenDark, fontFace: CODE, margin: 0, valign: "middle" });
    s.addText([{ text: t[0], options: { fontFace: CODE, fontSize: 10, bold: true, color: C.ink, breakLine: true } },
               { text: t[2], options: { fontFace: F, fontSize: 8.5, color: C.muted } }],
      { x: 6.15, y: yy, w: 3.2, h: 0.46, margin: 0, valign: "middle" });
    if (i < 3) s.addShape(S.line, { x: 6.15, y: yy + 0.47, w: 3.1, h: 0, line: { color: C.line, width: 0.5 } });
  });
  // pipeline flow
  const flow = ["Broad Phase", "GJK 相交", "EPA 穿透", "Seq. Impulse", "Sleep 休眠", "Character"];
  let fx = 0.5;
  flow.forEach((f, i) => {
    const w = 1.38;
    s.addShape(S.round, { x: fx, y: 4.28, w, h: 0.5, rectRadius: 0.06, fill: { color: C.dark2 }, line: { color: C.dark2, width: 0 } });
    s.addText(f, { x: fx, y: 4.28, w, h: 0.5, fontSize: 9.5, bold: true, color: "FFFFFF", align: "center", valign: "middle", fontFace: F, margin: 0 });
    if (i < flow.length - 1) arrowR(s, fx + w + 0.045, 4.45, C.cyanDark);
    fx += w + 0.135;
  });
  s.addText("物理管线", { x: 0.5, y: 4.05, w: 3.0, h: 0.22, fontSize: 9.5, bold: true, color: C.muted, fontFace: F, margin: 0 });
})();

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

// =====================================================================
// Slide 8 — Worker 池（Q5 ✅ 协议层）
// =====================================================================
(() => {
  const s = newSlide();
  header(s, "WORKER / Q5 协议层已完成", "Worker 池：主线程永不阻塞", "通用任务协议 { id, type, payload } → { id, result | error, progress }");
  // main thread
  s.addShape(S.round, { x: 0.5, y: 1.6, w: 2.05, h: 0.95, rectRadius: 0.06, fill: { color: C.dark2 }, line: { color: C.dark2, width: 0 } });
  s.addText([{ text: "主线程", options: { fontSize: 12, bold: true, color: "FFFFFF", breakLine: true } },
             { text: "游戏 / 编辑器", options: { fontSize: 8.5, color: "B9C9DC" } }],
    { x: 0.5, y: 1.6, w: 2.05, h: 0.95, align: "center", valign: "middle", fontFace: F, margin: 0 });
  arrowR(s, 2.65, 1.98, C.cyanDark);
  // pool
  s.addShape(S.round, { x: 3.0, y: 1.6, w: 2.0, h: 0.95, rectRadius: 0.06, fill: { color: C.cyanDark }, line: { color: C.cyanDark, width: 0 } });
  s.addText([{ text: "WorkerPool.submit()", options: { fontSize: 10.5, bold: true, color: "FFFFFF", fontFace: CODE, breakLine: true } },
             { text: "任务队列 · 调度", options: { fontSize: 8.5, color: "D6F6FF" } }],
    { x: 3.0, y: 1.6, w: 2.0, h: 0.95, align: "center", valign: "middle", fontFace: F, margin: 0 });
  // workers
  for (let i = 0; i < 3; i++) {
    const wy = 1.42 + i * 0.5;
    s.addShape(S.round, { x: 5.6, y: wy, w: 1.7, h: 0.4, rectRadius: 0.06, fill: { color: "FFFFFF" }, line: { color: C.cyanDark, width: 1 } });
    s.addText("Worker #" + i, { x: 5.6, y: wy, w: 1.7, h: 0.4, fontSize: 9.5, bold: true, color: C.cyanDark, align: "center", valign: "middle", fontFace: CODE, margin: 0 });
    s.addShape(S.line, { x: 5.0, y: Math.min(2.07, wy + 0.2), w: 0.6, h: Math.abs(wy + 0.2 - 2.07), flipV: wy + 0.2 < 2.07, line: { color: C.cyanDark, width: 1 } });
  }
  // return path
  s.addShape(S.line, { x: 6.45, y: 2.92, w: 0, h: 0.28, line: { color: C.green, width: 1.25 } });
  s.addShape(S.line, { x: 1.5, y: 3.2, w: 4.95, h: 0, line: { color: C.green, width: 1.25 } });
  s.addShape(S.line, { x: 1.5, y: 2.55, w: 0, h: 0.65, line: { color: C.green, width: 1.25, beginArrowType: "triangle" } });
  s.addText("postMessage 回传：result | error | progress", { x: 2.1, y: 3.0, w: 3.8, h: 0.2, fontSize: 8.5, color: C.greenDark, fontFace: CODE, margin: 0 });
  // zero-copy badge
  s.addShape(S.round, { x: 6.05, y: 1.1, w: 1.55, h: 0.26, rectRadius: 0.05, fill: { color: "FFF4DC" }, line: { color: C.amber, width: 0.75 } });
  s.addText("Transferable 零拷贝", { x: 6.05, y: 1.1, w: 1.55, h: 0.26, fontSize: 8, bold: true, color: "8A6210", align: "center", valign: "middle", fontFace: F, margin: 0 });
  // task table (vector rows)
  card(s, 0.5, 3.52, 4.85, 1.66);
  s.addText("5 种内置任务", { x: 0.7, y: 3.62, w: 3.0, h: 0.26, fontSize: 11.5, bold: true, color: C.ink, fontFace: F, margin: 0 });
  const tasks = [
    ["import-gltf", "GLB 解析 / JSON 场景树"],
    ["decode-image", "PNG/JPEG 识别 / 尺寸提取"],
    ["ddc-bake", "FNV1a 哈希 / 参数烘焙"],
    ["mesh-compress", "顶点/索引压缩 / 哈希"],
    ["custom", "用户自定义函数"],
  ];
  tasks.forEach((t, i) => {
    const yy = 3.92 + i * 0.24;
    s.addText(t[0], { x: 0.72, y: yy, w: 1.45, h: 0.2, fontSize: 9, bold: true, color: C.cyanDark, fontFace: CODE, margin: 0, valign: "middle" });
    s.addText(t[1], { x: 2.2, y: yy, w: 3.0, h: 0.2, fontSize: 9, color: C.muted, fontFace: F, margin: 0, valign: "middle" });
  });
  // dual path
  card(s, 5.55, 3.52, 3.95, 0.78);
  s.addText([{ text: "浏览器路径  ", options: { bold: true, color: C.cyanDark, fontSize: 10 } },
             { text: "Web Worker + Transferable 零拷贝", options: { color: C.ink, fontSize: 9.5 } }],
    { x: 5.75, y: 3.62, w: 3.6, h: 0.58, fontFace: F, margin: 0, valign: "middle" });
  card(s, 5.55, 4.4, 3.95, 0.78);
  s.addText([{ text: "Node 路径    ", options: { bold: true, color: C.greenDark, fontSize: 10 } },
             { text: "顺序降级（微任务队列 / 异步语义不变）", options: { color: C.ink, fontSize: 9.5 } }],
    { x: 5.75, y: 4.5, w: 3.6, h: 0.58, fontFace: F, margin: 0, valign: "middle" });
})();

// =====================================================================
// Slide 9 — 测试体系（覆盖域 + 热力条）
// =====================================================================
(() => {
  const s = newSlide();
  header(s, "QUALITY / 测试体系", "50 个 smoke · 1596 断言 · 全部 Node headless", "无外部依赖，全量执行 ~500ms；每个模块必须配套 smoke");
  const cov = [
    ["Core（数学/Rng/JSON/Profiler）", 2, 43, "core_smoke(31) / profiler_timeline(12)"],
    ["Render（RHI/PBR/Shadow/PostFX）", 14, 941, "render_primitives(908) / render_ibl(33)"],
    ["Sim（物理/角色/粒子）", 5, 47, "sim_physics3d(21) / sim_raycast(14)"],
    ["Platform（GLTF/Image/Worker/Cache）", 6, 57, "plat_worker(35) / plat_skin(22)"],
    ["Editor（视口/代码/Profiler/Debug）", 7, 53, "editor_smoke(32) / editor_code(21)"],
    ["Game/Play（脚本/会话/推理）", 4, 25, "play_session(10) / infer(15)"],
  ];
  card(s, 0.5, 1.42, 5.55, 3.0);
  s.addText("覆盖域", { x: 0.72, y: 1.52, w: 3.0, h: 0.26, fontSize: 12, bold: true, color: C.ink, fontFace: F, margin: 0 });
  // header row
  s.addText("类别", { x: 0.72, y: 1.84, w: 2.4, h: 0.22, fontSize: 8.5, bold: true, color: C.faint, fontFace: F, margin: 0 });
  s.addText("Smoke", { x: 3.14, y: 1.84, w: 0.55, h: 0.22, fontSize: 8.5, bold: true, color: C.faint, align: "center", fontFace: F, margin: 0 });
  s.addText("断言", { x: 3.72, y: 1.84, w: 0.55, h: 0.22, fontSize: 8.5, bold: true, color: C.faint, align: "center", fontFace: F, margin: 0 });
  s.addText("代表性测试", { x: 4.32, y: 1.84, w: 1.65, h: 0.22, fontSize: 8.5, bold: true, color: C.faint, fontFace: F, margin: 0 });
  cov.forEach((r, i) => {
    const yy = 2.1 + i * 0.38;
    if (i % 2 === 0) s.addShape(S.rect, { x: 0.62, y: yy - 0.03, w: 5.3, h: 0.34, fill: { color: "F7FAFD" }, line: { color: "F7FAFD", width: 0 } });
    s.addText(r[0], { x: 0.72, y: yy, w: 2.4, h: 0.28, fontSize: 8.5, color: C.ink, fontFace: F, margin: 0, valign: "middle" });
    s.addText(String(r[1]), { x: 3.14, y: yy, w: 0.55, h: 0.28, fontSize: 9.5, bold: true, color: C.ink, align: "center", fontFace: CODE, margin: 0, valign: "middle" });
    s.addText(String(r[2]), { x: 3.72, y: yy, w: 0.55, h: 0.28, fontSize: 9.5, bold: true, color: C.cyanDark, align: "center", fontFace: CODE, margin: 0, valign: "middle" });
    s.addText(r[3], { x: 4.32, y: yy, w: 1.65, h: 0.28, fontSize: 7.5, color: C.muted, fontFace: CODE, margin: 0, valign: "middle" });
  });
  // assertion density vector bars
  card(s, 6.25, 1.42, 3.25, 3.0);
  s.addText("断言密度（覆盖热力）", { x: 6.45, y: 1.52, w: 2.9, h: 0.26, fontSize: 12, bold: true, color: C.ink, fontFace: F, margin: 0 });
  const maxA = 941;
  cov.forEach((r, i) => {
    const yy = 1.92 + i * 0.41;
    const label = r[0].split("（")[0];
    s.addText(label, { x: 6.45, y: yy, w: 1.0, h: 0.2, fontSize: 8, color: C.muted, fontFace: F, margin: 0 });
    const bw = (Math.sqrt(r[2] / maxA)) * 1.85;
    s.addShape(S.round, { x: 6.45, y: yy + 0.2, w: 1.85, h: 0.12, rectRadius: 0.05, fill: { color: C.grid }, line: { color: C.grid, width: 0 } });
    s.addShape(S.round, { x: 6.45, y: yy + 0.2, w: Math.max(0.1, bw), h: 0.12, rectRadius: 0.05, fill: { color: C.cyanDark }, line: { color: C.cyanDark, width: 0 } });
    s.addText(String(r[2]), { x: 8.42, y: yy + 0.12, w: 0.9, h: 0.28, fontSize: 9.5, bold: true, color: C.ink, fontFace: CODE, margin: 0, valign: "middle" });
  });
  // quality strips
  const q = [
    ["配套测试", "新增功能必须配套 smoke 测试"],
    ["Parity 断言", "WebGL2 vs Software 逐像素 ≤ 2/255"],
    ["确定性断言", "跨运行可重现（Rng 种子 / byte-identical）"],
  ];
  q.forEach((it, i) => {
    const x = 0.5 + i * 3.1;
    card(s, x, 4.62, 2.9, 0.62);
    s.addShape(S.rect, { x, y: 4.62, w: 0.08, h: 0.62, fill: { color: C.green }, line: { color: C.green, width: 0 } });
    s.addText([{ text: it[0] + "  ", options: { bold: true, color: C.ink, fontSize: 9.5 } },
               { text: it[1], options: { color: C.muted, fontSize: 8.5 } }],
      { x: x + 0.18, y: 4.66, w: 2.62, h: 0.54, fontFace: F, margin: 0, valign: "middle" });
  });
})();

// =====================================================================
// Slide 10 — 性能基准
// =====================================================================
(() => {
  const s = newSlide();
  header(s, "BENCHMARK / 性能基准", "性能基准：当前指标 → v2 目标", "全部指标来自 smoke 实测（Node 22 headless），无估算");
  const cur = [
    ["~500ms", "Smoke 全量执行", "50 文件 / 1596 断言"],
    ["908 / 1ms", "render_primitives", "908 断言，CPU 光栅器 1ms"],
    ["21 / 800ms", "sim_physics3d", "21 断言，含堆叠休眠收敛"],
    ["35 / 36ms", "plat_worker", "5 种任务 + 并发 + 错误路径"],
  ];
  cur.forEach((c, i) => {
    const x = 0.5 + (i % 2) * 2.32, y = 1.5 + Math.floor(i / 2) * 1.62;
    card(s, x, y, 2.16, 1.46);
    s.addText(c[0], { x: x + 0.14, y: y + 0.12, w: 1.9, h: 0.5, fontSize: 19, bold: true, color: C.cyanDark, fontFace: CODE, margin: 0 });
    s.addText(c[1], { x: x + 0.14, y: y + 0.66, w: 1.9, h: 0.24, fontSize: 9.5, bold: true, color: C.ink, fontFace: F, margin: 0 });
    s.addText(c[2], { x: x + 0.14, y: y + 0.92, w: 1.9, h: 0.42, fontSize: 8.5, color: C.muted, fontFace: F, margin: 0 });
  });
  // targets
  card(s, 5.3, 1.5, 4.2, 3.08);
  s.addText("v2 完成时目标", { x: 5.52, y: 1.62, w: 3.0, h: 0.3, fontSize: 13, bold: true, color: C.ink, fontFace: F, margin: 0 });
  const tgt = [
    ["≥ 30 fps", "WebGL2 · 1080p · 中端 GPU", C.cyanDark],
    ["通过", "Software 160p parity", C.greenDark],
    ["< 16 ms", "50MB GLB 导入 · 主线程帧时间", C.cyanDark],
    ["≥ 60 fps", "编辑器视口", C.greenDark],
  ];
  tgt.forEach((t, i) => {
    const yy = 2.02 + i * 0.63;
    s.addShape(S.round, { x: 5.52, y: yy, w: 1.15, h: 0.44, rectRadius: 0.06, fill: { color: C.soft }, line: { color: C.line, width: 0.5 } });
    s.addText(t[0], { x: 5.52, y: yy, w: 1.15, h: 0.44, fontSize: 11.5, bold: true, color: t[2], align: "center", valign: "middle", fontFace: CODE, margin: 0 });
    s.addText(t[1], { x: 6.82, y: yy, w: 2.55, h: 0.44, fontSize: 10, color: C.ink, fontFace: F, margin: 0, valign: "middle" });
  });
  // note strip
  s.addShape(S.round, { x: 0.5, y: 4.72, w: 9.0, h: 0.4, rectRadius: 0.06, fill: { color: "E4FBF1" }, line: { color: C.green, width: 0.75 } });
  s.addText("优化路径：Software parity 基准 → profiler 实测定位 → 分阶段优化（每一步都有回归护栏）", {
    x: 0.5, y: 4.72, w: 9.0, h: 0.4, fontSize: 10, bold: true, color: C.greenDark, align: "center", valign: "middle", fontFace: F, margin: 0,
  });
})();

// =====================================================================
// Slide 11 — 技术亮点（6 卡片）
// =====================================================================
(() => {
  const s = newSlide();
  header(s, "HIGHLIGHTS / 技术亮点", "六个真正的技术差异点", "不是「又一个 Three.js 封装」，而是从光栅器到物理求解器的完整自研");
  const hs = [
    ["CPU 黄金参考永不下线", "Software 光栅器作为 parity 基准，GPU 实现逐像素对齐 ≤2/255，数值正确性可验证"],
    ["确定性可重现", "Rng 种子 / 序列化固定 key 序 / LF / 无时间戳 / 稳定 ID，跨运行跨平台可验证"],
    ["单后端自包含", "非微服务：引擎+编辑器+运行时同进程，零 IPC 开销"],
    ["零运行时依赖", "无 npm install / 无构建步骤 / 纯 ES2022 / 浏览器打开即用"],
    ["Worker 降级策略", "浏览器 Web Worker 零拷贝；Node 顺序降级保持异步语义，同一套代码"],
    ["物理稳健性", "GJK _resolve4 + EPA 26 方向采样 + containsOrigin 显式检查，退化不崩溃"],
  ];
  hs.forEach((h, i) => {
    const x = 0.5 + (i % 3) * 3.1, y = 1.5 + Math.floor(i / 3) * 1.88;
    card(s, x, y, 2.9, 1.7);
    s.addShape(S.round, { x: x + 0.18, y: y + 0.16, w: 0.34, h: 0.34, rectRadius: 0.07, fill: { color: i % 2 ? C.greenDark : C.cyanDark }, line: { color: C.ink, width: 0 } });
    s.addText(String(i + 1), { x: x + 0.18, y: y + 0.16, w: 0.34, h: 0.34, fontSize: 13, bold: true, color: "FFFFFF", align: "center", valign: "middle", fontFace: CODE, margin: 0 });
    s.addText(h[0], { x: x + 0.64, y: y + 0.17, w: 2.1, h: 0.34, fontSize: 11.5, bold: true, color: C.ink, fontFace: F, margin: 0, valign: "middle" });
    s.addText(h[1], { x: x + 0.18, y: y + 0.62, w: 2.55, h: 0.98, fontSize: 8.5, color: C.muted, fontFace: F, margin: 0 });
  });
})();

// =====================================================================
// Slide 12 — 路线图（甘特图）
// =====================================================================
(() => {
  const s = newSlide();
  header(s, "ROADMAP / v2", "路线图 Q1–Q7：已完成 2 / 7 个季度目标", "规模合计 ~5150 行代码 + demo；每季度目标独立可验收");
  const items = [
    ["Q1", "物理 3D 真实化", "~1400 行", 1.0, 0.8],
    ["Q2", "音频输出 + 网络传输", "~600 行", 1.0, 0],
    ["Q3", "TAA / Hi-Z GPU 接线", "~600 行", 1.0, 0],
    ["Q4", "WebGPU 真实化", "~1000 行", 1.0, 0],
    ["Q5", "Worker 池化", "~350 行", 1.0, 0.4],
    ["Q6", "多人协作", "~900 行", 1.0, 0],
    ["Q7", "静态导出 + 验收游戏", "~300 行 + demo", 1.0, 0],
  ];
  const gx = 2.5, gw = 6.9, colW = gw / 7, gy = 1.62, rh = 0.44, gap = 0.06;
  // grid columns
  for (let i = 0; i < 7; i++) {
    s.addText("Q" + (i + 1), { x: gx + i * colW, y: gy - 0.28, w: colW, h: 0.22, fontSize: 9, bold: true, color: C.faint, align: "center", fontFace: F, margin: 0 });
    s.addShape(S.line, { x: gx + i * colW, y: gy, w: 0, h: 7 * (rh + gap), line: { color: C.grid, width: 0.5 } });
  }
  s.addShape(S.line, { x: gx + 7 * colW, y: gy, w: 0, h: 7 * (rh + gap), line: { color: C.grid, width: 0.5 } });
  items.forEach((it, i) => {
    const y = gy + i * (rh + gap);
    s.addText([{ text: it[0] + "  ", options: { bold: true, color: C.ink } }, { text: it[1], options: { color: C.muted } }],
      { x: 0.5, y, w: 1.95, h: rh, fontSize: 9.5, fontFace: F, margin: 0, valign: "middle" });
    // planned bar (hollow)
    s.addShape(S.round, {
      x: gx + 0.03, y, w: colW * it[3] - 0.06, h: rh, rectRadius: 0.05,
      fill: { color: it[4] > 0 ? "FFFFFF" : "F0F4F9" },
      line: { color: it[4] > 0 ? C.green : "B9C4D2", width: 1, dashType: it[4] > 0 ? "solid" : "dash" },
    });
    if (it[4] > 0) {
      s.addShape(S.round, {
        x: gx + 0.03, y, w: (colW * it[3] - 0.06) * it[4], h: rh, rectRadius: 0.05,
        fill: { color: C.green }, line: { color: C.green, width: 0 },
      });
      s.addText("✅ " + Math.round(it[4] * 100) + "%", {
        x: gx + 0.03, y, w: colW * it[3] - 0.06, h: rh, fontSize: 9.5, bold: true,
        color: it[4] > 0.6 ? "0B3B27" : C.greenDark, align: "center", valign: "middle", fontFace: F, margin: 0,
      });
    } else {
      s.addText("待启动", { x: gx + 0.03, y, w: colW * it[3] - 0.06, h: rh, fontSize: 8.5, color: C.faint, align: "center", valign: "middle", fontFace: F, margin: 0 });
    }
    s.addText(it[2], { x: gx + colW * it[3] + 0.12, y, w: 1.3, h: rh, fontSize: 8.5, color: C.faint, fontFace: CODE, margin: 0, valign: "middle" });
  });
})();

// =====================================================================
// Slide 13 — 下一步计划（三阶段）
// =====================================================================
(() => {
  const s = newSlide();
  header(s, "NEXT / 下一步计划", "三步走：2 周 · 4 周 · 8 周", "近期补全 Worker 与物理接线 → 中期补齐体验层 → 远期完成平台闭环");
  const ph = [
    ["近期 · 1-2 周", C.cyanDark, [
      ["Q5 补全", "GLTF / 纹理 / DDC 迁入 Worker（~200 行）"],
      ["Q1 接线", "GameRuntime.stepPhysics 换真世界步进（~100 行）"],
    ]],
    ["中期 · 2-4 周", C.greenDark, [
      ["Q2", "音频桥 + 网络传输（~600 行）"],
      ["Q3", "TAA / Hi-Z GPU 接线（~600 行）"],
    ]],
    ["远期 · 4-8 周", "8A6210", [
      ["Q4", "WebGPU compute（~1000 行）"],
      ["Q6", "多人协作（~900 行）"],
      ["Q7", "静态导出 + 验收游戏（~300 行 + demo）"],
    ]],
  ];
  ph.forEach((col, i) => {
    const x = 0.5 + i * 3.1;
    card(s, x, 1.5, 2.9, 3.5);
    s.addShape(S.rect, { x, y: 1.5, w: 2.9, h: 0.5, fill: { color: col[1] }, line: { color: col[1], width: 0 } });
    s.addText(col[0], { x, y: 1.5, w: 2.9, h: 0.5, fontSize: 12.5, bold: true, color: "FFFFFF", align: "center", valign: "middle", fontFace: F, margin: 0 });
    col[2].forEach((it, j) => {
      const y = 2.18 + j * 0.92;
      s.addShape(S.round, { x: x + 0.18, y, w: 0.62, h: 0.3, rectRadius: 0.05, fill: { color: C.soft }, line: { color: col[1], width: 0.75 } });
      s.addText(it[0], { x: x + 0.18, y, w: 0.62, h: 0.3, fontSize: 9.5, bold: true, color: col[1], align: "center", valign: "middle", fontFace: CODE, margin: 0 });
      s.addText(it[1], { x: x + 0.18, y: y + 0.34, w: 2.55, h: 0.52, fontSize: 9, color: C.ink, fontFace: F, margin: 0 });
    });
    if (i < 2) arrowR(s, x + 2.92, 3.1, C.faint);
  });
  s.addShape(S.round, { x: 0.5, y: 5.12, w: 9.0, h: 0.02, rectRadius: 0, fill: { color: C.bgLight }, line: { color: C.bgLight, width: 0 } });
})();

// =====================================================================
// Slide 14 — 总结（深色）
// =====================================================================
(() => {
  const s = newSlide(true);
  s.addText("SUMMARY", { x: 0.62, y: 0.5, w: 4.0, h: 0.3, fontSize: 12, bold: true, color: C.cyan, charSpacing: 4, fontFace: CODE, margin: 0 });
  s.addText("打开浏览器 → 玩家即点即玩", { x: 0.6, y: 0.82, w: 8.9, h: 0.6, fontSize: 30, bold: true, color: "FFFFFF", fontFace: F, margin: 0 });
  // three columns
  const cols = [
    ["已实现", C.green, [
      "109 模块 / 50 smoke / 1596 断言",
      "4 个游戏 Demo",
      "WebGL2 RHI 完整 + PBR",
      "物理 3D + 编辑器 + Play 模式",
      "CPU 黄金参考 parity / 确定性",
    ]],
    ["核心承诺", C.cyan, [
      "浏览器端独立运行完整 3D 游戏",
      "全部计算 100% 驻留浏览器",
      "对标 Unity6 日常开发闭环",
      "零安装 · 零后端 · 零依赖",
    ]],
    ["适用场景", C.amber, [
      "独立游戏开发 · 免费 + 秒级部署",
      "教育教学 · 零安装环境",
      "原型验证 · 无需搭服务器",
      "嵌入式 / H5 · WebGL2/WebGPU",
    ]],
  ];
  cols.forEach((c, i) => {
    const x = 0.6 + i * 3.05;
    s.addShape(S.round, { x, y: 1.66, w: 2.85, h: 2.4, rectRadius: 0.06, fill: { color: C.dark2 }, line: { color: C.dark3, width: 0.75 } });
    s.addText(c[0], { x: x + 0.2, y: 1.8, w: 2.4, h: 0.3, fontSize: 13, bold: true, color: c[1], fontFace: F, margin: 0 });
    bulletRows(s, x + 0.22, 2.2, 2.45, c[2], { rh: 0.36, fs: 9, color: "D5E2F0", sq: c[1] });
  });
  // vision flow
  const flow = ["打开浏览器", "写代码", "调试", "构建", "发布", "玩家即点即玩"];
  let fx = 0.6;
  flow.forEach((f, i) => {
    const last = i === flow.length - 1;
    const w = last ? 1.9 : 1.22;
    s.addShape(S.chev, { x: fx, y: 4.42, w, h: 0.5, fill: { color: last ? C.cyan : C.dark3 }, line: { color: last ? C.cyan : "2C4B77", width: 0.75 } });
    s.addText(f, { x: fx + 0.12, y: 4.42, w: w - 0.16, h: 0.5, fontSize: 10, bold: true, color: last ? "0B1526" : "FFFFFF", align: "center", valign: "middle", fontFace: F, margin: 0 });
    fx += w - 0.06;
  });
})();

// =====================================================================
// Slide 15 — 操作手册（分隔页）
// =====================================================================
(() => {
  const s = newSlide(true);
  s.addText("OPERATOR'S GUIDE", { x: 0.62, y: 1.5, w: 6.0, h: 0.34, fontSize: 13, bold: true, color: C.cyan, charSpacing: 5, fontFace: CODE, margin: 0 });
  s.addText("操作手册", { x: 0.6, y: 1.84, w: 6.0, h: 0.9, fontSize: 44, bold: true, color: "FFFFFF", fontFace: F, margin: 0 });
  s.addText("从零到玩家即点即玩：启动 · 编辑 · 调试 · 测试 · 部署", {
    x: 0.62, y: 2.8, w: 6.4, h: 0.32, fontSize: 13, color: "C9D8EA", fontFace: F, margin: 0,
  });
  const toc = [
    ["01", "快速上手", "5 分钟跑起来"],
    ["02", "编辑器操作", "视口 / 检视器 / 快捷键"],
    ["03", "调试与测试", "Play 模式 / 热重载 / smoke"],
    ["04", "部署与导出", "静态托管 / 降级矩阵"],
  ];
  toc.forEach((t, i) => {
    const x = 0.6 + i * 2.3;
    s.addShape(S.round, { x, y: 3.5, w: 2.12, h: 1.1, rectRadius: 0.06, fill: { color: C.dark2 }, line: { color: C.dark3, width: 0.75 } });
    s.addText(t[0], { x: x + 0.16, y: 3.62, w: 0.8, h: 0.3, fontSize: 14, bold: true, color: C.cyan, fontFace: CODE, margin: 0 });
    s.addText(t[1], { x: x + 0.16, y: 3.94, w: 1.8, h: 0.28, fontSize: 12, bold: true, color: "FFFFFF", fontFace: F, margin: 0 });
    s.addText(t[2], { x: x + 0.16, y: 4.24, w: 1.85, h: 0.24, fontSize: 8.5, color: "8FA3BA", fontFace: F, margin: 0 });
  });
})();

// =====================================================================
// Slide 16 — 快速上手
// =====================================================================
(() => {
  const s = newSlide();
  header(s, "MANUAL 01 / 快速上手", "5 分钟跑起来", "要求：Node ≥ 18 · 现代浏览器（Chrome / Edge / Firefox）· @tensorflow/tfjs 为可选依赖");
  const steps = [
    ["启动本地服务器", "node serve.mjs", "默认 http://localhost:8080（ES module 需 http:// 而非 file://）"],
    ["打开编辑器", "http://localhost:8080", "进入 src/editor/index.html —— 层级树 / 检视器 / 代码工作台"],
    ["玩一个 Demo", "games/*.html", "action3d / breakout / match3 / space_shooter 直接打开即玩"],
    ["全量 smoke 验收", "node tools/run_smoke.js", "Node headless，无需浏览器，~500ms 全绿"],
    ["按前缀过滤", "node tools/run_smoke.js core_", "只跑 core_* 相关 smoke，快速定位"],
  ];
  steps.forEach((st, i) => {
    const y = 1.46 + i * 0.76;
    s.addShape(S.oval, { x: 0.5, y: y + 0.06, w: 0.4, h: 0.4, fill: { color: i === 3 || i === 4 ? C.greenDark : C.cyanDark }, line: { color: "FFFFFF", width: 0 } });
    s.addText(String(i + 1), { x: 0.5, y: y + 0.06, w: 0.4, h: 0.4, fontSize: 14, bold: true, color: "FFFFFF", align: "center", valign: "middle", fontFace: CODE, margin: 0 });
    if (i < steps.length - 1) s.addShape(S.line, { x: 0.7, y: y + 0.48, w: 0, h: 0.34, line: { color: C.line, width: 1.5 } });
    s.addText(st[0], { x: 1.08, y, w: 2.0, h: 0.28, fontSize: 11.5, bold: true, color: C.ink, fontFace: F, margin: 0 });
    s.addShape(S.round, { x: 3.1, y: y + 0.01, w: 2.5, h: 0.28, rectRadius: 0.045, fill: { color: "0B1526" }, line: { color: "0B1526", width: 0 } });
    s.addText(st[1], { x: 3.2, y: y + 0.01, w: 2.35, h: 0.28, fontSize: 9.5, color: C.cyan, fontFace: CODE, margin: 0, valign: "middle" });
    s.addText(st[2], { x: 1.08, y: y + 0.31, w: 5.3, h: 0.24, fontSize: 8.5, color: C.muted, fontFace: F, margin: 0 });
  });
  // right cards
  card(s, 6.7, 1.46, 2.8, 1.7);
  s.addText("环境要求", { x: 6.9, y: 1.58, w: 2.4, h: 0.26, fontSize: 11.5, bold: true, color: C.ink, fontFace: F, margin: 0 });
  bulletRows(s, 6.92, 1.9, 2.45, ["Node.js ≥ 18（建议 22）", "任意现代浏览器", "无需 npm install", "无构建步骤 · 纯 ES2022"], { rh: 0.3, fs: 9 });
  card(s, 6.7, 3.3, 2.8, 1.84);
  s.addText("推理降级", { x: 6.9, y: 3.42, w: 2.4, h: 0.26, fontSize: 11.5, bold: true, color: C.ink, fontFace: F, margin: 0 });
  s.addText([
    { text: "已安装 tfjs", options: { bold: true, color: C.cyanDark, breakLine: true, fontSize: 9.5 } },
    { text: "TensorFlow.js 浏览器端推理", options: { color: C.muted, fontSize: 8.5, breakLine: true } },
    { text: " ", options: { fontSize: 4, breakLine: true } },
    { text: "未安装 tfjs", options: { bold: true, color: C.greenDark, breakLine: true, fontSize: 9.5 } },
    { text: "自动降级内置 NanoTensor，smoke 必须仍然全绿（硬性要求）", options: { color: C.muted, fontSize: 8.5 } },
  ], { x: 6.92, y: 3.72, w: 2.42, h: 1.3, fontFace: F, margin: 0 });
})();

// =====================================================================
// Slide 17 — 编辑器操作
// =====================================================================
(() => {
  const s = newSlide();
  header(s, "MANUAL 02 / 编辑器操作", "视口 · 检视器 · 快捷键", "原生 DOM 实现，零框架零依赖；所有面板布局与桌面 IDE 一致");
  card(s, 0.5, 1.42, 4.35, 3.7);
  s.addText("基础操作", { x: 0.72, y: 1.54, w: 3.0, h: 0.28, fontSize: 12.5, bold: true, color: C.ink, fontFace: F, margin: 0 });
  bulletRows(s, 0.75, 1.92, 3.95, [
    "视口：实时 GPU 渲染 + Gizmo 拖拽 + 网格/坐标轴",
    "层级树：选中 / 多选 / 拖拽排序 / 重命名",
    "检视器：transform / material / particle 属性编辑",
    "代码工作台：多 Tab / tokenizer 高亮 / OPFS 持久化",
    "命令面板：快速检索并执行所有编辑器命令",
    "时间轴：动画关键帧 + 粒子生命周期编辑",
    "Profiler：帧时间线 / draw call 统计 / 内存面板",
  ], { rh: 0.44, fs: 9.5 });
  card(s, 5.05, 1.42, 4.45, 2.2);
  s.addText("快捷键", { x: 5.27, y: 1.54, w: 3.0, h: 0.28, fontSize: 12.5, bold: true, color: C.ink, fontFace: F, margin: 0 });
  const keys = [
    ["Ctrl + P", "进入 / 退出 Play 模式", CODE],
    ["Ctrl + S", "热加载脚本进运行会话（不重启游戏）", CODE],
    ["⏸ / ▶ / ⏭", "暂停 / 继续 / 单步（精确 1/60s 一帧）", F],
  ];
  keys.forEach((k, i) => {
    const y = 1.94 + i * 0.52;
    s.addShape(S.round, { x: 5.27, y, w: 1.05, h: 0.34, rectRadius: 0.05, fill: { color: C.soft }, line: { color: C.line, width: 0.75 } });
    s.addText(k[0], { x: 5.27, y, w: 1.05, h: 0.34, fontSize: 9.5, bold: true, color: C.ink, align: "center", valign: "middle", fontFace: k[2], margin: 0 });
    s.addText(k[1], { x: 6.45, y, w: 2.95, h: 0.34, fontSize: 9.5, color: C.muted, fontFace: F, margin: 0, valign: "middle" });
  });
  card(s, 5.05, 3.78, 4.45, 1.4);
  s.addText("脚本调试 API（在脚本内以 this 调用）", { x: 5.27, y: 3.86, w: 4.0, h: 0.26, fontSize: 11, bold: true, color: C.ink, fontFace: F, margin: 0 });
  const apis = ["spawn / despawn", "timer / after", "raycast", "queryRadius", "distanceTo", "move / rotate", "onKeyDown...", "this.breakpoint()"];
  let ax = 5.27, ay = 4.16;
  apis.forEach((a) => {
    const w = 0.18 + a.length * 0.082;
    if (ax + w > 9.4) { ax = 5.27; ay += 0.34; }
    chip(s, ax, ay, w, a, { fill: C.chipBg, fs: 8, font: CODE, h: 0.28, color: C.cyanDark });
    ax += w + 0.1;
  });
})();

// =====================================================================
// Slide 18 — 调试与测试
// =====================================================================
(() => {
  const s = newSlide();
  header(s, "MANUAL 03 / 调试与测试", "Debug 模式：边调试 · 边热加载 · 边运行", "游戏运行在场景深拷贝快照上，停止即回滚，编辑态零污染（红线 F）");
  // debug flow
  const flow = ["▶ Run (Ctrl+P)", "改脚本 / 检视器", "Ctrl+S 热加载", "⏭ 单步 / 断点", "实时面板观察"];
  let fx = 0.5;
  flow.forEach((f, i) => {
    const w = 1.72;
    s.addShape(S.round, { x: fx, y: 1.5, w, h: 0.52, rectRadius: 0.07, fill: { color: i === 2 ? C.cyanDark : C.dark2 }, line: { color: C.dark2, width: 0 } });
    s.addText(f, { x: fx + 0.05, y: 1.5, w: w - 0.1, h: 0.52, fontSize: 9.5, bold: true, color: "FFFFFF", align: "center", valign: "middle", fontFace: F, margin: 0 });
    if (i < flow.length - 1) arrowR(s, fx + w + 0.02, 1.68, C.cyanDark);
    fx += w + 0.14;
  });
  // debug tools card
  card(s, 0.5, 2.28, 4.35, 2.84);
  s.addText("调试工具", { x: 0.72, y: 2.4, w: 3.0, h: 0.28, fontSize: 12.5, bold: true, color: C.ink, fontFace: F, margin: 0 });
  bulletRows(s, 0.75, 2.78, 3.95, [
    "逐帧单步：暂停后精确推进 1/60s 观察状态",
    "实时面板：每个实体的 pos(x,y,z) 与脚本 log",
    "监视表达式：sqrt(pos[0]^2+pos[2]^2) 即时求值",
    "断点：this.breakpoint([msg]) 命中自动暂停",
    "内联错误：语法错误行标红，显示「第 N 行: 错误」",
    "异常隔离：单脚本异常不影响其它脚本与编辑数据",
  ], { rh: 0.38, fs: 9 });
  // testing card
  card(s, 5.05, 2.28, 4.45, 2.84);
  s.addText("测试验收", { x: 5.27, y: 2.4, w: 3.0, h: 0.28, fontSize: 12.5, bold: true, color: C.ink, fontFace: F, margin: 0 });
  bulletRows(s, 5.3, 2.78, 4.05, [
    "node tools/run_smoke.js —— 全量 50 smoke / 1596 断言",
    "支持前缀过滤：node tools/run_smoke.js sim_",
    "全部 Node headless，无需浏览器，~500ms",
    "脚本文件约定：scripts/<对象名>[#槽位].js",
    "cube / sun 已预置演示脚本（沿路径移动 / 自转）",
    "配套套件：debug_mode / api_extension / action3d_script",
  ], { rh: 0.38, fs: 9, sq: C.green });
})();

// =====================================================================
// Slide 19 — 部署与导出
// =====================================================================
(() => {
  const s = newSlide();
  header(s, "MANUAL 04 / 部署与导出", "静态托管即部署，降级矩阵保兜底", "零构建产物：整个目录复制到任意静态服务器即可运行");
  // deploy steps
  card(s, 0.5, 1.42, 4.35, 2.5);
  s.addText("三种部署方式", { x: 0.72, y: 1.54, w: 3.0, h: 0.28, fontSize: 12.5, bold: true, color: C.ink, fontFace: F, margin: 0 });
  const dep = [
    ["本地开发", "node serve.mjs"],
    ["Python 备选", "python -m http.server 8080"],
    ["生产托管", "复制目录到任意静态服务器（零构建）"],
  ];
  dep.forEach((d, i) => {
    const y = 1.92 + i * 0.62;
    s.addShape(S.oval, { x: 0.75, y: y + 0.04, w: 0.3, h: 0.3, fill: { color: C.cyanDark }, line: { color: "FFFFFF", width: 0 } });
    s.addText(String(i + 1), { x: 0.75, y: y + 0.04, w: 0.3, h: 0.3, fontSize: 11, bold: true, color: "FFFFFF", align: "center", valign: "middle", fontFace: CODE, margin: 0 });
    s.addText(d[0], { x: 1.2, y, w: 1.35, h: 0.38, fontSize: 10.5, bold: true, color: C.ink, fontFace: F, margin: 0, valign: "middle" });
    s.addShape(S.round, { x: 2.55, y: y + 0.02, w: 2.1, h: 0.36, rectRadius: 0.05, fill: { color: "0B1526" }, line: { color: "0B1526", width: 0 } });
    s.addText(d[1], { x: 2.63, y: y + 0.02, w: 1.98, h: 0.36, fontSize: 8, color: C.cyan, fontFace: CODE, margin: 0, valign: "middle" });
  });
  // degradation matrix
  card(s, 5.05, 1.42, 4.45, 2.5);
  s.addText("诚实降级矩阵（能力缺失不崩溃）", { x: 5.27, y: 1.54, w: 4.0, h: 0.28, fontSize: 12.5, bold: true, color: C.ink, fontFace: F, margin: 0 });
  const deg = [
    ["WebGPU", "WebGL2", "Software"],
    ["Worker", "顺序降级", "异步语义不变"],
    ["TF.js", "NanoTensor", "smoke 仍全绿"],
  ];
  deg.forEach((r, i) => {
    const y = 1.96 + i * 0.6;
    chip(s, 5.3, y, 1.1, r[0], { fill: C.dark2, color: "FFFFFF", fs: 9.5, h: 0.4 });
    arrowR(s, 6.48, y + 0.12, C.faint);
    chip(s, 6.82, y, 1.2, r[1], { fill: "FFF4DC", color: "8A6210", fs: 9.5, h: 0.4 });
    arrowR(s, 8.1, y + 0.12, C.faint);
    chip(s, 8.36, y, 1.05, r[2], { fill: "E4FBF1", color: C.greenDark, fs: 9.5, h: 0.4 });
  });
  // platform persistence
  card(s, 0.5, 4.1, 9.0, 1.02);
  s.addText("持久化与缓存", { x: 0.72, y: 4.2, w: 2.2, h: 0.26, fontSize: 11.5, bold: true, color: C.ink, fontFace: F, margin: 0 });
  const plat = ["OPFS 持久化", "File System Access API", "DDC 编译缓存", "资源缓存", ".glb 往返校验"];
  let px = 2.7;
  plat.forEach((t) => {
    const w = 0.2 + t.length * 0.095;
    chip(s, px, 4.22, w, t, { fill: C.chipBg, fs: 9, color: C.cyanDark, h: 0.32 });
    px += w + 0.12;
  });
  s.addText("场景 / 脚本 / 资产自动持久化，刷新浏览器不丢失工作区", { x: 0.72, y: 4.62, w: 8.5, h: 0.24, fontSize: 9, color: C.muted, fontFace: F, margin: 0 });
})();

p.writeFile({ fileName: "c:/Users/bnna7/workspace/gameEngineJS/宣传+操作手册.pptx" }).then(() => {
  console.log("PPTX_DONE");
});
