---
name: wyht-client-debug
description: 当需要在真实 CEF 医生客户端里验证前端改动、抓取请求报文、或重启客户端加载本地代码时使用；按版本分流（≥3.0 为 C++ 壳、<3.0 为 C# 壳，冷/热启动只有 ≥3.1.0 才有），也适用于宿主内页打不开 DevTools 需要走日志采集、9222 端口只见 about:blank、热启动改不动页面、以及准备改 config.db / hosts / 杀进程绕过客户端限制的场景。
version: "3.1.0"
license: MIT
metadata:
  hermes:
    tags: [client, cef, cdp, debugging, frontend, 9222, restart, first-run]
---

# 调试本机 CEF 客户端

## 概述

本技能**唯一入口是 `wyht-skill`**（Node ≥ 24 的命令行，零 npm 依赖）：客户端登记、项目初始化、壳侧自检、机器状态、冷启动与退出都在它里面，不再手写脚本。客户端本身是 CEF 壳 + 多个 Web 窗口，固定暴露 `127.0.0.1:9222`，核心原则不变：**先用壳自己的入口（启动参数 / 配置键 / 壳 API），再考虑系统层手段**（改 hosts、重写 db、杀进程）——后者在演示和联调窗口里翻车率最高，且多数时候根本不需要。

## 前置：一次性 `init`（机器一次 + 项目一次）

```powershell
wyht-skill install                      # 机器级：刷新仓库 + 写命令入口（首次由 bootstrap 引导器完成，之后重跑即升级）
wyht-skill clients add "<客户端目录>"   # 机器级：登记客户端包（目录名形如 WYHT--3.1.1--x64--<时间戳>--<名称>）
wyht-skill init                         # 项目级：在项目根运行，交互问 webUrl / hisUserId
```

- `clients add` 从目录名推版本，自动找 `czht.exe` / `iu.Hrball.exe`；找不到用 `--exe <文件名>`，名字用 `--name <名>` 覆盖。`clients list` 看已登记项（含目录是否还在），`clients rm <名>` 只删登记、不动目录。
- `init` 写项目配置并建 `.claude\skills\wyht-client-debug` 联接（不复制文件）。已登记多个包时 `init --use <名字>` 直接选；原位置是实体目录（多半是手工副本）时拒绝，`--force` 才替换并先备份成 `*.bak-<时间戳>`。

两层配置都由 CLI 读，不需要人工维护：

```jsonc
// 机器级：%LOCALAPPDATA%\wyht\clients.json
{ "version": 1, "clients": { "<名字>": { "dir": "<客户端目录>", "exe": "<主程序>" } } }

// 项目级：<项目根>\.wyht-skill.json（init 会自动加进 .gitignore）
{ "version": 1, "client": "<名字>", "webUrl": "<本地前端地址>", "hisUserId": "" }
```

`wyht-skill` 从当前目录**向上找** `.wyht-skill.json`；找不到就报错退出（在别的目录操作时先 `init`）。换客户端包：`clients add` 新目录，再 `init --use <新名字>`。

`--repo-url <地址>` / `--ref <tag>` 可换源与指定引用；换源会改 origin 并立即刷新。

## 标准动作表

