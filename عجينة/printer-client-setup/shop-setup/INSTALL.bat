@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title تنصيب أجهزة عجينة وطحينة

rem ── Administrator ────────────────────────────────────────────────────
rem Registering a Windows service needs elevation. Rather than fail with a
rem permissions error the cashier can't read, ask Windows for the prompt.
net session >nul 2>&1
if errorlevel 1 (
  echo.
  echo   يحتاج التنصيب صلاحية المسؤول — اضغط "نعم" في النافذة القادمة.
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

cd /d "%~dp0"

rem ── Locate the two agents ────────────────────────────────────────────
rem They sit beside this folder in the project, or inside it in the copy
rem handed to the shop. Accept both so one script covers both cases.
set "PRINT_DIR="
set "ATT_DIR="
if exist "..\print-agent\index.js"       set "PRINT_DIR=%~dp0..\print-agent"
if exist "print-agent\index.js"          set "PRINT_DIR=%~dp0print-agent"
if exist "..\attendance-agent\index.js"  set "ATT_DIR=%~dp0..\attendance-agent"
if exist "attendance-agent\index.js"     set "ATT_DIR=%~dp0attendance-agent"

cls
echo.
echo   ══════════════════════════════════════════════════
echo               عجينة وطحينة — تنصيب الأجهزة
echo                  الطابعة  ·  البصمة
echo   ══════════════════════════════════════════════════
echo.

rem ── Node.js ──────────────────────────────────────────────────────────
where node >nul 2>&1
if errorlevel 1 (
  echo   ✖ Node.js غير مثبّت على هذا الجهاز.
  echo.
  echo     نزّله من:  https://nodejs.org
  echo     اختر النسخة LTS، ثم أعد تشغيل هذا الملف.
  echo.
  pause
  exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do set "NODEV=%%v"
echo   ✓ Node.js !NODEV!
echo.

rem ══ 1/2  الطابعة ══════════════════════════════════════════════════════
echo   ── 1/2 ── وكيل الطابعة
if not defined PRINT_DIR (
  echo   ✖ لم يُعثر على مجلد print-agent — تخطّي.
  goto :attendance
)
pushd "%PRINT_DIR%"
echo      تثبيت المتطلبات...
call npm install --silent --no-audit --no-fund >nul 2>&1
echo      تسجيل الخدمة...
call node install-service.js
popd
echo.

:attendance
rem ══ 2/2  البصمة ═══════════════════════════════════════════════════════
echo   ── 2/2 ── وكيل البصمة
if not defined ATT_DIR (
  echo   ✖ لم يُعثر على مجلد attendance-agent — تخطّي.
  goto :done
)
pushd "%ATT_DIR%"

if not exist "config.json" (
  echo.
  echo      هذا الفرع لم يُضبط بعد. جهّز المعلومات التالية:
  echo.
  echo      مفتاح الوكيل:  الداشبورد ^> الحضور ^> الأجهزة ^> إضافة جهاز
  echo                     ^(يظهر مرة واحدة فقط — انسخه فوراً^)
  echo      عنوان الجهاز:  عادةً 192.168.1.201
  echo.
  set /p "AGENTKEY=      مفتاح الوكيل : "
  set /p "DEVICEIP=      IP جهاز البصمة [192.168.1.201] : "
  if "!DEVICEIP!"=="" set "DEVICEIP=192.168.1.201"

  rem Written by node, not by echo: a key can contain characters cmd would
  rem eat, and a half-escaped JSON file fails at 6am with no one to read it.
  node -e "const fs=require('fs');fs.writeFileSync('config.json',JSON.stringify({serverUrl:'https://ajenah.prootech-agency.com',agentKey:process.argv[1],deviceIp:process.argv[2],devicePort:4370,deviceTimeout:10000,syncSeconds:60,pollSeconds:5},null,2))" "!AGENTKEY!" "!DEVICEIP!"
  echo      ✓ تم إنشاء config.json
) else (
  echo      ✓ config.json موجود — لم يُغيَّر
)

echo      تثبيت المتطلبات...
call npm install --silent --no-audit --no-fund >nul 2>&1
echo      تسجيل الخدمة...
call node install-service.js
popd

:done
echo.
echo   ══════════════════════════════════════════════════
echo                      انتهى التنصيب
echo   ══════════════════════════════════════════════════
echo.
echo   الخدمتان تعملان الآن وتبدآن تلقائياً مع كل إقلاع.
echo   لا حاجة لفتح أي نافذة سوداء بعد اليوم.
echo.
echo   الخطوة الأخيرة — من الداشبورد:
echo     الإعدادات ^> طابعة الفواتير LAN
echo     أدخل IP الطابعة، اختر 80mm، كثافة "غامقة"، ثم احفظ.
echo.
echo   للتأكد أن كل شيء سليم شغّل:  CHECK.bat
echo.
pause
