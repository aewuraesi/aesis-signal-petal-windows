@echo off
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22 or newer is needed to run Aesi's Signal Petal.
  echo Install it from https://nodejs.org, then run this file again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Setting up Aesi's Signal Petal for the first time...
  call corepack pnpm install
  if errorlevel 1 (
    pause
    exit /b 1
  )
)

echo Starting Aesi's Signal Petal at http://localhost:3000
call corepack pnpm dev
pause
