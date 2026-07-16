"use strict";
const express = require("express");
const { TABLES, AI_KEYWORDS, visibleTables } = require("../src/tables");
const { requireAuth } = require("../src/auth");
const airtable = require("../src/airtable");
const ai = require("../src/ai");
const { rawText, scopeForRole } = require("../src/scope");

const router = express.Router();

function routeTablesForQuestion(question, allowedKeys) {
  const ql = question.toLowerCase();
  const matched = Object.entries(AI_KEYWORDS)
    .filter(([k, words]) => allowedKeys.includes(k) && words.some((w) => ql.includes(w)))
    .map(([k]) => k);
  return matched.slice(0, 2);
}

async function buildContext(user, question) {
  const allowed = visibleTables(user.role);
  if (user.role === "prestataire") {
    const tbl = TABLES.logements;
    const records = await airtable.listRecords(tbl.tableId, { pageSize: 200 });
    const mine = scopeForRole(tbl, records.map((r) => ({ id: r.id, fields: r.fields })), user);
    const rows = mine.map((r) => {
      const o = {};
      tbl.detailFields.forEach((fid) => {
        const f = tbl.fields.find((f) => f.i === fid);
        o[f.n] = rawText(r.fields[fid]);
      });
      return o;
    });
    return [{ label: "Logements assignés à ce prestataire", rows }];
  }
  const keys = routeTablesForQuestion(question, allowed);
  if (!keys.length) return [{ label: "Aucune donnée spécifique détectée pour cette question", rows: [] }];
  const out = [];
  for (const k of keys) {
    const tbl = TABLES[k];
    const records = await airtable.listRecords(tbl.tableId, { pageSize: 40 });
    const rows = records.slice(0, 40).map((r) => {
      const o = {};
      tbl.listCols.forEach((fid) => {
        if ((tbl.sensitive || []).includes(fid)) return;
        const f = tbl.fields.find((f) => f.i === fid);
        o[f.n] = rawText(r.fields[fid]);
      });
      return o;
    });
    out.push({ table: tbl.label, rows });
  }
  return out;
}

router.post("/chat", requireAuth, async (req, res) => {
  const { question } = req.body || {};
  if (!question || !question.trim()) return res.status(400).json({ error: "Question vide." });
  try {
    const ctx = await buildContext(req.session.user, question);
    const prompt = `Tu es l'assistant interne de la conciergerie "Aux Portes des Landes" (gestion Airbnb/Booking dans les Landes). Réponds en français, de façon brève et concrète, UNIQUEMENT à partir des données JSON ci-dessous. Si les données ne permettent pas de répondre, dis-le clairement et invite à contacter un administrateur ou consulter Airtable directement. Ne jamais inventer de code d'accès, tarif ou coordonnée absent des données.\n\nDonnées :\n${JSON.stringify(ctx).slice(0, 12000)}\n\nQuestion : ${question}`;
    const answer = await ai.ask(prompt);
    res.json({ answer });
  } catch (e) {
    const status = e.code === "AI_NOT_CONFIGURED" || e.code === "AIRTABLE_NOT_CONFIGURED" ? 409 : 502;
    res.status(status).json({ error: e.message });
  }
});

module.exports = router;
