# wyht-client-debug

皖医互通 CEF 医生客户端调试技能。独立仓库维护，供各项目按技能目录挂载。

## 它解决什么

在真实客户端里验证前端改动、抓接口报文、重启加载本地代码，以及绕过客户端最常见的几个坑：`localhost:9222` 打到一个假的 Chrome、`PUT /json/new` 在 CEF 上不被支持、热启动改不动页面 URL、安装态下 `--url` 直接被宿主忽略。

## 内容

| 文件 | 说明 |
|---|---|
| `SKILL.md` | 技能入口：触发条件、环境自检、快速参考、常见错误、红线 |
| `cdp-recipes.md` | 按需加载的 CDP 配方：抓 POST 报文、临时导航并还原、退出客户端、PowerShell 发 CDP |
| `scripts/check_env.py` | 只读环境自检，退出码 `0=直连 2=安装态 3=前置机 4=读取失败` |

## 安装到项目

技能仓库与使用它的项目解耦：项目里只放一个目录联接（junction），不复制文件。

```powershell
# 1. 克隆本仓库（任意位置，建议与项目同级）
git clone http://192.168.1.66:9999/zhugangtao/wyht-client-debug-skill.git D:\Document\wyht-client-debug-skill

# 2. 在项目里建联接（项目未跟踪 .claude/ 时不需要改 .gitignore）
cmd /c mklink /J "<项目>\.claude\skills\wyht-client-debug" "D:\Document\wyht-client-debug-skill"
```

- 已存在实体目录时先删掉它，再建联接；**不要**反过来把联接的内容复制进项目，否则又变成两份。
- `git pull` 后技能立即生效，无需重建联接。
- 换机器或换克隆路径时，删掉旧联接重建一次即可。

## 与项目的契约

本仓库**不含**任何随构建变化的值（客户端安装路径、exe 名、调试端口、本地前端目录）。这些只写在**使用方项目根 `AGENTS.md`** 的《本地客户端联调与测试流程》里；两处冲突时以项目 `AGENTS.md` 为准。

新增判定逻辑请只增脚本参数，不要把项目路径写死回技能。

## 版本

见 [CHANGELOG.md](CHANGELOG.md)。`SKILL.md` frontmatter 的 `version` 是唯一版本号来源，改动行为时同步递增。
