# Aux Portes des Landes — Centrale de gestion

Application interne connectée en direct à la base Airtable de la conciergerie,
avec messagerie Slack multi-canaux, tableau de bord et assistant IA. Fonctionne
sur ton propre ordinateur (ou un petit serveur), sans dépendre d'un service tiers.

- 3 profils de connexion : **Admin**, **Collaborateur**, **Prestataire ménage**
- Lecture / création / modification / suppression des enregistrements Airtable
  (jamais de modification des tables ou colonnes elles-mêmes)
- Formulaires complets : tous les champs disponibles dans Airtable sont
  visibles et modifiables (y compris les liens vers d'autres enregistrements,
  quand ils sont pris en charge — voir section 9)
- Tableau de bord : CA en cours (total + mois en cours), taux d'occupation,
  litiges ouverts, ménages en attente de confirmation
- Contacts voyageurs avec bouton d'envoi WhatsApp en un clic
- Export CSV et filtre rapide par statut sur chaque table
- Messagerie d'équipe Slack, avec plusieurs canaux accessibles depuis le même écran
- Assistant IA connecté aux données Airtable
- Connexion automatiquement conservée après un redémarrage ou une mise à jour
  (voir section 8)
- Mot de passe masqué/affiché en un clic (icône œil) sur tous les champs mot
  de passe, et lien **Mot de passe oublié ?** sur l'écran de connexion
- Modèles de messages WhatsApp réutilisables et liens de formulaires Airtable
  prêts à copier/partager (voir section 11)
- Droits d'accès par profil réglables depuis les Paramètres, sans toucher au
  code (voir section 12)
- Messagerie WhatsApp centralisée : Propriétaires, Agents de ménage,
  Voyageurs, Collaborateurs (voir section 13)
- Création de compte en libre-service (Admin, Collaborateur, Prestataire
  ménage) avec validation par email avant la première connexion (voir
  section 15)
- Toutes les données de connexion (jetons Airtable/Slack/IA, utilisateurs)
  restent stockées **uniquement sur ton poste**, dans `data/db.json`

---

## 1. Installation (une seule fois)

### Prérequis
Installer **Node.js** (version 18 ou plus récente) : https://nodejs.org (choisir la version "LTS").
Pour vérifier que c'est installé, ouvre un terminal (Invite de commandes sous Windows) et tape :
```
node -v
```

### Récupérer le projet
Si le projet est sur GitHub :
```
git clone <URL-DU-DEPOT-GITHUB>
cd apdl-app
```
Sinon, décompresse simplement le dossier reçu et ouvre un terminal dedans.

### Lancer l'application
- **Windows** : double-clique sur `start.bat`
- **Mac / Linux** : dans un terminal, `chmod +x start.sh && ./start.sh`

La première fois, l'installation des dépendances peut prendre 1 à 2 minutes.
Une fois démarré, le terminal affiche :
```
→ Ouvre ton navigateur sur http://localhost:3000
```
Ouvre cette adresse dans ton navigateur (Chrome, Edge, Firefox...).

### Premier accès administrateur
Au tout premier démarrage, un compte admin est créé automatiquement et son
**mot de passe temporaire s'affiche une seule fois dans le terminal** :
```
Premier demarrage : compte admin cree.
  Identifiant : admin
  Mot de passe temporaire : XXXXXXXX
```
Note-le, connecte-toi, puis change immédiatement ce mot de passe dans
**Paramètres > Mon compte**.

### Mot de passe perdu / oublié
Si tu n'as plus accès à un compte (mot de passe temporaire perdu, oublié...),
pas besoin de tout réinstaller : lance le script de réinitialisation à la
racine du projet.
- **Windows** : double-clique sur `reset-password.bat`
- **Mac / Linux** : `./reset-password.sh`

Il te demande l'identifiant du compte concerné puis un nouveau mot de passe,
et l'enregistre directement dans `data/db.json` (le même fichier que le
serveur utilise). Ce fichier n'est **jamais touché par une mise à jour**
(`update.bat`/`update.sh` ne font que `git pull` + `npm install`, jamais sur
le dossier `data/`) : le mot de passe choisi reste donc valable après
n'importe quelle mise à jour future.

---

## 2. Connecter Airtable (obligatoire)

1. Connecte-toi en admin, va dans **Paramètres > Intégrations**.
2. Crée un jeton d'accès personnel Airtable : https://airtable.com/create/tokens
   - Scopes à cocher : `data.records:read`, `data.records:write`, `schema.bases:read`
   - Accès : sélectionne la base "Conciergerie Aux portes des landes"
