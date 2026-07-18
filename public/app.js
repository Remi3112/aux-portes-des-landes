"use strict";
/* =========================================================================
   AUX PORTES DES LANDES — CENTRALE DE GESTION (frontend)
   Parle exclusivement à notre propre backend (/api/*), qui lui-même
   parle à Airtable / Slack / Anthropic avec les jetons enregistrés en
   Paramètres > Intégrations. Aucun jeton n'est jamais exposé ici.
   ========================================================================= */

let CONFIG = null;      // { tableOrder, tables, integrationsStatus }
let CURRENT_USER = null;
let ROUTE = "dashboard";
let AI_HISTORY = [];
let SLACK_CURRENT_CHANNEL = null;

function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
/** Champ mot de passe avec bouton oeil pour afficher/masquer la saisie. */
function pwField(id, opts){
  opts = opts || {};
  const attrs = [
    `id="${id}"`, `type="password"`,
    opts.autocomplete ? `autocomplete="${opts.autocomplete}"` : "",
    opts.placeholder ? `placeholder="${esc(opts.placeholder)}"` : "",
  ].filter(Boolean).join(" ");
  return `<div class="pwWrap"><input ${attrs}><button type="button" class="pwToggleBtn" data-toggle-for="${id}" tabindex="-1" aria-label="Afficher le mot de passe">👁️</button></div>`;
}

async function api(method, url, body){
  let res;
  try{
    res = await fetch(url, {
      method, credentials: "include",
      headers: body ? {"Content-Type":"application/json"} : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  }catch(networkErr){
    // Le fetch echoue AVANT meme d'atteindre le serveur (pas de reponse HTTP du tout) :
    // serveur non demarre / arrete, mauvaise adresse, page ouverte en double-clic (file://)
    // au lieu de passer par http://localhost:3000, ou coupure reseau ponctuelle.
    const err = new Error("Impossible de contacter le serveur. Vérifie que : 1) le serveur est bien démarré (la fenêtre ouverte avec start.bat/start.sh doit rester ouverte et afficher \"Ouvre ton navigateur sur http://localhost:3000\"), 2) tu accèdes bien à l'application via http://localhost:3000 dans la barre d'adresse (et non en ouvrant un fichier directement). Si le problème persiste, ferme puis relance start.bat.");
    err.isNetworkError = true;
    throw err;
  }
  let json = {};
  try{ json = await res.json(); }catch(e){}
  if(!res.ok){
    const err = new Error(json.error || ("Erreur "+res.status));
    err.status = res.status;
    err.code = json.code;
    throw err;
  }
  return json;
}

document.addEventListener("click", (e)=>{
  const btn = e.target.closest(".pwToggleBtn");
  if(!btn) return;
  const input = document.getElementById(btn.dataset.toggleFor);
  if(!input) return;
  const show = input.type === "password";
  input.type = show ? "text" : "password";
  btn.textContent = show ? "🙈" : "👁️";
  btn.setAttribute("aria-label", show ? "Masquer le mot de passe" : "Afficher le mot de passe");
});

/* =========================================================================
   HELPERS — formatage des valeurs par type (identique a la logique Airtable)
   ========================================================================= */
const READONLY_TYPES = new Set(["formula","aiText","rollup","multipleLookupValues","button","createdTime","createdBy","lastModifiedTime","autoNumber","multipleRecordLinks","multipleAttachments","multipleCollaborators","singleCollaborator"]);

function displayValue(type, val, labelMap){
  if(val===undefined || val===null || val==="") return "";
  switch(type){
    case "checkbox": return val ? "✅" : "—";
    case "singleSelect": return val && val.name ? esc(val.name) : (typeof val==="string"?esc(val):"");
    case "multipleSelects": return Array.isArray(val) ? val.map(v=>esc(v.name||v)).join(", ") : "";
    case "multipleRecordLinks": {
      if(!Array.isArray(val) || !val.length) return "";
      return val.map(id=> esc((labelMap && labelMap[id]) || id)).join(", ");
    }
    case "multipleLookupValues": {
      if(val && val.valuesByLinkedRecordId) return Object.values(val.valuesByLinkedRecordId).flat().map(esc).join(", ");
      if(Array.isArray(val)) return val.map(v=>esc(v.name||v)).join(", ");
      return "";
    }
    case "formula":
    case "aiText": {
      let text = val;
      if(val && typeof val === "object"){
        if(val.state==="empty") return "<span class='muted'>—</span>";
        text = val.value || "";
      }
      if(isUrlLike(text)) return linkButtonHtml(text);
      return text ? esc(text) : "";
    }
    case "button": {
      if(!val || !val.url) return "";
      const info = smartLinkInfo(val.url);
      return `<a class="${info.cls}" href="${esc(val.url)}" target="_blank" rel="noopener">${info.icon} ${esc(val.label||info.label)}</a>`;
    }
    case "url": return linkButtonHtml(val);
    case "email": return `<a href="mailto:${esc(val)}">${esc(val)}</a>`;
    case "multipleAttachments": {
      if(!Array.isArray(val) || !val.length) return "";
      return `<div class="attList">${val.map(a=>{
        const thumb = a.thumbnails && a.thumbnails.small ? a.thumbnails.small.url : null;
        return thumb ? `<a href="${esc(a.url)}" target="_blank" rel="noopener"><img src="${esc(thumb)}"></a>` : `<a class="btn small secondary" href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.filename||"fichier")}</a>`;
      }).join("")}</div>`;
    }
    case "createdBy": return val && (val.name||val.email) ? esc(val.name||val.email) : "";
    case "createdTime": case "lastModifiedTime": case "dateTime": return esc(new Date(val).toLocaleString("fr-FR"));
    case "date": return esc(val);
    case "currency": return (typeof val==="number") ? val.toLocaleString("fr-FR",{style:"currency",currency:"EUR"}) : esc(val);
    default: {
      const s = String(val);
      if(isUrlLike(s)) return linkButtonHtml(s);
      return esc(s);
    }
  }
}
function rawTextValue(type, val){
  if(val===undefined||val===null) return "";
  if(typeof val === "string" || typeof val === "number" || typeof val === "boolean") return String(val);
  if(Array.isArray(val) && type==="multipleRecordLinks") return val.join(", ");
  if(val.name) return val.name;
  if(val.value) return val.value;
  if(val.valuesByLinkedRecordId) return Object.values(val.valuesByLinkedRecordId).flat().join(", ");
  if(Array.isArray(val)) return val.map(v=>v.name||v).join(", ");
  return "";
}
function fieldType(tbl, fid){ const f = tbl.fields.find(f=>f.i===fid); return f?f.t:"singleLineText"; }
function fieldName(tbl, fid){ const f = tbl.fields.find(f=>f.i===fid); return f?f.n:fid; }
function roleLabel(r){ return {admin:"Administrateur", collaborateur:"Collaborateur", prestataire:"Prestataire ménage"}[r]||r; }
function isLinkedEditable(tbl, fid){ return (tbl.linkedFields||[]).includes(fid); }

function can(tableKey, action){
  const t = CONFIG.tables[tableKey];
  if(!t) return false;
  const perm = t.permission;
  if(perm==="none") return false;
  if(perm==="full") return true;
  if(perm==="read") return action==="read";
  if(perm==="readwrite") return action!=="delete";
  if(perm==="self") return action==="read";
  if(perm==="selfWrite") return action==="read" || action==="update";
  return false;
}

/** Construit un lien "cliquer pour écrire sur WhatsApp" a partir d'un numero
 * de telephone brut (formats francais/internationaux courants tolérés). */
function waLinkFromPhone(phone, presetText){
  if(!phone) return null;
  let digits = String(phone).replace(/[^\d+]/g,"");
  digits = digits.replace(/^00/,"+");
  if(digits.startsWith("0")) digits = "+33"+digits.slice(1); // hypothese France par defaut
  if(!digits.startsWith("+")) digits = "+"+digits;
  const clean = digits.replace(/\D/g,"");
  if(clean.length < 8) return null;
  const text = presetText ? `?text=${encodeURIComponent(presetText)}` : "";
  return `https://wa.me/${clean}${text}`;
}
function waButtonHtml(url, label){
  if(!url) return `<span class="waBtn disabled">💬 WhatsApp indisponible</span>`;
  return `<a class="waBtn" href="${esc(url)}" target="_blank" rel="noopener">💬 ${esc(label||"WhatsApp")}</a>`;
}

/* ---- Modeles WhatsApp reutilisables (Contacts voyageurs) ---- */
let WA_TEMPLATES_CACHE = null;
let FORM_LINKS_CACHE = null;
async function loadWaTemplatesAndLinks(){
  if(WA_TEMPLATES_CACHE && FORM_LINKS_CACHE) return { templates: WA_TEMPLATES_CACHE, links: FORM_LINKS_CACHE };
  try{
    const [t, l] = await Promise.all([
      api("GET", "/api/settings/whatsapp-templates"),
      api("GET", "/api/settings/form-links"),
    ]);
    WA_TEMPLATES_CACHE = t.templates || [];
    FORM_LINKS_CACHE = l.links || [];
  }catch(e){
    WA_TEMPLATES_CACHE = []; FORM_LINKS_CACHE = [];
  }
  return { templates: WA_TEMPLATES_CACHE, links: FORM_LINKS_CACHE };
}
function fillTemplate(body, ctx){
  return String(body||"").replace(/\{\{(\w+)\}\}/g, (m, key)=> (ctx[key]!==undefined && ctx[key]!==null && ctx[key]!=="") ? ctx[key] : m);
}
async function openWaComposer(contact){
  const { templates: allTemplates, links: allLinks } = await loadWaTemplatesAndLinks();
  const audience = contact.audience || "voyageur";
  const templates = allTemplates.filter(t=> !t.audience || t.audience==="tous" || t.audience===audience);
  const links = allLinks.filter(l=> !l.audience || l.audience==="tous" || l.audience===audience);
  const ctx = { prenom: contact.prenom||"", nom: contact.nom||"", logement: contact.logement||"", checkin: contact.checkin||"", checkout: contact.checkout||"" };
  const overlay = document.createElement("div");
  overlay.className = "modalOverlay";
  overlay.innerHTML = `<div class="modal" style="max-width:560px;">
    <button class="closeX" id="waComposerClose">×</button>
    <h3>Composer un message WhatsApp</h3>
    <div class="modalSub">Pour ${esc(contact.prenom)} ${esc(contact.nom)}${contact.phone?" — "+esc(contact.phone):""}</div>
    ${!contact.phone && !contact.waUrl ? `<p class="muted">Aucun numéro de téléphone renseigné pour ce contact — impossible d'ouvrir WhatsApp.</p>` : ""}
    <div class="field"><label>Modèle</label>
      <select id="waComposerTpl">
        <option value="">— Message vide —</option>
        ${templates.map(t=>`<option value="${esc(t.id)}">${esc(t.name)}</option>`).join("")}
      </select>
    </div>
    <div class="field"><label>Lien de formulaire à insérer (optionnel)</label>
      <select id="waComposerLink">
        <option value="">— Aucun —</option>
        ${links.map(l=>`<option value="${esc(l.id)}">${esc(l.label)}</option>`).join("")}
      </select>
    </div>
    <div class="field"><label>Message (modifiable avant envoi)</label>
      <textarea id="waComposerText" rows="7"></textarea>
    </div>
    <div class="modalFooter">
      <div></div>
      <div style="display:flex;gap:8px;">
        <button type="button" class="btn secondary" id="waComposerCancel">Fermer</button>
        <button type="button" class="btn" id="waComposerSend">Ouvrir WhatsApp</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  let mouseDownOnOverlay = false;
  overlay.addEventListener("mousedown", (e)=>{ mouseDownOnOverlay = (e.target === overlay); });
  overlay.addEventListener("click", (e)=>{ if(e.target === overlay && mouseDownOnOverlay) overlay.remove(); mouseDownOnOverlay = false; });
  overlay.querySelector("#waComposerClose").onclick = ()=>overlay.remove();
  overlay.querySelector("#waComposerCancel").onclick = ()=>overlay.remove();
  const textEl = overlay.querySelector("#waComposerText");
  const tplSel = overlay.querySelector("#waComposerTpl");
  const linkSel = overlay.querySelector("#waComposerLink");
  function applyTemplate(){
    const tpl = templates.find(t=>t.id===tplSel.value);
    const link = links.find(l=>l.id===linkSel.value);
    const fullCtx = { ...ctx, lien_formulaire: link ? link.url : "" };
    textEl.value = tpl ? fillTemplate(tpl.body, fullCtx) : "";
  }
  tplSel.onchange = applyTemplate;
  linkSel.onchange = applyTemplate;
  overlay.querySelector("#waComposerSend").onclick = ()=>{
    const text = textEl.value.trim();
    const url = contact.phone ? waLinkFromPhone(contact.phone, text) : contact.waUrl;
    if(!url){ showToast("Numéro WhatsApp indisponible pour ce contact."); return; }
    window.open(url, "_blank", "noopener");
    overlay.remove();
  };
}

function isUrlLike(str){
  if(typeof str !== "string") return false;
  const s = str.trim();
  if(!s) return false;
  return /^(https?:\/\/|www\.)/i.test(s);
}
function smartLinkInfo(url){
  const u = String(url).toLowerCase();
  if(u.includes("wa.me") || u.includes("whatsapp.com")) return { icon:"💬", label:"Écrire sur WhatsApp", cls:"waBtn" };
  if(u.includes("airbnb.")) return { icon:"🏠", label:"Ouvrir sur Airbnb", cls:"btn small secondary" };
  if(u.includes("booking.com")) return { icon:"🛏️", label:"Ouvrir sur Booking", cls:"btn small secondary" };
  if(u.includes("maps.google") || u.includes("goo.gl/maps") || u.includes("maps.app")) return { icon:"📍", label:"Ouvrir la carte", cls:"btn small secondary" };
  return { icon:"🔗", label:"Ouvrir le lien", cls:"btn small secondary" };
}
function linkButtonHtml(url){
  if(!url) return "";
  const info = smartLinkInfo(url);
  const href = /^https?:\/\//i.test(url) ? url : "https://"+url.replace(/^www\./,"");
  return `<a class="${info.cls}" href="${esc(href)}" target="_blank" rel="noopener">${info.icon} ${esc(info.label)}</a>`;
}

/* =========================================================================
   LOGIN
   ========================================================================= */
