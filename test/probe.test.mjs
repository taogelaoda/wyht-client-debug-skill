import assert from 'assert';
import http from 'http';
import { parseNetstatListening, parseTasklist, httpStatus } from '../bin/lib/probe.mjs';

export default [
  {
    name: 'netstat 只解析 LISTENING 行',
    fn: () => {
      const text = [
        '  TCP    127.0.0.1:9222         0.0.0.0:0              LISTENING       57600',
        '  TCP    127.0.0.1:8080         0.0.0.0:0              LISTENING       1234',
        '  TCP    127.0.0.1:5000         127.0.0.1:9222         TIME_WAIT       0',
      ].join('\r\n');
      assert.deepStrictEqual(parseNetstatListening(text).sort(), [8080, 9222]);
    },
  },
  {
    name: 'tasklist CSV 解析出进程名与 PID',
    fn: () => {
      const rows = parseTasklist('"czht.exe","23188","Console","1","120,000 K"\r\n');
      assert.deepStrictEqual(rows, [{ name: 'czht.exe', pid: 23188 }]);
    },
  },
  {
    name: 'httpStatus 返回真实状态码',
    fn: async () => {
      const server = http.createServer((req, res) => {
        res.statusCode = req.url === '/ok' ? 200 : 404;
        res.end('x');
      });
      await new Promise((r) => server.listen(0, '127.0.0.1', r));
      const port = server.address().port;
      try {
        assert.strictEqual(await httpStatus('http://127.0.0.1:' + port + '/ok'), 200);
        assert.strictEqual(await httpStatus('http://127.0.0.1:' + port + '/missing'), 404);
      } finally {
        // 断言失败也必须关掉监听，测试套件结束时不留端口
        await new Promise((r) => server.close(r));
      }
    },
  },
  {
    name: 'httpStatus 对不可达地址返回 0 且不抛',
    fn: async () => {
      assert.strictEqual(await httpStatus('http://127.0.0.1:1/', { timeoutMs: 800 }), 0);
    },
  },
];
