"use strict";
/**
 * Indicateurs "conciergerie" pour le tableau de bord : chiffre d'affaires
 * en cours, taux d'occupation, litiges ouverts, ménages à confirmer,
 * et l'activité du jour (arrivées, départs, ménages prévus aujourd'hui).
 * Reserve a l'admin et aux collaborateurs (donnees financieres/business),
 * pas aux prestataires menage.
 */
const express = require("express");
const { TABLES } = require("../src/tables");
const { requireAuth } = require("../src/auth");
const airtable = require("../src/airtable");
const { rawText } = require("../src/scope");

const router = express.Router();

function requireBusinessAccess(req, res, next) {
  if (!["admin", "collaborateur"].includes(req.session.user.role)) {
    return res.status(403).json({ error: "Tableau de bord détaillé réservé à l'équipe interne." });
  }
  next();
}

/** Parsing de date "au mieux" : accepte ISO ainsi que JJ/MM/AAAA, JJ-MM-AAAA. */
function parseDateLoose(str) {
  if (!str) return null;
  const s = String(str).trim();
  let d = new Date(s);
  if (!isNaN(d.getTime())) return d;
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (m) {
    d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

/** Vrai si la date tombe le meme jour calendaire que `ref` (comparaison en heure locale). */
function isSameDay(d, ref) {
  if (!d) return false;
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth() && d.getDate() === ref.getDate();
}

router.get("/summary", requireAuth, requireBusinessAccess, async (req, res) => {
  try {
    const now = new Date();
    const curMonth = now.getMonth();
    const curYear = now.getFullYear();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    const resTbl = TABLES.reservations;
    const reservations = resTbl ? await airtable.listRecords(resTbl.tableId, { pageSize: 1000 }) : [];
    const TARIF_FID = "fldjq1ihzoWPC6wMC";
    const CHECKIN_FID = "fldPokQNuLSsA2Hmz";
    const CHECKOUT_FID = "fldprehYFR1XGT8v9";

    let totalRevenue = 0;
    let monthRevenue = 0;
    let upcomingCount = 0;
    let parsedDateCount = 0;
    let todayCheckins = 0;
    let todayCheckouts = 0;
    reservations.forEach((r) => {
      const tarif = Number(r.fields[TARIF_FID]) || 0;
      totalRevenue += tarif;
      const dIn = parseDateLoose(r.fields[CHECKIN_FID]);
      const dOut = parseDateLoose(r.fields[CHECKOUT_FID]);
      if (dIn) {
        parsedDateCount++;
        if (dIn.getMonth() === curMonth && dIn.getFullYear() === curYear) monthRevenue += tarif;
        if (dIn.getTime() >= todayStart) upcomingCount++;
        if (isSameDay(dIn, now)) todayCheckins++;
      }
      if (dOut && isSameDay(dOut, now)) todayCheckouts++;
    });

    const logTbl = TABLES.logements;
    const logements = logTbl ? await airtable.listRecords(logTbl.tableId, { pageSize: 1000 }) : [];
    const STATUT_FID = "fldNwCxHmbRvbwJDs";
    const occupiedCount = logements.filter((r) => rawText(r.fields[STATUT_FID]).toLowerCase().includes("occup")).length;

    const litTbl = TABLES.litiges;
    const litiges = litTbl ? await airtable.listRecords(litTbl.tableId, { pageSize: 1000 }) : [];
    const TODO_FID = "fldSfhdRaihrlslbS";
    const closedKeywords = ["résolu", "resolu", "terminé", "termine", "clôturé", "cloture", "fermé", "ferme"];
    const openLitigesCount = litiges.filter((r) => {
      const t = rawText(r.fields[TODO_FID]).toLowerCase();
      return !closedKeywords.some((k) => t.includes(k));
    }).length;

    const remTbl = TABLES.menageOccasionnel;
    const remplacements = remTbl ? await airtable.listRecords(remTbl.tableId, { pageSize: 1000 }) : [];
    const REM_STATUT_FID = "fldH77iYKi6c1mhbb";
    const REM_DATE_FID = "fldFYmu2Z4MJZEhld";
    const pendingMenageCount = remplacements.filter((r) => rawText(r.fields[REM_STATUT_FID]).toLowerCase().includes("attente")).length;
    // Menages "occasionnels" (remplacements) prevus aujourd'hui, quel que soit leur statut.
    const todayMenageOccasionnel = remplacements.filter((r) => isSameDay(parseDateLoose(r.fields[REM_DATE_FID]), now)).length;
    // Une sortie (check-out) aujourd'hui implique generalement un menage de fin de sejour a faire :
    // c'est l'estimation la plus fiable du "menage du jour" en l'absence d'un planning menage dedie.
    const todayMenageTotal = todayCheckouts + todayMenageOccasionnel;

    res.json({
      revenue: {
        total: Math.round(totalRevenue * 100) / 100,
        currentMonth: Math.round(monthRevenue * 100) / 100,
        reservationsCount: reservations.length,
        avgBasket: reservations.length ? Math.round((totalRevenue / reservations.length) * 100) / 100 : 0,
        upcomingCount,
        datesParsed: parsedDateCount,
      },
      occupancy: {
        occupiedCount,
        totalLogements: logements.length,
        rate: logements.length ? Math.round((occupiedCount / logements.length) * 1000) / 10 : 0,
      },
      today: {
        checkins: todayCheckins,
        checkouts: todayCheckouts,
        menageOccasionnel: todayMenageOccasionnel,
        menageTotal: todayMenageTotal,
      },
      openLitigesCount,
      pendingMenageCount,
    });
  } catch (e) {
    res.status(e.code === "AIRTABLE_NOT_CONFIGURED" ? 409 : 502).json({ error: e.message });
  }
});

module.exports = router;
