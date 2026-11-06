@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Game Workshop needs Node.js 24 or newer. Opening the download page...
  start https://nodejs.org/
  echo Install Node.js, then double-click this file again.
  pause
  exit /b 1
)
node "scripts\export-ui\server.mjs" --open
if errorlevel 1 pause
