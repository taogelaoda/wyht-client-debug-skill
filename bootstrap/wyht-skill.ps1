<#
.SYNOPSIS
    wyht 技能引导器：一条命令把技能装到本机（克隆仓库、放好命令入口、加 PATH），然后转交安装器。

.DESCRIPTION
    首次使用跑一次即可，之后所有逻辑都在仓库的 bin\wyht-skill.mjs 里，靠 git pull 更新。

    做的事：
      1. 仓库不在 %LOCALAPPDATA%\wyht\skills\<技能名> → 克隆（有 git 用 git，没 git 用 GitHub 的 zip 快照）
      2. 在 %LOCALAPPDATA%\wyht\bin 放一个 wyht-skill.cmd 入口（指向仓库里的脚本，不复制副本）
      3. 把该目录追加进 User PATH（只改 User 级、只追加、已含则跳过；-NoPathUpdate 可跳过）
      4. 转交：& node <仓库>\bin\wyht-skill.mjs <同样的参数>

    既可用文件运行，也可直接管道执行（无参时默认装到当前目录）：
      irm https://raw.githubusercontent.com/taogelaoda/wyht-client-debug-skill/main/bootstrap/wyht-skill.ps1 | iex

.EXAMPLE
    wyht-skill install -Project 'D:\Document\outprovince-doctor-client-省外标准版'

.EXAMPLE
    # 内网用户改用内网 GitLab 源
    wyht-skill install -RepoUrl 'http://192.168.1.66:9999/zhugangtao/wyht-client-debug-skill.git'
#>
[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$Command = 'install',
    [string]$Project,
    [string]$ClientDir,
    [string]$Ref,
    [switch]$Force,
    [string]$RepoUrl,
    [switch]$NoPathUpdate
)

$ErrorActionPreference = 'Stop'
$SkillName = 'wyht-client-debug'
$RepoDir = Join-Path $env:LOCALAPPDATA "wyht\skills\$SkillName"

# Node 版本闸门放在前面：CLI 要求 >= 24，不满足就别克隆/写入口，避免半个安装
$nodeVersion = $null
try { $nodeVersion = (& node -v) 2>$null } catch { $nodeVersion = $null }
if (-not $nodeVersion) {
    Write-Error '需要 Node.js（>= 24）才能使用 wyht-skill 命令；请先安装 Node 后重试'
    exit 1
}
$ver = $nodeVersion.TrimStart('v').Split('.')
if ([int]$ver[0] -lt 24) {
    Write-Error ("需要 Node >= 24，当前 " + $nodeVersion)
    exit 1
}

# 克隆源按顺序尝试：显式 -RepoUrl 只用一个；否则 Gitee 优先（国内网络实测可达），GitHub 兜底。
$RepoCandidates = @()
if ($RepoUrl) {
    $RepoCandidates = @($RepoUrl)
} else {
    $RepoCandidates = @(
        'https://gitee.com/zhu-gangtao/wyht-client-debug-skill.git',
        'https://github.com/taogelaoda/wyht-client-debug-skill.git'
    )
}
$BinDir = Join-Path $env:LOCALAPPDATA 'wyht\bin'
$Cli = Join-Path $RepoDir 'bin\wyht-skill.mjs'

