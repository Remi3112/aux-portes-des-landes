"use strict";
/**
 * Test de bout en bout : lance le VRAI serveur Express (vraies sessions,
 * vrai hachage bcrypt, vrai stockage JSON) et simule Airtable / Slack /
 * Anthropic en interceptant fetch(). Utilise le vrai client HTTP (fetch)
 * pour appeler le serveur, comme le ferait un navigateur.
 *
 * Outil de QA interne : verifie que l'authentification, les permissions par
 * role, le multi-canaux Slack, les liens vers enregistrements et le
 * tableau de bord fonctionnent, avec Airtable/Slack/IA simules (aucun
 * appel reseau reel). A lancer avec : node test/e2e.js
 */
process.env.PORT = "3999";
process.env.EMAIL_TEST_MODE = "1"; // src/email.js n'envoie pas de vrai email, juste testOutbox
const BASE = "http://localhost:3999";
const TEST_BASE_ID = "appTESTBASE0001";

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const APP_DIR = path.join(__dirname, "..");

const dbFile = path.join(APP_DIR, "data", "db.json");
const secretFile = path.join(APP_DIR, "data", ".session-secret");
const sessionsDir = path.join(APP_DIR, "data", "sessions");
if (!fs.existsSync(path.join(APP_DIR, "data"))) fs.mkdirSync(path.join(APP_DIR, "data"), { recursive: true });
fs.writeFileSync(
  dbFile,
  JSON.stringify(
    {
      version: 2,
      users: [],
      integrations: {
        airtable: { token: "", baseId: "", connected: false },
        slack: { botToken: "", channels: [], connected: false },
        ai: { provider: "anthropic", apiKey: "", model: "claude-haiku-4-5-20251001", connected: false },
      },
      activityLog: [],
      slackMessagesCache: [],
    },
    null,
    2
  ),
  "utf8"
);
fs.writeFileSync(secretFile, crypto.randomBytes(32).toString("hex"), "utf8");
// Reinitialise aussi le store de sessions fichier (nouveau depuis la persistance de session).
if (fs.existsSync(sessionsDir)) {
  fs.readdirSync(sessionsDir).forEach((f) => {
    try { fs.writeFileSync(path.join(sessionsDir, f), ""); } catch (e) {}
  });
} else {
  fs.mkdirSync(sessionsDir, { recursive: true });
}

const { TABLES } = require(path.join(APP_DIR, "src", "tables"));
const emailModule = require(path.join(APP_DIR, "src", "email"));

const TODAY = new Date();
const TODAY_STR = String(TODAY.getDate()).padStart(2, "0") + "/" + String(TODAY.getMonth() + 1).padStart(2, "0") + "/" + TODAY.getFullYear();
const TODAY_ISO = TODAY.toISOString().slice(0, 10);

// ---- Mock store Airtable (cle = Field ID, comme la vraie API quand on demande returnFieldsByFieldId=true) ----
const mockAirtable = {
  [TABLES.logements.tableId]: [
    { id: "recLog001", createdTime: new Date().toISOString(), fields: { fldm4il1uxFIuBvrM: "Villa les Resiniers", fldt3gjk7VBH6AWgD: "Moliets-et-Maa", fldNwCxHmbRvbwJDs: { id: "selLibre", name: "Libre" }, fldVAjwHCwpSdf2o6: "Oihana" } },
    { id: "recLog002", createdTime: new Date().toISOString(), fields: { fldm4il1uxFIuBvrM: "Le Domaine du Lac", fldt3gjk7VBH6AWgD: "Moliets-et-Maa", fldNwCxHmbRvbwJDs: { id: "selOccupe", name: "Occupe" }, fldVAjwHCwpSdf2o6: "Marie" } },
  ],
  [TABLES.litiges.tableId]: [
    { id: "recLit001", createdTime: new Date().toISOString(), fields: { fldMcekiXgcMb3dhU: "TEST Voyageur", fldSfhdRaihrlslbS: { id: "selTodo", name: "A faire" } } },
  ],
  [TABLES.prospects.tableId]: [],
  [TABLES.menage.tableId]: [
    { id: "recAgent1", createdTime: new Date().toISOString(), fields: { fld3VZR2uFZVnsl28: "CAPDEVILLE", fld3hjQS2PC9Zf6ru: "Oihana", fld96rbvOeLCYcRUh: "Moliets", fldehWI45XhtVzEtk: 18 } },
  ],
  [TABLES.menageOccasionnel.tableId]: [
    { id: "recRemp001", createdTime: new Date().toISOString(), fields: { fldjOiGLHj8Blo8DU: "CAPDEVILLE", fldTjiXxzDaclqyex: "Oihana", fldH77iYKi6c1mhbb: { id: "selEnAttente", name: "En attente" }, fldFYmu2Z4MJZEhld: TODAY_ISO } },
  ],
  [TABLES.reservations.tableId]: [
    { id: "recRes001", createdTime: new Date().toISOString(), fields: { fldceYRh9RSZVH30T: "Martin", fldGNo5KboI2wpzGv: "Julie", fldwxzZqEr1hGHrSX: "0611223344", fldjq1ihzoWPC6wMC: 450, fldPokQNuLSsA2Hmz: TODAY_STR, fldprehYFR1XGT8v9: TODAY_STR, fldDsg7D3kqQvpc8m: { state: "generated", value: "https://wa.me/33611223344" }, fldza1htZ7LQ2uyxC: { state: "generated", value: "Villa les Resiniers" } } },
  ],
  [TABLES.avis.tableId]: [],
  [TABLES.checklist.tableId]: [],
  [TABLES.artisans.tableId]: [],
  [TABLES.documents.tableId]: [],
  [TABLES.proprietaires.tableId]: [],
  [TABLES.proprietairesActifs.tableId]: [],
};

const mockSchemaChoices = {
  fldNwCxHmbRvbwJDs: [
    { id: "selLibre", name: "Libre" },
    { id: "selOccupe", name: "Occupe" },
    { id: "selTravaux", name: "Travaux" },
  ],
};

// Simule un champ ajoute directement dans Airtable APRES coup (sans
// modification du code de l'application) : le schema Meta Airtable le
// contient, mais src/tables.js ne le decrit pas encore. Sert a verifier
// augmentTablesWithSchema() (voir TEST 7b).
const EXTRA_SCHEMA_FIELDS = {
  [TABLES.proprietaires.tableId]: [
    { id: "fldExtraTest0001", name: "Nouveau champ ajoute dans Airtable", type: "singleLineText" },
  ],
};

