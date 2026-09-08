/* 二分定位 PPTX 损坏特性 */
const pptxgen = require("pptxgenjs");

async function make(name, fn) {
  const p = new pptxgen();
  p.layout = "LAYOUT_16x9";
  const s = p.addSlide();
  fn(p, s);
  await p.writeFile({ fileName: "c:/Users/bnna7/workspace/gameEngineJS/build/t_" + name + ".pptx" });
  console.log("made", name);
}

(async () => {
  await make("base", (p, s) => {
    s.addText("hello", { x: 1, y: 1, w: 3, h: 0.5, fontSize: 20 });
  });
  await make("blockarc", (p, s) => {
    s.addShape("blockArc", { x: 1, y: 1, w: 1, h: 1, fill: { color: "3BE08F" }, line: { color: "3BE08F", width: 0 }, angleRange: [270, 198], arcThicknessRatio: 0.22 });
  });
  await make("blockarc_ok", (p, s) => {
    s.addShape("blockArc", { x: 1, y: 1, w: 1, h: 1, fill: { color: "3BE08F" }, line: { color: "3BE08F", width: 0 }, angleRange: [270, 350], arcThicknessRatio: 0.22 });
  });
  await make("zeroline", (p, s) => {
    s.addShape("line", { x: 0.5, y: 4.7, w: 0, h: 0, line: { color: "0B1526", width: 0 } });
  });
  await make("width0", (p, s) => {
    s.addShape("roundRect", { x: 1, y: 1, w: 2, h: 0.5, rectRadius: 0.05, fill: { color: "E6F4FB" }, line: { color: "E6F4FB", width: 0 } });
  });
  await make("fillnone", (p, s) => {
    s.addShape("triangle", { x: 1, y: 1, w: 2, h: 1.5, fill: { type: "none" }, line: { color: "35D6FF", width: 1.5, transparency: 20 } });
  });
  await make("arrows", (p, s) => {
    s.addShape("line", { x: 1, y: 1, w: 0.42, h: 0, line: { color: "FF0000", width: 1.75, endArrowType: "triangle" } });
    s.addShape("line", { x: 1, y: 2, w: 0, h: 0.65, line: { color: "00FF00", width: 1.25, beginArrowType: "triangle" } });
  });
  await make("transpfill", (p, s) => {
    s.addShape("rect", { x: 1, y: 1, w: 2, h: 1, fill: { color: "FFFFFF", transparency: 82 }, line: { color: "FFFFFF", width: 0.5 } });
    s.addShape("rect", { x: 1, y: 3, w: 2, h: 1, fill: { color: "FFFFFF", transparency: 0 }, line: { color: "FFFFFF", width: 0.5 } });
  });
  await make("shadow", (p, s) => {
    s.addShape("roundRect", { x: 1, y: 1, w: 3, h: 2, rectRadius: 0.055, fill: { color: "FFFFFF" }, line: { color: "D9E3EF", width: 0.75 }, shadow: { type: "outer", color: "8A9BB0", blur: 7, offset: 2, angle: 135, opacity: 0.22 } });
  });
  await make("chevrons", (p, s) => {
    s.addShape("chevron", { x: 1, y: 1, w: 1.36, h: 0.52, fill: { color: "13253F" }, line: { color: "13253F", width: 0 } });
    s.addShape("rightArrow", { x: 3, y: 1, w: 0.26, h: 0.16, fill: { color: "0891B2" }, line: { color: "0891B2", width: 0 } });
    s.addShape("downArrow", { x: 4, y: 1, w: 0.3, h: 0.34, fill: { color: "0891B2" }, line: { color: "0891B2", width: 0 } });
    s.addShape("homePlate", { x: 5, y: 1, w: 1, h: 0.5, fill: { color: "13253F" }, line: { color: "13253F", width: 0 } });
    s.addShape("parallelogram", { x: 6.5, y: 1, w: 2.1, h: 0.72, fill: { color: "35D6FF", transparency: 62 }, line: { color: "35D6FF", width: 1.25 } });
    s.addShape("donut", { x: 1, y: 3, w: 1, h: 1, fill: { color: "E2EAF4" }, line: { color: "E2EAF4", width: 0 } });
    s.addShape("pie", { x: 3, y: 3, w: 1, h: 1, fill: { color: "E2EAF4" }, line: { color: "E2EAF4", width: 0 } });
  });
  await make("newline", (p, s) => {
    s.addText("LineA\nLineB", { x: 1, y: 1, w: 3, h: 0.8, fontSize: 14 });
  });
  await make("charSpacing", (p, s) => {
    s.addText("SPACED", { x: 1, y: 1, w: 4, h: 0.4, charSpacing: 5, fontSize: 13 });
  });
})();