function renderLogin(prefillError){
  const el = document.getElementById("loginScreen");
  el.style.display = "flex";
  document.getElementById("app").style.display = "none";
  el.innerHTML = `
    <div class="loginBox">
      <h1>Aux Portes des Landes</h1>
      <p class="sub">Centrale de gestion conciergerie — connexion</p>
      <div class="roleTabs" id="roleTabs">
        <div class="roleTab active" data-role="admin">Admin</div>
        <div class="roleTab" data-role="collaborateur">Collaborateur</div>
        <div class="roleTab" data-role="prestataire">Prestataire ménage</div>
      </div>
      <div class="loginErr" id="loginErr" style="${prefillError?'display:block':''}">${esc(prefillError||"")}</div>
      <div id="resendVerifBox" style="display:none;margin-bottom:10px;">
        <button class="btn small secondary" id="resendVerifBtn" type="button">Renvoyer l'email de validation</button>
      </div>
      <div class="field"><label>Identifiant</label><input id="loginUser" type="text" autocomplete="username"></div>
      <div class="field"><label>Mot de passe</label>${pwField("loginPass", {autocomplete:"current-password"})}</div>
      <button class="btn" id="loginBtn" style="width:100%;">Se connecter</button>
      <div style="text-align:center;margin-top:12px;display:flex;justify-content:center;gap:16px;flex-wrap:wrap;">
        <a href="#" id="forgotPwLink" style="font-size:12.5px;color:var(--accent);text-decoration:underline;">Mot de passe oublié ?</a>
        <a href="#" id="goSignupLink" style="font-size:12.5px;color:var(--accent);text-decoration:underline;">Créer un compte</a>
      </div>
      <div class="loginHint" id="forgotPwPanel" style="display:none;">
        Lance <code>reset-password.bat</code> (Windows) ou <code>reset-password.sh</code> (Mac/Linux)
        à la racine du dossier de l'application (à côté de <code>start.bat</code>). Il te permet de
        définir un nouveau mot de passe pour n'importe quel compte — y compris admin — sans avoir
        besoin d'être déjà connecté. Le nouveau mot de passe reste valable même après une mise à jour.
      </div>
      <div class="loginHint">Le mot de passe administrateur temporaire du premier démarrage est affiché une seule fois dans la console du serveur (fenêtre où tu as lancé <code>npm start</code>). Une fois connecté, tu restes connecté automatiquement (30 jours), même après une mise à jour ou un redémarrage du serveur.</div>
    </div>`;
  el.querySelector("#forgotPwLink").onclick = (e)=>{
    e.preventDefault();
    const panel = el.querySelector("#forgotPwPanel");
    panel.style.display = panel.style.display==="none" ? "block" : "none";
  };
  el.querySelector("#goSignupLink").onclick = (e)=>{ e.preventDefault(); renderSignup(); };
  let selectedRole = "admin";
  el.querySelectorAll(".roleTab").forEach(tab=>{
    tab.onclick = ()=>{
      el.querySelectorAll(".roleTab").forEach(t=>t.classList.remove("active"));
      tab.classList.add("active");
      selectedRole = tab.dataset.role;
    };
  });
  const doLogin = async ()=>{
    const username = el.querySelector("#loginUser").value.trim();
    const password = el.querySelector("#loginPass").value;
    const errBox = el.querySelector("#loginErr");
    const resendBox = el.querySelector("#resendVerifBox");
    errBox.style.display = "none";
    resendBox.style.display = "none";
    if(!username || !password){ errBox.textContent="Merci de renseigner l'identifiant et le mot de passe."; errBox.style.display="block"; return; }
    try{
      const { user } = await api("POST", "/api/auth/login", { username, password, role: selectedRole });
      CURRENT_USER = user;
      await boot();
    }catch(e){
      errBox.textContent = e.message; errBox.style.display="block";
      if(e.code === "EMAIL_NOT_VERIFIED"){
        resendBox.style.display = "block";
        el.querySelector("#resendVerifBtn").onclick = async ()=>{
          try{ await api("POST", "/api/auth/resend-verification", { username }); showToast("Email de validation renvoyé."); }
          catch(err){ alert(err.message); }
        };
      }
    }
  };
  el.querySelector("#loginBtn").onclick = doLogin;
  el.querySelector("#loginPass").addEventListener("keydown", e=>{ if(e.key==="Enter") doLogin(); });
}

/* =========================================================================
   INSCRIPTION (creation de compte publique, avec validation par email)
   ========================================================================= */
function renderSignup(){
  const el = document.getElementById("loginScreen");
  el.style.display = "flex";
  document.getElementById("app").style.display = "none";
  el.innerHTML = `
    <div class="loginBox">
      <h1>Créer un compte</h1>
      <p class="sub">Aux Portes des Landes — Centrale de gestion</p>
      <div class="loginErr" id="signupErr"></div>
      <div class="field"><label>Nom complet</label><input id="suName" placeholder="ex: Marie Dupont"></div>
      <div class="field"><label>Adresse email</label><input id="suEmail" type="email" placeholder="ex: marie@exemple.com"></div>
      <div class="field"><label>Identifiant</label><input id="suUsername" autocomplete="username"></div>
      <div class="field"><label>Mot de passe</label>${pwField("suPassword", {autocomplete:"new-password"})}</div>
      <div class="field"><label>Confirmation du mot de passe</label>${pwField("suPassword2", {autocomplete:"new-password"})}</div>
      <div class="field"><label>Profil</label>
        <select id="suRole">
          <option value="collaborateur">Collaborateur</option>
          <option value="prestataire">Prestataire ménage</option>
          <option value="admin">Administrateur</option>
        </select>
      </div>
      <div class="field"><label>Téléphone (optionnel)</label><input id="suPhone" placeholder="0600000000"></div>
      <button class="btn" id="signupBtn" style="width:100%;">Créer le compte</button>
      <div style="text-align:center;margin-top:12px;">
        <a href="#" id="backToLoginLink" style="font-size:12.5px;color:var(--accent);text-decoration:underline;">← Retour à la connexion</a>
      </div>
      <div class="loginHint">Un email de confirmation est envoyé à l'adresse renseignée : le compte reste
      inutilisable tant que le lien reçu n'a pas été cliqué (valable 24h). Pour un prestataire ménage,
      utilise exactement le même prénom que dans la table "Agents de ménage" pour que son planning
      s'affiche automatiquement.</div>
    </div>`;
  el.querySelector("#backToLoginLink").onclick = (e)=>{ e.preventDefault(); renderLogin(); };
  el.querySelector("#signupBtn").onclick = async ()=>{
    const name = el.querySelector("#suName").value.trim();
    const emailAddr = el.querySelector("#suEmail").value.trim();
    const username = el.querySelector("#suUsername").value.trim();
    const password = el.querySelector("#suPassword").value;
    const password2 = el.querySelector("#suPassword2").value;
    const role = el.querySelector("#suRole").value;
    const phone = el.querySelector("#suPhone").value.trim();
    const errBox = el.querySelector("#signupErr");
    errBox.style.display = "none";
    if(!name || !emailAddr || !username || !password){ errBox.textContent="Merci de remplir tous les champs obligatoires."; errBox.style.display="block"; return; }
    if(password.length < 6){ errBox.textContent="Le mot de passe doit contenir au moins 6 caractères."; errBox.style.display="block"; return; }
    if(password !== password2){ errBox.textContent="Les deux mots de passe ne correspondent pas."; errBox.style.display="block"; return; }
    try{
      await api("POST", "/api/auth/signup", { name, email: emailAddr, username, password, role, phone });
      el.innerHTML = `
        <div class="loginBox">
          <h1>Compte créé</h1>
          <p class="sub">Vérifie ta boîte mail (${esc(emailAddr)}) pour activer ton compte, puis reviens te connecter.</p>
          <button class="btn" id="backToLoginBtn" style="width:100%;">Retour à la connexion</button>
        </div>`;
      el.querySelector("#backToLoginBtn").onclick = ()=> renderLogin();
    }catch(e){
      errBox.textContent = e.message; errBox.style.display="block";
    }
  };
}

/* =========================================================================
   SIDEBAR
   ========================================================================= */
function renderSidebar(){
  const groups = {};
  CONFIG.tableOrder.forEach(k=>{
    const g = CONFIG.tables[k].group;
    groups[g] = groups[g] || [];
    groups[g].push(k);
  });
  let html = `<div class="brand"><b>🌲 Aux Portes des Landes</b><span>Centrale de gestion</span></div><nav>`;
  html += navItem("dashboard","📊","Tableau de bord");
  Object.entries(groups).forEach(([g, keys])=>{
    html += `<div class="navGroup"><div class="navGroupTitle">${esc(g)}</div>`;
    keys.forEach(k=> html += navItem(k, CONFIG.tables[k].icon, CONFIG.tables[k].label));
    html += `</div>`;
  });
  html += `<div class="navGroup"><div class="navGroupTitle">Assistance & équipe</div>`;
  html += navItem("ai","🤖","Assistant IA");
  if(["admin","collaborateur"].includes(CURRENT_USER.role)){
    html += navItem("waHub","📇","Messagerie WhatsApp");
    html += navItem("contacts","📱","Contacts voyageurs");
    html += navItem("slack","💬","Messagerie Slack");
  }
  // Chaque prestataire menage ne voit QUE son propre lien de formulaire de
  // litige (renseigne par l'admin dans Parametres > Utilisateurs) — jamais
  // celui d'un autre prestataire : la donnee vient de CURRENT_USER (sa
  // propre session), jamais d'une liste partagee entre comptes.
  if(CURRENT_USER.role==="prestataire"){
    html += navItem("declareLitige","⚠️","Déclarer un litige");
  }
  html += navItem("faq","❓","Aide / FAQ");
  html += navItem("settings","⚙️","Paramètres");
  html += `</div></nav>`;
  html += `<div class="userBox"><div class="who">${esc(CURRENT_USER.name)}</div><div class="role">${roleLabel(CURRENT_USER.role)}</div><button class="btn secondary small" id="logoutBtn">Se déconnecter</button></div>`;
  document.getElementById("sidebar").innerHTML = html;
  document.getElementById("logoutBtn").onclick = async ()=>{
    await api("POST", "/api/auth/logout");
    CURRENT_USER = null; CONFIG = null; ROUTE = "dashboard";
    renderLogin();
  };
  document.querySelectorAll(".navItem").forEach(it=>{
    it.onclick = ()=>{ ROUTE = it.dataset.route; renderApp(); };
  });
}
function navItem(route, icon, label){
  return `<div class="navItem ${ROUTE===route?'active':''}" data-route="${route}">${icon} <span>${esc(label)}</span></div>`;
}

/* =========================================================================
   ROUTING
   ========================================================================= */
async function renderApp(){
  renderSidebar();
  document.getElementById("topActions").innerHTML = "";
  const content = document.getElementById("content");
  if(ROUTE==="dashboard"){ document.getElementById("pageTitle").textContent="Tableau de bord"; return renderDashboard(); }
  if(ROUTE==="ai"){ document.getElementById("pageTitle").textContent="Assistant IA"; return renderAI(); }
  if(ROUTE==="waHub"){ document.getElementById("pageTitle").textContent="Messagerie WhatsApp"; return renderWaHub(); }
  if(ROUTE==="contacts"){ document.getElementById("pageTitle").textContent="Contacts voyageurs"; return renderContacts(); }
  if(ROUTE==="slack"){ document.getElementById("pageTitle").textContent="Messagerie Slack"; return renderSlack(); }
  if(ROUTE==="declareLitige"){ document.getElementById("pageTitle").textContent="Déclarer un litige"; return renderDeclareLitige(); }
  if(ROUTE==="faq"){ document.getElementById("pageTitle").textContent="Aide / FAQ"; return renderFAQ(); }
  if(ROUTE==="settings"){ document.getElementById("pageTitle").textContent="Paramètres"; return renderSettings(); }
  if(CONFIG.tables[ROUTE]){ document.getElementById("pageTitle").textContent=CONFIG.tables[ROUTE].label; return renderTableView(ROUTE); }
  content.innerHTML = `<div class="emptyState">Page introuvable.</div>`;
}

function integrationBanner(missing){
  return `<div class="card" style="border-color:#e8c98a;background:#fff8e6;">⚠️ ${esc(missing)} n'est pas encore connecté. Rends-toi dans <b>Paramètres &gt; Intégrations</b> pour le configurer.</div>`;
}