function findTableById(tableId) {
  return Object.values(TABLES).find((t) => t.tableId === tableId);
}
function nameKeyedToIdKeyed(tableId, fieldsByName) {
  const tbl = findTableById(tableId);
  const out = {};
  // Inclut aussi les champs "ajoutes directement dans Airtable" (voir
  // EXTRA_SCHEMA_FIELDS / TEST 7b) et les champs crees dynamiquement en cours
  // de test via airtable.ensureFieldOnTable (voir mockDynamicFields / TEST 7c)
  // : le vrai serveur les resout via le schema Meta Airtable
  // (augmentTablesWithSchema), donc le mock doit lui aussi savoir retrouver
  // leur ID a partir de leur nom pour simuler fidelement l'ecriture Airtable.
  const extra = (EXTRA_SCHEMA_FIELDS[tableId] || []).concat(mockDynamicFields[tableId] || []);
  Object.entries(fieldsByName || {}).forEach(([name, val]) => {
    const known = tbl && tbl.fields.find((f) => f.n === name);
    const extraField = !known && extra.find((f) => f.name === name);
    const fid = known ? known.i : extraField ? extraField.id : name;
    out[fid] = val;
  });
  return out;
}

let mockCallLog = [];
// Tables creees dynamiquement en cours de test via l'API meta Airtable (ex:
// "Utilisateurs appli", creee automatiquement par src/usersStore.js la
// premiere fois qu'un compte doit etre lu/ecrit alors qu'Airtable est
// connecte) — simule fidelement la creation ET la persistance de schema.
let mockDynamicTables = [];
// Champs crees dynamiquement sur une table EXISTANTE en cours de test, via
// airtable.ensureFieldOnTable (POST /meta/bases/{baseId}/tables/{tableId}/fields)
// — ex: le lien litige individuel par prestataire (voir TEST 7c). Cle =
// tableId, valeur = liste de {id, name, type}.
let mockDynamicFields = {};
const realFetch = globalThis.fetch.bind(globalThis);

globalThis.fetch = async function (url, options = {}) {
  const u = String(url);

  if (u.startsWith(BASE) || u.startsWith("http://localhost:3999")) {
    return realFetch(url, options);
  }

  mockCallLog.push({ url: u, method: options.method || "GET", body: options.body });

  if (u.includes("api.airtable.com/v0/meta/bases/")) {
    const method = (options.method || "GET").toUpperCase();
    if (method === "POST") {
      const fieldsRouteMatch = u.match(/\/tables\/([^/?]+)\/fields/);
      if (fieldsRouteMatch) {
        // Simule POST /meta/bases/{baseId}/tables/{tableId}/fields : creation
        // d'un champ sur une table EXISTANTE (utilise par
        // airtable.ensureFieldOnTable(), ex: lien litige par prestataire).
        const targetTableId = fieldsRouteMatch[1];
        const body = JSON.parse(options.body || "{}");
        const newField = { id: "fldDyn" + crypto.randomBytes(6).toString("hex"), name: body.name, type: body.type };
        if (!mockDynamicFields[targetTableId]) mockDynamicFields[targetTableId] = [];
        mockDynamicFields[targetTableId].push(newField);
        return jsonResponse(200, newField);
      }
      // Simule POST /meta/bases/{baseId}/tables : creation d'une nouvelle
      // table (utilise par usersStore.ensureUsersTable()).
      const body = JSON.parse(options.body || "{}");
      const newTableId = "tblDyn" + crypto.randomBytes(6).toString("hex");
      const newTable = {
        id: newTableId,
        name: body.name,
        fields: (body.fields || []).map((f) => ({ id: "fldDyn" + crypto.randomBytes(6).toString("hex"), name: f.name, type: f.type })),
      };
      mockDynamicTables.push(newTable);
      mockAirtable[newTableId] = [];
      return jsonResponse(200, newTable);
    }
    const tables = Object.values(TABLES).map((t) => ({
      id: t.tableId,
      name: t.label,
      fields: t.fields.map((f) => ({
        id: f.i,
        name: f.n,
        type: f.t,
        options: mockSchemaChoices[f.i] ? { choices: mockSchemaChoices[f.i] } : undefined,
      })).concat(EXTRA_SCHEMA_FIELDS[t.tableId] || []).concat(mockDynamicFields[t.tableId] || []),
    })).concat(mockDynamicTables);
    return jsonResponse(200, { tables });
  }

  if (u.includes("api.airtable.com/v0/")) {
    const afterV0 = u.split("api.airtable.com/v0/")[1];
    const pathOnly = afterV0.split("?")[0];
    const pathParts = pathOnly.split("/"); // [baseId, tableId, recordId?]
    const tableId = pathParts[1];
    const recordId = pathParts[2];
    const method = (options.method || "GET").toUpperCase();
    if (!mockAirtable[tableId]) mockAirtable[tableId] = [];

    // GET /{tableId}/{recordId} : lecture d'un enregistrement unique (utilise
    // par usersStore.findUserById) — different de la liste paginee ci-dessous.
    if (recordId && method === "GET") {
      const rec = mockAirtable[tableId].find((r) => r.id === recordId);
      if (!rec) return jsonResponse(404, { error: { type: "NOT_FOUND", message: "Record not found" } });
      return jsonResponse(200, rec);
    }

    if (method === "GET") {
      return jsonResponse(200, { records: mockAirtable[tableId] });
    }
    if (method === "POST") {
      const body = JSON.parse(options.body || "{}");
      const created = (body.records || []).map((r) => {
        const rec = { id: "rec" + crypto.randomBytes(6).toString("hex"), createdTime: new Date().toISOString(), fields: nameKeyedToIdKeyed(tableId, r.fields) };
        mockAirtable[tableId].push(rec);
        return rec;
      });
      return jsonResponse(200, { records: created });
    }
    if (method === "PATCH") {
      const body = JSON.parse(options.body || "{}");
      const updated = (body.records || []).map((r) => {
        const rec = mockAirtable[tableId].find((x) => x.id === r.id);
        if (!rec) return { id: r.id, fields: {} };
        Object.assign(rec.fields, nameKeyedToIdKeyed(tableId, r.fields));
        return rec;
      });
      return jsonResponse(200, { records: updated });
    }
    if (method === "DELETE") {
      const qs = u.split("?")[1] || "";
      const ids = Array.from(new URLSearchParams(qs).entries()).filter(([k]) => k === "records[]").map(([, v]) => v);
      mockAirtable[tableId] = mockAirtable[tableId].filter((r) => !ids.includes(r.id));
      return jsonResponse(200, { records: ids.map((id) => ({ id, deleted: true })) });
    }
    return jsonResponse(400, { error: { message: "Methode non simulee" } });
  }

  if (u.includes("slack.com/api/auth.test")) return jsonResponse(200, { ok: true, team: "Aux Portes des Landes", user: "apdl-bot" });
  if (u.includes("slack.com/api/chat.postMessage")) return jsonResponse(200, { ok: true, ts: "1234.5678" });
  if (u.includes("slack.com/api/conversations.history")) {
    const body = JSON.parse(options.body || "{}");
    return jsonResponse(200, { ok: true, messages: [{ user: "U1", text: "Bienvenue sur " + body.channel, ts: "1000.0001" }] });
  }

  if (u.includes("api.anthropic.com/v1/messages")) {
    const body = JSON.parse(options.body || "{}");
    const userMsg = (body.messages && body.messages[0] && body.messages[0].content) || "";
    if (userMsg.includes("Reponds juste OK")) return jsonResponse(200, { content: [{ type: "text", text: "OK" }] });
    return jsonResponse(200, { content: [{ type: "text", text: "IA-STUB: reponse simulee basee sur les donnees fournies." }] });
  }

  return jsonResponse(404, { error: { message: "URL non simulee dans les tests : " + u } });
};

