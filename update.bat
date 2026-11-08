@echo off
setlocal
title Groundwork update
cd /d "%~dp0"

rem Downloads new lessons and app updates. Your progress is stored separately and is kept.
if not exist ".runtime\node\node.exe" goto not_set_up

rem Everything stays on one line because this file may itself get replaced by the update.
".runtime\node\node.exe" "scripts\update.mjs" & pause & exit /b

:not_set_up
echo.
echo   Groundwork isn't set up yet. Double-click start.bat first.
echo.
pause
exit /b 1
