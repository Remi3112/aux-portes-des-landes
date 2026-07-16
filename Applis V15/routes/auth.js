"use strict";
const express = require("express");
const crypto = require("crypto");
const db = require("../src/db");
const { hashPassword, verifyPassword, findUser, requireAuth, requireAdmin } = require("../src/auth");

const router = express.Router();

function publicUser(u) {
  return { id: u.id, username: u.username, name: u.name, role: u.role, phone: u.phone || "", mustChangePassword: !!u.mustChangePassword };
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
  if (role && user.role !== role) {
    return res.status(401).json({ error: "Ce compte n'appartient pas au profil sélectionné." });
  }
  req.session.user = publicUser(user);
  db.addActivity({ type: "login", user: user.username, role: user.role });
  res.json({ user: req.session.user });
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
  const { username, password, name, role, phone } = req.body || {};
  if (!username || !password || !name || !role) return res.status(400).json({ error: "Tous les champs sont requis." });
  if (!["admin", "collaborateur", "prestataire"].includes(role)) return res.status(400).json({ error: "Profil invalide." });
  const data = db.load();
  if (data.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
    return res.status(409).json({ error: "Cet identifiant existe déjà." });
  }
  const user = {
    id: crypto.randomUUID(),
    username: username.trim(),
    name: name.trim(),
    role,
    phone: (phone || "").trim(),
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
  const { name, phone } = req.body || {};
  const data = db.load();
  const u = data.users.find((x) => x.id === req.params.id);
  if (!u) return res.status(404).json({ error: "Utilisateur introuvable." });
  if (name !== undefined) {
    if (!name.trim()) return res.status(400).json({ error: "Le nom ne peut pas être vide." });
    u.name = name.trim();
  }
  if (phone !== undefined) u.phone = phone.trim();
  db.save(data);
  if (req.session.user.id === u.id) { req.session.user.name = u.name; req.session.user.phone = u.phone; }
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
