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

async function listRecords(tableId, { pageSize = 100, filterByFormula, sort } = {}) {
  const params = new URLSearchParams();
  params.set("pageSize", String(Math.min(pageSize, 100)));
  params.set("returnFieldsByFieldId", "true"); // reponses indexees par Field ID (stable meme si un champ est renomme)
  if (filterByFormula) params.set("filterByFormula", filterByFormula);
  if (sort) sort.forEach((s, i) => { params.set(`sort[${i}][field]`, s.field); params.set(`sort[${i}][direction]`, s.direction || "asc"); });

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

module.exports = { listRecords, createRecords, updateRecords, deleteRecords, getBaseSchema, testConnection, getConfig };
