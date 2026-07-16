"use strict";
/**
 * Stockage interne — fichier JSON unique (data/db.json).
 * Pas de base de données externe, pas de dépendance native : ce fichier
 * est le "système de stockage interne" de l'application (utilisateurs,
 * intégrations, journal d'activité, messages Slack en cache).
 *
 * Volontairement simple (lecture/écriture synchrone) : adapté à un usage
 * interne petite équipe. Le fichier data/db.json ne doit JAMAIS être
 * poussé sur GitHub (voir .gitignore) car il contient les jetons
 * d'intégration et les mots de passe hashés.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = path.join(__dirname, "..", "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

function defaultData() {
  return {
    version: 2,
    users: [],
    integrations: {
      airtable: { token: "", baseId: "", connected: false },
      // "channels" : liste de canaux Slack connectes en meme temps, ex.
      // [{ id: "C0123456789", name: "#equipe-conciergerie" }, ...]
      // Tous accessibles depuis le meme ecran "Messagerie Slack" de l'appli,
      // via un selecteur de canal.
      slack: { botToken: "", channels: [], connected: false },
      ai: { provider: "anthropic", apiKey: "", model: "claude-haiku-4-5-20251001", connected: false },
      // Compte Gmail (mot de passe d'application) utilise pour envoyer les
      // emails de validation de compte a l'inscription (voir src/email.js).
      email: { user: "", appPassword: "", fromName: "Aux Portes des Landes", connected: false },
    },
    activityLog: [],
    slackMessagesCache: [],
    // Modeles de messages WhatsApp reutilisables (Parametres > Modeles WhatsApp).
    // Placeholders disponibles dans "body" : {{prenom}} {{nom}} {{logement}}
    // {{checkin}} {{checkout}} {{lien_formulaire}} — remplaces cote frontend
    // au moment de composer le message pour un contact precis. Chaque modele
    // a un "audience" (voyageur/prestataire/proprietaire/collaborateur/tous)
    // qui determine dans quel(s) composeur(s) WhatsApp il apparait (meme
    // principe que "audience" sur formLinks juste en dessous).
    //
    // Attention : {{prenom}} et {{checkin}}/{{checkout}} ne sont pas toujours
    // renseignes selon la fiche source (ex. Proprietaires n'a qu'un champ
    // "Nom - Prenom" combine, sans prenom separe) — fillTemplate() laisse le
    // texte "{{xxx}}" tel quel si la valeur est absente, donc les modeles
    // "proprietaire" et "prestataire" evitent volontairement {{prenom}} et
    // {{checkin}}/{{checkout}}.
    whatsappTemplates: [
      // --- Voyageurs ---
      { id: "tpl-bienvenue", name: "Bienvenue avant l'arrivee", audience: "voyageur", body: "Bonjour {{prenom}}, merci pour votre reservation chez {{logement}} ! Nous avons hate de vous accueillir le {{checkin}}. Voici le formulaire d'accueil a completer avant votre arrivee : {{lien_formulaire}}\nN'hesitez pas si vous avez la moindre question 😊" },
      { id: "tpl-checkin", name: "Instructions d'arrivee", audience: "voyageur", body: "Bonjour {{prenom}}, votre logement {{logement}} est pret ! Voici les instructions d'acces : [a completer]. Bon sejour !" },
      { id: "tpl-checkout", name: "Rappel avant le depart", audience: "voyageur", body: "Bonjour {{prenom}}, petit rappel : votre check-out est prevu le {{checkout}}. Merci de laisser les cles a l'endroit convenu. Merci pour votre sejour chez {{logement}} !" },
      { id: "tpl-avis", name: "Demande d'avis apres le sejour", audience: "voyageur", body: "Bonjour {{prenom}}, nous esperons que votre sejour chez {{logement}} s'est bien passe ! Si vous avez apprecie, cela nous aiderait beaucoup que vous laissiez un avis. Merci encore et a bientot !" },
      { id: "tpl-voyageur-confirmation", name: "Confirmation de reservation", audience: "voyageur", body: "Bonjour {{prenom}}, votre reservation chez {{logement}} est bien confirmee, avec une arrivee prevue le {{checkin}}. Nous revenons vers vous prochainement avec toutes les informations utiles. A tres bientot !" },
      { id: "tpl-voyageur-urgence", name: "Probleme pendant le sejour", audience: "voyageur", body: "Bonjour {{prenom}}, nous avons bien pris en compte votre message concernant {{logement}}. Nous nous en occupons au plus vite et revenons vers vous tres rapidement. Merci de votre patience !" },
      // --- Proprietaires (pas de {{prenom}} : certaines fiches n'ont qu'un nom complet) ---
      { id: "tpl-proprio-nouvelle-reservation", name: "Nouvelle reservation recue", audience: "proprietaire", body: "Bonjour {{nom}}, bonne nouvelle : une nouvelle reservation vient d'etre enregistree pour votre logement {{logement}}. Nous vous tiendrons informe(e) a l'approche du sejour. Belle journee !" },
      { id: "tpl-proprio-rapport-menage", name: "Rapport de menage / etat des lieux", audience: "proprietaire", body: "Bonjour {{nom}}, le menage vient d'etre effectue chez {{logement}}. Tout est en ordre, aucune anomalie a signaler. N'hesitez pas si vous avez la moindre question." },
      { id: "tpl-proprio-bilan", name: "Bilan mensuel d'activite", audience: "proprietaire", body: "Bonjour {{nom}}, voici un point rapide sur l'activite de {{logement}} ce mois-ci. Nous revenons vers vous avec le detail complet (reservations, occupation, revenus). Bonne journee !" },
      { id: "tpl-proprio-incident", name: "Signalement d'un incident", audience: "proprietaire", body: "Bonjour {{nom}}, nous souhaitions vous informer d'un incident survenu au niveau de {{logement}}. Nous revenons vers vous rapidement avec plus de details et la solution proposee." },
      { id: "tpl-proprio-disponibilite", name: "Question sur le logement", audience: "proprietaire", body: "Bonjour {{nom}}, nous avons une question concernant {{logement}} et souhaiterions avoir votre retour quand vous aurez un instant. Merci d'avance !" },
      // --- Prestataires menage (pas de {{checkin}}/{{checkout}} : non disponibles pour ces fiches) ---
      { id: "tpl-prestataire-planning", name: "Rappel d'intervention prevue", audience: "prestataire", body: "Bonjour {{prenom}}, un rappel pour l'intervention menage prevue chez {{logement}}. Merci de nous confirmer votre disponibilite. Merci !" },
      { id: "tpl-prestataire-remplacement", name: "Demande de remplacement urgent", audience: "prestataire", body: "Bonjour {{prenom}}, serait-il possible de faire un menage en urgence chez {{logement}} ? Merci de nous dire au plus vite si vous etes disponible." },
      { id: "tpl-prestataire-confirmation", name: "Confirmation d'intervention", audience: "prestataire", body: "Bonjour {{prenom}}, merci pour l'intervention chez {{logement}} ! Tout est bien note de notre cote. Bonne continuation." },
      { id: "tpl-prestataire-acces", name: "Rappel infos d'acces (boite a cles)", audience: "prestataire", body: "Bonjour {{prenom}}, petit rappel des infos d'acces pour {{logement}} : [code boite a cles a completer]. Merci et bonne intervention !" },
      { id: "tpl-prestataire-paiement", name: "Info paiement de la prestation", audience: "prestataire", body: "Bonjour {{prenom}}, le reglement de votre prestation chez {{logement}} a bien ete traite. N'hesitez pas si vous avez la moindre question. Merci pour votre travail !" },
      // --- Collaborateurs (equipe interne) ---
      { id: "tpl-collab-notif-interne", name: "Notification interne", audience: "collaborateur", body: "Bonjour {{prenom}}, une nouvelle information necessite ton attention. Peux-tu jeter un oeil des que possible ? Merci !" },
      { id: "tpl-collab-rappel-tache", name: "Rappel de tache", audience: "collaborateur", body: "Bonjour {{prenom}}, petit rappel concernant une tache en attente de ton cote. Merci de faire un point quand tu peux." },
      { id: "tpl-collab-planning-equipe", name: "Info planning equipe", audience: "collaborateur", body: "Bonjour {{prenom}}, voici une mise a jour du planning equipe. Merci de en prendre connaissance et de me dire si besoin d'ajustement." },
      { id: "tpl-collab-urgent", name: "Message urgent equipe", audience: "collaborateur", body: "Bonjour {{prenom}}, besoin de toi rapidement sur un sujet en cours. Peux-tu me rappeler ou repondre des que possible ? Merci !" },
      // --- Generique (tous profils) ---
      { id: "tpl-formulaire", name: "Envoi d'un lien de formulaire", audience: "tous", body: "Bonjour {{nom}}, voici le lien du formulaire a completer : {{lien_formulaire}}\nMerci !" },
    ],
    // Version du "seed" par defaut des modeles WhatsApp ci-dessus. Permet a
    // load() de fusionner (une seule fois, de maniere additive) les nouveaux
    // modeles dans les installations DEJA deployees dont data/db.json a un
    // whatsappTemplates plus ancien — sans dupliquer a chaque redemarrage et
    // sans jamais resusciter un modele que l'utilisateur a supprime
    // volontairement (voir migrateWhatsappTemplates() plus bas).
    whatsappTemplatesSeedVersion: 2,
    // Liens vers des formulaires Airtable (Parametres > Liens de formulaires),
    // reutilisables dans les modeles WhatsApp via {{lien_formulaire}}. Chaque
    // lien a un "audience" (voyageur/prestataire/proprietaire/tous) qui
    // determine dans quels composeurs WhatsApp il apparait.
    formLinks: [],
    // Surcharges des droits d'acces par module, definies par l'admin dans
    // Parametres > Droits d'acces (routes/settings.js). Structure :
    // { [tableKey]: { collaborateur: "niveau", prestataire: "niveau" } }.
    // Le profil admin n'est jamais surchargeable. En l'absence d'entree ici,
    // le niveau par defaut de src/tables.js (TABLES[...].roles) s'applique.
    accessOverrides: {},
  };
}

/**
 * Migration retro-compatible : les installations anterieures a la v2
 * stockaient un seul canal Slack (channelId/channelName) directement dans
 * integrations.slack. On le convertit automatiquement en tableau "channels"
 * au premier chargement, sans rien casser pour les gens qui mettent a jour.
 */
