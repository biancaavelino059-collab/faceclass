@echo off
chcp 65001 >nul
title FaceClass - Preparar ambiente
pushd "%~dp0"
if not exist ".venv-web\Scripts\python.exe" (
    py -3.12 -m venv ".venv-web"
    if errorlevel 1 (
        echo Instale Python 3.12 de 64 bits com o Python Launcher e tente novamente.
        popd
        pause
        exit /b 1
    )
)
".venv-web\Scripts\python.exe" --version
if errorlevel 1 goto falha
".venv-web\Scripts\python.exe" -m pip install -r "banco-de-dados\requirements.lock.txt"
if errorlevel 1 goto falha
".venv-web\Scripts\python.exe" "banco-de-dados\configurar.py"
if errorlevel 1 goto falha
echo.
echo Ambiente preparado. Execute configurar-banco.cmd para informar a conexao MySQL.
echo Gmail pode ficar para depois; ele nao bloqueia o site.
popd
pause
exit /b 0
:falha
echo Preparacao interrompida. Confira a mensagem acima.
popd
pause
exit /b 1
