export const name = 'plat_material';
import { Material, MaterialLibrary } from '../../src/engine/platform/material.js';
import { World } from '../../src/engine/platform/world.js';

// 材质 / 世界环境数据块：序列化往返与确定性验收
export async function run(t) {
  // ---- Material 序列化往返 ----
  const m = new Material('steel');
  m.albedo = [0.8, 0.2, 0.1];
  m.roughness = 0.3;
  m.metallic = 0.9;
  m.emissive = [0, 0.1, 0.2];
  m.alpha = 0.95;
  m.albedoMap = 'tex/albedo.png';
  m.normalMap = 'tex/normal.png';
  m.roughnessMap = 'tex/rough.png';
  m.metallicMap = 'tex/metal.png';
  m.emissiveMap = 'tex/emit.png';
  m.occlusionMap = 'tex/ao.png';
  m.doubleSided = true;

  const m2 = Material.deserialize(JSON.parse(JSON.stringify(m.serialize())));
  t.eq(m2.id, m.id, 'Material 往返 id');
  t.eq(m2.name, 'steel', 'Material 往返 name');
  t.vnear(m2.albedo, [0.8, 0.2, 0.1], 1e-9, 'Material 往返 albedo');
  t.near(m2.roughness, 0.3, 1e-9, 'Material 往返 roughness');
  t.near(m2.metallic, 0.9, 1e-9, 'Material 往返 metallic');
  t.vnear(m2.emissive, [0, 0.1, 0.2], 1e-9, 'Material 往返 emissive');
  t.near(m2.alpha, 0.95, 1e-9, 'Material 往返 alpha');
  t.eq(m2.albedoMap, 'tex/albedo.png', 'Material 往返 albedoMap');
  t.eq(m2.normalMap, 'tex/normal.png', 'Material 往返 normalMap');
  t.eq(m2.roughnessMap, 'tex/rough.png', 'Material 往返 roughnessMap');
  t.eq(m2.metallicMap, 'tex/metal.png', 'Material 往返 metallicMap');
  t.eq(m2.emissiveMap, 'tex/emit.png', 'Material 往返 emissiveMap');
  t.eq(m2.occlusionMap, 'tex/ao.png', 'Material 往返 occlusionMap');
  t.eq(m2.doubleSided, true, 'Material 往返 doubleSided');

  // 默认材质往返（null 贴图）
  const d = new Material();
  const d2 = Material.deserialize(d.serialize());
  t.eq(d2.albedoMap, null, '默认材质贴图槽为 null');
  t.vnear(d2.albedo, [1, 1, 1], 1e-9, '默认 albedo 白色');
  t.eq(d2.doubleSided, false, '默认 doubleSided=false');

  // 确定性：同一对象两次序列化键序/内容一致
  t.eq(JSON.stringify(m.serialize()), JSON.stringify(m.serialize()), 'Material 序列化确定性');

  // id 自增
  const a = new Material('a');
  const b = new Material('b');
  t.ok(b.id > a.id, 'Material id 模块内自增');

  // ---- MaterialLibrary ----
  const lib = new MaterialLibrary();
  const id1 = lib.add(m);
  lib.add(a);
  lib.add(b);
  t.eq(id1, m.id, 'Library.add 返回材质 id');
  t.eq(lib.get(m.id), m, 'Library.get 命中');
  t.eq(lib.get(99999), null, 'Library.get 未命中返回 null');
  t.eq(lib.findByName('steel'), m, 'findByName 同名命中');
  t.eq(lib.findByName('a'), a, 'findByName 第二命中');
  t.eq(lib.findByName('missing'), null, 'findByName 未命中返回 null');
  t.ok(lib.remove(b.id), 'remove 返回 true');
  t.eq(lib.get(b.id), null, 'remove 后 get 为 null');
  t.eq(lib.materials.size, 2, 'remove 后数量=2');

  // 库序列化往返：数量与字段一致
  const lib2 = MaterialLibrary.deserialize(JSON.parse(JSON.stringify(lib.serialize())));
  t.eq(lib2.materials.size, lib.materials.size, 'Library 往返数量一致');
  const m3 = lib2.get(m.id);
  t.ok(m3 !== null, 'Library 往返后 get 命中');
  t.vnear(m3.albedo, m.albedo, 1e-9, 'Library 往返 albedo 一致');
  t.eq(m3.doubleSided, true, 'Library 往返 doubleSided 一致');
  t.eq(JSON.stringify(lib2.serialize()), JSON.stringify(lib.serialize()), 'Library 序列化确定性往返');

  // ---- World ----
  const w = World.default();
  t.vnear(w.ambient, [0.04, 0.05, 0.07], 1e-9, '默认 ambient');
  t.eq(w.fog, null, '默认无雾');
  t.eq(w.sky.type, 'gradient', '默认渐变天空');
  t.eq(w.ibl, null, '默认无 ibl');
  t.eq(w.sunDir.length, 3, 'sunDir 为 vec3');

  // 无雾往返
  const w0 = World.deserialize(JSON.parse(JSON.stringify(World.default().serialize())));
  t.eq(w0.fog, null, '无雾往返 fog=null');
  t.vnear(w0.ambient, [0.04, 0.05, 0.07], 1e-9, '无雾往返 ambient');
  t.eq(JSON.stringify(w0.serialize()), JSON.stringify(World.default().serialize()), 'World 序列化确定性');

  // exp 雾往返
  const wf = World.default();
  wf.fog = { type: 'exp', density: 0.05, color: [0.5, 0.6, 0.7] };
  const wf2 = World.deserialize(JSON.parse(JSON.stringify(wf.serialize())));
  t.eq(wf2.fog.type, 'exp', 'exp 雾 type');
  t.near(wf2.fog.density, 0.05, 1e-9, 'exp 雾 density');
  t.vnear(wf2.fog.color, [0.5, 0.6, 0.7], 1e-9, 'exp 雾 color');

  // linear 雾往返
  wf.fog = { type: 'linear', near: 10, far: 200, color: [0.3, 0.3, 0.35] };
  const wf3 = World.deserialize(JSON.parse(JSON.stringify(wf.serialize())));
  t.eq(wf3.fog.type, 'linear', 'linear 雾 type');
  t.near(wf3.fog.near, 10, 1e-9, 'linear 雾 near');
  t.near(wf3.fog.far, 200, 1e-9, 'linear 雾 far');
  t.vnear(wf3.fog.color, [0.3, 0.3, 0.35], 1e-9, 'linear 雾 color');

  // ibl（Float32Array sh 27 系数）往返
  const wi = World.default();
  const sh = new Float32Array(27);
  for (let i = 0; i < 27; ++i) sh[i] = i * 0.01;
  wi.ibl = { sh, avg: [0.1, 0.2, 0.3], intensity: 1.5 };
  wi.sky = { type: 'color', top: [0.2, 0.3, 0.5], bottom: [0.1, 0.1, 0.1], intensity: 0.8 };
  wi.sunDir = [0, -1, 0];
  const wi2 = World.deserialize(JSON.parse(JSON.stringify(wi.serialize())));
  t.eq(wi2.ibl.sh.length, 27, 'ibl sh 长度 27');
  t.vnear(wi2.ibl.sh, Array.from(sh), 1e-9, 'ibl sh 往返');
  t.vnear(wi2.ibl.avg, [0.1, 0.2, 0.3], 1e-9, 'ibl avg 往返');
  t.near(wi2.ibl.intensity, 1.5, 1e-9, 'ibl intensity 往返');
  t.eq(wi2.sky.type, 'color', 'sky type 往返');
  t.vnear(wi2.sky.top, [0.2, 0.3, 0.5], 1e-9, 'sky top 往返');
  t.near(wi2.sky.intensity, 0.8, 1e-9, 'sky intensity 往返');
  t.vnear(wi2.sunDir, [0, -1, 0], 1e-9, 'sunDir 往返');
}
