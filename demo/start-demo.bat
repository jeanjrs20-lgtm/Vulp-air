@echo off
setlocal
cd /d "%~dp0\.."
powershell -ExecutionPolicy Bypass -File "demo\start-demo.ps1"
echo.
pause
