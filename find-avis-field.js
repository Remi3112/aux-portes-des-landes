"use strict";
/**
 * Script de diagnostic ponctuel : liste tous les champs (id, type, nom) de
 * la table "Avis voyageurs" telle qu'elle existe REELLEMENT dans Airtable
 * (via ton jeton deja enregistré dans Paramètres > Intégrations), pour
 * trouver l'identifiant exact du champ "Réponse message à envoyer via n8n"
 * (ou nom equivalent) a ajouter à l'application.
 * Ne modifie rien. A lancer avec : node find-avis-field.js
 */
const db = require("./src/db");

const AVIS_TABLE_ID = "tbl6jjMPEewTINgHz";

async function main() {
  const cfg = db.load().integrations.airtable;
  if (!cfg.token || !cfg.baseId) {
    console.log("Airtable n'est pas connecté (Paramètres > Intégrations). Connecte-le d'abord dans l'application.");
    return;
  }
  const res = await fetch(`https://api.airtable.com/v0/meta/bases/${cfg.baseId}/tables`, {
    headers: { Authorization: `Bearer ${cfg.token}` },
  });
  const json = await res.json();
  if (!res.ok) {
    console.log("Erreur Airtable :", (json.error && json.error.message) || res.status);
    return;
  }
  const tbl = json.tables.find((t) => t.id === AVIS_TABLE_ID);
  if (!tbl) {
    console.log("Table Avis voyageurs introuvable avec l'ID attendu. Tables disponibles dans la base :");
    json.tables.forEach((t) => console.log(`  - ${t.name} (${t.id})`));
    return;
  }
  console.log(`Table "${tbl.name}" (${tbl.id}) — ${tbl.fields.length} champs :\n`);
  tbl.fields.forEach((f) => {
    console.log(`${f.id}  |  ${f.type.padEnd(24)}  |  ${f.name}`);
  });
  console.log("\nCopie-colle ce texte en entier et envoie-le : je repererai le champ de reponse n8n/IA a integrer.");
}

main().catch((e) => console.error("Erreur :", e.message));
