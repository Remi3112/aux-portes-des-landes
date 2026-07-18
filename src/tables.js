"use strict";
/**
 * Schema partage (backend + frontend) de la base Airtable
 * "Conciergerie Aux portes des landes". Ce fichier est servi tel quel
 * au frontend via GET /api/config, et sert aussi cote serveur pour
 * verifier les permissions par role avant tout appel a Airtable.
 *
 * IMPORTANT : ce fichier ne modifie jamais le schema Airtable lui-meme.
 * Il decrit seulement quels champs existent, pour savoir comment les
 * afficher/editer, et qui a le droit de faire quoi.
 */
const T = (i, n, t) => ({ i, n, t });

const TABLES = {
  proprietaires: {
    key: "proprietaires", tableId: "tblF1IQlSCKP30Bfj", label: "Propriétaires", icon: "🏠",
    group: "Propriétaires & logements",
    roles: { admin: "full", collaborateur: "readwrite", prestataire: "none" },
    waConfig: { phone: "fldTw2fMECFzuy0Yj", nom: "fldguMlPi1cbRVNDL", prenom: null, logement: "fldDb5YsdZcEEDw5D", audience: "proprietaire" },
    fields: [
      T("fldDb5YsdZcEEDw5D", "Nom Logement", "singleLineText"),
      T("fldguMlPi1cbRVNDL", "Nom - Prénom", "singleLineText"),
      T("fld7RVT4l41iqnz0u", "Adresse email", "email"),
      T("fldTw2fMECFzuy0Yj", "Téléphone", "phoneNumber"),
      T("fldyuqkCxCS5CBMVU", "Whats app propriétaire", "formula"),
      T("fldMFRWJ4pZstnjdv", "Adresse logement", "singleLineText"),
      T("fldl7w8Ntf7hGnwBi", "Manque infos", "singleSelect"),
      T("fld5Fz9alMYXG0MQu", "Type de logement", "singleSelect"),
      T("fldKvBwiEerONW49r", "Code boites à clé", "singleLineText"),
      T("fldzmuXBKRPOS5hRk", "Code-immeuble", "singleLineText"),
      T("fldZsVLVSYBRAXep5", "Nb-de couchages", "number"),
      T("fldtpGFDcpiCjFC92", "Superficie du logement m²", "number"),
      T("fldvM4r3aRvSmyVLO", "Etage du logement", "number"),
      T("fldZYB4XnrHY9GOE4", "Animaux_acceptes", "singleSelect"),
      T("fldnGkE6rwXMgfS4B", "Accès aux poubelles", "singleSelect"),
      T("fld34sVZgpZ4uVv07", "Avez-vous le wifi dans le logement ?", "singleSelect"),
      T("fldm5pr3RWUsRke8F", "Identifiants de connexion WIFI", "multilineText"),
      T("fld49bVfFUrPgnqgc", "Piscine", "singleSelect"),
      T("flddHEA8qObnkU4gx", "Dates d'ouverture piscine & code d'accès", "multilineText"),
      T("fld5hU6ZeSc623mkW", "Où se trouve le tableau électrique ?", "multilineText"),
      T("fldOa3Rtto5pvWnoZ", "Où se trouve la coupure d'eau générale ?", "multilineText"),
      T("fldDaZBqf2TcaNfIo", "Où les voyageurs doivent-ils jeter les poubelles ?", "multilineText"),
      T("fldpTY13WZKfbAIWS", "Autres informations sur le logement", "multilineText"),
      T("fld6fgm9DqJ5pWEhF", "Key Decisions", "aiText"),
      T("flddbGUv5gxgh4iUP", "Adresse personnelle", "singleLineText"),
      T("fldhMlIh5x1ZwndlH", "Date de naissance", "date"),
      T("fldv2LoKXCH8IUOdl", "Pourcentage commission", "number"),
      T("flddRRvTg2wOhzULC", "Airbnb mot de passe et code secret", "multilineText"),
      T("fldGo91igvfBqY43b", "Identifiant Booking et mot de passe (si compte pro)", "multilineText"),
      T("fldWyz5Cxlmc2jRte", "Notes administratives", "multilineText"),
      T("fldd4UKYM6eHHhu7m", "Date de soumission", "createdTime"),
    ],
    listCols: ["fldDb5YsdZcEEDw5D", "fldguMlPi1cbRVNDL", "fldTw2fMECFzuy0Yj", "fldMFRWJ4pZstnjdv", "fld5Fz9alMYXG0MQu", "fldl7w8Ntf7hGnwBi"],
    detailFields: ["fldDb5YsdZcEEDw5D", "fldguMlPi1cbRVNDL", "fld7RVT4l41iqnz0u", "fldTw2fMECFzuy0Yj", "fldyuqkCxCS5CBMVU", "fldMFRWJ4pZstnjdv", "fld5Fz9alMYXG0MQu", "fldl7w8Ntf7hGnwBi", "fldKvBwiEerONW49r", "fldzmuXBKRPOS5hRk", "fldZsVLVSYBRAXep5", "fldtpGFDcpiCjFC92", "fldvM4r3aRvSmyVLO", "fldZYB4XnrHY9GOE4", "fldnGkE6rwXMgfS4B", "fld34sVZgpZ4uVv07", "fldm5pr3RWUsRke8F", "fld49bVfFUrPgnqgc", "flddHEA8qObnkU4gx", "fld5hU6ZeSc623mkW", "fldOa3Rtto5pvWnoZ", "fldDaZBqf2TcaNfIo", "fldpTY13WZKfbAIWS", "fld6fgm9DqJ5pWEhF", "flddbGUv5gxgh4iUP", "fldhMlIh5x1ZwndlH", "fldv2LoKXCH8IUOdl", "flddRRvTg2wOhzULC", "fldGo91igvfBqY43b", "fldWyz5Cxlmc2jRte", "fldd4UKYM6eHHhu7m"],
    sensitive: ["flddbGUv5gxgh4iUP", "fldhMlIh5x1ZwndlH", "fldv2LoKXCH8IUOdl", "flddRRvTg2wOhzULC", "fldGo91igvfBqY43b", "fldWyz5Cxlmc2jRte"],
    searchCols: ["fldDb5YsdZcEEDw5D", "fldguMlPi1cbRVNDL", "fldMFRWJ4pZstnjdv"],
  },
  logements: {
    key: "logements", tableId: "tbl1CMvGO3tBaILbo", label: "Logements", icon: "🏡",
    group: "Propriétaires & logements",
    roles: { admin: "full", collaborateur: "readwrite", prestataire: "read" },
    fields: [
      T("fldFXeYoY0dQUYF0a", "Numéro propio", "autoNumber"),
      T("fldm4il1uxFIuBvrM", "Nom du logement", "singleLineText"),
      T("fldDU6oeCFqkPe3mm", "ID Logement", "singleLineText"),
      T("fldt3gjk7VBH6AWgD", "Ville", "singleLineText"),
      T("flduuM0OTtrhbqtOC", "Lien airbnb", "url"),
      T("fld8BhmZXlB42LHYG", "Lien Booking", "url"),
      T("fld7Nog48OMg1UMp5", "Temps estimé de ménage", "number"),
      T("fld8IbJmrzy5c3VPf", "Tarif conseillé à la nuitée", "aiText"),
      T("fldC1p1X9qm5MJrjc", "Adresse (fiche propriétaire)", "multipleLookupValues"),
      T("fld6GEtHfZISCsuOc", "Code boîte à clé (fiche propriétaire)", "multipleLookupValues"),
      T("fld0zR8JC2JGM2NXG", "Code immeuble (fiche propriétaire)", "multipleLookupValues"),
      T("fldysAJ7hHuyoPPem", "Nb couchages (fiche propriétaire)", "multipleLookupValues"),
      T("fldSYX1rqDei0HYca", "Accès poubelles (fiche propriétaire)", "multipleLookupValues"),
      T("fldpLrAnsGr0OSEvF", "Identifiants WIFI (fiche propriétaire)", "multipleLookupValues"),
      T("fldYWaqCPoWUSw1bd", "Tableau électrique (fiche propriétaire)", "multipleLookupValues"),
      T("fld4eXMW9AE9r87cG", "Piscine (fiche propriétaire)", "multipleLookupValues"),
      T("fldABC6s7OfS0p3k5", "Caractéristiques principales", "multilineText"),
      T("fld3bySMTWWgbsYZG", "Présence d'extérieur", "singleSelect"),
      T("fldNwCxHmbRvbwJDs", "Statut d'occupation", "singleSelect"),
      T("fldYEPpehYSPPuwPq", "Annonce airbnb ?", "singleSelect"),
      T("fldEI3oXTR1sA1r9w", "Equipe", "multipleRecordLinks"),
      T("fldVAjwHCwpSdf2o6", "Agents de ménage", "multipleLookupValues"),
      T("fld944gpFC9gaCYx2", "Suivi Ménage Occasionnel", "multipleRecordLinks"),
      T("fld5mgPuKOokPsIlR", "Dernière mise à jour", "lastModifiedTime"),
    ],
    listCols: ["fldFXeYoY0dQUYF0a", "fldm4il1uxFIuBvrM", "fldt3gjk7VBH6AWgD", "fldNwCxHmbRvbwJDs", "fldYEPpehYSPPuwPq", "fldVAjwHCwpSdf2o6"],
    detailFields: ["fldFXeYoY0dQUYF0a", "fldm4il1uxFIuBvrM", "fldDU6oeCFqkPe3mm", "fldt3gjk7VBH6AWgD", "flduuM0OTtrhbqtOC", "fld8BhmZXlB42LHYG", "fld7Nog48OMg1UMp5", "fld8IbJmrzy5c3VPf", "fldC1p1X9qm5MJrjc", "fld6GEtHfZISCsuOc", "fld0zR8JC2JGM2NXG", "fldysAJ7hHuyoPPem", "fldSYX1rqDei0HYca", "fldpLrAnsGr0OSEvF", "fldYWaqCPoWUSw1bd", "fld4eXMW9AE9r87cG", "fldABC6s7OfS0p3k5", "fld3bySMTWWgbsYZG", "fldNwCxHmbRvbwJDs", "fldYEPpehYSPPuwPq", "fldEI3oXTR1sA1r9w", "fldVAjwHCwpSdf2o6", "fld944gpFC9gaCYx2", "fld5mgPuKOokPsIlR"],
    sensitive: [],
    prestataireLinkField: "fldVAjwHCwpSdf2o6",
    searchCols: ["fldm4il1uxFIuBvrM", "fldt3gjk7VBH6AWgD", "fldDU6oeCFqkPe3mm"],
  },
  prospects: {
    key: "prospects", tableId: "tblRwNbUZ9dCDVx4s", label: "Prospects (CRM)", icon: "📈",
    group: "Commercial",
    roles: { admin: "full", collaborateur: "readwrite", prestataire: "none" },
    waConfig: { phone: "fldtc0vrFWNcoJARV", nom: "fldjT64I79nu310VD", prenom: "fldyzMh6OQhWxKERU", logement: "fldYKUGyusWp8bp2b", audience: "proprietaire" },
    fields: [
      T("fldjT64I79nu310VD", "Nom", "singleLineText"),
      T("fldyzMh6OQhWxKERU", "Prénom", "singleLineText"),
      T("fld539wYoegyrUFT5", "Email", "email"),
      T("fldtc0vrFWNcoJARV", "Numéro de téléphone", "phoneNumber"),
      T("fldvlnsDeswnb3k7l", "Whats app prospect", "formula"),
      T("fldYKUGyusWp8bp2b", "Adresse logement", "singleLineText"),
      T("fldOD2354CLNe16zT", "Ville", "singleLineText"),
      T("fldh6eykwtA68QzSR", "Code postal", "number"),
      T("fldBJjs8aAHdRNrRZ", "Superficie", "number"),
      T("fldNo3Xnw9TV46OWd", "Nb de couchages", "number"),
      T("fld4NcvbvT0SCk7Hk", "Nb de chambres", "number"),
      T("fldP8JuZcv7d7XD5H", "Type de logement", "singleSelect"),
      T("fldCFa8TcZYs7Vc91", "Equipements", "multipleSelects"),
      T("fldoAXwhnm2P107aL", "Statut du prospect", "singleSelect"),
      T("fldpULULUYukbgGal", "Particularitée", "multilineText"),
      T("fldWiraM6iSeHx1S3", "Résidence principale ou secondaire", "singleSelect"),
      T("fldM57aatuHOzGhuu", "Notes du contact", "richText"),
      T("fldq3aCQfIsiH9tSM", "Envoie du mail 1", "checkbox"),
      T("fldMMhKf1ra5E8Yw2", "Générateur de mail 1er", "aiText"),
      T("fldnw5qQDLd8Ldcj3", "Envoie relance 2", "checkbox"),
      T("fldLSq5LQTIttHiGu", "Relance 1 J +3", "aiText"),
      T("fldsC713aSZyYwrCk", "Relance mail 3", "checkbox"),
      T("fldVWyDvq0pJ6an0o", "Relance 1 J +7", "aiText"),
      T("fldcT3zCVTOGZ0ImP", "Client validé", "checkbox"),
      T("fldnpreaiJcv0ChMs", "Agent IA Envoie de mail Client qualifé", "aiText"),
    ],
    listCols: ["fldjT64I79nu310VD", "fldyzMh6OQhWxKERU", "fldOD2354CLNe16zT", "fldP8JuZcv7d7XD5H", "fldoAXwhnm2P107aL", "fldtc0vrFWNcoJARV"],
    detailFields: ["fldjT64I79nu310VD", "fldyzMh6OQhWxKERU", "fld539wYoegyrUFT5", "fldtc0vrFWNcoJARV", "fldvlnsDeswnb3k7l", "fldYKUGyusWp8bp2b", "fldOD2354CLNe16zT", "fldh6eykwtA68QzSR", "fldBJjs8aAHdRNrRZ", "fldNo3Xnw9TV46OWd", "fld4NcvbvT0SCk7Hk", "fldP8JuZcv7d7XD5H", "fldCFa8TcZYs7Vc91", "fldoAXwhnm2P107aL", "fldWiraM6iSeHx1S3", "fldpULULUYukbgGal", "fldM57aatuHOzGhuu", "fldq3aCQfIsiH9tSM", "fldMMhKf1ra5E8Yw2", "fldnw5qQDLd8Ldcj3", "fldLSq5LQTIttHiGu", "fldsC713aSZyYwrCk", "fldVWyDvq0pJ6an0o", "fldcT3zCVTOGZ0ImP", "fldnpreaiJcv0ChMs"],
    sensitive: [],
    searchCols: ["fldjT64I79nu310VD", "fldyzMh6OQhWxKERU", "fldOD2354CLNe16zT"],
  },
  proprietairesActifs: {
    key: "proprietairesActifs", tableId: "tblWp8uT0cfrwZkE0", label: "Propriétaires actifs (archive)", icon: "🗂️",
    group: "Propriétaires & logements",
    roles: { admin: "full", collaborateur: "read", prestataire: "none" },
    fields: [
      T("fldshZZReEhS1PuMR", "Nom", "singleLineText"),
      T("fldZ1wdrVm9ohHrtj", "Prénom", "singleLineText"),
      T("fld6plPTCYcRYMKZt", "Logement", "singleLineText"),
      T("fldeLHpxpVbiDgZCv", "Attachment Summary", "aiText"),
    ],
    listCols: ["fldshZZReEhS1PuMR", "fldZ1wdrVm9ohHrtj", "fld6plPTCYcRYMKZt"],
    detailFields: ["fldshZZReEhS1PuMR", "fldZ1wdrVm9ohHrtj", "fld6plPTCYcRYMKZt", "fldeLHpxpVbiDgZCv"],
    sensitive: [],
    searchCols: ["fldshZZReEhS1PuMR", "fldZ1wdrVm9ohHrtj", "fld6plPTCYcRYMKZt"],
  },
  documents: {
    key: "documents", tableId: "tblnGJ3XTIgm2wtnB", label: "Documents propriétaires", icon: "📄",
    group: "Propriétaires & logements",
    roles: { admin: "full", collaborateur: "none", prestataire: "none" },
    fields: [
      T("fldPtJXL6CHEFgbpP", "Nom", "singleLineText"),
      T("fldSpK4YlU3vYVwn3", "Prénom", "singleLineText"),
      T("fldEwCuQazbPKjNTX", "RIB", "multipleAttachments"),
      T("fldj37SECkNs6moTo", "Pièce d'identité", "multipleAttachments"),
      T("fldx9dDdvcwvqapV7", "Kbis (si société)", "multipleAttachments"),
      T("fld4DXUo2FVUGXOcn", "Attestation notariée", "multipleAttachments"),
      T("fldo3gLgD8WRX5AKD", "Date de création", "createdTime"),
    ],
    listCols: ["fldPtJXL6CHEFgbpP", "fldSpK4YlU3vYVwn3", "fldo3gLgD8WRX5AKD"],
    detailFields: ["fldPtJXL6CHEFgbpP", "fldSpK4YlU3vYVwn3", "fldEwCuQazbPKjNTX", "fldj37SECkNs6moTo", "fldx9dDdvcwvqapV7", "fld4DXUo2FVUGXOcn", "fldo3gLgD8WRX5AKD"],
    sensitive: ["fldEwCuQazbPKjNTX", "fldj37SECkNs6moTo", "fldx9dDdvcwvqapV7", "fld4DXUo2FVUGXOcn"],
    searchCols: ["fldPtJXL6CHEFgbpP", "fldSpK4YlU3vYVwn3"],
  },
  menage: {
    key: "menage", tableId: "tblmXMCF9lJmmr2Vy", label: "Agents de ménage", icon: "🧹",
    group: "Ménage",
    roles: { admin: "full", collaborateur: "readwrite", prestataire: "self" },
    waConfig: { phone: "fldRbzJpuWfZmxLAs", nom: "fld3VZR2uFZVnsl28", prenom: "fld3hjQS2PC9Zf6ru", logement: "fldf9nI8vEgZqYSSx", audience: "prestataire" },
    fields: [
      T("fld3VZR2uFZVnsl28", "Nom", "singleLineText"),
      T("fld3hjQS2PC9Zf6ru", "Prénom", "multilineText"),
      T("fldehWI45XhtVzEtk", "Tarif de ménage", "currency"),
      T("fldRbzJpuWfZmxLAs", "Numéro de téléphone", "phoneNumber"),
      T("fldLyGDwiC2Fsilo2", "Status", "singleSelect"),
      T("fldf9nI8vEgZqYSSx", "Nom logement", "multipleRecordLinks"),
      T("fld96rbvOeLCYcRUh", "Ville", "singleLineText"),
      T("fldYjGWoWcpAwIyIu", "E mail", "email"),
      T("fldzEFPVKbBlaXNyM", "Code BAC (boîte à clé)", "multipleLookupValues"),
    ],
    listCols: ["fld3VZR2uFZVnsl28", "fld3hjQS2PC9Zf6ru", "fld96rbvOeLCYcRUh", "fldehWI45XhtVzEtk", "fldLyGDwiC2Fsilo2", "fldRbzJpuWfZmxLAs"],
    detailFields: ["fld3VZR2uFZVnsl28", "fld3hjQS2PC9Zf6ru", "fldRbzJpuWfZmxLAs", "fldYjGWoWcpAwIyIu", "fld96rbvOeLCYcRUh", "fldehWI45XhtVzEtk", "fldLyGDwiC2Fsilo2", "fldf9nI8vEgZqYSSx", "fldzEFPVKbBlaXNyM"],
    sensitive: ["fldehWI45XhtVzEtk"],
    selfNameFields: ["fld3VZR2uFZVnsl28", "fld3hjQS2PC9Zf6ru"],
    searchCols: ["fld3VZR2uFZVnsl28", "fld3hjQS2PC9Zf6ru", "fld96rbvOeLCYcRUh"],
  },
  menageOccasionnel: {
    key: "menageOccasionnel", tableId: "tblkIdVLJqFc5YZcw", label: "Remplacements ménage", icon: "🔁",
    group: "Ménage",
    roles: { admin: "full", collaborateur: "readwrite", prestataire: "selfWrite" },
    waConfig: { phone: "fldYfC74Z8mrr6g70", nom: "fldjOiGLHj8Blo8DU", prenom: "fldTjiXxzDaclqyex", logement: "fldYdWzrze257f0HJ", audience: "prestataire" },
    fields: [
      T("fldjOiGLHj8Blo8DU", "Nom prestataire", "singleLineText"),
      T("fldTjiXxzDaclqyex", "Prénom prestataire", "singleLineText"),
      T("fldYdWzrze257f0HJ", "Nom logement", "multipleRecordLinks"),
      T("fldYfC74Z8mrr6g70", "Numéro de téléphone", "singleLineText"),
      T("fldFYmu2Z4MJZEhld", "Date du ménage prévu", "date"),
      T("fldH77iYKi6c1mhbb", "Statut", "singleSelect"),
      T("fldJUEJmX0797HPht", "Relance le", "date"),
      T("fldbwztBgW5bcaRFn", "Contacté le", "date"),
      T("fldV985o6GzpiW7bx", "Date début absence", "date"),
      T("fldFxtFCrnOtVrlhC", "Date fin absence", "date"),
      T("fldnxJJ0hn9J73N8G", "Logements assignés", "multipleRecordLinks"),
      T("fldCzcZMFzz986gUX", "Prestataire à remplacer", "multipleRecordLinks"),
      T("fldl51EnwcQYNXIYv", "Commentaires", "multilineText"),
      T("fld47roaGv1la2frY", "Disponibilité synthétique", "aiText"),
    ],
    listCols: ["fldjOiGLHj8Blo8DU", "fldYdWzrze257f0HJ", "fldFYmu2Z4MJZEhld", "fldH77iYKi6c1mhbb", "fldV985o6GzpiW7bx", "fldFxtFCrnOtVrlhC"],
    detailFields: ["fldjOiGLHj8Blo8DU", "fldTjiXxzDaclqyex", "fldYfC74Z8mrr6g70", "fldYdWzrze257f0HJ", "fldnxJJ0hn9J73N8G", "fldFYmu2Z4MJZEhld", "fldH77iYKi6c1mhbb", "fldV985o6GzpiW7bx", "fldFxtFCrnOtVrlhC", "fldJUEJmX0797HPht", "fldbwztBgW5bcaRFn", "fldCzcZMFzz986gUX", "fldl51EnwcQYNXIYv", "fld47roaGv1la2frY"],
    sensitive: [],
    selfNameFields: ["fldjOiGLHj8Blo8DU", "fldTjiXxzDaclqyex"],
    prestataireEditable: ["fldH77iYKi6c1mhbb", "fldl51EnwcQYNXIYv"],
    searchCols: ["fldjOiGLHj8Blo8DU", "fldTjiXxzDaclqyex"],
  },
  reservations: {
    key: "reservations", tableId: "tblBBBod2DFKDuCCF", label: "Réservations", icon: "📅",
    group: "Voyageurs",
    roles: { admin: "full", collaborateur: "readwrite", prestataire: "none" },
    waConfig: { phone: "fldwxzZqEr1hGHrSX", nom: "fldceYRh9RSZVH30T", prenom: "fldGNo5KboI2wpzGv", logement: "fldza1htZ7LQ2uyxC", checkin: "fldPokQNuLSsA2Hmz", checkout: "fldprehYFR1XGT8v9", audience: "voyageur" },
    fields: [
      T("fld3bBXShZaIMjHi9", "ID Booking", "number"),
      T("fldceYRh9RSZVH30T", "Nom", "singleLineText"),
      T("fldGNo5KboI2wpzGv", "Prénom", "singleLineText"),
      T("fldlooPNBUFPex5Fd", "Email", "email"),
      T("fldwxzZqEr1hGHrSX", "Numéro de téléphone", "phoneNumber"),
      T("fldDsg7D3kqQvpc8m", "Lien WhatsApp", "formula"),
      T("fldza1htZ7LQ2uyxC", "Logement (texte)", "formula"),
      T("fldAK6SsQ4k8DFHzN", "Code confirmation ref", "singleLineText"),
      T("fldPokQNuLSsA2Hmz", "Date de check in", "singleLineText"),
      T("fldprehYFR1XGT8v9", "Date de check out", "singleLineText"),
      T("fldjq1ihzoWPC6wMC", "Tarif", "currency"),
      T("fldOE6MryOq2hJQDk", "Canal OTA", "singleLineText"),
      T("fldfuXIaMWAI2ynCD", "Professionnel", "checkbox"),
      T("fldrenugoEf21CFgG", "Loisir", "checkbox"),
      T("flditGrR9pPWcWKYe", "Agent IA msg relance promo", "aiText"),
      T("fldnL4OlaMMden5bH", "Litiges (texte)", "singleLineText"),
    ],
    listCols: ["fldceYRh9RSZVH30T", "fldGNo5KboI2wpzGv", "fldza1htZ7LQ2uyxC", "fldPokQNuLSsA2Hmz", "fldprehYFR1XGT8v9", "fldOE6MryOq2hJQDk"],
    detailFields: ["fld3bBXShZaIMjHi9", "fldceYRh9RSZVH30T", "fldGNo5KboI2wpzGv", "fldlooPNBUFPex5Fd", "fldwxzZqEr1hGHrSX", "fldDsg7D3kqQvpc8m", "fldza1htZ7LQ2uyxC", "fldAK6SsQ4k8DFHzN", "fldPokQNuLSsA2Hmz", "fldprehYFR1XGT8v9", "fldjq1ihzoWPC6wMC", "fldOE6MryOq2hJQDk", "fldfuXIaMWAI2ynCD", "fldrenugoEf21CFgG", "flditGrR9pPWcWKYe", "fldnL4OlaMMden5bH"],
    sensitive: [],
    searchCols: ["fldceYRh9RSZVH30T", "fldGNo5KboI2wpzGv", "fldAK6SsQ4k8DFHzN"],
  },
  avis: {
    key: "avis", tableId: "tbl6jjMPEewTINgHz", label: "Avis voyageurs", icon: "⭐",
    group: "Voyageurs",
    roles: { admin: "full", collaborateur: "readwrite", prestataire: "none" },
    waConfig: { phone: "fldMqVGXKWS43CYg6", nom: null, prenom: "fldqlQkUzRJR7ZPHt", logement: "fld95siM2rGcquu1R", audience: "voyageur" },
    fields: [
      T("fldqlQkUzRJR7ZPHt", "Prenom du voyageur", "multilineText"),
      T("fldMqVGXKWS43CYg6", "Téléphone Guest", "phoneNumber"),
      T("fldgSJyzgysReyHGF", "Mail guest", "email"),
      T("fld95siM2rGcquu1R", "Logement réservé", "multilineText"),
      T("fldMbiZNxL6iQTAdp", "Note attribuée", "singleLineText"),
      T("fldMK9lXWIuU1tLY3", "Avis voyageur", "multilineText"),
      T("fldW1pDjJUuFEqMjJ", "Date de l'avis 5 étoiles", "dateTime"),
      T("fldFGI8rYVbSlITJe", "Message après avis 5 étoiles (IA)", "aiText"),
      T("fldvczWSFYRg710bi", "Message <5 étoiles via Airbnb (IA)", "aiText"),
      T("fldkczyXpM7xKRjoR", "Webhook msg WhatsApp", "button"),
      T("fldhEKzMClX88cMXx", "Msg envoyé", "checkbox"),
      T("fld3hjPEGPpM8WwjP", "Lien réponse Airbnb", "url"),
    ],
    listCols: ["fldqlQkUzRJR7ZPHt", "fld95siM2rGcquu1R", "fldMbiZNxL6iQTAdp", "fldW1pDjJUuFEqMjJ", "fldhEKzMClX88cMXx"],
    detailFields: ["fldqlQkUzRJR7ZPHt", "fldMqVGXKWS43CYg6", "fldgSJyzgysReyHGF", "fld95siM2rGcquu1R", "fldMbiZNxL6iQTAdp", "fldMK9lXWIuU1tLY3", "fldW1pDjJUuFEqMjJ", "fldFGI8rYVbSlITJe", "fldvczWSFYRg710bi", "fldkczyXpM7xKRjoR", "fldhEKzMClX88cMXx", "fld3hjPEGPpM8WwjP"],
    sensitive: [],
    searchCols: ["fldqlQkUzRJR7ZPHt", "fld95siM2rGcquu1R"],
  },
  litiges: {
    key: "litiges", tableId: "tblQITckh6aH7wFXY", label: "Litiges", icon: "⚠️",
    group: "Voyageurs",
    roles: { admin: "full", collaborateur: "readwrite", prestataire: "none" },
    fields: [
      T("fldMcekiXgcMb3dhU", "Nom du voyageur", "multilineText"),
      T("fld8Wk0k7k9C5RlNx", "Logement (réservation)", "multipleLookupValues"),
      T("fldfRFnlDu8NAvZ8l", "Date de check out", "multipleLookupValues"),
      T("fld7ax9d7ezbBom4U", "Date limite déclaration (14j) — IA", "aiText"),
      T("fld6n8nmPbd59DrJf", "Lien centre résolution Airbnb — IA", "aiText"),
      T("fldVSV3V2B5cREOiT", "Commentaire litige", "multilineText"),
      T("fldNZeEXgVeypyicZ", "Produit concerné", "multilineText"),
      T("fldYqTUNyI0xrrck1", "Récupérable ?", "singleSelect"),
      T("fldSfhdRaihrlslbS", "Mise à jour TODO", "singleSelect"),
      T("fldrem6merOv6wJpm", "AI assist voyageur", "aiText"),
      T("fldoqiZR6d2UCz03v", "AI assist pour Airbnb", "aiText"),
      T("fldUnpHNPhupJyITi", "Contacter artisan", "multipleSelects"),
      T("fldJLj5nfzTWU44Ne", "Contacté le", "dateTime"),
      T("fldvxNLACv9Os1PFo", "Date du passage artisan", "dateTime"),
      T("flde7jWSKRJz35SYu", "Passage artisan (statut)", "singleSelect"),
      T("fld29oTeR7P9qh6Gd", "Remboursement Aircover", "multilineText"),
      T("fldp7mpyxEUs306F8", "Montant remboursé à facturer", "multilineText"),
      T("fldwiByVZWsFn1A3V", "Date de création", "createdTime"),
    ],
    listCols: ["fldMcekiXgcMb3dhU", "fld8Wk0k7k9C5RlNx", "fldSfhdRaihrlslbS", "fldYqTUNyI0xrrck1", "fldwiByVZWsFn1A3V"],
    detailFields: ["fldMcekiXgcMb3dhU", "fld8Wk0k7k9C5RlNx", "fldfRFnlDu8NAvZ8l", "fld7ax9d7ezbBom4U", "fld6n8nmPbd59DrJf", "fldVSV3V2B5cREOiT", "fldNZeEXgVeypyicZ", "fldYqTUNyI0xrrck1", "fldSfhdRaihrlslbS", "fldrem6merOv6wJpm", "fldoqiZR6d2UCz03v", "fldUnpHNPhupJyITi", "fldJLj5nfzTWU44Ne", "fldvxNLACv9Os1PFo", "flde7jWSKRJz35SYu", "fld29oTeR7P9qh6Gd", "fldp7mpyxEUs306F8", "fldwiByVZWsFn1A3V"],
    sensitive: [],
    searchCols: ["fldMcekiXgcMb3dhU", "fldVSV3V2B5cREOiT"],
  },
  checklist: {
    key: "checklist", tableId: "tblUrrwgioLs8v7VJ", label: "Checklist nouvelle annonce", icon: "✅",
    group: "Propriétaires & logements",
    roles: { admin: "full", collaborateur: "readwrite", prestataire: "none" },
    fields: [
      T("fldUlbtq5SBwKKJbG", "Annonce numéro", "autoNumber"),
      T("fldtc2y2ocMuqdSzf", "Propriétaire", "multipleRecordLinks"),
      T("fldQqYqjVcgDBHckr", "Nom Logement", "multipleLookupValues"),
      T("fldN8UfI2GqiEmxon", "Status", "singleSelect"),
      T("fldtUWm9HmzEAuic0", "Titre / Description annonce", "checkbox"),
      T("fldcdHIkvjLp4kAUF", "Couchages selon chambres", "checkbox"),
      T("fldchNSeH1H1QM9of", "Nombre de voyageurs", "checkbox"),
      T("fldCNd7iwQkYLDx6J", "Équipements remplis", "checkbox"),
      T("fldMdRdNYmR7n79Du", "Étape 1 validée", "checkbox"),
      T("fldqfOAZ8ZwkYlLDX", "Connexion channel manager / OTA", "singleSelect"),
      T("fldbNd1CMNVgYjVO9", "Contact avec le prospect", "checkbox"),
      T("fldQTZtLmLCqA1OAx", "Envoi récap prestations + contrat", "checkbox"),
      T("fldbzfv3YexAbaeQ4", "Réception infos contrat", "checkbox"),
      T("fldUsnThezRsZcJlI", "Étape 2 validée", "checkbox"),
      T("fldEZ8z4smNreUomp", "Envoi contrat signature + fiche + attestation", "checkbox"),
      T("fldreZLvL9piLa9rY", "Création compte Airbnb", "checkbox"),
      T("fldgZmFa3sbwXYdKw", "Création annonce Airbnb complète", "checkbox"),
      T("fldxA9HvQls1yyUO1", "Ajout co-hôte + hôte principal", "checkbox"),
      T("fld1WfWQnRXoTH6iP", "Création compte Booking (parrainage)", "checkbox"),
      T("fldMxlPc1p60kqyk7", "Création annonce Booking complète", "checkbox"),
      T("fldztxMsfM02mpKfv", "Coordonnées bancaires propriétaire", "checkbox"),
      T("fld6D4dlRerIwCYMK", "Questionnaires Booking", "checkbox"),
      T("fldGVUM6cJ3YfpONp", "Ajout contact principal + utilisateur", "checkbox"),
      T("fldtD6DXb1iLnim7r", "Étape 3 validée", "checkbox"),
      T("fldNNCicuwDxb45Nx", "Création compte Stripe", "checkbox"),
      T("fldHtMI2oOPNOL3X4", "Connexion Beds24 - Airbnb", "checkbox"),
      T("fldzwn8TixVgugfzb", "Connexion Beds24 - Booking", "checkbox"),
      T("fld30REFCyWs6du9b", "Connexion Pricelabs", "checkbox"),
      T("fld4SQvnsPXqIYxA2", "Connexion Stripe sur Beds24", "checkbox"),
      T("fldFVqh5QxTiVeHm0", "Règles de prix Beds24", "checkbox"),
      T("fldajq9AwiBUzBRhA", "Activation Jana", "checkbox"),
      T("fld00up1IUn4CZHdQ", "Partie propriétaire sur Jana", "checkbox"),
      T("fldKoAdtdMlbhoVkH", "Infos pratiques + frais sur Jana", "checkbox"),
      T("fld0IWm5kUhWIF66C", "Annonce terminée", "checkbox"),
    ],
    // Repere visuellement, dans le formulaire, ce que recouvre chaque etape
    // du processus de mise en ligne d'une nouvelle annonce (voir openDetailModal
    // dans public/app.js, qui insere ce titre + cette explication juste avant
    // le premier champ liste ici).
    sections: [
      { before: "fldUlbtq5SBwKKJbG", title: "Étape 1 — Informations du logement", desc: "Réunir les infos de base indispensables avant toute mise en ligne : description de l'annonce, couchages selon les chambres, capacité voyageurs et équipements." },
      { before: "fldqfOAZ8ZwkYlLDX", title: "Étape 2 — Prise de contact & contrat", desc: "Connexion aux plateformes (channel manager / OTA), prise de contact avec le prospect, envoi puis réception des informations du contrat." },
      { before: "fldEZ8z4smNreUomp", title: "Étape 3 — Création des annonces & comptes", desc: "Signature du contrat, création des comptes et des annonces Airbnb/Booking, ajout des accès et des coordonnées bancaires du propriétaire." },
      { before: "fldNNCicuwDxb45Nx", title: "Mise en ligne technique", desc: "Dernière ligne droite : connexions Stripe, Beds24, Pricelabs et Jana pour finaliser techniquement l'annonce avant qu'elle soit marquée terminée." },
    ],
    listCols: ["fldUlbtq5SBwKKJbG", "fldQqYqjVcgDBHckr", "fldN8UfI2GqiEmxon", "fldMdRdNYmR7n79Du", "fldUsnThezRsZcJlI", "fldtD6DXb1iLnim7r", "fld0IWm5kUhWIF66C"],
    detailFields: ["fldUlbtq5SBwKKJbG", "fldtc2y2ocMuqdSzf", "fldQqYqjVcgDBHckr", "fldN8UfI2GqiEmxon", "fldtUWm9HmzEAuic0", "fldcdHIkvjLp4kAUF", "fldchNSeH1H1QM9of", "fldCNd7iwQkYLDx6J", "fldMdRdNYmR7n79Du", "fldqfOAZ8ZwkYlLDX", "fldbNd1CMNVgYjVO9", "fldQTZtLmLCqA1OAx", "fldbzfv3YexAbaeQ4", "fldUsnThezRsZcJlI", "fldEZ8z4smNreUomp", "fldreZLvL9piLa9rY", "fldgZmFa3sbwXYdKw", "fldxA9HvQls1yyUO1", "fld1WfWQnRXoTH6iP", "fldMxlPc1p60kqyk7", "fldztxMsfM02mpKfv", "fld6D4dlRerIwCYMK", "fldGVUM6cJ3YfpONp", "fldtD6DXb1iLnim7r", "fldNNCicuwDxb45Nx", "fldHtMI2oOPNOL3X4", "fldzwn8TixVgugfzb", "fld30REFCyWs6du9b", "fld4SQvnsPXqIYxA2", "fldFVqh5QxTiVeHm0", "fldajq9AwiBUzBRhA", "fld00up1IUn4CZHdQ", "fldKoAdtdMlbhoVkH", "fld0IWm5kUhWIF66C"],
    sensitive: [],
    searchCols: ["fldQqYqjVcgDBHckr"],
  },
  artisans: {
    key: "artisans", tableId: "tblPdZ4Mue0MsPF9K", label: "Artisans", icon: "🔧",
    group: "Ménage",
    roles: { admin: "full", collaborateur: "readwrite", prestataire: "none" },
    waConfig: { phone: "fldN4eJ7h1hAYg8Ig", nom: "fldmcRReRkhg5u42q", prenom: "fldxOAJVPEzOyxaH4", logement: null, audience: "prestataire" },
    fields: [
      T("fldmcRReRkhg5u42q", "Nom", "singleLineText"),
      T("fldxOAJVPEzOyxaH4", "Prénom", "singleLineText"),
      T("fldVddp9pRWMUsHTy", "Activité", "singleSelect"),
      T("flddYVpfsAtmWmnQI", "Ville", "singleLineText"),
      T("fldN4eJ7h1hAYg8Ig", "Numéro de téléphone", "phoneNumber"),
      T("fldaX8OqkrUPu3Rd5", "Mail", "email"),
    ],
    listCols: ["fldmcRReRkhg5u42q", "fldxOAJVPEzOyxaH4", "fldVddp9pRWMUsHTy", "flddYVpfsAtmWmnQI", "fldN4eJ7h1hAYg8Ig"],
    detailFields: ["fldmcRReRkhg5u42q", "fldxOAJVPEzOyxaH4", "fldVddp9pRWMUsHTy", "flddYVpfsAtmWmnQI", "fldN4eJ7h1hAYg8Ig", "fldaX8OqkrUPu3Rd5"],
    sensitive: [],
    searchCols: ["fldmcRReRkhg5u42q", "fldxOAJVPEzOyxaH4", "flddYVpfsAtmWmnQI"],
  },
};

