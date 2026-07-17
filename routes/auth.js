"use strict";
const express = require("express");
const crypto = require("crypto");
const db = require("../src/db");
const email = require("../src/email");
const { hashPassword, verifyPassword, findUser, requireAuth, requireAdmin } = require("../src/auth");

const router = express.Router();

function publicUser(u) {
  return {
    id: u.id,
    username: u.username,
    name: u.name,
    role: u.role,
    phone: u.phone || "",
    email: u.email || "",
    // Absent (comptes crees avant cette fonctionnalite, ou par un admin/EXTRA_USERS)
    // => considere verifie de longue date, pour ne jamais bloquer une installation existante.
    emailVerified: u.emailVerified !== false,
    mustChangePassword: !!u.mustChangePassword,
    // Lien de formulaire Airtable individuel (prestataire menage uniquement)
    // pour declarer un litige — chaque prestataire ne voit QUE son propre
    // lien, jamais celui des autres (voir /api/auth/me et la section
    // "Declarer un litige" cote frontend).
    litigeFormUrl: u.litigeFormUrl || "",
  };
}

function isValidEmailFormat(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || "").trim());
}
function isValidHttpUrl(u) {
  return /^https?:\/\//i.test(String(u || "").trim());
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const ROLE_LABELS_FR = { admin: "Administrateur", collaborateur: "Collaborateur", prestataire: "Prestataire ménage" };

function verificationEmailHtml(name, role, verifyUrl) {
  return `<p>Bonjour ${escapeHtml(name)},</p>
<p>Ta demande de compte <b>${escapeHtml(ROLE_LABELS_FR[role] || role)}</b> sur la Centrale de gestion
"Aux Portes des Landes" a bien été reçue.</p>
<p>Clique sur le lien ci-dessous pour confirmer ton adresse email et activer ton compte
(valable 24h) :</p>
<p><a href="${verifyUrl}">${verifyUrl}</a></p>
<p>Si tu n'es pas à l'origine de cette demande, ignore simplement cet email.</p>`;
}

// Vue allegee reservee a l'equipe interne (admin + collaborateur), utilisee
// par la Messagerie WhatsApp pour retrouver les numeros des comptes internes
// (onglet "Collaborateurs") sans exposer la gestion complete des comptes.
function teamContact(u) {
  return { id: u.id, name: u.name, role: u.role, phone: u.phone || "" };
}

router.post("/login", (req, res) => {
  const { username, password, role } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "Identifiant et mot de passe requis." });
  const user = findUser(username);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ error: "Identifiant ou mot de passe incorrect." });
  }
  if (user.emailVerified === false) {
    return res.status(403).json({
      error: "Ce compte n'est pas encore activé : clique sur le lien reçu par email pour valider ton adresse.",
      code: "EMAIL_NOT_VERIFIED",
    });
  }
  if (role && user.role !== role) {
    return res.status(401).json({ error: "Ce compte n'appartient pas au profil sélectionné." });
  }
  req.session.user = publicUser(user);
  db.addActivity({ type: "login", user: user.username, role: user.role });
  res.json({ user: req.session.user });
});

// ---- Inscription publique avec validation par email (accessible sans etre connecte) ----
// Les 3 profils (admin/collaborateur/prestataire) sont ouverts a l'inscription :
// n'importe qui avec le lien de l'application peut demander un compte, mais le
// compte reste inutilisable (connexion refusee) tant que l'adresse email n'a
// pas ete confirmee via le lien recu par email.
router.post("/signup", async (req, res) => {
  const { username, password, name, email: emailAddr, role, phone } = req.body || {};
  if (!username || !password || !name || !emailAddr || !role) {
    return res.status(400).json({ error: "Tous les champs sont requis." });
  }
  if (!["admin", "collaborateur", "prestataire"].includes(role)) {
    return res.status(400).json({ error: "Profil invalide." });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Le mot de passe doit contenir au moins 6 caractères." });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAddr.trim())) {
    return res.status(400).json({ error: "Adresse email invalide." });
  }
  const data = db.load();
  if (data.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
    return res.status(409).json({ error: "Cet identifiant existe déjà." });
  }
  if (data.users.some((u) => (u.email || "").toLowerCase() === emailAddr.trim().toLowerCase())) {
    return res.status(409).json({ error: "Un compte existe déjà avec cette adresse email." });
  }

  const token = crypto.randomBytes(32).toString("hex");
  const user = {
    id: crypto.randomUUID(),
    username: username.trim(),
    name: name.trim(),
    role,
    phone: (phone || "").trim(),
    email: emailAddr.trim(),
    emailVerified: false,
    verifyToken: token,
    verifyTokenExpires: Date.now() + 24 * 60 * 60 * 1000,
    passwordHash: hashPassword(password),
    mustChangePassword: false,
    createdAt: new Date().toISOString(),
  };

  const baseUrl = `${req.protocol}://${req.get("host")}`;
  const verifyUrl = `${baseUrl}/api/auth/verify-email?token=${token}`;
  try {
    await email.sendMail({
      to: user.email,
      subject: "Confirme ton compte — Aux Portes des Landes",
      html: verificationEmailHtml(user.name, user.role, verifyUrl),
    });
  } catch (e) {
    return res.status(502).json({ error: "Impossible d'envoyer l'email de validation : " + e.message });
  }

  // On n'enregistre le compte qu'une fois l'email parti avec succes, pour ne
  // jamais laisser un compte fantome impossible a activer si l'envoi echoue.
  data.users.push(user);
  db.save(data);
  db.addActivity({ type: "signup_pending", user: user.username, table: role });
  res.json({ ok: true, message: "Compte créé. Vérifie ta boîte mail pour l'activer avant de te connecter." });
});

