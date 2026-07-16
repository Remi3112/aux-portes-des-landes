"use strict";
/** Utilitaires partagés : formatage de valeur brute + filtrage des enregistrements par rôle. */

function rawText(val) {
  if (val === undefined || val === null) return "";
  if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") return String(val);
  if (val.name) return val.name;
  if (val.value) return String(val.value);
  if (val.valuesByLinkedRecordId) return Object.values(val.valuesByLinkedRecordId).flat().join(", ");
  if (Array.isArray(val)) return val.map((v) => v.name || v).join(", ");
  return "";
}

/** Restreint une liste d'enregistrements aux seuls enregistrements concernant le prestataire connecté. */
function scopeForRole(tbl, records, user) {
  if (user.role === "admin" || user.role === "collaborateur") return records;
  const me = (user.name || "").toLowerCase().split(" ")[0];
  if (!me) return [];
  if (tbl.prestataireLinkField) {
    return records.filter((r) => rawText(r.fields[tbl.prestataireLinkField]).toLowerCase().includes(me));
  }
  if (tbl.selfNameFields) {
    return records.filter((r) => tbl.selfNameFields.some((fid) => rawText(r.fields[fid]).toLowerCase().includes(me)));
  }
  return records;
}

module.exports = { rawText, scopeForRole };
