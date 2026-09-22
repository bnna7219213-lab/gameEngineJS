// 多预览窗口：打开独立浏览器窗口，从固定机位渲染当前场景（对应 python/ide 的 preview）。
// 实现：新窗口 + canvas；每帧把主视口 RGBA 位图复制过去（保证与编辑器视图一致）。
export class PreviewManager {
  constructor(ctx) { this.ctx = ctx; this.windows = new Set(); }
  open() {
    const w = window.open('', '_blank', 'width=640,height=420');
    if (!w) { this.ctx.status('弹窗被拦截'); return; }
    w.document.title = '预览 · engine+tf.js';
    w.document.body.style.cssText = 'margin:0;background:#12121a;display:flex;align-items:center;justify-content:center;height:100vh';
    const c = w.document.createElement('canvas');
    w.document.body.appendChild(c);
    const entry = { w, c };
    this.windows.add(entry);
    w.addEventListener('beforeunload', () => this.windows.delete(entry));
    this.ctx.status('预览窗口已打开（' + this.windows.size + '）');
  }
  // 主循环每帧调用：把主视口画面镜像到所有预览窗口
  update(sourceCanvas) {
    for (const e of [...this.windows]) {
      if (e.w.closed) { this.windows.delete(e); continue; }
      if (e.c.width !== sourceCanvas.width || e.c.height !== sourceCanvas.height) {
        e.c.width = sourceCanvas.width; e.c.height = sourceCanvas.height;
        e.c.style.maxWidth = '100vw'; e.c.style.maxHeight = '100vh';
      }
      e.c.getContext('2d').drawImage(sourceCanvas, 0, 0);
    }
  }
}
