# Documentation développeur — Aux Portes des Landes / Centrale de gestion

Ce document décrit l'architecture technique de l'application pour quiconque doit
la maintenir ou l'étendre. La documentation utilisateur (installation, connexion
des intégrations, usage courant) est dans `README.md` — ce fichier-ci est le
pendant technique.

---

## 1. Vue d'ensemble

Application web interne, monolithique, servie par un unique serveur Node/Express.
Pas de base de données : Airtable **est** la base de données métier (logements,
réservations, litiges...), et un simple fichier JSON local (`data/db.json`) sert
de "base applicative" (comptes utilisateurs, jetons d'intégration, historique).

Stack :
- **Backend** : Node.js (≥18) + Express 4, sessions via `express-session` avec un
  store fichier maison (`src/fileSessionStore.js`).
- **Frontend** : HTML/CSS/JS vanilla, un seul fichier `public/app.js` (pas de build,
  pas de framework, pas de bundler — servi tel quel par Express en statique).
- **Stockage applicatif** : `data/db.json` (JSON brut, lu/écrit en synchrone).
- **Données métier** : Airtable, via l'API REST officielle (`src/airtable.js`).
- **Intégrations optionnelles** : Slack (Web API), Anthropic (API Claude).

Aucune de ces intégrations n'est un `npm install` de SDK officiel : tout passe par
`fetch()` natif contre les API REST, pour rester sans dépendances superflues.

---

## 2. Démarrage en développement

```bash
npm install
node server.js          # ou : npm start
node test/e2e.js        # suite de tests de bout en bout (voir section 11)
```

Le serveur écoute sur `http://localhost:3000` (configurable via `PORT`).
Au tout premier démarrage (aucun utilisateur dans `data/db.json`), un compte
`admin` est créé et son mot de passe temporaire est imprimé une seule fois dans
la console (`src/db.js` → `seedAdminIfNeeded()`).

---

## 3. Architecture générale

```
Navigateur (public/app.js)
      │  fetch("/api/...", { credentials: "include" })
      ▼
Express (server.js)
  ├─ express-session (cookie de session, store = FileSessionStore)
  ├─ routes/auth.js         → connexion, utilisateurs, mot de passe
  ├─ routes/records.js      → CRUD générique sur les tables Airtable
  ├─ routes/settings.js     → intégrations (Airtable / Slack / IA)
  ├─ routes/slackMessages.js→ messagerie Slack multi-canaux
  ├─ routes/ai.js           → assistant IA (chat)
  ├─ routes/config.js       → schéma des tables + permissions (pour le frontend)
  └─ routes/dashboard.js    → indicateurs agrégés (CA, occupation, activité du jour)
      │
      ├─► src/db.js         → lecture/écriture data/db.json
      ├─► src/airtable.js   → appels REST vers api.airtable.com
      ├─► src/slack.js      → appels REST vers slack.com/api
      ├─► src/ai.js         → appels REST vers api.anthropic.com
      └─► src/tables.js     → schéma statique des 12 tables + règles de permission
```

Aucune route ne parle directement à `fetch()` contre une API externe : tout passe
par les modules `src/*.js` dédiés, qui lisent leur configuration (jetons) depuis
`db.load().integrations`.

---

## 4. Structure des fichiers

```
apdl-app/
├── server.js                 Point d'entrée : middleware, montage des routes, listen()
├── src/
│   ├── db.js                 Stockage JSON (data/db.json) : load/save/seedAdmin/addActivity
│   ├── auth.js                Hash de mot de passe (bcrypt) + middlewares requireAuth/requireAdmin
│   ├── fileSessionStore.js     Store de session express-session (persistance disque)
│   ├── tables.js                Schéma des 12 tables Airtable + permissions par rôle
│   ├── airtable.js               Client REST Airtable (records + schema)
│   ├── slack.js                   Client REST Slack (multi-canaux)
│   ├── ai.js                       Client REST Anthropic
│   └── scope.js                    rawText() (formatage) + scopeForRole() (filtrage prestataire)
├── routes/                   Un routeur Express par domaine (voir section 8)
├── public/
│   ├── index.html            Coquille HTML minimale (un seul <div id="app">)
│   ├── app.js                 Tout le frontend : routing, rendu, appels API
│   └── style.css               Styles
├── test/
│   └── e2e.js                Suite de tests de bout en bout (serveur réel + Airtable/Slack/IA simulés)
├── data/                     Généré au runtime, JAMAIS commité (voir .gitignore)
│   ├── db.json                Utilisateurs, jetons, historique
│   ├── .session-secret         Secret de signature des cookies de session (généré une fois)
│   └── sessions/                Un fichier JSON par session active
├── start.bat / start.sh      Lance le serveur (installe les dépendances si besoin)
└── update.bat / update.sh    git pull + npm install (ne touche jamais data/)
```

---

## 5. Modèle de données applicatif — `data/db.json`

```jsonc
{
  "version": 2,
  "users": [
    { "id": "uuid", "username": "admin", "name": "...", "role": "admin|collaborateur|prestataire",
      "phone": "0612345678", "email": "...", "emailVerified": true,
      "verifyToken": "... (absent une fois verifie)", "verifyTokenExpires": 1234567890,
      "passwordHash": "bcrypt...", "mustChangePassword": true, "createdAt": "ISO" }
  ],
  "integrations": {
    "airtable": { "token": "pat...", "baseId": "app...", "connected": true },
    "slack": { "botToken": "xoxb-...", "channels": [{ "id": "C...", "name": "..." }], "connected": true },
    "ai": { "provider": "anthropic", "apiKey": "sk-ant-...", "model": "claude-haiku-4-5-20251001", "connected": true },
    "email": { "user": "contact@gmail.com", "appPassword": "xxxx xxxx xxxx xxxx", "fromName": "Aux Portes des Landes", "connected": true }
  },
  "activityLog": [ { "type": "login|create|update|delete|integration_saved|...", "user": "...", "at": "ISO", "table": "..." } ],
  "slackMessagesCache": [],  // present pour compat, non utilise activement
  "whatsappTemplates": [
    { "id": "tpl-...", "name": "...", "body": "... {{prenom}} {{logement}} {{lien_formulaire}} ..." }
  ],
  "formLinks": [
    { "id": "uuid", "label": "...", "url": "https://airtable.com/...",
      "audience": "voyageur|prestataire|proprietaire|collaborateur|tous" }
  ],
  "accessOverrides": {
    // surcharges de src/tables.js posees depuis Parametres > Droits d'acces
    "reservations": { "collaborateur": "read" }
  }
}
```

`src/db.js` fait une **fusion défensive** à chaque `load()` : si un champ manque
(mise à jour depuis une ancienne version), il est complété avec les valeurs par
défaut. `migrateSlackConfig()` convertit automatiquement l'ancien format Slack
mono-canal (`{ channelId, channelName }`) vers le nouveau format multi-canaux
(`{ channels: [...] }`) — voir section 9.2. C'est ce mécanisme qui permet de
livrer des mises à jour sans jamais casser une installation existante.

**Jamais toucher `data/db.json` ou `data/.session-secret` à la main** en dehors
de l'application elle-même : ce sont les seuls fichiers qui contiennent des
secrets et l'état réel de l'installation d'un utilisateur.

---

## 6. Le schéma des tables — `src/tables.js`

C'est le fichier central de l'application (~430 lignes). Il décrit, pour chacune
des 12 tables Airtable, une structure `TABLES[key]` :

```js
TABLES.reservations = {
  key: "reservations", tableId: "tblXXXX", label: "Réservations", icon: "📅",
  group: "Voyageurs",
  roles: { admin: "full", collaborateur: "readwrite", prestataire: "none" },
  fields: [ T("fldXXX", "Nom du champ", "typeAirtable"), ... ],   // TOUS les champs de la table
  listCols: [ "fldXXX", ... ],       // colonnes affichées dans la vue liste
  detailFields: [ "fldXXX", ... ],   // champs affichés dans la fiche détail (= tous les champs, en général)
  sensitive: [ "fldXXX" ],           // champs masqués au profil prestataire (RIB, mots de passe...)
  searchCols: [ "fldXXX" ],          // colonnes utilisées par la recherche texte libre
  selfNameFields: [ "fldXXX" ],      // pour scopeForRole() : champs contenant le prénom du prestataire
  prestataireEditable: [ "fldXXX" ], // champs qu'un prestataire peut modifier (sinon lecture seule/refusé)
  prestataireLinkField: "fldXXX",    // alternative a selfNameFields : champ liant l'enreg. au prestataire
};
```

**Field ID vs Field Name.** Tout, côté backend ET frontend, est indexé par
**Field ID** Airtable (`fldXXXXXXXXXXXXXX`), pas par nom de champ. C'est
volontaire : le nom d'un champ peut changer côté Airtable sans rien casser côté
appli, tant que l'ID ne bouge pas. La seule conversion id→nom a lieu juste avant
d'écrire vers Airtable (`fieldsIdToName()`, dans `routes/records.js`), car
l'API Airtable n'accepte que des noms de champ en écriture — voir le commentaire
dans `src/airtable.js`.

**Types de champs reconnus** (`READONLY_TYPES` dans `tables.js`) : tout champ dont
le type est `formula`, `aiText`, `rollup`, `multipleLookupValues`, `button`,
`createdTime`, `createdBy`, `lastModifiedTime`, `autoNumber`,
`multipleAttachments`, `multipleCollaborators`, `singleCollaborator` — ou
`multipleRecordLinks` non reconnu (voir 6.1) — est **calculé côté Airtable** et
donc jamais accepté en écriture, même si un utilisateur malveillant l'inclut
dans une requête (`filterWritableFields()` dans `routes/records.js` l'ignore
silencieusement).

### 6.1 Champs liés (`LINKED_FIELDS`)

Un champ `multipleRecordLinks` pointe vers une autre table Airtable, mais l'API
Airtable ne dit jamais explicitement *quelle* table côté schéma exposé — il faut
le savoir a priori. `LINKED_FIELDS` (fin de `tables.js`) est la liste des champs
liés où la table cible est connue avec certitude :

```js
const LINKED_FIELDS = {
  fld944gpFC9gaCYx2: { table: "menageOccasionnel" },
  fldnxJJ0hn9J73N8G: { table: "logements" },
  fldCzcZMFzz986gUX: { table: "menage" },
  fldtc2y2ocMuqdSzf: { table: "proprietaires" },
  fldf9nI8vEgZqYSSx: { table: "logements" },
  fldYdWzrze257f0HJ: { table: "logements" },
};
```

Pour ces champs uniquement : un vrai sélecteur d'enregistrement est proposé côté
frontend (`GET /api/records/:tableKey/linked/:fieldId`), le champ devient
éditable (exception à `READONLY_TYPES`, voir `isRecognizedLink` dans
`filterWritableFields()`), et son affichage résout l'ID en libellé lisible via
`GET /api/records/:tableKey` → `linkedLabels` (voir `buildLinkedLabels()`).

**Tout champ `multipleRecordLinks` absent de cette liste reste volontairement en
lecture seule** : mieux vaut un champ non éditable qu'un lien créé vers la
mauvaise table par erreur. Pour rendre un nouveau champ lié éditable : ajouter
son Field ID ici avec la bonne table cible, redémarrer, tester.

### 6.2 Permissions par rôle

Trois rôles : `admin`, `collaborateur`, `prestataire`. `roles: {...}` sur chaque
table définit un niveau parmi :

| Niveau       | Lecture | Création | Modification | Suppression |
|--------------|:-------:|:--------:|:-------------:|:-----------:|
| `full`       | ✅ | ✅ | ✅ | ✅ (admin uniquement, voir note) |
| `readwrite`  | ✅ | ✅ | ✅ | ❌ |
| `read`       | ✅ | ❌ | ❌ | ❌ |
| `self`       | ✅ (scopé) | ❌ | ❌ | ❌ |
| `selfWrite`  | ✅ (scopé) | ❌ | ✅ (champs listés dans `prestataireEditable`) | ❌ |
| `none`       | ❌ | ❌ | ❌ | ❌ |

Note : la suppression est **toujours** réservée au rôle `admin`, quel que soit le
niveau de la table — voir `requireAdmin`-like logique dans `can()` (`src/tables.js`)
et le check explicite `role !== "admin"` implicite via `permFor`. `collaborateur`
n'a donc jamais de suppression même avec `full`.

`self`/`selfWrite` déclenchent en plus un **filtrage des lignes** (pas seulement
des droits) via `scopeForRole()` (`src/scope.js`) : un prestataire ne voit que
les enregistrements qui le concernent, détecté soit par `prestataireLinkField`
(un champ lié qui contient son nom), soit par `selfNameFields` (comparaison sur
le prénom du compte utilisateur — **le prénom du compte doit correspondre
exactement au prénom utilisé dans Airtable**, c'est la convention documentée
dans le README utilisateur).

La vérification des permissions est faite **côté serveur** dans chaque route
(`can(role, tableKey, action)`), jamais seulement côté frontend — le frontend
(`can()` dans `app.js`) ne fait que masquer l'UI, ce n'est pas une barrière de
sécurité.

### 6.2.1 Surcharge des droits d'accès à l'exécution

Le niveau par défaut défini dans `TABLES[key].roles` (ci-dessus) peut être
**surchargé sans redéploiement** depuis **Paramètres > Droits d'accès**
(admin uniquement, `routes/settings.js`), stocké dans
`data/db.json → accessOverrides[tableKey][role]`.

```js
const ACCESS_LEVELS = ["full", "readwrite", "read", "self", "selfWrite", "none"];

function getOverride(role, tableKey) {
  if (role === "admin") return null;           // admin jamais surchargeable
  const data = require("./db").load();
  const level = data.accessOverrides?.[tableKey]?.[role];
  return ACCESS_LEVELS.includes(level) ? level : null;
}

function permFor(role, tableKey) {
  const tbl = TABLES[tableKey];
  if (!tbl) return "none";
  return getOverride(role, tableKey) || tbl.roles[role] || "none";
}
```

`permFor()` est le point d'entrée unique utilisé partout (routes, `routes/config.js`
pour exposer le niveau effectif au frontend) — ne jamais lire `TABLES[key].roles[role]`
directement ailleurs, sous peine d'ignorer une surcharge posée par l'admin.
`GET /api/settings/access-rights` renvoie, pour chaque table, `defaultRoles`
(valeur codée en dur), `roles` (valeur effective après surcharge) et
`overridden: {collaborateur, prestataire}` (pour afficher le bouton "↺" côté
frontend uniquement quand une surcharge existe).

