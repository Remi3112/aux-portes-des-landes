"use strict";
/**
 * Client Slack minimal (API Web officielle) — utilise le jeton bot
 * (xoxb-...) enregistre via Parametres > Integrations.
 *
 * Multi-canaux : l'appli peut etre connectee a PLUSIEURS canaux Slack en
 * meme temps (ex: #equipe-conciergerie, #urgences, #proprietaires...).
 * Tous restent accessibles depuis le meme ecran "Messagerie Slack" de
 * l'application, via un selecteur de canal cote frontend.
 */
const db = require("./db");

function getConfig() {
  const data = db.load();
  return data.integrations.slack;
}

function assertConfigured() {
  const cfg = getConfig();
  if (!cfg.botToken || !cfg.channels || !cfg.channels.length) {
    const err = new Error("Slack n'est pas encore connecté. Configure-le dans Paramètres > Intégrations.");
    err.code = "SLACK_NOT_CONFIGURED";
    throw err;
  }
  return cfg;
}

// Traduit les codes d'erreur Slack les plus courants en explications
// comprehensibles (l'API Slack ne renvoie que des codes courts type
// "message_limit_exceeded", pas de message humain).
const SLACK_ERROR_HINTS = {
  message_limit_exceeded:
    "la limite de messages du plan Slack gratuit de cet espace de travail a été atteinte (10 000 messages au total, tous canaux confondus). Slack bloque l'envoi de nouveaux messages tant que le plan n'est pas mis à niveau (Slack > Paramètres > Plans) — supprimer d'anciens messages ne suffit généralement pas.",
  channel_not_found:
    "le canal configuré est introuvable. Vérifie l'ID du canal dans Paramètres > Intégrations, et que le bot y a bien été invité.",
  not_in_channel:
    "le bot Slack n'est pas membre de ce canal. Va dans Slack, ouvre le canal concerné et tape /invite @nom-du-bot.",
  invalid_auth:
    "le jeton Slack (Bot Token) n'est plus valide. Reconnecte Slack dans Paramètres > Intégrations.",
  account_inactive:
    "le jeton Slack a été révoqué ou le compte associé est désactivé. Reconnecte Slack dans Paramètres > Intégrations.",
  token_revoked:
    "le jeton Slack a été révoqué. Reconnecte Slack dans Paramètres > Intégrations.",
  msg_too_long:
    "le message est trop long pour Slack. Raccourcis-le et réessaie.",
  no_text:
    "le message est vide.",
  is_archived:
    "ce canal Slack a été archivé et n'accepte plus de nouveaux messages.",
  rate_limited:
    "trop de messages ont été envoyés en peu de temps vers Slack. Réessaie dans quelques instants.",
};

async function slackFetch(method, body, token) {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body || {}),
  });
  const json = await res.json();
  if (!json.ok) {
    const hint = SLACK_ERROR_HINTS[json.error];
    const err = new Error(hint ? `Slack : ${hint}` : `Slack (${method}) : ${json.error || "erreur inconnue"}`);
    err.slackCode = json.error;
    throw err;
  }
  return json;
}

async function testConnection(botToken) {
  const info = await slackFetch("auth.test", {}, botToken);
  return { ok: true, team: info.team, botUser: info.user };
}

function listChannels() {
  const cfg = getConfig();
  return cfg.channels || [];
}

function findChannel(channelId) {
  return listChannels().find((c) => c.id === channelId);
}

async function postMessage(text, channelId) {
  const cfg = assertConfigured();
  const channel = findChannel(channelId);
  if (!channel) {
    const err = new Error("Canal Slack inconnu ou non configuré dans l'application.");
    err.code = "SLACK_CHANNEL_UNKNOWN";
    throw err;
  }
  return slackFetch("chat.postMessage", { channel: channel.id, text }, cfg.botToken);
}

async function getRecentMessages(channelId, limit = 30) {
  const cfg = assertConfigured();
  const channel = findChannel(channelId);
  if (!channel) {
    const err = new Error("Canal Slack inconnu ou non configuré dans l'application.");
    err.code = "SLACK_CHANNEL_UNKNOWN";
    throw err;
  }
  const json = await slackFetch("conversations.history", { channel: channel.id, limit }, cfg.botToken);
  return (json.messages || []).slice().reverse();
}

/**
 * Notification automatique best-effort (nouveau litige, prospect, etc.),
 * diffusee sur TOUS les canaux Slack configures. N'echoue jamais bruyamment
 * si Slack n'est pas configure ou si un envoi rate sur un canal.
 */
async function notify(text) {
  const cfg = getConfig();
  if (!cfg.botToken || !cfg.channels || !cfg.channels.length) return { skipped: true };
  const results = await Promise.allSettled(
    cfg.channels.map((c) => slackFetch("chat.postMessage", { channel: c.id, text }, cfg.botToken))
  );
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      console.error(`[slack] notification ignorée sur ${cfg.channels[i].name || cfg.channels[i].id} :`, r.reason.message);
    }
  });
  return { ok: true };
}

module.exports = { testConnection, postMessage, getRecentMessages, notify, getConfig, listChannels };