3. Copie le jeton (commence par `pat...`) dans le champ **Jeton (PAT)**.
4. Renseigne le **Base ID** (visible dans l'URL Airtable de la base, commence par `app...`).
5. Clique sur **Tester & enregistrer**.

## 3. Connecter Slack — multi-canaux (optionnel)

L'application peut publier les notifications et permettre d'échanger sur
**plusieurs canaux Slack en même temps**, tous accessibles depuis le même
écran **Messagerie Slack** grâce à un sélecteur de canal en haut de l'écran.

1. Va sur https://api.slack.com/apps → **Create New App** → **From scratch**.
2. Dans **OAuth & Permissions**, ajoute les scopes Bot Token suivants :
   `chat:write`, `channels:history`, `channels:read` (ou `groups:history`/`groups:read` si canal privé).
3. Installe l'app sur ton espace de travail, copie le **Bot User OAuth Token** (`xoxb-...`).
4. Invite le bot dans **chaque canal** que tu veux connecter (`/invite @nom-du-bot` dans Slack).
5. Récupère l'**ID de chaque canal** (clic droit sur le canal > Afficher les détails > tout en bas,
   ou en bas de la fenêtre "À propos du canal").
6. Dans **Paramètres > Intégrations > Slack** :
   - Renseigne le jeton bot une seule fois.
   - Ajoute une ligne par canal (ID + nom facultatif pour l'affichage), avec le
     bouton **+ Ajouter un canal**.
   - Clique sur **Tester & enregistrer** : tous les canaux sont vérifiés ensemble.
7. Dans l'écran **Messagerie Slack**, un onglet apparaît pour chaque canal
   configuré ; les notifications automatiques (nouveaux litiges, etc.) sont
   envoyées sur **tous** les canaux configurés.

## 4. Connecter l'assistant IA (optionnel)

1. Crée une clé API sur https://console.anthropic.com (section API Keys).
2. Colle-la dans **Paramètres > Intégrations > Assistant IA**, teste, enregistre.

---

## 5. Créer les comptes de l'équipe

Dans **Paramètres > Utilisateurs** (admin uniquement) :
- Crée un compte **Collaborateur** pour chaque membre de l'équipe interne.
- Crée un compte **Prestataire ménage** pour chaque agent de ménage — utilise
  **exactement le même prénom** que dans la table Airtable "Agents de ménage"
  pour que son planning s'affiche automatiquement.

Chaque nouvel utilisateur doit changer son mot de passe temporaire à la
première connexion (Paramètres > Mon compte).

---

## 6. Mettre à jour l'application

Quand une nouvelle version est disponible sur GitHub :
- **Windows** : double-clique sur `update.bat`
- **Mac / Linux** : `./update.sh`

Cela récupère le code le plus récent (`git pull`) et met à jour les
dépendances (`npm install`). Tes données (utilisateurs, jetons, historique,
connexions actives) ne sont jamais touchées : elles vivent dans `data/db.json`
et `data/sessions/`, qui ne sont pas suivis par Git. Redémarre ensuite le
serveur — tout le monde reste connecté (voir section 8).

---

## 7. Sécurité — bon à savoir

- Les mots de passe sont hashés (bcrypt) côté serveur — jamais stockés en clair.
- Les jetons Airtable/Slack/IA restent sur le serveur ; le navigateur ne les
  voit jamais (seul un aperçu masqué est affiché en Paramètres).
- `data/db.json` contient des secrets : ne le partage jamais, ne le commit
  jamais sur GitHub (déjà exclu par `.gitignore`).
- Par défaut, l'application écoute sur `localhost:3000` (accessible uniquement
  depuis cet ordinateur). Pour un accès en réseau local ou distant, une
  réflexion supplémentaire sur la sécurité (HTTPS, pare-feu, VPN) est nécessaire
  — demande conseil avant d'exposer ce serveur sur Internet.

---

## 8. Rester connecté (persistance de session)

Les connexions sont conservées automatiquement pendant **30 jours**, même
après un redémarrage du serveur, une mise à jour (`update.bat`/`update.sh`)
ou un redémarrage de l'ordinateur : il n'est pas nécessaire de se reconnecter
à chaque fois. Techniquement, chaque connexion est enregistrée dans un petit
fichier sous `data/sessions/` (jamais suivi par Git, jamais partagé) — ce
dossier ne doit pas être modifié ou supprimé manuellement.

Pour te déconnecter volontairement (poste partagé, fin de journée...),
utilise le bouton **Déconnexion** de l'application.

---

## 9. Tableau de bord et contacts voyageurs

- **Tableau de bord** (accueil, admin et collaborateurs) : CA total et CA du
  mois en cours (calculé depuis le tarif des réservations), taux d'occupation
  des logements, nombre de litiges ouverts, nombre de ménages occasionnels en
  attente de confirmation. Non visible par le profil Prestataire ménage.
- **Contacts voyageurs** : liste des voyageurs (réservations) avec un bouton
  WhatsApp qui ouvre directement une conversation pré-remplie avec le bon
  numéro.
