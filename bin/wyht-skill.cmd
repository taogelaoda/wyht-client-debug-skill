@echo off
rem wyht-skill entry inside the repo: forwards all args to wyht-skill.ps1
rem NOTE: keep this file ASCII-only; cmd.exe decodes it with the OEM codepage.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0wyht-skill.ps1" %*
