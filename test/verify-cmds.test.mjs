import assert from 'assert';
import { formatPageLine, extractEvalValue } from '../bin/lib/commands.mjs';
import { filterWindows } from '../bin/lib/win.mjs';

const windows = [
  { title: '客户端系统-机器人', cls: 'FloatBall', pid: 1, l: 10, t: 20, w: 52, h: 62 },
  { title: '客户端系统-消息提醒', cls: '#32770', pid: 2, l: 30, t: 40, w: 380, h: 620 },
  { title: '', cls: 'Shell_TrayWnd', pid: 3, l: 0, t: 0, w: 10, h: 10 },
];

export default [
  {
    name: 'formatPageLine 输出 type 与 url',
    fn: () => {
      assert.strictEqual(formatPageLine({ type: 'page', url: 'http://x/y' }), '  page  http://x/y');
      assert.strictEqual(formatPageLine({}), '  page  ');
    },
  },
  {
    name: 'extractEvalValue 取 value：字符串原样、其余 JSON',
    fn: () => {
      assert.deepStrictEqual(extractEvalValue({ result: { type: 'string', value: 'hi' } }), { has: true, text: 'hi' });
      assert.deepStrictEqual(extractEvalValue({ result: { type: 'number', value: 2 } }), { has: true, text: '2' });
    },
  },
  {
    name: 'extractEvalValue 无 value 时回退整段 JSON；无 result 时 has=false',
    fn: () => {
      const obj = extractEvalValue({ result: { type: 'object', description: 'Object' } });
      assert.strictEqual(obj.has, true);
      assert.ok(obj.text.indexOf('"type":"object"') !== -1);
      assert.strictEqual(extractEvalValue(null).has, false);
    },
  },
  {
    name: 'filterWindows 按标题或类名匹配，空过滤返回全部',
    fn: () => {
      assert.deepStrictEqual(filterWindows(windows, '消息提醒').map((w) => w.pid), [2]);
      assert.deepStrictEqual(filterWindows(windows, 'floatball').map((w) => w.pid), [1]);
      assert.strictEqual(filterWindows(windows, '').length, 3);
      assert.deepStrictEqual(filterWindows(windows, 'nope'), []);
      assert.deepStrictEqual(filterWindows(null, ''), []);
    },
  },
];
