import * as THREE from 'three';
import {
  WORLD, HALF, AIRPORTS, LANDMARKS, CITIES, TOWNS, terrainHeight, groundHeight, airportById,
} from './world.js';
import { Plane, createPlaneMesh, animatePlaneMesh, DIFFICULTY } from './plane.js';
import { AIRCRAFT, aircraftById, aircraftIndex, unlockedAircraft } from './aircraft.js';
import { Terrain, terrainColor } from './terrain.js';
import { Decor } from './decor.js';
import { buildWorldObjects, makeLabel, updateLabels } from './objects.js';
import { settings, buildSettingsForm, saveSettings, FUEL_SCALE } from './settings.js';
import { MULTIPLAYER_URL } from './config.js';
import { GameRenderer } from './render/renderer.js';
import { CameraRig } from './render/cameras.js';
import { TreeLibrary, NearTrees } from './render/trees.js';
import { HouseLibrary } from './render/buildings.js';
import { RockLibrary } from './render/rocks.js';
import { SoundEngine } from './ui/audio.js';
import { Instruments } from './ui/instruments.js';
import { icon, hydrateIcons } from './ui/icons.js';
import { QuestSystem, isRanked, fmtChrono } from './quests/engine.js';
import { ACTIONS, isKey, keysFor, keyName, kbd, bindKey, unbindKey, resetKeys } from './keybinds.js';
import { Account, mergeSaves, mountGoogleButton, takeRedirectToken } from './account.js';
import { Hangar } from './hangar.js';
import { t, isEN, setLang, translateDom } from './i18n.js';
import { cleanLivery, PATTERNS, FINISHES, WINGS, EMBLEMS, SWATCHES, ZONES, STICKERS, MAX_STICKERS, cleanStickerText, priceOf, PRICE_LABEL } from './livery.js';
import { stickerThumb } from './stickers.js';

const $ = (id) => document.getElementById(id);
// rang au classement : « 1er sur 12 » / « #1 of 12 »
const ordinal = (rank, total) => (rank === 1 ? t('{rank}er sur {total}', { rank, total }) : t('{rank}e sur {total}', { rank, total }));
const status = (msg, progress) => { $('load-status').textContent = msg; if (progress !== undefined) $('load-bar').style.width = `${progress}%`; };
hydrateIcons();
// langue : la page est en français, traduite à l'affichage si le joueur a choisi l'anglais
document.documentElement.lang = isEN ? 'en' : 'fr';
translateDom();
$('lang-switch').textContent = isEN ? '🇫🇷 Passer en français' : '🇬🇧 Play in English';
$('lang-switch').onclick = () => setLang(isEN ? 'fr' : 'en');

// ================= Rendu =================
const gfx = new GameRenderer($('game'));
const { renderer, scene, camera } = gfx;


const terrain = new Terrain(scene);
gfx.attachTerrain(terrain);
const decor = new Decor(scene);
let world = null;

function applySettings(key) {
  gfx.applySettings(settings, key);
  if (!key || key === 'viewDist') terrain.setViewDistance(settings.viewDist * 1000);
  if (!key || key === 'trees' || key === 'decoDist' || key === 'quality') decor.setOptions({ density: settings.trees, radius: settings.decoDist, q: gfx.cfg });
  if (!key || key === 'showFps') $('fps').classList.toggle('hidden', !settings.showFps);
  if (!key || key === 'volume' || key === 'muted' || key.startsWith('snd_')) sound?.setVolume(settings);
  if (!key || key === 'minimap') $('minimap').classList.toggle('hidden', !settings.minimap);
  if (!key || key === 'showNames') for (const r of remotes.values()) r.label.visible = settings.showNames;
  if (!key || key === 'muted') $('btn-mute').innerHTML = icon(settings.muted ? 'volume-x' : 'volume-2');
  $('btn-mute').classList.toggle('off', settings.muted);
  // taille et éléments du HUD (zoom du conteneur : les éléments restent collés à leurs bords)
  if (!key || key === 'hudScale') $('hud').style.zoom = String(settings.hudScale || 1);
  if (!key || key === 'showInstruments') $('flightdeck').style.display = settings.showInstruments ? '' : 'none';
  if (!key || key === 'showSystems') $('systems').style.display = settings.showSystems ? '' : 'none';
  if (!key || key === 'showToolbar') $('toolbar').style.display = settings.showToolbar ? '' : 'none';
}

// ================= Sauvegarde =================
const SAVE_KEY = 'jpairlines-save';
let save = { name: '', money: 0, completed: [], lastAirport: 'alpha', visited: ['alpha'], aircraft: 'cub' };
try { Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY)) || {}); } catch { /* sauvegarde absente */ }
if (!airportById(save.lastAirport)) save.lastAirport = 'alpha';
if (!Array.isArray(save.visited)) save.visited = ['alpha'];
if (!unlockedAircraft(save).some((a) => a.id === save.aircraft)) save.aircraft = 'cub';
const account = new Account(); // compte joueur (facultatif), voir plus bas
const persist = () => {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* stockage indisponible */ }
  account?.pushSave(save); // copie en ligne si l'on est connecté
};

// personnalisation de chaque avion (hangar)
if (!save.liveries || typeof save.liveries !== 'object') save.liveries = {};
const liveryOf = (id) => cleanLivery((save.liveries || {})[id]);

// ================= Joueur =================
const plane = new Plane(save.aircraft);
let planeMesh = createPlaneMesh(plane.type, { landingLight: true, livery: liveryOf(plane.type) });
plane.smokeColor = new THREE.Color(liveryOf(plane.type).smoke);
scene.add(planeMesh);

// ================= Quêtes =================
let quests = null; // créé après le chargement du monde

function updatePrompt() {
  const pr = $('prompt');
  const lines = [];
  if (!plane.crashed) {
    const q = quests ? quests.prompt() : '';
    if (q) lines.push(q);
    if (atAirportStopped() && plane.fuel < plane.S.fuelCapacity - 0.5 && FUEL_SCALE[settings.fuelMode] > 0) {
      const extra = save.money < FUEL_PRICE ? t(", carburant de secours offert jusqu'à {n} L", { n: EMERGENCY_FUEL }) : '';
      lines.push(canRefuel()
        ? t('⛽ Maintiens {key} pour faire le plein : {fuel} / {cap} L ({price} ₣/L{extra})', { key: kbd('refuel'), fuel: Math.round(plane.fuel), cap: plane.S.fuelCapacity, price: FUEL_PRICE, extra })
        : t('⛽ Coupe le moteur ({key}) pour faire le plein', { key: kbd('engine') }));
    }
    if (!lines.length && plane.onGround && !plane.engineOn && plane.engineStart <= 0) {
      lines.push(t('Appuie sur {engine} pour démarrer le moteur · {help} commandes', { engine: kbd('engine'), help: kbd('help') }));
    } else if (!lines.length && plane.onGround && plane.parkingBrake && plane.throttle > 0.2) {
      lines.push(t('Le frein de parking est serré : appuie sur {key}', { key: kbd('parking') }));
    }
  }
  const html = lines.join('<br>');
  if (pr.innerHTML !== html) pr.innerHTML = html;
  pr.classList.toggle('hidden', !html);
}

function nearestPlaceName(x, z) {
  let best = null, bd = Infinity;
  for (const p of [...AIRPORTS, ...LANDMARKS, ...CITIES, ...TOWNS]) {
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < bd) { bd = d; best = p; }
  }
  return bd < 4000 ? best.name : `${Math.round(x / 1000)} km, ${Math.round(z / 1000)} km`;
}

// ================= Messages / son =================
let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}
function logMsg(msg) {
  const box = $('log');
  const d = document.createElement('div');
  d.textContent = msg;
  box.appendChild(d);
  while (box.children.length > 5) box.firstChild.remove();
  setTimeout(() => { d.style.opacity = 0; setTimeout(() => d.remove(), 1000); }, 4000);
}

// sons : créés au premier clic (les navigateurs l'exigent)
let sound = null;
function initAudio() {
  try { sound = new SoundEngine(); sound.setVolume(settings); } catch { sound = null; }
}
function beep(freq, dur, vol = 0.15) { sound?.beep(freq, dur, vol); }

// ================= Entrées =================
const keys = new Set();
const rig = new CameraRig(camera);
const orbit = rig.orbit;
let paused = false;
let started = false;

const OVERLAYS = ['journal', 'pause', 'help', 'bigmap', 'board'];
const overlayOpen = () => OVERLAYS.some((id) => !$(id).classList.contains('hidden'));
function closeOverlays() {
  for (const id of OVERLAYS) $(id).classList.add('hidden');
  paused = false;
}

addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  // choix d'une nouvelle touche dans l'onglet « Touches »
  if (capturing) {
    e.preventDefault();
    if (k !== 'escape') {
      const taken = bindKey(capturing, k);
      if (taken.length) toast(t('{key} retirée de : {list}', { key: keyName(k), list: taken.map((l) => t(l)).join(', ') }));
    }
    capturing = null;
    renderKeys();
    return;
  }
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (hg.busy) return;
  if (hg.active) { if (k === 'escape') exitHangar(false); return; }
  if (k.startsWith('arrow') || k === ' ' || k === 'enter' || k === 'tab') e.preventDefault();
  keys.add(k);
  if (e.repeat || !started) return;
  if (k === 'escape') {
    if (overlayOpen()) closeOverlays();
    else openPause();
    return;
  }
  const is = (id) => isKey(id, k);
  if (is('map')) {
    const nowHidden = $('bigmap').classList.toggle('hidden');
    if (!nowHidden) { mapView.cx = plane.pos.x; mapView.cz = plane.pos.z; drawBigMap(); }
  }
  if (is('journal') && quests) { quests.renderJournal(); $('journal').classList.toggle('hidden'); }
  if (is('help')) $('help').classList.toggle('hidden');
  if (is('hud')) { e.preventDefault(); $('hud').classList.toggle('hud-off'); }
  if (paused) return;
  if (is('chat')) { e.preventDefault(); openChat(); return; }
  if (is('camera')) { rig.next(); toast(t('Caméra : {name}', { name: t(rig.modeName) })); }
  if (is('respawn')) respawn();
  if (is('board') && quests?.canOpenBoard()) quests.openBoard();
  if (is('drop')) quests?.requestDrop();
  if (plane.crashed) return;
  if (is('engine')) plane.toggleEngine();
  if (is('flapsDown')) plane.setFlaps(1);
  if (is('flapsUp')) plane.setFlaps(-1);
  if (is('gear')) plane.toggleGear();
  if (is('parking')) plane.toggleParking();
  if (is('lights')) plane.toggleLights();
  if (is('smoke')) {
    if (!isOwned('smoke')) { toast(t('💨 Achète le fumigène au hangar (onglet Fumigène)')); return; }
    plane.smokeOn = !plane.smokeOn;
    toast(plane.smokeOn ? t('💨 Fumigène allumé (couleur réglable au hangar)') : t('Fumigène coupé'));
  }
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());

