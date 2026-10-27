<#
.SYNOPSIS
    wyht 技能安装器：install 把技能装进项目，status 报告本机与当前项目的状态。

.DESCRIPTION
    技能仓库固定落在 %LOCALAPPDATA%\wyht\skills\<技能名>，项目里只放一个目录联接（junction），
    不复制文件。两条子命令都幂等，失败一律退出码 1。

      install  确保仓库存在并刷新 → 建/改指联接 → 可选跑环境自检
      status   版本、引用、是否 dirty、落后/领先远端几个提交、当前项目联接指向哪

.PARAMETER Command
    子命令：install（默认）或 status。

.PARAMETER Project
    要安装的项目根目录，默认当前目录。

.PARAMETER ClientDir
    客户端安装目录（其下有 config.db）。传了就在安装后执行 check_env.py 并打印环境摘要。

.PARAMETER Ref
    install 时切到的分支或 tag，默认 main。

.PARAMETER RepoUrl
    仓库地址，默认 Gitee 公共仓（国内可达）；内网用户改成内网 GitLab 地址，GitHub 用户改成 GitHub 地址。

.PARAMETER Force
    目标已是指向别处的联接、或占了实体目录时必须显式传，实体目录会先备份成 *.bak-<时间戳>。

.EXAMPLE
    wyht-skill install
    wyht-skill install -Project 'D:\Document\outprovince-doctor-client-省外标准版' -ClientDir 'D:\WYHT--3.1.1--x64--20261021_102251--医保凭证'
    wyht-skill status
#>
[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$Command = 'install',
    [string]$Project = (Get-Location).Path,
    [string]$ClientDir,
    [string]$Ref = 'main',
    [switch]$Force,
    [string]$RepoUrl = 'https://gitee.com/zhu-gangtao/wyht-client-debug-skill.git'
)

$ErrorActionPreference = 'Stop'
$SkillName = 'wyht-client-debug'

# 仓库根由脚本位置推出：<仓库>\bin\wyht-skill.ps1。不能写在 param 默认值里——
# -File 方式启动时，param 默认值阶段 $PSScriptRoot 还是空的。
$RepoDir = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path -LiteralPath (Join-Path $RepoDir 'SKILL.md'))) {
    throw "脚本不在技能仓库的 bin\ 目录下（$RepoDir 里没有 SKILL.md）"
}

# ---- git 小工具 ----

# 执行会写 stderr 的 git 子命令：PowerShell 5.1 在 ErrorActionPreference=Stop 下会把
# 原生程序的 stderr 当成终止错误，这里局部放宽，只靠退出码判断成败。
function Invoke-GitQuiet([string[]]$Arguments) {
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        (& git @Arguments) 2>$null | Out-Null
        return $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $prev
    }
}

# 取仓库 origin 地址并归一（去 .git、去尾斜杠、转小写），用于判定「是不是同一个仓库」
function Get-RemoteKey([string]$Path) {
    if (-not (Test-Path -LiteralPath (Join-Path $Path '.git'))) { return '' }
    $url = & git -C $Path config --get remote.origin.url 2>$null
    if (-not $url) { return '' }
    return ($url -replace '\.git$', '' -replace '/+$', '').ToLowerInvariant()
}

# 判定路径是否为目录联接/符号链接（不是就是实体目录）
function Test-Link([string]$Path) {
    $item = Get-Item -LiteralPath $Path -Force
    return [bool]($item.Attributes -band [IO.FileAttributes]::ReparsePoint)
}

# 只删链接本身：Remove-Item -Recurse 对 junction 会伤及目标内容
function Remove-Link([string]$Path) {
    [void][IO.Directory]::Delete($Path, $false)
}

# 取联接目标；junction 的 .Target 是数组，直接格式化会打成 System.String[]
function Get-LinkTarget([string]$Path) {
    $raw = (Get-Item -LiteralPath $Path -Force).Target
    if ($raw -is [array]) { return [string]$raw[0] }
    return [string]$raw
}

