"use strict";
const express = require("express");
const db = require("../src/db");
const airtable = require("../src/airtable");
const slack = require("../src/slack");
const ai = require("../src/ai");
const email = require("../src/email");
const { requireAuth, requireAdmin } = require("../src/auth");
const { TABLES, TABLE_ORDER, ACCESS_LEVELS, permFor } = require("../src/tables");
const { scopeForRole, rawText } = require("../src/scope");

// Nom du champ Airtable (table "Agents de menage") qui porte le lien
// individuel de declaration de litige de chaque prestataire. Provisionne
// automatiquement (voir airtable.ensureFieldOnTable) la premiere fois qu'un
// admin ouvre Parametres > Agents de menage, ou qu'un prestataire ouvre
// Declarer un litige — jamais besoin de le creer a la main dans Airtable.
const MENAGE_LITIGE_FIELD_NAME = "Lien litige (déclarer un incident)";
const MENAGE_LITIGE_FIELD_DESC =
  "Lien individuel vers le formulaire Airtable de declaration de litige de ce prestataire de menage. " +
  "Gere depuis Parametres > Agents de menage dans l'application — ne pas renommer ce champ.";

const FORM_LINK_AUDIENCES = ["voyageur", "prestataire", "proprietaire", "collaborateur", "tous"];
// Meme jeu de valeurs pour les modeles WhatsApp (Parametres > Modeles
// WhatsApp) : determine dans quel(s) composeur(s) WhatsApp un modele apparait.
const TEMPLATE_AUDIENCES = FORM_LINK_AUDIENCES;

const router = express.Router();
const crypto = require("crypto");

// Modeles WhatsApp / liens de formulaires : lecture reservee a l'equipe
// interne (admin + collaborateur), pas aux prestataires menage. Ecriture
// (ajout/modif/suppression) reservee aux admins, comme le reste des
// Parametres.
function requireTeamAccess(req, res, next) {
  if (!["admin", "collaborateur"].includes(req.session.user.role)) {
    return res.status(403).json({ error: "Accès réservé à l'équipe interne." });
  }
  next();
}

function maskToken(t) {
  if (!t) return "";
  if (t.length <= 8) return "••••••••";
  return t.slice(0, 4) + "…" + t.slice(-4);
}

// Lecture : accessible a tous les connectes (pour savoir si l'IA/Slack sont actifs),
// mais les jetons complets ne sont JAMAIS renvoyes au frontend (uniquement un apercu masqué).
router.get("/integrations", requireAuth, (req, res) => {
  const data = db.load();
  const { airtable: at, slack: sl, ai: aiCfg } = data.integrations;
  res.json({
    airtable: { baseId: at.baseId, tokenPreview: maskToken(at.token), connected: !!(at.token && at.baseId) },
    slack: {
      channels: sl.channels || [],
      tokenPreview: maskToken(sl.botToken),
      connected: !!(sl.botToken && (sl.channels || []).length),
    },
    ai: { model: aiCfg.model, tokenPreview: maskToken(aiCfg.apiKey), connected: !!aiCfg.apiKey },
    email: {
      user: data.integrations.email.user || "",
      fromName: data.integrations.email.fromName || "Aux Portes des Landes",
      tokenPreview: maskToken(data.integrations.email.appPassword),
      connected: !!(data.integrations.email.user && data.integrations.email.appPassword),
    },
  });
});

