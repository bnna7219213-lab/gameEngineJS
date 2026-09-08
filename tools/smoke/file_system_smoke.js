export const name = 'file-system';
import { InMemoryFileSystem, OPFSFileSystem, createFileSystem, buildFileTree } from '../../src/editor/file_system.js';

export async function run(t) {
  // InMemoryFileSystem：read/write/list
  const fs = new InMemoryFileSystem();
  t.eq(fs.read('a.js'), null, '不存在返回 null');
  fs.write('scripts/player.js', 'const x=1;');
  t.eq(fs.read('scripts/player.js'), 'const x=1;', '写入后可读回');
  fs.write('scripts/enemy.js', 'const y=2;');
  const list = fs.list();
  t.ok(list.includes('scripts/player.js') && list.includes('scripts/enemy.js'), 'list 含两个文件');
  fs.write('scripts/player.js', 'const x=9;');
  t.eq(fs.read('scripts/player.js'), 'const x=9;', '覆盖写入');

  // createFileSystem：无 OPFS 环境退化为 InMemory（红线 E）
  const auto = createFileSystem();
  t.ok(auto instanceof InMemoryFileSystem, '无 OPFS 时返回 InMemoryFileSystem');
  auto.write('b.txt', 'hi');
  t.eq(auto.read('b.txt'), 'hi', '工厂实例可读写');

  // OPFSFileSystem：类型存在、接口齐全（不真连 OPFS，仅检查方法）
  t.eq(typeof OPFSFileSystem.prototype.read, 'function', 'OPFSFileSystem.read 为函数');
  t.eq(typeof OPFSFileSystem.prototype.write, 'function', 'OPFSFileSystem.write 为函数');
  t.eq(typeof OPFSFileSystem.prototype.list, 'function', 'OPFSFileSystem.list 为函数');

  // buildFileTree：扁平路径 → 嵌套树
  const tree = buildFileTree([
    { path: 'scripts/player.js', content: 'a' },
    { path: 'scripts/enemy.js', content: 'b' },
    { path: 'README.md', content: 'c' },
  ]);
  t.ok(tree.dirs.scripts, '生成 scripts 目录节点');
  t.eq(tree.dirs.scripts.files.length, 2, 'scripts 目录含 2 文件');
  t.eq(tree.files.length, 1, '根含 1 个文件');
  t.eq(tree.dirs.scripts.files[0].name, 'enemy.js', '目录内文件按名排序（e < p）');
  t.eq(tree.dirs.scripts.files[0].content, 'b', '树节点保留 content');

  // 多级嵌套
  const tree2 = buildFileTree([{ path: 'src/a/b/c.js', content: '' }]);
  t.ok(tree2.dirs.src && tree2.dirs.src.dirs.a && tree2.dirs.src.dirs.a.dirs.b, '多级嵌套目录展开');
  t.eq(tree2.dirs.src.dirs.a.dirs.b.files[0].name, 'c.js', '最深文件正确');
}
