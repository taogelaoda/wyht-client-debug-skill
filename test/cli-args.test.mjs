import assert from 'assert';
import { parseArgs, legacyError, HELP } from '../bin/wyht-skill.mjs';

export default [
  {
    name: '解析子命令与开关',
    fn: () => {
      const a = parseArgs(['start', '--client', '内蒙古', '--no-log', '--timeout', '45']);
      assert.strictEqual(a.command, 'start');
      assert.strictEqual(a.client, '内蒙古');
      assert.strictEqual(a.log, false);
      assert.strictEqual(a.timeout, 45);
    },
  },
  {
    name: '缺省子命令为 install；未知子命令抛错',
    fn: () => {
      assert.strictEqual(parseArgs([]).command, 'install');
      assert.throws(() => parseArgs(['bogus']), /未知子命令/);
      assert.throws(() => parseArgs(['start', '--bogus']), /未知选项/);
      assert.throws(() => parseArgs(['start', '--timeout']), /需要秒数/);
    },
  },
  {
    name: '旧参数给出迁移指引',
    fn: () => {
      assert.ok(legacyError(['install', '--project', 'X']).indexOf('init') !== -1);
      assert.ok(legacyError(['status']).indexOf('doctor') !== -1);
      assert.ok(legacyError(['install', '--force']).indexOf('init') !== -1);
      assert.ok(legacyError(['install', '-force']).indexOf('init') !== -1);
      assert.strictEqual(legacyError(['start']), null);
    },
  },
  {
    name: 'HELP 覆盖全部子命令',
    fn: () => {
      ['install', 'clients', 'init', 'check', 'doctor', 'start', 'stop'].forEach((c) => {
        assert.ok(HELP.indexOf(c) !== -1, 'HELP 缺少 ' + c);
      });
    },
  },
];
