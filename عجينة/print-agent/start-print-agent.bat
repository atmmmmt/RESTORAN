@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title Ajineh Print Agent

net session >nul 2>&1
if errorlevel 1 (
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

echo ==========================================
echo   Ajineh Print Agent - Chrome auto-fix
echo ==========================================
echo.

echo [1/5] Allowing Ajineh website to access the local print service...
reg add "HKLM\SOFTWARE\Policies\Google\Chrome\LocalNetworkAccessAllowedForUrls" /v "1" /t REG_SZ /d "https://ajineh-w-tahineh.com" /f >nul
reg add "HKLM\SOFTWARE\Policies\Google\Chrome\LocalNetworkAccessAllowedForUrls" /v "2" /t REG_SZ /d "https://www.ajineh-w-tahineh.com" /f >nul
reg add "HKLM\SOFTWARE\Policies\Google\Chrome\LoopbackNetworkAllowedForUrls" /v "1" /t REG_SZ /d "https://ajineh-w-tahineh.com" /f >nul
reg add "HKLM\SOFTWARE\Policies\Google\Chrome\LoopbackNetworkAllowedForUrls" /v "2" /t REG_SZ /d "https://www.ajineh-w-tahineh.com" /f >nul

echo [2/5] Stopping any old Print Agent on port 18181...
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

echo [3/5] Chrome permission policy installed.
echo [4/5] IMPORTANT: Close ALL Chrome windows once, then reopen Chrome.
echo [5/5] Starting Print Agent 1.2.1...
echo.
node index.js

echo.
echo Print Agent stopped.
pause
