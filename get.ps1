# wyht-skill one-liner entry point.
#
# Deliberately ASCII-only and WITHOUT a BOM: when this file is piped
# (irm <url> | iex), a BOM becomes part of the first token and the parser
# fails with "Unexpected attribute CmdletBinding". Keep it ASCII.
#
# What it does: download the real bootstrap (UTF-8 with BOM, so Chinese
# comments survive PowerShell 5.1), write it to %TEMP%, run `install` in the
# current directory. For arguments use the two-step form:
#   irm <bootstrap url> -OutFile $env:TEMP\wyht.ps1
#   & $env:TEMP\wyht.ps1 install
#   wyht-skill init

$ErrorActionPreference = 'Stop'
$bootstrapUrl = 'https://raw.githubusercontent.com/taogelaoda/wyht-client-debug-skill/main/bootstrap/wyht-skill.ps1'
$localPath = Join-Path $env:TEMP 'wyht-skill-bootstrap.ps1'

$code = (Invoke-WebRequest -Uri $bootstrapUrl -UseBasicParsing).Content
# The downloaded file already starts with a BOM; writing it with a BOM-adding encoder
# yields a double BOM and PowerShell then refuses to parse it.
$code = $code.TrimStart([char]0xFEFF)
[IO.File]::WriteAllText($localPath, $code, [Text.Encoding]::UTF8)

& $localPath install
exit $LASTEXITCODE