// Lien clique depuis l'email de validation : active le compte puis redirige
// vers l'accueil avec un indicateur de resultat (?verified=1|0) lu par le frontend.
router.get("/verify-email", (req, res) => {
  const { token } = req.query || {};
  const data = db.load();
  const user = token && data.users.find((u) => u.verifyToken && u.verifyToken === token);
  if (!user || (user.verifyTokenExpires && user.verifyTokenExpires < Date.now())) {
    return res.redirect("/?verified=0");
  }
  user.emailVerified = true;
  delete user.verifyToken;
  delete user.verifyTokenExpires;
  db.save(data);
  db.addActivity({ type: "signup_verified", user: user.username });
  res.redirect("/?verified=1");
});

// Renvoie un nouveau lien de validation (email perdu, expire...), sans avoir
// besoin d'etre connecte puisque le compte concerne ne peut justement pas se
// connecter tant qu'il n'est pas verifie.
router.post("/resend-verification", async (req, res) => {
  const { username } = req.body || {};
  if (!username) return res.status(400).json({ error: "Identifiant requis." });
  const data = db.load();
  const user = data.users.find((u) => u.username.toLowerCase() === String(username).toLowerCase());
  if (!user) return res.status(404).json({ error: "Compte introuvable." });
  if (user.emailVerified !== false) return res.status(400).json({ error: "Ce compte est déjà activé." });
  if (!user.email) return res.status(400).json({ error: "Aucune adresse email associée à ce compte." });

  const token = crypto.randomBytes(32).toString("hex");
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  const verifyUrl = `${baseUrl}/api/auth/verify-email?token=${token}`;
  try {
    await email.sendMail({
      to: user.email,
      subject: "Confirme ton compte — Aux Portes des Landes",
      html: verificationEmailHtml(user.name, user.role, verifyUrl),
    });
  } catch (e) {
    return res.status(502).json({ error: "Impossible d'envoyer l'email : " + e.message });
  }
  user.verifyToken = token;
  user.verifyTokenExpires = Date.now() + 24 * 60 * 60 * 1000;
  db.save(data);
  res.json({ ok: true });
});

router.post("/logout", requireAuth, (req, res) => {
  db.addActivity({ type: "logout", user: req.session.user.username });
  req.session.destroy(() => res.json({ ok: true }));
});

router.get("/me", (req, res) => {
  if (!req.session || !req.session.user) return res.status(401).json({ error: "Non connecté." });
  res.json({ user: req.session.user });
});

router.post("/change-password", requireAuth, (req, res) => {
  const { newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: "Le mot de passe doit contenir au moins 6 caractères." });
  const data = db.load();
  const u = data.users.find((x) => x.id === req.session.user.id);
  if (!u) return res.status(404).json({ error: "Utilisateur introuvable." });
  u.passwordHash = hashPassword(newPassword);
  u.mustChangePassword = false;
  db.save(data);
  req.session.user.mustChangePassword = false;
  res.json({ ok: true });
});

// Reservee a l'equipe interne (admin + collaborateur) : sert uniquement a
// afficher un carnet d'adresses pour la Messagerie WhatsApp, pas a gerer les
// comptes (voir /users, reserve admin, pour la gestion complete).
function requireTeamAccess(req, res, next) {
  if (!["admin", "collaborateur"].includes(req.session.user.role)) {
    return res.status(403).json({ error: "Accès réservé à l'équipe interne." });
  }
  next();
}
router.get("/team-contacts", requireAuth, requireTeamAccess, (req, res) => {
  const data = db.load();
  res.json({ contacts: data.users.map(teamContact) });
});

// ---- Gestion des utilisateurs (admin uniquement) ----
router.get("/users", requireAdmin, (req, res) => {
  const data = db.load();
  res.json({ users: data.users.map(publicUser) });
});