/* ---- Dashboard ---- */
async function renderDashboard(){
  const content = document.getElementById("content");
  if(!CONFIG.integrationsStatus.airtable){
    content.innerHTML = integrationBanner("Airtable");
    return;
  }
  if(CURRENT_USER.role==="prestataire") return renderDashboardPrestataire();
  content.innerHTML = `<div class="loadingRow">Chargement des indicateurs…</div>`;
  const keys = CONFIG.tableOrder;
  const kpiKeys = ["logements","reservations","litiges","prospects"].filter(k=>keys.includes(k));
  content.innerHTML = `
    <div class="card">
      <h3 style="margin-top:0;">Bienvenue ${esc(CURRENT_USER.name)} 👋</h3>
      <p class="muted" style="margin-bottom:0;">Cette centrale lit et écrit en direct dans ta base Airtable. Utilise le menu à gauche pour naviguer entre les modules, ou pose une question à l'assistant IA.</p>
    </div>
    <div class="kpiRow" id="revenueRow"><div class="kpi loadingRow" style="grid-column:1/-1;">Chargement du chiffre d'affaires…</div></div>
    <div class="kpiRow" id="kpiRow">${kpiKeys.map(k=>`<div class="kpi" id="kpi-${k}"><div class="n">…</div><div class="l">${esc(CONFIG.tables[k].label)}</div></div>`).join("")}</div>
    <div class="card">
      <h3 style="margin-top:0;">Accès rapide</h3>
      <div>${keys.map(k=>`<span class="quickQ" data-goto="${k}">${CONFIG.tables[k].icon} ${esc(CONFIG.tables[k].label)}</span>`).join("")}</div>
    </div>`;
  document.querySelectorAll("[data-goto]").forEach(el=> el.onclick = ()=>{ ROUTE = el.dataset.goto; renderApp(); });
  for(const k of kpiKeys){
    api("GET", `/api/records/${k}`).then(({records})=>{
      const box = document.getElementById("kpi-"+k);
      if(box) box.querySelector(".n").textContent = records.length;
    }).catch(()=>{ const box=document.getElementById("kpi-"+k); if(box) box.querySelector(".n").textContent="?"; });
  }
  loadRevenueSummary();
}
async function loadRevenueSummary(){
  const row = document.getElementById("revenueRow");
  if(!row) return;
  try{
    const s = await api("GET", "/api/dashboard/summary");
    row.innerHTML = `
      <div class="kpi revenueCard"><div class="big">${s.revenue.currentMonth.toLocaleString('fr-FR',{style:'currency',currency:'EUR'})}</div><div class="l">CA en cours (mois)</div><div class="sub">${s.revenue.reservationsCount} réservation(s) enregistrée(s) au total</div></div>
      <div class="kpi revenueCard"><div class="big">${s.revenue.total.toLocaleString('fr-FR',{style:'currency',currency:'EUR'})}</div><div class="l">CA total (toutes réservations)</div><div class="sub">Panier moyen : ${s.revenue.avgBasket.toLocaleString('fr-FR',{style:'currency',currency:'EUR'})}</div></div>
      <div class="kpi revenueCard"><div class="big">${s.occupancy.rate}%</div><div class="l">Taux d'occupation</div><div class="sub">${s.occupancy.occupiedCount}/${s.occupancy.totalLogements} logements occupés</div></div>
      <div class="kpi revenueCard"><div class="big">${s.openLitigesCount}</div><div class="l">Litiges ouverts</div><div class="sub">${s.pendingMenageCount} ménage(s) à confirmer</div></div>
      <div class="kpi revenueCard"><div class="big">${s.today.checkins} / ${s.today.checkouts}</div><div class="l">Entrées / sorties aujourd'hui</div><div class="sub">Arrivées et départs du jour (réservations)</div></div>
      <div class="kpi revenueCard"><div class="big">${s.today.menageTotal}</div><div class="l">Ménages à effectuer aujourd'hui</div><div class="sub">${s.today.checkouts} départ(s) + ${s.today.menageOccasionnel} remplacement(s) prévu(s)</div></div>`;
  }catch(e){
    row.innerHTML = e.status===403
      ? `<div class="kpi" style="grid-column:1/-1;"><div class="l muted">Indicateurs financiers réservés à l'équipe interne.</div></div>`
      : `<div class="kpi" style="grid-column:1/-1;"><div class="l muted">Indicateurs indisponibles (${esc(e.message)}).</div></div>`;
  }
}
async function renderDashboardPrestataire(){
  const content = document.getElementById("content");
  content.innerHTML = `<div class="loadingRow">Chargement de ton planning…</div>`;
  try{
    const { records, linkedLabels } = await api("GET", "/api/records/logements");
    content.innerHTML = `
      <div class="card"><h3 style="margin-top:0;">Bonjour ${esc(CURRENT_USER.name)} 👋</h3>
      <p class="muted" style="margin-bottom:0;">Voici les logements dont tu as la charge. Clique sur une ligne pour voir les codes d'accès et infos pratiques.</p></div>
      <div class="kpiRow"><div class="kpi"><div class="n">${records.length}</div><div class="l">Logements assignés</div></div></div>
      <div class="card"><h3 style="margin-top:0;">Mes logements</h3><div id="miniTable"></div></div>`;
    renderRowsInto("miniTable", "logements", records, false, linkedLabels);
  }catch(e){
    content.innerHTML = `<div class="card">Erreur : ${esc(e.message)}</div>`;
  }
}

/** Page reservee au profil "prestataire" : un seul bouton vers SON lien de
 * formulaire Airtable individuel (declaration de litige), renseigne par un
 * administrateur dans Parametres > Utilisateurs. Volontairement minimaliste
 * et strictement scope a CURRENT_USER — un prestataire ne peut techniquement
 * pas voir le lien d'un autre prestataire, puisque cette valeur ne provient
 * que de sa propre session (/api/auth/me), jamais d'une liste partagee. */
async function renderDeclareLitige(){
  const content = document.getElementById("content");
  const url = CURRENT_USER.litigeFormUrl;
  if(!url){
    content.innerHTML = `<div class="card">
      <h3 style="margin-top:0;">⚠️ Déclarer un litige</h3>
      <p class="muted" style="margin-bottom:0;">Aucun lien de formulaire n'a encore été associé à ton compte.
      Contacte un administrateur pour qu'il le renseigne dans Paramètres &gt; Utilisateurs.</p>
    </div>`;
    return;
  }
  content.innerHTML = `<div class="card">
    <h3 style="margin-top:0;">⚠️ Déclarer un litige</h3>
    <p class="muted">Ce lien t'est propre : utilise-le pour signaler tout litige ou incident constaté sur un logement.</p>
    <a class="btn" href="${esc(url)}" target="_blank" rel="noopener">📋 Ouvrir le formulaire de déclaration</a>
  </div>`;
}

/* ---- Table generic view ---- */
async function renderTableView(key){
  const tbl = CONFIG.tables[key];
  const content = document.getElementById("content");
  const topActions = document.getElementById("topActions");
  if(!CONFIG.integrationsStatus.airtable){ content.innerHTML = integrationBanner("Airtable"); return; }
  if(!can(key,"read")){ content.innerHTML = `<div class="emptyState">🔒 Accès non autorisé pour ton profil (${roleLabel(CURRENT_USER.role)}).</div>`; return; }
  let actionsHtml = "";
  if(can(key,"create")) actionsHtml += `<button class="btn" id="newRecBtn">+ Nouveau</button>`;
  actionsHtml += `<button class="btn secondary" id="exportCsvBtn">⬇️ Exporter CSV</button>`;
  topActions.innerHTML = actionsHtml;
  if(can(key,"create")) document.getElementById("newRecBtn").onclick = ()=> openDetailModal(key, null, currentLinkedLabels);

  // Filtre rapide : premier champ singleSelect visible dans la liste de colonnes.
  const filterFid = tbl.listCols.find(fid => fieldType(tbl,fid)==="singleSelect");

  content.innerHTML = `
    <div class="toolbar">
      <input type="text" id="searchBox" placeholder="Rechercher...">
      ${filterFid ? `<select id="quickFilter"><option value="">Tous les statuts</option></select>` : ""}
      <span class="muted" id="countLabel"></span>
    </div>
    <div class="card" style="padding:0;overflow-x:auto;"><div id="tableWrap" class="loadingRow">Chargement…</div></div>`;
  let records = [];
  let currentLinkedLabels = {};
  try{
    ({ records, linkedLabels: currentLinkedLabels } = await api("GET", `/api/records/${key}`));
  }catch(e){
    document.getElementById("tableWrap").innerHTML = `<div class="emptyState">${esc(e.message)}</div>`;
    return;
  }
  let currentFilterValue = "";
  function applyFilters(){
    const q = document.getElementById("searchBox").value.toLowerCase();
    let filtered = records;
    if(q) filtered = filtered.filter(r=> tbl.searchCols.some(fid=>{
      const v = rawTextValue(fieldType(tbl,fid), r.fields[fid]);
      return v.toLowerCase().includes(q);
    }));
    if(filterFid && currentFilterValue) filtered = filtered.filter(r=> rawTextValue("singleSelect", r.fields[filterFid])===currentFilterValue);
    renderRowsInto("tableWrap", key, filtered, true, currentLinkedLabels);
    return filtered;
  }
  renderRowsInto("tableWrap", key, records, true, currentLinkedLabels);
  document.getElementById("searchBox").addEventListener("input", applyFilters);
  if(filterFid){
    api("GET", `/api/records/${key}/choices/${filterFid}`).then(({choices})=>{
      const sel = document.getElementById("quickFilter");
      if(!sel) return;
      sel.innerHTML = `<option value="">Tous les statuts</option>` + choices.map(c=>`<option value="${esc(c.name)}">${esc(c.name)}</option>`).join("");
      sel.addEventListener("change", ()=>{ currentFilterValue = sel.value; applyFilters(); });
    }).catch(()=>{});
  }
  document.getElementById("exportCsvBtn").onclick = ()=>{
    const visible = applyFilters();
    exportRecordsToCsv(tbl, visible);
  };
}

