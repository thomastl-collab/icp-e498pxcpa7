/* ICP — Indicateurs de Condition Physique — web app (PWA) hors ligne
   Données stockées uniquement sur l'appareil (localStorage). */
'use strict';

const VERSION = '1.2.0';
const STORE_KEY = 'icp14.v1';

/* ---------- Épreuves ---------- */
const EPREUVES = [
  { id: 'luc', nom: 'Luc Léger', mode: 'luc',
    consigne: "Course en navettes sur {DIST} m, en couloirs individuels (demi-tours compris). Zone de tolérance de 1 m de part et d'autre de la piste. À chaque bip, franchir entièrement la ligne avec au moins un pied au sol, sans repartir avant le bip. Arrêt si le candidat n'est pas entré dans la zone de tolérance au bip, ne franchit pas entièrement la ligne, ou abandonne. Un candidat qui glisse ou tombe peut continuer s'il rattrape son retard avant le bip suivant." },
  { id: 'pompes', nom: 'Pompes', mode: 'count',
    consigne: "Le mouvement se fait sur les pieds, les bras le long du corps. Le thorax doit toucher le sol, puis remonter bras tendus." },
  { id: 'tractions', nom: 'Tractions', mode: 'count',
    consigne: "Prise en supination, paumes de mains vers le ciel. Départ bras tendus, sans balancier, jusqu'à passer les yeux au-dessus de la barre, puis redescendre bras tendus." },
  { id: 'killy', nom: 'Killy', mode: 'chrono',
    consigne: "Dos contre un mur, les bras le long du corps, les paumes de mains le long du mur. Interdiction de mettre les mains sur les genoux. Jambes à 90°, les genoux se touchent." },
  { id: 'gainage', nom: 'Gainage planche', mode: 'chrono',
    consigne: "En appui sur les avant-bras, sans que les mains se touchent, et sur les pieds." },
  { id: 'souplesse', nom: 'Souplesse', mode: 'length',
    consigne: "Pieds nus ou en chaussettes, jambes tendues. Pousser la réglette le plus loin possible et tenir la position 1 seconde (compter « 1, 2 »)." },
];
const EP = Object.fromEntries(EPREUVES.map(e => [e.id, e]));
const STATUTS = { abandon: 'Abandon / Refus', medical: 'Médical', absent: 'Absent' };

const DEFAULT_SETTINGS = {
  distance: 20,       // m
  warmupSec: 120,     // durée du palier d'échauffement
  warmupSpeed: 8,     // km/h
  v1: 8.5,            // km/h au palier 1
  inc: 0.5,           // km/h par palier
  palierSec: 60,      // durée d'un palier
  countdown: 5,       // secondes
};

/* ---------- Stockage ---------- */
let DB = load();
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      d.settings = Object.assign({}, DEFAULT_SETTINGS, d.settings || {});
      d.sessions = d.sessions || [];
      d.sessions.forEach(se => se.participants.forEach(p => {
        if (p.prenom == null) { const parts = (p.nom || '').split(' '); p.prenom = parts.shift() || ''; p.nom = parts.join(' '); }
      }));
      return d;
    }
  } catch (e) { console.error(e); }
  return { sessions: [], settings: { ...DEFAULT_SETTINGS } };
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(DB)); }
  catch (e) { toast("Erreur d'enregistrement : " + e.message); }
}
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

/* ---------- Utilitaires ---------- */
const $ = s => document.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = n => String(n).replace('.', ',');
function fmtTime(ms) {
  if (ms == null || isNaN(ms)) return '';
  const t = Math.max(0, Math.floor(ms / 1000));
  return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
}
function fmtTimeTenth(ms) {
  const t = Math.max(0, ms) / 1000;
  const m = Math.floor(t / 60), s = t - m * 60;
  return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1).replace('.', ',');
}
function parseTime(str) {
  str = String(str || '').trim().replace(',', '.');
  if (!str) return null;
  if (str.includes(':')) {
    const [m, s] = str.split(':');
    const v = (parseInt(m, 10) || 0) * 60 + (parseFloat(s) || 0);
    return isNaN(v) ? null : Math.round(v * 1000);
  }
  const v = parseFloat(str);
  return isNaN(v) ? null : Math.round(v * 1000);
}
function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function toast(msg, ms = 2200) {
  const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add('hidden'), ms);
}
function roundHalf(v) { return Math.round(v * 2) / 2; }