⚠️ La surcharge ne change **que le niveau de droit** (full/readwrite/read/...),
jamais le filtrage ligne par ligne de `scopeForRole()` : sur une table sans
`prestataireLinkField`/`selfNameFields`, donner un niveau à `prestataire` lui
donne accès à tous les enregistrements, pas seulement les siens.

---

### 6.3 Config WhatsApp par table — `waConfig`

Comme `LINKED_FIELDS`, `waConfig` est une propriété optionnelle ajoutée sur
certaines entrées de `TABLES` (`proprietaires`, `prospects`, `menage`,
`menageOccasionnel`, `reservations`, `avis`, `artisans`). Elle décrit quels
Field IDs contiennent le numéro de téléphone, le prénom/nom et le logement
d'un enregistrement, pour permettre de générer un contact WhatsApp générique
sans coder une vue dédiée par table :

```js
TABLES.reservations.waConfig = {
  phone: "fldXXX",       // Field ID du numéro de telephone
  nom: "fldXXX",         // Field ID du nom (ou null)
  prenom: "fldXXX",      // Field ID du prenom (ou null)
  logement: "fldXXX",    // Field ID du logement lie (ou null)
  checkin: "fldXXX",     // optionnel : date d'arrivee
  checkout: "fldXXX",    // optionnel : date de depart
  audience: "voyageur",  // "voyageur" | "prestataire" | "proprietaire"
};
```

