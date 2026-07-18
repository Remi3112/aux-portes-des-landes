"use strict";
/**
 * Store des comptes de connexion (admin/collaborateur/prestataire) adossé à
 * une table Airtable dédiée ("Utilisateurs appli") plutôt qu'au fichier
 * local data/db.json.
 *
 * Pourquoi : sur un hébergement gratuit sans disque persistant (ex: Render
 * free), data/db.json peut être effacé à chaque redémarrage ou mise à jour
 * du service — mais Airtable, lui, ne l'est jamais. Une fois Airtable
 * connecté (Paramètres > Intégrations), les comptes créés dans l'application
 * vivent dans cette table et survivent à n'importe quelle mise à jour.
 *
 * La table est créée automatiquement au premier besoin si elle n'existe pas
 * encore (voir ensureUsersTable) — aucune manipulation manuelle d'Airtable
 * n'est nécessaire de la part de l'utilisateur.
 *
 * Adressage des champs par NOM (pas par ID) : l'API Airtable n'accepte de
 * manière fiable que des noms de champ dans le corps des requêtes de
 * création/modification d'enregistrements (voir src/airtable.js). Comme
 * cette table est entièrement gérée par l'application (créée par elle, avec
 * des noms fixes ci-dessous), on n'a jamais besoin de découvrir un Field ID.
 *
 * Ce module est volontairement independant de src/db.js (aucun require)
 * pour eviter toute dependance circulaire : chaque fonction recoit
 * directement {token, baseId} en parametre.
 */

const TABLE_NAME = "Utilisateurs appli";
const META_ROOT = "https://api.airtable.com/v0/meta/bases";
const API_ROOT = "https://api.airtable.com/v0";

const F = {
  username: "Identifiant",
  name: "Nom",
  role: "Role",
  phone: "Telephone",
  email: "Email",
  emailVerified: "Email verifie",
  passwordHash: "Mot de passe (hash)",
  mustChangePassword: "Doit changer mot de passe",
  verifyToken: "Jeton verification",
  verifyTokenExpires: "Expiration jeton",
};

// Cache memoire (duree de vie du processus) de l'ID de la table, pour ne pas
// re-interroger le schema Airtable a chaque requete. Un redemarrage du
// service reinitialise ce cache (sans consequence : il est retrouve/recree
// au premier appel suivant).
let cachedTableId = null;
let cachedForKey = null;

function cacheKeyFor(cfg) {
  return `${cfg.baseId}::${cfg.token}`;
}

// "Singleflight" : si plusieurs requetes HTTP concurrentes appellent
// ensureUsersTable() avant que le cache ci-dessus ne soit rempli (ex: juste
// apres la connexion d'Airtable, ou plusieurs requetes arrivent en meme
// temps), elles doivent toutes attendre la MEME verification/creation au
// lieu de partir chacune de leur cote verifier le schema puis potentiellement
// creer chacune une table "Utilisateurs appli" en double (situation de
// "split-brain" ou des comptes finiraient repartis entre deux tables).
let ensureTablePromise = null;
let ensureTableKey = null;

