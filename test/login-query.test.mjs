// test/login-query.test.mjs —— 登录 URL 的额外参数（如后端测试 key）与编排页
import assert from 'assert';
import { buildStartUrl, parseLoginQuery, renderLoginUiHtml, buildDoctorReport, isExpectedCdpDrop } from '../bin/lib/actions.mjs';

export default [
  {
    name: 'buildStartUrl 只拼 hisUserId 与 logCollect',
    fn: () => {
      assert.strictEqual(
        buildStartUrl({ webUrl: 'http://localhost:8080/yl-client-web/', hisUserId: 'zgt', log: true }),
        'http://localhost:8080/yl-client-web/login?hisUserId=zgt&logCollect=1',
      );
    },
  },
  {
    name: 'buildStartUrl 追加额外参数且不再编码',
    fn: () => {
      const url = buildStartUrl({
        webUrl: 'http://localhost:8080/yl-client-web',
        hisUserId: 'z',
        log: false,
        query: 'key=abc&scene=1',
      });
      assert.strictEqual(url, 'http://localhost:8080/yl-client-web/login?hisUserId=z&key=abc&scene=1');
    },
  },
  {
    name: 'parseLoginQuery 容忍问号前缀与空串',
    fn: () => {
      assert.deepStrictEqual(parseLoginQuery(''), []);
      assert.deepStrictEqual(parseLoginQuery(null), []);
      assert.deepStrictEqual(parseLoginQuery('?key=1'), [{ key: 'key', value: '1' }]);
    },
  },
  {
    name: 'parseLoginQuery 拒绝专用键与无等号',
    fn: () => {
      assert.throws(() => parseLoginQuery('hisUserId=z'), /不能包含 hisUserId/);
      assert.throws(() => parseLoginQuery('logCollect=1'), /不能包含 logCollect/);
      assert.throws(() => parseLoginQuery('novalue'), /k=v/);
    },
  },
  {
    name: '编排页嵌入配置且不打断脚本',
    fn: () => {
      const html = renderLoginUiHtml({ webUrl: 'http://localhost:8080/yl-client-web', hisUserId: 'z', loginQuery: 'key=1', client: 'c</script>' });
      assert.ok(html.includes('id="query"'), '应有额外参数输入框');
      assert.ok(html.includes('wyht-skill start'), '应生成 start 命令');
      // 客户端名里的 </script> 必须转义，否则会提前闭合脚本块
      assert.ok(!html.includes('c</script>'), '配置值必须转义');
      const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
      assert.doesNotThrow(() => new Function(script), '页面脚本必须可解析');
    },
  },
  {
    name: 'exitApplication 引起的连接断开不算失败',
    fn: () => {
      assert.ok(isExpectedCdpDrop('CDP 连接失败：ws://127.0.0.1:9222/devtools/page/ABC'));
      assert.ok(isExpectedCdpDrop('socket hang up'));
      assert.ok(!isExpectedCdpDrop('页面脚本异常：boom'));
    },
  },
  {
    name: 'doctor 显示登录参数（明文，便于判断这次启动带没带 key）',
    fn: () => {
      const lines = buildDoctorReport({ loginQuery: 'key=1', ports: {}, processes: [], pages: [] });
      assert.ok(lines.some((l) => l.includes('登录参数 key=1')));
    },
  },
];
