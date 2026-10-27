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
| `install.ps1` | 一键安装到项目：克隆（按需）+ 建目录联接，幂等、拒绝破坏实体目录 |

## 安装到项目

技能仓库与使用它的项目解耦：项目里只放一个目录联接（junction），不复制文件。`install.ps1` 就是把这件事做成一条命令（Windows，不需要管理员）。

```powershell
# 仓库已克隆：直接从仓库里跑（-Project 不写则是当前目录）
D:\Document\wyht-client-debug-skill\install.ps1 -Project "<项目根目录>"

# 从零开始：本机还没有克隆时，指定目标路径让它自己 clone
.\install.ps1 -Project "<项目根目录>" -RepoDir D:\Document\wyht-client-debug-skill
```

脚本幂等，按目标现状分流：

| 目标现状 | 行为 |
|---|---|
| 不存在 | 建联接，打印技能版本与下一步命令 |
| 已是指向本仓库的联接 | 报告后跳过（退出码 0），可当"检查是否装好"用 |
| 指向别处的联接 / 实体目录 | **拒绝**并说明原因；确认要替换加 `-Force`（实体目录会先备份成 `*.bak-<时间戳>`） |
| `-RepoDir` 不存在 | `git clone` 后继续装（约 2 秒） |

- 判定失败（拒绝替换）退出码为 1，可直接用在脚本里。
- `git pull` 后技能立即生效，无需重建联接；换机器或换克隆路径时重跑一次即可。
- **`install.ps1` 必须带 UTF-8 BOM 保存**：PowerShell 5.1 会把无 BOM 的脚本按本地 ANSI 解码，中文注释会直接导致语法错误。
- 非 Windows（或不想用脚本）时手工等价操作：
  ```bash
  git clone http://192.168.1.66:9999/zhugangtao/wyht-client-debug-skill.git <克隆目录>
  cmd /c mklink /J "<项目>\.claude\skills\wyht-client-debug" "<克隆目录>"   # Linux/macOS: ln -s
  ```
- **不要**把联接的内容复制进项目，否则又变成两份、`git pull` 也不再影响项目里那份。

## 与项目的契约

本仓库**不含**任何随构建变化的值（客户端安装路径、exe 名、调试端口、本地前端目录）。这些只写在**使用方项目根 `AGENTS.md`** 的《本地客户端联调与测试流程》里；两处冲突时以项目 `AGENTS.md` 为准。

新增判定逻辑请只增脚本参数，不要把项目路径写死回技能。

## 版本

见 [CHANGELOG.md](CHANGELOG.md)。`SKILL.md` frontmatter 的 `version` 是唯一版本号来源，改动行为时同步递增。
