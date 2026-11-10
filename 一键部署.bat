@echo off
chcp 65001 >nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install-local.ps1" %*
set "result=%ERRORLEVEL%"
if not "%result%"=="0" echo Installation failed. Read the error above; existing data was kept.
pause
exit /b %result%
