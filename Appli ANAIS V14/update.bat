@echo off
title Mise a jour - Aux Portes des Landes
echo Recuperation de la derniere version depuis GitHub...
git pull
echo Mise a jour des dependances...
call npm install
echo.
echo Mise a jour terminee. Tu peux relancer l'application avec start.bat
pause
