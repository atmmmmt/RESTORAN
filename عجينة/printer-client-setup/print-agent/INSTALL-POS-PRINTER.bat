@echo off
rem ASCII only on purpose - see the note in TEST-PRINT.bat.
rem Creating a print queue needs elevation, so ask Windows for the prompt
rem rather than failing with an error nobody at a counter can act on.
net session >nul 2>&1
if errorlevel 1 (
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-pos-printer.ps1"
