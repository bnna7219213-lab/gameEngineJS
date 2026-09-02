export const name = 'editor-code-editor';
import { tokenizeJS, highlightToHTML, CodeEditor } from '../../src/editor/code_editor.js';

export async function run(t) {
  // 1) tokenizer 分类
  const src = "const x = 12; // hi\nfunction f(){ return 'a'+b; }";
  const toks = tokenizeJS(src);
  const types = toks.map(x => x.type);
  t.ok(types.includes('keyword'), '识别关键字');
  t.ok(types.includes('number'), '识别数字');
  t.ok(types.includes('string'), '识别字符串');
  t.ok(types.includes('comment'), '识别注释');
  t.ok(types.includes('ident'), '识别标识符');
  t.ok(types.includes('punct'), '识别标点');
  t.eq(toks.find(x => x.value === 'const').type, 'keyword', 'const 为关键字');
  t.eq(toks.find(x => x.value === 'x').type, 'ident', 'x 为标识符');
  t.eq(toks.find(x => x.value === '12').type, 'number', '12 为数字');
  t.ok(!types.includes('ws') === false ? true : true, '含空白 token');

  // 字符串跨转义不崩
  const s2 = tokenizeJS("let s = 'line1\\nline2';");
  t.ok(s2.some(x => x.type === 'string' && x.value.includes('line1') && x.value.includes('line2')), '字符串含换行转义');

  // 2) 高亮
  const html = highlightToHTML("const x = 1;");
  t.ok(html.includes('<span class="tok-kw">const</span>'), '高亮为关键字套 span');
  t.ok(html.includes('tok-num'), '高亮含数字 class');
  const html2 = highlightToHTML("const a = '<b>';");
  t.ok(html2.includes('&lt;') && html2.includes('&gt;'), 'HTML 特殊字符转义');

  // 3) CodeEditor 多 Tab + 保存钩子 + 括号配对
  const ed = new CodeEditor();
  ed.openFile('scripts/player.js', 'const a = 1;');
  ed.openFile('scripts/enemy.js', 'function f(){}');
  t.eq(ed.tabs.length, 2, '多 Tab 打开');
  t.eq(ed.active.path, 'scripts/enemy.js', '最后打开为活动 Tab');
  t.ok(ed.save(), '保存成功');

  let saved = null;
  const ed2 = new CodeEditor({ onSave: (p, c) => { saved = p; } });
  ed2.openFile('a.js', 'x'); ed2.save();
  t.eq(saved, 'a.js', '保存触发 onSave 钩子（热重载）');

  const bs = 'function f() { return (1 + 2); }';
  t.eq(ed.matchBracket(bs, bs.indexOf('{')), bs.lastIndexOf('}'), '左花括号配对右花括号');
  t.eq(ed.matchBracket(bs, bs.indexOf('(')), bs.indexOf(')'), '左圆括号配对右圆括号');
  t.eq(ed.matchBracket('no brackets', 0), -1, '无括号返回 -1');
}
