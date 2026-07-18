"use strict";
const express = require("express");
const { TABLES, READONLY_TYPES, SLACK_NOTIFY_TABLES, LINKED_FIELDS, can, fieldsIdToName, labelForRecord, augmentTablesWithSchema } = require("../src/tables");
const { requireAuth } = require("../src/auth");
const airtable = require("../src/airtable");
const slack = require("../src/slack");
const db = require("../src/db");
const { rawText, scopeForRole } = require("../src/scope");

const router = express.Router();

/**
 * Pour les champs "multipleRecordLinks" reconnus (voir LINKED_FIELDS dans
 * src/tables.js), construit une correspondance { fieldId: { recordId: "libelle" } }
 * en interrogeant la table liee, pour afficher des NOMS plutot que des IDs
 * bruts dans les listes/formulaires.
 */
async function buildLinkedLabels(tbl) {
  const relevant = tbl.fields.filter((f) => f.t === "multipleRecordLinks" && LINKED_FIELDS[f.i]);
  if (!relevant.length) return {};
  const out = {};
  for (const f of relevant) {
    const targetKey = LINKED_FIELDS[f.i].table;
    const targetTbl = TABLES[targetKey];
    out[f.i] = {};
    try {
      const recs = await airtable.listRecords(targetTbl.tableId, { pageSize: 500 });
      recs.forEach((r) => {
        out[f.i][r.id] = labelForRecord(targetTbl, r.fields) || r.id;
      });
    } catch (e) {
      // si la table liee n'est pas lisible pour une raison quelconque, on
      // se contente de ne pas fournir de libelle (les IDs bruts restent visibles).
    }
  }
  return out;
}

router.get("/:tableKey", requireAuth, async (req, res) => {
  const { tableKey } = req.params;
  const tbl = TABLES[tableKey];
  if (!tbl) return res.status(404).json({ error: "Table inconnue." });
  if (!can(req.session.user.role, tableKey, "read")) return res.status(403).json({ error: "Accès non autorisé pour ton profil." });
  try {
    // ?view=<id ou nom de vue Airtable> : restreint (et trie) les
    // enregistrements selon une vue precise (ex: "5 etoiles" sur Avis
    // voyageurs) — voir aussi GET /:tableKey/views ci-dessous.
    const records = await airtable.listRecords(tbl.tableId, { pageSize: 1000, view: req.query.view || undefined });
    const normalized = records.map((r) => ({ id: r.id, createdTime: r.createdTime, fields: r.fields }));
    const scoped = scopeForRole(tbl, normalized, req.session.user);
    const linkedLabels = await buildLinkedLabels(tbl);
    res.json({ records: scoped, linkedLabels });
  } catch (e) {
    res.status(e.code === "AIRTABLE_NOT_CONFIGURED" ? 409 : 502).json({ error: e.message });
  }
});

/**
 * Vues Airtable disponibles pour une table (Grid view par defaut, plus toute
 * vue filtree/triee creee a la main dans Airtable, ex: "5 etoiles" sur Avis
 * voyageurs). Permet au frontend de proposer un selecteur de vue quand il y
 * en a plusieurs (voir public/app.js renderTableView).
 */
router.get("/:tableKey/views", requireAuth, async (req, res) => {
  const { tableKey } = req.params;
  const tbl = TABLES[tableKey];
  if (!tbl) return res.status(404).json({ error: "Table inconnue." });
  if (!can(req.session.user.role, tableKey, "read")) return res.status(403).json({ error: "Accès non autorisé pour ton profil." });
  try {
    const views = await airtable.getViews(tbl.tableId);
    res.json({ views: views.map((v) => ({ id: v.id, name: v.name, type: v.type })) });
  } catch (e) {
    res.status(e.code === "AIRTABLE_NOT_CONFIGURED" ? 409 : 502).json({ error: e.message });
  }
});

router.get("/:tableKey/choices/:fieldId", requireAuth, async (req, res) => {
  const { tableKey, fieldId } = req.params;
  const tbl = TABLES[tableKey];
  if (!tbl) return res.status(404).json({ error: "Table inconnue." });
  if (!can(req.session.user.role, tableKey, "read")) return res.status(403).json({ error: "Accès non autorisé." });
  try {
    const schemaTables = await getCachedSchema();
    const schemaTable = schemaTables.find((t) => t.id === tbl.tableId);
    const field = schemaTable && schemaTable.fields.find((f) => f.id === fieldId);
    const choices = (field && field.options && field.options.choices) || [];
    res.json({ choices: choices.map((c) => ({ id: c.id, name: c.name })) });
  } catch (e) {
    res.status(e.code === "AIRTABLE_NOT_CONFIGURED" ? 409 : 502).json({ error: e.message });
  }
});

/**
 * Options selectionnables pour un champ "multipleRecordLinks" reconnu
 * (voir LINKED_FIELDS). Utilise pour construire le selecteur d'enregistrements
 * lies dans le formulaire de creation/edition.
 */
