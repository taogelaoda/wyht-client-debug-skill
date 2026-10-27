@echo off
rem wyht 技能引导器入口：发给同事的就是这一对（.cmd + .ps1），复制到 %LOCALAPPDATA%\wyht\bin
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0wyht-skill.ps1" %*