| 命令 | 何时用 | 产出 | 失败怎么办 |
|---|---|---|---|
| `wyht-skill check` | 动手前先跑一次，决定能不能直连 | 判定 + 版本（壳形态与启动语义）+ `ServerUrl` / `HospitalId` + 退出码 `0` 直连 / `2` 安装态 / `3` 前置机 / `4` 读取失败 | `4` = `config.db` 读不到：`clients list` 核对目录，换包后重新 `clients add`；`2` 就走去装机向导，别手改 `IsFirstRun`；`3` 也可能是未初始化 / 客户端未登记，按提示的下一步处理 |
| `wyht-skill doctor` | 客户端起不来、9222 看不到目标页、怀疑仓库落后 | 版本（壳形态与启动语义）、进程、`9222`/`8080`/`9321` 端口、本地前端 HTTP 状态、9222 页面清单、仓库落后几个提交、Node 版本 | 端口/进程在但页面不对：先 `stop` 再 `start`；仓库落后：`install` 升级；Node 不足：先装 Node ≥ 24 |
| `wyht-skill start` | 要让客户端加载本地前端 | 拉起的 PID、命中的本地前端页 URL（默认带 `?logCollect=1`），并写 `%LOCALAPPDATA%\wyht\state.json` | 退出 `3` = 前置条件不满足（exe 不在、9222 已被占、dev server 非 200，都会说明原因）；`1` = 超时内没等到本地页，进程已尝试回收，看客户端 `logs\`、再 `doctor` |
| `wyht-skill stop` | 改完前端要重启、或收工 | 调 `initObj.exitApplication()` 并验收（进程消失 + 9222 释放） | `3` = 9222 上没有可用业务页：按本文件红线人工处理，不要 `taskkill`；`1` = 验收没在超时内通过，重跑 `doctor` 看进程与端口 |

| `wyht-skill page [过滤词]` | 要看 9222 上到底有哪些页面、哪个是主窗/气泡 | 页面目标清单（type + url），可按 URL 子串过滤 | 退出 `3` = 列不到页面：`start` 冷启动，或 `doctor` 看端口与进程 |
| `wyht-skill eval "<表达式>"` | 要读页面里的状态（`initObj`、Vuex、DOM、`location`）做取证 | 命中的页面 URL + 表达式结果；页面脚本抛异常时会打印异常首行 | `3` = 没页面；`1` = 表达式抛错或超时，先 `page` 确认页面对不对 |
| `wyht-skill windows [过滤词]` | 要看 CDP 看不到的窗口（悬浮球等原生窗），确认窗体在不在、在哪 | 可见窗口的 `标题 · 类名 · PID · 宽x高 @(x,y)`，按标题或类名过滤 | 退出 `3` = 没有匹配窗口：`page` 看页面，或 `start` 冷启动 |

## 验证一次改动（标准剧本）

四步，全部用上面的命令，不用手搓 CDP：

1. **备**：先 `wyht-skill doctor` 看有没有别人的实例（有就先 `stop`），再 `wyht-skill start` 冷启动到本地前端，用 `page` 确认 URL 以配置里的 `webUrl` 开头。
2. **造前置状态**：用 `eval` 把缺陷条件做出来。例：验证"登录后旧气泡残留"，先造一个残留气泡
   `wyht-skill eval "initObj.openBubble('http://localhost:8080/yl-client-web/bubble?isfirst=1&message=请重新登录','客户端系统-消息提醒','0')"`
   （注意：`initObj` 上**没有** `openLegacyBubble`，SDK 的该方法映射到 `initObj.openBubble`；方法名不确定就先 `eval "Object.keys(initObj)"`。）
3. **触发**：登录/切换账号这类"改变状态"的动作，要么点真实 UI，要么用 `eval` 改 `location`
   `wyht-skill eval "location.href='http://localhost:8080/yl-client-web/login?hisUserId=zgt&logCollect=1&key=2016'"`
   （本机构建登录需要后端测试 `key`；`start` 拼的 URL 不带它。）
4. **取证**：`page` 看页面（残留的 `bubble?isfirst=1` 应消失、变成 `bubble`），`eval` 读状态
   `wyht-skill eval "initObj.getAllFormNames()"`（同名窗体应只有一个）、
   `eval "document.body.innerText"`（气泡应为空）。最后 `stop` 收尾并确认 9222 释放。

> 取证要写"改动前会怎样"。比如上面这条：改动前气泡正文是「请重新登录」，改动后为空——只报"现在是空的"不算验证。

选项：`start` 的 `--no-log` 去掉 `?logCollect=1`；`--timeout <秒>` 改等待（`start` 默认 30、`stop` 默认 15）；`--client <名>` 临时换包（默认用项目配置里的那个）。退出码 `0` 成功，非 `0` 见上表；`3` 还可能是「未初始化 / 客户端未登记」，按输出里的下一步处理。

## 版本背景（先确认版本，再套规则）

| 版本 | 壳 | 启动语义 |
|---|---|---|
| < 3.0.0 | **C# 壳**（CefSharp 系） | 每次启动都是全新实例 |
| 3.0.x | **C++ 原生 CEF** | 每次启动都是全新实例 |
| ≥ 3.1.0 | C++ 原生 CEF | 单实例：第二次启动只把参数转发给已运行实例后退出（**冷/热启动**这一对概念从 3.1.0 才开始存在） |

- 版本从包目录名取（`WYHT--3.1.1--x64--…` → `3.1.1`），`wyht-skill check` / `doctor` 会直接打印判定后的壳形态与启动语义。
- **本技能所有实测结论来自 3.1.1（C++ 原生 CEF）**。3.0.x 同为 C++ 壳，排障手法基本适用，但缺单实例/热启动这一层；**< 3.0.0 的 C# 壳未做过基线测试**，其中的 CefSharp 相关手册（Cache、User Data 等）在那代壳上是可疑依据而非定论——遇到 < 3.0.0 先确认版本再决定是否照抄本文。
- 版本 < 3.1.0 时：不存在热启动，也没有"第二次启动转发参数后退出"的现象；每次启动都要按冷启动准备。

## 何时使用

- 前端改动必须在真实客户端里验证（浏览器正常、客户端不正常）
- 要抓某个请求的完整报文（如 `goOnline` 的 `key`）
- 改完前端要让客户端重新加载代码
- 客户端没起来、停在初始化页、或 9222 看不到目标页面

不适用：纯浏览器可复现的问题——用 dev server 即可。

## 环境判定（`wyht-skill check` 在做什么）

```bash
wyht-skill check    # 只读 config.db（node:sqlite），不改任何东西
```

| 判定 | 含义 | 动作 |
|---|---|---|
| `install` | `IsFirstRun` 为 true **或键缺失**（宿主默认 true），或 `ServerUrl` 为空 | 宿主强制加载 `file:///html/InitForm.html`，`--url` 被忽略；走完装机向导，别手改 `IsFirstRun` 跳过 |
| `frontend` | 已装，`ServerUrl` 是内网地址 | 接口经**医院前置机代理到外网**；报错先测前置机可达 |
| `direct` | 已装，`ServerUrl` 是公网域名 | 正常联调 |

