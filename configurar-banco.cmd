@echo off
chcp 65001 >nul
title FaceClass - Configurar MySQL
if not exist "%~dp0.venv-web\Scripts\python.exe" (
    echo Execute preparar-ambiente.cmd primeiro.
    pause
    exit /b 1
)
pushd "%~dp0banco-de-dados"
"%~dp0.venv-web\Scripts\python.exe" configurar_banco.py
set "faceclass_resultado=%errorlevel%"
popd
pause
exit /b %faceclass_resultado%
