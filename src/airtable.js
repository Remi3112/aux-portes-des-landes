"use strict";
/**
 * Client Airtable minimal (API REST officielle) — utilise le jeton
 * personnel (PAT) et le Base ID enregistres via Parametres > Integrations.
 * Aucune modification de schema n'est jamais effectuee ici (pas de
 * creation/suppression de table ou de champ) : uniquement des
 * enregistrements (records).
 */
const db = require("./db");

const API_ROOT = "https://api.airtable.com/v0";

function getConfig() {
  const data = db.load();
  return data.integrations.airtable;
}

function assertConfigured() {
  const cfg = getConfig();
  if (!cfg.token || !cfg.baseId) {
    const err = new Error("Airtable n'est pas encore connecté. Configure-le dans Paramètres > Intégrations.");
    err.code = "AIRTABLE_NOT_CONFIGURED";
    throw err;
  }
  return cfg;
}

async function airtableFetch(pathSuffix, options = {}) {
  const cfg = assertConfigured();
  const url = `${API_ROOT}/${cfg.baseId}${pathSuffix}`;
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
  try { json = text ? JSON.parse(text) : {}; } catch (e) { json = { raw: text }; }
  if (!res.ok) {
    const msg = (json.error && (json.error.message || json.error.type)) || res.statusText;
    const err = new Error(`Airtable (${res.status}) : ${msg}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

async function listRecords(tableId, { pageSize = 100, filterByFormula, sort, view } = {}) {
  const params = new URLSearchParams();
  params.set("pageSize", String(Math.min(pageSize, 100)));
  params.set("returnFieldsByFieldId", "true"); // reponses indexees par Field ID (stable meme si un champ est renomme)
  if (filterByFormula) params.set("filterByFormula", filterByFormula);
  if (sort) sort.forEach((s, i) => { params.set(`sort[${i}][field]`, s.field); params.set(`sort[${i}][direction]`, s.direction || "asc"); });
  // Restreint aux enregistrements (et a l'ordre/tri) d'une VUE Airtable
  // precise (ex: "5 etoiles" sur Avis voyageurs) — Airtable applique alors
  // lui-meme le filtre et le tri configures dans cette vue. Accepte un nom
  // ou un ID de vue.
  if (view) params.set("view", view);

  let all = [];
  let offset;
  do {
    if (offset) params.set("offset", offset);
    const data = await airtableFetch(`/${tableId}?${params.toString()}`);
    all = all.concat(data.records || []);
    offset = data.offset;
    if (all.length >= pageSize) break;
  } while (offset);
  return all.slice(0, pageSize);
}

// NOTE IMPORTANTE : l'API Airtable n'accepte de maniere fiable que des NOMS de
// champ (pas des Field IDs) dans le corps des requetes de creation/modification.
// `returnFieldsByFieldId` ne controle que le format de la REPONSE, pas de l'entree
// (cf. documentation officielle). Le mapping id->nom est donc fait par l'appelant
// (routes/records.js) avant d'appeler createRecords/updateRecords ci-dessous.
async function createRecords(tableId, records) {
  return airtableFetch(`/${tableId}`, { method: "POST", body: JSON.stringify({ records, typecast: true, returnFieldsByFieldId: true }) });
}
async function updateRecords(tableId, records) {
  return airtableFetch(`/${tableId}`, { method: "PATCH", body: JSON.stringify({ records, typecast: true, returnFieldsByFieldId: true }) });
}
async function deleteRecords(tableId, recordIds) {
  const params = new URLSearchParams();
  recordIds.forEach((id) => params.append("records[]", id));
  return airtableFetch(`/${tableId}?${params.toString()}`, { method: "DELETE" });
}

/** Recupere le schema complet de la base (utilise pour les listes de choix des champs select). */
async function getBaseSchema() {
  const cfg = assertConfigured();
  const url = `https://api.airtable.com/v0/meta/bases/${cfg.baseId}/tables`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${cfg.token}` } });
  const json = await res.json();
  if (!res.ok) throw new Error(`Airtable meta (${res.status}) : ${(json.error && json.error.message) || res.statusText}`);
  return json.tables || [];
}

// Cache court (60s) du schema complet de la base, partage par tous les
// appelants (routes/config.js pour completer les formulaires avec les champs
// ajoutes directement dans Airtable, routes/records.js pour les listes de
// choix et l'ecriture de ces memes champs). Evite de re-interroger l'API Meta
// Airtable a chaque requete.
let baseSchemaCache = { at: 0, data: null };
async function getCachedBaseSchema() {
  if (baseSchemaCache.data && Date.now() - baseSchemaCache.at < 60_000) return baseSchemaCache.data;
  const data = await getBaseSchema();
  baseSchemaCache = { at: Date.now(), data };
  return data;
}

// "Singleflight" (meme principe que src/usersStore.js ensureUsersTable) :
// evite que deux requetes concurrentes ne cherchent chacune a creer le meme
// champ en double sur Airtable avant que le cache de schema ne soit rempli.
const ensureFieldPromises = {};

/**
 * Retrouve (ou cree si absent) un champ d'une table Airtable EXISTANTE, par
 * son nom, et retourne son Field ID. Utilise pour les champs geres par
 * l'application mais absents du schema Airtable tant qu'un admin ne les a
 * pas "provisionnes" une premiere fois (ex : lien de litige individuel par
 * prestataire menage, voir routes/settings.js).
 */
async function ensureFieldOnTable(tableId, fieldName, type, description) {
  const cfg = assertConfigured();
  const schema = await getCachedBaseSchema();
  const schemaTable = schema.find((t) => t.id === tableId);
  const existing = schemaTable && schemaTable.fields.find((f) => f.name === fieldName);
  if (existing) return existing.id;

  const key = `${cfg.baseId}::${tableId}::${fieldName}`;
  if (ensureFieldPromises[key]) return ensureFieldPromises[key];
  ensureFieldPromises[key] = (async () => {
    const url = `https://api.airtable.com/v0/meta/bases/${cfg.baseId}/tables/${tableId}/fields`;
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: fieldName, type, description }),
    });
    const text = await res.text();
    let json; try { json = text ? JSON.parse(text) : {}; } catch (e) { json = {}; }
    if (!res.ok) {
      const msg = (json.error && (json.error.message || json.error.type)) || res.statusText || `HTTP ${res.status}`;
      throw new Error(`Airtable (${res.status}) : ${msg}`);
    }
    // Invalide le cache de schema pour que le nouveau champ soit vu au
    // prochain appel (ex: par augmentTablesWithSchema cote routes/config.js).
    baseSchemaCache = { at: 0, data: null };
    return json.id;
  })();
  try {
    return await ensureFieldPromises[key];
  } finally {
    delete ensureFieldPromises[key];
  }
}

/**
 * Liste les vues Airtable (Grid view, vues filtrees/triees creees a la
 * main dans Airtable, ex: "5 etoiles" sur Avis voyageurs) d'une table donnee.
 * Le schema Meta Airtable inclut deja les vues de chaque table (pas d'appel
 * reseau supplementaire : reutilise le cache de getCachedBaseSchema).
 */
async function getViews(tableId) {
  const schema = await getCachedBaseSchema();
  const schemaTable = schema.find((t) => t.id === tableId);
  return (schemaTable && schemaTable.views) || [];
}

/** Teste la connexion (utilisé par Paramètres > Intégrations > Tester). */
async function testConnection(token, baseId) {
  const url = `https://api.airtable.com/v0/meta/bases/${baseId}/tables`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error((json.error && json.error.message) || `Erreur HTTP ${res.status}`);
  }
  const json = await res.json();
  return { ok: true, tableCount: (json.tables || []).length };
}

module.exports = { listRecords, createRecords, updateRecords, deleteRecords, getBaseSchema, getCachedBaseSchema, getViews, ensureFieldOnTable, testConnection, getConfig };