装机向导会写 `ServerUrl`、`ClientType`、`HospitalId`、`HospitalUserName`，**最后**才写 `IsFirstRun=false` 并重启。`ServerUrl` 有值不代表装完——判定只看 `IsFirstRun`。前置机地址里 `iuWorkStation` 会在启动时被替换成 `iuPublicClientServer`，两种写法都能通。

`check` 还会打印一行 `版本`，格式就是代码的实际输出（例：`版本   3.1.1 · C++ 原生 CEF · 冷/热启动可用`）；目录名里没有 `x.y.z` 时打印"未识别"，按上一节口径人工确认。

动手前先报一行：`版本=… · 环境=install|frontend|direct · ServerUrl=… · HospitalId=…`。

## 快速参考

| 动作 | 正确做法 | 不要做 |
|---|---|---|
| 加载本地前端 | 先确认 dev server 返回 200，再 `wyht-skill start` | 改 `config.db` 地址、改 hosts |
| 退出客户端 | `wyht-skill stop`（走壳 API 并验收） | `taskkill`（非管理员常被拒） |
| 抓请求体 | `Network.enable`（设 `maxPostDataSize`）→ `Network.getRequestPostData` | 只读 `requestWillBeSent.postData`（常为空） |
| 开新页面 | 对已有窗口 `Page.navigate`（先存 `Page.getNavigationHistory`），**目标选当前域的非登录路由** | `PUT /json/new`、`Target.createTarget`（CEF 返回 `Not supported`）；导航到 `/login`（应用当作注销，整壳退出） |
| 热启动传参（**仅 ≥3.1.0**） | 新进程转发参数给已运行实例后退出 | 以为热启动会重载页面 URL；在 <3.1.0 上指望它复用实例 |

具体 CDP frame、PowerShell 连接方式、导航还原步骤：按需读 `cdp-recipes.md`。

## 无 DevTools 时先看日志通道

宿主内嵌页面开不了 DevTools 时，先走项目的日志采集服务：页面侧 `console` 与 `window.onerror` 上报到本机端口，带实时看板回放，比硬上 CDP 省事。

- 地址、端口、开关、看板 URL **以项目 `AGENTS.md` 为准**（例：`frontend/log-service`，`npm start` 后看板 `http://127.0.0.1:9321/`，采集默认关闭、需 `?logCollect=1` 或宿主注入 `window.__LOG_COLLECT__`；`wyht-skill start` 默认就带 `?logCollect=1`，`--no-log` 可关）。
- 日志出不来时按这个顺序查：**采集开关是否开 → 服务是否在监听 → 上报地址是否解析到本机**。别一上来就怀疑注入脚本没生效。
- 它只覆盖 `console` 与前端异常；报文级问题（请求体、响应头）仍要走 CDP。

