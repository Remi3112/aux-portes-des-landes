"use strict";
/**
 * Store de session express-session base sur des fichiers JSON (aucune
 * dependance native, pas de base de donnees externe — coherent avec le
 * reste du "systeme de stockage interne" de l'application).
 *
 * But : garder les utilisateurs connectes meme apres un redemarrage du
 * serveur (mise a jour via update.bat/update.sh, redemarrage machine...).
 * Avec le store par defaut d'express-session (memoire), toute la session
 * est perdue au moindre redemarrage et tout le monde doit se reconnecter.
 *
 * Deux precautions importantes pour la fiabilite (sinon des connexions
 * "sautent" de facon aleatoire) :
 *
 * 1. Ecritures atomiques : on ecrit dans un fichier temporaire puis on
 *    renomme (fs.rename est atomique sur le meme volume). Sans ca, une
 *    lecture concurrente pendant l'ecriture peut tomber sur un fichier
 *    tronque/vide (fs.writeFile n'est pas atomique).
 *
 * 2. File d'attente par session (par sid) : express-session declenche un
 *    "touch" (prolongation de duree) en arriere-plan, SANS attendre la fin
 *    de l'ecriture, a chaque requete qui ne modifie pas la session
 *    (ex: GET /api/auth/me). Si la requete suivante (ex: POST
 *    /api/auth/logout) arrive avant la fin de ce touch, sa lecture ou sa
 *    suppression peut se produire en meme temps que l'ecriture encore en
 *    cours pour la MEME session, ce qui peut soit faire "disparaitre" une
 *    session valide (lecture pendant ecriture), soit la faire "reapparaitre"
 *    apres une deconnexion (ecriture qui termine apres une suppression).
 *    On serialise donc toutes les operations (get/set/touch/destroy) pour
 *    un meme sid les unes derriere les autres.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Store } = require("express-session");

class FileSessionStore extends Store {
  constructor(dir) {
    super();
    this.dir = dir;
    if (!fs.existsSync(this.dir)) fs.mkdirSync(this.dir, { recursive: true });
    // sid -> Promise (derniere operation en cours pour ce sid), pour serialiser.
    this._queues = new Map();
  }

  _file(sid) {
    // Nettoie le SID pour en faire un nom de fichier sûr.
    return path.join(this.dir, String(sid).replace(/[^a-zA-Z0-9_-]/g, "_") + ".json");
  }

  // Enchaine `task` (une fonction retournant une Promise) apres la derniere
  // operation en cours pour ce sid, pour garantir un ordre strict.
  _enqueue(sid, task) {
    const prev = this._queues.get(sid) || Promise.resolve();
    const next = prev.then(task, task).finally(() => {
      if (this._queues.get(sid) === next) this._queues.delete(sid);
    });
    this._queues.set(sid, next);
    return next;
  }

  get(sid, cb) {
    this._enqueue(sid, () => this._readFile(sid))
      .then((sess) => cb(null, sess))
      .catch(() => cb(null, null));
  }

  _readFile(sid) {
    return new Promise((resolve) => {
      fs.readFile(this._file(sid), "utf8", (err, raw) => {
        if (err || !raw) return resolve(null);
        try {
          const sess = JSON.parse(raw);
          if (sess.cookie && sess.cookie.expires && new Date(sess.cookie.expires) < new Date()) {
            fs.unlink(this._file(sid), () => {});
            return resolve(null);
          }
          resolve(sess);
        } catch (e) {
          resolve(null);
        }
      });
    });
  }

  set(sid, sess, cb) {
    this._enqueue(sid, () => this._writeFile(sid, sess))
      .then(() => {
        if (cb) cb();
      })
      .catch((err) => {
        if (cb) cb(err);
      });
  }

  _writeFile(sid, sess) {
    return new Promise((resolve, reject) => {
      const target = this._file(sid);
      // Ecriture atomique : fichier temporaire unique puis renommage.
      const tmp = target + "." + crypto.randomBytes(6).toString("hex") + ".tmp";
      fs.writeFile(tmp, JSON.stringify(sess), "utf8", (err) => {
        if (err) return reject(err);
        fs.rename(tmp, target, (err2) => {
          if (err2) return reject(err2);
          resolve();
        });
      });
    });
  }

  destroy(sid, cb) {
    this._enqueue(sid, () => this._removeFile(sid))
      .then(() => {
        if (cb) cb();
      })
      .catch(() => {
        if (cb) cb();
      });
  }

  _removeFile(sid) {
    return new Promise((resolve) => {
      const target = this._file(sid);
      fs.unlink(target, (err) => {
        if (!err) return resolve();
        // Repli : certains systemes de fichiers (partages reseau, montages
        // particuliers) refusent parfois la suppression (EPERM) meme quand
        // l'ecriture fonctionne. On vide alors le fichier a la place : get()
        // traite un contenu vide comme "pas de session", ce qui invalide la
        // session tout aussi surement qu'une suppression.
        fs.writeFile(target, "", "utf8", () => resolve());
      });
    });
  }

  touch(sid, sess, cb) {
    this.set(sid, sess, cb);
  }

  all(cb) {
    fs.readdir(this.dir, (err, files) => {
      if (err) return cb(null, []);
      const sessions = [];
      files.forEach((f) => {
        if (!f.endsWith(".json")) return;
        try {
          sessions.push(JSON.parse(fs.readFileSync(path.join(this.dir, f), "utf8")));
        } catch (e) {
          /* fichier corrompu/illisible, ignore */
        }
      });
      cb(null, sessions);
    });
  }

  clear(cb) {
    fs.readdir(this.dir, (err, files) => {
      if (err) return cb && cb();
      files.forEach((f) => {
        try {
          fs.unlinkSync(path.join(this.dir, f));
        } catch (e) {
          /* ignore */
        }
      });
      if (cb) cb();
    });
  }

  length(cb) {
    fs.readdir(this.dir, (err, files) => cb(null, err ? 0 : files.filter((f) => f.endsWith(".json")).length));
  }
}

module.exports = FileSessionStore;
