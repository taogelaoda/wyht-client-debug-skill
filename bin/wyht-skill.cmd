@echo off
rem wyht-skill entry: forwards all args to the Node CLI
rem NOTE: keep this file ASCII-only; cmd.exe decodes it with the OEM codepage.
node "%~dp0wyht-skill.mjs" %*
