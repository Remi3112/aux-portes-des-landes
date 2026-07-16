# Script de mise a jour du depot GitHub
# Aux Portes des Landes - Centrale de gestion
# A utiliser a chaque fois que tu veux envoyer les derniers changements sur GitHub.
# Clic droit > Executer avec PowerShell (une fenetre reste ouverte a la fin, tu peux
# lire le resultat avant qu'elle ne se ferme).

$ErrorActionPreference = "Continue"

Write-Host "=== Nettoyage des verrous Git eventuels ===" -ForegroundColor Cyan
Remove-Item ".git\index.lock" -ErrorAction SilentlyContinue
Remove-Item ".git\HEAD.lock" -ErrorAction SilentlyContinue
Get-ChildItem ".git" -Filter "*.lock.bak*" -ErrorAction SilentlyContinue | Remove-Item -ErrorAction SilentlyContinue

Write-Host "`n=== Etat actuel du depot ===" -ForegroundColor Cyan
git status --short

Write-Host "`n=== Ajout de tous les changements ===" -ForegroundColor Cyan
git add -A

$hasChanges = git diff --cached --name-only
if (-not $hasChanges) {
    Write-Host "Aucun changement a envoyer (le depot est deja a jour)." -ForegroundColor Yellow
} else {
    Write-Host "`n=== Commit ===" -ForegroundColor Cyan
    $msg = Read-Host "Message de commit (laisse vide pour un message par defaut)"
    if (-not $msg) { $msg = "Mise a jour" }
    git commit -m "$msg"
}

Write-Host "`n=== Envoi vers GitHub ===" -ForegroundColor Cyan
git push origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n=== Termine : le depot GitHub est a jour ===" -ForegroundColor Green
} else {
    Write-Host "`n=== Le push a echoue, voir le message d'erreur ci-dessus ===" -ForegroundColor Red
}

Write-Host "`nAppuie sur Entree pour fermer cette fenetre..."
Read-Host | Out-Null