function migrateSlackConfig(slackCfg) {
  if (!slackCfg) return { botToken: "", channels: [], connected: false };
  if (Array.isArray(slackCfg.channels)) return slackCfg;
  if (slackCfg.channelId) {
    return {
      botToken: slackCfg.botToken || "",
      channels: [{ id: slackCfg.channelId, name: slackCfg.channelName || slackCfg.channelId }],
      connected: !!slackCfg.connected,
    };
  }
  return { botToken: slackCfg.botToken || "", channels: [], connected: !!slackCfg.connected };
}

/**
 * Migration additive des modeles WhatsApp par defaut (Parametres > Modeles
 * WhatsApp). Une installation deja deployee a un whatsappTemplates deja
 * peuple (ancienne version) : on n'ecrase jamais son contenu, on se contente
 * d'AJOUTER les nouveaux modeles par defaut qui n'existent pas encore (par
 * id), une seule fois par palier de version (whatsappTemplatesSeedVersion).
 * Un modele que l'utilisateur a renomme, modifie ou supprime n'est jamais
 * touche ni resuscite.
 */
function migrateWhatsappTemplates(existingTemplates, storedSeedVersion) {
  const def = defaultData();
  // Cle totalement absente du fichier (installation neuve, ou fichier ecrit
  // par un outil externe sans ce champ) : on part directement de tous les
  // modeles par defaut, plutot que de considerer ca comme "deja a jour".
  if (existingTemplates === undefined) {
    return { templates: def.whatsappTemplates.map((t) => ({ ...t })), seedVersion: def.whatsappTemplatesSeedVersion, changed: true };
  }
  const current = Array.isArray(existingTemplates) ? existingTemplates.slice() : def.whatsappTemplates.map((t) => ({ ...t }));
  const seenIds = new Set(current.map((t) => t.id));
  // Absence de version stockee = installation anterieure a l'ajout de
  // l'audience (palier 1). Un tableau explicitement vide (utilisateur ayant
  // tout supprime) avec une version deja a jour reste vide, volontairement.
  const fromVersion = Number.isInteger(storedSeedVersion) ? storedSeedVersion : 1;
  let changed = false;
  if (fromVersion < def.whatsappTemplatesSeedVersion) {
    def.whatsappTemplates.forEach((tpl) => {
      if (!seenIds.has(tpl.id)) {
        current.push(tpl);
        seenIds.add(tpl.id);
        changed = true;
      }
    });
  }
  // Retro-compatibilite : les modeles crees avant l'ajout du champ "audience"
  // n'en ont pas -> traites comme "tous" (visibles dans tous les composeurs).
  current.forEach((t) => {
    if (!t.audience) t.audience = "tous";
  });
  return { templates: current, seedVersion: def.whatsappTemplatesSeedVersion, changed };
}

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultData(), null, 2), "utf8");
  }
}

