import { sleep } from './probe.mjs';

export const CDP_HOST = '127.0.0.1';
export const CDP_PORT = 9222;

export function cdpEndpoint(pathname) {
  return 'http://' + CDP_HOST + ':' + CDP_PORT + pathname;
}

export async function listPages() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(cdpEndpoint('/json/list'), { signal: controller.signal });
    if (!res.ok) return [];
    return await res.json();
  } catch (e) {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export function pickPage(pages, prefix) {
  // 排除 devtools：开着调试器时它也是 type=page 且带 ws 地址，退回首选会评估到调试器里
  const list = (pages || []).filter((p) => p.type === 'page' && p.url && !/^(about|devtools):/.test(p.url));
  if (!list.length) return null;
  if (prefix) {
    for (const p of list) if (p.url.indexOf(prefix) === 0) return p;
  }
  return list[0];
}

export function evaluate(page, expression, options) {
  const opts = options || {};
  const timeoutMs = opts.timeoutMs || 5000;
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    const close = () => {
      try { ws.close(); } catch (e) { /* 忽略 */ }
    };
    const timer = setTimeout(() => {
      close();
      reject(new Error('CDP evaluate 超时（' + timeoutMs + 'ms）'));
    }, timeoutMs);

    ws.onopen = () => {
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
    };
    ws.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(String(event.data));
      } catch (e) {
        return;
      }
      if (msg.id !== 1) return;
      clearTimeout(timer);
      close();
      if (msg.error) reject(new Error('CDP 错误：' + JSON.stringify(msg.error)));
      else resolve(msg.result);
    };
    ws.onerror = () => {
      clearTimeout(timer);
      close();
      reject(new Error('CDP 连接失败：' + page.webSocketDebuggerUrl));
    };
  });
}

export async function waitForPage(predicate, options) {
  const opts = options || {};
  const timeoutMs = opts.timeoutMs || 30000;
  const intervalMs = opts.intervalMs || 500;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const hit = predicate(await listPages());
    if (hit) return hit;
    if (Date.now() > deadline) return null;
    await sleep(intervalMs);
  }
}
