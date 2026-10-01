@echo off
title Luliz Print Agent
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install it from https://nodejs.org then run this again.
  pause
  exit /b
)
node agent.js
pause
