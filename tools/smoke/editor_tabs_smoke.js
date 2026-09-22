// editor_tabs smoke：属性选项卡框架与扩展字段类型（v3 M-A / D31）。
import { FIELD_TYPES, FIELD_TYPES_EXT, ALL_FIELD_TYPES, PROPERTY_TABS, COMPONENT_TAB, tabOfComponent, isValidFieldType } from '../../src/editor/registry.js';

export const name = 'editor-tabs';
export async function run(t) {
  // 向后兼容：既有 7 种字段类型不变
  t.eq(FIELD_TYPES.join(','), 'float,int,vec3,color,text,bool,select', '既有 FIELD_TYPES 不变');

  // 扩展类型追加
  t.ok(FIELD_TYPES_EXT.includes('colorRamp'), '扩展含 colorRamp');
  t.ok(FIELD_TYPES_EXT.includes('materialRef'), '扩展含 materialRef');
  t.ok(FIELD_TYPES_EXT.includes('tabs'), '扩展含 tabs');
  t.eq(ALL_FIELD_TYPES.length, FIELD_TYPES.length + FIELD_TYPES_EXT.length, 'ALL_FIELD_TYPES 合并');

  // isValidFieldType
  t.ok(isValidFieldType('float'), '既有类型有效');
  t.ok(isValidFieldType('vec2'), '扩展类型有效');
  t.ok(!isValidFieldType('nope'), '未知类型无效');

  // 13 选项卡（对标 Blender Properties）
  t.eq(PROPERTY_TABS.length, 13, '13 个属性选项卡');
  const ids = PROPERTY_TABS.map(x => x.id);
  for (const want of ['tool', 'render', 'output', 'world', 'object', 'modifier', 'particle', 'physics', 'material', 'meshdata']) {
    t.ok(ids.includes(want), '选项卡含 ' + want);
  }

  // 组件 -> 选项卡归属（既有组件合理归类，不破坏现状）
  t.eq(tabOfComponent('transform'), 'object', 'transform -> object');
  t.eq(tabOfComponent('mesh'), 'object', 'mesh -> object');
  t.eq(tabOfComponent('collider3d'), 'physics', 'collider3d -> physics');
  t.eq(tabOfComponent('material'), 'material', 'material -> material');
  t.eq(tabOfComponent('modifier'), 'modifier', 'modifier -> modifier');
  t.eq(tabOfComponent('unknownComp'), 'object', '未知组件回退 object');
}
