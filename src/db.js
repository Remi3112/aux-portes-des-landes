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
    // au moment de composer le message pour un contact precis.
    whatsappTemplates: [
      { id: "tpl-bienvenue", name: "Bienvenue avant l'arrivee", body: "Bonjour {{prenom}}, merci pour votre reservation chez {{logement}} ! Nous avons hate de vous accueillir le {{checkin}}. Voici le formulaire d'accueil a completer avant votre arrivee : {{lien_formulaire}}\nN'hesitez pas si vous avez la moindre question 😊" },
      { id: "tpl-checkin", name: "Instructions d'arrivee", body: "Bonjour {{prenom}}, votre logement {{logement}} est pret ! Voici les instructions d'acces : [a completer]. Bon sejour !" },
      { id: "tpl-checkout", name: "Rappel avant le depart", body: "Bonjour {{prenom}}, petit rappel : votre check-out est prevu le {{checkout}}. Merci de laisser les cles a l'endroit convenu. Merci pour votre sejour chez {{logement}} !" },
      { id: "tpl-avis", name: "Demande d'avis apres le sejour", body: "Bonjour {{prenom}}, nous esperons que votre sejour chez {{logement}} s'est bien passe ! Si vous avez apprecie, cela nous aiderait beaucoup que vous laissiez un avis. Merci encore et a bientot !" },
      { id: "tpl-formulaire", name: "Envoi d'un lien de formulaire", body: "Bonjour {{prenom}}, voici le lien du formulaire a completer : {{lien_formulaire}}\nMerci !" },
    ],
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
    const merged = {
      ...def,
      ...data,
      integrations: {
        airtable: { ...def.integrations.airtable, ...(data.integrations && data.integrations.airtable) },
        slack: migrateSlackConfig(data.integrations && data.integrations.slack),
        ai: { ...def.integrations.ai, ...(data.integrations && data.integrations.ai) },
        email: { ...def.integrations.email, ...(data.integrations && data.integrations.email) },
      },
      whatsappTemplates: Array.isArray(data.whatsappTemplates) ? data.whatsappTemplates : def.whatsappTemplates,
      formLinks: Array.isArray(data.formLinks) ? data.formLinks : def.formLinks,
      accessOverrides: (data.accessOverrides && typeof data.accessOverrides === "object" && !Array.isArray(data.accessOverrides)) ? data.accessOverrides : def.accessOverrides,
    };
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
