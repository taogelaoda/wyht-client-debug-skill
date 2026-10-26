# CDP 配方（按需加载）

SKILL.md 指到这里时才读。所有脚本都在本机执行；客户端只暴露 `127.0.0.1:9222`。

## 1. 列窗口并取连接地址

```bash
curl -s http://127.0.0.1:9222/json/list
```

按 `type == "page"` 且 `url` 是业务页挑一条，取它的 `id` 与 `webSocketDebuggerUrl`。**不要按数组下标取**——顺序不稳定。`localhost:9222` 可能落到 `[::1]` 上的另一个 Chrome，只见 `about:blank`。

## 2. 抓 POST 请求体

```js
// 一条长连接发完所有 frame，requestId 才连续
const ws = new WebSocket(webSocketDebuggerUrl);
await new Promise(r => (ws.onopen = r));
ws.send(JSON.stringify({ id: 1, method: 'Network.enable',
  params: { maxPostDataSize: 10 * 1024 * 1024 } })); // 不设则 postData 为空
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.method === 'Network.requestWillBeSent' && m.params.request.url.includes('/user/goOnline')) {
    ws.send(JSON.stringify({ id: 2, method: 'Network.getRequestPostData',
      params: { requestId: m.params.requestId } })); // 唯一可靠的取 body 方式
  }
};
```

触发请求：优先点页面上的真实按钮，或调页面自己的全局方法；最后才 `Page.reload({ignoreCache:true})`——reload 会丢内存登录态。

判定"字段带没带"要看三处：body 里有无该键、`Network.requestWillBeSentExtraInfo` 的 headers（实际发出的头）、响应状态。只看 body 为空就断言没带，是常见误判。

## 3. 临时导航并还原

```jsonc
{"id":3,"method":"Page.getNavigationHistory"}      // 先存 currentIndex / entries[i].id / url
{"id":4,"method":"Page.navigate","params":{"url":"<新 URL>"}}
{"id":5,"method":"Page.navigateToHistoryEntry","params":{"entryId":<存下的 id>}}
{"id":6,"method":"Page.getNavigationHistory"}      // 复核 currentIndex 与 url 已回原值
```

CEF **不支持** `PUT /json/new` 与 `Target.createTarget`（返回 `Not supported`），也不要把 `about:blank` 当载体。

## 4. 退出客户端

对任一非 `about:*` 页面执行：

```json
{"id":7,"method":"Runtime.evaluate","params":{"expression":"initObj.exitApplication()","returnByValue":true}}
```

没有可用页面时：先 `Page.navigate`（记原 URL）到一个正常页，再执行上面的调用；不要改用杀进程。执行后按 SKILL.md 的三条验收确认（进程消失 / 9222 不再 Listen / 新 PID 不同）。

## 5. Windows 上发 CDP 的两种方式

```powershell
# 有 websocat
websocat -n1 "<webSocketDebuggerUrl>" <<< '{"id":1,"method":"Runtime.evaluate","params":{"expression":"location.href"}}'

# 无第三方工具：PowerShell 原生 WebSocket
$c = [System.Net.WebSockets.ClientWebSocket]::new()
$c.ConnectAsync([uri]"<webSocketDebuggerUrl>", [Threading.CancellationToken]::None).Wait(5000)
$body = '{"id":1,"method":"Runtime.evaluate","params":{"expression":"location.href","returnByValue":true}}'
$bytes = [Text.Encoding]::UTF8.GetBytes($body)
$c.SendAsync([ArraySegment[byte]]::new($bytes), 'Text', $true, [Threading.CancellationToken]::None).Wait(5000)
$buf = New-Object byte[] 65536
$r = $c.ReceiveAsync([ArraySegment[byte]]::new($buf), [Threading.CancellationToken]::None).Result
[Text.Encoding]::UTF8.GetString($buf, 0, $r.Count)
$c.Dispose()
```

注意 PowerShell 5 里 `curl` 是 `Invoke-WebRequest` 的别名，命令行调 CDP 一律写 `curl.exe`。