const canvas = $('game');
let downAt = null;
canvas.addEventListener('pointerdown', (e) => { orbit.dragging = true; downAt = [e.clientX, e.clientY]; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointerup', (e) => {
  orbit.dragging = false;
  // hangar : un clic (sans glisser) sur l'avion colle l'autocollant choisi
  if (hg.active && hg.placing && downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) < 6) placeSticker(e.clientX, e.clientY);
  downAt = null;
});
canvas.addEventListener('pointermove', (e) => {
  if (!orbit.dragging) return;
  if (hg.active) { hangar.drag(e.movementX, e.movementY); return; }
  orbit.yaw -= e.movementX * 0.006;
  orbit.pitch = THREE.MathUtils.clamp(orbit.pitch - e.movementY * 0.004, -0.6, 1.2);
});
canvas.addEventListener('wheel', (e) => { if (hg.active) { hangar.zoom(e.deltaY > 0 ? 1.1 : 0.9); return; } rig.dist = THREE.MathUtils.clamp(rig.dist * (e.deltaY > 0 ? 1.12 : 0.89), 9, 120); }, { passive: true });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

function readInput() {
  const on = (id) => (keysFor(id).some((k) => keys.has(k)) ? 1 : 0); // touches choisies par le joueur
  let pitch = on('pitchUp') - on('pitchDown');
  if (settings.invertPitch) pitch = -pitch;
  return {
    pitch,
    roll: on('rollRight') - on('rollLeft'),
    yaw: on('yawRight') - on('yawLeft'),
    throttle: on('throttleUp') - on('throttleDown'),
    brake: !!on('brake'),
    trim: on('trimUp') - on('trimDown'),
    refuel: !!on('refuel'),
  };
}

// Carburant : on fait le plein arrêté dans un aéroport, moteur coupé, en payant 1 ₣ le litre.
// Si on n'a pas d'argent, l'aéroport offre du carburant de secours jusqu'à 40 L.
const FUEL_PRICE = 1;
const EMERGENCY_FUEL = 40;
function atAirportStopped() {
  return plane.onGround && plane.speed < 1 && !plane.crashed && !!plane.landedAt;
}
function canRefuel() {
  return atAirportStopped() && !plane.engineOn && plane.engineStart <= 0;
}
let fuelPaid = 0, lastFuelMsg = 0, lastFuelSave = 0;
function doRefuel(dt) {
  const free = save.money < FUEL_PRICE && plane.fuel < EMERGENCY_FUEL;
  if (!free && save.money < FUEL_PRICE) {
    if (performance.now() - lastFuelMsg > 3000) { lastFuelMsg = performance.now(); logMsg(t('Plus assez d\'argent pour le carburant !')); }
    return;
  }
  const before = plane.fuel;
  const added = plane.refuel(dt);
  if (!added) return;
  if (free) {
    plane.fuel = Math.min(plane.fuel, Math.max(before, EMERGENCY_FUEL));
    return;
  }
  fuelPaid += added * FUEL_PRICE;
  const whole = Math.floor(fuelPaid);
  if (whole > 0) {
    save.money = Math.max(0, save.money - whole);
    fuelPaid -= whole;
    if (performance.now() - lastFuelSave > 1000) { lastFuelSave = performance.now(); persist(); }
  }
}

function respawn(airport, teleport = false) {
  const a = airport || airportById(save.lastAirport) || AIRPORTS[0];
  quests?.onRespawn(plane.crashed, teleport);
  const far = plane.pos.distanceTo(new THREE.Vector3(a.x, a.elev, a.z)) > 4000;
  const keepFuel = !plane.crashed && plane.fuel > 0 ? plane.fuel : plane.S.fuelCapacity;
  plane.placeOnRunway(a, DIFFICULTY[settings.difficulty]?.autoEngine);
  plane.fuel = keepFuel;
  rig.reset(plane);
  $('crash').classList.add('hidden');
  if (far) {
    terrain.buildAround(plane.pos.x, plane.pos.z, 3);
    decor.update(plane.pos.x, plane.pos.z, 50);
  }
}

// ================= Barre d'outils (souris / tactile) =================
const press = (key) => { dispatchEvent(new KeyboardEvent('keydown', { key })); dispatchEvent(new KeyboardEvent('keyup', { key })); };
// les boutons déclenchent l'action avec la touche choisie par le joueur (onglet « Touches »), pas une touche fixe
const pressAction = (id) => press(keysFor(id)[0] || ACTIONS.find((a) => a.id === id).def[0]);
$('btn-camera').onclick = () => pressAction('camera');
$('btn-map').onclick = () => pressAction('map');
$('btn-journal').onclick = () => pressAction('journal');
$('btn-pause').onclick = () => openPause();
$('btn-hangar').onclick = () => enterHangar();
$('open-hangar3d').onclick = () => enterHangar();
$('btn-mute').onclick = () => {
  settings.muted = !settings.muted;
  saveSettings();
  applySettings('muted');
  buildSettingsForm($('settings-form'), applySettings);
};
for (const b of document.querySelectorAll('#toolbar button')) b.addEventListener('mousedown', (e) => e.preventDefault());

// ================= Pause / paramètres / voyage =================
function openPause() {
  paused = true;
  $('pause').classList.remove('hidden');
  renderAirportList();
  renderHangar();
  renderRanking();
}
$('resume').onclick = closeOverlays;
for (const b of document.querySelectorAll('.tabs .tab')) {
  b.onclick = () => {
    for (const t of document.querySelectorAll('.tabs .tab')) t.classList.toggle('active', t === b);
    for (const body of document.querySelectorAll('.tab-body')) body.classList.toggle('hidden', body.id !== b.dataset.tab);
  };
}
$('tab-help').innerHTML = $('help-template').innerHTML;
document.querySelector('#help .help-content').innerHTML = $('help-template').innerHTML;

// ================= Touches modifiables =================
let capturing = null; // action en attente d'une nouvelle touche
function helpTable() {
  let html = '';
  for (const a of ACTIONS) {
    if (a.group) { html += `<tr><th colspan="2">${t(a.group)}</th></tr>`; continue; }
    const ks = keysFor(a.id).map((k) => `<kbd>${keyName(k)}</kbd>`).join(' · ') || '—';
    html += `<tr><td>${ks}</td><td>${t(a.label)}</td></tr>`;
  }
  return html + `<tr><td><kbd>${t('Échap')}</kbd></td><td>${t('Pause et paramètres')}</td></tr><tr><td>${t('molette · clic-glisser')}</td><td>${t('Zoom · tourner autour de l\'avion')}</td></tr>`;
}
function renderKeys() {
  for (const t of document.querySelectorAll('.keys-dyn')) t.innerHTML = helpTable();
  const box = $('keys-list');
  box.innerHTML = '';
  for (const a of ACTIONS) {
    if (a.group) { const h = document.createElement('h3'); h.textContent = t(a.group); box.appendChild(h); continue; }
    const row = document.createElement('div');
    row.className = 'keyrow';
    const chips = keysFor(a.id).map((k) => `<button class="keychip" data-k="${encodeURIComponent(k)}" title="${t('Retirer cette touche')}">${keyName(k)} <i>×</i></button>`).join('');
    const wait = capturing === a.id;
    row.innerHTML = `<span>${t(a.label)}</span><div>${chips}<button class="keyadd${wait ? ' wait' : ''}">${wait ? t('Appuie sur une touche… (Échap : annuler)') : t('+ Ajouter')}</button></div>`;
    for (const c of row.querySelectorAll('.keychip')) c.onclick = () => { unbindKey(a.id, decodeURIComponent(c.dataset.k)); renderKeys(); };
    row.querySelector('.keyadd').onclick = (e) => { e.currentTarget.blur(); capturing = capturing === a.id ? null : a.id; renderKeys(); };
    box.appendChild(row);
  }
}
$('keys-reset').onclick = () => { resetKeys(); capturing = null; renderKeys(); toast(t('Touches par défaut rétablies')); };
renderKeys();
document.querySelector('#help .close-help').onclick = () => $('help').classList.add('hidden');
$('open-help').onclick = () => $('help').classList.remove('hidden');
buildSettingsForm($('settings-form'), applySettings);
$('reset-progress').onclick = () => {
  if (!confirm(t('Effacer argent, quêtes et aéroports visités ?'))) return;
  save = { name: save.name, money: 0, completed: [], lastAirport: 'alpha', visited: ['alpha'], aircraft: 'cub' };
  persist();
  quests.reset();
  if (plane.type !== 'cub') setAircraft('cub');
  renderHangar();
  toast(t('Progression effacée'));
};

function renderAirportList() {
  const ul = $('airport-list');
  ul.innerHTML = '';
  for (const a of AIRPORTS) {
    const li = document.createElement('li');
    const known = save.visited.includes(a.id);
    li.innerHTML = `<span>${known ? '🛬' : '🔒'} <b>${a.name}</b> <small>· ${t(a.label)}, ${a.elev} m</small></span>`;
    if (known) {
      const b = document.createElement('button');
      b.textContent = t('Y aller');
      b.onclick = () => { respawn(a, true); save.lastAirport = a.id; persist(); closeOverlays(); };
      li.appendChild(b);
    }
    ul.appendChild(li);
  }
}

