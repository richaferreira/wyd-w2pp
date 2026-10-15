@echo off
rem Desliga o servidor WYD. Os dados do banco sao mantidos no volume do Docker.
title WYD - Parar servidor
cd /d "%~dp0"
if not exist docker-compose.yaml cd /d "%~dp0..\.."
if not exist docker-compose.yaml goto semcompose
docker compose down
echo.
echo Servidor parado. Os dados (contas e personagens) foram mantidos.
echo Para apagar TUDO, incluindo o banco, use: docker compose down -v
echo.
pause
exit /b 0
:semcompose
echo Nao encontrei o docker-compose.yaml. Deixe este arquivo dentro da pasta do projeto.
pause
exit /b 1
