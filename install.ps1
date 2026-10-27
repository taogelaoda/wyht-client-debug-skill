<#
.SYNOPSIS
    把 wyht-client-debug 技能安装到指定项目：在项目的 .claude\skills\ 下建目录联接。

.DESCRIPTION
    技能仓库与使用它的项目解耦：项目里只放一个目录联接（junction），不复制文件。
    本脚本幂等，可反复执行：
      - 目标不存在            → 建立联接
      - 目标已是指向本仓库的联接 → 报告后跳过
      - 目标指向别处的联接      → 需 -Force 才改指
      - 目标是实体目录          → 需 -Force 才移到 <目录>.bak-<时间戳> 后重建
    仓库若还不在 -RepoDir，且显式传了 -RepoDir，则先 git clone。

.PARAMETER Project
    项目根目录（其下应有或将创建 .claude\skills）。默认当前目录。

.PARAMETER RepoDir
    技能仓库本地路径。默认本脚本所在目录（即仓库根）。显式指定但不存在时按 -RepoUrl 克隆。

.PARAMETER RepoUrl
    -RepoDir 不存在时用于克隆的仓库地址。

.PARAMETER Force
    目标已存在且不是指向本仓库的联接时，覆盖它（实体目录会先备份）。

.EXAMPLE
    # 在项目根执行：把当前仓库装进当前项目
    D:\Document\wyht-client-debug-skill\install.ps1

.EXAMPLE
    # 一条命令：先克隆到 D:\Document\wyht-client-debug-skill，再装进指定项目
    .\install.ps1 -Project 'D:\Document\outprovince-doctor-client-省外标准版' -RepoDir 'D:\Document\wyht-client-debug-skill'
#>
[CmdletBinding()]
param(
    [string]$Project = (Get-Location).Path,
    [string]$RepoDir,
    [string]$RepoUrl = 'http://192.168.1.66:9999/zhugangtao/wyht-client-debug-skill.git',
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$SkillName = 'wyht-client-debug'

# 仓库根默认取脚本所在目录。必须写在脚本体里：-File 方式启动时，param 默认值阶段 $PSScriptRoot 还是空的。
if (-not $RepoDir) { $RepoDir = $PSScriptRoot }
if (-not $RepoDir) { throw '取不到技能仓库路径：请显式传 -RepoDir <技能仓库目录>' }

# 判定路径是否为链接（junction / symlink），不是链接就是实体目录
function Test-Link([string]$Path) {
    $item = Get-Item -LiteralPath $Path -Force
    return [bool]($item.Attributes -band [IO.FileAttributes]::ReparsePoint)
}

# 只删链接本身，不碰目标内容（Remove-Item -Recurse 对 junction 会伤及目标）
function Remove-Link([string]$Path) {
    [void][IO.Directory]::Delete($Path, $false)
}

# 读取技能版本号，用于安装后回报（frontmatter 的 version 是唯一来源）
function Get-SkillVersion([string]$RepoRoot) {
    $skill = Join-Path $RepoRoot 'SKILL.md'
    if (-not (Test-Path -LiteralPath $skill)) { return '<未知>' }
    $match = Select-String -LiteralPath $skill -Pattern '^version:\s*"([^"]+)"' | Select-Object -First 1
    if ($match) { return $match.Matches[0].Groups[1].Value }
    return '<未标注>'
}

$Project = (Resolve-Path -LiteralPath $Project).Path
$skillsDir = Join-Path $Project '.claude\skills'
$target = Join-Path $skillsDir $SkillName

if (-not (Test-Path -LiteralPath (Join-Path $RepoDir 'SKILL.md'))) {
    if (-not (Test-Path -LiteralPath $RepoDir)) {
        if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
            throw "仓库不存在且未安装 git：请先手工克隆 $RepoUrl 到 $RepoDir"
        }
        Write-Host "克隆 $RepoUrl → $RepoDir"
        & git clone --quiet $RepoUrl $RepoDir
        if ($LASTEXITCODE -ne 0) { throw "git clone 失败（退出码 $LASTEXITCODE）" }
    } else {
        throw "$RepoDir 里没有 SKILL.md，不像技能仓库根目录"
    }
}
$RepoDir = (Resolve-Path -LiteralPath $RepoDir).Path

if (Test-Path -LiteralPath $target) {
    if (Test-Link $target) {
        $existing = (Get-Item -LiteralPath $target -Force).Target
        if ($existing -and (Resolve-Path -LiteralPath $existing).Path -eq $RepoDir) {
            Write-Host "已安装：$target → $RepoDir（v$(Get-SkillVersion $RepoDir)），无需改动"
            exit 0
        }
        if (-not $Force) {
            throw "目标已存在且指向 $existing；确认要改指就加 -Force"
        }
        Write-Host "改指旧联接：$existing → $RepoDir"
        Remove-Link $target
    } else {
        if (-not $Force) {
            throw "目标是实体目录（可能是手工复制的副本）：$target；确认要替换就加 -Force（会先备份）"
        }
        $backup = "$target.bak-$(Get-Date -Format 'yyyyMMddHHmmss')"
        Write-Host "实体目录已备份：$backup"
        Move-Item -LiteralPath $target -Destination $backup
    }
}

if (-not (Test-Path -LiteralPath $skillsDir)) {
    New-Item -ItemType Directory -Path $skillsDir -Force | Out-Null
}

New-Item -ItemType Junction -Path $target -Target $RepoDir | Out-Null
if (-not (Test-Path -LiteralPath (Join-Path $target 'SKILL.md'))) {
    throw "联接已建但读不到 SKILL.md：$target"
}

Write-Host "已安装：$target → $RepoDir（v$(Get-SkillVersion $RepoDir)）"
Write-Host "下一步：python `"$target\scripts\check_env.py`" --dir `"<客户端目录>`""