Exposé au frontend via `routes/config.js` (`tables[key].waConfig`). Côté
`public/app.js`, `buildContactFromRecord(tbl, rec)` construit un objet
`{id,prenom,nom,phone,logement,checkin,checkout,waUrl,audience}` à partir de
n'importe quel enregistrement et de ce `waConfig` ; `openDetailModal()` s'en
sert pour afficher un bouton **📋 Modèle WhatsApp** dès qu'une fiche a un
`waConfig` avec un téléphone renseigné. La même fonction alimente le hub
**Messagerie WhatsApp** (section 9.5).

Pour ajouter le bouton WhatsApp à une nouvelle table : ajouter `waConfig` à
son entrée dans `TABLES`, rien à faire côté frontend.

---

## 7. Authentification & sessions

- Mots de passe hashés avec `bcryptjs` (`src/auth.js`), jamais stockés en clair.
- `requireAuth` : vérifie `req.session.user` existe. `requireAdmin` : vérifie en
  plus `role === "admin"`.
- Sessions signées via cookie `connect.sid`, stockées côté serveur par
  `FileSessionStore` (voir 9.1), avec une durée de vie glissante de 30 jours
  (`rolling: true`, `maxAge: 30j` dans `server.js`).
- `data/.session-secret` est généré une fois (32 octets aléatoires) au premier
  démarrage et sert à signer les cookies — s'il change, toutes les sessions en
  cours sont invalidées (les utilisateurs doivent se reconnecter).

