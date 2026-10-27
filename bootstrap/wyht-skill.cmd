@echo off
rem wyht skill bootstrap entry: ship this pair (.cmd + .ps1) to colleagues,
rem copy into %LOCALAPPDATA%\wyht\bin
rem NOTE: keep this file ASCII-only; cmd.exe decodes it with the OEM codepage.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0wyht-skill.ps1" %*