function jsonResponse(status, obj) {
  const text = JSON.stringify(obj);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    json: async () => JSON.parse(text),
    text: async () => text,
  };
}

let capturedLogs = [];
const realConsoleLog = console.log.bind(console);
console.log = (...args) => {
  capturedLogs.push(args.map(String).join(" "));
  realConsoleLog(...args);
};

let PASS = 0;
let FAIL = 0;
function ok(cond, label) {
  if (cond) {
    PASS++;
    realConsoleLog("  OK  " + label);
  } else {
    FAIL++;
    realConsoleLog("  FAIL " + label);
  }
}

function parseCookie(res) {
  const raw = res.headers.get ? res.headers.get("set-cookie") : null;
  if (!raw) return null;
  return raw.split(";")[0];
}

async function call(method, urlPath, body, cookie) {
  const res = await realFetch(BASE + urlPath, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body !== undefined && body !== null ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch (e) {}
  return { status: res.status, json, cookie: parseCookie(res) };
}

async function run() {
  require(path.join(APP_DIR, "server.js"));
  await new Promise((r) => setTimeout(r, 400));

  console.log("\n== TEST 1: API protegee sans session ==");
  let r = await call("GET", "/api/auth/me");
  ok(r.status === 401, "GET /api/auth/me renvoie 401 sans session");

  console.log("\n== TEST 2: Login admin avec mot de passe temporaire ==");
  const pwLine = capturedLogs.find((l) => l.includes("Mot de passe temporaire"));
  ok(!!pwLine, "le mot de passe temporaire admin a bien ete affiche au demarrage");
  const tempPassword = pwLine ? pwLine.split(":").pop().trim() : "";
  r = await call("POST", "/api/auth/login", { username: "admin", password: tempPassword, role: "admin" });
  ok(r.status === 200 && r.json.user.username === "admin", "connexion admin reussie avec le mot de passe temporaire");
  ok(r.json.user.mustChangePassword === true, "le compte admin est bien marque 'doit changer de mot de passe'");
  let adminCookie = r.cookie;

  console.log("\n== TEST 3: Changement de mot de passe obligatoire ==");
  r = await call("POST", "/api/auth/change-password", { newPassword: "AdminPro2026!" }, adminCookie);
  ok(r.status === 200, "changement de mot de passe admin reussi");
  r = await call("GET", "/api/auth/me", null, adminCookie);
  ok(r.status === 200 && r.json.user.mustChangePassword === false, "le flag mustChangePassword est bien retombe a false");

  console.log("\n== TEST 4: Creation des comptes collaborateur et prestataire ==");
  r = await call("POST", "/api/auth/users", { username: "collab", password: "Collab123!", name: "Camille Collab", role: "collaborateur" }, adminCookie);
  ok(r.status === 200 && r.json.user.role === "collaborateur", "compte collaborateur cree");
  r = await call("POST", "/api/auth/users", {
    username: "oihana", password: "Oihana123!", name: "Oihana", role: "prestataire",
    email: "oihana@example.com",
  }, adminCookie);
  ok(r.status === 200 && r.json.user.role === "prestataire", "compte prestataire cree (prenom = 'Oihana', identique a Airtable)");
  ok(r.json.user.email === "oihana@example.com", "l'email fourni a la creation est bien enregistre");
  const oihanaId = r.json.user.id;
  r = await call("POST", "/api/auth/users", { username: "collab", password: "x", name: "Doublon", role: "collaborateur" }, adminCookie);
  ok(r.status === 409, "impossible de creer deux comptes avec le meme identifiant");
  r = await call("POST", "/api/auth/users", { username: "hacker", password: "x", name: "X", role: "collaborateur" }, null);
  ok(r.status === 403, "un utilisateur non connecte ne peut pas creer de compte");
  r = await call("POST", "/api/auth/users", { username: "bademail", password: "x", name: "X", role: "collaborateur", email: "pas-un-email" }, adminCookie);
  ok(r.status === 400, "un email invalide est rejete a la creation d'un compte");
  r = await call("POST", "/api/auth/users", { username: "emaildup", password: "x", name: "X", role: "collaborateur", email: "oihana@example.com" }, adminCookie);
  ok(r.status === 409, "impossible de creer deux comptes avec le meme email");
  r = await call("POST", "/api/auth/users", { username: "collab2", password: "x", name: "Collab Deux", role: "collaborateur", email: "collab2@example.com" }, adminCookie);
  ok(r.status === 200, "compte collab2 cree avec un email distinct (pour tester le conflit ci-dessous)");
  r = await call("PATCH", `/api/auth/users/${oihanaId}`, { email: "collab2@example.com" }, adminCookie);
  ok(r.status === 409, "impossible de modifier l'email d'un compte pour prendre celui d'un autre compte");

  console.log("\n== TEST 5: Connexion collaborateur et prestataire ==");
  r = await call("POST", "/api/auth/login", { username: "collab", password: "Collab123!", role: "collaborateur" });
  ok(r.status === 200, "connexion collaborateur reussie");
  let collabCookie = r.cookie;
  r = await call("POST", "/api/auth/login", { username: "oihana", password: "Oihana123!", role: "prestataire" });
  ok(r.status === 200, "connexion prestataire reussie");
  let prestaCookie = r.cookie;
  r = await call("POST", "/api/auth/login", { username: "oihana", password: "MauvaisMdp", role: "prestataire" });
  ok(r.status === 401, "mauvais mot de passe refuse");
  r = await call("POST", "/api/auth/login", { username: "collab", password: "Collab123!", role: "admin" });
  ok(r.status === 401, "connexion refusee si le profil selectionne ne correspond pas au compte");

  console.log("\n== TEST 6: Visibilite des tables par role ==");
  r = await call("GET", "/api/config", null, adminCookie);
  ok(r.status === 200 && r.json.tableOrder.includes("documents"), "l'admin voit la table Documents proprietaires");
  ok(r.json.tableOrder.includes("proprietairesActifs"), "l'admin voit la table Proprietaires actifs (archive)");
  ok(Array.isArray(r.json.tables.menageOccasionnel.linkedFields) && r.json.tables.menageOccasionnel.linkedFields.length === 3, "les champs lies reconnus (linkedFields) sont exposes pour Remplacements menage");
  ok(r.json.tables.reservations.waConfig && r.json.tables.reservations.waConfig.audience === "voyageur", "la config WhatsApp (waConfig) est exposee pour Reservations");
  ok(r.json.tables.menage.waConfig && r.json.tables.menage.waConfig.audience === "prestataire", "la config WhatsApp (waConfig) est exposee pour Agents de menage");
  r = await call("GET", "/api/config", null, collabCookie);
  ok(r.status === 200 && !r.json.tableOrder.includes("documents"), "le collaborateur ne voit PAS la table Documents proprietaires");
  ok(r.json.tableOrder.includes("logements"), "le collaborateur voit la table Logements");
  r = await call("GET", "/api/config", null, prestaCookie);
  ok(r.status === 200 && !r.json.tableOrder.includes("prospects"), "le prestataire ne voit pas la table Prospects");
  ok(r.json.tableOrder.includes("logements") && r.json.tableOrder.includes("menageOccasionnel"), "le prestataire voit ses tables autorisees (Logements, Remplacements menage)");
  ok(r.json.tables.logements.permission === "read", "le prestataire a un droit 'read' seul sur Logements");

  console.log("\n== TEST 7: Configuration des integrations, Slack multi-canaux ==");
  r = await call("POST", "/api/settings/integrations/airtable", { token: "patTEST123", baseId: TEST_BASE_ID }, collabCookie);
  ok(r.status === 403, "un collaborateur ne peut pas configurer les integrations");
  r = await call("POST", "/api/settings/integrations/airtable", { token: "patTEST123", baseId: TEST_BASE_ID }, adminCookie);
  ok(r.status === 200 && r.json.ok, "connexion Airtable testee et enregistree par l'admin");
  r = await call(
    "POST",
    "/api/settings/integrations/slack",
    { botToken: "xoxb-test", channels: [{ id: "C1111111111", name: "general" }, { id: "C2222222222", name: "urgences" }] },
    adminCookie
  );
  ok(r.status === 200 && r.json.ok && r.json.channelCount === 2, "connexion Slack multi-canaux (2 canaux) testee et enregistree par l'admin");
  r = await call("POST", "/api/settings/integrations/ai", { apiKey: "sk-ant-test", model: "claude-haiku-4-5-20251001" }, adminCookie);
  ok(r.status === 200 && r.json.ok, "connexion IA (Anthropic) testee et enregistree par l'admin");
  r = await call("GET", "/api/settings/integrations", null, collabCookie);
  ok(r.status === 200 && r.json.airtable.connected && r.json.slack.connected && r.json.ai.connected, "les 3 integrations apparaissent connectees");
  ok(Array.isArray(r.json.slack.channels) && r.json.slack.channels.length === 2, "les 2 canaux Slack configures sont bien renvoyes");
  ok(!r.json.airtable.tokenPreview.includes("patTEST123"), "le jeton Airtable complet n'est jamais renvoye au frontend");

  console.log("\n== TEST 7b: Auto-decouverte d'un champ ajoute directement dans Airtable (Proprietaires) ==");
  r = await call("GET", "/api/config", null, adminCookie);
  const propCfg = r.json.tables.proprietaires;
  ok(propCfg.fields.some((f) => f.i === "fldExtraTest0001"), "le champ ajoute dans Airtable (hors code) apparait dans la config des Proprietaires");
  ok(propCfg.detailFields.includes("fldExtraTest0001"), "ce champ est bien inclus dans le formulaire (detailFields)");
  r = await call("POST", "/api/records/proprietaires", { fields: { fldguMlPi1cbRVNDL: "TEST Proprietaire schema-sync" } }, adminCookie);
  ok(r.status === 200, "creation d'un proprietaire de test reussie");
  const propRecId = r.json.record.id;
  r = await call("PATCH", `/api/records/proprietaires/${propRecId}`, { fields: { fldExtraTest0001: "valeur test synchronisee" } }, adminCookie);
  ok(r.status === 200, "l'ecriture sur le champ auto-decouvert reussit (pas seulement la lecture)");
  r = await call("GET", "/api/records/proprietaires", null, adminCookie);
  const propRec = r.json.records.find((x) => x.id === propRecId);
  ok(propRec && propRec.fields.fldExtraTest0001 === "valeur test synchronisee", "la valeur ecrite sur le champ auto-decouvert est bien synchronisee avec Airtable");

  console.log("\n== TEST 7c: Lien litige individuel par prestataire menage (Parametres > Agents de menage) ==");
  r = await call("GET", "/api/settings/menage-litige-links", null, prestaCookie);
  ok(r.status === 403, "un prestataire n'a pas acces a la liste des liens litige (reserve equipe interne)");
  r = await call("GET", "/api/settings/menage-litige-links", null, collabCookie);
  ok(r.status === 200 && r.json.items.length === 1 && r.json.items[0].prenom === "Oihana", "l'equipe interne voit la liste des agents de menage avec leur lien litige (vide au depart)");
  const menageRecId = r.json.items[0].id;
  ok(r.json.items[0].litigeUrl === "", "aucun lien litige n'est encore renseigne pour Oihana");
  r = await call("PATCH", `/api/settings/menage-litige-links/${menageRecId}`, { url: "https://airtable.com/appTEST/shrOIHANA" }, collabCookie);
  ok(r.status === 403, "un collaborateur ne peut pas modifier un lien litige (reserve admin)");
  r = await call("PATCH", `/api/settings/menage-litige-links/${menageRecId}`, { url: "pas-une-url" }, adminCookie);
  ok(r.status === 400, "un lien litige invalide (pas http/https) est rejete");
  r = await call("PATCH", `/api/settings/menage-litige-links/${menageRecId}`, { url: "https://airtable.com/appTEST/shrOIHANA" }, adminCookie);
  ok(r.status === 200 && r.json.ok, "un admin peut renseigner le lien litige d'un agent de menage");
  r = await call("GET", "/api/settings/menage-litige-links", null, adminCookie);
  ok(r.json.items[0].litigeUrl === "https://airtable.com/appTEST/shrOIHANA", "le lien litige enregistre est bien relu depuis Airtable");
  r = await call("GET", "/api/settings/my-litige-link", null, prestaCookie);
  ok(r.status === 200 && r.json.url === "https://airtable.com/appTEST/shrOIHANA", "le prestataire Oihana voit bien SON PROPRE lien litige (page Declarer un litige)");
  r = await call("GET", "/api/settings/my-litige-link", null, collabCookie);
  ok(r.status === 200 && r.json.url === null, "un profil non-prestataire n'a pas de lien litige (page reservee aux prestataires)");

  console.log("\n== TEST 8: Lecture des enregistrements Airtable avec scoping par role ==");
  r = await call("GET", "/api/records/logements", null, adminCookie);
  ok(r.status === 200 && r.json.records.length === 2, "l'admin voit les 2 logements");
  ok("linkedLabels" in r.json, "la reponse inclut bien une cle linkedLabels");
  r = await call("GET", "/api/records/logements", null, prestaCookie);
  ok(r.status === 200 && r.json.records.length === 1 && r.json.records[0].id === "recLog001", "le prestataire 'Oihana' ne voit que le logement qui lui est assigne");
  r = await call("GET", "/api/records/documents", null, prestaCookie);
  ok(r.status === 403, "le prestataire n'a pas acces a la table Documents proprietaires");
  r = await call("GET", "/api/records/menageOccasionnel", null, adminCookie);
  ok(r.status === 200 && r.json.linkedLabels && r.json.linkedLabels.fldCzcZMFzz986gUX, "les libelles des enregistrements lies (Prestataire a remplacer) sont bien resolus");

  console.log("\n== TEST 9: Creation d'un enregistrement + notification Slack automatique (multi-canaux) ==");
  mockCallLog = [];
  r = await call("POST", "/api/records/litiges", { fields: { fldMcekiXgcMb3dhU: "Nouveau litige test" } }, collabCookie);
  ok(r.status === 200, "creation d'un litige par le collaborateur reussie");
  const slackNotifCalls = mockCallLog.filter((c) => c.url.includes("slack.com/api/chat.postMessage"));
  ok(slackNotifCalls.length === 2, "la notification Slack automatique est diffusee sur LES DEUX canaux configures");
  mockCallLog = [];
  r = await call("POST", "/api/records/artisans", { fields: { fldmcRReRkhg5u42q: "Dupont" } }, collabCookie);
  ok(r.status === 200, "creation dans une table non-notifiee reussie");
  ok(!mockCallLog.some((c) => c.url.includes("slack.com")), "aucune notification Slack pour une table non listee dans SLACK_NOTIFY_TABLES");

  console.log("\n== TEST 10: Modification par un prestataire, limitee aux champs autorises ==");
  r = await call("PATCH", "/api/records/menageOccasionnel/recRemp001", { fields: { fldH77iYKi6c1mhbb: "Confirme", fldYfC74Z8mrr6g70: "0600000000" } }, prestaCookie);
  ok(r.status === 200, "le prestataire peut modifier le champ Statut qui lui est autorise");
  const rempRecord = mockAirtable[TABLES.menageOccasionnel.tableId].find((r2) => r2.id === "recRemp001");
  ok(rawTextEq(rempRecord.fields.fldH77iYKi6c1mhbb, "Confirme"), "le champ autorise a bien ete mis a jour cote Airtable");
  ok(rempRecord.fields.fldYfC74Z8mrr6g70 !== "0600000000", "un champ NON autorise pour le prestataire (telephone) a ete silencieusement ignore");
  r = await call("PATCH", "/api/records/menage/recAgent1", { fields: { fld96rbvOeLCYcRUh: "Dax" } }, prestaCookie);
  ok(r.status === 403, "le prestataire ne peut pas modifier la table Agents de menage (droit self = lecture seule)");

  console.log("\n== TEST 11: Selecteur d'enregistrements lies (multipleRecordLinks) ==");
  r = await call("GET", "/api/records/menageOccasionnel/linked/fldCzcZMFzz986gUX", null, adminCookie);
  ok(r.status === 200 && r.json.options.some((o) => o.id === "recAgent1" && o.label.includes("Oihana")), "les options du selecteur 'Prestataire a remplacer' incluent l'agent de menage seede, avec un libelle lisible");
  r = await call("PATCH", "/api/records/menageOccasionnel/recRemp001", { fields: { fldCzcZMFzz986gUX: ["recAgent1"] } }, adminCookie);
  ok(r.status === 200, "l'admin peut lier un enregistrement via le champ multipleRecordLinks reconnu");
  const rempAfterLink = mockAirtable[TABLES.menageOccasionnel.tableId].find((r2) => r2.id === "recRemp001");
  ok(Array.isArray(rempAfterLink.fields.fldCzcZMFzz986gUX) && rempAfterLink.fields.fldCzcZMFzz986gUX.includes("recAgent1"), "le lien vers l'enregistrement a bien ete enregistre cote Airtable");
  r = await call("GET", "/api/records/logements/linked/fldEI3oXTR1sA1r9w", null, adminCookie);
  ok(r.status === 404, "un champ multipleRecordLinks non reconnu (Equipe) n'expose pas de selecteur (reste lecture seule par securite)");

  console.log("\n== TEST 12: Suppression reservee aux administrateurs ==");
  r = await call("DELETE", "/api/records/artisans/recTest", null, collabCookie);
  ok(r.status === 403, "un collaborateur ne peut pas supprimer un enregistrement");
  mockAirtable[TABLES.artisans.tableId].push({ id: "recArtisanDel", createdTime: new Date().toISOString(), fields: { fldmcRReRkhg5u42q: "A supprimer" } });
  r = await call("DELETE", "/api/records/artisans/recArtisanDel", null, adminCookie);
  ok(r.status === 200 && r.json.ok, "l'admin peut supprimer un enregistrement");
  ok(!mockAirtable[TABLES.artisans.tableId].some((x) => x.id === "recArtisanDel"), "l'enregistrement a bien ete supprime du store Airtable simule");

  console.log("\n== TEST 13: Assistant IA connecte aux donnees Airtable ==");
  mockCallLog = [];
  r = await call("POST", "/api/ai/chat", { question: "quels sont mes logements ?" }, prestaCookie);
  ok(r.status === 200 && r.json.answer.includes("IA-STUB"), "reponse IA recue pour le prestataire");
  ok(mockCallLog.some((c) => c.url.includes("api.airtable.com") && c.url.includes(TABLES.logements.tableId)), "le contexte IA a bien interroge la table Logements (scopee au prestataire)");
  mockCallLog = [];
  r = await call("POST", "/api/ai/chat", { question: "quels litiges sont en cours ?" }, adminCookie);
  ok(r.status === 200, "reponse IA recue pour l'admin");
  ok(mockCallLog.some((c) => c.url.includes(TABLES.litiges.tableId)), "la question a bien ete routee vers la table Litiges via les mots-cles");

  console.log("\n== TEST 14: Messagerie Slack multi-canaux et choix dynamiques ==");
  r = await call("GET", "/api/slack/channels", null, adminCookie);
  ok(r.status === 200 && r.json.channels.length === 2, "les 2 canaux configures sont listes pour le selecteur frontend");
  r = await call("GET", "/api/slack/messages", null, adminCookie);
  ok(r.status === 200 && r.json.channel === "C1111111111", "sans canal precise, le premier canal configure est utilise par defaut");
  r = await call("GET", "/api/slack/messages?channel=C2222222222", null, adminCookie);
  ok(r.status === 200 && r.json.messages[0].text.includes("C2222222222"), "on peut lire les messages d'un canal specifique parmi les canaux configures");
  mockCallLog = [];
  r = await call("POST", "/api/slack/messages", { text: "Bonjour equipe", channel: "C2222222222" }, adminCookie);
  ok(r.status === 200 && r.json.channel === "C2222222222", "envoi d'un message Slack reussi sur le canal choisi");
  const postCall = mockCallLog.find((c) => c.url.includes("chat.postMessage"));
  ok(postCall && JSON.parse(postCall.body).channel === "C2222222222", "le message est bien poste sur le canal selectionne, pas un autre");
  r = await call("GET", "/api/slack/messages", null, prestaCookie);
  ok(r.status === 403, "la messagerie Slack est refusee au profil prestataire");
  r = await call("GET", "/api/records/logements/choices/fldNwCxHmbRvbwJDs", null, adminCookie);
  ok(r.status === 200 && r.json.choices.length === 3, "les choix du champ 'Statut d'occupation' sont bien recuperes depuis le schema Airtable");

  console.log("\n== TEST 15: Tableau de bord (CA en cours, occupation, litiges) ==");
  r = await call("GET", "/api/dashboard/summary", null, adminCookie);
  ok(r.status === 200, "le resume du tableau de bord est accessible a l'admin");
  ok(r.json.revenue.total === 450, "le CA total est correctement calcule depuis le champ Tarif des reservations");
  ok(r.json.revenue.currentMonth === 450, "le CA du mois en cours inclut la reservation dont le check-in est aujourd'hui");
  ok(r.json.occupancy.occupiedCount === 1 && r.json.occupancy.totalLogements === 2, "le taux d'occupation est calcule depuis le statut des logements");
  ok(r.json.openLitigesCount === 2, "le nombre de litiges ouverts est correct");
  ok(r.json.pendingMenageCount === 0, "le nombre de menages a confirmer est correct");
  ok(r.json.today.checkins === 1, "le nombre d'entrees (check-in) du jour est correct");
  ok(r.json.today.checkouts === 1, "le nombre de sorties (check-out) du jour est correct");
  ok(r.json.today.menageOccasionnel === 1, "le nombre de menages occasionnels prevus aujourd'hui est correct");
  ok(r.json.today.menageTotal === 2, "le total des menages a effectuer aujourd'hui (sorties + occasionnels) est correct");
  r = await call("GET", "/api/dashboard/summary", null, prestaCookie);
  ok(r.status === 403, "le tableau de bord detaille (CA) est reserve a l'equipe interne, pas au prestataire");

  console.log("\n== TEST 16: Modeles WhatsApp et liens de formulaires ==");
  r = await call("GET", "/api/settings/whatsapp-templates", null, adminCookie);
  ok(r.status === 200 && r.json.templates.length === 21, "21 modeles WhatsApp sont preconfigures par defaut (voyageur/proprietaire/prestataire/collaborateur)");
  ok(r.json.templates.every(t => !!t.audience), "chaque modele preconfigure a bien un champ audience");
  const audienceCounts = {};
  r.json.templates.forEach(t => { audienceCounts[t.audience] = (audienceCounts[t.audience]||0) + 1; });
  ok(audienceCounts.voyageur >= 4 && audienceCounts.proprietaire >= 4 && audienceCounts.prestataire >= 4 && audienceCounts.collaborateur >= 4, "les 4 categories (voyageur/proprietaire/prestataire/collaborateur) ont chacune plusieurs modeles dedies");
  r = await call("GET", "/api/settings/whatsapp-templates", null, prestaCookie);
  ok(r.status === 403, "un prestataire n'a pas acces aux modeles WhatsApp");
  r = await call("POST", "/api/settings/whatsapp-templates", { name: "Test", body: "Bonjour {{prenom}}" }, collabCookie);
  ok(r.status === 403, "un collaborateur ne peut pas creer de modele WhatsApp (reserve admin)");
  r = await call("POST", "/api/settings/whatsapp-templates", { name: "Test", body: "Bonjour {{prenom}}", audience: "prestataire" }, adminCookie);
  ok(r.status === 200 && r.json.template.id && r.json.template.audience === "prestataire", "l'admin peut creer un nouveau modele WhatsApp avec une audience");
  const newTplId = r.json.template.id;
  r = await call("POST", "/api/settings/whatsapp-templates", { name: "Test audience invalide", body: "Bonjour", audience: "n-importe-quoi" }, adminCookie);
  ok(r.status === 200 && r.json.template.audience === "tous", "une audience de modele invalide retombe sur 'tous'");
  await call("DELETE", `/api/settings/whatsapp-templates/${r.json.template.id}`, null, adminCookie);
  r = await call("PUT", `/api/settings/whatsapp-templates/${newTplId}`, { name: "Test modifie", body: "Salut {{prenom}} !", audience: "collaborateur" }, adminCookie);
  ok(r.status === 200 && r.json.template.name === "Test modifie" && r.json.template.audience === "collaborateur", "l'admin peut modifier un modele WhatsApp existant (dont son audience)");
  r = await call("DELETE", `/api/settings/whatsapp-templates/${newTplId}`, null, adminCookie);
  ok(r.status === 200, "l'admin peut supprimer un modele WhatsApp");
  r = await call("GET", "/api/settings/form-links", null, adminCookie);
  ok(r.status === 200 && Array.isArray(r.json.links), "la liste des liens de formulaires est accessible a l'equipe interne");
  r = await call("POST", "/api/settings/form-links", { label: "Formulaire test", url: "https://airtable.com/appTEST/formTEST" }, adminCookie);
  ok(r.status === 200 && r.json.link.id, "l'admin peut ajouter un lien de formulaire");
  const newLinkId = r.json.link.id;
  r = await call("POST", "/api/settings/form-links", { label: "Lien invalide", url: "pas-une-url" }, adminCookie);
  ok(r.status === 400, "un lien de formulaire doit commencer par http:// ou https://");
  r = await call("DELETE", `/api/settings/form-links/${newLinkId}`, null, adminCookie);
  ok(r.status === 200, "l'admin peut supprimer un lien de formulaire");

  console.log("\n== TEST 16b: Droits d'acces par profil (Parametres) ==");
  r = await call("GET", "/api/settings/access-rights", null, adminCookie);
  ok(r.status === 200 && Array.isArray(r.json.tables) && r.json.tables.length > 0, "l'admin peut lire le recapitulatif des droits d'acces");
  const logementsRow = r.json.tables.find(t=>t.key==="logements");
  ok(logementsRow && logementsRow.roles.prestataire === "read", "le recapitulatif reflete bien la permission reelle (logements = lecture pour un prestataire)");
  r = await call("GET", "/api/settings/access-rights", null, collabCookie);
  ok(r.status === 403, "un collaborateur n'a pas acces au recapitulatif des droits d'acces (reserve admin)");
  r = await call("GET", "/api/settings/access-rights", null, prestaCookie);
  ok(r.status === 403, "un prestataire n'a pas acces au recapitulatif des droits d'acces (reserve admin)");

  console.log("\n== TEST 16c: Modification des droits d'acces (overrides) ==");
  r = await call("GET", "/api/records/documents", null, collabCookie);
  ok(r.status === 403, "avant surcharge : un collaborateur n'a pas acces a la table documents (none par defaut)");
  r = await call("PUT", "/api/settings/access-rights/documents/collaborateur", { level: "read" }, adminCookie);
  ok(r.status === 200, "l'admin peut accorder une surcharge de droits (documents -> lecture pour collaborateur)");
  r = await call("GET", "/api/records/documents", null, collabCookie);
  ok(r.status === 200, "apres surcharge : le collaborateur a maintenant acces en lecture a documents");
  r = await call("POST", "/api/records/documents", { fields: {} }, collabCookie);
  ok(r.status === 403, "la surcharge 'lecture' n'autorise pas la creation pour autant");
  r = await call("PUT", "/api/settings/access-rights/documents/collaborateur", { level: "pasunivrai" }, adminCookie);
  ok(r.status === 400, "un niveau d'acces invalide est rejete");
  r = await call("PUT", "/api/settings/access-rights/logements/prestataire", { level: "full" }, collabCookie);
  ok(r.status === 403, "un collaborateur ne peut pas modifier les droits d'acces (reserve admin)");
  r = await call("DELETE", "/api/settings/access-rights/documents/collaborateur", null, adminCookie);
  ok(r.status === 200, "l'admin peut reinitialiser une surcharge au niveau par defaut");
  r = await call("GET", "/api/records/documents", null, collabCookie);
  ok(r.status === 403, "apres reinitialisation : le collaborateur n'a de nouveau plus acces a documents");

  console.log("\n== TEST 16d: Audience sur les liens de formulaires ==");
  r = await call("POST", "/api/settings/form-links", { label: "Formulaire audience", url: "https://airtable.com/appTEST/formAUD", audience: "prestataire" }, adminCookie);
  ok(r.status === 200 && r.json.link.audience === "prestataire", "l'audience d'un lien de formulaire est enregistree");
  const audLinkId = r.json.link.id;
  r = await call("POST", "/api/settings/form-links", { label: "Formulaire sans audience", url: "https://airtable.com/appTEST/formNOAUD" }, adminCookie);
  ok(r.status === 200 && r.json.link.audience === "tous", "l'audience par defaut est 'tous' quand non precisee");
  const noAudLinkId = r.json.link.id;
  r = await call("PUT", `/api/settings/form-links/${audLinkId}`, { label: "Formulaire audience", url: "https://airtable.com/appTEST/formAUD", audience: "voyageur" }, adminCookie);
  ok(r.status === 200 && r.json.link.audience === "voyageur", "l'audience d'un lien de formulaire peut etre modifiee");
  await call("DELETE", `/api/settings/form-links/${audLinkId}`, null, adminCookie);
  await call("DELETE", `/api/settings/form-links/${noAudLinkId}`, null, adminCookie);

  console.log("\n== TEST 16e: Messagerie WhatsApp - contacts equipe (Collaborateurs) ==");
  r = await call("GET", "/api/auth/team-contacts", null, adminCookie);
  ok(r.status === 200 && Array.isArray(r.json.contacts) && r.json.contacts.length >= 1, "l'admin peut lister les contacts internes (equipe)");
  r = await call("GET", "/api/auth/team-contacts", null, prestaCookie);
  ok(r.status === 403, "un prestataire n'a pas acces aux contacts internes");
  r = await call("GET", "/api/auth/me", null, adminCookie);
  const adminId = r.json.user.id;
  r = await call("PATCH", `/api/auth/users/${adminId}`, { phone: "0611223344" }, adminCookie);
  ok(r.status === 200 && r.json.user.phone === "0611223344", "l'admin peut ajouter/modifier son propre numero de telephone");
  r = await call("GET", "/api/auth/team-contacts", null, adminCookie);
  const adminContact = r.json.contacts.find(c=>c.id===adminId);
  ok(adminContact && adminContact.phone === "0611223344", "le telephone mis a jour apparait dans les contacts internes");
  r = await call("PATCH", `/api/auth/users/${adminId}`, { phone: "" }, collabCookie);
  ok(r.status === 403, "un collaborateur ne peut pas modifier le telephone d'un autre compte (reserve admin)");

  console.log("\n== TEST 16f: Inscription publique + validation par email ==");
  emailModule.testOutbox.length = 0;
  r = await call("POST", "/api/auth/signup", {
    name: "Julie Nouvelle", email: "julie.nouvelle@example.com", username: "julienouvelle",
    password: "MotDePasse1", role: "collaborateur", phone: "0600000001",
  });
  ok(r.status === 200, "l'inscription publique renvoie 200");
  ok(emailModule.testOutbox.length === 1, "un email de validation a ete 'envoye' (mode test)");
  r = await call("POST", "/api/auth/login", { username: "julienouvelle", password: "MotDePasse1" });
  ok(r.status === 403 && r.json.code === "EMAIL_NOT_VERIFIED", "la connexion est refusee tant que l'email n'est pas valide");

  r = await call("POST", "/api/auth/signup", {
    name: "Doublon", email: "julie.nouvelle@example.com", username: "autreidentifiant",
    password: "MotDePasse1", role: "collaborateur",
  });
  ok(r.status === 409, "impossible de s'inscrire deux fois avec la meme adresse email");
  r = await call("POST", "/api/auth/signup", {
    name: "Doublon2", email: "autre@example.com", username: "julienouvelle",
    password: "MotDePasse1", role: "collaborateur",
  });
  ok(r.status === 409, "impossible de s'inscrire deux fois avec le meme identifiant");
  r = await call("POST", "/api/auth/signup", {
    name: "Role invalide", email: "roleinvalide@example.com", username: "roleinvalide",
    password: "MotDePasse1", role: "superadmin",
  });
  ok(r.status === 400, "un profil invalide est rejete a l'inscription");
  r = await call("POST", "/api/auth/signup", {
    name: "Mdp court", email: "mdpcourt@example.com", username: "mdpcourt",
    password: "abc", role: "prestataire",
  });
  ok(r.status === 400, "un mot de passe trop court est rejete a l'inscription");

  const verifMail = emailModule.testOutbox.find((m) => m.to === "julie.nouvelle@example.com");
  const tokenMatch = verifMail && verifMail.html.match(/token=([a-f0-9]+)/);
  ok(!!tokenMatch, "le lien de validation contient un jeton");
  const verifyToken = tokenMatch ? tokenMatch[1] : "";

  let rawRes = await realFetch(BASE + "/api/auth/verify-email?token=jetoninvalide", { redirect: "manual" });
  ok(rawRes.status === 302 && rawRes.headers.get("location") === "/?verified=0", "un jeton invalide redirige vers ?verified=0");

  rawRes = await realFetch(BASE + `/api/auth/verify-email?token=${verifyToken}`, { redirect: "manual" });
  ok(rawRes.status === 302 && rawRes.headers.get("location") === "/?verified=1", "un jeton valide redirige vers ?verified=1");

  r = await call("POST", "/api/auth/login", { username: "julienouvelle", password: "MotDePasse1", role: "collaborateur" });
  ok(r.status === 200 && r.json.user.emailVerified === true, "la connexion fonctionne une fois l'email valide");
  const julieCookie = r.cookie;
  await call("POST", "/api/auth/logout", null, julieCookie);

  console.log("\n== TEST 16g: Renvoi de l'email de validation + activation manuelle par un admin ==");
  emailModule.testOutbox.length = 0;
  r = await call("POST", "/api/auth/signup", {
    name: "Pierre Prestataire", email: "pierre.prestataire@example.com", username: "pierreprest",
    password: "MotDePasse1", role: "prestataire",
  });
  ok(r.status === 200, "deuxieme inscription publique reussie (role prestataire)");
  r = await call("POST", "/api/auth/resend-verification", { username: "pierreprest" });
  ok(r.status === 200, "le renvoi de l'email de validation fonctionne");
  ok(emailModule.testOutbox.length === 2, "un deuxieme email a bien ete renvoye");
  r = await call("POST", "/api/auth/resend-verification", { username: "julienouvelle" });
  ok(r.status === 400, "impossible de renvoyer un email de validation pour un compte deja actif");

  r = await call("GET", "/api/auth/users", null, adminCookie);
  const pierre = r.json.users.find((u) => u.username === "pierreprest");
  ok(pierre && pierre.emailVerified === false, "le compte en attente apparait bien comme non verifie cote admin");
  r = await call("PATCH", `/api/auth/users/${pierre.id}`, { emailVerified: true }, adminCookie);
  ok(r.status === 200 && r.json.user.emailVerified === true, "un admin peut activer manuellement un compte en attente (filet de securite)");
  r = await call("POST", "/api/auth/login", { username: "pierreprest", password: "MotDePasse1", role: "prestataire" });
  ok(r.status === 200, "la connexion fonctionne apres activation manuelle par un admin");
  await call("POST", "/api/auth/logout", null, r.cookie);

  console.log("\n== TEST 17: Deconnexion et securite de session ==");
  r = await call("POST", "/api/auth/logout", null, adminCookie);
  ok(r.status === 200, "deconnexion reussie");
  r = await call("GET", "/api/config", null, adminCookie);
  ok(r.status === 401, "la session est bien invalidee apres logout (401 sur les appels suivants)");

  console.log("\n== SUMMARY ==");
  console.log("PASS: " + PASS + "  FAIL: " + FAIL);
  process.exit(FAIL > 0 ? 1 : 0);
}

function rawTextEq(val, expected) {
  if (val === expected) return true;
  if (val && typeof val === "object" && val.name === expected) return true;
  return false;
}

run().catch((e) => {
  realConsoleLog("TEST HARNESS CRASHED:", e);
  process.exit(1);
});