function load() {
  ensureFile();
  try {
    const raw = fs.readFileSync(DB_FILE, "utf8");
    const data = JSON.parse(raw);
    // fusion defensive avec les valeurs par defaut si un champ manque (mise a jour de version)
    const def = defaultData();
    const tplMigration = migrateWhatsappTemplates(data.whatsappTemplates, data.whatsappTemplatesSeedVersion);
    const merged = {
      ...def,
      ...data,
      integrations: {
        airtable: { ...def.integrations.airtable, ...(data.integrations && data.integrations.airtable) },
        slack: migrateSlackConfig(data.integrations && data.integrations.slack),
        ai: { ...def.integrations.ai, ...(data.integrations && data.integrations.ai) },
        email: { ...def.integrations.email, ...(data.integrations && data.integrations.email) },
      },
      whatsappTemplates: tplMigration.templates,
      whatsappTemplatesSeedVersion: tplMigration.seedVersion,
      formLinks: Array.isArray(data.formLinks) ? data.formLinks : def.formLinks,
      accessOverrides: (data.accessOverrides && typeof data.accessOverrides === "object" && !Array.isArray(data.accessOverrides)) ? data.accessOverrides : def.accessOverrides,
    };
    // Persiste immediatement si la migration a ajoute de nouveaux modeles,
    // pour ne pas la relancer (et re-detecter des "changements") a chaque
    // simple lecture tant que le fichier n'est pas resauvegarde ailleurs.
    if (tplMigration.changed) {
      fs.writeFileSync(DB_FILE, JSON.stringify(merged, null, 2), "utf8");
    }
    return merged;
  } catch (e) {
    console.error("[db] Erreur de lecture de data/db.json, reinitialisation :", e.message);
    const fresh = defaultData();
    save(fresh);
    return fresh;
  }
}

