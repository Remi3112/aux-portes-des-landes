"use strict";
const express = require("express");
const slack = require("../src/slack");
const { requireAuth } = require("../src/auth");

const router = express.Router();

// Messagerie interne : reservee a l'admin et aux collaborateurs (les prestataires
// utilisent l'assistant IA / leur planning, pas le canal d'equipe Slack).
function requireTeamAccess(req, res, next) {
  if (!["admin", "collaborateur"].includes(req.session.user.role)) {
    return res.status(403).json({ error: "Messagerie réservée à l'équipe interne." });
  }
  next();
}

// Liste des canaux Slack connectes (multi-canaux) : sert a construire le
// selecteur de canal cote frontend, tous accessibles dans le meme ecran.
router.get("/channels", requireAuth, requireTeamAccess, (req, res) => {
  res.json({ channels: slack.listChannels() });
});

router.get("/messages", requireAuth, requireTeamAccess, async (req, res) => {
  const { channel } = req.query;
  try {
    const channels = slack.listChannels();
    if (!channels.length) return res.status(409).json({ error: "Aucun canal Slack configuré." });
    const target = channel || channels[0].id;
    const messages = await slack.getRecentMessages(target, 40);
    res.json({ messages, channel: target });
  } catch (e) {
    res.status(e.code === "SLACK_NOT_CONFIGURED" ? 409 : 502).json({ error: e.message });
  }
});

router.post("/messages", requireAuth, requireTeamAccess, async (req, res) => {
  const { text, channel } = req.body || {};
  if (!text || !text.trim()) return res.status(400).json({ error: "Message vide." });
  try {
    const channels = slack.listChannels();
    if (!channels.length) return res.status(409).json({ error: "Aucun canal Slack configuré." });
    const target = channel || channels[0].id;
    await slack.postMessage(`${text.trim()}\n— _envoyé par ${req.session.user.name} via la centrale de gestion_`, target);
    res.json({ ok: true, channel: target });
  } catch (e) {
    res.status(e.code === "SLACK_NOT_CONFIGURED" ? 409 : 502).json({ error: e.message });
  }
});

module.exports = router;
