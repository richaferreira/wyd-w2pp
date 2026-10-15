@echo off
rem Inicia o servidor WYD no Windows (chama iniciar-servidor.ps1).
rem De dois cliques neste arquivo. Requer o Docker Desktop instalado e aberto.
title WYD - Iniciar servidor
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0iniciar-servidor.ps1" %*
if errorlevel 1 pause
