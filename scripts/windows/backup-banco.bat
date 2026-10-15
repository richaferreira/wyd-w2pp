@echo off
rem Salva uma copia do banco de dados (contas, personagens) em %USERPROFILE%\wyd-backups.
rem A copia fica FORA da pasta do projeto de proposito: ela contem dados de jogadores
rem e nao deve ir para o GitHub.
title WYD - Backup do banco
cd /d "%~dp0"
if not exist docker-compose.yaml cd /d "%~dp0..\.."
if not exist docker-compose.yaml goto semcompose

set "DEST=%USERPROFILE%\wyd-backups"
if not exist "%DEST%" mkdir "%DEST%"
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HH-mm"') do set "TS=%%i"
set "ARQ=%DEST%\backup-%TS%.sql"

echo Gerando backup em: %ARQ%
docker compose exec -T db pg_dump -U postgres postgres > "%ARQ%"
if errorlevel 1 goto falhou

for %%A in ("%ARQ%") do set "TAM=%%~zA"
if %TAM% LSS 1000 goto falhou

echo.
echo Backup concluido: %ARQ%
echo Tamanho: %TAM% bytes
echo.
pause
exit /b 0

:falhou
echo.
echo ERRO: o backup falhou ou ficou vazio. O servidor esta ligado? Rode iniciar-servidor.bat primeiro.
if exist "%ARQ%" del "%ARQ%"
pause
exit /b 1

:semcompose
echo Nao encontrei o docker-compose.yaml. Deixe este arquivo dentro da pasta do projeto.
pause
exit /b 1
