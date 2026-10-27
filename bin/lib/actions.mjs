// bin/lib/actions.mjs —— start/stop/doctor 的纯函数判定层，便于单测
export function buildStartUrl(options) {
  const webUrl = String(options.webUrl || '').replace(/\/+$/, '');
  const query = [];
  if (options.hisUserId) query.push('hisUserId=' + encodeURIComponent(options.hisUserId));
  if (options.log) query.push('logCollect=1');
  return webUrl + '/login' + (query.length ? '?' + query.join('&') : '');
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
