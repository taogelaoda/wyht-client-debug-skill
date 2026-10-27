# wyht-client-debug

皖医互通 CEF 医生客户端调试技能。独立仓库维护，供各项目按技能目录挂载。

## 它解决什么

在真实客户端里验证前端改动、抓接口报文、重启加载本地代码，以及绕过客户端最常见的几个坑：9222 打到一个假的 Chrome、`PUT /json/new` 在 CEF 上不被支持、热启动改不动页面 URL、安装态下 `--url` 直接被宿主忽略。

## 前置

**Node ≥ 24**（CLI 用内建 `fetch` / `WebSocket` / `node:sqlite`，零 npm 依赖）。不再需要 python——环境自检已并入 `wyht-skill check`。

## 适用版本

| 版本 | 说明 |
|---|---|
| ≥ 3.1.0 | 完整适用。技能里的实测结论（含冷/热启动、单实例参数转发）都基于 3.1.1 |
| 3.0.x | 适用，但**没有热启动**——每次启动都是全新实例 |
| < 3.0.0 | 分水岭之外：那代是 **C# 壳**而不是 C++ 原生 CEF，技能里的实测结论未在该代验证，套用前先确认版本 |

`wyht-skill check` 会从包目录名解析版本并打印壳形态与启动语义，不用自己比对。

## 内容

| 文件 | 说明 |
|---|---|
| `SKILL.md` | 技能入口：一次性 init、标准动作表、环境判定、快速参考、日志通道、常见错误、红线 |
| `cdp-recipes.md` | 按需加载的 CDP 配方：抓 POST 报文、临时导航并还原、退出客户端、PowerShell 发 CDP |
| `bin/wyht-skill.mjs` | 唯一入口：参数解析、旧命令报错映射、命令分派 |
| `bin/lib/*.mjs` | 实现：`config`（两层配置）、`commands`（install / clients / init / check / doctor / start / stop）、`probe`（进程/端口/页面）、`cdp`、`shellconfig`（直读 `config.db`）、`derive`（版本与 exe 推导）、`actions` |
| `bin/wyht-skill.cmd` | 仓库内的调用包装（纯 ASCII，`node bin/wyht-skill.mjs %*`） |
| `bootstrap/` | 首次使用的一对引导文件：Node 版本闸门 → 克隆仓库 → 写 `%LOCALAPPDATA%\wyht\bin\wyht-skill.cmd` → 追加 User PATH → 转交 CLI |
| `test/` | `node test/run.mjs` |

## 一键下载（外网，无需预先克隆）

国内网络优先这条（Gitee 镜像，实测可达）：

```powershell
irm https://gitee.com/zhu-gangtao/wyht-client-debug-skill/raw/main/get.ps1 | iex
```

它做的事：Node 版本闸门（< 24 直接报错退出）→ 克隆仓库到 `%LOCALAPPDATA%\wyht\skills\wyht-client-debug` → 写 `%LOCALAPPDATA%\wyht\bin\wyht-skill.cmd` → 把该目录追加进 User PATH → 转交 `wyht-skill install`。新开的终端才认得 `wyht-skill`。

带参时分两步（`iex` 传不了参数）：

```powershell
irm https://gitee.com/zhu-gangtao/wyht-client-debug-skill/raw/main/bootstrap/wyht-skill.ps1 -OutFile $env:TEMP\wyht.ps1
& $env:TEMP\wyht.ps1 install
```

GitHub 作为备选（网络允许时可用）：

```powershell
irm https://raw.githubusercontent.com/taogelaoda/wyht-client-debug-skill/main/get.ps1 | iex
```

克隆源按 **Gitee → GitHub** 顺序自动尝试：Gitee 拉不动就换 GitHub，`-RepoUrl` 可只指定一个源（内网用户指内网 GitLab）。

两个入口的分工：`get.ps1` 是 `irm|iex` 专用（纯 ASCII、无 BOM，因为管道执行时 BOM 会粘到第一个 token 上导致解析失败），它把带 BOM 的 bootstrap 落到 `%TEMP%` 再执行；带参数时用 `-OutFile` 两步写法。

> 实测注意：GitHub raw 有 CDN 缓存，刚 push 完可能仍在发上一版（实测 10 分钟未刷新，加 `?x=1` 也不生效）；Gitee raw 会 302 到 `raw.giteeusercontent.com`，`irm` 会自动跟随。改 `get.ps1` 本身后要等缓存过期才对外生效。

## 用法

装好之后，在项目根依次跑这四步（前两步各一次，后两步常用）：

```powershell
wyht-skill install                                                       # 机器级：刷新仓库 + 写命令入口（幂等，重跑即升级）
wyht-skill clients add "D:\WYHT--3.1.1--x64--20261021_102251--医保凭证"  # 机器级：登记客户端包
wyht-skill init                                                          # 项目级：交互问 webUrl / hisUserId，写配置 + 建联接
wyht-skill check                                                         # 壳侧自检：0 直连 / 2 安装态 / 3 前置机 / 4 读取失败
```

日常动作：

```powershell
wyht-skill doctor                # 进程 / 端口 / 本地前端 / 仓库落后 / Node 版本
wyht-skill start                 # 冷启动并确认加载本地前端（默认带 ?logCollect=1）
wyht-skill stop                  # 壳 API 退出，并验收进程消失 + 9222 释放
wyht-skill clients list          # 已登记的包；clients rm <名> 只删登记不动目录
```

参数：`install` 支持 `--repo-url` `--ref`；`init` 支持 `--use <名>` `--force`；`clients add` 支持 `--name` `--exe`；`start`/`stop`/`check`/`doctor` 支持 `--client <名>`，`start`/`stop` 另有 `--no-log` `--timeout <秒>`。旧命令（`status`、`install -Project/-ClientDir`）不再静默兼容，会直接报错并给出对应新命令。

