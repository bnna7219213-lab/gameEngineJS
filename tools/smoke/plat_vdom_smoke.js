// plat_vdom smoke：Vue2 vdom diff（游戏版）核心算法与 host 适配器。
// 对标 Vue2 src/core/vdom/patch.js 的 diff 行为 + pythonClasses/beginner/04_vue_global_data 的游戏版映射。
// 覆盖：h()/sameVnode、patch 挂载/替换、updateChildren（key 乱序/增删/移动复用）、
// 属性/样式/事件模块、gnode host（Scene3D 游戏对象树 diff）、VDomReactive（响应式 + watch/computed）。
import { Scene3D, GameObject3D } from '../../src/engine/platform/scene3d.js';
import { sceneHash, meshHash } from '../../src/engine/core/hash.js';
import {
  h, VNode, createTextVNode, sameVnode, cloneVNode,
  createPatchFunction, createGNodeHost, createDomHost, createMockHost,
  VDomApp, createGameDiff, createMockDiff, VDomReactive,
} from '../../src/engine/vdom/index.js';

export const name = 'plat-vdom';

export async function run(t) {
  // ---------- 1. h() / sameVnode / VNode 结构 ----------
  const v1 = h('div', { key: 'k1', attrs: { id: 'x' } }, ['hello']);
  t.ok(v1 instanceof VNode, 'h 返回 VNode');
  t.eq(v1.tag, 'div', 'tag 正确');
  t.eq(v1.key, 'k1', 'key 从 data.key 提取');
  t.eq(v1.children.length, 1, 'children 归一化');
  t.eq(v1.children[0].text, 'hello', '原始字符串转文本节点');
  const v2 = h('div', { key: 'k1' });
  t.ok(sameVnode(v1, v2), 'sameVnode：同 key 同 tag 复用');
  t.ok(!sameVnode(h('div', { key: 'k1' }), h('div', { key: 'k2' })), '不同 key 不复用');
  t.ok(!sameVnode(h('div'), h('span')), '不同 tag 不复用');
  t.ok(sameVnode(h('input', { attrs: { type: 'text' } }), h('input', { attrs: { type: 'number' } })), 'input 文本类 type 互认');
  t.ok(!sameVnode(h('input', { attrs: { type: 'text' } }), h('input', { attrs: { type: 'checkbox' } })), 'input type 不同不复用');
  const tv = h('p', {}, 'text only');
  t.eq(tv.text, 'text only', 'h 第二参为原始值 → 文本 vnode');
  const cl = cloneVNode(v1);
  t.ok(cl.isCloned, 'cloneVNode 标记 isCloned');
  t.eq(cl.children.length, v1.children.length, 'clone 保留 children');

  // ---------- 2. patch 挂载 / 文本 / 注释（mock host）----------
  const mock = createMockDiff();
  mock.render(h('div', { key: 'root', attrs: { id: 'app' } }, [
    h('span', { key: 's1' }, ['A']),
    'plain text',
  ]));
  t.eq(mock.el.tagName, 'DIV', '挂载根节点 tag');
  t.eq(mock.el.attrs.id, 'app', 'attrs 写入 host');
  t.eq(mock.el.childNodes.length, 2, '两个子节点');
  t.eq(mock.el.childNodes[1].tagName, '#text', '文本子节点');
  // 文本更新（不重建）
  const spanEl = mock.el.childNodes[0];
  mock.render(h('div', { key: 'root', attrs: { id: 'app' } }, [
    h('span', { key: 's1' }, ['B']),
    'plain text',
  ]));
  t.eq(mock.el.childNodes[0].childNodes[0].textContent, 'B', '文本子节点内容更新');
  t.ok(mock.el.childNodes[0] === spanEl, '元素复用（同 key 不重建）');

  // ---------- 3. updateChildren：key 乱序 + 增删 + 移动复用 ----------
  const app = createMockDiff();
  app.render(h('ul', { key: 'list' }, [
    h('li', { key: 'a', attrs: { id: 'a' } }, ['A']),
    h('li', { key: 'b', attrs: { id: 'b' } }, ['B']),
    h('li', { key: 'c', attrs: { id: 'c' } }, ['C']),
  ]));
  const elA = app.el.childNodes[0], elB = app.el.childNodes[1], elC = app.el.childNodes[2];
  app.render(h('ul', { key: 'list' }, [
    h('li', { key: 'c', attrs: { id: 'c' } }, ['C']),
    h('li', { key: 'd', attrs: { id: 'd' } }, ['D']),
    h('li', { key: 'a', attrs: { id: 'a' } }, ['A']),
  ]));
  t.eq(app.el.childNodes.map(n => n.attrs.id).join(','), 'c,d,a', '乱序后顺序正确');
  t.ok(app.el.childNodes[0] === elC, 'c 节点复用（移动不重建）');
  t.ok(app.el.childNodes[2] === elA, 'a 节点复用');
  t.eq(app.el.childNodes.length, 3, '删除 b + 新增 d 后长度正确');
  t.eq(app.el.childNodes[1].childNodes[0].textContent, 'D', '新增节点内容正确');
  // 顺序颠倒（reverse）——双端比较的典型场景
  app.render(h('ul', { key: 'list' }, [
    h('li', { key: 'a', attrs: { id: 'a' } }, ['A']),
    h('li', { key: 'd', attrs: { id: 'd' } }, ['D']),
    h('li', { key: 'c', attrs: { id: 'c' } }, ['C']),
  ]));
  t.eq(app.el.childNodes.map(n => n.attrs.id).join(','), 'a,d,c', 'reverse 顺序正确');
  t.ok(app.el.childNodes[0] === elA && app.el.childNodes[2] === elC, 'reverse 全部复用');

  // ---------- 4. 无 key 列表：按位置复用 ----------
  const app2 = createMockDiff();
  app2.render(h('div', { key: 'r' }, [h('i', {}, ['1']), h('i', {}, ['2'])]));
  const i1 = app2.el.childNodes[0];
  app2.render(h('div', { key: 'r' }, [h('i', {}, ['X']), h('i', {}, ['2'])]));
  t.eq(app2.el.childNodes[0].childNodes[0].textContent, 'X', '无 key 按位置更新');
  t.ok(app2.el.childNodes[0] === i1, '无 key 复用同位置节点');

  // ---------- 5. 属性 / 样式 / 事件模块 ----------
  const app3 = createMockDiff();
  const onClick1 = () => 1;
  const onClick2 = () => 2;
  app3.render(h('button', {
    key: 'btn',
    attrs: { id: 'b1', title: 'hi' },
    style: { color: 'red', fontSize: '14px' },
    on: { click: onClick1 },
    class: 'a b',
  }, ['ok']));
  const btn = app3.el;
  t.eq(btn.attrs.title, 'hi', 'attrs 写入');
  t.eq(btn.style.color, 'red', 'style 写入');
  t.eq(btn.className, 'a b', 'class 写入');
  t.ok((btn.listeners.click || []).includes(onClick1), '事件绑定');
  app3.render(h('button', {
    key: 'btn',
    attrs: { id: 'b1' },                     // title 移除
    style: { color: 'blue' },                 // color 改 + fontSize 移除
    on: { click: onClick2 },
    class: 'a',
  }, ['ok']));
  t.eq(btn.attrs.title, undefined, '移除的 attr 被删除');
  t.eq(btn.style.color, 'blue', 'style 更新');
  t.eq(btn.style.fontSize, undefined, '移除的 style 被删除');
  t.ok((btn.listeners.click || []).includes(onClick2) && !(btn.listeners.click || []).includes(onClick1), '事件换绑');
  t.eq(btn.className, 'a', 'class 更新');

  // ---------- 6. ref 注册 ----------
  const app4 = createMockDiff();
  app4.render(h('div', { key: 'x' }, [h('b', { key: 'inner', ref: 'myRef' }, ['R'])]));
  t.ok(app4.$refs.myRef, 'ref 注册到 $refs');
  t.eq(app4.$refs.myRef.tagName, 'B', 'ref 指向正确节点');
  app4.render(h('div', { key: 'x' }, []));
  t.ok(!app4.$refs.myRef, '子节点删除后 ref 解绑');

  // ---------- 7. gnode host：Scene3D 游戏对象树 diff（游戏版核心映射）----------
  const scene = new Scene3D(); scene.name = 'vdom';
  const gapp = createGameDiff(scene);
  gapp.render(h('object', { key: 'world' }, [
    h('cube', { key: 'a', props: { name: 'cubeA', position: [1, 2, 3], albedo: [255, 0, 0], rough: 0.5 } }),
    h('sphere', { key: 'b', props: { name: 'ball', position: [0, 1, 0], albedo: [0, 128, 255] } }),
    h('cylinder', { key: 'c', props: { name: 'pillar', position: [3, 0, 3] } }),
  ]));
  t.eq(scene.objects.size, 3, 'game diff 创建 3 个场景对象');
  const cubeA = [...scene.objects.values()].find(o => o.name === 'cubeA');
  const ball = [...scene.objects.values()].find(o => o.name === 'ball');
  t.eq(cubeA.components.mesh.shape, 'cube', '图元 tag 映射 mesh.shape');
  t.vnear(cubeA.transform.position, [1, 2, 3], 1e-6, 'props.position 写入 transform');
  t.eq(cubeA.components.mesh.albedo.join(','), '255,0,0', 'props.albedo 写入 mesh 组件');
  t.eq(ball.components.mesh.shape, 'sphere', 'sphere tag 映射');

  // 属性更新（props 通道：数组保持结构化）
  gapp.render(h('object', { key: 'world' }, [
    h('cube', { key: 'a', props: { name: 'cubeA', position: [9, 9, 9], albedo: [0, 255, 0] } }),
    h('sphere', { key: 'b', props: { name: 'ball', position: [0, 1, 0], albedo: [0, 128, 255] } }),
    h('cylinder', { key: 'c', props: { name: 'pillar', position: [3, 0, 3] } }),
  ]));
  t.vnear(cubeA.transform.position, [9, 9, 9], 1e-6, '同 key 更新 position（对象复用不重建）');
  t.eq(cubeA.components.mesh.albedo.join(','), '0,255,0', '同 key 更新 albedo');

  // 乱序（Scene3D 对象集合无序语义，验证复用不重建即可）
  const objsBefore = [...scene.objects.values()];
  gapp.render(h('object', { key: 'world' }, [
    h('cylinder', { key: 'c', props: { name: 'pillar', position: [3, 0, 3] } }),
    h('cube', { key: 'a', props: { name: 'cubeA', position: [9, 9, 9], albedo: [0, 255, 0] } }),
    h('sphere', { key: 'b', props: { name: 'ball', position: [0, 1, 0], albedo: [0, 128, 255] } }),
  ]));
  t.eq(scene.objects.size, 3, '乱序后对象数不变（复用不重建）');
  t.ok([...scene.objects.values()].includes(cubeA), '乱序后 cubeA 实例仍在（未重建）');

  // 删除 + 新增
  gapp.render(h('object', { key: 'world' }, [
    h('cube', { key: 'a', props: { name: 'cubeA', position: [9, 9, 9], albedo: [0, 255, 0] } }),
    h('cone', { key: 'd', props: { name: 'spike', position: [5, 0, 5] } }),
  ]));
  t.eq(scene.objects.size, 2, '删除 2 个 + 新增 1 个后数量正确');
  t.ok([...scene.objects.values()].some(o => o.name === 'spike'), '新增 spike 存在');
  t.ok(![...scene.objects.values()].some(o => o.name === 'ball'), 'ball 已删除');
  t.ok(![...scene.objects.values()].some(o => o.name === 'pillar'), 'pillar 已删除');

  // attrs 通道：标量 transform（x/y/z/sx）与 name
  const gapp2 = createGameDiff(new Scene3D());
  gapp2.render(h('object', { key: 'w' }, [
    h('cube', { key: 'k', attrs: { name: 'box', x: 7, sy: 2 } }),
  ]));
  const box = [...gapp2.host._objToNode.values()][0].obj;
  t.eq(box.name, 'box', 'attrs.name 写入');
  t.eq(box.transform.position[0], 7, 'attrs.x 写入 position[0]');
  t.eq(box.transform.scale[1], 2, 'attrs.sy 写入 scale[1]');
  t.eq(box.transform.scale[0], 1, '未指定的 scale 轴保持 1');
  // attrs 与 props 通道独立：attrs 改 x 不影响 props 写入的 albedo
  gapp2.render(h('object', { key: 'w' }, [
    h('cube', { key: 'k', attrs: { name: 'box', x: 8 }, props: { albedo: [9, 9, 9] } }),
  ]));
  t.eq(box.transform.position[0], 8, 'attrs.x 更新');
  t.eq(box.components.mesh.albedo.join(','), '9,9,9', 'props.albedo 独立生效（attrs 更新不互踩）');

  // ---------- 8. VDomReactive：响应式数据 + 自动 diff + watch/computed ----------
  const rapp = createMockDiff();
  const reactive = new VDomReactive(rapp, {
    render: (data) => h('ul', { key: 'list' },
      data.objects.map(o => h('li', { key: o.key, attrs: { id: o.key } }, [o.label]))),
  });
  t.eq(rapp.el.childNodes.length, 0, '初始空列表');
  reactive.data.objects.push({ key: 'n1', label: 'Node1' });
  await new Promise(r => queueMicrotask(r));   // 等待微任务批量 render
  t.eq(rapp.el.childNodes.length, 1, 'push 后自动 diff 出 1 个节点');
  reactive.data.objects.push({ key: 'n2', label: 'Node2' });
  reactive.data.objects.push({ key: 'n3', label: 'Node3' });
  await new Promise(r => queueMicrotask(r));
  t.eq(rapp.el.childNodes.length, 3, '同 tick 多次 push 只批量 render 一次（3 节点）');
  reactive.data.objects.splice(1, 1);
  await new Promise(r => queueMicrotask(r));
  t.eq(rapp.el.childNodes.length, 2, 'splice 删除后自动 diff');
  t.eq(rapp.el.childNodes.map(n => n.attrs.id).join(','), 'n1,n3', '删除中间项后顺序正确');

  // watch：手动 sample 驱动（确定性，无后台线程）
  const seen = [];
  const w = reactive.watch(() => reactive.data.objects.length, (nv, ov) => seen.push([ov, nv]));
  w.sample();                       // 首次采样建立基线
  reactive.data.objects.push({ key: 'n4', label: 'Node4' });
  w.sample();
  t.eq(seen.length, 1, 'watch 值变化触发一次回调');
  t.eq(seen[0].join('->'), '2->3', 'watch 回调带 old/new');
  reactive.data.objects.push({ key: 'n5', label: 'Node5' });
  reactive.tick();                  // tick 驱动全部 watcher
  t.eq(seen.length, 2, 'tick() 驱动 watcher 采样');
  // computed：TTL 缓存
  let computeCount = 0;
  const total = reactive.computed(() => { computeCount++; return reactive.data.objects.length; }, 10);
  const c1 = total.value;
  const c2 = total.value;
  t.eq(c1, c2, 'computed 缓存期内不重算');
  t.eq(computeCount, 1, 'TTL 内只算一次');
  total.invalidate();
  total.value;
  t.eq(computeCount, 2, 'invalidate 后重算');

  // dump 状态面板
  const dump = reactive.dump();
  t.ok(dump.includes('VDomReactive'), 'dump 输出状态面板');
  t.ok(dump.includes('watchers'), 'dump 含 watcher 计数');

  // ---------- 9. 边界与错误（红线 A）----------
  t.throws(() => new VDomApp({}), 'VDomApp 缺 host 抛错');
  t.throws(() => createGameDiff(null), 'createGameDiff 空场景抛错');
  t.throws(() => createDomHost(null), 'createDomHost 无 document 抛错');
  t.throws(() => new VDomReactive(null, { render: () => null }), 'VDomReactive 缺 app 抛错');
  t.throws(() => new VDomReactive(createMockDiff(), {}), 'VDomReactive 缺 render 函数抛错');

  // render 传非 vnode/非文本抛错
  const badApp = createMockDiff();
  t.throws(() => badApp.render({ notAVnode: true }), 'render 非 vnode 抛错');

  // 挂载 → 销毁 → 重新挂载
  const app9 = createMockDiff();
  app9.render(h('div', { key: 'x' }, [h('i', { key: 'y' }, ['Y'])]));
  t.ok(app9.el && app9.el.childNodes.length === 1, '挂载成功');
  app9.destroy();
  t.eq(app9._vnode, null, 'destroy 清空 vnode');
  app9.render(h('div', { key: 'z' }, ['Z']));
  t.eq(app9.el.childNodes[0].textContent, 'Z', '销毁后可重新挂载');

  t.note('vdom diff：Vue2 patch 算法（key 乱序/双端比较）+ game/dom/mock 三 host + 响应式封装全部通过');
}
