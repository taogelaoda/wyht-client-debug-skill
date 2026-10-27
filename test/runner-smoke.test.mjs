import assert from 'assert';

export default [
  { name: 'runner 能执行到用例', fn: () => { assert.strictEqual(1 + 1, 2); } },
];
