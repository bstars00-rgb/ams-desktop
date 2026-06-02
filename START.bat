@echo off
cd /d "%~dp0"
echo ============================================
echo   AMS Desktop - starting...
echo   (Your browser will open automatically.)
echo   To STOP: close this window.
echo ============================================
echo.
node server.mjs
pause