const TABLE_ORDER = ["logements", "proprietaires", "checklist", "proprietairesActifs", "documents", "prospects", "reservations", "avis", "litiges", "menage", "menageOccasionnel", "artisans"];

const READONLY_TYPES = new Set(["formula", "aiText", "rollup", "multipleLookupValues", "button", "createdTime", "createdBy", "lastModifiedTime", "autoNumber", "multipleRecordLinks", "multipleAttachments", "multipleCollaborators", "singleCollaborator"]);

// Tables dont la creation d'un nouvel enregistrement declenche une notification Slack (si configure).
const SLACK_NOTIFY_TABLES = ["litiges", "prospects", "menageOccasionnel"];

const AI_KEYWORDS = {
  proprietaires: ["propriétaire", "proprio", "rib ", "code boite", "codes d'accès", "wifi"],
  logements: ["logement", "bien ", "villa", "gite", "appartement", "annonce", "tarif", "ville"],
  prospects: ["prospect", "lead", "nouveau client", "pipeline commercial"],
  reservations: ["réservation", "reservation", "voyageur", "check in", "check-in", "checkin", "arrivée", "départ", "client", "séjour"],
  avis: ["avis", "review", "étoile", "note"],
  litiges: ["litige", "dégât", "degat", "remboursement", "aircover", "casse", "dommage"],
  menage: ["ménage", "menage", "femme de ménage", "agent de ménage", "nettoyage"],
  menageOccasionnel: ["remplacement", "absence", "occasionnel"],
  checklist: ["checklist", "check list", "nouvelle annonce", "mise en route", "étapes"],
  artisans: ["artisan", "plombier", "électricien", "electricien", "réparation", "reparation"],
  documents: ["document", "kbis", "pièce d'identité", "piece d'identite"],
};

