# 变更记录

## 2.6.2

- README 增「网络可达性」：本机实测 Gitee 可用、`objects.githubusercontent.com` 可用、`raw.githubusercontent.com` 与 `github.com:443` 时通时不通、jsDelivr 不可达
- 给出 Gitee 镜像的两步建立方法与对应一键命令（国内网络优先用 Gitee）

## 2.6.1

- 新增 `get.ps1` 作为 `irm|iex` 专用入口：纯 ASCII、无 BOM。实测带 BOM 的脚本被管道执行时，BOM 会粘到第一个 token 上，报 `意外的属性 CmdletBinding`
- `get.ps1` 下载 bootstrap 后先去掉行首 BOM 再落盘：下载内容自带 BOM，用带 BOM 的编码写会变成**双 BOM**，同样解析失败
- README 说明两个入口的分工，并记 GitHub raw 缓存导致新 push 不立刻生效（实测 10 分钟未刷新）

## 2.6.0

- 默认源改为 GitHub 公共仓 `taogelaoda/wyht-client-debug-skill`；新增 `-RepoUrl` 让内网用户指回内网 GitLab（内网地址从脚本默认值里移除，只留在文档示例）
- 支持 `irm <raw> | iex` 一键下载：bootstrap 可在无 `$PSScriptRoot` 的管道执行下工作
- 机器没装 git 时改用 GitHub zip 快照解一份工作区
- 命令入口 `.cmd` 改为转发到仓库脚本，不再把 `.ps1` 复制进 `%LOCALAPPDATA%\wyht\bin`
- README 重写为「一键下载 / 内网用户 / 落地位置 / 行为边界 / 编码约束」五节

## 2.5.0

- 新增 `wyht-skill` 命令：`install`（克隆/刷新仓库 → 建或改指联接 → 可选跑 `check_env.py`）与 `status`（版本、dirty、落后远端几个提交、当前项目指向哪）
- 仓库位置固定到 `%LOCALAPPDATA%\wyht\skills\wyht-client-debug`；同源旧联接自动改指，异源或实体目录仍需 `-Force`
- 新增 `bootstrap/` 引导器：发给同事一次，负责首次克隆与追加 User PATH，之后转交仓库内脚本，逻辑更新靠 `git pull`
- **删除 `install.ps1`**，单一入口收敛到 `wyht-skill`
- 修 README 的自相矛盾：此前"从零开始 `-RepoDir` 自动克隆"实际不可达（脚本得先存在），且私有库 raw 匿名不可读，`irm|iex` 不成立
- 记三个实测坑：`.ps1` 必须带 UTF-8 BOM（否则中文注释致死语法错误）；`.cmd` 必须纯 ASCII（cmd.exe 按 OEM 解码，UTF-8 注释会被当命令执行）；原生 `git` 的 stderr 用 `2>&1` 会被当作终止错误
- bootstrap 参数改为按名转发（splat 字符串数组会把 `-Project` 当位置参数丢掉）

## 2.4.0

- 新增 `install.ps1`：一条命令把技能装进项目（按需 `git clone` + 建目录联接），幂等；已是指向本仓库的联接时直接报告跳过，指向别处或占着实体目录时拒绝，需 `-Force`（实体目录先备份成 `*.bak-<时间戳>`）
- 脚本必须带 UTF-8 BOM：PowerShell 5.1 对无 BOM 脚本按本地 ANSI 解码，中文注释会引发语法错误（实测）
- README 安装一节改为脚本优先，保留 `mklink` / `ln -s` 手工兜底

## 2.3.0

- 修正导航建议：`Page.navigate` 到 `/login` 会被应用当作注销，壳走 `CloseAllWindows` **整壳退出**（实测）；"先导航到正常页再退出"这条限定为**非登录路由**
- 新增三条宿主 API 陷阱：悬浮球全客户端唯一（`openNewBall` 会先关旧球再重建，替换掉真球）；`initObj.closeForm(名字)` 连主窗一起关（关当前窗体用 `closeCurrentForm`）；`Draggable` 是持久化全局设置（`WebSetting.Draggable`），与窗体无关、改过要恢复
- 新增「无 DevTools 时先看日志通道」：优先用项目的日志采集服务，排查顺序为 采集开关 → 服务监听 → 上报地址；仅覆盖 console 与前端异常，报文仍走 CDP
- description 补日志采集场景，便于在没有 DevTools 的情境下也能触发本技能

## 2.2.0

- 新增「版本背景」：≥3.0.0 为 C++ 原生 CEF 壳、<3.0.0 为 C# 壳；冷/热启动只有 ≥3.1.0 才有，更早版本每次启动都是全新实例
- 按版本给既有条目加限定：单实例参数转发、连点两次 exe、CefSharp 手册三条只在对应版本成立
- `check_env.py` 从包目录名解析版本，多打印一行 `版本:`（壳形态 + 启动语义）；识别不到时提示人工确认，退出码不变
- 明确标注：全部实测结论来自 3.1.1，<3.0.0 的 C# 壳未做基线测试

## 2.1.0

- 新增 `scripts/check_env.py`：只读判定 `install` / `frontend` / `direct`，退出码 `2/3/0`
- 新增环境自检一节：`IsFirstRun` 为 `true` 或键缺失即安装态，`ServerUrl` 有值不代表装完
- CDP 细节拆到 `cdp-recipes.md`，`SKILL.md` 只留判定与红线
- 补红线：本机构建上调 `setZoomLevel` 会直接退出整个客户端

## 2.0.0

- 重写为「先用壳自己的入口，再考虑系统层手段」的主线
- 收录实测坑：`localhost:9222` 落到 `[::1]` 上另一个 Chrome；CEF 不支持 `PUT /json/new` 与 `Target.createTarget`；`Network.getRequestPostData` 才是唯一可靠的取 body 方式
- 退出客户端统一走 `initObj.exitApplication()`，验收看进程 / 端口 / PID 三条

## 1.0.0

- 首版：冷热启动、调试端口、抓包与退出流程
