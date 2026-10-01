@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title فحص أجهزة عجينة وطحينة
cd /d "%~dp0"

set "ATT_DIR="
if exist "..\attendance-agent\config.json" set "ATT_DIR=%~dp0..\attendance-agent"
if exist "attendance-agent\config.json"    set "ATT_DIR=%~dp0attendance-agent"

cls
echo.
echo   ══════════════════════════════════════════════════
echo                  فحص الحالة
echo   ══════════════════════════════════════════════════
echo.

rem ── Services ─────────────────────────────────────────────────────────
call :service "Ajineh Print Agent"      "وكيل الطابعة"
call :service "Ajineh Attendance Agent" "وكيل البصمة "
echo.

rem ── Print agent port ─────────────────────────────────────────────────
rem The service can be "running" while the process is wedged, so ask the
rem agent itself rather than trusting the service manager.
powershell -NoProfile -Command "try{$r=Invoke-RestMethod -Uri 'http://127.0.0.1:18181/health' -TimeoutSec 3;if($r.success){exit 0}else{exit 1}}catch{exit 1}" >nul 2>&1
if errorlevel 1 (
  echo   ✖ وكيل الطابعة لا يستجيب على المنفذ 18181
) else (
  echo   ✓ وكيل الطابعة يستجيب على المنفذ 18181
)

rem ── Fingerprint device ───────────────────────────────────────────────
if defined ATT_DIR (
  for /f "tokens=*" %%i in ('node -e "try{console.log(require(process.argv[1]+'/config.json').deviceIp||'')}catch(e){}" "%ATT_DIR%" 2^>nul') do set "DEVIP=%%i"
)
if defined DEVIP (
  ping -n 1 -w 1500 !DEVIP! >nul 2>&1
  if errorlevel 1 (
    echo   ✖ جهاز البصمة !DEVIP! لا يستجيب
  ) else (
    echo   ✓ جهاز البصمة !DEVIP! متصل
  )
) else (
  echo   — جهاز البصمة: لا يوجد config.json بعد
)

echo.
set /p "PIP=  اكتب IP الطابعة للفحص (Enter للتخطي): "
if not "!PIP!"=="" (
  powershell -NoProfile -Command "try{$c=New-Object Net.Sockets.TcpClient;$c.Connect('%PIP%',9100);$c.Close();exit 0}catch{exit 1}" >nul 2>&1
  if errorlevel 1 (
    echo   ✖ الطابعة !PIP!:9100 لا تستجيب
  ) else (
    echo   ✓ الطابعة !PIP!:9100 متصلة
  )
)

echo.
echo   السجلات التفصيلية: Event Viewer ^> Windows Logs ^> Application
echo.
pause
exit /b

rem Matched on the display name rather than the service id: node-windows
rem derives that id from the name by its own rules, and a check that reports
rem a healthy service as missing sends someone reinstalling for nothing.
:service
for /f %%s in ('powershell -NoProfile -Command "$s=Get-Service -DisplayName '%~1*' -ErrorAction SilentlyContinue | Select-Object -First 1; if($s){$s.Status}else{'MISSING'}"') do set "ST=%%s"
if "%ST%"=="MISSING" (
  echo   ✖ %~2 : غير مثبّتة — شغّل INSTALL.bat
) else if "%ST%"=="Running" (
  echo   ✓ %~2 : تعمل
) else (
  echo   ✖ %~2 : مثبّتة لكنها %ST%
)
exit /b
