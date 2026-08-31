@echo off
chcp 65001 > nul
title Oneda Ficha Pro - Sincronizador de Fotos do Google Drive
echo ============================================================
echo      ONEDA FICHA PRO - SINCRONIZADOR DE FOTOS DO DRIVE
echo ============================================================
echo.

cd /d "C:\Users\estilo08\Documents\ANTIGRAVITY\APPs\oneda-ficha-pro"

echo Sincronizando imagens da pasta:
echo G:\Meu Drive\ONEDA\APP ONEDA FICHA PRO\IMAGENS PARA o APP
echo.
python sync_drive.py
echo.

echo ============================================================
echo Concluido! Suas fotos estao prontas no app.
echo ============================================================
echo.
pause
