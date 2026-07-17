"use strict";
/**
 * Reinitialisation d'un mot de passe (recuperation en cas de perte).
 * A lancer avec : node reset-password.js  (ou en double-cliquant reset-password.bat / reset-password.sh)
 *
 * Le nouveau mot de passe est hache puis enregistre directement dans
 * data/db.json (meme fichier utilise par le serveur). Ce fichier n'est
 * JAMAIS touche par une mise a jour (git pull / npm install ne modifient
 * que le code, jamais data/ — voir .gitignore) : le mot de passe choisi
 * ici reste donc valable apres n'importe quelle mise a jour ulterieure.
 */
const readline = require("readline");
const db = require("./src/db");
const { hashPassword } = require("./src/auth");

async function main() {
  console.log("=".repeat(64));
  console.log("Aux Portes des Landes — Reinitialisation d'un mot de passe");
  console.log("=".repeat(64));

  const users = await db.listUsers();
  if (!users.length) {
    console.log("\nAucun compte n'existe encore.");
    console.log("Lance simplement start.bat (ou start.sh) : un compte admin sera cree");
    console.log("automatiquement au premier demarrage, avec un mot de passe temporaire affiche une seule fois.");
    return;
  }

  console.log("\nComptes existants :");
  users.forEach((u) => console.log(`  - ${u.username}  (${u.role})`));
  console.log("");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  // Iteration asynchrone ligne par ligne : evite le bug classique ou des
  // reponses arrivent "trop vite" (ex: entree redirigee/pipe) et se
  // perdent entre deux appels successifs a rl.question().
  const lineIterator = rl[Symbol.asyncIterator]();
  async function ask(question) {
    process.stdout.write(question);
    const { value, done } = await lineIterator.next();
    return done ? "" : value.trim();
  }

  try {
    const username = await ask("Identifiant du compte a reinitialiser : ");
    const user = users.find((u) => u.username.toLowerCase() === username.toLowerCase());
    if (!user) {
      console.log(`\nAucun compte "${username}" trouve. Verifie l'orthographe (voir la liste ci-dessus) et relance le script.`);
      return;
    }

    let pass1 = await ask("Nouveau mot de passe (6 caracteres minimum) : ");
    while (!pass1 || pass1.length < 6) {
      pass1 = await ask("Trop court. Nouveau mot de passe (6 caracteres minimum) : ");
    }
    const pass2 = await ask("Confirme le nouveau mot de passe : ");
    if (pass1 !== pass2) {
      console.log("\nLes deux mots de passe saisis ne correspondent pas. Aucune modification enregistree — relance le script.");
      return;
    }

    await db.updateUser(user.id, { passwordHash: hashPassword(pass1), mustChangePassword: false });

    console.log(`\n✅ Mot de passe mis a jour pour le compte "${user.username}".`);
    console.log("Tu peux maintenant te connecter avec ce nouveau mot de passe dans l'application.");
    console.log("Si Airtable est connecte, il est stocke dans la table \"Utilisateurs appli\" (persistant, jamais perdu");
    console.log("lors d'une mise a jour) ; sinon dans data/db.json sur ce poste.");
  } finally {
    rl.close();
  }
}

main().catch((e) => {
  console.error("\nUne erreur est survenue :", e.message);
});
