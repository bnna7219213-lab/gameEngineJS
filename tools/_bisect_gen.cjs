/* 按幻灯片范围重组生成脚本，输出变体用于二分 */
const fs = require("fs");
const src = fs.readFileSync("c:/Users/bnna7/workspace/gameEngineJS/tools/_gen_pptx.cjs", "utf-8").replace(/\r\n/g, "\n");

const marker = "// =====================================================================";
const firstSlideIdx = src.indexOf(marker + "\n// Slide 1");
const prologue = src.slice(0, firstSlideIdx);

// split slide chunks
const lines = src.slice(firstSlideIdx).split("\n");
const chunks = [];
let cur = null;
let inTail = false;
for (const ln of lines) {
  if (ln.startsWith(marker) && lines.indexOf(ln) >= 0) {
    // look ahead for "// Slide N"
  }
}
// simpler: split by regex on the marker+Slide header
const re = /\/\/ ={69}\n\/\/ Slide (\d+)[^\n]*\n/g;
const parts = [];
let last = firstSlideIdx, m;
while ((m = re.exec(src)) !== null) {
  if (parts.length) parts[parts.length - 1].end = m.index;
  parts.push({ n: +m[1], start: m.index, end: src.length });
}
const tailRe = /p\.writeFile\(/;
const tailIdx = src.search(tailRe);
// find last chunk end = start of writeFile block (it's preceded by marker comment)
let writeBlockStart = src.lastIndexOf(marker, tailIdx);
parts.forEach((pt, i) => {
  pt.end = i < parts.length - 1 ? parts[i + 1].start : writeBlockStart;
});

const wanted = process.argv.slice(2).map(Number);
// build variant source
let out = prologue;
wanted.forEach((n) => {
  const c = parts.find((x) => x.n === n);
  if (c) out += src.slice(c.start, c.end);
});
out += `\np.writeFile({ fileName: "c:/Users/bnna7/workspace/gameEngineJS/build/t_range.pptx" }).then(() => console.log("RANGE_DONE"));\n`;
fs.writeFileSync("c:/Users/bnna7/workspace/gameEngineJS/tools/_range_gen.cjs", out, "utf-8");
console.log("variant with slides:", wanted.join(","));
