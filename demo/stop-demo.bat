@echo off
setlocal
cd /d "%~dp0\.."
powershell -ExecutionPolicy Bypass -File "demo\stop-demo.ps1"
echo.
pause