- **Export CSV** : sur chaque table, un bouton permet d'exporter la liste
  affichée (avec les filtres actifs) au format CSV, compatible Excel.
- **Filtre rapide** : un menu déroulant en haut de chaque table permet de
  filtrer instantanément par statut (quand la table en a un).

## 10. Champs liés (enregistrements liés à d'autres tables)

Certains champs Airtable (par exemple "Prestataire à remplacer", "Logements
assignés", "Propriétaire") pointent vers des enregistrements d'une autre
table. Pour les champs où la table cible est connue avec certitude,
l'application propose un vrai sélecteur (recherche + choix dans une liste).
Les autres champs de ce type restent affichés en lecture seule par mesure de
sécurité, pour ne jamais risquer de lier un enregistrement à la mauvaise
table.

---

## 11. Modèles WhatsApp et liens de formulaires

Dans **Paramètres > Modèles WhatsApp**, crée, modifie ou supprime des messages
prêts à envoyer aux voyageurs (bienvenue, instructions d'arrivée, rappel de
départ, demande d'avis...). Utilise les variables `{{prenom}}` `{{nom}}`
`{{logement}}` `{{checkin}}` `{{checkout}}` `{{lien_formulaire}}` : elles sont
remplacées automatiquement par les vraies valeurs au moment d'envoyer le
message.

Dans **Paramètres > Liens de formulaires**, enregistre les liens de tes
formulaires Airtable (état des lieux, fiche d'accueil...). Chaque lien a un
**public visé** (voyageur / prestataire ménage / propriétaire / collaborateur
/ tous) qui détermine dans quels modèles WhatsApp il apparaît. Le bouton
"Copier" met le lien dans le presse-papiers.

Sur n'importe quelle fiche ayant un numéro de téléphone (voyageur,
propriétaire, agent de ménage...), un bouton **📋 Modèle WhatsApp** ouvre un
compositeur : choisis un modèle, ajoute si besoin un lien de formulaire,
ajuste le texte, puis clique sur "Ouvrir WhatsApp" — la conversation s'ouvre
déjà pré-remplie avec le bon numéro.

## 12. Droits d'accès par profil

Dans **Paramètres > Droits d'accès** (admin uniquement), règle le niveau
d'accès de chaque profil (Collaborateur, Prestataire ménage) sur chaque
table, sans toucher au code : Accès complet, Lecture/écriture, Lecture seule,
Aucun accès, etc. Le bouton "↺" réinitialise une case au réglage par défaut.
Le profil Administrateur a toujours accès complet, ce réglage n'est pas
modifiable.

⚠️ Sur les tables sans lien direct vers un prestataire, donner un accès à un
Prestataire ménage lui donne accès à **tous** les enregistrements de cette
table, pas seulement les siens (voir section 6.2 du guide développeur).

## 13. Messagerie WhatsApp (vue centralisée)

L'écran **📇 Messagerie WhatsApp** (admin et collaborateurs) regroupe tous les
contacts ayant un numéro de téléphone, classés par onglet : Propriétaires,
Agents de ménage, Voyageurs, Collaborateurs. La recherche retrouve rapidement
une personne, et le bouton **Modèle** ouvre directement le compositeur
WhatsApp pour elle.

Pour qu'un collaborateur apparaisse dans l'onglet Collaborateurs, renseigne
son numéro de téléphone dans **Paramètres > Utilisateurs**.

---

## 14. Création de compte en libre-service (validation par email)

En plus des comptes créés manuellement par un admin (section 5), n'importe
qui disposant du lien de l'application peut créer son propre compte via
**Créer un compte** sur l'écran de connexion — y compris un compte
Administrateur. Le compte reste **inutilisable tant que l'adresse email n'a
pas été confirmée** : un email avec un lien de validation (valable 24h) est
envoyé automatiquement.

### Configuration requise (une seule fois, admin)

Dans **Paramètres > Intégrations > Email**, renseigne un compte Gmail :

1. Active la validation en deux étapes sur ce compte Google si ce n'est pas
   déjà fait (myaccount.google.com/security).
2. Génère un **mot de passe d'application** :
   myaccount.google.com/apppasswords → choisis "Autre" comme application,
   donne-lui un nom (ex: "Aux Portes des Landes"), copie le mot de passe
   généré (16 caractères).
3. Renseigne l'adresse Gmail et ce mot de passe (pas le mot de passe habituel
   du compte Google) dans Paramètres > Intégrations > Email, puis **Tester &
   enregistrer**.

Tant que cette intégration n'est pas configurée, les inscriptions échouent
avec un message clair invitant à contacter un administrateur.

### Si l'email de validation n'arrive pas

- La personne peut cliquer sur **Renvoyer l'email de validation** après une
  tentative de connexion infructueuse sur son propre compte.
- Un admin peut aussi activer le compte manuellement depuis **Paramètres >
  Utilisateurs** (bouton **Marquer vérifié** sur les comptes "en attente de
  validation") — utile si l'email n'a pas pu partir ou a été perdu.

---

## 15. Déploiement en ligne (lien accessible sans installation)

Pour donner un simple lien (URL) que chacun peut ouvrir dans son navigateur
sans installer Node ni cloner le dépôt, l'application doit tourner en
permanence sur un serveur en ligne plutôt que sur ton ordinateur.

### Option retenue : Render.com, plan gratuit

⚠️ **Le plan gratuit de Render n'a pas de disque persistant.** Le contenu de
`data/db.json` (comptes créés dans l'appli, modèles WhatsApp modifiés, liens
de formulaires, droits d'accès personnalisés...) peut être **réinitialisé** à
chaque fois que le service redémarre (mise en veille après inactivité,
redéploiement...). Pour que ce ne soit pas bloquant, les réglages essentiels
peuvent être **restaurés automatiquement à chaque démarrage** via des
variables d'environnement (voir plus bas) : le compte admin et les
intégrations Airtable/Slack/IA ne sont donc jamais perdus, même après une
réinitialisation. Les comptes créés à la main depuis l'écran **Utilisateurs**
(en dehors de `EXTRA_USERS`), ainsi que les modèles WhatsApp/liens de
formulaires/droits d'accès modifiés depuis l'appli, eux, ne survivent pas à
une réinitialisation sur le plan gratuit.

### Étapes

1. Crée un compte sur [render.com](https://render.com) (gratuit).
2. **New +** → **Blueprint** → connecte ton dépôt GitHub
   `aux-portes-des-landes`. Render détecte automatiquement `render.yaml` à la
   racine du projet et propose de créer le service.
3. Avant de déployer, renseigne dans les variables d'environnement (Render te
   les demande, ou Paramètres > Environment une fois le service créé) :
   - `AIRTABLE_TOKEN`, `AIRTABLE_BASE_ID` (voir section 2)
   - `SLACK_BOT_TOKEN`, `SLACK_CHANNELS` au format `id1:Nom 1,id2:Nom 2` (optionnel, voir section 3)
   - `ANTHROPIC_API_KEY` (optionnel, voir section 4)
   - `EXTRA_USERS` (optionnel) : comptes équipe à recréer automatiquement à
     chaque démarrage, au format JSON, par exemple :
     ```json
     [{"username":"julie","password":"MotDePasse123","name":"Julie","role":"collaborateur","phone":"0600000000"}]
     ```
   - `ADMIN_PASSWORD` est généré automatiquement par Render (visible dans
     l'onglet **Environment** du service) — c'est le mot de passe du compte
     `admin`, toujours valable même après une réinitialisation.
4. Clique sur **Deploy**. Render donne une URL du type
   `https://apdl-centrale-gestion.onrender.com` — c'est ce lien qu'il faut
   partager, aucune installation nécessaire côté utilisateur.
5. Le service se redéploie automatiquement à chaque `git push` sur `main`
   (voir `push-update.ps1`).

### Limite importante à connaître

Sur le plan gratuit, le service se met en veille après 15 minutes sans
requête : le premier chargement après une veille peut prendre 30 à 60
secondes (le temps que le service se réveille). Pour un usage plus
professionnel (équipe qui l'utilise toute la journée, données qui doivent
absolument persister), il faudra passer sur un plan payant avec disque
persistant (~7$/mois) — demande-moi si tu veux basculer dessus plus tard.

---

## Structure du projet

```
apdl-app/
├── server.js              point d'entrée du serveur
├── src/
│   ├── db.js               stockage interne (fichier JSON)
│   ├── auth.js              authentification (hash, middlewares)
│   ├── fileSessionStore.js   persistance des connexions (fichiers)
│   ├── tables.js              schéma Airtable + permissions par rôle
│   ├── airtable.js             client API Airtable
│   ├── slack.js                  client API Slack (multi-canaux)
│   ├── ai.js                      client API Anthropic (assistant IA)
│   └── scope.js                    filtrage des données par rôle
├── routes/                 endpoints /api/* (dont /api/dashboard)
├── public/                 frontend (HTML/CSS/JS)
├── data/                   données locales (généré automatiquement, ignoré par Git)
│   ├── db.json              utilisateurs, jetons, historique
│   └── sessions/             connexions actives (persistance)
├── start.bat / start.sh     lancer l'application
└── update.bat / update.sh    mettre à jour l'application
```

## Support

Pour toute question sur le fonctionnement des tables Airtable elles-mêmes,
consulte les descriptions ajoutées directement dans Airtable (visibles en
survolant chaque table/champ), ou l'onglet **Aide / FAQ** de l'application.