$('abandon').onclick = () => { quests.abandon(); quests.renderJournal(); };
$('board-close').onclick = () => quests.closeBoard();

// ================= Cartes =================
const MAP_RES = 512;
const mapImg = document.createElement('canvas');
function buildMapImage() {
  mapImg.width = MAP_RES; mapImg.height = MAP_RES;
  const ctx = mapImg.getContext('2d');
  const img = ctx.createImageData(MAP_RES, MAP_RES);
  const c = new THREE.Color();
  const px = WORLD.size / MAP_RES;
  for (let y = 0; y < MAP_RES; y++) {
    for (let x = 0; x < MAP_RES; x++) {
      const wx = -HALF + (x + 0.5) * px, wz = -HALF + (y + 0.5) * px;
      const h = terrainHeight(wx, wz);
      const i = (y * MAP_RES + x) * 4;
      img.data[i + 3] = 255;
      if (h < 0.5) {
        const k = Math.min(1, -h / 300);
        img.data[i] = 50 - k * 25; img.data[i + 1] = 125 - k * 45; img.data[i + 2] = 190 - k * 40;
        continue;
      }
      const hx = terrainHeight(wx + px, wz);
      terrainColor(h, Math.abs(hx - h) / px, wx, wz, c).convertLinearToSRGB();
      const shade = THREE.MathUtils.clamp(1 + ((h - hx) / px) * 1.5, 0.6, 1.25);
      img.data[i] = c.r * 255 * shade; img.data[i + 1] = c.g * 255 * shade; img.data[i + 2] = c.b * 255 * shade;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function drawMap(cv, cx, cz, span, full) {
  const ctx = cv.getContext('2d');
  const W = cv.width;
  const s = W / span;
  const toX = (x) => (x - cx) * s + W / 2;
  const toY = (z) => (z - cz) * s + W / 2;
  ctx.fillStyle = '#1f5f96';
  ctx.fillRect(0, 0, W, W);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(mapImg, toX(-HALF), toY(-HALF), WORLD.size * s, WORLD.size * s);

  ctx.font = `bold ${full ? 14 : 11}px system-ui`;
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#000a';
  const text = (t, x, y, color) => { ctx.strokeText(t, x, y); ctx.fillStyle = color; ctx.fillText(t, x, y); };
  for (const a of AIRPORTS) {
    const x = toX(a.x), y = toY(a.z);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-a.heading);
    ctx.fillStyle = save.visited.includes(a.id) ? '#9fe3ff' : '#cfd8df';
    ctx.fillRect(-2, -Math.max(4, (a.length * s) / 2), 4, Math.max(8, a.length * s));
    ctx.restore();
    if (full) text(a.name, x + 7, y + 4, '#9fe3ff');
  }
  if (full) {
    for (const l of LANDMARKS) text('◆ ' + l.name, toX(l.x) - 5, toY(l.z) + 4, '#ffe9b0');
    for (const c of CITIES) text(c.name, toX(c.x) - 20, toY(c.z) - 8, '#ffffff');
    if (span < 45000) for (const t of TOWNS) text('• ' + t.name, toX(t.x) - 4, toY(t.z) + 4, '#e8dcc0');
  }
  quests?.drawMap(ctx, toX, toY, full, span, text);
  for (const r of remotes.values()) {
    ctx.fillStyle = '#ff7ad9';
    ctx.beginPath();
    ctx.arc(toX(r.mesh.position.x), toY(r.mesh.position.z), full ? 4 : 3, 0, Math.PI * 2);
    ctx.fill();
    if (full) text(r.name, toX(r.mesh.position.x) + 6, toY(r.mesh.position.z) + 4, '#ff9ae3');
  }
  // avion du joueur
  ctx.save();
  ctx.translate(toX(plane.pos.x), toY(plane.pos.z));
  ctx.rotate(THREE.MathUtils.degToRad(plane.headingDeg));
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, -8); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.restore();
  if (full) {
    const km = span > 40000 ? 10 : span > 15000 ? 5 : 1;
    ctx.fillStyle = '#fff';
    ctx.fillRect(20, W - 30, km * 1000 * s, 4);
    text(`${km} km`, 20, W - 38, '#fff');
  }
}

const mapView = { cx: 0, cz: 0, span: WORLD.size, drag: null };
const bigCanvas = $('bigmap-canvas');
function drawBigMap() { drawMap(bigCanvas, mapView.cx, mapView.cz, mapView.span, true); }
bigCanvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  mapView.span = THREE.MathUtils.clamp(mapView.span * (e.deltaY > 0 ? 1.2 : 0.83), 3000, WORLD.size * 1.1);
  drawBigMap();
}, { passive: false });
bigCanvas.addEventListener('pointerdown', (e) => { mapView.drag = [e.clientX, e.clientY]; bigCanvas.setPointerCapture(e.pointerId); });
bigCanvas.addEventListener('pointerup', () => { mapView.drag = null; });
bigCanvas.addEventListener('pointermove', (e) => {
  if (!mapView.drag) return;
  const scale = mapView.span / bigCanvas.clientWidth;
  mapView.cx -= (e.clientX - mapView.drag[0]) * scale;
  mapView.cz -= (e.clientY - mapView.drag[1]) * scale;
  mapView.drag = [e.clientX, e.clientY];
  drawBigMap();
});

// ================= Multijoueur =================
const remotes = new Map();
const net = { ws: null, id: null, lastSend: 0, retry: 2000, liveries: new Map() };
// peinture de mon avion envoyée aux autres joueurs (à la connexion et à chaque changement)
function sendLivery() {
  if (net.ws?.readyState === 1) net.ws.send(JSON.stringify({ t: 'livery', l: liveryOf(plane.type) }));
}
const REMOTE_COLORS = [0xffc4a3, 0xb5e3a1, 0xa3c9ff, 0xf7a3d9, 0xfff19c, 0xc2a3ff];

function wsUrl() {
  if (MULTIPLAYER_URL) return MULTIPLAYER_URL;
  if (!location.protocol.startsWith('http')) return null;
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
}

function connect() {
  const url = wsUrl();
  if (!url) return;
  let ws;
  try { ws = new WebSocket(url); } catch { return; }
  net.ws = ws;
  ws.onopen = () => { net.retry = 2000; ws.send(JSON.stringify({ t: 'hello', name: save.name })); sendLivery(); };
  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg.t === 'welcome') {
      net.id = msg.id;
      net.known = null;
      $('chat-lines').textContent = '';
      for (const c of msg.chat || []) chatLine(c.name, c.text, 'old');
      net.liveries = new Map(Object.entries(msg.liveries || {}).map(([k, v]) => [Number(k), v]));
    }
    if (msg.t === 'livery') {
      net.liveries.set(msg.id, msg.l);
      if (remotes.has(msg.id)) removeRemote(msg.id); // recréé avec sa nouvelle peinture
    }
    if (msg.t === 'players') syncRemotes(msg.list);
    if (msg.t === 'chat') {
      chatLine(msg.name, msg.text, msg.id === net.id ? 'me' : '');
      if (msg.id !== net.id) beep(990, 0.05, 0.06);
    }
    if (msg.t === 'chat-info') chatLine('', t(msg.text), 'info');
  };
  ws.onclose = () => {
    net.ws = null;
    for (const id of [...remotes.keys()]) removeRemote(id);
    $('online').textContent = t('Solo (hors ligne)');
    if (chat.open) closeChat();
    setTimeout(connect, net.retry);
    net.retry = Math.min(60000, net.retry * 2);
  };
}

function removeRemote(id) {
  const r = remotes.get(id);
  if (r) scene.remove(r.mesh);
  remotes.delete(id);
}

function syncRemotes(list) {
  // arrivées et départs annoncés dans le chat (pas au premier passage : ce sont les pilotes déjà là)
  const now = new Map(list.filter((p) => p.id !== net.id).map((p) => [p.id, p.name]));
  if (net.known) {
    for (const [id, name] of now) if (!net.known.has(id)) chatLine('', t('{name} a rejoint le ciel', { name }), 'info');
    for (const [id, name] of net.known) if (!now.has(id)) chatLine('', t('{name} a quitté le ciel', { name }), 'info');
  }
  net.known = now;
  const seen = new Set();
  for (const p of list) {
    if (p.id === net.id || !p.p) continue;
    seen.add(p.id);
    let r = remotes.get(p.id);
    const type = AIRCRAFT[p.a | 0]?.id || 'cub';
    if (r && r.type !== type) { removeRemote(p.id); r = null; } // il a changé d'avion
    if (!r) {
      const mesh = createPlaneMesh(type, { color: REMOTE_COLORS[p.id % REMOTE_COLORS.length], livery: net.liveries.get(p.id) });
      const label = makeLabel(p.name, { size: 0.026 });
      label.position.y = 6;
      label.visible = settings.showNames;
      mesh.add(label);
      mesh.position.fromArray(p.p);
      mesh.quaternion.fromArray(p.q);
      scene.add(mesh);
      r = { mesh, label, type, name: p.name, tp: new THREE.Vector3(), tq: new THREE.Quaternion(), st: {} };
      remotes.set(p.id, r);
    }
    r.tp.fromArray(p.p);
    r.tq.fromArray(p.q);
    r.st = { rpm: p.r ?? 0.6, gearPos: p.g ?? 1, flapPos: p.f ?? 0, lights: !!p.l };
    r.smoke = !!p.k;
    r.id = p.id;
  }
  for (const id of [...remotes.keys()]) if (!seen.has(id)) removeRemote(id);
  $('online').textContent = remotes.size ? t('{n} pilotes en ligne', { n: remotes.size + 1 }) : t('{n} pilote en ligne', { n: 1 });
}

