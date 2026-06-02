@echo off
cd /d "%~dp0"
echo ============================================
echo   AMS Desktop - one-time setup
echo ============================================
echo.
echo [1/2] Installing dependencies...
call npm install
echo.
echo [2/2] Installing the browser engine...
call npx playwright install chromium
echo.
echo ============================================
echo   Setup complete!
echo   Now double-click START.bat to run.
echo ============================================
pause
