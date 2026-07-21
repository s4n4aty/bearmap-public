@echo off
REM Serve the public map on http://localhost:8080
REM Python 3.x is required. Close with Ctrl+C.

cd /d "%~dp0"
python -m http.server 8080