// ================= Chat =================
// les messages sont toujours insérés comme du texte (jamais comme du HTML)
const chat = { open: false };
function chatLine(name, text, cls = '') {
  const box = $('chat-lines');
  const d = document.createElement('div');
  d.className = cls;
  if (name) {
    const b = document.createElement('b');
    b.textContent = `${name} :`;
    d.append(b);
  }
  d.append(document.createTextNode(text));
  box.appendChild(d);
  while (box.children.length > 50) box.firstChild.remove();
  box.scrollTop = box.scrollHeight;
  if (!cls.includes('old')) setTimeout(() => d.classList.add('old'), 12000);
}
function openChat() {
  if (!net.ws || net.ws.readyState !== 1) { toast(t('Chat indisponible : pas de connexion au serveur multijoueur')); return; }
  chat.open = true;
  keys.clear(); // sinon une touche de vol enfoncée resterait « bloquée »
  $('chat').classList.add('open');
  $('chat-form').classList.remove('hidden');
  $('chat-input').focus();
}
function closeChat() {
  chat.open = false;
  $('chat').classList.remove('open');
  $('chat-form').classList.add('hidden');
  $('chat-input').blur();
}
$('chat-form').onsubmit = (e) => {
  e.preventDefault();
  const text = $('chat-input').value.trim();
  if (text && net.ws?.readyState === 1) net.ws.send(JSON.stringify({ t: 'chat', text: text.slice(0, 140) }));
  $('chat-input').value = '';
  closeChat();
};
$('chat-input').addEventListener('keydown', (e) => {
  e.stopPropagation(); // les lettres tapées ne pilotent pas l'avion
  if (e.key === 'Escape') { e.preventDefault(); closeChat(); }
});
$('chat-input').addEventListener('blur', () => { if (chat.open) closeChat(); });
$('btn-chat').onclick = () => (chat.open ? closeChat() : openChat());

function netTick(now) {
  if (!net.ws || net.ws.readyState !== 1 || now - net.lastSend < 100) return;
  net.lastSend = now;
  const r2 = (v) => Math.round(v * 100) / 100;
  net.ws.send(JSON.stringify({
    t: 'state',
    p: plane.pos.toArray().map(r2),
    q: plane.quat.toArray().map((v) => Math.round(v * 1e4) / 1e4),
    s: r2(plane.speed), r: r2(plane.rpm), g: r2(plane.gearPos), f: r2(plane.flapPos), l: plane.lights ? 1 : 0, a: aircraftIndex(plane.type), k: plane.smokeOn && !plane.onGround ? 1 : 0,
  }));
}

// ================= HUD =================
const setSys = (id, cls) => { const el = $(id); el.classList.remove('on', 'warn', 'bad'); if (cls) el.classList.add(cls); };
let warnKey = '';

const instruments = new Instruments($('pfd'), $('eis'));
let panelMat = null;
// la planche de bord du cockpit affiche les instruments animés
function attachPanel() {
  panelMat = planeMesh.userData.panel.material;
  panelMat.map = panelMat.emissiveMap = instruments.panelTexture;
  panelMat.needsUpdate = true;
}
attachPanel();

// ================= Hangar : changer d'avion =================
// Le nouvel avion est sorti au dernier aéroport (réservoir plein) ; une quête en cours continue
// si l'on change d'avion arrêté dans un aéroport, sinon elle est annulée (comme un voyage).
// (re)construit le modèle de l'avion du joueur avec sa peinture du hangar
function rebuildPlaneMesh() {
  scene.remove(planeMesh);
  planeMesh.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
  planeMesh = createPlaneMesh(plane.type, { landingLight: true, livery: liveryOf(plane.type) });
  planeMesh.position.copy(plane.pos);
  planeMesh.quaternion.copy(plane.quat);
  scene.add(planeMesh);
  attachPanel();
  plane.smokeColor = new THREE.Color(liveryOf(plane.type).smoke);
  sendLivery();
}
function setAircraft(id) {
  const def = aircraftById(id);
  if (!unlockedAircraft(save).includes(def)) return;
  const here = atAirportStopped() ? plane.landedAt : null;
  plane.setType(def.id);
  rebuildPlaneMesh();
  save.aircraft = def.id;
  persist();
  if (here) {
    plane.placeOnRunway(here, DIFFICULTY[settings.difficulty]?.autoEngine);
    rig.reset(plane);
  } else respawn(undefined, true);
  toast(t('{name} sorti du hangar !', { name: def.name }));
}

function aircraftStats(a) {
  const S = a.specs, p = a.perf;
  const lph = S.fuelFlowIdle + (S.fuelFlowMax - S.fuelFlowIdle) * 0.65;
  return { range: Math.round(((S.fuelCapacity / lph) * p.cruise) / 10) * 10, hours: S.fuelCapacity / lph };
}

function renderHangar() {
  const box = $('hangar-list');
  box.innerHTML = '';
  const unlocked = unlockedAircraft(save);
  for (const a of AIRCRAFT) {
    const open = unlocked.includes(a);
    const cur = plane.type === a.id;
    const st = aircraftStats(a), p = a.perf;
    const bars = [
      [t('Vitesse'), p.vmax / 600], [t('Maniabilité'), Math.min(1, p.roll / 256)], [t('Autonomie'), Math.min(1, st.range / 1650)], [t('Piste courte'), Math.min(1, 128 / p.takeoff)],
    ];
    const quest = a.unlock && quests?.byId.get(a.unlock);
    const card = document.createElement('div');
    card.className = `aircraft${open ? '' : ' locked'}${cur ? ' current' : ''}`;
    card.innerHTML = `
      <div class="ac-head"><span class="ac-swatch" style="background:#${a.color.toString(16).padStart(6, '0')};border-color:#${a.accent.toString(16).padStart(6, '0')}"></span>
        <div><b>${a.name}</b> <small>${t(a.role)}</small><div class="ac-sub">${t(a.engineLabel)} · ${t('{n} places', { n: a.seats })}</div></div></div>
      <p class="ac-desc">${t(a.desc)}</p>
      <div class="ac-bars">${bars.map(([n, v]) => `<div><span>${n}</span><i><em style="width:${Math.round(Math.max(0.06, v) * 100)}%"></em></i></div>`).join('')}</div>
      <div class="ac-specs">${t('Max {vmax} km/h · croisière {cruise} km/h · décroche à {stall} km/h · roulage {takeoff} m · autonomie {range} km ({hours} h)', { vmax: p.vmax, cruise: p.cruise, stall: p.stall, takeoff: p.takeoff, range: st.range, hours: st.hours.toFixed(1) })}</div>
      <div class="ac-action"></div>`;
    const act = card.querySelector('.ac-action');
    if (cur) act.innerHTML = `<span class="ac-cur">${t('✈️ Aux commandes')}</span>`;
    else if (open) {
      const b = document.createElement('button');
      b.textContent = t('Piloter cet avion');
      b.onclick = () => { setAircraft(a.id); closeOverlays(); };
      act.appendChild(b);
    } else act.innerHTML = `<span class="ac-lock">${t('🔒 Débloqué par la quête « {title} »', { title: quest ? t(quest.title) : a.unlock })}</span>`;
    box.appendChild(card);
  }
}

// ================= Missions chronométrées : records et classement en ligne =================
async function recordTime(q, time) {
  save.bestTimes ||= {};
  const prev = save.bestTimes[q.id];
  const record = !prev || time < prev;
  if (record) { save.bestTimes[q.id] = Math.round(time * 10) / 10; persist(); }
  logMsg(`⏱ ${t(q.title)} : ${fmtChrono(time)}${record ? (prev ? t(' — nouveau record perso !') : '') : t(' (record : {time})', { time: fmtChrono(prev) })}`);
  if (!account.loggedIn) {
    setTimeout(() => toast(t('🏆 Connecte-toi (menu principal) pour apparaître au classement en ligne')), 3200);
    return;
  }
  try {
    const r = await account.submitTime(q.id, Math.round(time * 1000));
    setTimeout(() => toast(t('🏆 Classement « {title} » : {place}', { title: t(q.title), place: ordinal(r.rank, r.total) }) + (r.best ? '' : t(' (ton meilleur temps : {time})', { time: fmtChrono(r.ms / 1000) }))), 3200);
  } catch (e) { logMsg(t('Classement indisponible : {msg}', { msg: t(e.message) })); }
}

// top 10 d'une quête, affiché dans l'élément donné
async function showTimes(q, el) {
  let box = el.querySelector('.times');
  if (box) { box.remove(); return; }
  box = document.createElement('div');
  box.className = 'times';
  box.textContent = t('Chargement du classement…');
  el.appendChild(box);
  try {
    const r = await account.times(q.id);
    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const medal = ['🥇', '🥈', '🥉'];
    box.innerHTML = `<b>🏆 ${esc(t(q.title))}</b>`
      + (r.top.length ? `<ol>${r.top.map((t, i) => `<li><span>${medal[i] || `${i + 1}.`} ${esc(t.name)}</span><span>${fmtChrono(t.ms / 1000)}</span></li>`).join('')}</ol>` : `<p>${t('Personne n\'est encore classé : à toi de jouer !')}</p>`)
      + (r.me ? `<small>${t('Toi : {place}', { place: ordinal(r.me.rank, r.total) })} · ${fmtChrono(r.me.ms / 1000)}</small>`
        : `<small>${account.loggedIn ? t('Pas encore de temps enregistré.') : t('Connecte-toi pour être classé.')}${save.bestTimes?.[q.id] ? t(' Record perso : {time}', { time: fmtChrono(save.bestTimes[q.id]) }) : ''}</small>`);
  } catch {
    box.textContent = t('Classement indisponible (serveur injoignable).');
  }
}

// onglet « Classements » de la pause : toutes les missions chronométrées
function renderRanking() {
  const list = $('ranking-list');
  list.innerHTML = '';
  const ranked = (quests?.quests.filter(isRanked) || []).sort((a, b) => !!b.ranked - !!a.ranked); // contre-la-montre d'abord
  for (const q of ranked) {
    const li = document.createElement('li');
    const best = save.bestTimes?.[q.id];
    li.innerHTML = `<div class="rk-head"><b></b><small></small><button class="secondary">${t('🏆 Voir')}</button></div>`;
    li.querySelector('b').textContent = t(q.title);
    li.querySelector('small').textContent = best ? t('record perso {time}', { time: fmtChrono(best) }) : (quests.isDone(q) ? '' : t('pas encore faite'));
    li.querySelector('button').onclick = () => showTimes(q, li);
    list.appendChild(li);
  }
}

