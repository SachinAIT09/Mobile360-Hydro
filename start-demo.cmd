@echo off
REM Hydro One EV and Energy demo - double-click to install, build and start.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js is not installed. Install the LTS version from https://nodejs.org and run this file again.
  echo.
  pause
  exit /b 1
)
echo.
echo [1/3] Installing packages (first time takes a few minutes)...
call npx --yes pnpm@10.28.0 install
if errorlevel 1 goto :fail
echo.
echo [2/3] Building the apps...
call npx --yes pnpm@10.28.0 build
if errorlevel 1 goto :fail
echo.
echo [3/3] Starting the demo. Your browser will open http://localhost:3000 shortly.
echo        Keep this window open while you use the demo. Close it to stop.
start "" cmd /c "timeout /t 30 >nul & start http://localhost:3000"
call npx --yes pnpm@10.28.0 start
goto :eof
:fail
echo.
echo Something went wrong. Copy the messages above and send them to Claude.
pause
