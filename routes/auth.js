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

router.post("/login", async (req, res) => {
  const { username, password, role } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "Identifiant et mot de passe requis." });
  const user = await findUser(username);
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
  if (!isValidEmailFormat(emailAddr)) {
    return res.status(400).json({ error: "Adresse email invalide." });
  }
  if (await findUser(username)) {
    return res.status(409).json({ error: "Cet identifiant existe déjà." });
  }
  if (await db.findUserByEmail(emailAddr.trim())) {
    return res.status(409).json({ error: "Un compte existe déjà avec cette adresse email." });
  }

  const token = crypto.randomBytes(32).toString("hex");
  const userFields = {
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
  };

  const baseUrl = `${req.protocol}://${req.get("host")}`;
  const verifyUrl = `${baseUrl}/api/auth/verify-email?token=${token}`;
  try {
    await email.sendMail({
      to: userFields.email,
      subject: "Confirme ton compte — Aux Portes des Landes",
      html: verificationEmailHtml(userFields.name, userFields.role, verifyUrl),
    });
  } catch (e) {
    return res.status(502).json({ error: "Impossible d'envoyer l'email de validation : " + e.message });
  }

  // On n'enregistre le compte qu'une fois l'email parti avec succes, pour ne
  // jamais laisser un compte fantome impossible a activer si l'envoi echoue.
  const user = await db.createUser(userFields);
  db.addActivity({ type: "signup_pending", user: user.username, table: role });
  res.json({ ok: true, message: "Compte créé. Vérifie ta boîte mail pour l'activer avant de te connecter." });
});

// Lien clique depuis l'email de validation : active le compte puis redirige
// vers l'accueil avec un indicateur de resultat (?verified=1|0) lu par le frontend.
router.get("/verify-email", async (req, res) => {
  const { token } = req.query || {};
  const users = token ? await db.listUsers() : [];
  const user = users.find((u) => u.verifyToken && u.verifyToken === token);
  if (!user || (user.verifyTokenExpires && user.verifyTokenExpires < Date.now())) {
    return res.redirect("/?verified=0");
  }
  await db.updateUser(user.id, { emailVerified: true, verifyToken: undefined, verifyTokenExpires: undefined });
  db.addActivity({ type: "signup_verified", user: user.username });
  res.redirect("/?verified=1");
});

// Renvoie un nouveau lien de validation (email perdu, expire...), sans avoir
// besoin d'etre connecte puisque le compte concerne ne peut justement pas se
// connecter tant qu'il n'est pas verifie.
router.post("/resend-verification", async (req, res) => {
  const { username } = req.body || {};
  if (!username) return res.status(400).json({ error: "Identifiant requis." });
  const user = await findUser(username);
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
  await db.updateUser(user.id, { verifyToken: token, verifyTokenExpires: Date.now() + 24 * 60 * 60 * 1000 });
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

router.post("/change-password", requireAuth, async (req, res) => {
  const { newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: "Le mot de passe doit contenir au moins 6 caractères." });
  const u = await db.findUserById(req.session.user.id);
  if (!u) return res.status(404).json({ error: "Utilisateur introuvable." });
  await db.updateUser(u.id, { passwordHash: hashPassword(newPassword), mustChangePassword: false });
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
router.get("/team-contacts", requireAuth, requireTeamAccess, async (req, res) => {
  const users = await db.listUsers();
  res.json({ contacts: users.map(teamContact) });
});

// ---- Gestion des utilisateurs (admin uniquement) ----
router.get("/users", requireAdmin, async (req, res) => {
  const users = await db.listUsers();
  res.json({ users: users.map(publicUser) });
});

router.post("/users", requireAdmin, async (req, res) => {
  const { username, password, name, role, phone, email: emailAddr } = req.body || {};
  if (!username || !password || !name || !role) return res.status(400).json({ error: "Tous les champs sont requis." });
  if (!["admin", "collaborateur", "prestataire"].includes(role)) return res.status(400).json({ error: "Profil invalide." });
  if (await findUser(username)) {
    return res.status(409).json({ error: "Cet identifiant existe déjà." });
  }
  // Email facultatif a la creation manuelle par un admin (pas de validation
  // par lien ici, contrairement a /signup) — mais s'il est fourni, il doit
  // avoir un format valide et etre unique.
  const cleanEmail = (emailAddr || "").trim();
  if (cleanEmail) {
    if (!isValidEmailFormat(cleanEmail)) return res.status(400).json({ error: "Adresse email invalide." });
    if (await db.findUserByEmail(cleanEmail)) {
      return res.status(409).json({ error: "Un compte existe déjà avec cette adresse email." });
    }
  }
  const user = await db.createUser({
    username: username.trim(),
    name: name.trim(),
    role,
    phone: (phone || "").trim(),
    email: cleanEmail,
    passwordHash: hashPassword(password),
    mustChangePassword: true,
  });
  db.addActivity({ type: "user_created", user: req.session.user.username, table: username });
  res.json({ user: publicUser(user) });
});

// Edition legere d'un compte existant (nom + telephone uniquement — le mot de
// passe se change via /change-password, l'identifiant et le profil restent
// fixes une fois le compte cree pour eviter toute confusion de session).
router.patch("/users/:id", requireAdmin, async (req, res) => {
  const { name, phone, emailVerified, email: emailAddr } = req.body || {};
  const u = await db.findUserById(req.params.id);
  if (!u) return res.status(404).json({ error: "Utilisateur introuvable." });
  const patch = {};
  if (name !== undefined) {
    if (!name.trim()) return res.status(400).json({ error: "Le nom ne peut pas être vide." });
    patch.name = name.trim();
  }
  if (phone !== undefined) patch.phone = phone.trim();
  if (emailAddr !== undefined) {
    const cleanEmail = (emailAddr || "").trim();
    if (cleanEmail) {
      if (!isValidEmailFormat(cleanEmail)) return res.status(400).json({ error: "Adresse email invalide." });
      const conflict = await db.findUserByEmail(cleanEmail);
      if (conflict && conflict.id !== u.id) {
        return res.status(409).json({ error: "Un compte existe déjà avec cette adresse email." });
      }
    }
    patch.email = cleanEmail;
  }
  // Filet de securite : permet a un admin d'activer manuellement un compte
  // inscrit via /signup si l'email de validation est perdu, expire, ou si
  // l'envoi d'email n'est pas (encore) configure.
  if (emailVerified === true && u.emailVerified === false) {
    patch.emailVerified = true;
    patch.verifyToken = undefined;
    patch.verifyTokenExpires = undefined;
    db.addActivity({ type: "signup_verified_by_admin", user: req.session.user.username, table: u.username });
  }
  const updated = await db.updateUser(u.id, patch);
  if (req.session.user.id === u.id) {
    req.session.user.name = updated.name;
    req.session.user.phone = updated.phone;
    req.session.user.email = updated.email;
  }
  res.json({ user: publicUser(updated) });
});

router.delete("/users/:id", requireAdmin, async (req, res) => {
  const target = await db.findUserById(req.params.id);
  if (!target) return res.status(404).json({ error: "Utilisateur introuvable." });
  if (target.username === "admin") return res.status(400).json({ error: "Impossible de supprimer le compte admin principal." });
  await db.deleteUser(req.params.id);
  db.addActivity({ type: "user_deleted", user: req.session.user.username, table: target.username });
  res.json({ ok: true });
});

router.get("/activity", requireAdmin, (req, res) => {
  const data = db.load();
  res.json({ log: data.activityLog.slice(0, 100) });
});

module.exports = router;
