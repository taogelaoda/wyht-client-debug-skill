import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { addClientEntry, removeClientEntry } from '../bin/lib/commands.mjs';

export default [
  {
    name: 'addClientEntry 拒绝不存在的目录',
    fn: () => { assert.throws(() => addClientEntry({ clients: {} }, 'D:\\no-such-dir-wyht'), /目录不存在/); },
  },
  {
    name: 'addClientEntry 用推导名登记并探测 exe',
    fn: () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'WYHT--3.1.1--x64--20261021_102251--'));
      fs.writeFileSync(path.join(dir, 'czht.exe'), '');
      const store = { version: 1, clients: {} };
      const name = addClientEntry(store, dir);
      assert.ok(name.indexOf('3.1.1') === 0);
      assert.strictEqual(store.clients[name].exe, 'czht.exe');
      assert.strictEqual(store.clients[name].dir, dir);
    },
  },
  {
    name: 'removeClientEntry 只移除登记',
    fn: () => {
      const store = { version: 1, clients: { a: { dir: 'D:\\a', exe: 'czht.exe' } } };
      assert.strictEqual(removeClientEntry(store, 'a'), true);
      assert.deepStrictEqual(store.clients, {});
      assert.strictEqual(removeClientEntry(store, 'a'), false);
    },
  },
];
