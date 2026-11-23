@echo off
chcp 65001 >nul
title FaceClass - E-mails
if not exist "%~dp0.venv-web\Scripts\python.exe" (
    echo Ambiente ausente. Execute preparar-ambiente.cmd primeiro.
    pause
    exit /b 1
)
pushd "%~dp0banco-de-dados"
echo Preencha SMTP no arquivo .env antes de iniciar os avisos.
"%~dp0.venv-web\Scripts\python.exe" emails.py
popd
pause
