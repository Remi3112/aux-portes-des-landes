"use strict";
const express = require("express");
const { TABLES, TABLE_ORDER, LINKED_FIELDS, visibleTables, permFor } = require("../src/tables");
const { requireAuth } = require("../src/auth");
const db = require("../src/db");

const router = express.Router();

router.get("/", requireAuth, (req, res) => {
  const role = req.session.user.role;
  const keys = visibleTables(role);
  const tables = {};
  keys.forEach((k) => {
    const t = TABLES[k];
    tables[k] = {
      key: t.key, label: t.label, icon: t.icon, group: t.group,
      fields: t.fields, listCols: t.listCols, detailFields: t.detailFields,
      sensitive: t.sensitive || [], searchCols: t.searchCols || [],
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
  const data = db.load();
  res.json({
    tableOrder: TABLE_ORDER.filter((k) => keys.includes(k)),
    tables,
    integrationsStatus: {
      airtable: !!(data.integrations.airtable.token && data.integrations.airtable.baseId),
      slack: !!(data.integrations.slack.botToken && (data.integrations.slack.channels || []).length),
      ai: !!data.integrations.ai.apiKey,
    },
  });
});

module.exports = router;
