@echo off
rem One-click test launcher. Kept ASCII-only on purpose: cmd.exe misreads UTF-8 .bat source.
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install it from https://nodejs.org first.
  pause
  exit /b 1
)

if not exist "node_modules\electron\dist\electron.exe" (
  echo Installing dependencies, first run only...
  set "ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/"
  call npm install --registry=https://registry.npmmirror.com
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
)

if not exist "test\sample-novel.txt" call node tools\make-sample.js
if not exist "test\sample.epub" call node tools\make-sample-epub.js

start "" "node_modules\electron\dist\electron.exe" . "%~dp0test\sample-novel.txt"