function save(data) {
  ensureFile();
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf8");
}

function seedAdminIfNeeded() {
  const data = load();
  if (data.users.length === 0) {
    const bcrypt = require("bcryptjs");
    const tempPassword = crypto.randomBytes(4).toString("hex"); // ex: "a1b2c3d4"
    data.users.push({
      id: crypto.randomUUID(),
      username: "admin",
      name: "Administrateur",
      role: "admin",
      passwordHash: bcrypt.hashSync(tempPassword, 10),
      mustChangePassword: true,
      createdAt: new Date().toISOString(),
    });
    save(data);
    console.log("=".repeat(60));
    console.log("Premier demarrage : compte admin cree.");
    console.log("  Identifiant : admin");
    console.log("  Mot de passe temporaire : " + tempPassword);
    console.log("  (Ce mot de passe ne sera plus jamais affiche - change-le des la premiere connexion.)");
    console.log("=".repeat(60));
  }
  return data;
}

function addActivity(entry) {
  const data = load();
  data.activityLog.unshift({ ...entry, at: new Date().toISOString() });
  data.activityLog = data.activityLog.slice(0, 500);
  save(data);
}

/**
 * (Re)seed depuis les variables d'environnement — utile pour un hebergement
 * "gratuit" sans disque persistant (ex: Render free), ou le contenu de
 * data/db.json peut etre efface a chaque redemarrage/reveil du service.
 *
 * N'a AUCUN effet si aucune des variables ci-dessous n'est definie : une
 * installation locale classique (start.bat/start.sh) n'est jamais impactee.
 *
 * Variables reconnues :
 *   ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_NAME
 *     -> (re)cree le compte admin avec ce mot de passe fixe a chaque demarrage,
 *        pour ne jamais rester bloque dehors apres une perte de donnees.
 *   EXTRA_USERS
 *     -> JSON : [{"username":"...","password":"...","name":"...","role":"collaborateur|prestataire","phone":"..."}]
 *        (re)cree ces comptes supplementaires a chaque demarrage.
 *   AIRTABLE_TOKEN, AIRTABLE_BASE_ID
 *   SLACK_BOT_TOKEN, SLACK_CHANNELS ("id1:Nom 1,id2:Nom 2")
 *   ANTHROPIC_API_KEY, ANTHROPIC_MODEL
 *     -> reconnecte automatiquement les integrations correspondantes.
 */