// ================= Hangar 3D (personnalisation) =================
// Fondu au noir, le monde est déchargé, logo de chargement, puis on se retrouve dans le hangar.
const hangar = new Hangar(renderer);
const hg = { active: false, busy: false, type: null, tab: 'couleurs', timer: null };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
addEventListener('resize', () => hangar.resize());

async function transition(work) {
  hg.busy = true;
  $('fade').classList.add('on');
  await wait(650);
  $('loading').classList.remove('hidden');
  const t0 = performance.now();
  try { await work(); } finally {
    const rest = 1000 - (performance.now() - t0);
    if (rest > 0) await wait(rest);
    $('loading').classList.add('hidden');
    $('fade').classList.remove('on');
    hg.busy = false;
  }
}

async function enterHangar() {
  if (hg.active || hg.busy || !started || plane.crashed) return;
  closeOverlays();
  if (chat.open) closeChat();
  paused = true;
  keys.clear();
  await transition(async () => {
    hangar.build();
    hangar.resize();
    hg.type = plane.type;
    hangar.setPlane(hg.type, liveryOf(hg.type));
    terrain.unload();
    decor.unload();
    hg.active = true;
    $('hud').classList.add('hidden');
    $('hangar3d').classList.remove('hidden');
    renderHangarUI();
    await nextFrame();
    await nextFrame();
  });
}

async function exitHangar(fly) {
  if (!hg.active || hg.busy) return;
  await transition(async () => {
    hg.active = false;
    $('hangar3d').classList.add('hidden');
    $('hud').classList.remove('hidden');
    if (fly && hg.type !== plane.type && unlockedAircraft(save).includes(aircraftById(hg.type))) setAircraft(hg.type);
    else rebuildPlaneMesh();
    // rechargement du monde autour de l'avion pendant que l'écran est noir
    terrain.buildAround(plane.pos.x, plane.pos.z, 3);
    for (let i = 0; i < 8; i++) {
      terrain.update(plane.pos.x, plane.pos.z, 30);
      decor.update(plane.pos.x, plane.pos.z, 40, 0, camera.position);
      await nextFrame();
    }
    paused = false;
  });
}

// ----- boutique : chaque élément s'achète une fois (argent du jeu) puis sert sur tous les avions -----
const isOwned = (key) => priceOf(key) === 0 || (save.owned || []).includes(key);
// clés à posséder pour une modification de la peinture
function missingFor(patch) {
  const out = [];
  for (const [k, v] of Object.entries(patch)) {
    if (['body', 'accent', 'stripe', 'tips', 'emblemColor', 'smoke'].includes(k) && v) out.push(SWATCHES.includes(v) || v === '#ffffff' ? `color:${v}` : 'custom-color');
    if (k === 'pattern' || k === 'wings' || k === 'finish' || k === 'emblem') out.push(`${k}:${v}`);
    if (k === 'sharkTeeth' && v) out.push('teeth');
    if (k === 'reg' && v) out.push('reg');
    if (k === 'zones') {
      const cur = liveryOf(hg.type).zones;
      for (const [z, c] of Object.entries(v)) if (c && c !== cur[z]) out.push(`zone:${z}`, SWATCHES.includes(c) || c === '#ffffff' ? `color:${c}` : 'custom-color');
    }
    if (k === 'stickers') for (const st of v) out.push(`sticker:${st.k}`, SWATCHES.includes(st.c) || st.c === '#ffffff' ? `color:${st.c}` : 'custom-color');
  }
  return [...new Set(out)].filter((key) => !isOwned(key));
}

// modifie la peinture de l'avion affiché (enregistrée tout de suite, modèle reconstruit un peu après)
function setLivery(patch) {
  const id = hg.type;
  save.liveries ||= {};
  save.liveries[id] = cleanLivery({ ...liveryOf(id), ...patch });
  persist();
  hg.pending = null;
  clearTimeout(hg.timer);
  hg.timer = setTimeout(() => hangar.setPlane(id, liveryOf(id), true), 60);
  renderHangarUI();
}
// choix d'un élément : appliqué s'il est possédé, sinon aperçu sur l'avion + proposition d'achat
function choose(patch, label) {
  const missing = missingFor(patch);
  if (!missing.length) return setLivery(patch);
  hg.pending = { patch, keys: missing, label, price: missing.reduce((n, k) => n + priceOf(k), 0) };
  clearTimeout(hg.timer);
  hg.timer = setTimeout(() => hangar.setPlane(hg.type, cleanLivery({ ...liveryOf(hg.type), ...patch }), true), 60);
  renderHangarUI();
}
function buyPending() {
  const p = hg.pending;
  if (!p || save.money < p.price) return;
  save.money -= p.price;
  save.owned = [...new Set([...(save.owned || []), ...p.keys])];
  const bought = p.keys.find((k) => k.startsWith('sticker:'));
  if (bought) hg.placing = bought.slice(8); // autocollant acheté : on peut le coller tout de suite
  beep(880, 0.12);
  toast(t('🛒 {item} acheté : −{price}', { item: p.label, price: PRICE_LABEL(p.price) }));
  setLivery(p.patch);
}
function cancelPending() {
  hg.pending = null;
  hangar.setPlane(hg.type, liveryOf(hg.type), true);
  renderHangarUI();
}