router.post("/integrations/airtable", requireAdmin, async (req, res) => {
  const { token, baseId } = req.body || {};
  if (!token || !baseId) return res.status(400).json({ error: "Jeton et Base ID requis." });
  try {
    const result = await airtable.testConnection(token.trim(), baseId.trim());
    const data = db.load();
    data.integrations.airtable = { token: token.trim(), baseId: baseId.trim(), connected: true };
    db.save(data);
    db.addActivity({ type: "integration_saved", user: req.session.user.username, table: "airtable" });
    // Connecter Airtable declenche (au premier acces a un compte) la migration
    // des comptes locaux vers la table Airtable "Utilisateurs appli" (voir
    // src/db.js) — ce qui change l'identifiant interne de CHAQUE compte, y
    // compris celui de l'admin en train de faire cette requete. On rafraichit
    // donc immediatement sa propre session pour ne pas rester connecte avec
    // un identifiant perime (qui ferait echouer ses actions suivantes, ex.
    // changer son propre mot de passe ou son propre telephone).
    const refreshed = await db.findUserByUsername(req.session.user.username);
    if (refreshed) req.session.user = { ...req.session.user, id: refreshed.id };
    res.json({ ok: true, tableCount: result.tableCount });
  } catch (e) {
    res.status(400).json({ error: "Connexion Airtable impossible : " + e.message });
  }
});

// Slack multi-canaux : "channels" est un tableau [{ id, name }, ...]. Tous
// les canaux fournis sont verifies/enregistres ensemble ; ils restent tous
// accessibles depuis le meme ecran "Messagerie Slack" de l'application via
// un selecteur de canal.
router.post("/integrations/slack", requireAdmin, async (req, res) => {
  const { botToken, channels } = req.body || {};
  if (!botToken || !Array.isArray(channels) || !channels.length) {
    return res.status(400).json({ error: "Jeton bot et au moins un canal requis." });
  }
  const cleanChannels = channels
    .map((c) => ({ id: String((c && c.id) || "").trim(), name: String((c && c.name) || "").trim() }))
    .filter((c) => c.id);
  if (!cleanChannels.length) return res.status(400).json({ error: "Au moins un ID de canal valide est requis." });
  // Deduplique par ID de canal, garde le dernier nom fourni.
  const byId = new Map();
  cleanChannels.forEach((c) => byId.set(c.id, { id: c.id, name: c.name || c.id }));
  const finalChannels = Array.from(byId.values());
  try {
    const result = await slack.testConnection(botToken.trim());
    const data = db.load();
    data.integrations.slack = { botToken: botToken.trim(), channels: finalChannels, connected: true };
    db.save(data);
    db.addActivity({ type: "integration_saved", user: req.session.user.username, table: "slack" });
    res.json({ ok: true, team: result.team, botUser: result.botUser, channelCount: finalChannels.length });
  } catch (e) {
    res.status(400).json({ error: "Connexion Slack impossible : " + e.message });
  }
});

router.post("/integrations/ai", requireAdmin, async (req, res) => {
  const { apiKey, model } = req.body || {};
  if (!apiKey) return res.status(400).json({ error: "Clé API requise." });
  try {
    await ai.testConnection(apiKey.trim(), model);
    const data = db.load();
    data.integrations.ai = { provider: "anthropic", apiKey: apiKey.trim(), model: model || "claude-haiku-4-5-20251001", connected: true };
    db.save(data);
    db.addActivity({ type: "integration_saved", user: req.session.user.username, table: "ai" });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: "Connexion IA impossible : " + e.message });
  }
});

// Compte Gmail (mot de passe d'application) utilise pour envoyer les emails
// de validation de compte a l'inscription (voir routes/auth.js -> /signup).
router.post("/integrations/email", requireAdmin, async (req, res) => {
  const { user, appPassword, fromName } = req.body || {};
  if (!user || !appPassword) return res.status(400).json({ error: "Adresse Gmail et mot de passe d'application requis." });
  try {
    await email.testConnection(user.trim(), appPassword.trim());
    const data = db.load();
    data.integrations.email = {
      user: user.trim(),
      appPassword: appPassword.trim(),
      fromName: (fromName || "Aux Portes des Landes").trim(),
      connected: true,
    };
    db.save(data);
    db.addActivity({ type: "integration_saved", user: req.session.user.username, table: "email" });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: "Connexion Gmail impossible : " + e.message });
  }
});

