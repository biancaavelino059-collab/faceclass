@echo off
chcp 65001 >nul
title FaceClass - Site
if not exist "%~dp0.venv-web\Scripts\python.exe" (
    echo Ambiente ausente. Execute preparar-ambiente.cmd primeiro.
    pause
    exit /b 1
)
pushd "%~dp0banco-de-dados"
"%~dp0.venv-web\Scripts\python.exe" verificar.py
if errorlevel 1 (
    echo Se a pendencia for a conexao MySQL, execute configurar-banco.cmd.
    popd
    pause
    exit /b 1
)
echo Abra http://127.0.0.1:5000 no navegador.
echo Esta janela deve ficar aberta. Ctrl+C para parar.
"%~dp0.venv-web\Scripts\python.exe" app.py
popd
pause
