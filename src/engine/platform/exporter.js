// 导出：JSON + 单文件独立 HTML（资源内联，浏览器直接打开）。
export function exportJSON(project) { return JSON.stringify(project, null, 2); }

export function exportStandaloneHTML(project) {
  const data = JSON.stringify(project);
  const objCount = project && project.objects ? Object.keys(project.objects).length : 0;
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>${(project && project.name) || 'project'}</title>
<style>body{margin:0;background:#1a1a22;color:#9fd;font-family:sans-serif}canvas{display:block}</style></head>
<body><canvas id="c" width="800" height="600"></canvas>
<script>
window.__PROJECT__ = ${data};
window.addEventListener('load', function(){
  var P = window.__PROJECT__;
  var cv = document.getElementById('c'); var ctx = cv.getContext('2d');
  ctx.fillStyle = '#222'; ctx.fillRect(0,0,800,600);
  ctx.fillStyle = '#9fd'; ctx.font = '16px sans-serif';
  ctx.fillText('standalone: ' + (P.name||'?') + '  objects: ${objCount}', 20, 40);
  var obs = P.objects || {};
  var i = 0;
  for (var id in obs) { var o = obs[id]; ctx.fillText((o.name||id), 20, 80 + (i++)*22); if (i>20) break; }
});
</script></body></html>`;
}