# 读 SKILL.md 的 version，作为唯一版本来源
function Get-SkillVersion([string]$RepoRoot) {
    $skill = Join-Path $RepoRoot 'SKILL.md'
    if (-not (Test-Path -LiteralPath $skill)) { return '<未知>' }
    $hit = Select-String -LiteralPath $skill -Pattern '^version:\s*"([^"]+)"' | Select-Object -First 1
    if ($hit) { return $hit.Matches[0].Groups[1].Value }
    return '<未标注>'
}

# 提交号前 7 位；无提交时返回空
function Get-HeadShort([string]$Path) {
    $sha = & git -C $Path rev-parse --short HEAD 2>$null
    if ($LASTEXITCODE -ne 0) { return '' }
    return $sha
}

# 工作区是否有未提交改动
function Test-Dirty([string]$Path) {
    return [bool](& git -C $Path status --porcelain 2>$null)
}

# 与远端比较：返回 @{ Ref; Ahead; Behind }；拉不到远端时返回 $null
function Get-RemoteDelta([string]$Path) {
    if ((Invoke-GitQuiet @('-C', $Path, 'fetch', '--quiet', 'origin')) -ne 0) { return $null }
    $branch = & git -C $Path rev-parse --abbrev-ref HEAD 2>$null
    if ($branch -eq 'HEAD') { return @{ Ref = '（detached）'; Ahead = $null; Behind = $null } }
    $counts = & git -C $Path rev-list --left-right --count "HEAD...origin/$branch" 2>$null
    if ($LASTEXITCODE -ne 0) { return @{ Ref = $branch; Ahead = $null; Behind = $null } }
    $parts = ($counts -split "`t")
    return @{ Ref = $branch; Ahead = [int]$parts[0]; Behind = [int]$parts[1] }
}

# ---- install ----

# 确保仓库存在并尽量刷新到 -Ref；返回是否升级成功（失败不算安装失败）
function Sync-Repo {
    if (-not (Test-Path -LiteralPath (Join-Path $RepoDir 'SKILL.md'))) {
        Write-Host "克隆 $RepoUrl → $RepoDir"
        New-Item -ItemType Directory -Path (Split-Path -Parent $RepoDir) -Force | Out-Null
        $cloneCode = Invoke-GitQuiet @('clone', '--quiet', $RepoUrl, $RepoDir)
        if ($cloneCode -ne 0) { throw "git clone 失败（退出码 $cloneCode）" }
    }

    if (Test-Dirty $RepoDir) {
        Write-Warning '技能仓库有未提交改动：本次只尝试快进，不会 stash 你的改动'
    }
    if ((Invoke-GitQuiet @('-C', $RepoDir, 'fetch', '--quiet', 'origin')) -ne 0) {
        Write-Warning '拉取远端失败（内网不通或没权限），跳过升级，继续安装'
        return $false
    }
    if ($Ref) {
        if ((Invoke-GitQuiet @('-C', $RepoDir, 'checkout', '--quiet', $Ref)) -ne 0) {
            Write-Warning "切不到 $Ref，保持当前引用"
            return $false
        }
    }
    if ((Invoke-GitQuiet @('-C', $RepoDir, 'pull', '--ff-only', '--quiet')) -ne 0) {
        Write-Warning '快进失败（多半是本地改动或已 detached），升级跳过，安装继续'
        return $false
    }
    return $true
}

# 处理已存在的目标：同源自动改指，异源/实体目录需 -Force
function Resolve-TargetConflict([string]$Target) {
    if (-not (Test-Path -LiteralPath $Target)) { return }

    if (Test-Link $Target) {
        $existing = Get-LinkTarget $Target
        if ($existing -and (Resolve-Path -LiteralPath $existing).Path -eq $RepoDir) {
            return   # 已指向本仓库：保持原联接不动
        }
        $existingKey = Get-RemoteKey (Resolve-Path -LiteralPath $existing).Path
        if ($existingKey -and $existingKey -eq (Get-RemoteKey $RepoDir)) {
            Write-Host "迁移旧联接：$existing → $RepoDir（同源，自动改指）"
            Remove-Link $Target
            return
        }
        if (-not $Force) {
            throw "目标已存在且指向 $existing（与本仓库不同源）；确认要改指就加 -Force"
        }
        Write-Host "改指旧联接：$existing → $RepoDir"
        Remove-Link $Target
        return
    }

    if (-not $Force) {
        throw "目标是实体目录（可能是手工复制的副本）：$Target；确认要替换就加 -Force（会先备份）"
    }
    $backup = "$Target.bak-$(Get-Date -Format 'yyyyMMddHHmmss')"
    Move-Item -LiteralPath $Target -Destination $backup
    Write-Host "实体目录已备份：$backup"
}

