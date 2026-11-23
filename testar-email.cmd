@echo off
setlocal
cd /d "%~dp0banco-de-dados"
"%~dp0.venv-web\Scripts\python.exe" testar_email.py
pause
