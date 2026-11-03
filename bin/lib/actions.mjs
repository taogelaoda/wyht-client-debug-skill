// bin/lib/actions.mjs —— start/stop/doctor 的纯函数判定层，便于单测
// 解析 "k=v&k2=v2"：允许首尾 ?；空串视为没有额外参数。
// hisUserId / logCollect 有专用开关与语义，出现在这里就是配置错误，直接报出来而不是让两个值打架。
export function parseLoginQuery(text) {
  const raw = String(text === undefined || text === null ? '' : text).trim().replace(/^\?/, '');
  if (!raw) return [];
  const reserved = new Set(['hisUserId', 'logCollect']);
  return raw.split('&').filter(Boolean).map((pair) => {
    const idx = pair.indexOf('=');
    if (idx <= 0) throw new Error('额外参数需要 k=v 形式：' + pair);
    const key = pair.slice(0, idx);
    if (reserved.has(key)) {
      throw new Error('额外参数不能包含 ' + key + '（它由 --his-user-id / --no-log 负责）');
    }
    reserved.add(key);
    return { key, value: pair.slice(idx + 1) };
  });
}

export function buildStartUrl(options) {
  const webUrl = String(options.webUrl || '').replace(/\/+$/, '');
  const query = [];
  if (options.hisUserId) query.push('hisUserId=' + encodeURIComponent(options.hisUserId));
  if (options.log) query.push('logCollect=1');
  // 额外参数按原样拼接：值由用户提供，已经是 URL 编码后的形式
  for (const pair of parseLoginQuery(options.query)) query.push(pair.key + '=' + pair.value);
  return webUrl + '/login' + (query.length ? '?' + query.join('&') : '');
}

/**
 * 生成「登录 URL 编排器」静态页：只生成命令与 URL，不执行任何东西。
 * 用纯函数渲染，便于单测；页面里不回传任何请求。
 * @param {{webUrl?:string, hisUserId?:string, loginQuery?:string, client?:string}} cfg 当前项目配置
 * @returns {string} 完整 HTML
 */