两层配置由 CLI 读写，不要手编：

- `<项目根>\.wyht-skill.json`（`init` 自动加进 `.gitignore`）：`{"version":1,"client":"<名字>","webUrl":"…","hisUserId":""}`
- `%LOCALAPPDATA%\wyht\clients.json`：`{"version":1,"clients":{"<名字>":{"dir":"…","exe":"…"}}}`

### 网络可达性（本机实测）

| 目标 | 结果 |
|---|---|
| `gitee.com` / `raw.giteeusercontent.com` | ✅ 200，约 0.3–5 s |
| `objects.githubusercontent.com`（zip 下载用） | ✅ 可达 |
| `raw.githubusercontent.com` | ⚠️ 时通时不通（同一网络内半小时内两种结果都出现过） |
| `github.com:443`（git push 用） | ⚠️ 同上，时通时不通 |
| `cdn.jsdelivr.net` | ❌ 连不上 |

结论：**国内网络用 Gitee 那条，GitHub 只作备选。** 三个远端都已配好：

```bash
git push             # origin 双推：内网 GitLab + GitHub
git push gitee main  # Gitee 镜像（SSH，密钥已在 Gitee 登记）
```

### 内网用户

默认源是 Gitee/GitHub 公共仓；内网想走内网 GitLab，加一个引导器参数即可（地址只出现在这里，不是脚本默认值）：

```powershell
& $env:TEMP\wyht.ps1 install -RepoUrl 'http://192.168.1.66:9999/zhugangtao/wyht-client-debug-skill.git'
```

### 落地位置

| 东西 | 位置 |
|---|---|
| 技能仓库 | `%LOCALAPPDATA%\wyht\skills\wyht-client-debug`（`wyht-skill install` 即 `git pull` 升级） |
| 命令入口 | `%LOCALAPPDATA%\wyht\bin\wyht-skill.cmd`（纯 ASCII，只转发到仓库里的 `bin/wyht-skill.mjs`，不复制副本） |
| 客户端登记 | `%LOCALAPPDATA%\wyht\clients.json`（机器级，`clients add/rm` 维护） |
| 项目配置 | `<项目根>\.wyht-skill.json` + `.claude\skills\wyht-client-debug` 目录联接（junction），不复制文件 |
| 最近一次启动 | `%LOCALAPPDATA%\wyht\state.json`（`start` 写的 PID 与 webUrl，排障用） |
| PATH | 只改 User 级、只追加；引导器 `-NoPathUpdate` 可跳过 |

### 行为边界（都实测过）

| 场景 | 行为 |
|---|---|
| `install` 在标准布局 | 入口 shim 用 `%~dp0` 相对路径，用户名是中文也不受影响；非标准布局时 shim 路径含非 ASCII 会**明确报错**（把仓库挪到纯 ASCII 路径） |
| `install` 时仓库有未提交改动 / 内网不通 | `pull --ff-only` 失败只警告，安装照常完成 |
| `install` 时仓库不是 git 仓库 | 打印"未刷新（不是 git 仓库）" |
| 机器没装 git | 引导器用 GitHub 的 zip 快照解一份工作区（只支持 GitHub 源，后续升级需装 git） |
| `clients add` 找不到 `czht.exe` / `iu.Hrball.exe` | 报错并要求 `--exe` 指定实际主程序 |
| `init` 时 `.claude\skills\wyht-client-debug` 不存在 | 建联接，打印版本、提交号与下一步 |
| `init` 时已指向同一仓库 | 幂等重建联接，不重复拷文件 |
| `init` 时原位置是实体目录（手工副本） | **拒绝**；`--force` 才替换，且先备份成 `*.bak-<时间戳>` |
| 机器上没登记任何包 | `init` 拒绝并提示先 `clients add` |
| 已登记多个包 | `init` 交互选序号或名字；`--use <名>` 直接指定 |

退出码：`check` 用 `0/2/3/4` 表示判定，其余命令成功 `0`、任何拒绝或异常非 `0`。

### 编码约束（踩过才写的）

- 所有 `.ps1`（`get.ps1`、`bootstrap/wyht-skill.ps1`）必须带 **UTF-8 BOM**：PowerShell 5.1 会把无 BOM 脚本按本地 ANSI 解码，中文注释直接导致语法错误。例外是 `get.ps1`——它是 `irm|iex` 专用，必须**纯 ASCII 且无 BOM**。
- 所有 `.cmd` 必须**纯 ASCII**：cmd.exe 按 OEM 代码页解码，UTF-8 中文注释会变成乱码甚至被当成命令执行。
- 原生 `git` 的 stderr 不能并进错误流（`2>&1`），否则 `ErrorActionPreference=Stop` 下会被当成终止错误。
- CLI 本体是 Node（`bin/*.mjs`），这几条只约束仍存在的 PowerShell 引导文件。

### 其它

- 只支持 Windows：junction 是 Windows 概念。
- **不要**把联接的内容复制进项目，否则又变成两份、升级也不再影响项目里那份。

## 与项目的契约

本仓库**不含**任何随构建变化的值（客户端安装路径、exe 名、本地前端地址）。它们只落在使用方项目根 `.wyht-skill.json` 与机器级 `%LOCALAPPDATA%\wyht\clients.json`，由 CLI 读取；`SKILL.md` 只描述流程与判定，不写具体路径。

新增判定逻辑请只加 CLI 子命令或选项，不要把项目路径写死回技能。

## 版本

见 [CHANGELOG.md](CHANGELOG.md)。`SKILL.md` frontmatter 的 `version` 是唯一版本号来源，改动行为时同步递增。
