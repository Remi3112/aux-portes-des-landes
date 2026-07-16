@echo off
title Aux Portes des Landes - Centrale de gestion
echo Demarrage du serveur...
if not exist node_modules (
  echo Premiere installation des dependances, patiente quelques instants...
  call npm install
)
call npm start
pause