---

## 8. Référence API

Toutes les routes sous `/api/*`, JSON en entrée/sortie, cookie de session requis
sauf mention contraire. Codes d'erreur usuels : `401` non connecté, `403` rôle
insuffisant, `404` ressource/table inconnue, `409` intégration non configurée,
`502` erreur de l'API externe (Airtable/Slack/Anthropic).

### Auth (`routes/auth.js`)
| Méthode & route | Accès | Description |
|---|---|---|
| `POST /api/auth/login` | public | `{username,password,role?}` → connexion |
| `POST /api/auth/logout` | connecté | détruit la session |
| `GET /api/auth/me` | public | session courante ou 401 |
| `POST /api/auth/change-password` | connecté | `{newPassword}` |
| `GET /api/auth/users` | admin | liste des comptes |
| `POST /api/auth/users` | admin | `{username,password,name,role,phone?}` |
| `PATCH /api/auth/users/:id` | admin | `{name?,phone?}` — ne touche jamais username/password/role |
| `DELETE /api/auth/users/:id` | admin | (le compte `admin` est protégé) |
| `GET /api/auth/activity` | admin | 100 dernières entrées du journal |
| `GET /api/auth/team-contacts` | admin/collab | `{id,name,role,phone}` de tous les comptes ayant un téléphone (pour le hub Messagerie WhatsApp) |