function exportRecordsToCsv(tbl, records){
  const cols = tbl.detailFields.filter(fid=>{
    const type = fieldType(tbl, fid);
    return type!=="multipleAttachments"; // pieces jointes non exportables en CSV
  });
  const header = cols.map(fid=>fieldName(tbl,fid));
  const csvEscape = (v)=>{
    const s = String(v==null?"":v);
    return /[",;\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
  };
  const rows = records.map(r=> cols.map(fid=> csvEscape(rawTextValue(fieldType(tbl,fid), r.fields[fid]))).join(";"));
  const csv = "﻿"+[header.map(csvEscape).join(";"), ...rows].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `${tbl.key}-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function renderRowsInto(containerId, key, records, withCount, linkedLabels){
  const tbl = CONFIG.tables[key];
  const wrap = document.getElementById(containerId);
  if(withCount) document.getElementById("countLabel").textContent = records.length+" enregistrement(s)";
  if(!records.length){ wrap.innerHTML = `<div class="emptyState">Aucun enregistrement.</div>`; return; }
  let html = `<table class="dataTable"><thead><tr>${tbl.listCols.map(fid=>`<th>${esc(fieldName(tbl,fid))}</th>`).join("")}</tr></thead><tbody>`;
  records.forEach(r=>{
    html += `<tr data-id="${r.id}">${tbl.listCols.map(fid=>`<td>${displayValue(fieldType(tbl,fid), r.fields[fid], linkedLabels && linkedLabels[fid])}</td>`).join("")}</tr>`;
  });
  html += `</tbody></table>`;
  wrap.innerHTML = html;
  wrap.querySelectorAll("tr[data-id]").forEach(tr=>{
    tr.onclick = ()=>{ const rec = records.find(r=>r.id===tr.dataset.id); openDetailModal(key, rec, linkedLabels); };
  });
}

/** Construit un objet "contact" generique (prenom/nom/telephone/logement) a
 * partir d'un enregistrement, pour n'importe quelle table dotee d'un
 * waConfig (voir src/tables.js) — permet d'ouvrir le composeur WhatsApp
 * depuis n'importe quelle fiche ayant un numero de telephone. */
function buildContactFromRecord(tbl, rec, linkedLabels){
  const wc = tbl.waConfig;
  if(!wc || !rec) return null;
  const phone = rawTextValue("phoneNumber", rec.fields[wc.phone]);
  if(!phone) return null;
  const get = (fid)=> fid ? rawTextValue(fieldType(tbl, fid), rec.fields[fid]) : "";
  // Cas particulier "logement" : c'est presque toujours un champ lie
  // (multipleRecordLinks) vers la table Logements — la valeur brute est alors
  // un ou plusieurs IDs d'enregistrement (recXXXXXXXXXXXXXX), pas un nom
  // lisible. On resout via linkedLabels (meme mecanisme que displayValue()),
  // pour afficher "Villa les Resiniers" au lieu de l'ID technique.
  function getLogement(fid){
    if(!fid) return "";
    const raw = rec.fields[fid];
    if(fieldType(tbl, fid) === "multipleRecordLinks" && Array.isArray(raw)){
      const labelMap = (linkedLabels && linkedLabels[fid]) || {};
      return raw.map(id=> labelMap[id] || id).join(", ");
    }
    return get(fid);
  }
  return {
    id: rec.id,
    prenom: get(wc.prenom),
    nom: get(wc.nom),
    phone,
    logement: getLogement(wc.logement),
    checkin: get(wc.checkin),
    checkout: get(wc.checkout),
    waUrl: waLinkFromPhone(phone, ""),
    audience: wc.audience || "tous",
  };
}

/* ---- Detail / Edit modal ---- */
async function openDetailModal(key, rec, linkedLabels){
  linkedLabels = linkedLabels || {};
  const tbl = CONFIG.tables[key];
  const isNew = !rec;
  const canWrite = isNew ? can(key,"create") : can(key,"update");
  const canDelete = !isNew && can(key,"delete");
  const waContact = !isNew ? buildContactFromRecord(tbl, rec, linkedLabels) : null;
  const overlay = document.createElement("div");
  overlay.className = "modalOverlay";
  const fieldsToShow = tbl.detailFields.filter(fid=>{
    if((tbl.sensitive||[]).includes(fid) && CURRENT_USER.role==="prestataire") return false;
    return true;
  });
  // Sections optionnelles (voir src/tables.js, ex: Checklist nouvelle annonce) :
  // un titre + une explication inseres juste avant le champ indique, pour
  // dire concretement ce que recouvre chaque etape du formulaire.
  const sectionByField = {};
  (tbl.sections||[]).forEach(s=>{ sectionByField[s.before] = s; });
  let bodyHtml = `<div class="modalGrid">`;
  for(const fid of fieldsToShow){
    const section = sectionByField[fid];
    if(section){
      bodyHtml += `<div class="field full" style="grid-column:1/-1;margin-top:${fieldsToShow[0]===fid?'0':'10px'};padding-top:${fieldsToShow[0]===fid?'0':'10px'};border-top:${fieldsToShow[0]===fid?'none':'1px solid var(--border,#e5e5e5)'};">
        <div style="font-weight:600;font-size:14px;">${esc(section.title)}</div>
        <div class="muted" style="font-size:12.5px;margin-top:2px;">${esc(section.desc)}</div>
      </div>`;
    }
    const type = fieldType(tbl, fid);
    const name = fieldName(tbl, fid);
    const val = rec ? rec.fields[fid] : undefined;
    const sensitiveTag = (tbl.sensitive||[]).includes(fid) ? `<span class="badgeSensitive">sensible</span>` : "";
    const linkedEditable = type==="multipleRecordLinks" && isLinkedEditable(tbl, fid);
    const isEditable = canWrite && (!READONLY_TYPES.has(type) || linkedEditable) && !(CURRENT_USER.role==="prestataire" && !(tbl.prestataireEditable||[]).includes(fid));
    const full = ["multilineText","richText","multipleRecordLinks"].includes(type) ? "full":"";
    let fieldControl;
    if(isEditable){
      fieldControl = renderInput(fid, type, val);
      // Champ "url" modifiable (ex: Lien reponse Airbnb) : on garde le champ
      // texte editable, mais on ajoute a cote un vrai bouton cliquable qui
      // ouvre le lien dans un nouvel onglet, plutot que de forcer un
      // copier-coller manuel de l'URL.
      if(type==="url" && val){
        fieldControl = `<div style="display:flex;gap:8px;align-items:center;">${fieldControl}${linkButtonHtml(val)}</div>`;
      }
    } else {
      fieldControl = `<div class="roField">${displayValue(type,val,linkedLabels[fid]) || '<span class="muted">—</span>'}</div>`;
    }
    bodyHtml += `<div class="field ${full}"><label>${esc(name)}${sensitiveTag}</label>${fieldControl}</div>`;
  }
  bodyHtml += `</div>`;
  overlay.innerHTML = `<div class="modal">
    <button class="closeX" id="closeModalBtn">×</button>
    <h3>${isNew? "Nouvel enregistrement — " : ""}${esc(tbl.label)}</h3>
    <div class="modalSub">${isNew? "Remplis les champs puis enregistre." : "Enregistrement #"+esc(rec.id.slice(-6))}</div>
    <form id="detailForm">${bodyHtml}
      <div class="modalFooter">
        <div style="display:flex;gap:8px;">${canDelete ? `<button type="button" class="btn danger small" id="deleteBtn">Supprimer</button>` : ""}${waContact ? `<button type="button" class="btn small secondary" id="waComposerModalBtn">📋 Modèle WhatsApp</button>` : ""}</div>
        <div style="display:flex;gap:8px;">
          <button type="button" class="btn secondary" id="cancelBtn">Fermer</button>
          ${canWrite ? `<button type="submit" class="btn">${isNew?"Créer":"Enregistrer"}</button>` : ""}
        </div>
      </div>
    </form>
  </div>`;
  document.body.appendChild(overlay);
  // Clic en dehors de la fenetre (sur le fond assombri) = fermer, comme la plupart
  // des applis. On verifie que le clic (down ET up) est bien sur l'overlay lui-meme
  // et pas juste un drag de selection de texte qui se termine par-dessus.
  let mouseDownOnOverlay = false;
  overlay.addEventListener("mousedown", (e)=>{ mouseDownOnOverlay = (e.target === overlay); });
  overlay.addEventListener("click", (e)=>{
    if(e.target === overlay && mouseDownOnOverlay) overlay.remove();
    mouseDownOnOverlay = false;
  });
  overlay.querySelector("#closeModalBtn").onclick = ()=>overlay.remove();
  overlay.querySelector("#cancelBtn").onclick = ()=>overlay.remove();
  if(waContact){
    const waBtn = overlay.querySelector("#waComposerModalBtn");
    if(waBtn) waBtn.onclick = ()=> openWaComposer(waContact);
  }
  if(canDelete){
    overlay.querySelector("#deleteBtn").onclick = async ()=>{
      if(!confirm("Supprimer définitivement cet enregistrement ? Cette action est irréversible.")) return;
      try{
        await api("DELETE", `/api/records/${key}/${rec.id}`);
        overlay.remove(); showToast("Enregistrement supprimé."); renderApp();
      }catch(e){ alert("Erreur : "+e.message); }
    };
  }
  for(const fid of fieldsToShow){
    const type = fieldType(tbl, fid);
    if((type==="singleSelect"||type==="multipleSelects") && canWrite) populateSelectChoices(key, fid, overlay, val_for(rec, fid));
    if(type==="multipleRecordLinks" && isLinkedEditable(tbl, fid) && canWrite) populateLinkedChoices(key, fid, overlay, Array.isArray(val_for(rec,fid)) ? val_for(rec,fid) : []);
  }
  if(canWrite){
    overlay.querySelector("#detailForm").addEventListener("submit", async (e)=>{
      e.preventDefault();
      const fields = {};
      for(const fid of fieldsToShow){
        const type = fieldType(tbl, fid);
        const linkedEditable = type==="multipleRecordLinks" && isLinkedEditable(tbl, fid);
        if(READONLY_TYPES.has(type) && !linkedEditable) continue;
        if(CURRENT_USER.role==="prestataire" && !(tbl.prestataireEditable||[]).includes(fid)) continue;
        const input = overlay.querySelector(`[name="${fid}"]`);
        if(!input) continue;
        fields[fid] = readInputValue(type, overlay, fid);
      }
      const submitBtn = overlay.querySelector('button[type=submit]');
      submitBtn.disabled = true; submitBtn.textContent="…";
      try{
        if(isNew){ await api("POST", `/api/records/${key}`, { fields }); showToast("Enregistrement créé."); }
        else{ await api("PATCH", `/api/records/${key}/${rec.id}`, { fields }); showToast("Modifications enregistrées."); }
        overlay.remove(); renderApp();
      }catch(e){
        alert("Erreur lors de l'enregistrement : "+e.message);
        submitBtn.disabled=false; submitBtn.textContent = isNew?"Créer":"Enregistrer";
      }
    });
  }
}
function val_for(rec, fid){ return rec ? rec.fields[fid] : undefined; }
function renderInput(fid, type, val){
  const name = `name="${fid}"`;
  switch(type){
    case "checkbox": return `<input type="checkbox" ${name} ${val?"checked":""} style="width:auto;">`;
    case "number": return `<input type="number" step="any" ${name} value="${val!=null?esc(val):''}">`;
    case "currency": return `<input type="number" step="0.01" ${name} value="${val!=null?esc(val):''}">`;
    case "date": return `<input type="date" ${name} value="${val?esc(val):''}">`;
    case "dateTime": return `<input type="datetime-local" ${name} value="${val?esc(new Date(val).toISOString().slice(0,16)):''}">`;
    case "email": return `<input type="email" ${name} value="${val?esc(val):''}">`;
    case "phoneNumber": return `<input type="text" ${name} value="${val?esc(val):''}">`;
    case "url": return `<input type="url" ${name} value="${val?esc(val):''}">`;
    case "multilineText": case "richText": return `<textarea ${name} rows="4">${val?esc(typeof val==='string'?val:rawTextValue(type,val)):''}</textarea>`;
    case "singleSelect": return `<select ${name} data-current="${val&&val.name?esc(val.name):''}"><option value="">— choisir —</option></select>`;
    case "multipleSelects": return `<div ${name} data-multi="1" data-current='${JSON.stringify((val||[]).map(v=>v.name||v))}'><span class="muted">Chargement des options…</span></div>`;
    case "multipleRecordLinks": return `<div ${name} class="linkPicker" data-linked="1"><span class="muted">Chargement des enregistrements…</span></div>`;
    default: return `<input type="text" ${name} value="${val?esc(typeof val==='string'?val:rawTextValue(type,val)):''}">`;
  }
}
function readInputValue(type, overlay, fid){
  const el = overlay.querySelector(`[name="${fid}"]`);
  switch(type){
    case "checkbox": return el.checked;
    case "number": case "currency": return el.value===""? null : Number(el.value);
    case "dateTime": return el.value ? new Date(el.value).toISOString() : null;
    case "singleSelect": return el.value || null;
    case "multipleSelects": return Array.from(el.querySelectorAll("input[type=checkbox]:checked")).map(c=>c.value);
    case "multipleRecordLinks": return Array.from(el.querySelectorAll("input[type=checkbox]:checked")).map(c=>c.value);
    default: return el.value;
  }
}
async function populateSelectChoices(key, fid, overlay, currentVal){
  const el = overlay.querySelector(`[name="${fid}"]`);
  if(!el) return;
  const tbl = CONFIG.tables[key];
  const type = fieldType(tbl, fid);
  try{
    const { choices } = await api("GET", `/api/records/${key}/choices/${fid}`);
    if(type==="singleSelect"){
      const current = el.dataset.current;
      el.innerHTML = `<option value="">— choisir —</option>` + choices.map(c=>`<option value="${esc(c.name)}" ${c.name===current?"selected":""}>${esc(c.name)}</option>`).join("");
    }else if(type==="multipleSelects"){
      let current = []; try{ current = JSON.parse(el.dataset.current||"[]"); }catch(e){}
      el.innerHTML = choices.map(c=>`<label style="display:inline-flex;align-items:center;gap:4px;margin:2px 8px 2px 0;font-weight:400;font-size:13px;"><input type="checkbox" value="${esc(c.name)}" ${current.includes(c.name)?"checked":""}> ${esc(c.name)}</label>`).join("") || "<span class='muted'>Aucune option définie.</span>";
    }
  }catch(e){
    el.innerHTML = type==="singleSelect" ? `<option value="">(options indisponibles)</option>` : `<span class="muted">Options indisponibles.</span>`;
  }
}
async function populateLinkedChoices(key, fid, overlay, currentIds){
  const el = overlay.querySelector(`[name="${fid}"]`);
  if(!el) return;
  try{
    const { options } = await api("GET", `/api/records/${key}/linked/${fid}`);
    el.innerHTML = options.map(o=>`<label><input type="checkbox" value="${esc(o.id)}" ${currentIds.includes(o.id)?"checked":""}> ${esc(o.label)}</label>`).join("") || "<span class='muted'>Aucun enregistrement disponible dans la table liée.</span>";
  }catch(e){
    el.innerHTML = `<span class="muted">Options indisponibles (${esc(e.message)}).</span>`;
  }
}

/* =========================================================================
   AI AGENT
   ========================================================================= */
async function renderAI(){
  const content = document.getElementById("content");
  if(!CONFIG.integrationsStatus.ai){ content.innerHTML = integrationBanner("L'assistant IA (clé Anthropic)"); return; }
  content.innerHTML = `<div class="card" style="height:calc(100vh - 150px);display:flex;flex-direction:column;">
    <div id="aiPanel"><div id="aiMessages"></div><div id="aiQuick"></div>
    <div id="aiInputRow"><input id="aiInput" type="text" placeholder="Pose ta question (ex: quels litiges sont en cours ?)"><button class="btn" id="aiSendBtn">Envoyer</button></div></div>
  </div>`;
  const msgBox = document.getElementById("aiMessages");
  msgBox.innerHTML = `<div class="msg sys">🤖 Assistant connecté à Airtable. Il répond uniquement à partir des données auxquelles ton profil (${roleLabel(CURRENT_USER.role)}) a accès.</div>`;
  AI_HISTORY.forEach(m=> appendMsg(m.role, m.text, false));
  const quick = document.getElementById("aiQuick");
  const suggestions = CURRENT_USER.role==="prestataire"
    ? ["Quels logements dois-je nettoyer ?","Quel est le code de la boîte à clé de mes logements ?"]
    : ["Quels litiges sont en cours ?","Combien de réservations à venir ?","Quels prospects sont chauds ?","Quels logements ne sont pas encore publiés ?"];
  quick.innerHTML = suggestions.map(s=>`<span class="quickQ">${esc(s)}</span>`).join("");
  quick.querySelectorAll(".quickQ").forEach(q=> q.onclick = ()=>{ document.getElementById("aiInput").value=q.textContent; sendAI(); });
  document.getElementById("aiSendBtn").onclick = sendAI;
  document.getElementById("aiInput").addEventListener("keydown", e=>{ if(e.key==="Enter") sendAI(); });
}
function appendMsg(role, text, push=true){
  const box = document.getElementById("aiMessages");
  const div = document.createElement("div"); div.className = "msg "+role; div.textContent = text;
  box.appendChild(div); box.scrollTop = box.scrollHeight;
  if(push) AI_HISTORY.push({role, text});
}
async function sendAI(){
  const input = document.getElementById("aiInput");
  const q = input.value.trim(); if(!q) return;
  input.value=""; appendMsg("user", q);
  const thinking = document.createElement("div"); thinking.className="msg bot"; thinking.textContent="…";
  document.getElementById("aiMessages").appendChild(thinking);
  try{
    const { answer } = await api("POST", "/api/ai/chat", { question: q });
    thinking.remove(); appendMsg("bot", answer);
  }catch(e){
    thinking.remove(); appendMsg("bot", "Je n'ai pas pu traiter la demande ("+e.message+").");
  }
}

/* =========================================================================
   CONTACTS VOYAGEURS (clic pour WhatsApp)
   ========================================================================= */
/* =========================================================================
   MESSAGERIE WHATSAPP (hub central : Proprietaires / Agents de menage /
   Voyageurs / Collaborateurs) — retrouve les numeros directement depuis
   Airtable (ou les comptes internes pour l'onglet Collaborateurs) et permet
   d'envoyer un modele WhatsApp en un clic, sans avoir a chercher la fiche
   dans le module d'origine.
   ========================================================================= */
const WA_HUB_TABS = [
  { key: "proprietaires", label: "🏠 Propriétaires", source: "table", tableKey: "proprietaires" },
  { key: "menage", label: "🧹 Agents de ménage", source: "table", tableKey: "menage" },
  { key: "reservations", label: "🧳 Voyageurs", source: "table", tableKey: "reservations" },
  { key: "collaborateurs", label: "👤 Collaborateurs", source: "team" },
];
let WA_HUB_TAB = "proprietaires";
let WA_HUB_CONTACTS = [];

async function renderWaHub(){
  const content = document.getElementById("content");
  content.innerHTML = `
    <div class="chanTabs" id="waHubTabs">${WA_HUB_TABS.map(t=>`<div class="chanTab ${t.key===WA_HUB_TAB?'active':''}" data-tab="${t.key}">${t.label}</div>`).join("")}</div>
    <div class="toolbar"><input type="text" id="waHubSearch" placeholder="Rechercher un nom, un logement..."></div>
    <div id="waHubList" class="loadingRow">Chargement…</div>`;
  document.querySelectorAll("#waHubTabs .chanTab").forEach(tab=>{
    tab.onclick = ()=>{ if(tab.dataset.tab!==WA_HUB_TAB){ WA_HUB_TAB = tab.dataset.tab; renderWaHub(); } };
  });
  document.getElementById("waHubSearch").addEventListener("input", (e)=>{
    const q = e.target.value.toLowerCase();
    renderWaHubList(!q ? WA_HUB_CONTACTS : WA_HUB_CONTACTS.filter(c=> (c.prenom+" "+c.nom+" "+c.logement+" "+c.phone).toLowerCase().includes(q)));
  });
  await loadWaHubTab();
}

async function loadWaHubTab(){
  const box = document.getElementById("waHubList");
  const tabDef = WA_HUB_TABS.find(t=>t.key===WA_HUB_TAB);
  try{
    if(tabDef.source==="team"){
      const { contacts: team } = await api("GET", "/api/auth/team-contacts");
      WA_HUB_CONTACTS = team.filter(u=>u.phone).map(u=>{
        const parts = (u.name||"").trim().split(" ");
        return { id: u.id, prenom: parts[0]||u.name, nom: parts.slice(1).join(" "), phone: u.phone, logement: "", waUrl: waLinkFromPhone(u.phone, ""), audience: "collaborateur", roleLabelText: roleLabel(u.role) };
      });
    } else {
      const tbl = CONFIG.tables[tabDef.tableKey];
      if(!tbl){ box.innerHTML = `<div class="emptyState">Ce module n'est pas accessible à ton profil.</div>`; WA_HUB_CONTACTS = []; return; }
      const { records, linkedLabels } = await api("GET", `/api/records/${tabDef.tableKey}`);
      WA_HUB_CONTACTS = records.map(r=>buildContactFromRecord(tbl, r, linkedLabels)).filter(Boolean);
    }
    renderWaHubList(WA_HUB_CONTACTS);
  }catch(e){
    WA_HUB_CONTACTS = [];
    box.innerHTML = `<div class="emptyState">${esc(e.message)}</div>`;
  }
}

