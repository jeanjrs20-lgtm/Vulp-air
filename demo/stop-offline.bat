@echo off
setlocal
cd /d "%~dp0\.."
powershell -ExecutionPolicy Bypass -File "demo\stop-offline.ps1"
echo.
pause