const ACCESS_LEVELS = ["full", "readwrite", "read", "self", "selfWrite", "none"];

/**
 * Surcharges de droits d'acces definies par l'admin (Parametres > Droits
 * d'acces), stockees dans data/db.json sous accessOverrides[tableKey][role].
 * Le profil admin n'est jamais surchargeable. En l'absence de surcharge,
 * le niveau par defaut defini dans TABLES[...].roles s'applique.
 */
function getOverride(role, tableKey) {
  if (role === "admin") return null;
  const db = require("./db");
  const data = db.load();
  const ov = data.accessOverrides && data.accessOverrides[tableKey];
  const level = ov && ov[role];
  return ACCESS_LEVELS.includes(level) ? level : null;
}

function permFor(role, tableKey) {
  const tbl = TABLES[tableKey];
  if (!tbl) return "none";
  const override = getOverride(role, tableKey);
  if (override) return override;
  return tbl.roles[role] || "none";
}

/** Verification serveur (defense en profondeur - ne pas se fier au seul frontend). */
function can(role, tableKey, action) {
  const perm = permFor(role, tableKey);
  if (perm === "none") return false;
  if (perm === "full") return true;
  if (perm === "read") return action === "read";
  if (perm === "readwrite") return action !== "delete";
  if (perm === "self") return action === "read";
  if (perm === "selfWrite") return action === "read" || action === "update";
  return false;
}

