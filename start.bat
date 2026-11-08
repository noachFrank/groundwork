@echo off
setlocal
title Groundwork
cd /d "%~dp0"

rem Groundwork's start button. The first run downloads what it needs. After that
rem it works with no internet. A later lesson takes this file apart line by line.

rem Did they open this from inside the zip instead of extracting it?
if not exist "package.json" goto not_extracted
echo "%CD%" | findstr /i /c:"\AppData\Local\Temp\" >nul
if not errorlevel 1 goto not_extracted

rem OneDrive constantly syncs this folder's many small files, which breaks things.
echo "%CD%" | findstr /i "OneDrive" >nul
if not errorlevel 1 goto in_onedrive

powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\get-node.ps1"
if errorlevel 1 goto failed

".runtime\node\node.exe" "scripts\launch.mjs"
if errorlevel 1 goto failed
exit /b 0

:not_extracted
echo.
echo   This file needs to be run from an extracted folder.
echo.
echo   1. Close this window.
echo   2. Find the groundwork zip file in your Downloads folder.
echo   3. Right-click it and choose "Extract All...".
echo   4. Type C:\Groundwork as the location and click Extract.
echo   5. Open the new folder and double-click start.bat there.
echo.
pause
exit /b 1

:in_onedrive
echo.
echo   Groundwork can't run from a OneDrive folder.
echo   OneDrive keeps syncing the files, and that breaks the app.
echo.
echo   Please move this whole folder to C:\Groundwork,
echo   then double-click start.bat in the new location.
echo.
echo   This folder is currently:
echo   %CD%
echo.
pause
exit /b 1

:failed
echo.
echo   Groundwork stopped. The message above says why.
echo   You can close this window, then double-click start.bat to try again.
echo.
pause
exit /b 1
