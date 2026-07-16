"use strict";
/**
 * Aux Portes des Landes — Centrale de gestion
 * Point d'entree du serveur. Lance avec : npm start (ou node server.js)
 */
const express = require("express");
const session = require("express-session");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");

const db = require("./src/db");
const FileSessionStore = require("./src/fileSessionStore");

const PORT = process.env.PORT || 3000;
const SESSION_SECRET_FILE = path.join(__dirname, "data", ".session-secret");
const SESSIONS_DIR = path.join(__dirname, "data", "sessions");

function getOrCreateSessionSecret() {
  if (!fs.existsSync(path.join(__dirname, "data"))) fs.mkdirSync(path.join(__dirname, "data"), { recursive: true });
  if (fs.existsSync(SESSION_SECRET_FILE)) return fs.readFileSync(SESSION_SECRET_FILE, "utf8").trim();
  const secret = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(SESSION_SECRET_FILE, secret, "utf8");
  return secret;
}

// Premier demarrage : cree le compte admin si besoin (affiche le mot de passe temporaire une seule fois).
db.seedAdminIfNeeded();
// Hebergement sans disque persistant (ex: Render free) : restaure a chaque
// demarrage les comptes/integrations definis par variables d'environnement.
// N'a aucun effet si ces variables ne sont pas definies (installation locale).
db.seedFromEnv();

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));
app.use(
  session({
    store: new FileSessionStore(SESSIONS_DIR),
    secret: getOrCreateSessionSecret(),
    resave: false,
    saveUninitialized: false,
    rolling: true, // chaque requete prolonge la session (utilisateur actif = reste connecte)
    cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 * 24 * 30 }, // 30 jours
  })
);

app.use("/api/auth", require("./routes/auth"));
app.use("/api/records", require("./routes/records"));
app.use("/api/settings", require("./routes/settings"));
app.use("/api/slack", require("./routes/slackMessages"));
app.use("/api/ai", require("./routes/ai"));
app.use("/api/config", require("./routes/config"));
app.use("/api/dashboard", require("./routes/dashboard"));

app.get("/api/version", (req, res) => {
  const pkg = require("./package.json");
  res.json({ version: pkg.version });
});

app.use(express.static(path.join(__dirname, "public")));
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => {
  console.log(`\nAux Portes des Landes — Centrale de gestion`);
  console.log(`→ Ouvre ton navigateur sur http://localhost:${PORT}\n`);
  console.log(`Tu restes connecté automatiquement (30 jours) même après un redémarrage ou une mise à jour.`);
});