function renderHangarUI() {
  const def = aircraftById(hg.type);
  const open = unlockedAircraft(save).includes(def);
  const L = liveryOf(hg.type);
  const view = hg.pending ? cleanLivery({ ...L, ...hg.pending.patch }) : L; // ce qu'on voit (aperçu compris)
  $('hg-title').textContent = def.name;
  const quest = def.unlock && quests?.byId.get(def.unlock);
  $('hg-sub').innerHTML = open ? `${t(def.role)} · ${t(def.engineLabel)}` : `<span class="hg-locked">${t('🔒 Débloqué par la quête « {title} »', { title: quest ? t(quest.title) : def.unlock })}</span>`;
  $('hg-money').textContent = `💰 ${PRICE_LABEL(save.money)}`;
  $('hg-fly').textContent = hg.type === plane.type ? t('✈️ Reprendre le vol') : t('✈️ Piloter cet avion');
  $('hg-fly').disabled = !open;
  for (const b of document.querySelectorAll('[data-hg]')) b.classList.toggle('active', b.dataset.hg === hg.tab);
  const body = $('hg-body');
  const buy = $('hg-buy');
  if (hg.pending) {
    const p = hg.pending, ok = save.money >= p.price;
    buy.innerHTML = `<div><b>${p.label}</b> — ${PRICE_LABEL(p.price)}${ok ? '' : `<br><small>${t('Il te manque {price}', { price: PRICE_LABEL(p.price - save.money) })}</small>`}</div>`
      + `<button id="hg-buy-ok" ${ok ? '' : 'disabled'}>${t('Acheter')}</button><button id="hg-buy-no" class="secondary">${t('Annuler')}</button>`;
    buy.classList.remove('hidden');
    $('hg-buy-ok').onclick = buyPending;
    $('hg-buy-no').onclick = cancelPending;
  } else buy.classList.add('hidden');
  if (!open) {
    body.innerHTML = `<p class="sub">${t('Termine la quête indiquée pour débloquer cet avion et le personnaliser.')}</p>`;
    return;
  }
  const hexOf = (n) => `#${n.toString(16).padStart(6, '0')}`;
  const tag = (key) => (isOwned(key) ? '' : `<em class="price">${PRICE_LABEL(priceOf(key))}</em>`);
  const colorRow = (key, label, orig) => `<h4>${label}</h4><div class="hg-sw" data-color="${key}">`
    + (['body', 'accent', 'stripe'].includes(key) ? `<button class="orig${view[key] ? '' : ' on'}" data-v="">${t('D\'origine')}</button>` : '')
    + SWATCHES.map((c) => `<button style="background:${c}" class="${view[key] === c ? 'on' : ''}${isOwned(`color:${c}`) ? '' : ' lock'}" data-v="${c}" title="${isOwned(`color:${c}`) ? c : `${c} · ${PRICE_LABEL(priceOf(`color:${c}`))}`}"></button>`).join('')
    + (isOwned('custom-color') ? `<input type="color" value="${view[key] || orig}" title="${t('Couleur sur mesure')}">` : `<button class="orig custom" title="${t('Débloque toutes les couleurs')}">${t('🎨 Sur mesure')} ${tag('custom-color')}</button>`)
    + '</div>';
  const chips = (key, list, label) => `<h4>${label}</h4><div class="hg-chips" data-chip="${key}">${list.map(([k, n]) => `<button class="${view[key] === k ? 'on' : ''}" data-v="${k}" data-n="${t(n)}">${t(n)}${tag(`${key}:${k}`)}</button>`).join('')}</div>`;
  let html = `<p class="sub shop-note">${t('Chaque élément s\'achète une fois et sert ensuite sur tous tes avions. Clique pour l\'essayer.')}</p>`;
  if (hg.tab === 'couleurs') {
    html += colorRow('body', t('Couleur principale'), hexOf(def.color)) + colorRow('accent', t('Couleur secondaire'), hexOf(def.accent))
      + colorRow('stripe', t('Couleur des filets'), hexOf(def.acc2 ?? 0x1d3f7a)) + colorRow('tips', t('Bouts d\'hélice'), L.tips);
  } else if (hg.tab === 'zones') {
    hg.zone ||= 'top';
    html += `<p class="sub">${t('Peins une partie de l\'avion d\'une couleur à part, par-dessus le motif. Chaque zone se débloque une fois.')}</p>`
      + `<div class="hg-chips" id="hg-zones">${ZONES.map(([k, n]) => `<button class="${hg.zone === k ? 'on' : ''}" data-z="${k}"><i class="dot" style="background:${view.zones[k] || 'transparent'}"></i>${t(n)}${tag(`zone:${k}`)}</button>`).join('')}</div>`
      + colorRow(`zone:${hg.zone}`, t('Couleur : {zone}', { zone: t(ZONES.find(([k]) => k === hg.zone)[1]) }), view.zones[hg.zone] || '#ffffff')
      + `<div class="hg-chips"><button id="hg-zone-clear" class="secondary">${t('↺ Suivre le motif (enlever la couleur de zone)')}</button></div>`;
  } else if (hg.tab === 'stickers') {
    hg.stickerColor ||= '#c8261e';
    const list = view.stickers;
    html += `<p class="sub">${t('Choisis un autocollant puis clique sur l\'avion pour le coller où tu veux. Achat une fois, collage illimité ({max} par avion).', { max: MAX_STICKERS })}</p>`
      + (hg.placing ? `<div class="hg-place"><b>${t('🖱 Clique sur l\'avion pour coller : {name}', { name: t(STICKERS.find(([k]) => k === hg.placing)[1]) })}</b><button id="hg-place-done" class="secondary">${t('Terminé')}</button></div>` : '')
      + `<div class="hg-stickers">${STICKERS.map(([k, n]) => `<button class="${hg.placing === k ? 'on' : ''}" data-st="${k}" title="${t(n)}"><img src="${stickerThumb(k, hg.stickerColor, k === 'texte' ? (hg.stickerText || 'JP') : '')}" alt=""><span>${t(n)}</span>${tag(`sticker:${k}`)}</button>`).join('')}</div>`
      + `<h4>${t('Texte (autocollant « Texte personnalisé »)')}</h4><input type="text" id="hg-st-text" maxlength="12" value="${hg.stickerText || ''}" placeholder="JP AIRLINES">`
      + colorRow('stickerColor', t('Couleur des prochains autocollants'), hg.stickerColor)
      + `<h4>${t('Taille et symétrie des prochains')}</h4><div class="hg-row"><input type="range" id="hg-st-size" min="0.15" max="3" step="0.05" value="${hg.stickerSize || 0.6}"><label><input type="checkbox" id="hg-st-mirror" ${hg.stickerMirror ? 'checked' : ''}> ${t('Des deux côtés')}</label></div>`
      + `<h4>${t('Autocollants posés ({n}/{max})', { n: list.length, max: MAX_STICKERS })}</h4>`
      + (list.length ? `<div class="hg-placed">${list.map((st, i) => `<div class="hg-st-item" data-i="${i}"><img src="${stickerThumb(st.k, st.c, st.t)}" alt=""><div>
          <label>${t('Taille')} <input type="range" data-f="s" min="0.15" max="3" step="0.05" value="${st.s}"></label>
          <label>${t('Rotation')} <input type="range" data-f="r" min="-180" max="180" step="5" value="${st.r}"></label>
          <label><input type="checkbox" data-f="m" ${st.m ? 'checked' : ''}> ${t('Des deux côtés')}</label></div>
          <button class="secondary" data-del="${i}" title="${t('Enlever')}">✕</button></div>`).join('')}</div>` : `<p class="sub">${t('Aucun autocollant pour l\'instant.')}</p>`);
  } else if (hg.tab === 'motifs') {
    html += chips('pattern', PATTERNS, t('Motif du fuselage')) + chips('wings', WINGS, t('Ailes')) + chips('finish', FINISHES, t('Finition de la peinture'))
      + `<h4>${t('Nez')}</h4><div class="hg-chips"><button id="hg-teeth" class="${view.sharkTeeth ? 'on' : ''}">${t('🦈 Dents de requin')}${tag('teeth')}</button></div>`;
  } else if (hg.tab === 'deco') {
    html += `<h4>${t('Immatriculation (7 caractères max)')} ${tag('reg')}</h4><input type="text" id="hg-reg" maxlength="7" placeholder="F-JP${def.id.slice(0, 2).toUpperCase()}" value="${view.reg}">`
      + chips('emblem', EMBLEMS, t('Emblème sur la dérive')) + colorRow('emblemColor', t('Couleur de l\'emblème'), L.emblemColor)
      + (view.emblem === 'numero' ? `<h4>${t('Numéro de course')}</h4><input type="number" id="hg-num" min="0" max="99" value="${view.number}">` : '');
  } else {
    html += isOwned('smoke')
      ? colorRow('smoke', t('Couleur du fumigène'), L.smoke) + `<p class="sub">${t('En vol, appuie sur {key} pour allumer ou couper le fumigène et dessiner dans le ciel.', { key: kbd('smoke') })}</p>`
      : `<h4>${t('Fumigène de voltige')}</h4><p class="sub">${t('Dessine dans le ciel avec une traînée de fumée colorée (touche {key} en vol).', { key: kbd('smoke') })}</p>
         <div class="hg-chips"><button id="hg-smoke">${t('💨 Installer le fumigène')}${tag('smoke')}</button></div>`;
  }
  body.innerHTML = html;
  for (const row of body.querySelectorAll('[data-color]')) {
    const key = row.dataset.color;
    const patchFor = (v) => (key.startsWith('zone:') ? { zones: { ...view.zones, [key.slice(5)]: v || undefined } }
      : key === 'stickerColor' ? null : { [key]: v || null });
    for (const b of row.querySelectorAll('button:not(.custom)')) {
      b.onclick = () => {
        const v = b.dataset.v;
        if (key === 'stickerColor') { // couleur des prochains autocollants (à posséder)
          if (!isOwned(`color:${v}`)) { hg.pending = { patch: {}, keys: [`color:${v}`], label: t('Couleur {color}', { color: v }), price: priceOf(`color:${v}`) }; }
          hg.stickerColor = v;
          renderHangarUI();
          return;
        }
        choose(patchFor(v), t('Couleur {color}', { color: v }));
      };
    }
    for (const b of row.querySelectorAll('.custom')) b.onclick = () => { hg.pending = { patch: {}, keys: ['custom-color'], label: t('Couleurs sur mesure'), price: priceOf('custom-color') }; renderHangarUI(); };
    const inp = row.querySelector('input');
    if (!inp) continue;
    inp.oninput = () => {
      if (key === 'stickerColor') { hg.stickerColor = inp.value; return; }
      save.liveries ||= {};
      save.liveries[hg.type] = cleanLivery({ ...liveryOf(hg.type), ...patchFor(inp.value) });
      persist();
      clearTimeout(hg.timer);
      hg.timer = setTimeout(() => hangar.setPlane(hg.type, liveryOf(hg.type), true), 120);
    };
    inp.onchange = () => renderHangarUI();
  }
  for (const row of body.querySelectorAll('[data-chip]')) for (const b of row.querySelectorAll('button')) b.onclick = () => choose({ [row.dataset.chip]: b.dataset.v }, b.dataset.n);
  if ($('hg-teeth')) $('hg-teeth').onclick = () => choose({ sharkTeeth: !view.sharkTeeth }, t('Dents de requin'));
  if ($('hg-reg')) $('hg-reg').onchange = () => choose({ reg: $('hg-reg').value }, t('Immatriculation personnalisée'));
  if ($('hg-num')) $('hg-num').onchange = () => choose({ number: Math.round(Number($('hg-num').value)) || 0 }, t('Numéro de course'));
  // zones
  for (const b of body.querySelectorAll('[data-z]')) b.onclick = () => { hg.zone = b.dataset.z; renderHangarUI(); };
  if ($('hg-zone-clear')) $('hg-zone-clear').onclick = () => { const z = { ...view.zones }; delete z[hg.zone]; setLivery({ zones: z }); };
  // autocollants
  hangar.view.autoSpin = hg.tab !== 'stickers' && hangar.view.autoSpin;
  for (const b of body.querySelectorAll('[data-st]')) {
    b.onclick = () => {
      const k = b.dataset.st;
      if (!isOwned(`sticker:${k}`)) { hg.pending = { patch: {}, keys: [`sticker:${k}`], label: t(STICKERS.find(([x]) => x === k)[1]), price: priceOf(`sticker:${k}`) }; hg.placing = null; }
      else hg.placing = hg.placing === k ? null : k;
      renderHangarUI();
    };
  }
  if ($('hg-place-done')) $('hg-place-done').onclick = () => { hg.placing = null; renderHangarUI(); };
  if ($('hg-st-text')) $('hg-st-text').onchange = () => { hg.stickerText = cleanStickerText($('hg-st-text').value); renderHangarUI(); };
  if ($('hg-st-size')) $('hg-st-size').oninput = () => { hg.stickerSize = Number($('hg-st-size').value); };
  if ($('hg-st-mirror')) $('hg-st-mirror').onchange = () => { hg.stickerMirror = $('hg-st-mirror').checked; };
  for (const item of body.querySelectorAll('.hg-st-item')) {
    const i = Number(item.dataset.i);
    for (const inp of item.querySelectorAll('[data-f]')) {
      const apply = (final) => {
        const list = liveryOf(hg.type).stickers.map((x) => ({ ...x }));
        if (!list[i]) return;
        list[i][inp.dataset.f] = inp.type === 'checkbox' ? inp.checked : Number(inp.value);
        save.liveries[hg.type] = cleanLivery({ ...liveryOf(hg.type), stickers: list });
        persist();
        clearTimeout(hg.timer);
        hg.timer = setTimeout(() => hangar.setPlane(hg.type, liveryOf(hg.type), true), final ? 0 : 90);
      };
      inp.oninput = () => apply(false);
      inp.onchange = () => apply(true);
    }
  }
  for (const b of body.querySelectorAll('[data-del]')) b.onclick = () => { const list = liveryOf(hg.type).stickers.filter((_, j) => j !== Number(b.dataset.del)); setLivery({ stickers: list }); };
  if ($('hg-smoke')) $('hg-smoke').onclick = () => { hg.pending = { patch: {}, keys: ['smoke'], label: t('Fumigène de voltige'), price: priceOf('smoke') }; renderHangarUI(); };
}

