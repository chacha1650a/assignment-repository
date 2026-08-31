@echo off
cd /d "%~dp0"
start "mochi-diary-server" /min cmd /c "python -m http.server 8743"
timeout /t 1 /nobreak >nul
start "" http://localhost:8743/index.html
