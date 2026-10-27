// test/config.test.mjs —— 两层配置：项目文件向上发现 + LOCALAPPDATA 客户端清单
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  findProjectFile, readProject, writeProject, ensureGitignore,
  readClients, writeClients, resolveClient, clientsFilePath,
} from '../bin/lib/config.mjs';

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wyht-cfg-'));
}

export default [
  {
    name: '从子目录向上找到项目配置文件',
    fn: () => {
      const root = tmp();
      fs.writeFileSync(path.join(root, '.wyht-skill.json'), '{"version":1,"client":"a"}');
      const sub = path.join(root, 'frontend', 'yl-client-web');
      fs.mkdirSync(sub, { recursive: true });
      assert.strictEqual(findProjectFile(sub), path.join(root, '.wyht-skill.json'));
    },
  },
  {
    name: '找不到时返回 null',
    fn: () => {
      assert.strictEqual(findProjectFile(tmp()), null);
    },
  },
  {
    name: '读写项目配置（UTF-8 无 BOM）',
    fn: () => {
      const root = tmp();
      writeProject(root, { version: 1, client: 'x', webUrl: 'http://localhost:8080/yl-client-web', hisUserId: 'zgt' });
      assert.strictEqual(readProject(root).client, 'x');
      const raw = fs.readFileSync(path.join(root, '.wyht-skill.json'));
      assert.notStrictEqual(raw.slice(0, 3).toString('hex'), 'efbbbf');
    },
  },
  {
    name: 'gitignore 只追加一次',
    fn: () => {
      const root = tmp();
      ensureGitignore(root, '.wyht-skill.json');
      ensureGitignore(root, '.wyht-skill.json');
      const text = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
      assert.strictEqual(text.split('\n').filter((l) => l.trim() === '.wyht-skill.json').length, 1);
    },
  },
  {
    name: '客户端清单读写，路径固定在 LOCALAPPDATA',
    fn: () => {
      assert.ok(clientsFilePath().indexOf('wyht') !== -1);
      const file = path.join(tmp(), 'clients.json');
      writeClients(file, { version: 1, clients: { a: { dir: 'D:\\a', exe: 'czht.exe' } } });
      assert.strictEqual(readClients(file).clients.a.exe, 'czht.exe');
    },
  },
  {
    name: 'resolveClient：未登记时抛错并提示 clients list',
    fn: () => {
      const clients = { version: 1, clients: { a: { dir: 'D:\\a', exe: 'czht.exe' } } };
      assert.strictEqual(resolveClient(clients, 'a').exe, 'czht.exe');
      assert.throws(() => resolveClient(clients, 'zzz'), /clients list/);
    },
  },
];