# 入口用 .cmd 包一层：cmd.exe 按 OEM 解码，必须纯 ASCII
$ShimContent = "@echo off`r`n" +
    "rem wyht-skill entry: forwards args to the Node CLI inside the skill repo`r`n" +
    "node `"%~dp0..\skills\$SkillName\bin\wyht-skill.mjs`" %*`r`n"

# 用 GitHub 的 zip 快照解一份工作区：给没装 git 的机器留后路
function Get-RepoSnapshot {
    $gh = $RepoCandidates | Where-Object { $_ -match 'github\.com' } | Select-Object -First 1
    if (-not $gh -or $gh -notmatch 'github\.com[:/](?<owner>[^/]+)/(?<repo>[^/]+?)(\.git)?$') {
        throw "没有 git，且没有可用的 GitHub 地址，无法下载快照"
    }
    $zip = Join-Path $env:TEMP "wyht-$SkillName.zip"
    $stage = Join-Path $env:TEMP "wyht-$SkillName-snapshot"
    $archiveUrl = "https://codeload.github.com/$($Matches.owner)/$($Matches.repo)/zip/refs/heads/main"
    Write-Host "未检测到 git，改用快照：$archiveUrl"
    Invoke-WebRequest -Uri $archiveUrl -OutFile $zip -UseBasicParsing
    Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
    Expand-Archive -LiteralPath $zip -DestinationPath $stage -Force
    New-Item -ItemType Directory -Path (Split-Path -Parent $RepoDir) -Force | Out-Null
    Move-Item -LiteralPath (Join-Path $stage "$($Matches.repo)-main") -Destination $RepoDir
    Remove-Item -LiteralPath $zip, $stage -Recurse -Force -ErrorAction SilentlyContinue
}

if (-not (Test-Path -LiteralPath (Join-Path $RepoDir 'SKILL.md'))) {
    New-Item -ItemType Directory -Path (Split-Path -Parent $RepoDir) -Force | Out-Null
    if (Get-Command git -ErrorAction SilentlyContinue) {
        $cloned = $false
        foreach ($candidate in $RepoCandidates) {
            Write-Host "首次使用：克隆 $candidate"
            & git clone --quiet $candidate $RepoDir
            if ($LASTEXITCODE -eq 0) {
                $RepoUrl = $candidate
                $cloned = $true
                break
            }
            Write-Warning "该源不可用，换下一个"
            Remove-Item -LiteralPath $RepoDir -Recurse -Force -ErrorAction SilentlyContinue
        }
        if (-not $cloned) {
            Write-Error "所有克隆源都失败：$($RepoCandidates -join ' / ')"
            exit 1
        }
    } else {
        Get-RepoSnapshot
    }
}

if (-not (Test-Path -LiteralPath $Cli)) {
    Write-Error "仓库里缺少 bin\wyht-skill.mjs，先 git -C `"$RepoDir`" pull 再试"
    exit 1
}

# 命令入口：内容变了才重写，避免每次 install 都动文件
New-Item -ItemType Directory -Path $BinDir -Force | Out-Null
$ShimPath = Join-Path $BinDir 'wyht-skill.cmd'
$currentShim = if (Test-Path -LiteralPath $ShimPath) { Get-Content -LiteralPath $ShimPath -Raw } else { '' }
if ($currentShim -ne $ShimContent) {
    [IO.File]::WriteAllText($ShimPath, $ShimContent, [Text.Encoding]::ASCII)
    Write-Host "已写入命令入口：$ShimPath"
}

# PATH 只改 User 级、只追加
if (-not $NoPathUpdate) {
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $entries = @()
    if ($userPath) { $entries = $userPath -split ';' | Where-Object { $_ } }
    if (-not ($entries | Where-Object { $_.TrimEnd('\') -ieq $BinDir.TrimEnd('\') })) {
        $merged = if ($userPath) { $userPath.TrimEnd(';') + ';' + $BinDir } else { $BinDir }
        [Environment]::SetEnvironmentVariable('Path', $merged, 'User')
        Write-Host "已把 $BinDir 加入用户 PATH（新开的终端才生效）"
    }
}

# 参数按 CLI 选项名转发：splat 字符串数组会被当成位置参数，-Project 之类会丢
$forwardArgs = @()
if ($Command) { $forwardArgs += $Command }
foreach ($pair in @(
    @{ Name = 'project';    Value = $Project },
    @{ Name = 'client-dir'; Value = $ClientDir },
    @{ Name = 'repo-url';   Value = $RepoUrl },
    @{ Name = 'ref';        Value = $Ref }
)) {
    if ($pair.Value) { $forwardArgs += ('--' + $pair.Name); $forwardArgs += $pair.Value }
}
if ($Force) { $forwardArgs += '--force' }

& node $Cli @forwardArgs
exit $LASTEXITCODE
