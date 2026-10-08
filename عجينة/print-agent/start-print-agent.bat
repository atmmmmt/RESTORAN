@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title Ajineh Cloud Print Agent 1.3.0

net session >nul 2>&1
if errorlevel 1 (
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

echo ==========================================
echo   Ajineh Cloud Print Agent 1.3.0
echo ==========================================
echo.

echo [1/3] Stopping any old agent on port 18181...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ids = Get-NetTCPConnection -LocalPort 18181 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; " ^
  "foreach ($procId in $ids) { try { Stop-Process -Id $procId -Force -ErrorAction Stop } catch {} }; " ^
  "Start-Sleep -Milliseconds 700"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [ERROR] Node.js is not installed or not in PATH.
  pause
  exit /b 1
)

echo [2/3] Starting cloud print agent...
echo [3/3] Keep this window open while the cashier is working.
echo.
node index.js

echo.
echo Print Agent stopped.
pause