function renderWaHubList(contacts){
  const box = document.getElementById("waHubList");
  if(!contacts.length){ box.innerHTML = `<div class="emptyState">Aucun contact avec un numéro de téléphone dans ce module.</div>`; return; }
  box.innerHTML = contacts.map(c=>`
    <div class="contactCard">
      <div>
        <div class="who">${esc(c.prenom)} ${esc(c.nom)}${c.roleLabelText?` — <span class="muted">${esc(c.roleLabelText)}</span>`:""}</div>
        <div class="meta">${c.logement?esc(c.logement)+" — ":""}${esc(c.phone)}${c.checkin?" — arrivée "+esc(c.checkin):""}${c.checkout?" / départ "+esc(c.checkout):""}</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        ${waButtonHtml(c.waUrl, "Écrire")}
        <button type="button" class="btn small secondary waHubComposerBtn" data-id="${esc(c.id)}">📋 Modèle</button>
      </div>
    </div>`).join("");
  box.querySelectorAll(".waHubComposerBtn").forEach(btn=>{
    btn.onclick = ()=>{
      const contact = WA_HUB_CONTACTS.find(c=>c.id===btn.dataset.id);
      if(contact) openWaComposer(contact);
    };
  });
}

async function renderContacts(){
  const content = document.getElementById("content");
  if(!CONFIG.integrationsStatus.airtable){ content.innerHTML = integrationBanner("Airtable"); return; }
  if(!CONFIG.tables.reservations){ content.innerHTML = `<div class="emptyState">La table Réservations n'est pas accessible à ton profil.</div>`; return; }
  content.innerHTML = `<div class="toolbar"><input type="text" id="contactSearch" placeholder="Rechercher un voyageur, une ville, un logement..."></div><div id="contactsList" class="loadingRow">Chargement des contacts…</div>`;
  let records = [];
  try{
    ({ records } = await api("GET", "/api/records/reservations"));
  }catch(e){
    document.getElementById("contactsList").innerHTML = `<div class="emptyState">${esc(e.message)}</div>`;
    return;
  }
  const NOM_FID="fldceYRh9RSZVH30T", PRENOM_FID="fldGNo5KboI2wpzGv", PHONE_FID="fldwxzZqEr1hGHrSX", WA_FID="fldDsg7D3kqQvpc8m", LOG_FID="fldza1htZ7LQ2uyxC", CHECKIN_FID="fldPokQNuLSsA2Hmz", CHECKOUT_FID="fldprehYFR1XGT8v9";
  const contacts = records.map(r=>{
    const nom = rawTextValue("singleLineText", r.fields[NOM_FID]);
    const prenom = rawTextValue("singleLineText", r.fields[PRENOM_FID]);
    const phone = rawTextValue("phoneNumber", r.fields[PHONE_FID]);
    const waField = r.fields[WA_FID];
    const waUrl = (waField && typeof waField==="object" && waField.value) ? waField.value : waLinkFromPhone(phone, `Bonjour ${prenom||""}, `);
    return {
      id: r.id, nom, prenom, phone,
      logement: rawTextValue("formula", r.fields[LOG_FID]),
      checkin: r.fields[CHECKIN_FID]||"", checkout: r.fields[CHECKOUT_FID]||"",
      waUrl, audience: "voyageur",
    };
  }).filter(c=> c.nom || c.prenom || c.phone);
  function render(list){
    const box = document.getElementById("contactsList");
    if(!list.length){ box.innerHTML = `<div class="emptyState">Aucun contact voyageur trouvé.</div>`; return; }
    box.innerHTML = list.map(c=>`
      <div class="contactCard">
        <div>
          <div class="who">${esc(c.prenom)} ${esc(c.nom)}</div>
          <div class="meta">${esc(c.logement||"Logement non renseigné")} ${c.checkin?(" — arrivée "+esc(c.checkin)):""}${c.checkout?(" / départ "+esc(c.checkout)):""}${c.phone?(" — "+esc(c.phone)):""}</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${waButtonHtml(c.waUrl, "Écrire sur WhatsApp")}
          <button type="button" class="btn small secondary waComposerBtn" data-contact-id="${esc(c.id)}">📋 Modèle</button>
        </div>
      </div>`).join("");
  }
  render(contacts);
  document.getElementById("contactSearch").addEventListener("input", (e)=>{
    const q = e.target.value.toLowerCase();
    render(!q ? contacts : contacts.filter(c=> (c.nom+" "+c.prenom+" "+c.logement+" "+c.phone).toLowerCase().includes(q)));
  });
  document.getElementById("contactsList").addEventListener("click", (e)=>{
    const btn = e.target.closest(".waComposerBtn");
    if(!btn) return;
    const contact = contacts.find(c=>c.id===btn.dataset.contactId);
    if(contact) openWaComposer(contact);
  });
}

/* =========================================================================
   MESSAGERIE SLACK (multi-canaux, tout dans le même écran)
   ========================================================================= */
