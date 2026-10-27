import assert from 'assert';
import { deriveClient, versionSemantics, detectExe } from '../bin/lib/derive.mjs';

export default [
  {
    name: '从包目录名推导名字与版本',
    fn: () => {
      const r = deriveClient('D:\\WYHT--3.1.1--x64--20261021_102251--医保凭证');
      assert.strictEqual(r.version, '3.1.1');
      assert.strictEqual(r.name, '3.1.1-医保凭证');
    },
  },
  {
    name: '目录名里没有版本时回落为目录尾段',
    fn: () => {
      const r = deriveClient('D:\\Document\\outprovince-doctor-client-内蒙古演示');
      assert.strictEqual(r.version, null);
      assert.strictEqual(r.name, '内蒙古演示');
    },
  },
  {
    name: '版本语义：3.0 是 C++ 但无热启动',
    fn: () => {
      const r = versionSemantics('3.0.4');
      assert.ok(r.shell.indexOf('C++') === 0);
      assert.strictEqual(r.hotStart, false);
    },
  },
  {
    name: '版本语义：3.1.1 冷热启动可用，<3.0 是 C# 壳',
    fn: () => {
      assert.strictEqual(versionSemantics('3.1.1').hotStart, true);
      assert.ok(versionSemantics('2.9.7').shell.indexOf('C#') === 0);
    },
  },
  {
    name: 'detectExe 在空目录返回 null',
    fn: () => {
      assert.strictEqual(detectExe('D:\\definitely-not-exist-wyht'), null);
    },
  },
];
