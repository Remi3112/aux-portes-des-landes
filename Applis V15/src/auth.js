"use strict";
const bcrypt = require("bcryptjs");
const db = require("./db");

function hashPassword(pw) { return bcrypt.hashSync(pw, 10); }
function verifyPassword(pw, hash) { return bcrypt.compareSync(pw, hash || ""); }

function findUser(username) {
  const data = db.load();
  return data.users.find((u) => u.username.toLowerCase() === String(username).toLowerCase());
}

function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: "Non connecté." });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.user || req.session.user.role !== "admin") {
    return res.status(403).json({ error: "Réservé aux administrateurs." });
  }
  next();
}

module.exports = { hashPassword, verifyPassword, findUser, requireAuth, requireAdmin };
