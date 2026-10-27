---
name: wyht-client-debug
description: 当需要在真实 CEF 医生客户端里验证前端改动、抓取请求报文、或重启客户端加载本地代码时使用；按版本分流（≥3.0 为 C++ 壳、<3.0 为 C# 壳，冷/热启动只有 ≥3.1.0 才有），也适用于宿主内页打不开 DevTools 需要走日志采集、9222 端口只见 about:blank、热启动改不动页面、以及准备改 config.db / hosts / 杀进程绕过客户端限制的场景。
version: "2.6.3"
license: MIT
metadata:
  hermes:
    tags: [client, cef, cdp, debugging, frontend, 9222, restart, first-run]
---

# 调试本机 CEF 客户端

## 概述

客户端是 CEF 壳 + 多个 Web 窗口，固定暴露 `127.0.0.1:9222`。核心原则：**先用壳自己的入口（启动参数 / 配置键 / 壳 API），再考虑系统层手段**（改 hosts、重写 db、杀进程）——后者在演示和联调窗口里翻车率最高，且多数时候根本不需要。

## 版本背景（先确认版本，再套规则）

| 版本 | 壳 | 启动语义 |
|---|---|---|
| < 3.0.0 | **C# 壳**（CefSharp 系） | 每次启动都是全新实例 |
| 3.0.x | **C++ 原生 CEF** | 每次启动都是全新实例 |
| ≥ 3.1.0 | C++ 原生 CEF | 单实例：第二次启动只把参数转发给已运行实例后退出（**冷/热启动**这一对概念从 3.1.0 才开始存在） |

- 版本从包目录名取（`WYHT--3.1.1--x64--…` → `3.1.1`），`check_env.py` 会直接打印判定后的壳形态与启动语义。
- **本技能所有实测结论来自 3.1.1（C++ 原生 CEF）**。3.0.x 同为 C++ 壳，排障手法基本适用，但缺单实例/热启动这一层；**< 3.0.0 的 C# 壳未做过基线测试**，其中的 CefSharp 相关手册（Cache、User Data 等）在那代壳上是可疑依据而非定论——遇到 < 3.0.0 先确认版本再决定是否照抄本文。
- 版本 < 3.1.0 时：不存在热启动，也没有"第二次启动转发参数后退出"的现象；每次启动都要按冷启动准备（先确认无残留实例，再带 `--url`）。

## 何时使用

- 前端改动必须在真实客户端里验证（浏览器正常、客户端不正常）
- 要抓某个请求的完整报文（如 `goOnline` 的 `key`）
- 改完前端要让客户端重新加载代码
- 客户端没起来、停在初始化页、或 9222 看不到目标页面

不适用：纯浏览器可复现的问题——用 dev server 即可。

## 环境自检（先做，决定怎么启动）

```bash
# 相对仓库根执行；在技能目录内可简写为 python scripts/check_env.py
python .claude/skills/wyht-client-debug/scripts/check_env.py --dir "<客户端目录>"   # 只读，退出码 0=直连 2=安装态 3=前置机
```

| 判定 | 含义 | 动作 |
|---|---|---|
| `install` | `IsFirstRun` 为 true **或键缺失**（宿主默认 true），或 `ServerUrl` 为空 | 宿主强制加载 `file:///html/InitForm.html`，`--url` 被忽略；走完装机向导，别手改 `IsFirstRun` 跳过 |
| `frontend` | 已装，`ServerUrl` 是内网地址 | 接口经**医院前置机代理到外网**；报错先测前置机可达 |
| `direct` | 已装，`ServerUrl` 是公网域名 | 正常联调 |

装机向导会写 `ServerUrl`、`ClientType`、`HospitalId`、`HospitalUserName`，**最后**才写 `IsFirstRun=false` 并重启。`ServerUrl` 有值不代表装完——判定只看 `IsFirstRun`。前置机地址里 `iuWorkStation` 会在启动时被替换成 `iuPublicClientServer`，两种写法都能通。

脚本还会打印一行 `版本:`，直接给出壳形态与启动语义（例：`3.1.1 · C++ 原生 CEF · 冷/热启动可用`）；目录名里没有 `x.y.z` 时报"版本未识别"，按上一节口径人工确认。

动手前先报一行：`版本=… · 环境=install|frontend|direct · ServerUrl=… · HospitalId=…`。

## 快速参考

| 动作 | 正确做法 | 不要做 |
|---|---|---|
| 加载本地前端 | 先确认 dev server 返回 200，再冷启动带 `--url=<dev URL>`（各版本都这样） | 改 `config.db` 地址、改 hosts |
| 退出客户端 | 任取非 `about:*` 页面执行 `initObj.exitApplication()` | `taskkill`（非管理员常被拒） |
| 退出验收 | 进程消失 + 9222 不再 Listen + 新 PID 不同，三条同时成立 | 只看命令返回成功 |
| 列窗口 | `http://127.0.0.1:9222/json/list` | `localhost:9222`（`[::1]` 上另一个 Chrome，只见 `about:blank`） |
| 抓请求体 | `Network.enable`（设 `maxPostDataSize`）→ `Network.getRequestPostData` | 只读 `requestWillBeSent.postData`（常为空） |
| 开新页面 | 对已有窗口 `Page.navigate`（先存 `Page.getNavigationHistory`），**目标选当前域的非登录路由** | `PUT /json/new`、`Target.createTarget`（CEF 返回 `Not supported`）；导航到 `/login`（应用当作注销，整壳退出） |
| 热启动传参（**仅 ≥3.1.0**） | 新进程转发参数给已运行实例后退出 | 以为热启动会重载页面 URL；在 <3.1.0 上指望它复用实例 |

