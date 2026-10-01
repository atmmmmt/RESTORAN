@echo off
rem Deliberately ASCII-only. cmd reads a .bat in the machine's OEM code page,
rem so UTF-8 Arabic inside one can be misparsed and the window vanishes before
rem anybody reads it. All the wording lives in the .ps1, which handles it.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0test-print.ps1"
