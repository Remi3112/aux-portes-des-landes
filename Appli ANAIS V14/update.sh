#!/bin/bash
cd "$(dirname "$0")"
echo "Récupération de la dernière version depuis GitHub..."
git pull
echo "Mise à jour des dépendances..."
npm install
echo ""
echo "Mise à jour terminée. Tu peux relancer l'application avec ./start.sh"
