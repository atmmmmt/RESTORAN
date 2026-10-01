@echo off
cd /d "%~dp0"
set "TARGET=%~dp0start-print-agent.bat"
powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Startup')+'\Luliz Print Agent.lnk'); $s.TargetPath=$env:TARGET; $s.WorkingDirectory='%~dp0'; $s.WindowStyle=7; $s.Save()"
echo Done - the Luliz print agent will now start automatically with Windows.
start "" "%TARGET%"
pause
