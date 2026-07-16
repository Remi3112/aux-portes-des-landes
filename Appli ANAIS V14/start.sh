#!/bin/bash
cd "$(dirname "$0")"
echo "Démarrage du serveur..."
if [ ! -d "node_modules" ]; then
  echo "Première installation des dépendances, patiente quelques instants..."
  npm install
fi
npm start
