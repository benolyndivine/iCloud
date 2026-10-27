@echo off
cd /d "%~dp0\.."
echo Starting iCloud Backend Server in background...
wscript.exe "%~dp0start-server-background.vbs"
echo Server running in background on port 5000.
pause