router.post("/users", requireAdmin, (req, res) => {
  const { username, password, name, role, phone, email: emailAddr, litigeFormUrl } = req.body || {};
  if (!username || !password || !name || !role) return res.status(400).json({ error: "Tous les champs sont requis." });
  if (!["admin", "collaborateur", "prestataire"].includes(role)) return res.status(400).json({ error: "Profil invalide." });
  const data = db.load();
  if (data.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
    return res.status(409).json({ error: "Cet identifiant existe déjà." });
  }
  // Email facultatif a la creation manuelle par un admin (pas de validation
  // par lien ici, contrairement a /signup) — mais s'il est fourni, il doit
  // avoir un format valide et etre unique.
  const cleanEmail = (emailAddr || "").trim();
  if (cleanEmail) {
    if (!isValidEmailFormat(cleanEmail)) return res.status(400).json({ error: "Adresse email invalide." });
    if (data.users.some((u) => (u.email || "").toLowerCase() === cleanEmail.toLowerCase())) {
      return res.status(409).json({ error: "Un compte existe déjà avec cette adresse email." });
    }
  }
  // Lien de formulaire Airtable individuel (declaration de litige) : propre a
  // chaque prestataire, saisi librement par l'admin (n'importe quelle URL
  // http(s)), pertinent surtout pour le profil "prestataire" mais pas
  // restreint techniquement aux autres profils.
  const cleanLitigeUrl = (litigeFormUrl || "").trim();
  if (cleanLitigeUrl && !isValidHttpUrl(cleanLitigeUrl)) {
    return res.status(400).json({ error: "Le lien du formulaire de litige doit commencer par http:// ou https://" });
  }
  const user = {
    id: crypto.randomUUID(),
    username: username.trim(),
    name: name.trim(),
    role,
    phone: (phone || "").trim(),
    email: cleanEmail,
    litigeFormUrl: cleanLitigeUrl,
    passwordHash: hashPassword(password),
    mustChangePassword: true,
    createdAt: new Date().toISOString(),
  };
  data.users.push(user);
  db.save(data);
  db.addActivity({ type: "user_created", user: req.session.user.username, table: username });
  res.json({ user: publicUser(user) });
});

// Edition legere d'un compte existant (nom + telephone uniquement — le mot de
// passe se change via /change-password, l'identifiant et le profil restent
// fixes une fois le compte cree pour eviter toute confusion de session).
router.patch("/users/:id", requireAdmin, (req, res) => {
  const { name, phone, emailVerified, email: emailAddr, litigeFormUrl } = req.body || {};
  const data = db.load();
  const u = data.users.find((x) => x.id === req.params.id);
  if (!u) return res.status(404).json({ error: "Utilisateur introuvable." });
  if (name !== undefined) {
    if (!name.trim()) return res.status(400).json({ error: "Le nom ne peut pas être vide." });
    u.name = name.trim();
  }
  if (phone !== undefined) u.phone = phone.trim();
  if (emailAddr !== undefined) {
    const cleanEmail = (emailAddr || "").trim();
    if (cleanEmail) {
      if (!isValidEmailFormat(cleanEmail)) return res.status(400).json({ error: "Adresse email invalide." });
      if (data.users.some((x) => x.id !== u.id && (x.email || "").toLowerCase() === cleanEmail.toLowerCase())) {
        return res.status(409).json({ error: "Un compte existe déjà avec cette adresse email." });
      }
    }
    u.email = cleanEmail;
  }
  // Lien de formulaire Airtable individuel (declaration de litige) — voir
  // POST /users plus haut pour le detail. Modifiable a tout moment par un
  // admin, ex. pour associer/mettre a jour le lien d'un prestataire menage.
  if (litigeFormUrl !== undefined) {
    const cleanLitigeUrl = (litigeFormUrl || "").trim();
    if (cleanLitigeUrl && !isValidHttpUrl(cleanLitigeUrl)) {
      return res.status(400).json({ error: "Le lien du formulaire de litige doit commencer par http:// ou https://" });
    }
    u.litigeFormUrl = cleanLitigeUrl;
  }
  // Filet de securite : permet a un admin d'activer manuellement un compte
  // inscrit via /signup si l'email de validation est perdu, expire, ou si
  // l'envoi d'email n'est pas (encore) configure.
  if (emailVerified === true && u.emailVerified === false) {
    u.emailVerified = true;
    delete u.verifyToken;
    delete u.verifyTokenExpires;
    db.addActivity({ type: "signup_verified_by_admin", user: req.session.user.username, table: u.username });
  }
  db.save(data);
  if (req.session.user.id === u.id) {
    req.session.user.name = u.name;
    req.session.user.phone = u.phone;
    req.session.user.email = u.email;
    req.session.user.litigeFormUrl = u.litigeFormUrl;
  }
  res.json({ user: publicUser(u) });
});

router.delete("/users/:id", requireAdmin, (req, res) => {
  const data = db.load();
  const target = data.users.find((u) => u.id === req.params.id);
  if (!target) return res.status(404).json({ error: "Utilisateur introuvable." });
  if (target.username === "admin") return res.status(400).json({ error: "Impossible de supprimer le compte admin principal." });
  data.users = data.users.filter((u) => u.id !== req.params.id);
  db.save(data);
  db.addActivity({ type: "user_deleted", user: req.session.user.username, table: target.username });
  res.json({ ok: true });
});

router.get("/activity", requireAdmin, (req, res) => {
  const data = db.load();
  res.json({ log: data.activityLog.slice(0, 100) });
});

module.exports = router;