function placeSticker(x, y) {
  const L = liveryOf(hg.type);
  if (L.stickers.length >= MAX_STICKERS) { toast(t('Maximum {max} autocollants par avion', { max: MAX_STICKERS })); return; }
  if (!isOwned(`color:${hg.stickerColor}`) && !isOwned('custom-color')) { toast(t('Achète d\'abord cette couleur')); return; }
  const hit = hangar.pick(x, y);
  if (!hit) return;
  const st = { k: hg.placing, p: hit.p.toArray(), n: hit.n.toArray(), s: hg.stickerSize || 0.6, r: 0, c: hg.stickerColor, m: !!hg.stickerMirror };
  if (st.k === 'texte') st.t = hg.stickerText || 'JP';
  beep(700, 0.05);
  setLivery({ stickers: [...L.stickers, st] });
}
for (const b of document.querySelectorAll('[data-hg]')) b.onclick = () => { hg.tab = b.dataset.hg; hg.placing = null; renderHangarUI(); };
const cycleAircraft = (d) => {
  const i = AIRCRAFT.findIndex((a) => a.id === hg.type);
  hg.type = AIRCRAFT[(i + d + AIRCRAFT.length) % AIRCRAFT.length].id;
  hg.pending = null;
  hangar.setPlane(hg.type, liveryOf(hg.type));
  renderHangarUI();
};
$('hg-prev').onclick = () => cycleAircraft(-1);
$('hg-next').onclick = () => cycleAircraft(1);
$('hg-fly').onclick = () => { hg.pending = null; exitHangar(true); };
$('hg-exit').onclick = () => { hg.pending = null; exitHangar(false); };
$('hg-reset').onclick = () => { if (save.liveries) delete save.liveries[hg.type]; hg.pending = null; persist(); hangar.setPlane(hg.type, liveryOf(hg.type), true); renderHangarUI(); };
// au hasard : seulement parmi ce que le joueur possède déjà
$('hg-random').onclick = () => {
  const r = (list) => list[Math.floor(Math.random() * list.length)];
  const colors = SWATCHES.filter((c) => isOwned(`color:${c}`));
  const opts = (key, list) => list.map(([k]) => k).filter((k) => isOwned(`${key}:${k}`));
  setLivery({
    body: r(colors), accent: r(colors), stripe: r(colors), tips: r(colors), pattern: r(opts('pattern', PATTERNS)), wings: r(opts('wings', WINGS)),
    finish: r(opts('finish', FINISHES)), emblem: r(opts('emblem', EMBLEMS)), emblemColor: r(colors), number: Math.floor(Math.random() * 100),
    sharkTeeth: isOwned('teeth') && Math.random() < 0.3,
  });
};

function updateHUD(dt) {
  const ground = Math.max(0, groundHeight(plane.pos.x, plane.pos.z));
  const agl = Math.max(0, plane.pos.y - ground - plane.S.gear);
  instruments.update(dt, plane, settings.units, inCockpit, agl);
  panelMat.emissiveIntensity = 0.15 + gfx.atmo.night * 0.55; // éclairage de la planche de bord la nuit
  $('money').textContent = `${save.money} ₣`;
  $('cam-name').textContent = t(rig.modeName);

  setSys('sys-engine', plane.engineOn ? 'on' : plane.engineStart > 0 ? 'warn' : null);
  const gear = document.querySelector('#sys-gear .gear');
  gear.className = 'gear ' + (plane.gearBroken ? 'moving' : plane.gearPos > 0.99 ? 'down' : plane.gearPos < 0.01 ? 'up' : 'moving');
  $('flaps-val').textContent = `${Math.round(plane.flapDeg)}°`;
  setSys('sys-brake', plane.brake ? 'warn' : null);
  setSys('sys-park', plane.parkingBrake ? 'bad' : null);
  setSys('sys-lights', plane.lights ? 'on' : null);

  // alarmes
  const w = [];
  if (!plane.onGround && !plane.crashed) {
    if (plane.stallWarning) w.push([t('DÉCROCHAGE'), '']);
    const overWater = ground <= 0;
    if (plane.gearPos < 0.95 && agl < 150 && plane.throttle < 0.4 && plane.velocity.y < 0 && !(plane.S.amphibious && overWater)) w.push([t('TRAIN !'), '']);
    // hydravion : se poser sur l'eau roues sorties le ferait capoter
    if (plane.S.amphibious && overWater && plane.gearPos > 0.05 && agl < 150 && plane.velocity.y < 0) w.push([t('TRAIN SORTI : EAU !'), '']);
    if (plane.gearPos > 0.3 && plane.ias > plane.S.vGear) w.push([t('VITESSE TRAIN'), 'amber']);
    if (plane.ias > plane.S.vne) w.push([t('SURVITESSE'), '']);
    if (Math.abs(plane.gLoad) > 4) w.push([`${plane.gLoad.toFixed(1)} G`, 'amber']);
    if (agl < 60 && plane.velocity.y < -8) w.push([t('TERRAIN'), '']);
  }
  if (plane.flapPos > 0.2 && plane.ias > plane.S.vFlaps) w.push([t('VITESSE VOLETS'), 'amber']);
  if (FUEL_SCALE[settings.fuelMode] > 0 && plane.fuel < plane.S.fuelCapacity * 0.15) w.push([t('CARBURANT'), plane.fuel < plane.S.fuelCapacity * 0.05 ? '' : 'amber']);
  const key = w.map((x) => x[0]).join();
  if (key !== warnKey) {
    warnKey = key;
    $('warnings').innerHTML = w.map(([txt, c]) => `<span class="${c}">${txt}</span>`).join('');
  }
}

function updateWeatherChip() {
  const w = gfx.weather;
  const night = gfx.atmo.night > 0.6;
  const ic = w.target === 'rain' || w.target === 'storm' ? 'cloud-rain' : night ? 'moon' : w.target === 'fog' ? 'wind' : 'sun';
  $('weather-chip').innerHTML = `${icon(ic, 15)}<b>${t(w.name)} · ${String(Math.floor(gfx.atmo.hour)).padStart(2, '0')} h ${String(Math.floor((gfx.atmo.hour % 1) * 60)).padStart(2, '0')}</b>`;
}

function updatePlace() {
  const a = AIRPORTS.find((x) => Math.hypot(x.x - plane.pos.x, x.z - plane.pos.z) < 3000);
  $('place').textContent = a ? a.name : nearestPlaceName(plane.pos.x, plane.pos.z);
}

// ================= Boucle =================
let last = performance.now();
let mapTimer = 0, labelTimer = 0, placeTimer = 0;

function simulate(dt) {
  const input = readInput();
  plane.trim = THREE.MathUtils.clamp(plane.trim + input.trim * dt * 0.25, -0.5, 0.5);
  plane.update(dt, input, { difficulty: settings.difficulty, fuelScale: FUEL_SCALE[settings.fuelMode] ?? 4, sensitivity: settings.sensitivity });
  if (input.refuel && canRefuel()) doRefuel(dt);
  // limite de la carte : on renvoie l'avion vers le centre
  const lim = HALF * 0.97;
  if (Math.abs(plane.pos.x) > lim || Math.abs(plane.pos.z) > lim) {
    plane.pos.x = THREE.MathUtils.clamp(plane.pos.x, -lim, lim);
    plane.pos.z = THREE.MathUtils.clamp(plane.pos.z, -lim, lim);
    plane.rotateHeading(Math.PI * dt);
    toast(t('Limite de la carte — fais demi-tour !'));
  }
}

let fpsTimer = 0, inCockpit = false;

// vibrations ressenties : moteur et roulage au sol, alarme de décrochage (tremblement), survitesse, turbulence
function shakeAmount() {
  if (plane.crashed) return 0;
  const w = gfx.weatherState;
  let s = 0;
  if (plane.onGround) s += plane.rpm * 0.25 + Math.min(1, plane.speed / 30) * 0.5;
  else s += plane.rpm * 0.08;
  if (plane.stallWarning) s += 0.9;
  if (plane.ias > plane.S.vne * 0.85) s += (plane.ias - plane.S.vne * 0.85) / (plane.S.vne * 0.15);
  if (!plane.onGround && w) s += w.storm * 0.5 + w.rain * 0.15;
  return Math.min(1.5, s);
}

