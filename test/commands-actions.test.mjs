// test/commands-actions.test.mjs —— actions 接线的纯函数判定
import assert from 'assert';
import { resolvePorts, resolveProcesses } from '../bin/lib/commands.mjs';

export default [
  {
    name: 'resolvePorts 只关心三个端口',
    fn: () => { assert.deepStrictEqual(resolvePorts([8080, 9222, 1234]), { 9222: true, 8080: true, 9321: false }); },
  },
  {
    name: 'resolveProcesses 按 exe 名匹配',
    fn: () => {
      const rows = resolveProcesses([{ name: 'czht.exe', pid: 1 }, { name: 'other.exe', pid: 2 }], ['czht.exe']);
      assert.deepStrictEqual(rows, [{ name: 'czht.exe', pid: 1 }]);
    },
  },
];