router.delete("/integrations/:name", requireAdmin, (req, res) => {
  const { name } = req.params;
  if (!["airtable", "slack", "ai", "email"].includes(name)) return res.status(404).json({ error: "Intégration inconnue." });
  const data = db.load();
  if (name === "airtable") data.integrations.airtable = { token: "", baseId: "", connected: false };
  if (name === "slack") data.integrations.slack = { botToken: "", channels: [], connected: false };
  if (name === "ai") data.integrations.ai = { provider: "anthropic", apiKey: "", model: data.integrations.ai.model, connected: false };
  if (name === "email") data.integrations.email = { user: "", appPassword: "", fromName: data.integrations.email.fromName, connected: false };
  db.save(data);
  db.addActivity({ type: "integration_removed", user: req.session.user.username, table: name });
  res.json({ ok: true });
});

// ---- Modeles de messages WhatsApp (Parametres > Modeles WhatsApp) ----
function cleanTemplateAudience(a) {
  return TEMPLATE_AUDIENCES.includes(a) ? a : "tous";
}

router.get("/whatsapp-templates", requireAuth, requireTeamAccess, (req, res) => {
  const data = db.load();
  res.json({ templates: data.whatsappTemplates || [] });
});

router.post("/whatsapp-templates", requireAdmin, (req, res) => {
  const { name, body, audience } = req.body || {};
  if (!name || !name.trim() || !body || !body.trim()) return res.status(400).json({ error: "Nom et texte du modèle requis." });
  const data = db.load();
  const tpl = { id: crypto.randomUUID(), name: name.trim(), body: body.trim(), audience: cleanTemplateAudience(audience) };
  data.whatsappTemplates = [...(data.whatsappTemplates || []), tpl];
  db.save(data);
  db.addActivity({ type: "whatsapp_template_created", user: req.session.user.username, table: tpl.name });
  res.json({ template: tpl });
});

router.put("/whatsapp-templates/:id", requireAdmin, (req, res) => {
  const { name, body, audience } = req.body || {};
  if (!name || !name.trim() || !body || !body.trim()) return res.status(400).json({ error: "Nom et texte du modèle requis." });
  const data = db.load();
  const tpl = (data.whatsappTemplates || []).find((t) => t.id === req.params.id);
  if (!tpl) return res.status(404).json({ error: "Modèle introuvable." });
  tpl.name = name.trim();
  tpl.body = body.trim();
  tpl.audience = cleanTemplateAudience(audience);
  db.save(data);
  res.json({ template: tpl });
});

router.delete("/whatsapp-templates/:id", requireAdmin, (req, res) => {
  const data = db.load();
  const before = (data.whatsappTemplates || []).length;
  data.whatsappTemplates = (data.whatsappTemplates || []).filter((t) => t.id !== req.params.id);
  if (data.whatsappTemplates.length === before) return res.status(404).json({ error: "Modèle introuvable." });
  db.save(data);
  res.json({ ok: true });
});

// ---- Liens de formulaires Airtable (Parametres > Liens de formulaires) ----
router.get("/form-links", requireAuth, requireTeamAccess, (req, res) => {
  const data = db.load();
  res.json({ links: data.formLinks || [] });
});

function cleanAudience(a) {
  return FORM_LINK_AUDIENCES.includes(a) ? a : "tous";
}