function visibleTables(role) {
  return TABLE_ORDER.filter((k) => permFor(role, k) !== "none");
}

/**
 * Convertit un objet fields keye par Field ID (notre representation interne,
 * stable) en objet keye par NOM de champ (seul format fiable en ecriture
 * cote API Airtable). Les champs sans correspondance connue sont ignores.
 */
function fieldsIdToName(tbl, fieldsById) {
  const out = {};
  Object.entries(fieldsById || {}).forEach(([fid, val]) => {
    const f = tbl.fields.find((f) => f.i === fid);
    if (f) out[f.n] = val;
  });
  return out;
}

/**
 * Champs "multipleRecordLinks" pour lesquels on connait la table liee avec
 * certitude (d'apres le nom du champ). Permet de proposer un vrai selecteur
 * d'enregistrements lies (au lieu d'un simple affichage en lecture seule)
 * pour CES champs precis. Les autres champs multipleRecordLinks (ex: "Equipe"
 * sur Logements, dont la table cible n'est pas documentee avec certitude)
 * restent affiches en lecture seule par securite (on ne veut jamais risquer
 * de lier un enregistrement a la mauvaise table).
 */
const LINKED_FIELDS = {
  fld944gpFC9gaCYx2: { table: "menageOccasionnel" }, // Logements."Suivi Menage Occasionnel"
  fldnxJJ0hn9J73N8G: { table: "logements" }, // Remplacements menage."Logements assignes"
  fldCzcZMFzz986gUX: { table: "menage" }, // Remplacements menage."Prestataire a remplacer"
  fldtc2y2ocMuqdSzf: { table: "proprietaires" }, // Checklist."Proprietaire"
  fldf9nI8vEgZqYSSx: { table: "logements" }, // Agents de menage."Nom logement"
  fldYdWzrze257f0HJ: { table: "logements" }, // Remplacements menage."Nom logement"
};

