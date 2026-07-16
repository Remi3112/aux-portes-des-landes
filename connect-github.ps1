# Script de connexion du dossier au depot GitHub
# Aux Portes des Landes - Centrale de gestion
# A executer UNE SEULE FOIS depuis ce dossier (clic droit > Executer avec PowerShell,
# ou "cd" dans ce dossier puis : .\connect-github.ps1)

$repoUrl = "https://github.com/Remi3112/aux-portes-des-landes.git"

Write-Host "=== Verification de Git ===" -ForegroundColor Cyan
git --version
if ($LASTEXITCODE -ne 0) {
    Write-Host "Git n'est pas installe. Installe-le avec : winget install --id Git.Git -e --source winget" -ForegroundColor Red
    exit 1
}

Write-Host "`n=== Identite Git (si pas deja configuree) ===" -ForegroundColor Cyan
$name = git config --global user.name
if (-not $name) {
    git config --global user.name "Remi"
    git config --global user.email "oc.keys31@gmail.com"
    Write-Host "Identite configuree : Remi <oc.keys31@gmail.com>"
} else {
    Write-Host "Identite deja configuree : $name"
}

Write-Host "`n=== Initialisation du depot ===" -ForegroundColor Cyan
if (-not (Test-Path ".git")) {
    git init
    git branch -M main
} else {
    Write-Host "Ce dossier est deja un depot Git."
}

$existingRemote = git remote get-url origin 2>$null
if (-not $existingRemote) {
    git remote add origin $repoUrl
    Write-Host "Remote 'origin' ajoute : $repoUrl"
} else {
    Write-Host "Remote 'origin' deja configure : $existingRemote"
}

Write-Host "`n=== Ajout et commit des fichiers ===" -ForegroundColor Cyan
git add .
git commit -m "Version initiale de l'application"

Write-Host "`n=== Recuperation du contenu existant sur GitHub ===" -ForegroundColor Cyan
git pull origin main --allow-unrelated-histories --no-rebase

if ($LASTEXITCODE -ne 0) {
    Write-Host "`nUn conflit a peut-etre eu lieu (ex: README.md). Pour garder la version complete du projet :" -ForegroundColor Yellow
    Write-Host "  git checkout --ours README.md"
    Write-Host "  git add README.md"
    Write-Host "  git commit -m 'Fusion : on garde le README complet du projet'"
    Write-Host "Puis relance ce script, ou fais directement : git push -u origin main"
    exit 1
}

Write-Host "`n=== Envoi vers GitHub ===" -ForegroundColor Cyan
git push -u origin main

Write-Host "`n=== Termine ===" -ForegroundColor Green
Write-Host "Une fenetre de connexion GitHub a pu s'ouvrir dans ton navigateur : connecte-toi si demande."
Write-Host "Le depot est maintenant : $repoUrl"