router.post("/form-links", requireAdmin, (req, res) => {
  const { label, url, audience } = req.body || {};
  if (!label || !label.trim() || !url || !url.trim()) return res.status(400).json({ error: "Nom et lien requis." });
  if (!/^https?:\/\//i.test(url.trim())) return res.status(400).json({ error: "Le lien doit commencer par http:// ou https://" });
  const data = db.load();
  const link = { id: crypto.randomUUID(), label: label.trim(), url: url.trim(), audience: cleanAudience(audience) };
  data.formLinks = [...(data.formLinks || []), link];
  db.save(data);
  db.addActivity({ type: "form_link_created", user: req.session.user.username, table: link.label });
  res.json({ link });
});

router.put("/form-links/:id", requireAdmin, (req, res) => {
  const { label, url, audience } = req.body || {};
  if (!label || !label.trim() || !url || !url.trim()) return res.status(400).json({ error: "Nom et lien requis." });
  if (!/^https?:\/\//i.test(url.trim())) return res.status(400).json({ error: "Le lien doit commencer par http:// ou https://" });
  const data = db.load();
  const link = (data.formLinks || []).find((l) => l.id === req.params.id);
  if (!link) return res.status(404).json({ error: "Lien introuvable." });
  link.label = label.trim();
  link.url = url.trim();
  link.audience = cleanAudience(audience);
  db.save(data);
  res.json({ link });
});

router.delete("/form-links/:id", requireAdmin, (req, res) => {
  const data = db.load();
  const before = (data.formLinks || []).length;
  data.formLinks = (data.formLinks || []).filter((l) => l.id !== req.params.id);
  if (data.formLinks.length === before) return res.status(404).json({ error: "Lien introuvable." });
  db.save(data);
  res.json({ ok: true });
});

// ---- Liens litige individuels par prestataire menage (Parametres > Agents
// de menage) ----
// Contrairement aux autres reglages de Parametres (stockes dans data/db.json),
// ce lien est stocke DIRECTEMENT dans Airtable, sur la table "Agents de
// menage" elle-meme (voir MENAGE_LITIGE_FIELD_NAME) : c'est la table qui fait
// deja foi pour savoir quel prestataire est associe a quel(s) logement(s), et
// ca evite de dupliquer cette information entre Airtable et l'application.
// Le champ est cree automatiquement dans Airtable au premier appel si besoin
// (voir airtable.ensureFieldOnTable) — jamais besoin de le creer a la main.
router.get("/menage-litige-links", requireAuth, requireTeamAccess, async (req, res) => {
  try {
    const fieldId = await airtable.ensureFieldOnTable(
      TABLES.menage.tableId,
      MENAGE_LITIGE_FIELD_NAME,
      "url",
      MENAGE_LITIGE_FIELD_DESC
    );
    const records = await airtable.listRecords(TABLES.menage.tableId, { pageSize: 200 });
    const items = records.map((r) => ({
      id: r.id,
      nom: rawText(r.fields.fld3VZR2uFZVnsl28),
      prenom: rawText(r.fields.fld3hjQS2PC9Zf6ru),
      telephone: rawText(r.fields.fldRbzJpuWfZmxLAs),
      litigeUrl: r.fields[fieldId] || "",
    }));
    res.json({ items });
  } catch (e) {
    res.status(e.code === "AIRTABLE_NOT_CONFIGURED" ? 409 : 502).json({ error: e.message });
  }
});

router.patch("/menage-litige-links/:id", requireAdmin, async (req, res) => {
  const url = (req.body && req.body.url) || "";
  const cleanUrl = url.trim();
  if (cleanUrl && !/^https?:\/\//i.test(cleanUrl)) {
    return res.status(400).json({ error: "Le lien doit commencer par http:// ou https://" });
  }
  try {
    await airtable.ensureFieldOnTable(TABLES.menage.tableId, MENAGE_LITIGE_FIELD_NAME, "url", MENAGE_LITIGE_FIELD_DESC);
    // Ecriture par NOM de champ (voir note dans src/airtable.js) : fiable
    // quel que soit le Field ID, meme si le champ vient d'etre cree.
    await airtable.updateRecords(TABLES.menage.tableId, [{ id: req.params.id, fields: { [MENAGE_LITIGE_FIELD_NAME]: cleanUrl } }]);
    db.addActivity({ type: "update", user: req.session.user.username, table: "menage", recordId: req.params.id });
    res.json({ ok: true });
  } catch (e) {
    res.status(e.code === "AIRTABLE_NOT_CONFIGURED" ? 409 : 502).json({ error: e.message });
  }
});

// Lien litige propre au prestataire connecte (page "Declarer un litige") :
// jamais de liste partagee entre comptes, uniquement SA propre fiche Agent
// de menage (meme logique de scope que /api/records/menage cote prestataire).
router.get("/my-litige-link", requireAuth, async (req, res) => {
  if (req.session.user.role !== "prestataire") return res.json({ url: null });
  try {
    const fieldId = await airtable.ensureFieldOnTable(
      TABLES.menage.tableId,
      MENAGE_LITIGE_FIELD_NAME,
      "url",
      MENAGE_LITIGE_FIELD_DESC
    );
    const records = await airtable.listRecords(TABLES.menage.tableId, { pageSize: 200 });
    const normalized = records.map((r) => ({ id: r.id, fields: r.fields }));
    const mine = scopeForRole(TABLES.menage, normalized, req.session.user);
    const rec = mine[0];
    res.json({ url: (rec && rec.fields[fieldId]) || null });
  } catch (e) {
    res.status(e.code === "AIRTABLE_NOT_CONFIGURED" ? 409 : 502).json({ error: e.message });
  }
});

// ---- Droits d'acces par profil (Parametres > Droits d'acces, admin uniquement) ----
// Reflete directement la config reelle appliquee cote serveur (src/tables.js) :
// jamais de doublon susceptible de se desynchroniser des permissions vraiment
// appliquees.
router.get("/access-rights", requireAdmin, (req, res) => {
  const data = db.load();
  const tables = TABLE_ORDER.map((k) => {
    const t = TABLES[k];
    const overrideForTable = (data.accessOverrides && data.accessOverrides[k]) || {};
    return {
      key: k,
      label: t.label,
      icon: t.icon,
      group: t.group,
      defaultRoles: t.roles,
      roles: { admin: "full", collaborateur: permFor("collaborateur", k), prestataire: permFor("prestataire", k) },
      overridden: { collaborateur: !!overrideForTable.collaborateur, prestataire: !!overrideForTable.prestataire },
      hasSensitiveFields: !!(t.sensitive && t.sensitive.length),
      selfScoped: !!(t.prestataireLinkField || t.selfNameFields),
    };
  });
  res.json({ tables, accessLevels: ACCESS_LEVELS });
});

// ---- Modification des droits d'acces (Parametres > Droits d'acces, admin uniquement) ----
// Seuls les profils Collaborateur et Prestataire menage sont modifiables : le
// profil Administrateur garde toujours un acces complet, non surchargeable.
router.put("/access-rights/:tableKey/:role", requireAdmin, (req, res) => {
  const { tableKey, role } = req.params;
  const { level } = req.body || {};
  if (!TABLES[tableKey]) return res.status(404).json({ error: "Module inconnu." });
  if (!["collaborateur", "prestataire"].includes(role)) {
    return res.status(400).json({ error: "Seuls les profils Collaborateur et Prestataire ménage peuvent être modifiés." });
  }
  if (!ACCESS_LEVELS.includes(level)) return res.status(400).json({ error: "Niveau d'accès invalide." });
  const data = db.load();
  data.accessOverrides = data.accessOverrides || {};
  data.accessOverrides[tableKey] = data.accessOverrides[tableKey] || {};
  data.accessOverrides[tableKey][role] = level;
  db.save(data);
  db.addActivity({ type: "access_rights_changed", user: req.session.user.username, table: `${tableKey}.${role}=${level}` });
  res.json({ ok: true });
});

// Retire la surcharge : le module revient au niveau par defaut de src/tables.js.
router.delete("/access-rights/:tableKey/:role", requireAdmin, (req, res) => {
  const { tableKey, role } = req.params;
  const data = db.load();
  if (data.accessOverrides && data.accessOverrides[tableKey]) {
    delete data.accessOverrides[tableKey][role];
  }
  db.save(data);
  db.addActivity({ type: "access_rights_reset", user: req.session.user.username, table: `${tableKey}.${role}` });
  res.json({ ok: true });
});

module.exports = router;
