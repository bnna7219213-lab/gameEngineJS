// 配对渲染：同时跑「精简路径」与「传统路径」，由 selector 选取最终帧（质量/性能权衡）。
export function pairedRender(litePass, legacyPass, selector) {
  const lite = litePass();
  const legacy = legacyPass();
  return selector(lite, legacy);
}

// 默认选择器：legacy 优先（质量），lite 作为回退（其不为 null 时）。
export function qualityFirst(lite, legacy) { return legacy || lite; }
export function performanceFirst(lite, legacy) { return lite || legacy; }
