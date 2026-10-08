@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title Ajineh Print Agent

echo ==========================================
echo   Ajineh Print Agent - Restart cleanly
echo ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or not in PATH.
  echo Install Node.js, then run this file again.
  pause
  exit /b 1
)

echo [1/3] Stopping any old Print Agent on port 18181...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ids = Get-NetTCPConnection -LocalPort 18181 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; " ^
  "foreach ($procId in $ids) { try { Stop-Process -Id $procId -Force -ErrorAction Stop; Write-Host ('Stopped PID ' + $procId) } catch { Write-Host ('Could not stop PID ' + $procId + '. Run this BAT as Administrator.'); exit 5 } }; " ^
  "Start-Sleep -Milliseconds 700"
if errorlevel 1 (
  echo.
  echo [ERROR] Could not free port 18181.
  echo Right-click this file and choose "Run as administrator".
  pause
  exit /b 1
)

echo [2/3] Starting the current agent from:
echo %CD%
echo.
echo [3/3] Keep this window open while the cashier is working.
echo.
node index.js

echo.
echo Print Agent stopped.
pause
