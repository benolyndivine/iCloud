@echo off
echo Stopping iCloud Backend Server on port 5000...
for /f "tokens=5" %%a in ('netstat -aon ^| find ":5000" ^| find "LISTENING"') do (
  taskkill /f /pid %%a 2>nul
)
echo iCloud Backend Server stopped.
pause
