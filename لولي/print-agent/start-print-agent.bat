@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title Luliz Print Agent Installer

net session >nul 2>&1
if errorlevel 1 (
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed.
  pause
  exit /b 1
)

echo [1/4] Allowing loliz-taste.com to reach the local printer agent...
for %%K in (
  "HKLM\SOFTWARE\Policies\Google\Chrome"
  "HKCU\SOFTWARE\Policies\Google\Chrome"
) do (
  reg add "%%~K\LoopbackNetworkAllowedForUrls" /v "20" /t REG_SZ /d "https://loliz-taste.com" /f >nul
  reg add "%%~K\LoopbackNetworkAllowedForUrls" /v "21" /t REG_SZ /d "https://www.loliz-taste.com" /f >nul
  reg add "%%~K\LocalNetworkAccessAllowedForUrls" /v "20" /t REG_SZ /d "https://loliz-taste.com" /f >nul
  reg add "%%~K\LocalNetworkAccessAllowedForUrls" /v "21" /t REG_SZ /d "https://www.loliz-taste.com" /f >nul
)

echo [2/4] Installing automatic startup...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$startup=[Environment]::GetFolderPath('Startup');" ^
  "$lnk=Join-Path $startup 'Luliz Print Agent.lnk';" ^
  "$ws=New-Object -ComObject WScript.Shell;" ^
  "$s=$ws.CreateShortcut($lnk);" ^
  "$s.TargetPath='%~dp0run-print-agent.bat';" ^
  "$s.WorkingDirectory='%~dp0';" ^
  "$s.WindowStyle=1;" ^
  "$s.Save();"

echo [3/4] Stopping any old Luliz agent on port 9123...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ids = Get-NetTCPConnection -LocalPort 9123 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; " ^
  "foreach ($procId in $ids) { try { Stop-Process -Id $procId -Force -ErrorAction Stop } catch {} }; " ^
  "Start-Sleep -Milliseconds 600"

echo [4/4] Starting Luliz Print Agent...
start "Luliz Print Agent" "%~dp0run-print-agent.bat"

echo.
echo Luliz Print Agent is ready and will start automatically with Windows.
echo Close and reopen Chrome once so the local access rule is loaded.
echo.
pause