/* ---------- Maintien de l'écran allumé ---------- */
let wakeLock = null, wakeWanted = false;
async function keepAwake(on) {
  wakeWanted = on;
  try {
    if (on && 'wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch (e) { console.warn('wakeLock', e); }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && wakeWanted) keepAwake(true);
});

/* ---------- Protocole Luc Léger ---------- */
function speedOf(palier, s = DB.settings) {
  return palier === 0 ? s.warmupSpeed : +(s.v1 + (palier - 1) * s.inc).toFixed(2);
}
function palierStart(palier, s = DB.settings) {
  return palier === 0 ? 0 : s.warmupSec + (palier - 1) * s.palierSec;
}
function palierAt(tSec, s = DB.settings) {
  if (tSec < s.warmupSec) return 0;
  return 1 + Math.floor((tSec - s.warmupSec) / s.palierSec);
}
/* Instants (s) de chaque bip de navette : un bip chaque fois que la distance
   théorique parcourue atteint un multiple de la longueur de navette. */
function buildBeeps(s = DB.settings, maxPalier = 30) {
  const beeps = [];
  let dist = 0, k = 1;
  for (let p = 0; p <= maxPalier; p++) {
    const start = palierStart(p, s);
    const end = p === 0 ? s.warmupSec : start + s.palierSec;
    const ms = speedOf(p, s) / 3.6;
    while (true) {
      const target = k * s.distance;
      const t = start + (target - dist) / ms;
      if (t <= end + 1e-9) { beeps.push({ t, n: k, palier: p }); k++; } else break;
    }
    dist += ms * (end - start);
  }
  return beeps;
}

/* ---------- Audio ---------- */
let AC = null;
function audioCtx() {
  if (!AC || AC.state === 'closed') {
    AC = new (window.AudioContext || window.webkitAudioContext)();
  }
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
  if (AC.state === 'suspended') AC.resume();
  // déverrouillage iOS : buffer silencieux
  const b = AC.createBuffer(1, 1, 22050), src = AC.createBufferSource();
  src.buffer = b; src.connect(AC.destination); src.start(0);
  // déverrouillage iOS de la synthèse vocale (doit partir d'un appui)
  if ('speechSynthesis' in window && !audioCtx._speechOk) {
    const u = new SpeechSynthesisUtterance(' '); u.volume = 0; u.lang = 'fr-FR';
    speechSynthesis.speak(u); audioCtx._speechOk = true;
  }
  return AC;
}
function tone(when, freq, dur, vol = 0.9, type = 'square') {
  const ctx = AC; if (!ctx) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(vol, when + 0.005);
  g.gain.setValueAtTime(vol, when + dur - 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  o.connect(g); g.connect(MASTER || ctx.destination);
  o.start(when); o.stop(when + dur + 0.02);
}
/* Annonces vocales enregistrées (fichiers audio/), jouées par Web Audio
   pour sortir sur le même canal que les bips (enceinte Bluetooth). */
let MASTER = null;
const CLIPS = {};
const CLIP_NAMES = ['attention', '30s', 'c1', 'c2', 'c3', 'c4', 'c5', ...Array.from({ length: 30 }, (_, i) => 'p' + (i + 1))];
let clipsLoading = null;
function decode(ctx, buf) {
  return new Promise((ok, ko) => { const p = ctx.decodeAudioData(buf, ok, ko); if (p && p.catch) p.catch(ko); });
}
function loadClips() {
  if (clipsLoading) return clipsLoading;
  const ctx = AC;
  clipsLoading = Promise.all(CLIP_NAMES.map(k => fetch('audio/' + k + '.mp3')
    .then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
    .then(b => decode(ctx, b)).then(buf => { CLIPS[k] = buf; })
    .catch(e => console.warn('clip', k, e))));
  return clipsLoading;
}
function newMaster() {
  if (MASTER) { try { MASTER.disconnect(); } catch (e) {} }
  MASTER = AC.createGain(); MASTER.gain.value = 1; MASTER.connect(AC.destination);
}
function playClip(k, when, fallbackText) {
  const buf = CLIPS[k];
  if (!buf || !AC) { if (fallbackText) setTimeout(() => speak(fallbackText), Math.max(0, (when - (AC ? AC.currentTime : 0)) * 1000)); return; }
  const src = AC.createBufferSource(), g = AC.createGain();
  src.buffer = buf; g.gain.value = 1;
  src.connect(g); g.connect(MASTER || AC.destination);
  src.start(Math.max(when, AC.currentTime));
}
let frVoice = null;
function pickVoice() {
  if (!('speechSynthesis' in window)) return;
  const vs = speechSynthesis.getVoices();
  frVoice = vs.find(v => /^fr(-|_)FR/i.test(v.lang) && /thomas|amélie|audrey|aurélie/i.test(v.name))
    || vs.find(v => /^fr(-|_)FR/i.test(v.lang)) || vs.find(v => /^fr/i.test(v.lang)) || null;
}
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
function speak(text, rate = 1.05) {
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'fr-FR'; if (frVoice) u.voice = frVoice; u.rate = rate; u.volume = 1;
  speechSynthesis.speak(u);
}

/* ---------- Navigation ---------- */
let VIEW = { name: 'home' };
let RUN = null; // test en cours (Luc Léger ou chrono)
function go(name, params = {}) {
  if (RUN && !params._force) {
    if (!confirm('Un test est en cours. Arrêter le test et quitter cet écran ?')) return;
    stopRun();
  }
  VIEW = { name, ...params };
  render();
  window.scrollTo(0, 0);
}
function session(id = VIEW.sid) { return DB.sessions.find(s => s.id === id); }
function res(s, ep) { s.results[ep] = s.results[ep] || {}; return s.results[ep]; }

function header(title, back, right) {
  return `<header class="bar">
    ${back ? `<button class="hbtn" onclick="${back}">‹ Retour</button>` : `<button class="hbtn ghost">-</button>`}
    <h1>${esc(title)}</h1>
    ${right || `<button class="hbtn ghost">-</button>`}
  </header>`;
}

function render() {
  const v = VIEW, app = $('#app');
  const views = { home, settings, editSession, sessionView, consigne, pickWave, lucRun, chronoRun, countEntry, lengthEntry, synth };
  app.innerHTML = (views[v.name] || home)();
  if (v.name === 'lucRun' || v.name === 'chronoRun') afterRunRender();
}

/* ---------- Accueil ---------- */
function home() {
  const list = [...DB.sessions].sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.created - a.created);
  return header('ICP', null, `<button class="hbtn" onclick="A.go('settings')">Réglages</button>`) + `
  <main>
    <button class="btn" onclick="A.go('editSession')">+ Nouvelle session</button>
    <div style="height:14px"></div>
    ${list.length ? `<div class="card">${list.map(s => {
      const n = s.participants.length;
      return `<div class="list-item" onclick="A.go('sessionView',{sid:'${s.id}'})">
        <div class="grow"><b>${esc(fmtDate(s.date))}${s.lieu ? ' · ' + esc(s.lieu) : ''}</b>
        <div class="muted">${n} participant${n > 1 ? 's' : ''}${s.evaluateur ? ' · ' + esc(s.evaluateur) : ''}</div></div>
        <span class="chev">›</span></div>`;
    }).join('')}</div>` : `<div class="empty">Aucune session.<br>Crée une session pour commencer.</div>`}
    <p class="muted" style="text-align:center">Version ${VERSION} · données enregistrées sur cet appareil uniquement</p>
  </main>`;
}

/* ---------- Réglages ---------- */
function settings() {
  const s = DB.settings;
  const rows = [];
  for (let p = 0; p <= 15; p++) {
    const v = speedOf(p), tn = s.distance / (v / 3.6);
    rows.push(`<tr><td>${p === 0 ? 'Échauff.' : p}</td><td>${num(v)}</td><td>${num(tn.toFixed(2))} s</td></tr>`);
  }
  return header('Réglages Luc Léger', "A.go('home')") + `
  <main>
    <div class="card">
      <label class="field">Distance de la navette (m)<input id="st-distance" type="number" inputmode="decimal" step="1" value="${s.distance}"></label>
      <label class="field">Durée de l'échauffement (min)<input id="st-warmup" type="number" inputmode="decimal" step="0.5" value="${s.warmupSec / 60}"></label>
      <label class="field">Vitesse de l'échauffement (km/h)<input id="st-wspeed" type="number" inputmode="decimal" step="0.5" value="${s.warmupSpeed}"></label>
      <label class="field">Vitesse du palier 1 (km/h)<input id="st-v1" type="number" inputmode="decimal" step="0.5" value="${s.v1}"></label>
      <label class="field">Augmentation par palier (km/h)<input id="st-inc" type="number" inputmode="decimal" step="0.1" value="${s.inc}"></label>
      <label class="field">Durée d'un palier (s)<input id="st-palier" type="number" inputmode="numeric" step="1" value="${s.palierSec}"></label>
      <div class="btns"><button class="btn" onclick="A.saveSettings()">Enregistrer</button>
      <button class="btn grey" onclick="A.resetSettings()">Valeurs par défaut</button></div>
    </div>
    <div class="card">
      <h2>Test du son</h2>
      <p class="muted">Connecte l'enceinte Bluetooth puis teste. Si tu n'entends rien, désactive le mode silencieux de l'iPhone.</p>
      <button class="btn secondary" onclick="A.testSound()">Jouer un bip et une annonce</button>
    </div>
    <div class="card">
      <h2>Paliers calculés</h2>
      <div class="table-wrap"><table class="synth"><tr><th>Palier</th><th>km/h</th><th>Bip toutes les</th></tr>${rows.join('')}</table></div>
    </div>
  </main>`;
}
function saveSettings() {
  const g = id => parseFloat(String($(id).value).replace(',', '.'));
  const n = {
    distance: g('#st-distance'), warmupSec: Math.round(g('#st-warmup') * 60), warmupSpeed: g('#st-wspeed'),
    v1: g('#st-v1'), inc: g('#st-inc'), palierSec: Math.round(g('#st-palier')),
  };
  if (Object.values(n).some(x => isNaN(x) || x < 0) || n.distance <= 0 || n.v1 <= 0 || n.warmupSpeed <= 0 || n.palierSec <= 0) {
    toast('Valeurs invalides'); return;
  }
  Object.assign(DB.settings, n); save(); toast('Réglages enregistrés'); render();
}
function resetSettings() {
  if (!confirm('Revenir aux valeurs par défaut (règlement) ?')) return;
  DB.settings = { ...DEFAULT_SETTINGS }; save(); render();
}
function testSound() {
  audioCtx();
  loadClips().then(() => {
    const t = AC.currentTime + 0.1;
    tone(t, 880, 0.18); tone(t + 1, 880, 0.18);
    playClip('p1', t + 1.6, 'Palier 1'); playClip('30s', t + 2.8, '30 secondes');
  });
}

/* ---------- Création / modification de session ---------- */
function fullName(p) { return `${p.prenom || ''} ${p.nom || ''}`.trim(); }
function shortName(p) { return `${p.prenom || ''}${p.nom ? ' ' + p.nom.trim().charAt(0).toUpperCase() + '.' : ''}`.trim(); }
function cleanName(v) { return String(v || '').trim().replace(/\s+/g, ' '); }
function editSession() {
  const s = VIEW.sid ? session() : null;
  const today = new Date().toISOString().slice(0, 10);
  if (!VIEW.rows) {
    VIEW.rows = s ? s.participants.map(p => ({ id: p.id, prenom: p.prenom, nom: p.nom })) : [];
    VIEW.rows.push({ prenom: '', nom: '' });
    VIEW.form = { date: s ? s.date : today, lieu: s ? s.lieu : '', evaluateur: s ? s.evaluateur : '' };
  }
  const f = VIEW.form;
  return header(s ? 'Modifier la session' : 'Nouvelle session', s ? `A.go('sessionView',{sid:'${s.id}'})` : "A.go('home')") + `
  <main><div class="card">
    <label class="field">Date<input type="date" value="${esc(f.date)}" oninput="A.setForm('date',this.value)"></label>
    <label class="field">Lieu<input type="text" value="${esc(f.lieu)}" placeholder="ex. CIS Caen" oninput="A.setForm('lieu',this.value)"></label>
    <label class="field">Évaluateur<input type="text" value="${esc(f.evaluateur)}" placeholder="Prénom Nom" oninput="A.setForm('evaluateur',this.value)"></label>
  </div>
  <div class="card">
    <h2>Participants</h2>
    <div class="row muted" style="font-size:13px;margin-bottom:4px"><span class="grow">Prénom</span><span class="grow">Nom</span><span style="width:40px"></span></div>
    ${VIEW.rows.map((r, i) => `<div class="row" style="margin-bottom:8px">
      <input class="pin grow" id="pr-${i}" type="text" autocapitalize="words" value="${esc(r.prenom)}" placeholder="Prénom" oninput="A.setRow(${i},'prenom',this.value)">
      <input class="pin grow" id="nm-${i}" type="text" autocapitalize="words" value="${esc(r.nom)}" placeholder="Nom" oninput="A.setRow(${i},'nom',this.value)" onkeydown="if(event.key==='Enter'){event.preventDefault();A.addRow(${i})}">
      <button class="delrow" onclick="A.delRow(${i})" aria-label="Supprimer">×</button></div>`).join('')}
    <button class="btn secondary" onclick="A.addRow()">+ Ajouter un participant</button>
  </div>
  <button class="btn" onclick="A.saveSession()">${s ? 'Enregistrer' : 'Créer la session'}</button>
  ${s ? `<div style="height:10px"></div><button class="btn grey" onclick="A.deleteSession()">Supprimer la session</button>` : ''}
  </main>`;
}
function setForm(k, v) { VIEW.form[k] = v; }
function setRow(i, k, v) { VIEW.rows[i][k] = v; }
function addRow(after) {
  const i = after == null ? VIEW.rows.length : after + 1;
  VIEW.rows.splice(i, 0, { prenom: '', nom: '' }); render();
  const el = $('#pr-' + i); if (el) el.focus();
}
function delRow(i) { VIEW.rows.splice(i, 1); if (!VIEW.rows.length) VIEW.rows.push({ prenom: '', nom: '' }); render(); }
function saveSession() {
  const rows = VIEW.rows.map(r => ({ id: r.id, prenom: cleanName(r.prenom), nom: cleanName(r.nom) })).filter(r => r.prenom || r.nom);
  if (!rows.length) { toast('Ajoute au moins un participant'); return; }
  let s = VIEW.sid ? session() : null;
  const isNew = !s;
  if (isNew) s = { id: uid(), created: Date.now(), participants: [], results: {} };
  const keep = new Set(rows.filter(r => r.id).map(r => r.id));
  const removed = s.participants.filter(p => !keep.has(p.id));
  const removedWithResults = removed.filter(p => EPREUVES.some(e => s.results[e.id] && s.results[e.id][p.id]));
  if (removedWithResults.length && !confirm(`Supprimer aussi les résultats de : ${removedWithResults.map(fullName).join(', ')} ?`)) return;
  removed.forEach(p => EPREUVES.forEach(e => { if (s.results[e.id]) delete s.results[e.id][p.id]; }));
  s.participants = rows.map(r => ({ id: r.id || uid(), prenom: r.prenom, nom: r.nom }));
  s.date = VIEW.form.date; s.lieu = cleanName(VIEW.form.lieu); s.evaluateur = cleanName(VIEW.form.evaluateur);
  if (isNew) DB.sessions.push(s);
  save(); go('sessionView', { sid: s.id });
}
/* Ajout rapide d'un participant à une session en cours */
function addPersonSheet() {
  openSheet(`<h3>Ajouter un participant</h3>
    <label class="field">Prénom<input id="ap-prenom" type="text" autocapitalize="words"></label>
    <label class="field">Nom<input id="ap-nom" type="text" autocapitalize="words" onkeydown="if(event.key==='Enter')A.addPerson()"></label>
    <button class="btn" onclick="A.addPerson()">Ajouter</button>
    <button class="btn grey" onclick="A.closeSheet()">Annuler</button>`);
  setTimeout(() => { const el = $('#ap-prenom'); if (el) el.focus(); }, 50);
}
function addPerson() {
  const prenom = cleanName($('#ap-prenom').value), nom = cleanName($('#ap-nom').value);
  if (!prenom && !nom) { toast('Saisis au moins un prénom ou un nom'); return; }
  const s = session(), p = { id: uid(), prenom, nom };
  s.participants.push(p); save();
  if (VIEW.sel) VIEW.sel[p.id] = true;
  closeSheet(); toast(fullName(p) + ' ajouté(e)'); render();
}
function deleteSession() {
  if (!confirm('Supprimer définitivement cette session et tous ses résultats ?')) return;
  DB.sessions = DB.sessions.filter(s => s.id !== VIEW.sid); save(); go('home');
}

/* ---------- Session ---------- */
function doneCount(s, ep) {
  const r = s.results[ep] || {};
  return s.participants.filter(p => r[p.id]).length;
}
function sessionView() {
  const s = session(); if (!s) return home();
  const n = s.participants.length;
  return header(fmtDate(s.date) + (s.lieu ? ' · ' + s.lieu : ''), "A.go('home')",
    `<button class="hbtn" onclick="A.go('editSession',{sid:'${s.id}'})">Modifier</button>`) + `
  <main>
    <div class="epreuves">${EPREUVES.map(e => {
      const d = doneCount(s, e.id);
      return `<button class="ep ${d === n ? 'done' : ''}" onclick="A.go('consigne',{sid:'${s.id}',ep:'${e.id}'})">
        <b>${e.nom}</b><span class="prog">${d} / ${n} ${d === n ? '✓' : ''}</span>
        <div class="bar-prog"><i style="width:${n ? d / n * 100 : 0}%"></i></div></button>`;
    }).join('')}</div>
    <div style="height:14px"></div>
    <button class="btn" onclick="A.go('synth',{sid:'${s.id}'})">Synthèse et exports</button>
    <div style="height:10px"></div>
    <button class="btn secondary" onclick="A.addPersonSheet()">+ Ajouter un participant (${n})</button>
  </main>`;
}

/* ---------- Consigne ---------- */
function consigne() {
  const s = session(), e = EP[VIEW.ep];
  return header(e.nom, `A.go('sessionView',{sid:'${s.id}'})`) + `
  <main>
    <div class="consigne">${esc(e.consigne.replace('{DIST}', num(DB.settings.distance)))}</div>
    <div style="height:14px"></div>
    <button class="btn" onclick="A.go('pickWave',{sid:'${s.id}',ep:'${e.id}'})">Composer la vague</button>
  </main>`;
}

/* ---------- Choix de la vague + statuts ---------- */
function resultLabel(ep, r) {
  if (!r) return '';
  if (r.status) return STATUTS[r.status];
  switch (EP[ep].mode) {
    case 'luc': return `P${r.palier} · ${fmtTime(r.temps)} · ${num(r.vma)} km/h`;
    case 'count': return `${r.value}`;
    case 'chrono': return fmtTime(r.temps);
    case 'length': return `${num(r.best)} cm`;
  }
  return '';
}
function pickWave() {
  const s = session(), e = EP[VIEW.ep], r = res(s, e.id);
  VIEW.sel = VIEW.sel || Object.fromEntries(s.participants.map(p => [p.id, !r[p.id]]));
  const sel = VIEW.sel, nb = Object.values(sel).filter(Boolean).length;
  return header(e.nom + ' · vague', `A.go('consigne',{sid:'${s.id}',ep:'${e.id}'})`) + `
  <main>
    ${s.participants.every(p => r[p.id]) ? `<div class="card" style="background:#e8f5e9">
      <b>✓ Épreuve terminée pour tous les participants</b>
      <div style="height:10px"></div>
      <button class="btn green" onclick="A.go('sessionView',{sid:'${s.id}'})">Retour à l'accueil de la session</button></div>` : ''}
    <div class="row between" style="margin-bottom:8px">
      <span class="muted">${nb} sélectionné${nb > 1 ? 's' : ''}</span>
      <span><button class="btn small grey" onclick="A.selAll(true)">Tous</button>
      <button class="btn small grey" onclick="A.selAll(false)">Aucun</button></span>
    </div>
    <div class="card">${s.participants.map(p => {
      const rr = r[p.id];
      return `<div class="pick">
        <input type="checkbox" ${sel[p.id] ? 'checked' : ''} onchange="A.toggleSel('${p.id}',this.checked)">
        <div class="grow" onclick="A.toggleSel('${p.id}')"><b>${esc(fullName(p))}</b>
        ${rr ? `<div><span class="tag ${rr.status ? 'st' : 'ok'}">${esc(resultLabel(e.id, rr))}</span></div>` : ''}</div>
        <button class="stbtn" onclick="A.statusSheet('${p.id}')">Statut</button>
      </div>`;
    }).join('')}
      <button class="btn small secondary" style="margin-top:10px" onclick="A.addPersonSheet()">+ Ajouter un participant</button></div>
    ${e.mode === 'luc' ? distanceCard() : ''}
    <button class="btn" ${nb ? '' : 'disabled'} onclick="A.startWave()">${e.mode === 'luc' || e.mode === 'chrono' ? 'Démarrer' : 'Saisir les résultats'} (${nb})</button>
  </main>`;
}
function distanceCard() {
  const d = DB.settings.distance, std = d === DEFAULT_SETTINGS.distance;
  return `<div class="card row" style="${std ? '' : 'background:#fff3e0;border:2px solid var(--orange)'}">
    <div class="grow"><div class="muted">Distance de navette</div>
    <div style="font-size:26px;font-weight:800;${std ? '' : 'color:var(--orange)'}">${num(d)} m</div>
    ${std ? '' : `<div class="muted">Différente de la distance standard (${DEFAULT_SETTINGS.distance} m)</div>`}</div>
    <button class="btn small secondary" onclick="A.distanceSheet()">Modifier</button></div>`;
}
function distanceSheet() {
  openSheet(`<h3>Distance de navette</h3>
    <label class="field">Longueur de la piste (m)<input id="ds-val" type="text" inputmode="decimal" value="${num(DB.settings.distance)}"></label>
    <p class="muted">Les vitesses des paliers restent les mêmes, seul l'intervalle entre les bips est recalculé. La distance reste enregistrée pour les prochains tests.</p>
    <button class="btn" onclick="A.saveDistance()">Enregistrer</button>
    <button class="btn grey" onclick="A.saveDistance(${DEFAULT_SETTINGS.distance})">Revenir à ${DEFAULT_SETTINGS.distance} m</button>
    <button class="btn grey" onclick="A.closeSheet()">Annuler</button>`);
}
function saveDistance(v) {
  const d = v != null ? v : parseFloat(String($('#ds-val').value).replace(',', '.'));
  if (isNaN(d) || d < 5 || d > 50) { toast('Distance entre 5 et 50 m'); return; }
  DB.settings.distance = d; save(); closeSheet(); render(); toast(`Distance : ${num(d)} m`);
}
function toggleSel(pid, val) {
  VIEW.sel[pid] = val === undefined ? !VIEW.sel[pid] : val; render();
}
function selAll(v) { Object.keys(VIEW.sel).forEach(k => VIEW.sel[k] = v); render(); }
function statusSheet(pid, ep = VIEW.ep, after) {
  const s = session(), p = s.participants.find(x => x.id === pid);
  openSheet(`<h3>${esc(fullName(p))} · ${EP[ep].nom}</h3>
    ${Object.entries(STATUTS).map(([k, l]) => `<button class="btn secondary" onclick="A.setStatus('${pid}','${ep}','${k}')">${l}</button>`).join('')}
    <button class="btn grey" onclick="A.setStatus('${pid}','${ep}',null)">Effacer le résultat</button>
    <button class="btn grey" onclick="A.closeSheet()">Annuler</button>`);
}
function setStatus(pid, ep, st) {
  const s = session(), r = res(s, ep);
  if (st) r[pid] = { status: st }; else delete r[pid];
  if (VIEW.sel) VIEW.sel[pid] = false;
  save(); closeSheet(); render();
}
function startWave() {
  const s = session(), e = EP[VIEW.ep];
  const ids = s.participants.filter(p => VIEW.sel[p.id]).map(p => p.id);
  if (!ids.length) return;
  const params = { sid: s.id, ep: e.id, ids };
  if (e.mode === 'luc') {
    audioCtx(); // dans l'appui : déverrouille l'audio iOS
    const btn = document.querySelector('main .btn:last-child'); if (btn) { btn.disabled = true; btn.textContent = 'Préparation du son…'; }
    loadClips().then(() => { lucStart(ids); go('lucRun', { ...params, _force: true }); });
  }
  else if (e.mode === 'chrono') { RUN = null; go('chronoRun', params); }
  else if (e.mode === 'count') go('countEntry', params);
  else go('lengthEntry', params);
}

/* ---------- Luc Léger : exécution ---------- */
function lucStart(ids) {
  const ctx = audioCtx();
  const cfg = { ...DB.settings };
  const now = ctx.currentTime;
  const t0 = now + 1.6 + cfg.countdown; // « Attention » puis décompte
  const events = [];
  // signal d'attention
  events.push({ at: now + 0.15, kind: 'attention' });
  for (let k = cfg.countdown; k >= 1; k--) events.push({ at: t0 - k, kind: 'count', n: k });
  events.push({ at: t0, kind: 'start' });
  const beeps = buildBeeps(cfg);
  beeps.forEach(b => events.push({ at: t0 + b.t, kind: 'beep' }));
  const perPalier = {};
  beeps.forEach(b => { (perPalier[b.palier] = perPalier[b.palier] || []).push(b.t); });
  for (let p = 1; p <= 30; p++) {
    events.push({ at: t0 + palierStart(p, cfg), kind: 'palier', n: p });
    if (cfg.palierSec > 30) events.push({ at: t0 + palierStart(p, cfg) + 30, kind: 'half', n: p });
  }
  events.sort((a, b) => a.at - b.at);
  RUN = { type: 'luc', cfg, t0, events, perPalier, idx: 0, ids, stops: {}, undo: [], timer: null, raf: null, sid: VIEW.sid, ep: 'luc' };
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  newMaster();
  RUN.timer = setInterval(lucTick, 20);
  keepAwake(true);
}
function lucTick() {
  if (!RUN || RUN.type !== 'luc') return;
  const ctx = AC, horizon = ctx.currentTime + 0.4;
  while (RUN.idx < RUN.events.length && RUN.events[RUN.idx].at < horizon) {
    const ev = RUN.events[RUN.idx++];
    const lead = Math.max(0, (ev.at - ctx.currentTime) * 1000);
    switch (ev.kind) {
      case 'attention':
        tone(ev.at, 660, 0.12); tone(ev.at + 0.18, 660, 0.12); tone(ev.at + 0.36, 660, 0.12);
        playClip('attention', ev.at + 0.7, 'Attention'); break;
      case 'count':
        playClip('c' + ev.n, ev.at, String(ev.n)); break;
      case 'start':
        tone(ev.at, 1046, 0.5); break;
      case 'beep':
        tone(ev.at, 880, 0.2); break;
      case 'palier':
        playClip('p' + ev.n, ev.at, 'Palier ' + ev.n); break;
      case 'half':
        playClip('30s', ev.at, '30 secondes'); break;
    }
  }
}
function navDone(p, t) { return (RUN.perPalier[p] || []).filter(x => x <= t + 0.05).length; }
function lucElapsed() { return AC ? AC.currentTime - RUN.t0 : 0; }
function lucStop(pid) {
  if (!RUN) return;
  const tSec = lucElapsed();
  if (tSec < 0) { toast('Le test n’a pas encore commencé'); return; }
  if (RUN.stops[pid]) return;
  const palier = palierAt(tSec, RUN.cfg);
  const r = { palier, temps: Math.round(tSec * 1000), vma: speedOf(palier, RUN.cfg) };
  RUN.stops[pid] = r; RUN.undo.push(pid);
  res(session(RUN.sid), 'luc')[pid] = r; save();
  if (navigator.vibrate) navigator.vibrate(40);
  if (RUN.ids.every(id => RUN.stops[id])) { finishRun(); return; }
  render();
}
function lucUndo() {
  if (!RUN || !RUN.undo.length) return;
  const pid = RUN.undo.pop(); delete RUN.stops[pid];
  delete res(session(RUN.sid), RUN.ep)[pid]; save(); render();
}

/* ---------- Chrono commun (Killy, gainage) ---------- */
function chronoBegin() {
  if (RUN) return;
  try { audioCtx(); tone(AC.currentTime + 0.05, 1046, 0.35); } catch (e) {}
  RUN = { type: 'chrono', start: performance.now(), ids: VIEW.ids, stops: {}, undo: [], sid: VIEW.sid, ep: VIEW.ep };
  keepAwake(true); render();
}
function chronoElapsed() { return RUN ? performance.now() - RUN.start : 0; }
function chronoStop(pid) {
  if (!RUN) { toast('Appuie d’abord sur Départ'); return; }
  if (RUN.stops[pid]) return;
  const r = { temps: Math.round(chronoElapsed()) };
  RUN.stops[pid] = r; RUN.undo.push(pid);
  res(session(RUN.sid), RUN.ep)[pid] = r; save();
  if (navigator.vibrate) navigator.vibrate(40);
  if (RUN.ids.every(id => RUN.stops[id])) { finishRun(); return; }
  render();
}

/* ---------- Fin de test ---------- */
function stopRun() {
  if (!RUN) return;
  clearInterval(RUN.timer); cancelAnimationFrame(RUN.raf);
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  if (MASTER) { try { MASTER.disconnect(); } catch (e) {} MASTER = null; }
  RUN = null; keepAwake(false);
}
function finishRun() {
  const { sid, ep, ids, type } = RUN;
  if (type === 'luc' && AC) tone(AC.currentTime + 0.05, 440, 0.6);
  setTimeout(() => {
    stopRun();
    VIEW = { name: 'pickWave', sid, ep };
    render();
    const s = session(sid), r = res(s, ep);
    openSheet(`<h3>Vague terminée</h3>
      <div class="card" style="box-shadow:none;padding:0">${ids.map(id => {
        const p = s.participants.find(x => x.id === id);
        return `<div class="list-item"><span class="grow">${esc(fullName(p))}</span><b>${esc(resultLabel(ep, r[id]))}</b></div>`;
      }).join('')}</div>
      ${s.participants.every(p => r[p.id])
        ? `<button class="btn green" onclick="A.closeSheet();A.go('sessionView',{sid:'${sid}'})">Retour à l'accueil de la session</button>
           <button class="btn grey" onclick="A.closeSheet()">Rester sur l'épreuve</button>`
        : `<button class="btn" onclick="A.closeSheet()">Vague suivante</button>`}`);
  }, type === 'luc' ? 700 : 0);
}
function abortRun() {
  if (!RUN) { go('pickWave', { sid: VIEW.sid, ep: VIEW.ep }); return; }
  const left = RUN.ids.filter(id => !RUN.stops[id]).length;
  if (!confirm(`Arrêter le test ? ${left} participant${left > 1 ? 's' : ''} encore en course n'aur${left > 1 ? 'ont' : 'a'} pas de résultat.`)) return;
  const { sid, ep } = RUN; stopRun(); go('pickWave', { sid, ep, _force: true });
}

function runnersHtml(stopFn) {
  const s = session();
  const r = RUN ? RUN.stops : {};
  return `<div class="runners">${VIEW.ids.map(id => {
    const p = s.participants.find(x => x.id === id), st = r[id];
    const lab = st ? (VIEW.ep === 'luc' ? `P${st.palier} · ${fmtTime(st.temps)}` : fmtTime(st.temps)) : '';
    return `<button class="runner ${st ? 'stopped' : ''}" onclick="A.${stopFn}('${id}')">${esc(shortName(p))}${st ? `<small>${lab}</small>` : ''}</button>`;
  }).join('')}</div>`;
}
function lucRun() {
  const left = RUN ? RUN.ids.filter(id => !RUN.stops[id]).length : 0;
  return header('Luc Léger', null, `<button class="hbtn" onclick="A.abortRun()">Arrêter</button>`) + `
  <main class="live">
    <div id="live-top"></div>
    ${runnersHtml('lucStop')}
    <div style="height:14px"></div>
    <button class="btn grey" ${RUN && RUN.undo.length ? '' : 'disabled'} onclick="A.lucUndo()">↶ Annuler la dernière action</button>
  </main>`;
}
function chronoRun() {
  const e = EP[VIEW.ep];
  const left = RUN ? RUN.ids.filter(id => !RUN.stops[id]).length : VIEW.ids.length;
  return header(e.nom, RUN ? null : `A.go('pickWave',{sid:'${VIEW.sid}',ep:'${VIEW.ep}'})`,
    RUN ? `<button class="hbtn" onclick="A.abortRun()">Arrêter</button>` : '') + `
  <main class="live">
    <div id="live-top"><div class="clock">0:00,0</div></div>
    ${RUN ? `<div class="sub">${left} en cours</div>` : `<button class="btn green" style="font-size:22px;padding:20px" onclick="A.chronoBegin()">Départ</button>`}
    ${runnersHtml('chronoStop')}
    <div style="height:14px"></div>
    ${RUN ? `<button class="btn grey" ${RUN.undo.length ? '' : 'disabled'} onclick="A.lucUndo()">↶ Annuler la dernière action</button>` : ''}
  </main>`;
}
function afterRunRender() {
  if (!RUN) return;
  cancelAnimationFrame(RUN.raf);
  const top = $('#live-top');
  const loop = () => {
    if (!RUN || !top.isConnected) return;
    if (RUN.type === 'luc') {
      const t = lucElapsed();
      if (t < 0) {
        top.innerHTML = `<div class="sub">Départ dans · navette ${num(RUN.cfg.distance)} m</div><div class="countdown">${Math.ceil(-t)}</div>`;
      } else {
        const p = palierAt(t, RUN.cfg), v = speedOf(p, RUN.cfg);
        const nextChange = palierStart(p + 1, RUN.cfg) - t;
        top.innerHTML = `<div class="clock">${fmtTimeTenth(t * 1000)}</div>
          <div class="palier">${p === 0 ? 'Échauffement' : 'Palier ' + p} · ${num(v)} km/h</div>
          <div class="navette">Navette ${navDone(p, t)} / ${(RUN.perPalier[p] || []).length}</div>
          <div class="sub">Piste de ${num(RUN.cfg.distance)} m</div>
          <div class="sub">Palier suivant dans ${Math.ceil(nextChange)} s</div>`;
      }
    } else {
      top.innerHTML = `<div class="clock">${fmtTimeTenth(chronoElapsed())}</div>`;
    }
    RUN.raf = requestAnimationFrame(loop);
  };
  loop();
}

/* ---------- Compteur (pompes, tractions) ---------- */
function countEntry() {
  const s = session(), e = EP[VIEW.ep], r = res(s, e.id);
  VIEW.vals = VIEW.vals || Object.fromEntries(VIEW.ids.map(id => [id, r[id] && r[id].value != null ? r[id].value : '']));
  return header(e.nom, `A.go('pickWave',{sid:'${s.id}',ep:'${e.id}'})`) + `
  <main>
    <p class="muted">Nombre maximal de répétitions, saisi à la fin.</p>
    <div class="card">${VIEW.ids.map(id => {
      const p = s.participants.find(x => x.id === id);
      return `<div class="list-item"><div class="grow"><b>${esc(fullName(p))}</b><br>
        <button class="stbtn" onclick="A.statusSheet('${id}')">Statut…</button></div>
        <div class="counter"><button onclick="A.inc('${id}',-1)">−</button>
        <input id="c-${id}" type="number" inputmode="numeric" min="0" value="${VIEW.vals[id]}" oninput="A.setVal('${id}',this.value)">
        <button onclick="A.inc('${id}',1)">+</button></div></div>`;
    }).join('')}</div>
    <button class="btn" onclick="A.saveCounts()">Valider</button>
  </main>`;
}
function inc(id, d) {
  const v = Math.max(0, (parseInt(VIEW.vals[id], 10) || 0) + d);
  VIEW.vals[id] = v; $('#c-' + id).value = v;
}
function setVal(id, v) { VIEW.vals[id] = v; }
function saveCounts() {
  const s = session(), r = res(s, VIEW.ep);
  let n = 0;
  VIEW.ids.forEach(id => {
    const raw = String(VIEW.vals[id]).trim();
    if (raw === '') return;
    const v = parseInt(raw, 10);
    if (!isNaN(v) && v >= 0) { r[id] = { value: v }; n++; }
  });
  save(); toast(`${n} résultat${n > 1 ? 's' : ''} enregistré${n > 1 ? 's' : ''}`);
  go('pickWave', { sid: s.id, ep: VIEW.ep });
}

/* ---------- Souplesse ---------- */
function lengthEntry() {
  const s = session(), e = EP[VIEW.ep], r = res(s, e.id);
  VIEW.vals = VIEW.vals || Object.fromEntries(VIEW.ids.map(id => [id, {
    e1: r[id] && r[id].e1 != null ? num(r[id].e1) : '', e2: r[id] && r[id].e2 != null ? num(r[id].e2) : '' }]));
  return header(e.nom, `A.go('pickWave',{sid:'${s.id}',ep:'${e.id}'})`) + `
  <main>
    <p class="muted">En cm, à 0,5 cm près, à partir de 0. 2 essais max, le meilleur est retenu.</p>
    <div class="card">${VIEW.ids.map(id => {
      const p = s.participants.find(x => x.id === id);
      return `<div class="list-item essai"><div class="grow"><b>${esc(fullName(p))}</b><br>
        <button class="stbtn" onclick="A.statusSheet('${id}')">Statut…</button></div>
        <input type="text" inputmode="decimal" placeholder="Essai 1" value="${VIEW.vals[id].e1}" oninput="A.setEssai('${id}','e1',this.value)">
        <input type="text" inputmode="decimal" placeholder="Essai 2" value="${VIEW.vals[id].e2}" oninput="A.setEssai('${id}','e2',this.value)">
      </div>`;
    }).join('')}</div>
    <button class="btn" onclick="A.saveLengths()">Valider</button>
  </main>`;
}
function setEssai(id, k, v) { VIEW.vals[id][k] = v; }
function parseLen(v) {
  v = String(v || '').trim().replace(',', '.');
  if (v === '') return null;
  const x = parseFloat(v);
  return isNaN(x) || x < 0 ? NaN : roundHalf(x);
}
function saveLengths() {
  const s = session(), r = res(s, VIEW.ep);
  let n = 0, bad = false;
  VIEW.ids.forEach(id => {
    const e1 = parseLen(VIEW.vals[id].e1), e2 = parseLen(VIEW.vals[id].e2);
    if (Number.isNaN(e1) || Number.isNaN(e2)) { bad = true; return; }
    if (e1 == null && e2 == null) return;
    r[id] = { e1, e2, best: Math.max(e1 ?? 0, e2 ?? 0) }; n++;
  });
  if (bad) { toast('Valeur invalide (nombre ≥ 0 attendu)'); return; }
  save(); toast(`${n} résultat${n > 1 ? 's' : ''} enregistré${n > 1 ? 's' : ''}`);
  go('pickWave', { sid: s.id, ep: VIEW.ep });
}

/* ---------- Synthèse ---------- */
function synth() {
  const s = session();
  const cell = (ep, pid) => {
    const r = (s.results[ep] || {})[pid];
    let txt = 'à faire', cls = 'todo';
    if (r) {
      cls = r.status ? 'st' : '';
      if (r.status) txt = STATUTS[r.status];
      else if (ep === 'luc') txt = `P${r.palier} · ${fmtTime(r.temps)} · ${num(r.vma)}`;
      else if (ep === 'souplesse') txt = `${num(r.best)} cm`;
      else txt = resultLabel(ep, r);
    }
    return `<td class="cell ${cls}" onclick="A.editCell('${ep}','${pid}')">${esc(txt)}</td>`;
  };
  return header('Synthèse', `A.go('sessionView',{sid:'${s.id}'})`) + `
  <main>
    <p class="muted">${esc(fmtDate(s.date))}${s.lieu ? ' · ' + esc(s.lieu) : ''}${s.evaluateur ? ' · Évaluateur : ' + esc(s.evaluateur) : ''}<br>Touchez une case pour la corriger.</p>
    <div class="table-wrap"><table class="synth">
      <tr><th>Participant</th><th>Luc Léger<br><span class="muted">palier · temps · VMA</span></th>${EPREUVES.slice(1).map(e => `<th>${e.nom}</th>`).join('')}</tr>
      ${s.participants.map(p => `<tr><td>${esc(fullName(p))}</td>${EPREUVES.map(e => cell(e.id, p.id)).join('')}</tr>`).join('')}
    </table></div>
    <div style="height:14px"></div>
    <div class="btns">
      <button class="btn" onclick="A.exportCSV()">Excel / CSV</button>
      <button class="btn" onclick="A.exportPDF()">PDF</button>
    </div>
  </main>`;
}
function editCell(ep, pid) {
  const s = session(), p = s.participants.find(x => x.id === pid), r = (s.results[ep] || {})[pid] || {};
  const e = EP[ep];
  let fields = '';
  if (e.mode === 'luc') fields = `<label class="field">Palier (0 = échauffement)<input id="m-a" type="number" inputmode="numeric" min="0" value="${r.palier ?? ''}"></label>
      <label class="field">Temps (min:s)<input id="m-b" type="text" inputmode="decimal" value="${r.temps != null ? fmtTime(r.temps) : ''}" placeholder="ex. 7:42"></label>`;
  else if (e.mode === 'count') fields = `<label class="field">Nombre<input id="m-a" type="number" inputmode="numeric" min="0" value="${r.value ?? ''}"></label>`;
  else if (e.mode === 'chrono') fields = `<label class="field">Temps (min:s)<input id="m-a" type="text" inputmode="decimal" value="${r.temps != null ? fmtTime(r.temps) : ''}" placeholder="ex. 2:35"></label>`;
  else fields = `<label class="field">Essai 1 (cm)<input id="m-a" type="text" inputmode="decimal" value="${r.e1 != null ? num(r.e1) : ''}"></label>
      <label class="field">Essai 2 (cm)<input id="m-b" type="text" inputmode="decimal" value="${r.e2 != null ? num(r.e2) : ''}"></label>`;
  openSheet(`<h3>${esc(fullName(p))} · ${e.nom}</h3>${fields}
    <button class="btn" onclick="A.saveCell('${ep}','${pid}')">Enregistrer</button>
    <div style="height:10px"></div>
    <div class="btns">${Object.entries(STATUTS).map(([k, l]) => `<button class="btn secondary small" style="width:100%" onclick="A.setStatus('${pid}','${ep}','${k}')">${l}</button>`).join('')}
    <button class="btn grey small" style="width:100%" onclick="A.setStatus('${pid}','${ep}',null)">Effacer</button></div>
    <div style="height:10px"></div><button class="btn grey" onclick="A.closeSheet()">Annuler</button>`);
}
function saveCell(ep, pid) {
  const s = session(), r = res(s, ep), e = EP[ep];
  const a = $('#m-a') ? $('#m-a').value : '', b = $('#m-b') ? $('#m-b').value : '';
  let v = null;
  if (e.mode === 'luc') {
    const pal = parseInt(a, 10);
    if (isNaN(pal) || pal < 0) { toast('Palier invalide'); return; }
    const t = parseTime(b);
    v = { palier: pal, temps: t, vma: speedOf(pal) };
  } else if (e.mode === 'count') {
    const n = parseInt(a, 10); if (isNaN(n) || n < 0) { toast('Nombre invalide'); return; }
    v = { value: n };
  } else if (e.mode === 'chrono') {
    const t = parseTime(a); if (t == null) { toast('Temps invalide'); return; }
    v = { temps: t };
  } else {
    const e1 = parseLen(a), e2 = parseLen(b);
    if (Number.isNaN(e1) || Number.isNaN(e2) || (e1 == null && e2 == null)) { toast('Valeur invalide'); return; }
    v = { e1, e2, best: Math.max(e1 ?? 0, e2 ?? 0) };
  }
  r[pid] = v; save(); closeSheet(); render();
}

/* ---------- Exports ---------- */
function exportRows(s, pdf = false) {
  const head = ['Prénom', 'Nom', 'Luc Léger palier', 'Luc Léger temps', 'Luc Léger VMA (km/h)', 'Pompes', 'Tractions',
    'Killy (min:s)', 'Gainage (min:s)'].concat(pdf ? ['Souplesse (cm)'] : ['Souplesse essai 1 (cm)', 'Souplesse essai 2 (cm)', 'Souplesse meilleur (cm)']);
  const rows = s.participants.map(p => {
    const g = ep => (s.results[ep] || {})[p.id];
    const st = r => r && r.status ? STATUTS[r.status] : null;
    const L = g('luc'), P = g('pompes'), T = g('tractions'), K = g('killy'), G = g('gainage'), S = g('souplesse');
    const soup = pdf ? [st(S) ?? (S ? num(S.best) : '')]
      : [st(S) ?? (S && S.e1 != null ? num(S.e1) : ''), S && !S.status && S.e2 != null ? num(S.e2) : '', S && !S.status ? num(S.best) : ''];
    return [
      p.prenom, p.nom,
      st(L) ?? (L ? L.palier : ''), L && !L.status && L.temps != null ? fmtTime(L.temps) : '', L && !L.status ? num(L.vma) : '',
      st(P) ?? (P ? P.value : ''), st(T) ?? (T ? T.value : ''),
      st(K) ?? (K ? fmtTime(K.temps) : ''), st(G) ?? (G ? fmtTime(G.temps) : ''),
      ...soup,
    ].map(x => String(x ?? ''));
  });
  return { head, rows };
}
function fileBase(s) {
  return `ICP_${s.date || 'session'}${s.lieu ? '_' + s.lieu.replace(/[^\wÀ-ÿ-]+/g, '-') : ''}`;
}
async function shareFile(blob, name) {
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
function exportCSV() {
  const s = session(), { head, rows } = exportRows(s);
  const q = v => /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  const meta = [['Session', fmtDate(s.date)], ['Lieu', s.lieu || ''], ['Évaluateur', s.evaluateur || ''], []];
  const csv = '﻿' + [...meta, head, ...rows].map(r => r.map(q).join(';')).join('\r\n');
  shareFile(new Blob([csv], { type: 'text/csv;charset=utf-8' }), fileBase(s) + '.csv');
}
function exportPDF() {
  const s = session(), { rows } = exportRows(s, true);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setFontSize(16); doc.text('Indicateurs de Condition Physique', 14, 15);
  doc.setFontSize(11);
  doc.text(`Session du ${fmtDate(s.date)}${s.lieu ? ' — ' + s.lieu : ''}${s.evaluateur ? '   ·   Évaluateur : ' + s.evaluateur : ''}`, 14, 23);
  const shortHead = ['Prénom', 'Nom', 'Luc Léger\npalier', 'Luc Léger\ntemps', 'VMA\nkm/h', 'Pompes', 'Tractions', 'Killy', 'Gainage', 'Souplesse\n(cm)'];
  doc.autoTable({
    head: [shortHead], body: rows, startY: 29, theme: 'grid',
    styles: { fontSize: 9, halign: 'center', valign: 'middle', cellPadding: 2 },
    headStyles: { fillColor: [183, 28, 28], textColor: 255 },
    columnStyles: { 0: { halign: 'left', fontStyle: 'bold' }, 1: { halign: 'left', fontStyle: 'bold' } },
  });
  const y = doc.lastAutoTable.finalY + 10;
  doc.setFontSize(9);
  doc.text('Signature de l’évaluateur :', 200, y + 8);
  shareFile(doc.output('blob'), fileBase(s) + '.pdf');
}

/* ---------- Feuille modale ---------- */
function openSheet(html) {
  const m = $('#modal'); m.innerHTML = `<div class="sheet" onclick="event.stopPropagation()">${html}</div>`;
  m.classList.remove('hidden'); m.onclick = closeSheet;
}
function closeSheet() { $('#modal').classList.add('hidden'); $('#modal').innerHTML = ''; }

/* ---------- API globale ---------- */
window.A = { go, distanceSheet, saveDistance, setForm, setRow, addRow, delRow, addPersonSheet, addPerson, saveSettings, resetSettings, testSound, saveSession, deleteSession, toggleSel, selAll, statusSheet,
  setStatus, startWave, lucStop, lucUndo, chronoBegin, chronoStop, abortRun, inc, setVal, saveCounts, setEssai,
  saveLengths, editCell, saveCell, exportCSV, exportPDF, closeSheet };
window._icp = { buildBeeps, palierAt, speedOf, DB: () => DB };

window.addEventListener('beforeunload', e => { if (RUN) { e.preventDefault(); e.returnValue = ''; } });
render();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW', e));
}