Inscription publique et validation par email (aucune session requise) :

| Méthode & route | Accès | Description |
|---|---|---|
| `POST /api/auth/signup` | public | `{username,password,name,email,role,phone?}` — crée un compte non activé et envoie l'email de validation |
| `GET /api/auth/verify-email?token=...` | public | active le compte puis redirige vers `/?verified=1` (ou `0` si jeton invalide/expiré) |
| `POST /api/auth/resend-verification` | public | `{username}` — renvoie un nouveau lien si le compte n'est pas encore activé |

### Enregistrements Airtable (`routes/records.js`)
| Méthode & route | Accès | Description |
|---|---|---|
| `GET /api/records/:tableKey` | selon rôle | liste scopée + `linkedLabels` |
| `GET /api/records/:tableKey/choices/:fieldId` | selon rôle | options d'un champ select (via schéma Airtable, cache 60s) |
| `GET /api/records/:tableKey/linked/:fieldId` | selon rôle | options d'un champ lié reconnu (404 si non reconnu) |
| `POST /api/records/:tableKey` | create | `{fields}` (Field IDs) → notifie Slack si table listée dans `SLACK_NOTIFY_TABLES` |
| `PATCH /api/records/:tableKey/:recordId` | update | `{fields}` |
| `DELETE /api/records/:tableKey/:recordId` | admin | — |

