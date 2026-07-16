"use strict";
/**
 * Client IA minimal (API Anthropic — Claude) pour l'assistant interne.
 * Utilise la clé enregistrée via Paramètres > Intégrations.
 */
const db = require("./db");

function getConfig() {
  const data = db.load();
  return data.integrations.ai;
}

async function testConnection(apiKey, model) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: model || "claude-haiku-4-5-20251001",
      max_tokens: 16,
      messages: [{ role: "user", content: "Réponds juste OK." }],
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error((json.error && json.error.message) || `Erreur HTTP ${res.status}`);
  return { ok: true };
}

async function ask(prompt) {
  const cfg = getConfig();
  if (!cfg.apiKey) {
    const err = new Error("L'assistant IA n'est pas configuré. Ajoute une clé Anthropic dans Paramètres > Intégrations.");
    err.code = "AI_NOT_CONFIGURED";
    throw err;
  }
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": cfg.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: cfg.model || "claude-haiku-4-5-20251001",
      max_tokens: 800,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error((json.error && json.error.message) || `Erreur HTTP ${res.status}`);
  }
  const text = (json.content || []).map((c) => c.text || "").join("\n").trim();
  return text || "(réponse vide)";
}

module.exports = { ask, testConnection, getConfig };
