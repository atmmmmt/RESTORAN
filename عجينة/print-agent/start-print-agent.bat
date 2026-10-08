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
echo   Ajineh Print Agent - Full Chrome Fix
echo ==========================================
echo.

echo [1/6] Installing Chrome loopback permission...
for %%K in (
  "HKLM\SOFTWARE\Policies\Google\Chrome"
  "HKCU\SOFTWARE\Policies\Google\Chrome"
) do (
  reg add "%%~K\LoopbackNetworkAllowedForUrls" /v "1" /t REG_SZ /d "https://ajineh-w-tahineh.com" /f >nul
  reg add "%%~K\LoopbackNetworkAllowedForUrls" /v "2" /t REG_SZ /d "https://www.ajineh-w-tahineh.com" /f >nul
  reg add "%%~K\LoopbackNetworkAllowedForUrls" /v "3" /t REG_SZ /d "ajineh-w-tahineh.com" /f >nul
  reg add "%%~K\LocalNetworkAllowedForUrls" /v "1" /t REG_SZ /d "https://ajineh-w-tahineh.com" /f >nul
  reg add "%%~K\LocalNetworkAllowedForUrls" /v "2" /t REG_SZ /d "https://www.ajineh-w-tahineh.com" /f >nul
  reg add "%%~K\LocalNetworkAccessAllowedForUrls" /v "1" /t REG_SZ /d "https://ajineh-w-tahineh.com" /f >nul
  reg add "%%~K\LocalNetworkAccessAllowedForUrls" /v "2" /t REG_SZ /d "https://www.ajineh-w-tahineh.com" /f >nul
)

echo [2/6] Closing ALL Chrome windows so the new policy is loaded...
taskkill /IM chrome.exe /F >nul 2>&1
timeout /t 2 /nobreak >nul

echo [3/6] Stopping any old Print Agent on port 18181...
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

echo [4/6] Chrome policy installed for Ajineh.
echo [5/6] Starting Print Agent 1.2.2...
echo.
start "" /B node index.js
timeout /t 2 /nobreak >nul

echo [6/6] Reopening Chrome on Ajineh...
start "" chrome.exe "https://ajineh-w-tahineh.com/admin/settings"

echo.
echo ==========================================
echo   READY - keep this window open
echo   Health: http://127.0.0.1:18181/health
echo ==========================================
echo.
pause