export function renderLoginUiHtml(cfg) {
  const esc = (v) => String(v === undefined || v === null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const data = {
    webUrl: cfg.webUrl || '',
    hisUserId: cfg.hisUserId || '',
    loginQuery: cfg.loginQuery || '',
    client: cfg.client || '',
  };
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>wyht-skill · 登录 URL 编排器</title>
<style>
 body{font:14px/1.6 system-ui,"Microsoft YaHei",sans-serif;margin:24px;max-width:900px}
 label{display:block;margin:12px 0 4px;font-weight:600}
 input[type=text]{width:100%;padding:6px 8px;box-sizing:border-box}
 .row{display:flex;gap:16px;align-items:center;margin-top:12px}
 pre{background:#f5f5f5;padding:12px;overflow:auto;white-space:pre-wrap;word-break:break-all}
 .tip{color:#666;font-size:12px;margin-top:6px}
</style></head><body>
<h3>wyht-skill · 登录 URL 编排器</h3>
<p class="tip">本页只把参数拼成命令与 URL，不发起任何请求、不执行任何东西。复制生成的命令到终端使用。</p>
<div class="row"><label style="margin:0">当前客户端：</label><code id="client"></code></div>
<label>本地前端地址（webUrl）</label><input type="text" id="webUrl">
<label>hisUserId（可留空）</label><input type="text" id="hisUserId">
<label>额外参数（k=v&amp;k2=v2；不要写 hisUserId / logCollect）</label><input type="text" id="query">
<div class="row"><label style="margin:0"><input type="checkbox" id="log" checked> 带上 logCollect=1（页面 console 上报到 9321）</label></div>
<h4>生成的命令</h4><pre id="cmdStart"></pre>
<h4>登录 URL</h4><pre id="url"></pre>
<h4>只换当前窗的页面（不动子窗）</h4><pre id="cmdReload"></pre>
<script>
const cfg = ${JSON.stringify(data).replace(/</g, '\\u003c')};
document.getElementById('client').textContent = cfg.client || '(未指定)';
const $ = (id) => document.getElementById(id);
$('webUrl').value = cfg.webUrl;
$('hisUserId').value = cfg.hisUserId;
$('query').value = cfg.loginQuery;
function url() {
  const base = $('webUrl').value.replace(/\\/+$/, '');
  const q = [];
  if ($('hisUserId').value) q.push('hisUserId=' + encodeURIComponent($('hisUserId').value));
  if ($('log').checked) q.push('logCollect=1');
  const extra = $('query').value.trim().replace(/^\\?/, '');
  if (extra) q.push(extra);
  return base + '/login' + (q.length ? '?' + q.join('&') : '');
}
function render() {
  const extra = $('query').value.trim().replace(/^\\?/, '');
  $('cmdStart').textContent = 'wyht-skill start' + (extra ? ' --query "' + extra + '"' : '');
  $('url').textContent = url();
  $('cmdReload').textContent = 'wyht-skill eval "initObj.reloadChromium(\\'' + url() + '\\')"';
}
['webUrl','hisUserId','query'].forEach((id) => $(id).addEventListener('input', render));
$('log').addEventListener('change', render);
render();
</script></body></html>`;
}

// pickPage 在没有前缀匹配时会退回 list[0]（可能是安装态 file:// 页或远程页），所以命中后必须再核一次
export function matchLocalPage(page, webUrl) {
  return !!(page && webUrl && page.url && page.url.indexOf(webUrl) === 0);
}

export function startPreflight(input) {
  if (input.port9222) {
    const pages = (input.pages || []).filter((p) => p.type === 'page' && p.url && p.url.indexOf('about:') !== 0);
    const shown = pages.length ? pages.map((p) => p.url).join('；') : '（列不到业务页面）';
    return {
      exitCode: 3,
      message: '9222 已被占用：' + shown +
        '\n下一步：先 wyht-skill stop 退出已有实例，再重新 start（单实例下新进程只会转发参数后退出）',
    };
  }
  // dev server 根路径常见 302 跳到 /yl-client-web/，2xx/3xx 都算存活
  if (!(input.webStatus >= 200 && input.webStatus < 400)) {
    return {
      exitCode: 3,
      message: '本地前端未就绪（HTTP ' + (input.webStatus || 0) + '）' +
        (input.webUrl ? '：' + input.webUrl : '') + '\n下一步：先在项目里启动 dev server（如 npm run dev），确认返回 200',
    };
  }
  return { exitCode: 0, message: '' };
}

/**
 * 判断 stop 阶段这次 CDP 报错是不是"调用成功但连接被对端关掉了"。
 * exitApplication 会立刻销毁浏览器进程，响应常常来不及回来，ws 断开属于预期行为。
 * @param {string} message 错误文本
 * @returns {boolean} true = 预期断连，应继续走退出验收
 */
export function isExpectedCdpDrop(message) {
  const text = String(message || '');
  return /CDP 连接失败|ECONNRESET|socket hang up|WebSocket|closed|EOF/i.test(text);
}

export function stopVerdict(input) {
  // null = 探测命令失败，未知不能当成"已退出"，否则会误报停止成功
  if (input.processAlive === null || input.portListening === null) {
    return {
      exitCode: 1,
      message: '探测失败，无法判定是否已退出：' + (input.processAlive === null ? 'tasklist ' : '') +
        (input.portListening === null ? 'netstat ' : '') + '命令没有返回\n下一步：手动确认客户端是否已关闭；仍不行按 skill 红线处理',
    };
  }
  const problems = [];
  if (input.processAlive) {
    problems.push('壳进程仍在（' + (input.processes || []).map((p) => p.name + '(' + p.pid + ')').join('、') + '）');
  }
  if (input.portListening) problems.push('9222 仍在监听');
  if (!problems.length) return { exitCode: 0, message: '已退出（进程消失、9222 已释放）' };
  return {
    exitCode: 1,
    message: '未通过验收：' + problems.join('；') +
      '\n下一步：确认客户端是否弹了确认框；仍不动就按 skill 红线人工处理（不要用 taskkill 代替壳 API）',
  };
}

export function buildDoctorReport(input) {
  const lines = [];
  const mark = (ok) => (ok ? '✅' : '❌');
  if (input.version) lines.push('  版本     ' + input.version);
  // loginQuery 按项目决定明文显示：诊断要靠它判断这次启动到底带没带 key
  if (input.loginQuery) lines.push('  登录参数 ' + input.loginQuery);
  lines.push('  Node     ' + (input.nodeVersion || '未检测到'));
  lines.push('  技能仓库 ' + (input.repoVersion || '未知') +
    (input.behind === null ? '（远端不可达）' : '（落后 ' + input.behind + ' 个提交）'));
  const ports = input.ports || {};
  lines.push('  端口     ' + (input.ports === null
    ? '未知（netstat 没有返回）'
    : '9222 ' + mark(ports[9222]) + '、8080 ' + mark(ports[8080]) + '、9321 ' + mark(ports[9321])));
  const procsUnknown = input.processes === null;
  const procs = input.processes || [];
  lines.push('  壳进程   ' + (procsUnknown
    ? '未知（tasklist 无返回）'
    : procs.length ? procs.map((p) => p.name + '(' + p.pid + ')').join('、') : '未运行'));
  lines.push('  本地前端 HTTP ' + (input.webStatus || 0) + ' ' + mark(input.webStatus >= 200 && input.webStatus < 400));
  const pages = (input.pages || []).filter((p) => p.type === 'page' && p.url && p.url.indexOf('about:') !== 0);
  if (pages.length) {
    lines.push('  页面     ' + pages.map((p) => p.url).join('\n           '));
    const notLocal = !!input.webUrl && !pages.some((p) => p.url.indexOf(input.webUrl) === 0);
    if (notLocal && procs.length) {
      lines.push('  ⚠ 当前 9222 上的页面不是本地前端：先 wyht-skill stop，再 wyht-skill start');
    } else if (notLocal && procsUnknown) {
      lines.push('  ⚠ 当前 9222 上的页面不是本地前端；壳进程未知，无法判断页面归属');
    }
  } else if (ports[9222]) {
    lines.push('  ⚠ 9222 在监听但列不到业务页面（可能只有 about:blank）');
  }
  return lines;
}
