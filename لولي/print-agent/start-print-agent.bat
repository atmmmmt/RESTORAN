@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title Luliz Cloud Print Agent Installer

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

echo [1/3] Installing automatic startup...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$startup=[Environment]::GetFolderPath('Startup');" ^
  "$lnk=Join-Path $startup 'Luliz Cloud Print Agent.lnk';" ^
  "$ws=New-Object -ComObject WScript.Shell;" ^
  "$s=$ws.CreateShortcut($lnk);" ^
  "$s.TargetPath='%~dp0run-print-agent.bat';" ^
  "$s.WorkingDirectory='%~dp0';" ^
  "$s.WindowStyle=1;" ^
  "$s.Save();"

echo [2/3] Stopping any old Luliz agent on port 9123...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ids = Get-NetTCPConnection -LocalPort 9123 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; " ^
  "foreach ($procId in $ids) { try { Stop-Process -Id $procId -Force -ErrorAction Stop } catch {} }; " ^
  "Start-Sleep -Milliseconds 600"

echo [3/3] Starting Luliz Cloud Print Agent...
start "Luliz Cloud Print Agent" "%~dp0run-print-agent.bat"

echo.
echo Done. Chrome permissions are NOT required anymore.
echo The agent will start automatically with Windows.
echo.
pause
