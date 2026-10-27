@echo off
rem wyht-skill 命令入口（cmd 包装）：绕过执行策略，把参数原样交给同目录的 wyht-skill.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0wyht-skill.ps1" %*
