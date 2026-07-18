"use strict";
const express = require("express");
const { TABLES, TABLE_ORDER, LINKED_FIELDS, visibleTables, permFor, augmentTablesWithSchema } = require("../src/tables");
const { requireAuth } = require("../src/auth");
const db = require("../src/db");
const airtable = require("../src/airtable");

const router = express.Router();

router.get("/", requireAuth, async (req, res) => {
  const role = req.session.user.role;
  const keys = visibleTables(role);
  const data = db.load();
  const airtableConnected = !!(data.integrations.airtable.token && data.integrations.airtable.baseId);
  // Complete la config statique avec les champs ajoutes directement dans
  // Airtable (voir augmentTablesWithSchema) : sans ca, un champ cree apres
  // coup dans Airtable resterait invisible dans les formulaires. Si Airtable
  // n'est pas connecte ou momentanement injoignable, on retombe simplement
  // sur la config statique (jamais bloquant pour l'affichage de la page).
  let effectiveTables = TABLES;
  if (airtableConnected) {
    try {
      const schema = await airtable.getCachedBaseSchema();
      effectiveTables = augmentTablesWithSchema(schema);
    } catch (e) {
      effectiveTables = TABLES;
    }
  }
  const tables = {};
  keys.forEach((k) => {
    const t = effectiveTables[k];
    tables[k] = {
      key: t.key, label: t.label, icon: t.icon, group: t.group,
      fields: t.fields, listCols: t.listCols, detailFields: t.detailFields,
      sensitive: t.sensitive || [], searchCols: t.searchCols || [],
      sections: t.sections || [],
      permission: permFor(role, k),
      selfNameFields: t.selfNameFields || null,
      prestataireEditable: t.prestataireEditable || [],
      prestataireLinkField: t.prestataireLinkField || null,
      waConfig: t.waConfig || null,
      // Champs multipleRecordLinks pour lesquels un vrai selecteur
      // d'enregistrements lies est disponible (voir LINKED_FIELDS).
      linkedFields: t.fields.filter((f) => f.t === "multipleRecordLinks" && LINKED_FIELDS[f.i]).map((f) => f.i),
    };
  });
  res.json({
    tableOrder: TABLE_ORDER.filter((k) => keys.includes(k)),
    tables,
    integrationsStatus: {
      airtable: airtableConnected,
      slack: !!(data.integrations.slack.botToken && (data.integrations.slack.channels || []).length),
      ai: !!data.integrations.ai.apiKey,
    },
  });
});

module.exports = router;
