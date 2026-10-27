// test/commands-actions.test.mjs —— actions 接线的纯函数判定
import assert from 'assert';
import { resolvePorts, resolveProcesses } from '../bin/lib/commands.mjs';
import { matchLocalPage, startPreflight, stopVerdict, buildDoctorReport } from '../bin/lib/actions.mjs';

export default [
  {
    name: 'resolvePorts 只关心三个端口',
    fn: () => {
      assert.deepStrictEqual(resolvePorts([8080, 9222, 1234]), { 9222: true, 8080: true, 9321: false });
      // pickPage 兜底会选中非本地页：安装态 file:// 与远程页都不算命中
      const webUrl = 'http://localhost:8080/yl-client-web';
      assert.strictEqual(matchLocalPage({ url: webUrl + '/login?hisUserId=1' }, webUrl), true);
      assert.strictEqual(matchLocalPage({ url: 'file:///html/InitForm.html' }, webUrl), false);
      assert.strictEqual(matchLocalPage({ url: 'http://10.0.0.5/yl-client-web/' }, webUrl), false);
      assert.strictEqual(matchLocalPage(null, webUrl), false);
      // dev server 根路径常 302：2xx/3xx 都算存活
      assert.strictEqual(startPreflight({ port9222: false, webStatus: 302, pages: [] }).exitCode, 0);
      assert.strictEqual(startPreflight({ port9222: false, webStatus: 0, pages: [] }).exitCode, 3);
      assert.strictEqual(startPreflight({ port9222: true, webStatus: 200, pages: [] }).exitCode, 3);
      // 探测失败要渲染成"未知"，不能变成三个 ❌ 或"未运行"
      const unknown = buildDoctorReport({ ports: null, processes: null, behind: null, pages: [], webStatus: 0 });
      assert.ok(unknown.some((l) => l.indexOf('端口') !== -1 && l.indexOf('未知') !== -1));
      assert.ok(unknown.some((l) => l.indexOf('壳进程') !== -1 && l.indexOf('未知') !== -1));
    },
  },
  {
    name: 'resolveProcesses 按 exe 名匹配',
    fn: () => {
      const rows = resolveProcesses([{ name: 'czht.exe', pid: 1 }, { name: 'other.exe', pid: 2 }], ['czht.exe']);
      assert.deepStrictEqual(rows, [{ name: 'czht.exe', pid: 1 }]);
      assert.deepStrictEqual(resolveProcesses(null, ['czht.exe']), []);
      // null = 探测失败（未知），不能当成"已退出"
      const unknown = stopVerdict({ processAlive: null, portListening: false, processes: null });
      assert.strictEqual(unknown.exitCode, 1);
      assert.ok(unknown.message.indexOf('无法判定') !== -1);
      assert.strictEqual(stopVerdict({ processAlive: false, portListening: null }).exitCode, 1);
      assert.strictEqual(stopVerdict({ processAlive: false, portListening: false }).exitCode, 0);
    },
  },
];
