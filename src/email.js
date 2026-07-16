"use strict";
/**
 * Envoi d'emails (validation de compte a l'inscription) via un compte Gmail
 * et un "mot de passe d'application" (Google : Compte > Securite > Validation
 * en deux etapes > Mots de passe des applications). Utilise nodemailer en
 * SMTP, comme un client mail classique — pas d'API tierce a payer.
 *
 * Mode test : quand EMAIL_TEST_MODE=1 (positionne par test/e2e.js), aucun
 * envoi reel n'a lieu ; le contenu est place dans testOutbox pour verification
 * par les tests, et testConnection() repond toujours OK sans se connecter a
 * un vrai serveur SMTP (le sandbox de test n'a pas d'acces reseau sortant).
 */
const db = require("./db");

const testOutbox = [];

function getConfig() {
  const data = db.load();
  return data.integrations.email || { user: "", appPassword: "", fromName: "Aux Portes des Landes", connected: false };
}

function buildTransport(user, appPassword) {
  const nodemailer = require("nodemailer");
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass: appPassword },
  });
}

async function testConnection(user, appPassword) {
  if (!user || !appPassword) throw new Error("Adresse Gmail et mot de passe d'application requis.");
  if (process.env.EMAIL_TEST_MODE === "1") return { ok: true };
  const transport = buildTransport(user, appPassword);
  await transport.verify();
  return { ok: true };
}

async function sendMail({ to, subject, html, text }) {
  // Verifie le mode test AVANT la config : les tests de bout en bout
  // n'ont jamais de vrai compte Gmail enregistre.
  if (process.env.EMAIL_TEST_MODE === "1") {
    testOutbox.push({ to, subject, html, text });
    return { ok: true, testMode: true };
  }
  const cfg = getConfig();
  if (!cfg.user || !cfg.appPassword) {
    const err = new Error("L'envoi d'email n'est pas configuré. Un administrateur doit ajouter un compte Gmail dans Paramètres > Intégrations.");
    err.code = "EMAIL_NOT_CONFIGURED";
    throw err;
  }
  const transport = buildTransport(cfg.user, cfg.appPassword);
  await transport.sendMail({
    from: `"${cfg.fromName || "Aux Portes des Landes"}" <${cfg.user}>`,
    to,
    subject,
    html,
    text,
  });
  return { ok: true };
}

module.exports = { testConnection, sendMail, getConfig, testOutbox };
