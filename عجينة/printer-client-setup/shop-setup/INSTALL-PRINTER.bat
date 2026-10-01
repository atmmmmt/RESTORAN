@echo off
setlocal
title Ajineh Printer Setup

net session >nul 2>&1
if errorlevel 1 (
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

set "PRINT_DIR=%~dp0..\print-agent"
if not exist "%PRINT_DIR%\index.js" (
  echo.
  echo ERROR: The print-agent folder was not found next to shop-setup.
  echo Copy the complete printer-client-setup folder and try again.
  echo.
  pause
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo ERROR: Node.js is not installed.
  echo Install the Node.js LTS version, then run this file again.
  echo https://nodejs.org
  echo.
  pause
  exit /b 1
)

echo.
echo Installing printer service...
pushd "%PRINT_DIR%"
call npm install --silent --no-audit --no-fund
if errorlevel 1 (
  echo.
  echo ERROR: npm install failed.
  popd
  pause
  exit /b 1
)

call node install-service.js
popd

echo.
echo Printer setup finished.
echo Open the dashboard, go to printer settings, and click Check.
echo.
pause
