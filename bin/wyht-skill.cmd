@echo off
rem wyht-skill entry: bypass execution policy, forward all args to wyht-skill.ps1
rem NOTE: keep this file ASCII-only; cmd.exe decodes it with the OEM codepage,
rem       Chinese comments become garbage and can even be executed as commands.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0wyht-skill.ps1" %*
