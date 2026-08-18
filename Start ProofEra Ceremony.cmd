@echo off
setlocal
cd /d "%~dp0"
node scripts\operator-ceremony-server.mjs
if errorlevel 1 (
  echo.
  echo ProofEra ceremony stopped with an error. Keep this window open and report the code shown above.
  pause
)
endlocal