具体 CDP frame、PowerShell 连接方式、导航还原步骤：按需读 `cdp-recipes.md`。

## 无 DevTools 时先看日志通道

宿主内嵌页面开不了 DevTools 时，先走项目的日志采集服务：页面侧 `console` 与 `window.onerror` 上报到本机端口，带实时看板回放，比硬上 CDP 省事。

- 地址、端口、开关、看板 URL **以项目 `AGENTS.md` 为准**（例：`frontend/log-service`，`npm start` 后看板 `http://127.0.0.1:9321/`，采集默认关闭、需 `?logCollect=1` 或宿主注入 `window.__LOG_COLLECT__`）。
- 日志出不来时按这个顺序查：**采集开关是否开 → 服务是否在监听 → 上报地址是否解析到本机**。别一上来就怀疑注入脚本没生效。
- 它只覆盖 `console` 与前端异常；报文级问题（请求体、响应头）仍要走 CDP。

## 常见错误

| 错误 | 现实 |
|---|---|
| 改 `config.db` 地址或改 hosts 指向本地 | 壳支持 `--url`；改配置常被退出回写覆盖，hosts 改动不可逆 |
| 照 CefSharp/Chrome 手册清 Cache、User Data | ≥3.0.0 是**原生 CEF**，CefSharp 手册不适用；这类手册只对 <3.0.0 的 C# 壳有点关系，而那代未实测——先看版本。"前端不生效"九成是 URL 没生效或处于安装态 |
| `Stop-Process` 后立刻冷启动（≥3.1.0） | 单实例：残留实例吃掉新参数，新进程立即退出，改动等于没生效。<3.1.0 没有参数转发，但残留实例仍会占 9222，照样先确认进程已消失 |
| 看到 `ServerUrl` 有值就认为装过了 | 判定只看 `IsFirstRun`；`ServerUrl` 可能是装到一半的残留 |
| 手改 `IsFirstRun=false` 图省事 | 会留下缺 `ClientType`/`HospitalId`/`HospitalUserName` 的半装状态 |
| 连点两次 exe 想"确保启动"（≥3.1.0） | 第二次是热启动转发，会覆盖/丢弃第一次的冷启动参数。更早版本会起第二个进程，两个实例争 9222 |
| 没有可用页面就不敢退出 | 先 `Page.getNavigationHistory` 记原 URL，导航到**非登录路由**再调壳 API；不要改用杀进程，也别拿登录页当载体 |
| 从已登录页导航到 `/login` 想"回到登录页" | 应用把这次导航当注销：壳打印 `CloseAllWindows → All windows closed → Exiting application`，**整个客户端退出**（实测 17:02:55）。要回登录页就退出后冷启动 |
| 用 `initObj.closeForm(名字)` 关某个子窗 | 会连主窗一起关（`CloseAllWindows`）→ 客户端退出。关**当前**窗体用 `closeCurrentForm`（SDK 的 `closeForm()` 就是它） |
| 想用 `openNewBall` 再开一个球做实验 | 悬浮球**全客户端唯一**：宿主日志 `openNewBall: 悬浮球已存在，先关闭旧球再按新参数重建`——真球会被替换掉。要验证球状态就改现成的球 |
| 把 `Draggable` 当窗体属性排查 | 它是**持久化全局设置**（落 `config.db` 的 `WebSetting.Draggable`），最后写入者生效、与窗体无关；手工改过要恢复，否则污染这台机器 |
| 为了验证缩放去调 `setZoomLevel` | 本机构建实测：传 `1` 或 `0` 都会**直接退出整个客户端**（3/3 复现），只做 `typeof` 检查，不要执行 |
| 把 `getLocalPrinters()` 当数组 | 实际返回 `{code,datas:[{printName}],message,success}` 的 JSON 字符串，名字在 `datas[].printName` |

## 红线 —— 停下，换正确入口

- 演示/联调窗口内改 hosts、重写 `config.db`、删除 User Data
- 用 `localhost` 访问调试端口
- 没核对新 PID 与端口监听，就宣布"已经重启"
- 没记录原 URL 就导航已有窗口；把 `/login` 当"中立页"导航（会退整个客户端）
- 用 `closeForm(名字)` 关子窗（连主窗一起关）、用 `openNewBall` 造第二个球（替换掉真球）
- 用杀进程代替壳 API 退出，然后直接冷启动（≥3.1.0 时参数会被残留实例吃掉）
- 在非基层安装形态的机器上跑装机向导（会写死 `ClientType`）

## 项目参数

包路径、exe 名、端口、本地前端目录等**随构建变化的值只写在根 `AGENTS.md` 的《本地客户端联调与测试流程》**；两处不一致时以 `AGENTS.md` 为准。