### Intégrations (`routes/settings.js`)
| Méthode & route | Accès | Description |
|---|---|---|
| `GET /api/settings/integrations` | connecté | état + jetons masqués (jamais en clair) |
| `POST /api/settings/integrations/airtable` | admin | `{token,baseId}` — teste puis enregistre |
| `POST /api/settings/integrations/slack` | admin | `{botToken,channels:[{id,name}]}` — dédoublonne par id |
| `POST /api/settings/integrations/ai` | admin | `{apiKey,model?}` |
| `POST /api/settings/integrations/email` | admin | `{user,appPassword,fromName?}` — compte Gmail (mot de passe d'application) pour les emails de validation |
| `DELETE /api/settings/integrations/:name` | admin | `airtable\|slack\|ai\|email` — réinitialise |
| `GET /api/settings/whatsapp-templates` | connecté (équipe) | liste des modèles WhatsApp |
| `POST /api/settings/whatsapp-templates` | admin | `{name,body}` |
| `PUT /api/settings/whatsapp-templates/:id` | admin | `{name?,body?}` |
| `DELETE /api/settings/whatsapp-templates/:id` | admin | — |
| `GET /api/settings/form-links` | connecté (équipe) | liste des liens de formulaires |
| `POST /api/settings/form-links` | admin | `{label,url,audience}` — url doit commencer par `http(s)://` |
| `PUT /api/settings/form-links/:id` | admin | `{label?,url?,audience?}` |
| `DELETE /api/settings/form-links/:id` | admin | — |
| `GET /api/settings/access-rights` | admin | niveau effectif + défaut + `overridden` par table/rôle |
| `PUT /api/settings/access-rights/:tableKey/:role` | admin | `{level}` — `role` ∈ `collaborateur\|prestataire` |
| `DELETE /api/settings/access-rights/:tableKey/:role` | admin | retire la surcharge (retour au défaut) |

### Messagerie Slack (`routes/slackMessages.js`)
| Méthode & route | Accès | Description |
|---|---|---|
| `GET /api/slack/channels` | admin/collab | canaux configurés |
| `GET /api/slack/messages?channel=C...` | admin/collab | 40 derniers messages (canal par défaut = premier configuré) |
| `POST /api/slack/messages` | admin/collab | `{text,channel?}` — signe le message avec le nom de l'expéditeur |

### Assistant IA (`routes/ai.js`)
| Méthode & route | Accès | Description |
|---|---|---|
| `POST /api/ai/chat` | connecté | `{question}` → construit un contexte scopé au rôle, l'envoie à Claude |

### Config & dashboard
| Méthode & route | Accès | Description |
|---|---|---|
| `GET /api/config` | connecté | schéma des tables visibles pour le rôle + `integrationsStatus` (consommé par le frontend au boot) |
| `GET /api/dashboard/summary` | admin/collab | CA, occupation, activité du jour (voir 9.4) |
| `GET /api/version` | public | version de `package.json` |

---

## 9. Sous-systèmes clés

### 9.1 Persistance de session — `src/fileSessionStore.js`

Store `express-session` maison, un fichier JSON par session sous `data/sessions/`.
But : garder les utilisateurs connectés après un redémarrage serveur (mise à jour,
reboot machine), ce que le store mémoire par défaut d'`express-session` ne permet
pas.

Deux précautions non négociables, issues d'un bug réel corrigé en production :

1. **Écritures atomiques.** `set()` écrit dans un fichier temporaire
   (`<sid>.json.<random>.tmp`) puis `fs.rename()` vers la cible — `fs.writeFile`
   seul n'est pas atomique et une lecture concurrente peut tomber sur un fichier
   tronqué.
2. **File d'attente par session (`_enqueue`).** `express-session` déclenche un
   `touch()` (prolongation de durée de vie) en arrière-plan, **sans attendre sa
   fin**, à chaque requête qui ne modifie pas la session (ex: `GET /api/auth/me`).
   Sans sérialisation, la requête suivante sur la même session (ex: logout juste
   après) peut lire ou détruire le fichier *pendant* que l'écriture précédente
   est encore en cours — provoquant soit une déconnexion aléatoire, soit
   l'inverse : une session qui "ressuscite" après une déconnexion parce qu'une
   écriture tardive termine après la suppression. `_enqueue(sid, task)` chaîne
   toutes les opérations (`get`/`set`/`touch`/`destroy`) d'un même `sid` sur une
   `Promise` unique, garantissant un ordre strict.
3. **Repli si suppression impossible.** Sur certains systèmes de fichiers
   (partages réseau, montages particuliers), `fs.unlink` peut échouer avec
   `EPERM` même quand l'écriture fonctionne. `destroy()` retente alors un
   `writeFile("")` du fichier : `get()` traite un contenu vide comme "pas de
   session", donc l'effet (déconnexion) est garanti même sans suppression réelle.

### 9.2 Slack multi-canaux — `src/slack.js`

Un seul jeton bot (`xoxb-...`), plusieurs canaux (`integrations.slack.channels:
[{id,name}]`), tous accessibles depuis le même écran "Messagerie Slack" via un
sélecteur d'onglets côté frontend.

- `postMessage(text, channelId)` / `getRecentMessages(channelId, limit)` opèrent
  sur **un** canal précis (paramètre requis, résolu côté route au canal par
  défaut si absent).
- `notify(text)` diffuse en revanche sur **tous** les canaux configurés
  (`Promise.allSettled`, best-effort — un canal en échec n'empêche pas les
  autres, et n'échoue jamais bruyamment si Slack n'est pas configuré).
- Migration automatique depuis l'ancien format mono-canal : voir
  `migrateSlackConfig()` dans `src/db.js` (section 5).

### 9.3 Boutons de lien automatiques — `public/app.js`

Toute valeur de champ qui EST une URL (Airbnb, WhatsApp/`wa.me`, Booking, Google
Maps, ou autre) est rendue comme un bouton cliquable stylé plutôt qu'un texte/lien
brut, via trois fonctions dans `app.js` :

```js
isUrlLike(str)        // vrai si toute la chaîne (trim) commence par http(s):// ou www.
smartLinkInfo(url)     // devine icône + libellé + classe CSS selon le domaine
linkButtonHtml(url)    // <a class="..."><icône> <libellé></a>
```

`displayValue()` applique ceci pour les types `url`, `formula`, `aiText`, `button`
(champ bouton natif Airtable), et en repli générique pour n'importe quel autre
type de champ texte dont la valeur entière est une URL (sans jamais toucher un
texte qui contient juste une URL au milieu d'une phrase — seule une valeur
*intégralement* une URL est transformée, pour ne jamais casser un champ de notes).
Pour ajouter un nouveau domaine reconnu (icône/libellé dédié), étendre
`smartLinkInfo()`.

### 9.4 Dashboard — `routes/dashboard.js`

Calcule à la volée (pas de cache) à partir des enregistrements Airtable :

- **CA** : somme du champ Tarif (`fldjq1ihzoWPC6wMC`) sur `reservations`, total et
  mois en cours (parsing de date tolérant via `parseDateLoose()`, car le champ
  "Date de check in" est un `singleLineText` côté Airtable, pas un vrai type date).
- **Occupation** : proportion de logements dont "Statut d'occupation" contient
  "occup" (insensible à la casse).
- **Activité du jour** : `today.checkins`/`today.checkouts` = réservations dont
  la date de check-in/check-out tombe aujourd'hui ; `today.menageOccasionnel` =
  remplacements ménage prévus aujourd'hui (`menageOccasionnel`, champ "Date du
  ménage prévu") ; `today.menageTotal` = somme des départs du jour + remplacements
  prévus (en l'absence d'un planning ménage dédié dans Airtable, un départ
  implique un ménage de fin de séjour — c'est l'approximation retenue).
- **Litiges ouverts** : tout enregistrement de `litiges` dont "Mise à jour TODO"
  ne contient aucun des mots-clés de `closedKeywords` (résolu, terminé, clôturé,
  fermé...).

Réservé à `admin`/`collaborateur` (`requireBusinessAccess`), jamais exposé au
profil prestataire.

---

### 9.5 Hub Messagerie WhatsApp — `public/app.js`

Écran centralisé (`ROUTE === "waHub"`, icône 📇, admin + collaborateur) piloté
par `WA_HUB_TABS`, un tableau à 4 entrées :

```js
const WA_HUB_TABS = [
  { key: "proprietaires", label: "Propriétaires", source: "table", tableKey: "proprietaires" },
  { key: "menage",        label: "Agents de ménage", source: "table", tableKey: "menage" },
  { key: "voyageurs",     label: "Voyageurs",     source: "table", tableKey: "reservations" },
  { key: "collaborateurs",label: "Collaborateurs",source: "team" },
];
```

Les onglets `source: "table"` chargent via `GET /api/records/:tableKey` puis
`buildContactFromRecord()` (section 6.3) ; l'onglet `source: "team"` charge
via `GET /api/auth/team-contacts`. `renderWaHub()` / `loadWaHubTab()` /
`renderWaHubList()` gèrent le changement d'onglet, la recherche texte et
l'affichage de la liste ; chaque ligne réutilise `openWaComposer(contact)`
(le même compositeur que le bouton "📋 Modèle WhatsApp" des fiches détail).

---

### 9.6 Inscription publique + validation par email — `src/email.js`, `routes/auth.js`

`POST /api/auth/signup` (public, aucune session requise) cree un compte avec
`emailVerified: false`, un `verifyToken` aleatoire (32 octets hex,
`crypto.randomBytes`) valable 24h, et envoie un email contenant le lien
`GET /api/auth/verify-email?token=...` via `src/email.js` (Gmail SMTP par
`nodemailer`, mot de passe d'application). Si l'envoi echoue, le compte n'est
**pas** enregistre (evite les comptes fantomes impossibles a activer).

`POST /api/auth/login` refuse la connexion (`403`, `code: "EMAIL_NOT_VERIFIED"`)
tant que `emailVerified !== true`. Absence du champ (comptes crees avant cette
fonctionnalite, via `POST /users` par un admin, ou via `EXTRA_USERS`/`seedFromEnv`)
est traitee comme verifie — `publicUser()` calcule `emailVerified: u.emailVerified !== false`,
donc seuls les comptes explicitement `false` (issus de `/signup`) sont bloques.

`POST /api/auth/resend-verification` regenere un jeton pour un compte non
verifie (utile si l'email est perdu/expire). `PATCH /api/auth/users/:id`
accepte en plus un `emailVerified: true` (admin uniquement) : filet de
securite pour activer un compte a la main si l'integration email n'est pas
configuree ou que l'envoi echoue durablement — visible cote frontend via le
bouton "Marquer vérifié" sur les comptes "en attente de validation" dans
Paramètres > Utilisateurs.

`src/email.js` expose `testConnection()` (verifie les identifiants SMTP,
utilise par `POST /api/settings/integrations/email`) et `sendMail()`. En mode
test (`EMAIL_TEST_MODE=1`, positionne par `test/e2e.js`), aucun envoi reel
n'a lieu : le contenu est pousse dans `testOutbox` (tableau expose par le
module) pour que les tests puissent extraire le jeton de validation sans
boite mail reelle.

---

## 10. Frontend — `public/app.js`

Fichier unique, pas de build. Organisation interne (recherche par commentaire de
section `/* ===... === */`) :

1. **`api()`** — wrapper `fetch` (cookies inclus, gestion d'erreur uniforme).
2. **`displayValue()` / `renderInput()` / `readInputValue()`** — trio par type de
   champ Airtable : affichage lecture seule, rendu du `<input>` d'édition, lecture
   de la valeur saisie. Ajouter un nouveau type de champ = ajouter un `case` dans
   ces trois fonctions.
3. **Routing** — variable globale `ROUTE`, `renderApp()` dispatch selon sa valeur
   (`dashboard`, `ai`, `slack`, `faq`, `settings`, ou une clé de table).
4. **`renderTableView()` / `renderRowsInto()` / `openDetailModal()`** — vue liste
   générique + fiche détail/édition générique, pilotées par `CONFIG.tables[key]`
   (reçu de `GET /api/config`) : ajouter une table côté `tables.js` suffit à la
   faire apparaître dans l'UI, sans toucher au frontend.
5. **`renderSettings()`** — gestion dynamique des intégrations (dont l'éditeur
   multi-lignes de canaux Slack) et des utilisateurs.
6. **`renderContacts()` / `waLinkFromPhone()` / `waButtonHtml()`** — vue Contacts
   voyageurs avec lien WhatsApp direct.
7. **`exportRecordsToCsv()`** — export CSV côté client (BOM UTF-8 pour Excel/FR).
8. **`pwField()` / `.pwToggleBtn`** — champ mot de passe avec icône œil
   (afficher/masquer), utilisé partout où un mot de passe est saisi.
9. **`buildContactFromRecord()` / `openWaComposer()`** — construisent un
   contact WhatsApp générique depuis n'importe quel enregistrement ayant un
   `waConfig` (section 6.3), et ouvrent le compositeur de message (choix du
   modèle, choix du lien de formulaire filtré par `audience`, aperçu
   éditable, bouton "Ouvrir WhatsApp").
10. **`renderWaHub()` / `loadWaHubTab()` / `renderWaHubList()`** — écran
    Messagerie WhatsApp centralisé (section 9.5).
11. **`accessPill()` / `accessCell()`** — rendu de la page Droits d'accès
    (sélecteurs de niveau + bouton de réinitialisation par table/rôle).

`CONFIG` (résultat de `GET /api/config`) est la source de vérité côté frontend
pour savoir quelles tables/champs/permissions afficher — il reflète directement
`src/tables.js` + le rôle de l'utilisateur connecté.

---

## 11. Tests — `test/e2e.js`

Suite de bout en bout unique (`node test/e2e.js`), 123 assertions. Lance le
**vrai** serveur Express (vraie session, vrai bcrypt, vrai stockage JSON) sur le
port 3999, et intercepte `globalThis.fetch` pour simuler Airtable/Slack/Anthropic
(aucun appel réseau réel) — seuls les appels vers `localhost:3999` passent par le
vrai `fetch`. Réinitialise `data/db.json` et `data/sessions/` au démarrage.

Couvre : authentification et rôles, visibilité des tables par profil, intégrations
(Airtable/Slack multi-canaux/IA), lecture/création/modification/suppression avec
scoping, notifications Slack automatiques, sélecteurs de champs liés, assistant
IA, messagerie Slack multi-canaux, dashboard (CA, occupation, activité du jour),
modèles WhatsApp et liens de formulaires (CRUD + permissions + audience),
droits d'accès (lecture, surcharge, réinitialisation, niveaux invalides),
contacts d'équipe et téléphone sur les comptes utilisateurs, inscription
publique et validation par email (signup, doublons, jeton invalide/valide,
renvoi, activation manuelle par un admin), et l'invalidation de session après
déconnexion.

**Toujours relancer `node test/e2e.js` après une modification** de `src/tables.js`,
`routes/*.js` ou `src/fileSessionStore.js` avant de livrer — c'est le seul filet
de sécurité automatisé du projet.

---

## 12. Ops

- `start.bat`/`start.sh` : `npm install` si `node_modules/` absent, puis
  `npm start`.
- `update.bat`/`update.sh` : `git pull` + `npm install`. Ne touchent jamais
  `data/` (exclu de Git via `.gitignore` : `data/db.json`, `data/.session-secret`,
  `data/sessions/`).
- Aucune dépendance native, aucune base de données à provisionner : le seul
  prérequis est Node.js ≥18.
- Le serveur écoute par défaut sur `localhost:3000` uniquement (pas d'exposition
  réseau par défaut).

---

## 13. Guides pratiques

**Ajouter une table Airtable à l'application.** Ajouter une entrée dans `TABLES`
(`src/tables.js`) avec tous ses champs (`T(fieldId, nom, type)`), ses colonnes de
liste/détail/recherche, et ses permissions par rôle ; l'ajouter à `TABLE_ORDER`.
Rien à faire côté frontend (rendu générique piloté par `CONFIG`).

**Ajouter un champ à une table existante.** L'ajouter dans `fields`, puis dans
`listCols`/`detailFields`/`searchCols` selon où il doit apparaître.

**Rendre un champ lié éditable.** Ajouter son Field ID dans `LINKED_FIELDS` avec
la bonne table cible (section 6.1) — jamais sans être sûr de la table cible.

**Ajouter un nouveau domaine de lien reconnu (bouton stylé)** : étendre
`smartLinkInfo()` dans `public/app.js` (section 9.3).

**Ajouter un indicateur au dashboard** : l'ajouter dans le payload JSON de
`GET /api/dashboard/summary` (`routes/dashboard.js`), puis dans le rendu de
`loadRevenueSummary()` (`public/app.js`).

**Déclencher une notification Slack automatique sur une nouvelle table** :
ajouter la clé de la table à `SLACK_NOTIFY_TABLES` (`src/tables.js`).
