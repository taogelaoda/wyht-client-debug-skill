<#
.SYNOPSIS
    wyht 技能引导器：本机首次使用时确保技能仓库存在、把本目录加进 User PATH，然后转交仓库里的安装器。

.DESCRIPTION
    这份文件只在「第一次」有用：它不属仓库、靠人发给同事，复制到 %LOCALAPPDATA%\wyht\bin 即可。
    之后所有逻辑都在仓库的 bin\wyht-skill.ps1 里，靠 git pull 更新，不需要重发本文件。

    做的事：
      1. 仓库不在 %LOCALAPPDATA%\wyht\skills\<技能名> → git clone（首次会弹 GitLab 凭据）
      2. 本目录不在 User PATH → 追加进去（只改 User 级，已存在就跳过）
      3. 转交：& <仓库>\bin\wyht-skill.ps1 <同样的参数>

    参数与仓库内命令一致，见 README 的「安装」一节。

.EXAMPLE
    wyht-skill install -Project 'D:\Document\outprovince-doctor-client-省外标准版'
#>
[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$Command = 'install',
    [string]$Project,
    [string]$ClientDir,
    [string]$Ref,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$SkillName = 'wyht-client-debug'
$RepoUrl = 'http://192.168.1.66:9999/zhugangtao/wyht-client-debug-skill.git'
$RepoDir = Join-Path $env:LOCALAPPDATA "wyht\skills\$SkillName"
$Cli = Join-Path $RepoDir 'bin\wyht-skill.ps1'

if (-not (Test-Path -LiteralPath (Join-Path $RepoDir 'SKILL.md'))) {
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        Write-Error '未安装 git，无法获取技能仓库'
        exit 1
    }
    Write-Host "首次使用：克隆 $RepoUrl"
    New-Item -ItemType Directory -Path (Split-Path -Parent $RepoDir) -Force | Out-Null
    & git clone --quiet $RepoUrl $RepoDir
    if ($LASTEXITCODE -ne 0) {
        Write-Error "git clone 失败（退出码 $LASTEXITCODE）"
        exit 1
    }
}

# 把引导器所在目录挂进 User PATH：只追加、已存在就跳过、不碰 Machine 级
$binDir = $PSScriptRoot
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$entries = @()
if ($userPath) { $entries = $userPath -split ';' | Where-Object { $_ } }
if (-not ($entries | Where-Object { $_.TrimEnd('\') -ieq $binDir.TrimEnd('\') })) {
    $merged = if ($userPath) { $userPath.TrimEnd(';') + ';' + $binDir } else { $binDir }
    [Environment]::SetEnvironmentVariable('Path', $merged, 'User')
    Write-Host "已把 $binDir 加入用户 PATH（新开的终端才生效）"
}

# 参数按名字转发：直接 splat 字符串数组会被当成位置参数，-Project 之类的开关会丢
$forward = @{ Command = $Command }
if ($Project) { $forward['Project'] = $Project }
if ($ClientDir) { $forward['ClientDir'] = $ClientDir }
if ($Ref) { $forward['Ref'] = $Ref }
if ($Force) { $forward['Force'] = $true }

if (-not (Test-Path -LiteralPath $Cli)) {
    Write-Error "仓库里缺少 bin\wyht-skill.ps1，先 git -C `"$RepoDir`" pull 再试"
    exit 1
}
& $Cli @forward
exit $LASTEXITCODE