function Invoke-Install {
    $project_ = (Resolve-Path -LiteralPath $Project).Path
    $skillsDir = Join-Path $project_ '.claude\skills'
    $target = Join-Path $skillsDir $SkillName

    $synced = Sync-Repo
    Resolve-TargetConflict $target

    if (-not (Test-Path -LiteralPath $skillsDir)) {
        New-Item -ItemType Directory -Path $skillsDir -Force | Out-Null
    }
    if (-not (Test-Path -LiteralPath $target)) {
        New-Item -ItemType Junction -Path $target -Target $RepoDir | Out-Null
    }
    if (-not (Test-Path -LiteralPath (Join-Path $target 'SKILL.md'))) {
        throw "联接已建但读不到 SKILL.md：$target"
    }

    Write-Host ("已安装：{0}`n  仓库 {1}（v{2} @ {3}，升级{4}）`n  联接 {5}" -f `
        $SkillName, $RepoDir, (Get-SkillVersion $RepoDir), (Get-HeadShort $RepoDir), `
        $(if ($synced) { '成功' } else { '跳过' }), $target)

    if ($ClientDir) {
        $check = Join-Path $RepoDir 'scripts\check_env.py'
        Write-Host "`n环境自检：$ClientDir"
        & python $check --dir $ClientDir
        if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne 2 -and $LASTEXITCODE -ne 3) {
            Write-Warning "环境自检未正常结束（退出码 $LASTEXITCODE），检查 Python 是否可用"
        }
    } else {
        Write-Host "`n下一步：python `"$RepoDir\scripts\check_env.py`" --dir `"<客户端目录>`""
    }
}

# ---- status ----

function Invoke-Status {
    $project_ = (Resolve-Path -LiteralPath $Project).Path
    $target = Join-Path $project_ ".claude\skills\$SkillName"

    if (-not (Test-Path -LiteralPath (Join-Path $RepoDir 'SKILL.md'))) {
        Write-Host "未安装：本机没有技能仓库（$RepoDir）"
        return
    }
    $dirty = if (Test-Dirty $RepoDir) { '是' } else { '否' }
    Write-Host ("仓库 {0}`n  版本 v{1} @ {2}  未提交改动：{3}" -f `
        $RepoDir, (Get-SkillVersion $RepoDir), (Get-HeadShort $RepoDir), $dirty)

    $delta = Get-RemoteDelta $RepoDir
    if ($null -eq $delta) {
        Write-Host '  远端：拉取失败（内网不通或没权限），无法判断是否最新'
    } elseif ($null -eq $delta.Behind) {
        Write-Host "  远端：当前为 $($delta.Ref)，不跟踪分支"
    } elseif ($delta.Behind -eq 0 -and $delta.Ahead -eq 0) {
        Write-Host '  远端：已是最新'
    } else {
        Write-Host ("  远端：落后 {0} 个提交，领先 {1} 个提交" -f $delta.Behind, $delta.Ahead)
    }

    if (-not (Test-Path -LiteralPath $target)) {
        Write-Host "`n项目 $project_：未安装（没有 .claude\skills\$SkillName）"
        return
    }
    if (-not (Test-Link $target)) {
        Write-Host "`n项目 $project_：⚠ .claude\skills\$SkillName 是实体目录，不是联接（可能是手工副本）"
        return
    }
    $existing = Get-LinkTarget $target
    $same = (Get-RemoteKey $existing) -eq (Get-RemoteKey $RepoDir)
    Write-Host ("`n项目 {0}`n  联接 → {1}{2}" -f $project_, $existing, $(if ($same) { '' } else { '（⚠ 与本机仓库不同源）' }))
}

switch ($Command.ToLowerInvariant()) {
    'install' { Invoke-Install; exit 0 }
    'status' { Invoke-Status; exit 0 }
    default {
        Write-Error "未知子命令：$Command（可用：install / status）"
        exit 1
    }
}
