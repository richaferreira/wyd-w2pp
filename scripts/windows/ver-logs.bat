@echo off
rem Mostra o log do servidor de jogo em tempo real. Ctrl+C para sair.
title WYD - Logs do servidor de jogo
cd /d "%~dp0"
if not exist docker-compose.yaml cd /d "%~dp0..\.."
if not exist docker-compose.yaml goto semcompose
docker compose logs -f --tail 100 tmserver
pause
exit /b 0
:semcompose
echo Nao encontrei o docker-compose.yaml. Deixe este arquivo dentro da pasta do projeto.
pause
exit /b 1