async function renderSlack(){
  const content = document.getElementById("content");
  if(!CONFIG.integrationsStatus.slack){ content.innerHTML = integrationBanner("Slack"); return; }
  let channels = [];
  try{
    ({ channels } = await api("GET", "/api/slack/channels"));
  }catch(e){
    content.innerHTML = `<div class="card">${esc(e.message)}</div>`;
    return;
  }
  if(!channels.length){ content.innerHTML = integrationBanner("Slack"); return; }
  if(!SLACK_CURRENT_CHANNEL || !channels.some(c=>c.id===SLACK_CURRENT_CHANNEL)) SLACK_CURRENT_CHANNEL = channels[0].id;
  content.innerHTML = `<div class="card" style="height:calc(100vh - 150px);display:flex;flex-direction:column;">
    ${channels.length>1 ? `<div class="chanTabs">${channels.map(c=>`<span class="chanTab ${c.id===SLACK_CURRENT_CHANNEL?'active':''}" data-chan="${esc(c.id)}">#${esc(c.name||c.id)}</span>`).join("")}</div>` : `<div class="muted" style="margin-bottom:10px;">#${esc(channels[0].name||channels[0].id)}</div>`}
    <div id="slackPanel"><div id="slackMessages" class="loadingRow">Chargement…</div>
    <div id="slackInputRow"><input id="slackInput" type="text" placeholder="Écrire un message à l'équipe..."><button class="btn" id="slackSendBtn">Envoyer</button></div></div>
  </div>`;
  document.querySelectorAll(".chanTab").forEach(tab=>{
    tab.onclick = ()=>{ SLACK_CURRENT_CHANNEL = tab.dataset.chan; renderSlack(); };
  });
  await loadSlackMessages();
  document.getElementById("slackSendBtn").onclick = sendSlack;
  document.getElementById("slackInput").addEventListener("keydown", e=>{ if(e.key==="Enter") sendSlack(); });
}
async function loadSlackMessages(){
  const box = document.getElementById("slackMessages");
  try{
    const { messages } = await api("GET", `/api/slack/messages?channel=${encodeURIComponent(SLACK_CURRENT_CHANNEL)}`);
    if(!messages.length){ box.innerHTML = `<div class="emptyState">Aucun message récent dans ce canal.</div>`; return; }
    box.innerHTML = messages.map(m=>`<div class="msg bot"><b>${esc(m.user||"Slack")}</b><br>${esc(m.text||"")}</div>`).join("");
    box.scrollTop = box.scrollHeight;
  }catch(e){ box.innerHTML = `<div class="emptyState">${esc(e.message)}</div>`; }
}
async function sendSlack(){
  const input = document.getElementById("slackInput");
  const text = input.value.trim(); if(!text) return;
  input.value="";
  try{ await api("POST", "/api/slack/messages", { text, channel: SLACK_CURRENT_CHANNEL }); await loadSlackMessages(); }
  catch(e){ alert("Erreur d'envoi Slack : "+e.message); }
}

/* =========================================================================
   FAQ
   ========================================================================= */
const FAQ = [
  {q:"Comment marche cette application ?", a:"Cette centrale lit et écrit en direct dans ta base Airtable via le serveur que tu as installé sur ton poste. Chaque module du menu à gauche correspond à une table Airtable."},
  {q:"Est-ce que ça modifie la structure d'Airtable ?", a:"Non. L'application ne peut que lire, créer, modifier ou supprimer des ENREGISTREMENTS (lignes). Elle ne peut jamais ajouter/supprimer une table ou une colonne."},
  {q:"Comment connecter Airtable / Slack / l'IA ?", a:"Va dans Paramètres > Intégrations (réservé aux admins). Renseigne le jeton demandé, clique sur Tester puis Enregistrer."},
  {q:"Peut-on connecter plusieurs canaux Slack ?", a:"Oui. Dans Paramètres > Intégrations > Slack, ajoute autant de canaux que nécessaire (bouton « + Ajouter un canal »). Tous restent accessibles depuis le même écran Messagerie Slack, via les onglets en haut."},
  {q:"D'où vient le chiffre d'affaires affiché sur le tableau de bord ?", a:"Il est calculé à partir du champ Tarif de la table Réservations. Le CA « en cours » correspond aux réservations dont la date de check-in tombe dans le mois en cours ; le CA total additionne toutes les réservations enregistrées."},
  {q:"D'où viennent les chiffres « entrées/sorties » et « ménages » du jour ?", a:"Entrées = réservations dont la date de check-in est aujourd'hui. Sorties = réservations dont la date de check-out est aujourd'hui. Ménages à effectuer = nombre de sorties du jour + nombre de remplacements ménage prévus aujourd'hui dans la table Remplacements ménage."},
  {q:"Comment contacter un voyageur sur WhatsApp ?", a:"Va dans Contacts voyageurs (menu de gauche) et clique sur le bouton WhatsApp à côté de son nom — ça ouvre directement une conversation WhatsApp avec son numéro."},
  {q:"Comment envoyer un message WhatsApp tout prêt (modèle) à un voyageur ?", a:"Dans Contacts voyageurs, clique sur « 📋 Modèle » à côté du contact. Choisis un modèle (bienvenue, instructions d'arrivée, rappel départ, demande d'avis...), et éventuellement un lien de formulaire à insérer. Le message est généré automatiquement (prénom, logement, dates...), modifiable avant envoi, puis « Ouvrir WhatsApp » l'envoie prêt à cliquer sur Envoyer."},
  {q:"Qu'est-ce que Messagerie WhatsApp (📇) dans le menu ?", a:"C'est un annuaire central : quatre onglets (Propriétaires, Agents de ménage, Voyageurs, Collaborateurs) listant tout le monde qui a un numéro de téléphone, avec un bouton « 📋 Modèle » sur chacun pour composer et envoyer un message WhatsApp directement, sans avoir à chercher la fiche dans le module d'origine."},
  {q:"Comment un collaborateur apparaît-il dans l'onglet Collaborateurs ?", a:"Ajoute son numéro de téléphone dans Paramètres > Utilisateurs (colonne Téléphone, bouton Enregistrer). Seuls les comptes avec un numéro renseigné apparaissent dans cet onglet."},
  {q:"Comment ajouter ou modifier un modèle de message WhatsApp ?", a:"Dans Paramètres > Modèles de messages WhatsApp (admin uniquement). Utilise {{prenom}}, {{nom}}, {{logement}}, {{checkin}}, {{checkout}} ou {{lien_formulaire}} dans le texte : ils sont remplacés automatiquement par les vraies infos du voyageur au moment de l'envoi."},
  {q:"Comment ajouter le lien d'un formulaire Airtable pour l'envoyer aux voyageurs ?", a:"Dans Paramètres > Liens de formulaires Airtable (admin uniquement), ajoute un nom et le lien du formulaire. Il devient ensuite sélectionnable lors de la composition d'un message WhatsApp, et s'insère automatiquement à la place de {{lien_formulaire}} dans les modèles."},
  {q:"Pourquoi certains liens s'affichent comme des boutons ?", a:"Dès qu'un champ contient un lien (Airbnb, WhatsApp, Booking, carte, ou toute autre URL), il est automatiquement transformé en bouton cliquable avec une icône, plutôt que d'afficher l'adresse brute."},
  {q:"Est-ce que je reste connecté après une mise à jour ?", a:"Oui. Ta session reste active jusqu'à 30 jours, même après un redémarrage du serveur ou une mise à jour via update.bat/update.sh. Tes mots de passe et toutes les intégrations (Airtable/Slack/IA) sont aussi conservés automatiquement."},
  {q:"Où sont stockées les données de l'application (utilisateurs, jetons) ?", a:"Dans un unique fichier data/db.json sur ton propre poste/serveur. Ce fichier n'est jamais envoyé sur GitHub (voir .gitignore)."},
  {q:"Comment mettre à jour l'application ?", a:"Double-clique sur update.bat (Windows) ou update.sh (Mac/Linux) à la racine du projet, ou lance manuellement 'git pull' puis 'npm install'. Redémarre ensuite le serveur — tout le reste (comptes, mots de passe, intégrations) est conservé."},
  {q:"Puis-je exporter les données d'une table ?", a:"Oui, un bouton « Exporter CSV » est disponible en haut de chaque tableau — il exporte les enregistrements actuellement affichés (après recherche/filtre)."},
  {q:"À quoi sert le menu déroulant de filtre en haut d'un tableau ?", a:"Il filtre instantanément la liste par statut, quand la table concernée a un champ de statut (ex: Statut d'occupation, Statut du prospect). Se combine avec la recherche texte."},
  {q:"Que veut dire le badge « sensible » sur un champ ?", a:"Ce champ contient une information confidentielle (code d'accès, document, tarif interne...) et n'est jamais montré aux comptes prestataire ménage."},
  {q:"Un prestataire ménage peut-il voir tous les logements ?", a:"Non, uniquement ceux qui lui sont assignés dans Airtable (correspondance par prénom entre son compte et la table Agents de ménage)."},
  {q:"J'ai oublié / perdu mon mot de passe, que faire ?", a:"Lance le script reset-password.bat (Windows) ou reset-password.sh (Mac/Linux) à la racine du projet : il te demande l'identifiant du compte puis un nouveau mot de passe, et l'enregistre directement dans data/db.json. Ça marche pour n'importe quel compte, y compris l'admin, sans avoir besoin d'être déjà connecté. Ce mot de passe reste valable après toute mise à jour."},
];

/** Un bloc "carte" de la page d'aide : titre + contenu HTML libre. */
function helpCard(id, icon, title, bodyHtml){
  return `<div class="card" id="help-${id}"><h3 style="margin-top:0;">${icon} ${esc(title)}</h3>${bodyHtml}</div>`;
}

function renderFAQ(){
  const content = document.getElementById("content");
  const isAdmin = CURRENT_USER.role==="admin";
  const isPresta = CURRENT_USER.role==="prestataire";

  const toc = [
    ["intro","Vue d'ensemble"],
    ["dashboard","Tableau de bord"],
    ["tables","Utiliser les tableaux (logements, réservations...)"],
    ["liens","Boutons Airbnb / WhatsApp / Booking"],
    ["contacts","Contacts voyageurs"],
    ["ia","Assistant IA"],
    ["slack","Messagerie Slack"],
    ["parametres","Paramètres, intégrations & utilisateurs"],
    ["roles","Rôles et permissions"],
    ["securite","Sécurité et données"],
    ["faq","Questions fréquentes"],
  ];

  let html = `<div class="card">
    <h3 style="margin-top:0;">❓ Aide — comment fonctionne l'application</h3>
    <p class="muted" style="margin-bottom:10px;">Guide complet de toutes les fonctionnalités. Clique sur une section pour y aller directement.</p>
    <div>${toc.map(([id,label])=>`<span class="quickQ" data-help-goto="${id}">${esc(label)}</span>`).join("")}</div>
  </div>`;

  html += helpCard("intro","🌲","Vue d'ensemble", `
    <p>Cette centrale de gestion lit et écrit <b>en direct</b> dans ta base Airtable, via le serveur
    installé sur ton poste — il n'y a pas de copie séparée des données : ce que tu vois ici est
    exactement ce qu'il y a dans Airtable, en temps réel.</p>
    <p>Chaque module du menu à gauche (Logements, Propriétaires, Réservations, Litiges...) correspond
    à une table Airtable. L'application ne peut <b>jamais</b> modifier la structure d'Airtable
    elle-même (créer/supprimer une table ou une colonne) : elle ne touche qu'aux enregistrements
    (les lignes), selon ce que ton profil est autorisé à faire — voir la section « Rôles et permissions ».</p>
  `);

  html += helpCard("dashboard","📊","Tableau de bord", `
    <p>Premier écran après connexion (sauf pour un prestataire ménage, qui voit directement son
    planning de logements assignés). Il affiche :</p>
    <ul style="margin:6px 0 10px 18px;padding:0;">
      <li><b>CA en cours (mois)</b> et <b>CA total</b> : calculés depuis le champ Tarif de la table
      Réservations. Le CA « en cours » ne compte que les réservations dont la date de check-in
      tombe dans le mois en cours.</li>
      <li><b>Taux d'occupation</b> : proportion de logements dont le statut contient « Occupé ».</li>
      <li><b>Entrées / sorties aujourd'hui</b> : nombre de réservations dont le check-in, resp. le
      check-out, tombe aujourd'hui.</li>
      <li><b>Ménages à effectuer aujourd'hui</b> : départs du jour + remplacements ménage prévus
      aujourd'hui (table Remplacements ménage).</li>
      <li><b>Litiges ouverts</b> et <b>ménages à confirmer</b>.</li>
    </ul>
    <p class="muted">Ces indicateurs financiers/business ne sont visibles que pour les profils
    Admin et Collaborateur, jamais pour un prestataire ménage.</p>
  `);

  html += helpCard("tables","📋","Utiliser les tableaux (logements, réservations, litiges...)", `
    <p>Clique sur un module du menu pour afficher la liste des enregistrements de cette table.</p>
    <ul style="margin:6px 0 10px 18px;padding:0;">
      <li><b>Rechercher</b> : la barre de recherche en haut filtre instantanément sur les colonnes
      les plus pertinentes de la table (nom, ville, référence...).</li>
      <li><b>Filtrer par statut</b> : quand la table a un champ de statut, un menu déroulant permet
      de filtrer rapidement (ex: n'afficher que les logements « Libres »).</li>
      <li><b>Exporter en CSV</b> : le bouton « ⬇️ Exporter CSV » télécharge exactement ce qui est
      affiché à l'écran (après recherche/filtre), au format compatible Excel.</li>
      <li><b>Voir le détail / modifier</b> : clique sur une ligne pour ouvrir sa fiche complète avec
      tous les champs. Les champs calculés par Airtable (formules, IA, listes déroulantes liées...)
      sont affichés en lecture seule ; les autres sont modifiables si ton profil en a le droit.</li>
      <li><b>Créer un enregistrement</b> : bouton « + Nouveau » en haut, quand ton profil a le droit
      de créer dans cette table.</li>
      <li><b>Supprimer</b> : uniquement possible pour un compte Administrateur, depuis la fiche
      détail d'un enregistrement.</li>
    </ul>
  `);

  html += helpCard("liens","🔗","Boutons Airbnb / WhatsApp / Booking / autres liens", `
    <p>Dès qu'un champ contient un lien — vers une annonce Airbnb, une conversation WhatsApp, une
    fiche Booking, une carte, ou n'importe quelle autre adresse web — l'application l'affiche comme
    un <b>bouton cliquable</b> avec une icône parlante, plutôt que l'adresse brute :</p>
    <p>💬 Écrire sur WhatsApp &nbsp; 🏠 Ouvrir sur Airbnb &nbsp; 🛏️ Ouvrir sur Booking &nbsp;
    📍 Ouvrir la carte &nbsp; 🔗 Ouvrir le lien</p>
    <p class="muted">Ça vaut pour toutes les tables : la fiche d'un logement, d'un propriétaire, d'une
    réservation, d'un avis, etc.</p>
  `);

  html += helpCard("contacts","👥","Contacts voyageurs", `
    <p>Liste de tous les voyageurs (réservations), avec leurs coordonnées et un bouton WhatsApp
    en un clic pour leur écrire directement (le numéro est automatiquement mis au bon format
    international).</p>
    <p>Ce bouton <b>📋 Modèle</b> (ou <b>📋 Modèle WhatsApp</b>) est disponible partout où une fiche a un numéro de téléphone — Propriétaires, Prospects, Agents de ménage, Remplacements ménage, Avis, Artisans — pas seulement ici.</p><p>Il ouvre un message WhatsApp pré-rempli à partir d'un modèle
    (bienvenue, instructions d'arrivée, rappel départ, demande d'avis...), avec le prénom, le
    logement et les dates déjà insérés automatiquement, et la possibilité d'y glisser un lien de
    formulaire Airtable. Le texte reste modifiable avant l'ouverture de WhatsApp.</p>
  `);

  html += helpCard("ia","🤖","Assistant IA", `
    <p>Pose une question en langage courant (ex: « quels litiges sont en cours ? », « quels logements
    dois-je nettoyer ? »). L'assistant interroge automatiquement les tables Airtable pertinentes
    pour ta question et pour ton profil, puis répond uniquement à partir de ces données réelles —
    il n'invente jamais un code d'accès, un tarif ou une coordonnée.</p>
    <p class="muted">Nécessite une clé Anthropic connectée dans Paramètres (voir plus bas). Réservé
    aux comptes connectés ; un prestataire ne peut interroger que ses propres données (logements
    assignés).</p>
  `);

  html += helpCard("slack","💬","Messagerie Slack (multi-canaux)", `
    <p>Écran réservé aux profils Admin et Collaborateur. Si plusieurs canaux Slack sont connectés
    (ex: #équipe, #urgences, #propriétaires), un onglet apparaît pour chacun en haut de l'écran —
    clique sur un onglet pour lire et écrire sur ce canal précis.</p>
    <p>Certains événements (nouveau litige, nouveau prospect, nouveau remplacement ménage) envoient
    aussi une notification automatique sur <b>tous</b> les canaux connectés.</p>
  `);

  html += helpCard("parametres","⚙️","Paramètres, intégrations & utilisateurs", `
    <p><b>Intégrations</b> ${isAdmin?'':'<span class="muted">(réservé aux administrateurs)</span>'} :
    connexion à Airtable (obligatoire pour que l'application fonctionne), à Slack (optionnel,
    multi-canaux) et à l'assistant IA (optionnel). Chaque intégration se teste avant d'être
    enregistrée.</p>
    <p><b>Utilisateurs</b> ${isAdmin?'':'<span class="muted">(réservé aux administrateurs)</span>'} :
    création et suppression des comptes de l'équipe (Admin, Collaborateur, Prestataire ménage).
    Pour qu'un prestataire voie automatiquement son planning, son prénom de compte doit correspondre
    exactement à son prénom dans la table Agents de ménage.</p>
    <p><b>Mon compte</b> : accessible à tous, permet de changer son propre mot de passe.</p>
    <p><b>Modèles de messages WhatsApp</b> ${isAdmin?'':'<span class="muted">(réservé aux administrateurs)</span>'} :
    crée et modifie les messages types utilisés depuis Contacts voyageurs. Insère
    <code>{{prenom}}</code>, <code>{{nom}}</code>, <code>{{logement}}</code>, <code>{{checkin}}</code>,
    <code>{{checkout}}</code> ou <code>{{lien_formulaire}}</code> dans le texte : ils sont remplacés
    automatiquement par les vraies infos au moment d'envoyer.</p>
    <p><b>Liens de formulaires Airtable</b> ${isAdmin?'':'<span class="muted">(réservé aux administrateurs)</span>'} :
    enregistre les liens de tes formulaires Airtable (accueil voyageur, état des lieux...) pour
    pouvoir les insérer en un clic dans un modèle WhatsApp.</p>
  `);

  html += helpCard("roles","🔐","Rôles et permissions", `
    <p>Trois profils, avec des droits différents par table :</p>
    <table class="dataTable" style="margin-top:6px;">
      <thead><tr><th>Profil</th><th>Peut voir</th><th>Peut créer/modifier</th><th>Peut supprimer</th></tr></thead>
      <tbody>
        <tr><td>Administrateur</td><td>Tout</td><td>Tout (selon la table)</td><td>Oui, partout</td></tr>
        <tr><td>Collaborateur</td><td>La plupart des tables (sauf documents sensibles)</td><td>Oui, selon la table</td><td>Non</td></tr>
        <tr><td>Prestataire ménage</td><td>Uniquement ses logements et remplacements assignés</td><td>Champs limités (ex: statut d'un remplacement)</td><td>Non</td></tr>
      </tbody>
    </table>
    <p class="muted" style="margin-top:8px;">Certains champs marqués « sensible » (codes d'accès,
    tarifs internes, documents) ne sont jamais montrés à un compte prestataire, même en lecture.</p>
  `);

  html += helpCard("securite","🔒","Sécurité et données", `
    <ul style="margin:6px 0 0 18px;padding:0;">
      <li>Les mots de passe sont hashés (jamais stockés en clair).</li>
      <li>Les jetons Airtable/Slack/IA restent sur le serveur ; le navigateur ne les voit jamais
      (seul un aperçu masqué s'affiche en Paramètres).</li>
      <li>Toutes les données de l'application (comptes, jetons, historique) sont stockées uniquement
      sur cet ordinateur/serveur, dans un fichier local — jamais envoyées ailleurs.</li>
      <li>La connexion reste active jusqu'à 30 jours, même après un redémarrage ou une mise à jour.</li>
    </ul>
  `);

  html += `<div class="card" id="help-faq"><h3 style="margin-top:0;">💬 Questions fréquentes</h3>${FAQ.map((f,i)=>`
    <div class="faqItem"><div class="faqQ" data-i="${i}">${esc(f.q)} <span>+</span></div><div class="faqA" id="faqA${i}">${esc(f.a)}</div></div>`).join("")}</div>`;

  content.innerHTML = html;
  content.querySelectorAll(".faqQ").forEach(q=>{
    q.onclick = ()=>{ document.getElementById("faqA"+q.dataset.i).classList.toggle("open"); };
  });
  content.querySelectorAll("[data-help-goto]").forEach(el=>{
    el.onclick = ()=>{
      const target = document.getElementById("help-"+el.dataset.helpGoto);
      if(target) target.scrollIntoView({behavior:"smooth", block:"start"});
    };
  });
}

/* =========================================================================
   PARAMÈTRES
   ========================================================================= */
async function renderSettings(){
  const content = document.getElementById("content");
  let integHtml = "";
  let waTemplatesHtml = "";
  let formLinksHtml = "";
  let accessRightsHtml = "";
  if(CURRENT_USER.role==="admin"){
    const integ = await api("GET", "/api/settings/integrations");
    const slackChannels = (integ.slack.channels && integ.slack.channels.length) ? integ.slack.channels : [{name:"",id:""}];
    const { templates } = await api("GET", "/api/settings/whatsapp-templates");
    const { links } = await api("GET", "/api/settings/form-links");
    const { tables: accessRows } = await api("GET", "/api/settings/access-rights");
    const AUDIENCE_LABELS = { voyageur: "🧳 Voyageurs", prestataire: "🧹 Prestataires ménage", proprietaire: "🏠 Propriétaires", collaborateur: "👤 Collaborateurs", tous: "👥 Tous" };
    function audienceOptions(current){
      return Object.entries(AUDIENCE_LABELS).map(([v,label])=>`<option value="${v}" ${v===(current||"tous")?"selected":""}>${esc(label)}</option>`).join("");
    }
    waTemplatesHtml = `
    <div class="card"><h3 style="margin-top:0;">Modèles de messages WhatsApp</h3>
      <p class="desc">Utilisables depuis Contacts voyageurs et la Messagerie WhatsApp pour composer un message prêt à envoyer. Insère <code>{{prenom}}</code>, <code>{{nom}}</code>, <code>{{logement}}</code>, <code>{{checkin}}</code>, <code>{{checkout}}</code> ou <code>{{lien_formulaire}}</code> dans le texte : ils sont remplacés automatiquement au moment d'envoyer. « À qui » détermine dans quel(s) composeur(s) WhatsApp le modèle apparaît (voyageur, propriétaire, prestataire ménage, collaborateur, ou tous).</p>
      <div id="waTemplatesList">
        ${templates.map(t=>`
        <div class="integCard" data-tpl-id="${esc(t.id)}">
          <div class="field"><label>Nom</label><input class="tplName" value="${esc(t.name)}"></div>
          <div class="field"><label>À qui</label><select class="tplAudience">${audienceOptions(t.audience)}</select></div>
          <div class="field"><label>Message</label><textarea class="tplBody" rows="3">${esc(t.body)}</textarea></div>
          <button class="btn small" data-save-tpl="${esc(t.id)}">Enregistrer</button>
          <button class="btn small danger" data-del-tpl="${esc(t.id)}" style="margin-left:8px;">Supprimer</button>
        </div>`).join("") || '<p class="muted">Aucun modèle pour l\'instant.</p>'}
      </div>
      <div class="integCard">
        <h4>+ Nouveau modèle</h4>
        <div class="field"><label>Nom</label><input id="newTplName" placeholder="ex: Message de bienvenue"></div>
        <div class="field"><label>À qui</label><select id="newTplAudience">${audienceOptions("tous")}</select></div>
        <div class="field"><label>Message</label><textarea id="newTplBody" rows="3" placeholder="Bonjour {{prenom}}, ..."></textarea></div>
        <button class="btn small" id="addTplBtn">Ajouter</button>
      </div>
    </div>`;
    formLinksHtml = `
    <div class="card"><h3 style="margin-top:0;">Liens de formulaires Airtable</h3>
      <p class="desc">Réutilisables dans les modèles WhatsApp via <code>{{lien_formulaire}}</code>, et sélectionnables lors de l'envoi d'un message. « À qui » détermine dans quels envois WhatsApp le lien apparaît (voyageur, prestataire, propriétaire, ou tous).</p>
      <div id="formLinksList">
        ${links.map(l=>`
        <div class="channelRow" data-link-id="${esc(l.id)}" style="grid-template-columns:1fr 1fr auto auto;">
          <div class="field" style="margin-bottom:0;"><label>Nom</label><input class="linkLabel" value="${esc(l.label)}"></div>
          <div class="field" style="margin-bottom:0;"><label>Lien</label><input class="linkUrl" value="${esc(l.url)}"></div>
          <div class="field" style="margin-bottom:0;"><label>À qui</label><select class="linkAudience">${audienceOptions(l.audience)}</select></div>
          <div style="display:flex;gap:6px;align-items:end;">
            <button type="button" class="btn small secondary" data-copy-link="${esc(l.url)}" title="Copier le lien">📋</button>
            <button class="btn small" data-save-link="${esc(l.id)}">Enregistrer</button>
            <button class="btn small danger" data-del-link="${esc(l.id)}">Supprimer</button>
          </div>
        </div>`).join("") || '<p class="muted">Aucun lien pour l\'instant.</p>'}
      </div>
      <div class="modalGrid" style="margin-top:10px;">
        <div class="field"><label>Nom</label><input id="newLinkLabel" placeholder="ex: Formulaire d'accueil voyageur"></div>
        <div class="field"><label>Lien (URL Airtable)</label><input id="newLinkUrl" placeholder="https://airtable.com/..."></div>
        <div class="field"><label>À qui</label><select id="newLinkAudience">${audienceOptions("tous")}</select></div>
      </div>
      <button class="btn small" id="addLinkBtn">+ Ajouter le lien</button>
    </div>`;
    const ACCESS_LEVEL_LABELS = {
      full: { text: "Accès complet (créer/modifier/supprimer)", cls: "ok" },
      readwrite: { text: "Créer & modifier (pas de suppression)", cls: "" },
      read: { text: "Lecture seule", cls: "" },
      self: { text: "Lecture seule — ses données uniquement", cls: "" },
      selfWrite: { text: "Lecture & modification — ses données uniquement", cls: "" },
      none: { text: "Aucun accès", cls: "off" },
    };
    function accessPill(level){
      const info = ACCESS_LEVEL_LABELS[level] || { text: level, cls: "" };
      return `<span class="pill ${info.cls}">${esc(info.text)}</span>`;
    }
    function accessCell(tableKey, role, level, overridden){
      const opts = ["full","readwrite","read","self","selfWrite","none"].map(lv=>
        `<option value="${lv}" ${lv===level?"selected":""}>${esc((ACCESS_LEVEL_LABELS[lv]||{}).text||lv)}</option>`).join("");
      return `<div style="display:flex;align-items:center;gap:6px;">
        <select class="accessLevelSelect" data-table="${esc(tableKey)}" data-role="${role}" style="width:auto;min-width:0;font-size:12.5px;padding:6px 8px;">${opts}</select>
        ${overridden?`<button type="button" class="accessResetBtn" data-table="${esc(tableKey)}" data-role="${role}" title="Revenir au niveau par défaut" style="background:none;border:none;cursor:pointer;font-size:14px;color:var(--muted);">↺</button>`:""}
      </div>`;
    }
    const accessGroups = {};
    accessRows.forEach(t=>{ accessGroups[t.group] = accessGroups[t.group]||[]; accessGroups[t.group].push(t); });
    accessRightsHtml = `
    <div class="card"><h3 style="margin-top:0;">Droits d'accès par profil</h3>
      <p class="desc">Modifie ce que voit et peut faire chaque profil, module par module. Un changement
      s'applique immédiatement. Le profil Administrateur garde toujours un accès complet (non
      modifiable). Les mots de passe et jetons d'intégration restent réservés aux administrateurs
      quel que soit ce tableau.</p>
      <table class="dataTable"><thead><tr><th>Module</th><th>Administrateur</th><th>Collaborateur</th><th>Prestataire ménage</th></tr></thead>
      <tbody>
      ${Object.entries(accessGroups).map(([group, rows])=> rows.map((t,i)=>`
        <tr>
          <td>${i===0?`<b>${esc(group)}</b><br>`:""}${esc(t.icon)} ${esc(t.label)}${t.hasSensitiveFields?'<br><span class="muted" style="font-size:11px;">contient des champs sensibles masqués au prestataire</span>':""}${!t.selfScoped?'<br><span class="muted" style="font-size:11px;">pas de filtrage individuel : "ses données uniquement" donnera accès à tous les enregistrements</span>':""}</td>
          <td>${accessPill("full")}</td>
          <td>${accessCell(t.key, "collaborateur", t.roles.collaborateur, t.overridden.collaborateur)}</td>
          <td>${accessCell(t.key, "prestataire", t.roles.prestataire, t.overridden.prestataire)}</td>
        </tr>`).join("")).join("")}
      </tbody></table>
      <p class="muted" style="font-size:12px;margin-top:12px;margin-bottom:0;">
      En plus des tableaux ci-dessus : <b>Messagerie Slack</b> et <b>Contacts voyageurs</b> sont réservés
      à l'administrateur et aux collaborateurs (jamais aux prestataires ménage). <b>L'Assistant IA</b> est
      accessible à tous les profils, mais ne répond qu'avec les données que le profil connecté a le droit
      de voir. <b>Paramètres</b> (intégrations, utilisateurs, modèles WhatsApp, liens de formulaires,
      droits d'accès) est réservé aux administrateurs.</p>
    </div>`;
    integHtml = `
    <div class="card"><h3 style="margin-top:0;">Intégrations</h3>
      <div class="integCard">
        <h4>🗂️ Airtable ${integ.airtable.connected?'<span class="pill ok">connecté</span>':'<span class="pill off">non connecté</span>'}</h4>
        <p class="desc">Jeton d'accès personnel (Personal Access Token) et identifiant de la base. Crée un jeton sur airtable.com/create/tokens avec les scopes data.records:read/write et schema.bases:read.</p>
        <div class="modalGrid">
          <div class="field"><label>Jeton (PAT)</label>${pwField("atToken", {placeholder: integ.airtable.tokenPreview||'pat...'})}</div>
          <div class="field"><label>Base ID</label><input id="atBaseId" value="${esc(integ.airtable.baseId||'')}" placeholder="appXXXXXXXXXXXXXX"></div>
        </div>
        <button class="btn small" id="saveAirtable">Tester & enregistrer</button>
        ${integ.airtable.connected?'<button class="btn small danger" id="delAirtable" style="margin-left:8px;">Déconnecter</button>':''}
      </div>
      <div class="integCard">
        <h4>💬 Slack ${integ.slack.connected?'<span class="pill ok">connecté</span>':'<span class="pill off">non connecté</span>'}</h4>
        <p class="desc">Crée une app Slack (api.slack.com/apps), invite-la dans chaque canal souhaité, récupère le jeton Bot (xoxb-...) et l'ID de chaque canal. Tu peux connecter <b>plusieurs canaux</b> : ils seront tous accessibles depuis Messagerie Slack, avec un sélecteur d'onglets.</p>
        <div class="field"><label>Jeton Bot (xoxb-...)</label>${pwField("slToken", {placeholder: integ.slack.tokenPreview||'xoxb-...'})}</div>
        <label style="display:block;font-size:12.5px;color:var(--muted);margin-bottom:6px;font-weight:600;">Canaux connectés</label>
        <div id="slackChannelsList">
          ${slackChannels.map((c,i)=>`
          <div class="channelRow" data-channel-row="${i}">
            <div class="field" style="margin-bottom:0;"><label>Nom (affichage)</label><input class="slChanName" value="${esc(c.name||'')}" placeholder="equipe-conciergerie"></div>
            <div class="field" style="margin-bottom:0;"><label>ID du canal</label><input class="slChanId" value="${esc(c.id||'')}" placeholder="C0123456789"></div>
            <button class="btn small danger removeSlChan" type="button">Retirer</button>
          </div>`).join("")}
        </div>
        <button class="btn small secondary" id="addSlackChannel" type="button" style="margin-top:6px;">+ Ajouter un canal</button>
        <div style="margin-top:12px;">
          <button class="btn small" id="saveSlack">Tester & enregistrer</button>
          ${integ.slack.connected?'<button class="btn small danger" id="delSlack" style="margin-left:8px;">Déconnecter</button>':''}
        </div>
      </div>
      <div class="integCard">
        <h4>🤖 Assistant IA (Anthropic) ${integ.ai.connected?'<span class="pill ok">connecté</span>':'<span class="pill off">non connecté</span>'}</h4>
        <p class="desc">Clé API Anthropic (console.anthropic.com). Utilisée uniquement par l'assistant interne.</p>
        <div class="modalGrid">
          <div class="field"><label>Clé API</label>${pwField("aiKey", {placeholder: integ.ai.tokenPreview||'sk-ant-...'})}</div>
          <div class="field"><label>Modèle</label><input id="aiModel" value="${esc(integ.ai.model||'claude-haiku-4-5-20251001')}"></div>
        </div>
        <button class="btn small" id="saveAi">Tester & enregistrer</button>
        ${integ.ai.connected?'<button class="btn small danger" id="delAi" style="margin-left:8px;">Déconnecter</button>':''}
      </div>
      <div class="integCard">
        <h4>✉️ Email (validation des inscriptions) ${integ.email.connected?'<span class="pill ok">connecté</span>':'<span class="pill off">non connecté</span>'}</h4>
        <p class="desc">Compte Gmail utilisé pour envoyer les emails de confirmation quand quelqu'un crée un compte
        (lien "Créer un compte" sur l'écran de connexion). Utilise un <b>mot de passe d'application</b> Google
        (Compte Google &gt; Sécurité &gt; Validation en deux étapes &gt; Mots de passe des applications),
        jamais ton mot de passe Gmail habituel.</p>
        <div class="modalGrid">
          <div class="field"><label>Adresse Gmail</label><input id="emailUser" value="${esc(integ.email.user||'')}" placeholder="ex: contact@gmail.com"></div>
          <div class="field"><label>Mot de passe d'application</label>${pwField("emailAppPass", {placeholder: integ.email.tokenPreview||'xxxx xxxx xxxx xxxx'})}</div>
          <div class="field"><label>Nom d'expéditeur</label><input id="emailFromName" value="${esc(integ.email.fromName||'Aux Portes des Landes')}"></div>
        </div>
        <button class="btn small" id="saveEmail">Tester & enregistrer</button>
        ${integ.email.connected?'<button class="btn small danger" id="delEmail" style="margin-left:8px;">Déconnecter</button>':''}
      </div>
    </div>`;
  }
  const usersHtml = CURRENT_USER.role==="admin" ? await renderUsersSection() : "";
  content.innerHTML = `
    ${integHtml}
    ${accessRightsHtml}
    ${waTemplatesHtml}
    ${formLinksHtml}
    ${usersHtml}
    <div class="card"><h3 style="margin-top:0;">Mon compte</h3>
      <div class="field"><label>Nouveau mot de passe</label>${pwField("myNewPass", {placeholder:"Laisser vide pour ne pas changer"})}</div>
      <button class="btn" id="changePassBtn">Mettre à jour</button>
    </div>
    ${CURRENT_USER.role==="admin" ? `<div class="card"><h3 style="margin-top:0;">Journal d'activité</h3><div id="activityLog" style="max-height:220px;overflow-y:auto;font-size:12.5px;">Chargement…</div></div>` : ""}
    <div class="card"><h3 style="margin-top:0;">Version</h3><div id="versionInfo" class="muted">…</div></div>`;

  if(CURRENT_USER.role==="admin"){
    document.getElementById("saveAirtable").onclick = ()=> saveIntegration("airtable", {
      token: document.getElementById("atToken").value.trim(),
      baseId: document.getElementById("atBaseId").value.trim(),
    });
    document.getElementById("addSlackChannel").onclick = ()=>{
      const list = document.getElementById("slackChannelsList");
      const idx = list.children.length;
      const row = document.createElement("div");
      row.className = "channelRow"; row.dataset.channelRow = idx;
      row.innerHTML = `
        <div class="field" style="margin-bottom:0;"><label>Nom (affichage)</label><input class="slChanName" placeholder="equipe-conciergerie"></div>
        <div class="field" style="margin-bottom:0;"><label>ID du canal</label><input class="slChanId" placeholder="C0123456789"></div>
        <button class="btn small danger removeSlChan" type="button">Retirer</button>`;
      list.appendChild(row);
    };
    document.getElementById("slackChannelsList").addEventListener("click", (e)=>{
      if(e.target.classList.contains("removeSlChan")){
        const rows = document.querySelectorAll("#slackChannelsList [data-channel-row]");
        if(rows.length>1) e.target.closest("[data-channel-row]").remove();
        else { e.target.closest("[data-channel-row]").querySelector(".slChanName").value=""; e.target.closest("[data-channel-row]").querySelector(".slChanId").value=""; }
      }
    });
    document.getElementById("saveSlack").onclick = ()=>{
      const rows = document.querySelectorAll("#slackChannelsList [data-channel-row]");
      const channels = Array.from(rows).map(r=>({
        name: r.querySelector(".slChanName").value.trim(),
        id: r.querySelector(".slChanId").value.trim(),
      })).filter(c=>c.id);
      if(!channels.length){ alert("Renseigne au moins un ID de canal."); return; }
      saveIntegration("slack", { botToken: document.getElementById("slToken").value.trim(), channels });
    };
    document.getElementById("saveAi").onclick = ()=> saveIntegration("ai", {
      apiKey: document.getElementById("aiKey").value.trim(),
      model: document.getElementById("aiModel").value.trim(),
    });
    document.getElementById("saveEmail").onclick = ()=> saveIntegration("email", {
      user: document.getElementById("emailUser").value.trim(),
      appPassword: document.getElementById("emailAppPass").value.trim(),
      fromName: document.getElementById("emailFromName").value.trim(),
    });
    ["Airtable","Slack","Ai","Email"].forEach(n=>{
      const btn = document.getElementById("del"+n);
      if(btn) btn.onclick = async ()=>{
        if(!confirm("Déconnecter cette intégration ?")) return;
        await api("DELETE", `/api/settings/integrations/${n.toLowerCase()}`);
        showToast("Intégration déconnectée."); renderApp();
      };
    });
    document.getElementById("addTplBtn").onclick = async ()=>{
      const name = document.getElementById("newTplName").value.trim();
      const body = document.getElementById("newTplBody").value.trim();
      const audience = document.getElementById("newTplAudience").value;
      if(!name || !body){ showToast("Nom et message requis."); return; }
      try{ await api("POST", "/api/settings/whatsapp-templates", { name, body, audience }); showToast("Modèle ajouté."); renderApp(); }
      catch(e){ alert(e.message); }
    };
    document.getElementById("waTemplatesList").addEventListener("click", async (e)=>{
      const saveId = e.target.dataset.saveTpl, delId = e.target.dataset.delTpl;
      if(saveId){
        const row = e.target.closest("[data-tpl-id]");
        const name = row.querySelector(".tplName").value.trim();
        const body = row.querySelector(".tplBody").value.trim();
        const audience = row.querySelector(".tplAudience").value;
        if(!name || !body){ showToast("Nom et message requis."); return; }
        try{ await api("PUT", `/api/settings/whatsapp-templates/${saveId}`, { name, body, audience }); showToast("Modèle enregistré."); }
        catch(err){ alert(err.message); }
      }
      if(delId){
        if(!confirm("Supprimer ce modèle ?")) return;
        try{ await api("DELETE", `/api/settings/whatsapp-templates/${delId}`); showToast("Modèle supprimé."); renderApp(); }
        catch(err){ alert(err.message); }
      }
    });
    document.getElementById("addLinkBtn").onclick = async ()=>{
      const label = document.getElementById("newLinkLabel").value.trim();
      const url = document.getElementById("newLinkUrl").value.trim();
      const audience = document.getElementById("newLinkAudience").value;
      if(!label || !url){ showToast("Nom et lien requis."); return; }
      try{ await api("POST", "/api/settings/form-links", { label, url, audience }); showToast("Lien ajouté."); renderApp(); }
      catch(e){ alert(e.message); }
    };
    document.getElementById("formLinksList").addEventListener("click", async (e)=>{
      const saveId = e.target.dataset.saveLink, delId = e.target.dataset.delLink, copyUrl = e.target.dataset.copyLink;
      if(copyUrl){
        try{
          await navigator.clipboard.writeText(copyUrl);
          showToast("Lien copié dans le presse-papiers.");
        }catch(err){
          // Repli si l'API Clipboard est bloquee (permissions navigateur) : selection manuelle.
          const ta = document.createElement("textarea");
          ta.value = copyUrl; ta.style.position="fixed"; ta.style.opacity="0";
          document.body.appendChild(ta); ta.select();
          try{ document.execCommand("copy"); showToast("Lien copié dans le presse-papiers."); }
          catch(e2){ alert("Impossible de copier automatiquement. Lien : "+copyUrl); }
          ta.remove();
        }
      }
      if(saveId){
        const row = e.target.closest("[data-link-id]");
        const label = row.querySelector(".linkLabel").value.trim();
        const url = row.querySelector(".linkUrl").value.trim();
        const audience = row.querySelector(".linkAudience").value;
        if(!label || !url){ showToast("Nom et lien requis."); return; }
        try{ await api("PUT", `/api/settings/form-links/${saveId}`, { label, url, audience }); showToast("Lien enregistré."); }
        catch(err){ alert(err.message); }
      }
      if(delId){
        if(!confirm("Supprimer ce lien ?")) return;
        try{ await api("DELETE", `/api/settings/form-links/${delId}`); showToast("Lien supprimé."); renderApp(); }
        catch(err){ alert(err.message); }
      }
    });
    document.querySelectorAll(".accessLevelSelect").forEach(sel=>{
      sel.onchange = async ()=>{
        const { table, role } = sel.dataset;
        try{
          await api("PUT", `/api/settings/access-rights/${table}/${role}`, { level: sel.value });
          showToast("Droits d'accès mis à jour.");
          renderApp();
        }catch(err){ alert(err.message); }
      };
    });
    document.querySelectorAll(".accessResetBtn").forEach(btn=>{
      btn.onclick = async ()=>{
        const { table, role } = btn.dataset;
        try{
          await api("DELETE", `/api/settings/access-rights/${table}/${role}`);
          showToast("Droits d'accès réinitialisés au niveau par défaut.");
          renderApp();
        }catch(err){ alert(err.message); }
      };
    });
    api("GET", "/api/auth/activity").then(({log})=>{
      document.getElementById("activityLog").innerHTML = log.map(l=>`<div class="muted">${new Date(l.at).toLocaleString('fr-FR')} — ${esc(l.user)} — ${esc(l.type)}${l.table?' — '+esc(l.table):''}</div>`).join("") || "Aucune activité.";
    });
  }
  api("GET", "/api/version").then(({version})=>{ document.getElementById("versionInfo").textContent = "v"+version; });
  document.getElementById("changePassBtn").onclick = async ()=>{
    const np = document.getElementById("myNewPass").value;
    if(!np){ showToast("Aucun changement."); return; }
    try{ await api("POST", "/api/auth/change-password", { newPassword: np }); showToast("Mot de passe mis à jour."); document.getElementById("myNewPass").value=""; }
    catch(e){ alert(e.message); }
  };
}
async function saveIntegration(name, payload){
  try{
    await api("POST", `/api/settings/integrations/${name}`, payload);
    showToast("Connecté avec succès.");
    await refreshConfig();
    renderApp();
  }catch(e){ alert("Échec : "+e.message); }
}
async function renderUsersSection(){
  const { users } = await api("GET", "/api/auth/users");
  return `<div class="card"><h3 style="margin-top:0;">Utilisateurs (${users.length})</h3>
    <p class="desc">Renseigne un numéro de téléphone pour qu'un compte apparaisse dans Messagerie WhatsApp &gt; Collaborateurs. Pour un <b>prestataire ménage</b>, renseigne son lien de formulaire Airtable individuel : c'est le seul lien qu'il verra, dans sa page "Déclarer un litige".</p>
    <table class="dataTable"><thead><tr><th>Nom</th><th>Identifiant</th><th>Profil</th><th>Statut</th><th>Téléphone</th><th>Email</th><th>Lien litige (prestataire)</th><th></th></tr></thead><tbody>
    ${users.map(u=>`<tr data-user-id="${u.id}">
      <td>${esc(u.name)}</td>
      <td>${esc(u.username)}</td>
      <td><span class="pill">${roleLabel(u.role)}</span></td>
      <td>${u.emailVerified?'<span class="pill ok">actif</span>':'<span class="pill off">en attente de validation</span>'}</td>
      <td><input class="userPhoneInput" value="${esc(u.phone||'')}" placeholder="0600000000" style="width:120px;padding:5px 8px;font-size:12.5px;"></td>
      <td><input class="userEmailInput" type="email" value="${esc(u.email||'')}" placeholder="email@exemple.fr" style="width:160px;padding:5px 8px;font-size:12.5px;"></td>
      <td>${u.role==="prestataire"
        ? `<input class="userLitigeUrlInput" type="url" value="${esc(u.litigeFormUrl||'')}" placeholder="https://airtable.com/appXXX/shrXXX" style="width:200px;padding:5px 8px;font-size:12.5px;">`
        : '<span class="muted" style="font-size:11.5px;">— réservé aux prestataires —</span>'}</td>
      <td style="display:flex;gap:6px;flex-wrap:wrap;">
        <button class="btn small secondary" data-save-user="${u.id}">Enregistrer</button>
        ${!u.emailVerified?`<button class="btn small secondary" data-mark-verified="${u.id}" title="Activer manuellement (email de validation perdu ou non reçu)">Marquer vérifié</button>`:''}
        ${u.username!=='admin'?`<button class="btn small danger" data-del="${u.id}">Supprimer</button>`:''}
      </td>
    </tr>`).join("")}
    </tbody></table>
    <div style="margin-top:16px;border-top:1px solid var(--border);padding-top:16px;">
      <h4 style="margin:0 0 10px;">Ajouter un utilisateur</h4>
      <div class="modalGrid">
        <div class="field"><label>Nom complet</label><input id="newName" placeholder="ex: Marie Dupont"></div>
        <div class="field"><label>Identifiant</label><input id="newUsername" placeholder="ex: marie"></div>
        <div class="field"><label>Mot de passe temporaire</label>${pwField("newPass")}</div>
        <div class="field"><label>Profil</label><select id="newRole"><option value="collaborateur">Collaborateur</option><option value="prestataire">Prestataire ménage</option><option value="admin">Administrateur</option></select></div>
        <div class="field"><label>Téléphone (optionnel)</label><input id="newUserPhone" placeholder="0600000000"></div>
        <div class="field"><label>Email (optionnel)</label><input id="newUserEmail" type="email" placeholder="prenom@exemple.fr"></div>
        <div class="field" id="newUserLitigeUrlField" style="display:none;"><label>Lien formulaire Airtable — Déclarer un litige</label><input id="newUserLitigeUrl" type="url" placeholder="https://airtable.com/appXXX/shrXXX"></div>
      </div>
      <button class="btn" id="addUserBtn" style="margin-top:10px;">Ajouter</button>
      <p class="muted" style="font-size:11.5px;margin-top:10px;">Pour un prestataire ménage, utilise exactement le même prénom que dans la table "Agents de ménage" pour que son planning s'affiche automatiquement.</p>
    </div>
  </div>`;
}
document.addEventListener("change", (e)=>{
  if(e.target && e.target.id==="newRole"){
    const field = document.getElementById("newUserLitigeUrlField");
    if(field) field.style.display = e.target.value==="prestataire" ? "" : "none";
  }
});
document.addEventListener("click", async (e)=>{
  if(e.target && e.target.id==="addUserBtn"){
    const name = document.getElementById("newName").value.trim();
    const username = document.getElementById("newUsername").value.trim();
    const password = document.getElementById("newPass").value;
    const role = document.getElementById("newRole").value;
    const phone = document.getElementById("newUserPhone").value.trim();
    const email = document.getElementById("newUserEmail").value.trim();
    const litigeFormUrl = role==="prestataire" ? document.getElementById("newUserLitigeUrl").value.trim() : "";
    if(!name||!username||!password){ alert("Merci de remplir tous les champs."); return; }
    try{ await api("POST", "/api/auth/users", { name, username, password, role, phone, email, litigeFormUrl }); showToast("Utilisateur ajouté."); renderApp(); }
    catch(err){ alert(err.message); }
  }
  if(e.target && e.target.dataset && e.target.dataset.saveUser){
    const row = e.target.closest("[data-user-id]");
    const phone = row.querySelector(".userPhoneInput").value.trim();
    const email = row.querySelector(".userEmailInput").value.trim();
    const litigeInput = row.querySelector(".userLitigeUrlInput");
    const payload = { phone, email };
    if(litigeInput) payload.litigeFormUrl = litigeInput.value.trim();
    try{ await api("PATCH", `/api/auth/users/${e.target.dataset.saveUser}`, payload); showToast("Utilisateur mis à jour."); }
    catch(err){ alert(err.message); }
  }
  if(e.target && e.target.dataset && e.target.dataset.del){
    if(!confirm("Supprimer cet utilisateur ?")) return;
    try{ await api("DELETE", `/api/auth/users/${e.target.dataset.del}`); renderApp(); }
    catch(err){ alert(err.message); }
  }
  if(e.target && e.target.dataset && e.target.dataset.markVerified){
    try{ await api("PATCH", `/api/auth/users/${e.target.dataset.markVerified}`, { emailVerified: true }); showToast("Compte activé."); renderApp(); }
    catch(err){ alert(err.message); }
  }
});

/* =========================================================================
   BOOT
   ========================================================================= */
function showToast(text){
  const t = document.createElement("div"); t.className="toast"; t.textContent=text;
  document.body.appendChild(t); setTimeout(()=>t.remove(), 2600);
}
async function refreshConfig(){ CONFIG = await api("GET", "/api/config"); }

async function boot(){
  await refreshConfig();
  document.getElementById("loginScreen").style.display = "none";
  document.getElementById("app").style.display = "flex";
  ROUTE = "dashboard";
  if(CURRENT_USER.mustChangePassword){
    ROUTE = "settings";
    await renderApp();
    showToast("Pense à changer ton mot de passe temporaire dans Paramètres > Mon compte.");
    return;
  }
  await renderApp();
}

(async function init(){
  const params = new URLSearchParams(location.search);
  const verified = params.get("verified");
  if(verified !== null) history.replaceState({}, "", location.pathname);
  try{
    const { user } = await api("GET", "/api/auth/me");
    CURRENT_USER = user;
    await boot();
  }catch(e){
    renderLogin();
    if(verified === "1") showToast("Compte activé ! Tu peux te connecter.");
    if(verified === "0") showToast("Lien de validation invalide ou expiré — utilise \"Renvoyer l'email de validation\" après une tentative de connexion.");
  }
})();