async function jsonFetch(url, cfg, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch (e) { json = {}; }
  if (!res.ok) {
    const msg = (json.error && (json.error.message || json.error.type)) || res.statusText || `HTTP ${res.status}`;
    const err = new Error(`Airtable (${res.status}) : ${msg}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

/** Retrouve (ou cree si absente) la table "Utilisateurs appli" dans la base
 * connectee, et retourne son ID. Idempotent et sur (concurrent-safe) : des
 * appels simultanes partagent la meme verification/creation en cours (voir
 * ensureTablePromise ci-dessus) au lieu de risquer une creation en double. */
async function ensureUsersTable(cfg) {
  const key = cacheKeyFor(cfg);
  if (cachedTableId && cachedForKey === key) return cachedTableId;
  if (ensureTablePromise && ensureTableKey === key) return ensureTablePromise;

  ensureTableKey = key;
  ensureTablePromise = (async () => {
    const schema = await jsonFetch(`${META_ROOT}/${cfg.baseId}/tables`, cfg);
    const existing = (schema.tables || []).find((t) => t.name === TABLE_NAME);
    if (existing) {
      cachedTableId = existing.id;
      cachedForKey = key;
      return cachedTableId;
    }
    const created = await jsonFetch(`${META_ROOT}/${cfg.baseId}/tables`, cfg, {
      method: "POST",
      body: JSON.stringify({
        name: TABLE_NAME,
        description:
          "Comptes de connexion de la Centrale de gestion (admin/collaborateur/prestataire ménage). " +
          "Créée et gérée automatiquement par l'application — ne pas modifier la structure manuellement.",
        fields: [
          { name: F.username, type: "singleLineText" },
          { name: F.name, type: "singleLineText" },
          { name: F.role, type: "singleSelect", options: { choices: [{ name: "admin" }, { name: "collaborateur" }, { name: "prestataire" }] } },
          { name: F.phone, type: "singleLineText" },
          { name: F.email, type: "email" },
          { name: F.emailVerified, type: "checkbox", options: { icon: "check", color: "greenBright" } },
          { name: F.passwordHash, type: "singleLineText" },
          { name: F.mustChangePassword, type: "checkbox", options: { icon: "check", color: "yellowBright" } },
          { name: F.verifyToken, type: "singleLineText" },
          { name: F.verifyTokenExpires, type: "number", options: { precision: 0 } },
        ],
      }),
    });
    cachedTableId = created.id;
    cachedForKey = key;
    return cachedTableId;
  })();

  try {
    return await ensureTablePromise;
  } finally {
    ensureTablePromise = null;
  }
}

function recordToUser(rec) {
  const f = rec.fields || {};
  return {
    id: rec.id,
    username: f[F.username] || "",
    name: f[F.name] || "",
    role: f[F.role] || "collaborateur",
    phone: f[F.phone] || "",
    email: f[F.email] || "",
    // Absence du champ (comptes migres depuis l'ancien stockage local, par
    // exemple) => considere verifie de longue date, jamais bloquant.
    emailVerified: f[F.emailVerified] !== false,
    passwordHash: f[F.passwordHash] || "",
    mustChangePassword: !!f[F.mustChangePassword],
    verifyToken: f[F.verifyToken] || undefined,
    verifyTokenExpires: f[F.verifyTokenExpires] || undefined,
    createdAt: rec.createdTime,
  };
}

function userToFields(u) {
  const fields = {};
  if (u.username !== undefined) fields[F.username] = u.username;
  if (u.name !== undefined) fields[F.name] = u.name;
  if (u.role !== undefined) fields[F.role] = u.role;
  if (u.phone !== undefined) fields[F.phone] = u.phone;
  if (u.email !== undefined) fields[F.email] = u.email;
  if (u.emailVerified !== undefined) fields[F.emailVerified] = !!u.emailVerified;
  if (u.passwordHash !== undefined) fields[F.passwordHash] = u.passwordHash;
  if (u.mustChangePassword !== undefined) fields[F.mustChangePassword] = !!u.mustChangePassword;
  // verifyToken/verifyTokenExpires : "suppression" = valeur vide/nulle (pas
  // de notion de "delete" d'un champ Airtable individuel).
  if ("verifyToken" in u) fields[F.verifyToken] = u.verifyToken || "";
  if ("verifyTokenExpires" in u) fields[F.verifyTokenExpires] = u.verifyTokenExpires || null;
  return fields;
}

async function listUsers(cfg) {
  const tableId = await ensureUsersTable(cfg);
  let all = [];
  let offset;
  do {
    const params = new URLSearchParams({ pageSize: "100" });
    if (offset) params.set("offset", offset);
    const data = await jsonFetch(`${API_ROOT}/${cfg.baseId}/${tableId}?${params.toString()}`, cfg);
    all = all.concat(data.records || []);
    offset = data.offset;
  } while (offset);
  return all.map(recordToUser);
}

async function findUserByUsername(cfg, username) {
  const users = await listUsers(cfg);
  return users.find((u) => u.username.toLowerCase() === String(username).toLowerCase());
}

async function findUserByEmail(cfg, email) {
  if (!email) return undefined;
  const users = await listUsers(cfg);
  return users.find((u) => (u.email || "").toLowerCase() === String(email).toLowerCase());
}

async function findUserById(cfg, id) {
  const tableId = await ensureUsersTable(cfg);
  try {
    const rec = await jsonFetch(`${API_ROOT}/${cfg.baseId}/${tableId}/${id}`, cfg);
    return recordToUser(rec);
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}

async function createUser(cfg, user) {
  const tableId = await ensureUsersTable(cfg);
  const data = await jsonFetch(`${API_ROOT}/${cfg.baseId}/${tableId}`, cfg, {
    method: "POST",
    body: JSON.stringify({ records: [{ fields: userToFields(user) }], typecast: true }),
  });
  return recordToUser(data.records[0]);
}

async function updateUser(cfg, id, patch) {
  const tableId = await ensureUsersTable(cfg);
  const data = await jsonFetch(`${API_ROOT}/${cfg.baseId}/${tableId}`, cfg, {
    method: "PATCH",
    body: JSON.stringify({ records: [{ id, fields: userToFields(patch) }], typecast: true }),
  });
  return recordToUser(data.records[0]);
}

async function deleteUser(cfg, id) {
  const tableId = await ensureUsersTable(cfg);
  const params = new URLSearchParams();
  params.append("records[]", id);
  await jsonFetch(`${API_ROOT}/${cfg.baseId}/${tableId}?${params.toString()}`, cfg, { method: "DELETE" });
}

module.exports = {
  TABLE_NAME,
  ensureUsersTable,
  listUsers,
  findUserByUsername,
  findUserByEmail,
  findUserById,
  createUser,
  updateUser,
  deleteUser,
};