/** Libelle lisible pour un enregistrement d'une table, utilise dans les
 * selecteurs de liens (base sur les colonnes de recherche de la table). */
function labelForRecord(tbl, fieldsById) {
  const { rawText } = require("./scope");
  const cols = (tbl.searchCols && tbl.searchCols.length ? tbl.searchCols : tbl.listCols) || [];
  const parts = cols.map((fid) => rawText(fieldsById[fid])).filter(Boolean);
  return parts.join(" \u2014 ");
}

/**
 * Complète la configuration statique de chaque table avec les champs qui
 * existent réellement dans Airtable mais qui ne sont pas (encore) décrits
 * ci-dessus (ex : champ ajouté directement dans Airtable après coup, sans
 * modification du code de l'application).
 *
 * Sans ça, un tel champ resterait invisible dans les formulaires même si
 * l'API Airtable le renvoie déjà (voir routes/records.js, qui transmet au
 * frontend les `fields` d'un enregistrement sans filtrage) : le formulaire
 * ne sait simplement pas qu'il doit l'afficher.
 *
 * `schemaTables` vient de src/airtable.js -> getCachedBaseSchema() (API Meta
 * Airtable). Idempotent et sans effet si `schemaTables` est vide/absent ou
 * si aucun champ nouveau n'est trouvé pour une table donnée.
 */
