export const name = 'plat';
import { normalize, MemoryRoot, PakRoot, VFS } from '../../src/engine/platform/vfs.js';
import { parseOBJ, compressZTC4x4, decompressZTC4x4, encodeBC7, decodeBC7, writeMesh, readMesh, writeTexture, readTexture } from '../../src/engine/platform/asset_pipeline.js';
import { Scene, GameObject } from '../../src/engine/platform/scene.js';
import { Scene3D, GameObject3D } from '../../src/engine/platform/scene3d.js';
import { LoopbackTransport, Replicator } from '../../src/engine/platform/network.js';
import { AudioEngine, osc } from '../../src/engine/platform/audio.js';
import { ResourceCache } from '../../src/engine/platform/resource.js';
import { GameRuntime } from '../../src/engine/platform/runtime.js';
import { ScriptContext } from '../../src/engine/platform/scripting.js';
import { DDC } from '../../src/engine/platform/ddc.js';
import { hydrate } from '../../src/engine/platform/hydrator.js';
import { exportJSON, exportStandaloneHTML } from '../../src/engine/platform/exporter.js';
import { Console, tokenize } from '../../src/engine/platform/cvar_console.js';
import { Prefab, instantiate } from '../../src/engine/platform/prefab.js';

export async function run(t) {
  // vfs
  t.eq(normalize('/a/../b/c'), 'b/c'); t.eq(normalize('a/./b'), 'a/b');
  const mem = new MemoryRoot(); await mem.write('x.txt', 'hi'); t.eq(await mem.read('x.txt'), 'hi');
  const vfs = new VFS(); vfs.mount(mem); await vfs.write('y.txt', 'yo'); t.eq(await vfs.read('y.txt'), 'yo');
  const pak = PakRoot.pack([['a.txt', 'hello'], ['b.bin', new Uint8Array([1,2,3])]]); const p2 = new PakRoot(); p2.load(pak);
  t.eq(await p2.read('a.txt'), 'hello');

  // asset pipeline
  const mesh = parseOBJ('o cube\nv 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nf 1 2 3 4\n');
  t.ok(mesh.positions.length >= 12 && mesh.indices.length >= 4);
  const rgba = new Uint8Array(8 * 8 * 4).fill(0);
  for (let i = 0; i < 64; i++) { rgba[i*4]=100; rgba[i*4+1]=150; rgba[i*4+2]=200; rgba[i*4+3]=255; }
  const comp = compressZTC4x4(rgba, 8, 8); const dec = decompressZTC4x4(comp, comp.w, comp.h, 8, 8);
  t.exact(dec, rgba, 'constant-block ZTC4x4 exact roundtrip');
  const bc7 = encodeBC7(rgba, 8, 8); const dbc7 = decodeBC7(bc7, bc7.w, bc7.h, 8, 8);
  t.exact(dbc7, rgba, 'constant-block BC7 exact roundtrip');
  const m = { positions: new Float32Array([0,0,0,1,0,0,1,1,0,0,1,0]), normals: new Float32Array([0,0,1,0,0,1,0,0,1,0,0,1]), indices: new Uint32Array([0,1,2,0,2,3]), vertexCount: 4, indexCount: 6 };
  const mb = writeMesh(m); const m2 = readMesh(mb);
  t.vnear(m2.positions, m.positions, 1e-5); t.exact(m2.indices, m.indices);
  const tx = { w: 4, h: 4, format: 0, rgba: new Uint8Array(4*4*4).fill(123) };
  const tb = writeTexture(tx); t.exact(readTexture(tb).rgba, tx.rgba);

  // scene
  const s = new Scene(); const o = new GameObject('a'); s.add(o);
  t.eq(s.get(o.id).name, 'a'); t.ok(s.findByName('a'));
  const s3 = new Scene3D(); const g = new GameObject3D('b', { position: [1,2,3] }); s3.add(g);
  t.vnear(s3.get(g.id).transform.position, [1,2,3]);

  // network
  const tr = new LoopbackTransport(); const rep = new Replicator(tr);
  rep.set('p1', { x: 0 }); rep.sendSnapshot();
  t.ok(rep.bandwidth > 0); t.eq(rep.client.p1.x, 0, 'client received delta');

  // audio
  const eng = new AudioEngine(); const out = eng.render(441);
  t.eq(out.length, 441); let af = true; for (let i = 0; i < out.length; i++) if (!isFinite(out[i])) af = false;
  t.ok(af); t.near(osc('sine', 0.25), 1, 1e-9);

  // resource
  const rc = new ResourceCache(async (k) => ({ k })); const v = await rc.load('a');
  t.eq(v.k, 'a'); t.eq(rc.state('a'), 'ready'); rc.unload('a');

  // runtime
  const rt = new GameRuntime(); const sc = new Scene3D(); const go = new GameObject3D('e', { position: [0, 10, 0] }); sc.add(go);
  rt.attachScene3d(sc); rt.stepPhysics(0.1); rt.stepPhysics(0.1);
  t.ok(rt.getRuntimeTransform(go.id).position[1] < 10, 'runtime gravity');

  // scripting
  const scx = new ScriptContext(); let got = null; scx.on('hit', (d) => { got = d; }); scx.emit('hit', 42); t.eq(got, 42);

  // ddc
  const ddc = new DDC(); ddc.put('k', 7); t.eq(ddc.get('k'), 7); t.eq(ddc.stats().hit, 1);

  // hydrator
  const hsc = new Scene3D(); const hgo = new GameObject3D('e', { position: [1,0,0] });
  hgo.components.mesh = { bounds: [[0,0,0],[1,1,1]] }; hsc.add(hgo);
  const items = hydrate(hsc); t.eq(items.length, 1); t.ok(items[0].aabb, 'aabb computed');

  // exporter
  t.ok(exportStandaloneHTML({ name: 'P', objects: { 1: { name: 'a' } } }).includes('<html'));
  t.eq(JSON.parse(exportJSON({ a: 1 })).a, 1, 'exportJSON roundtrips');

  // cvar console
  t.eq(tokenize('a "b c" d').length, 3);
  const c = new Console(); c.register('echo', async (a) => a.join(' ')); t.eq(await c.exec('echo hello world'), 'hello world');

  // prefab
  const world = { entities: new Map(), _n: 0, createEntity(name, transform, parent, components) { const id = 'id' + (++this._n); this.entities.set(id, { id, name, transform, parent, components }); return id; } };
  const tree = new Prefab({ name: 'root', transform: { position: [1,0,0] }, children: [{ name: 'child', transform: { position: [2,0,0] } }] });
  const ids = instantiate(tree, world);
  t.eq(ids.length, 2);
  t.vnear(world.entities.get(ids[0]).transform.position, [1,0,0]);
  t.vnear(world.entities.get(ids[1]).transform.position, [3,0,0], 1e-9);
}