function seedFromEnv() {
  const data = load();
  let changed = false;
  const bcrypt = require("bcryptjs");

  function upsertUser({ username, password, name, role, phone }) {
    if (!username || !password || !role) return;
    const hash = bcrypt.hashSync(password, 10);
    let u = data.users.find((x) => x.username === username);
    if (!u) {
      data.users.push({
        id: crypto.randomUUID(),
        username,
        name: name || username,
        role,
        phone: phone || "",
        passwordHash: hash,
        mustChangePassword: false,
        createdAt: new Date().toISOString(),
      });
      changed = true;
      console.log(`[env] Compte "${username}" (${role}) recree depuis les variables d'environnement.`);
    } else if (!bcrypt.compareSync(password, u.passwordHash)) {
      u.passwordHash = hash;
      u.mustChangePassword = false;
      if (name) u.name = name;
      if (phone) u.phone = phone;
      changed = true;
      console.log(`[env] Mot de passe de "${username}" resynchronise depuis les variables d'environnement.`);
    }
  }

  if (process.env.ADMIN_PASSWORD) {
    upsertUser({
      username: process.env.ADMIN_USERNAME || "admin",
      password: process.env.ADMIN_PASSWORD,
      name: process.env.ADMIN_NAME || "Administrateur",
      role: "admin",
    });
  }

  if (process.env.EXTRA_USERS) {
    try {
      const extra = JSON.parse(process.env.EXTRA_USERS);
      if (Array.isArray(extra)) extra.forEach(upsertUser);
    } catch (e) {
      console.error("[env] EXTRA_USERS invalide (JSON attendu) :", e.message);
    }
  }

  if (process.env.AIRTABLE_TOKEN && process.env.AIRTABLE_BASE_ID) {
    if (
      data.integrations.airtable.token !== process.env.AIRTABLE_TOKEN ||
      data.integrations.airtable.baseId !== process.env.AIRTABLE_BASE_ID
    ) {
      data.integrations.airtable = {
        token: process.env.AIRTABLE_TOKEN,
        baseId: process.env.AIRTABLE_BASE_ID,
        connected: true,
      };
      changed = true;
      console.log("[env] Integration Airtable (re)connectee depuis les variables d'environnement.");
    }
  }

  if (process.env.SLACK_BOT_TOKEN) {
    const channels = (process.env.SLACK_CHANNELS || "")
      .split(",")
      .map((entry) => {
        const [id, name] = entry.split(":");
        return { id: (id || "").trim(), name: (name || id || "").trim() };
      })
      .filter((c) => c.id);
    const same =
      data.integrations.slack.botToken === process.env.SLACK_BOT_TOKEN &&
      JSON.stringify(data.integrations.slack.channels) === JSON.stringify(channels);
    if (!same) {
      data.integrations.slack = {
        botToken: process.env.SLACK_BOT_TOKEN,
        channels,
        connected: channels.length > 0,
      };
      changed = true;
      console.log("[env] Integration Slack (re)connectee depuis les variables d'environnement.");
    }
  }

  if (process.env.ANTHROPIC_API_KEY) {
    const model = process.env.ANTHROPIC_MODEL || data.integrations.ai.model || "claude-haiku-4-5-20251001";
    if (data.integrations.ai.apiKey !== process.env.ANTHROPIC_API_KEY || data.integrations.ai.model !== model) {
      data.integrations.ai = { provider: "anthropic", apiKey: process.env.ANTHROPIC_API_KEY, model, connected: true };
      changed = true;
      console.log("[env] Assistant IA (re)connecte depuis les variables d'environnement.");
    }
  }

  if (process.env.EMAIL_USER && process.env.EMAIL_APP_PASSWORD) {
    const fromName = process.env.EMAIL_FROM_NAME || data.integrations.email.fromName || "Aux Portes des Landes";
    if (
      data.integrations.email.user !== process.env.EMAIL_USER ||
      data.integrations.email.appPassword !== process.env.EMAIL_APP_PASSWORD ||
      data.integrations.email.fromName !== fromName
    ) {
      data.integrations.email = { user: process.env.EMAIL_USER, appPassword: process.env.EMAIL_APP_PASSWORD, fromName, connected: true };
      changed = true;
      console.log("[env] Envoi d'email (re)connecte depuis les variables d'environnement.");
    }
  }

  if (changed) save(data);
  return data;
}

module.exports = { load, save, seedAdminIfNeeded, seedFromEnv, addActivity, DB_FILE, DATA_DIR };
