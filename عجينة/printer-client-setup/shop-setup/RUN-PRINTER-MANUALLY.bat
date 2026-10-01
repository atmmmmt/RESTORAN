@echo off
chcp 65001 >nul
title وكيل الطابعة — تشغيل يدوي
cd /d "%~dp0"

rem A fallback for a machine where the service refuses to register, and the
rem quickest way to see the agent's own errors while chasing a printer fault.
rem Keep this window open; closing it stops printing.

set "PRINT_DIR="
if exist "..\print-agent\index.js" set "PRINT_DIR=%~dp0..\print-agent"
if exist "print-agent\index.js"    set "PRINT_DIR=%~dp0print-agent"

if not defined PRINT_DIR (
  echo   ✖ لم يُعثر على مجلد print-agent
  pause
  exit /b 1
)

echo.
echo   وكيل الطابعة يعمل الآن. لا تغلق هذه النافذة.
echo   للإيقاف: Ctrl+C
echo.
cd /d "%PRINT_DIR%"
node index.js
pause
