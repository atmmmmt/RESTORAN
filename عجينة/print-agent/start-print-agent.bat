@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title Ajineh Cloud Print Agent Installer 1.3.1

net session >nul 2>&1
if errorlevel 1 (
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

echo ==========================================
echo   Ajineh Cloud Print Agent 1.3.1
echo ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or not in PATH.
  pause
  exit /b 1
)

echo [1/4] Installing automatic startup with Windows...
schtasks /Create /TN "AjinehCloudPrintAgent" /SC ONLOGON /RL HIGHEST /F ^
  /TR "cmd.exe /c ""%~dp0run-print-agent.bat""" >nul 2>&1

echo [2/4] Stopping any old agent on port 18181...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ids = Get-NetTCPConnection -LocalPort 18181 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; " ^
  "foreach ($procId in $ids) { try { Stop-Process -Id $procId -Force -ErrorAction Stop } catch {} }; " ^
  "Start-Sleep -Milliseconds 700"

echo [3/4] Starting Print Agent now...
start "Ajineh Cloud Print Agent" cmd.exe /k ""%~dp0run-print-agent.bat""

echo [4/4] Done.
echo.
echo The printer agent will start automatically whenever Windows signs in.
echo You can close this installer window.
echo.
pause