## 常见错误

| 错误 | 现实 |
|---|---|
| 改 `config.db` 地址或改 hosts 指向本地 | 壳支持 `--url`；改配置常被退出回写覆盖，hosts 改动不可逆 |
| 照 CefSharp/Chrome 手册清 Cache、User Data | ≥3.0.0 是**原生 CEF**，CefSharp 手册不适用；这类手册只对 <3.0.0 的 C# 壳有点关系，而那代未实测——先看版本。"前端不生效"九成是 URL 没生效或处于安装态 |
| 看到 `ServerUrl` 有值就认为装过了 | 判定只看 `IsFirstRun`；`ServerUrl` 可能是装到一半的残留 |
| 手改 `IsFirstRun=false` 图省事 | 会留下缺 `ClientType`/`HospitalId`/`HospitalUserName` 的半装状态 |
| 连点两次 exe 想"确保启动"（≥3.1.0） | 第二次是热启动转发，会覆盖/丢弃第一次的冷启动参数。更早版本会起第二个进程，两个实例争 9222 |
| 没有可用页面就不敢退出 | 先 `Page.getNavigationHistory` 记原 URL，导航到**非登录路由**再调壳 API；不要改用杀进程，也别拿登录页当载体 |
| 从已登录页导航到 `/login` 想"回到登录页" | 应用把这次导航当注销：壳打印 `CloseAllWindows → All windows closed → Exiting application`，**整个客户端退出**（实测 17:02:55）。要回登录页就退出后冷启动 |
| 用 `initObj.closeForm(名字)` 关某个子窗 | 会连主窗一起关（`CloseAllWindows`）→ 客户端退出。关**当前**窗体用 `closeCurrentForm`（SDK 的 `closeForm()` 就是它） |
| 想用 `openNewBall` 再开一个球做实验 | 悬浮球**全客户端唯一**：宿主日志 `openNewBall: 悬浮球已存在，先关闭旧球再按新参数重建`——真球会被替换掉。要验证球状态就改现成的球 |
| 把 `Draggable` 当窗体属性排查 | 它是**持久化全局设置**（落 `config.db` 的 `WebSetting.Draggable`），最后写入者生效、与窗体无关；手工改过要恢复，否则污染这台机器 |
| 为了验证缩放去调 `setZoomLevel` | 本机构建实测：传 `1` 或 `0` 都会**直接退出整个客户端**（3/3 复现），只做 `typeof` 检查，不要执行 |
| 直接调 `initObj.openLegacyBubble(...)` | 3.1.1 的宿主里**没有这个方法**（`TypeError: not a function`）：SDK 的 `openLegacyBubble` 是封装，落到 `initObj.openBubble(url, formName, site)`。方法名不确定时先 `wyht-skill eval "Object.keys(initObj)"` 枚举，别按 SDK 函数名猜宿主方法名 |
| 以为 `windows` 能按窗体名找到气泡窗 | 原生窗口标题是**窗口标题**（如 `客户端系统-机器人` / `FloatBall`），气泡窗常不可见或标题为空。找气泡用 `page`，找球/主窗用 `windows 机器人` |
| 把 `getLocalPrinters()` 当数组 | 实际返回 `{code,datas:[{printName}],message,success}` 的 JSON 字符串，名字在 `datas[].printName` |

## 红线 —— 停下，换正确入口

- 演示/联调窗口内改 hosts、重写 `config.db`、删除 User Data
- 没记录原 URL 就导航已有窗口；把 `/login` 当"中立页"导航（会退整个客户端）
- 用 `closeForm(名字)` 关子窗（连主窗一起关）、用 `openNewBall` 造第二个球（替换掉真球）
- 在非基层安装形态的机器上跑装机向导（会写死 `ClientType`）

## 业务参数

包路径、exe 名、本地前端地址等随构建变化的值只落在项目 `.wyht-skill.json` 与 `%LOCALAPPDATA%\wyht\clients.json`，由 CLI 读取；不要把路径写回本文件。