function augmentTablesWithSchema(schemaTables) {
  if (!schemaTables || !schemaTables.length) return TABLES;
  const out = {};
  for (const key of Object.keys(TABLES)) {
    const tbl = TABLES[key];
    const schemaTable = schemaTables.find((t) => t.id === tbl.tableId);
    if (!schemaTable) { out[key] = tbl; continue; }
    const knownIds = new Set(tbl.fields.map((f) => f.i));
    const extra = (schemaTable.fields || []).filter((f) => !knownIds.has(f.id));
    if (!extra.length) { out[key] = tbl; continue; }
    // Type Airtable brut reutilise tel quel : il correspond deja au format
    // attendu par le frontend (voir public/app.js renderInput/displayValue),
    // et READONLY_TYPES protege automatiquement contre l'ecriture des types
    // qu'on ne sait pas gerer correctement (formula, rollup, etc.).
    const extraFieldDefs = extra.map((f) => T(f.id, f.name, f.type));
    out[key] = {
      ...tbl,
      fields: [...tbl.fields, ...extraFieldDefs],
      detailFields: [...tbl.detailFields, ...extra.map((f) => f.id)],
    };
  }
  return out;
}

module.exports = {
  TABLES,
  TABLE_ORDER,
  READONLY_TYPES,
  AI_KEYWORDS,
  SLACK_NOTIFY_TABLES,
  LINKED_FIELDS,
  ACCESS_LEVELS,
  can,
  visibleTables,
  permFor,
  fieldsIdToName,
  labelForRecord,
  augmentTablesWithSchema,
};