router.get("/:tableKey/linked/:fieldId", requireAuth, async (req, res) => {
  const { tableKey, fieldId } = req.params;
  const tbl = TABLES[tableKey];
  if (!tbl) return res.status(404).json({ error: "Table inconnue." });
  if (!can(req.session.user.role, tableKey, "read")) return res.status(403).json({ error: "Accès non autorisé." });
  const link = LINKED_FIELDS[fieldId];
  if (!link) return res.status(404).json({ error: "Ce champ n'est pas relié à une liste de sélection connue." });
  const targetTbl = TABLES[link.table];
  try {
    const records = await airtable.listRecords(targetTbl.tableId, { pageSize: 500 });
    const options = records.map((r) => ({ id: r.id, label: labelForRecord(targetTbl, r.fields) || r.id }));
    res.json({ options });
  } catch (e) {
    res.status(e.code === "AIRTABLE_NOT_CONFIGURED" ? 409 : 502).json({ error: e.message });
  }
});

async function getCachedSchema() {
  return airtable.getCachedBaseSchema();
}

/**
 * Version de la config d'une table completee avec les champs Airtable
 * decouverts dynamiquement (voir augmentTablesWithSchema dans src/tables.js).
 * Utilisee a la creation/modification d'enregistrements pour que les champs
 * ajoutes directement dans Airtable (sans modification du code) puissent
 * eux aussi etre ecrits, pas seulement lus. Si Airtable est injoignable, on
 * retombe simplement sur la config statique (jamais bloquant).
 */
async function getAugmentedTable(tableKey) {
  const tbl = TABLES[tableKey];
  if (!tbl) return tbl;
  try {
    const schema = await getCachedSchema();
    return augmentTablesWithSchema(schema)[tableKey] || tbl;
  } catch (e) {
    return tbl;
  }
}

function filterWritableFields(tbl, user, fields) {
  const out = {};
  Object.entries(fields || {}).forEach(([fid, val]) => {
    const f = tbl.fields.find((f) => f.i === fid);
    const type = f ? f.t : null;
    const isRecognizedLink = type === "multipleRecordLinks" && LINKED_FIELDS[fid];
    if (type && READONLY_TYPES.has(type) && !isRecognizedLink) return; // jamais ecrire un champ calcule (sauf lien reconnu)
    if (user.role === "prestataire" && !(tbl.prestataireEditable || []).includes(fid)) return;
    if ((tbl.sensitive || []).includes(fid) && user.role === "prestataire") return;
    out[fid] = val;
  });
  return out;
}

router.post("/:tableKey", requireAuth, async (req, res) => {
  const { tableKey } = req.params;
  const tbl = TABLES[tableKey];
  if (!tbl) return res.status(404).json({ error: "Table inconnue." });
  if (!can(req.session.user.role, tableKey, "create")) return res.status(403).json({ error: "Création non autorisée pour ton profil." });
  try {
    const augTbl = await getAugmentedTable(tableKey);
    const fieldsById = filterWritableFields(augTbl, req.session.user, req.body.fields);
    const fieldsByName = fieldsIdToName(augTbl, fieldsById);
    const result = await airtable.createRecords(tbl.tableId, [{ fields: fieldsByName }]);
    db.addActivity({ type: "create", user: req.session.user.username, table: tableKey });
    if (SLACK_NOTIFY_TABLES.includes(tableKey)) {
      const preview = Object.values(fieldsById).map(rawText).filter(Boolean).slice(0, 3).join(" — ");
      slack.notify(`🆕 Nouvel enregistrement dans *${tbl.label}* (par ${req.session.user.name}) : ${preview || "(voir Airtable)"}`);
    }
    res.json({ record: result.records ? result.records[0] : result });
  } catch (e) {
    res.status(e.code === "AIRTABLE_NOT_CONFIGURED" ? 409 : 502).json({ error: e.message });
  }
});

router.patch("/:tableKey/:recordId", requireAuth, async (req, res) => {
  const { tableKey, recordId } = req.params;
  const tbl = TABLES[tableKey];
  if (!tbl) return res.status(404).json({ error: "Table inconnue." });
  if (!can(req.session.user.role, tableKey, "update")) return res.status(403).json({ error: "Modification non autorisée pour ton profil." });
  try {
    const augTbl = await getAugmentedTable(tableKey);
    const fieldsById = filterWritableFields(augTbl, req.session.user, req.body.fields);
    const fieldsByName = fieldsIdToName(augTbl, fieldsById);
    const result = await airtable.updateRecords(tbl.tableId, [{ id: recordId, fields: fieldsByName }]);
    db.addActivity({ type: "update", user: req.session.user.username, table: tableKey, recordId });
    res.json({ record: result.records ? result.records[0] : result });
  } catch (e) {
    res.status(e.code === "AIRTABLE_NOT_CONFIGURED" ? 409 : 502).json({ error: e.message });
  }
});

router.delete("/:tableKey/:recordId", requireAuth, async (req, res) => {
  const { tableKey, recordId } = req.params;
  const tbl = TABLES[tableKey];
  if (!tbl) return res.status(404).json({ error: "Table inconnue." });
  if (!can(req.session.user.role, tableKey, "delete")) return res.status(403).json({ error: "Suppression réservée aux administrateurs." });
  try {
    await airtable.deleteRecords(tbl.tableId, [recordId]);
    db.addActivity({ type: "delete", user: req.session.user.username, table: tableKey, recordId });
    res.json({ ok: true });
  } catch (e) {
    res.status(e.code === "AIRTABLE_NOT_CONFIGURED" ? 409 : 502).json({ error: e.message });
  }
});

module.exports = router;
