// Web Worker（经典 Worker，无 import 依赖）：把对象脚本语法校验放到后台线程，
// 避免大脚本编译/校验阻塞主线程（Worker 化）。仅做 new Function 语法尝试，不捕获实体闭包。
self.onmessage = (e) => {
  const msg = e.data || {};
  const scripts = Array.isArray(msg.scripts) ? msg.scripts : [];
  const errors = [];
  for (const s of scripts) {
    try { new Function('dt', 'input', '"use strict";\n' + (s.code || '')); }
    catch (err) { errors.push({ name: s.name || 'script', error: String((err && err.message) || err) }); }
  }
  self.postMessage({ id: msg.id, errors });
};
