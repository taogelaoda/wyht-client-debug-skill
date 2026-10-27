@echo off
rem wyht-skill entry: delegates to the skill repo under %LOCALAPPDATA%\wyht\skills
rem NOTE: keep this file ASCII-only; cmd.exe decodes it with the OEM codepage.
node "%~dp0..\skills\wyht-client-debug\bin\wyht-skill.mjs" %*