function handleFxEvents(events) {
  for (const e of events) {
    if (e.type === 'touchdown') { rig.kick(0.25 + e.strength * 0.5); sound?.touchdown(e.strength); }
    if (e.type === 'crash') { rig.kick(1.5); sound?.crash(); }
    if (e.type === 'thunder') sound?.thunder(e.delay, e.strength);
  }
}
function frame(now) {
  requestAnimationFrame(frame);
  const rawDt = (now - last) / 1000;
  const realDt = Math.min(0.05, rawDt);
  last = now;
  const wallT = Date.now() / 1000; // horloge commune : bateaux et montgolfières identiques pour tous

  // hangar : le monde est déchargé, on n'affiche que la scène du hangar
  if (hg.active) {
    hangar.update(realDt);
    renderer.toneMappingExposure = 1;
    hangar.render();
    return;
  }

  if (started) {
    if (!paused && !plane.crashed) {
      const steps = Number(settings.timeScale) || 1;
      for (let i = 0; i < steps && !plane.crashed; i++) simulate(realDt);
      quests.update(realDt * steps, wallT);
      if (plane.crashed) {
        $('crash-reason').textContent = plane.crashReason;
        $('crash').classList.remove('hidden');
        beep(110, 0.6, 0.3);
        quests.onCrash();
      }
    } else quests.update(0, wallT);
    while (plane.events.length) logMsg(plane.events.shift());
    if (plane.landedAt && (save.lastAirport !== plane.landedAt.id || !save.visited.includes(plane.landedAt.id))) {
      save.lastAirport = plane.landedAt.id;
      if (!save.visited.includes(plane.landedAt.id)) {
        save.visited.push(plane.landedAt.id);
        toast(t('Nouvel aéroport découvert : {name}', { name: plane.landedAt.name }));
      }
      persist();
    }

    planeMesh.position.copy(plane.pos);
    planeMesh.quaternion.copy(plane.quat);
    animatePlaneMesh(planeMesh, { ...plane.ctrl, rpm: plane.rpm, gearPos: plane.gearPos, flapPos: plane.flapPos, lights: plane.lights, night: gfx.atmo.night }, realDt, wallT);

    updatePrompt();
    inCockpit = rig.update(realDt, plane, planeMesh, { motion: gfx.cfg.motionFx, shake: shakeAmount() });
    updateHUD(realDt);
    netTick(now);

    mapTimer -= realDt;
    if (mapTimer <= 0) {
      mapTimer = 0.1;
      if (settings.minimap) drawMap($('minimap'), plane.pos.x, plane.pos.z, 8000, false);
      if (!$('bigmap').classList.contains('hidden')) drawBigMap();
    }
    placeTimer -= realDt;
    if (placeTimer <= 0) { placeTimer = 1; updatePlace(); updateWeatherChip(); }

    sound?.update(realDt, plane, inCockpit ? 'cockpit' : 'outside', camera.position.distanceTo(plane.pos), gfx.weatherState, paused);
  } else {
    const t = (now / 1000) * 0.04;
    const a = airportById(save.lastAirport) || AIRPORTS[0];
    camera.position.set(a.x + Math.sin(t) * 2500, a.elev + 700, a.z + Math.cos(t) * 2500);
    camera.lookAt(a.x, a.elev + 100, a.z);
  }

  terrain.update(plane.pos.x, plane.pos.z, started ? 5 : 12);
  decor.update(plane.pos.x, plane.pos.z, started ? 3 : 8, realDt, camera.position);
  labelTimer -= realDt;
  if (labelTimer <= 0) { labelTimer = 0.5; updateLabels(camera.position); }
  world.update(realDt, wallT);
  gfx.update(realDt, wallT, settings, started ? plane.pos : camera.position);
  if (started) handleFxEvents(gfx.updateEffects(paused ? 0 : realDt, plane, planeMesh));

  // autres joueurs : interpolation douce
  const k = 1 - Math.exp(-realDt * 8);
  for (const r of remotes.values()) {
    r.mesh.position.lerp(r.tp, k);
    r.mesh.quaternion.slerp(r.tq, k);
    animatePlaneMesh(r.mesh, r.st, realDt, wallT);
    // fumigène des autres pilotes, dans la couleur de leur peinture
    if (r.smoke && realDt > 0) {
      r.smokeAcc = (r.smokeAcc || 0) + realDt * 45;
      const col = (r.smokeCol ||= new THREE.Color(net.liveries.get(r.id)?.smoke || '#ffffff'));
      while (r.smokeAcc > 1) {
        r.smokeAcc--;
        const at = r.mesh.localToWorld(r.mesh.userData.exhaust.clone());
        gfx.effects.smoke.emit(at, new THREE.Vector3((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6), { life: 9, size: 1.1, grow: 5, color: col, alpha: 0.75, drag: 1.2, rise: 0.15 });
      }
    }
  }

  gfx.render(rawDt, {
    speed: started ? THREE.MathUtils.clamp((plane.ias - 62) / 30, 0, 1) : 0,
    rain: inCockpit ? Math.min(1, gfx.weatherState.rain) : 0,
    flash: gfx.effects.flash,
  });
  fpsTimer -= rawDt;
  if (settings.showFps && fpsTimer <= 0) {
    fpsTimer = 0.5;
    $('fps').textContent = `${Math.round(gfx.fps)} FPS · ${Math.round(renderer.getPixelRatio() * 100)} %`;
  }
}


// ================= Compte joueur =================
// facultatif : e-mail + mot de passe ou Google ; la progression est fusionnée puis sauvegardée en ligne
let accMode = 'login';
function showAccount(user) {
  $('acc-out').classList.toggle('hidden', !!user);
  $('acc-in').classList.toggle('hidden', !user);
  if (!user) return;
  $('acc-name').textContent = user.name;
  $('acc-mail').textContent = user.email + (user.google ? ' · Google' : '');
  $('acc-avatar').textContent = (user.name || '?')[0].toUpperCase();
}
// après connexion : fusion avec la progression locale (rien n'est perdu), puis envoi au serveur
function adoptAccount(user) {
  const before = save.aircraft;
  save = mergeSaves(save, user.save);
  save.name = user.name || save.name;
  $('pilot-name').value = save.name;
  if (!airportById(save.lastAirport)) save.lastAirport = 'alpha';
  if (!unlockedAircraft(save).some((a) => a.id === save.aircraft)) save.aircraft = 'cub';
  persist();
  account.flush();
  quests?.reset();
  if (save.aircraft !== before && plane.type !== save.aircraft) setAircraft(save.aircraft);
}
account.onChange = showAccount;
const accMsg = (t, ok = false) => { $('acc-msg').textContent = t; $('acc-msg').classList.toggle('ok', ok); };
for (const b of document.querySelectorAll('[data-acc]')) {
  b.onclick = () => {
    accMode = b.dataset.acc;
    for (const t of document.querySelectorAll('[data-acc]')) t.classList.toggle('active', t === b);
    $('acc-submit').textContent = accMode === 'login' ? t('Se connecter') : t('Créer mon compte');
    $('acc-pass').autocomplete = accMode === 'login' ? 'current-password' : 'new-password';
    $('acc-pass').placeholder = accMode === 'login' ? t('Mot de passe') : t('Mot de passe (8 caractères minimum)');
    accMsg('');
  };
}
$('acc-form').onsubmit = async (e) => {
  e.preventDefault();
  const email = $('acc-email').value.trim(), pass = $('acc-pass').value;
  if (!email || !pass) return accMsg(t('Entre ton e-mail et ton mot de passe.'));
  $('acc-submit').disabled = true;
  accMsg('');
  try {
    const name = ($('pilot-name').value.trim() || save.name || t('Pilote')).slice(0, 16);
    const user = accMode === 'login' ? await account.login(email, pass) : await account.register(email, pass, name, save);
    $('acc-pass').value = '';
    adoptAccount(user);
    toast(accMode === 'login' ? t('Bon retour, {name} !', { name: user.name }) : t('Compte créé : ta progression est sauvegardée.'));
  } catch (err) { accMsg(t(err.message)); }
  $('acc-submit').disabled = false;
};
$('acc-logout').onclick = async () => { await account.logout(); toast(t('Déconnecté : la progression reste aussi sur cet appareil.')); };
account.config().then((cfg) => {
  const ok = mountGoogleButton($('acc-google'), cfg.google, account.base);
  $('acc-or').classList.toggle('hidden', !ok);
});
// retour de la connexion Google (redirection)
const back = takeRedirectToken();
const GOOGLE_ERRORS = { 'google-refuse': 'Connexion Google refusée.', 'google-non-configure': 'Connexion Google non configurée sur le serveur.', 'trop-de-tentatives': 'Trop de tentatives, réessaie dans une minute.' };
if (back?.token) account.useToken(back.token);
if (back?.error) accMsg(t(GOOGLE_ERRORS[back.error] || 'Connexion Google impossible.'));
account.restore().then((user) => {
  if (!user) return;
  adoptAccount(user);
  if (back?.token) toast(t('Connecté avec Google : bienvenue, {name} !', { name: user.name }));
});
addEventListener('pagehide', () => account.flush());

// ================= Démarrage =================
$('pilot-name').value = save.name;
const tick = () => new Promise((res) => setTimeout(res, 20));
(async () => {
  applySettings();
  status(t('Construction du terrain…'), 15);
  await tick();
  const a = airportById(save.lastAirport) || AIRPORTS[0];
  plane.placeOnRunway(a);
  terrain.buildAround(a.x, a.z, 4);
  status(t('Aéroports, villes et monuments…'), 45);
  await tick();
  world = buildWorldObjects(scene);
  status(t('Arbres, maisons et rochers…'), 55);
  await tick();
  try {
    const [trees, rocks] = await Promise.all([new TreeLibrary().build(renderer), new RockLibrary().load()]);
    decor.setLibraries({ trees, rocks, houses: new HouseLibrary() }, new NearTrees(scene, trees));
  } catch (e) { console.warn('Décor détaillé indisponible', e); }
  status(t('Ciel et nuages…'), 70);
  await tick();
  gfx.buildClouds();
  applySettings('clouds');
  quests = new QuestSystem({
    scene, plane, getSave: () => save, persist, toast, beep, logMsg,
    setPaused: (v) => { paused = v; },
    // une quête terminée peut débloquer un avion
    onQuestDone: (q, res) => {
      const a = AIRCRAFT.find((x) => x.unlock === q.id);
      if (a && !res.replay) setTimeout(() => toast(t('🔓 Nouvel avion débloqué : {name} ! Échap → Hangar pour le piloter', { name: a.name })), 3200);
      if (isRanked(q)) recordTime(q, res.time);
      if (net.ws?.readyState === 1) net.ws.send(JSON.stringify({ t: 'quest', id: q.job ? 'transport' : q.id })); // statistiques (quêtes les plus jouées)
    },
    onShowTimes: (q, li) => showTimes(q, li),
  });
  status(t('Dessin de la carte…'), 82);
  await tick();
  buildMapImage();
  status(t('Prêt !'), 100);
  $('start').disabled = false;
  requestAnimationFrame(frame);
  setTimeout(() => { $('loader').classList.add('done'); if (!started) { $('menu').classList.remove('hidden'); $('pilot-name').focus(); } }, 350);
  setTimeout(() => $('loader').remove(), 1400);
})();

$('start').onclick = () => {
  save.name = ($('pilot-name').value.trim() || t('Pilote')).slice(0, 16);
  if (!save.visited.includes('alpha')) save.visited.push('alpha');
  persist();
  $('menu').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('help').classList.add('hidden');
  initAudio();
  respawn();
  started = true;
  connect();
  toast(t('Bienvenue ! {engine} pour démarrer le moteur, {help} pour l\'aide.', { engine: keyName(keysFor('engine')[0] || 'e'), help: keyName(keysFor('help')[0] || 'h') }));
};

// accès console pour le débogage : jp.plane, jp.renderer.info…
window.jp = { plane, renderer, settings, gfx, camera, rig, get planeMesh() { return planeMesh; }, decor, terrain, quests: () => quests, setAircraft };
