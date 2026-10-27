# wyht-client-debug

皖医互通 CEF 医生客户端调试技能。独立仓库维护，供各项目按技能目录挂载。

## 它解决什么

在真实客户端里验证前端改动、抓接口报文、重启加载本地代码，以及绕过客户端最常见的几个坑：`localhost:9222` 打到一个假的 Chrome、`PUT /json/new` 在 CEF 上不被支持、热启动改不动页面 URL、安装态下 `--url` 直接被宿主忽略。

## 适用版本

| 版本 | 说明 |
|---|---|
| ≥ 3.1.0 | 完整适用。技能里的实测结论（含冷/热启动、单实例参数转发）都基于 3.1.1 |
| 3.0.x | 适用，但**没有热启动**——每次启动都是全新实例 |
| < 3.0.0 | 分水岭之外：那代是 **C# 壳**而不是 C++ 原生 CEF，技能里的实测结论未在该代验证，套用前先确认版本 |

`check_env.py` 会从包目录名解析版本并打印壳形态与启动语义，不用自己比对。

## 内容

| 文件 | 说明 |
|---|---|
| `SKILL.md` | 技能入口：触发条件、环境自检、快速参考、无 DevTools 时的日志通道、常见错误、红线 |
| `cdp-recipes.md` | 按需加载的 CDP 配方：抓 POST 报文、临时导航并还原、退出客户端、PowerShell 发 CDP |
| `scripts/check_env.py` | 只读环境自检，退出码 `0=直连 2=安装态 3=前置机 4=读取失败` |
| `bin/wyht-skill.ps1` | 命令本体：`install` / `status` |
| `bin/wyht-skill.cmd` | 命令入口（cmd 包装，绕过执行策略） |
| `bootstrap/` | 首次使用的一对引导文件（也可直接 `irm … | iex` 执行），之后 `wyht-skill` 命令指向仓库脚本 |

## 一键下载（外网，无需预先克隆）

```powershell
# 零参：装到当前目录。会克隆仓库到 %LOCALAPPDATA%\wyht\skills\wyht-client-debug、
# 放好 wyht-skill 命令入口、把入口目录加进 User PATH
irm https://raw.githubusercontent.com/taogelaoda/wyht-client-debug-skill/main/bootstrap/wyht-skill.ps1 | iex

# 带参：先落盘再执行（iex 传不了参数，所以拆两步）
irm https://raw.githubusercontent.com/taogelaoda/wyht-client-debug-skill/main/bootstrap/wyht-skill.ps1 -OutFile $env:TEMP\wyht.ps1
& $env:TEMP\wyht.ps1 install -Project "<项目根>" -ClientDir "<客户端目录>"
```

装完之后在任何目录都是这条：

```powershell
wyht-skill install              # 装到当前项目（幂等，重跑即升级）
wyht-skill status               # 版本 / 是否 dirty / 落后远端几个提交 / 当前项目指向哪
```

`install` 参数：`-Project`（默认当前目录）、`-ClientDir`（传了就执行 `check_env.py` 并打印摘要）、`-Ref`（默认 `main`，可切 tag/分支）、`-Force`、`-RepoUrl`（换源）。

### 内网用户

默认源是 GitHub 公共仓；内网想走内网 GitLab，加一个参数即可（地址只出现在这里，不再是脚本默认值）：

```powershell
& $env:TEMP\wyht.ps1 install -RepoUrl 'http://192.168.1.66:9999/zhugangtao/wyht-client-debug-skill.git'
```

### 落地位置

| 东西 | 位置 |
|---|---|
| 技能仓库 | `%LOCALAPPDATA%\wyht\skills\wyht-client-debug`（`git pull` 即可升级） |
| 命令入口 | `%LOCALAPPDATA%\wyht\bin\wyht-skill.cmd`（只转发到仓库里的脚本，不复制副本） |
| PATH | 只改 User 级、只追加；`-NoPathUpdate` 可跳过 |
| 项目里 | 只有 `.claude\skills\wyht-client-debug` 一个目录联接（junction），不复制文件 |

### 行为边界（都实测过）

| 场景 | 行为 |
|---|---|
| 目标不存在 | 建联接；打印版本、提交号、升级结果 |
| 已指向同一个仓库 | 保持原联接不动（幂等） |
| 指向**同源**旧联接 | 自动改指到 `%LOCALAPPDATA%`，打印迁移行 |
| 指向**异源**联接 / 占着实体目录 | **拒绝**；加 `-Force` 才动，实体目录先备份成 `*.bak-<时间戳>` |
| 仓库有未提交改动 | 警告后继续；`pull --ff-only` 失败只标记"升级跳过"，安装照常完成 |
| 内网不通 | 升级跳过，安装照常完成 |
| 机器没装 git | 用 GitHub 的 zip 快照解一份工作区（只支持 GitHub 源，且后续升级需装 git） |

退出码：成功 0，任何拒绝或异常 1。

### 编码约束（踩过才写的）

- 所有 `.ps1` 必须带 **UTF-8 BOM**：PowerShell 5.1 会把无 BOM 脚本按本地 ANSI 解码，中文注释直接导致语法错误。
- 所有 `.cmd` 必须**纯 ASCII**：cmd.exe 按 OEM 代码页解码，UTF-8 中文注释会变成乱码甚至被当成命令执行。
- 原生 `git` 的 stderr 不能并进错误流（`2>&1`），否则 `ErrorActionPreference=Stop` 下会被当成终止错误。

### 其它

- 只支持 Windows：junction 是 Windows 概念。
- **不要**把联接的内容复制进项目，否则又变成两份、升级也不再影响项目里那份。

## 与项目的契约

本仓库**不含**任何随构建变化的值（客户端安装路径、exe 名、调试端口、本地前端目录）。这些只写在**使用方项目根 `AGENTS.md`** 的《本地客户端联调与测试流程》里；两处冲突时以项目 `AGENTS.md` 为准。

新增判定逻辑请只增脚本参数，不要把项目路径写死回技能。

## 版本

见 [CHANGELOG.md](CHANGELOG.md)。`SKILL.md` frontmatter 的 `version` 是唯一版本号来源，改动行为时同步递增。
