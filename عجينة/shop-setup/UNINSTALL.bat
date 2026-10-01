@echo off
chcp 65001 >nul
title إزالة أجهزة عجينة وطحينة

net session >nul 2>&1
if errorlevel 1 (
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

cd /d "%~dp0"
set "PRINT_DIR="
set "ATT_DIR="
if exist "..\print-agent\index.js"       set "PRINT_DIR=%~dp0..\print-agent"
if exist "print-agent\index.js"          set "PRINT_DIR=%~dp0print-agent"
if exist "..\attendance-agent\index.js"  set "ATT_DIR=%~dp0..\attendance-agent"
if exist "attendance-agent\index.js"     set "ATT_DIR=%~dp0attendance-agent"

cls
echo.
echo   إزالة الخدمتين من هذا الجهاز.
echo   ملاحظة: config.json والبصمات المحفوظة لا تُحذف.
echo.
set /p "OK=  متأكد؟ اكتب y للمتابعة: "
if /i not "%OK%"=="y" exit /b

if defined PRINT_DIR ( pushd "%PRINT_DIR%" & call node install-service.js --uninstall & popd )
if defined ATT_DIR   ( pushd "%ATT_DIR%"   & call node install-service.js --uninstall & popd )

echo.
echo   ✓ تمت الإزالة.
echo.
pause
