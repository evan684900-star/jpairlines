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
import { ACTIONS, isKey, keysFor, keyName, kbd, bindKey, unbindKey, resetKeys, layout, setLayout, detectLayout, pad, padFor, isPad, padName, bindPad, unbindPad, resetPad } from './keybinds.js';
import { Gamepads, moveFocus, clearPadFocus } from './gamepad.js';
import { Account, mergeSaves, mountGoogleButton, takeRedirectToken } from './account.js';
import { Hangar } from './hangar.js';
import { loadPlaneModels, disposePlaneMesh } from './planeModel.js';
import { Tutorial } from './tutorial.js';
import { Intro } from './intro.js';
import { WindshieldRain } from './render/windshield.js';
import { t, LANG, LANGS, setLang, translateDom } from './i18n.js';
import { cleanLivery, PATTERNS, FINISHES, WINGS, EMBLEMS, SWATCHES, ZONES, STICKERS, MAX_STICKERS, cleanStickerText, priceOf, PRICE_LABEL, SMOKE_MODES, SUITS, smokeColorAt, RARITIES, rarityOf, rarityRank, isCrateOnly, CRATES, rollCrate, DUPLICATE_REFUND, CRATE_ITEMS } from './livery.js';
import { stickerThumb } from './stickers.js';

const $ = (id) => document.getElementById(id);
// rang au classement : « 1er sur 12 » / « #1 of 12 »
const ordinal = (rank, total) => (rank === 1 ? t('{rank}er sur {total}', { rank, total }) : t('{rank}e sur {total}', { rank, total }));
const status = (msg, progress) => { $('load-status').textContent = msg; if (progress !== undefined) $('load-bar').style.width = `${progress}%`; };
hydrateIcons();
// langue : la page est en français, traduite à l'affichage si le joueur a choisi l'anglais
document.documentElement.lang = LANG;
translateDom();
// choix de la langue : trois drapeaux au menu
{
  const row = document.createElement('div');
  row.className = 'lang-row';
  for (const [code, flag, name] of LANGS) {
    const b = document.createElement('button');
    b.className = `secondary${code === LANG ? ' on' : ''}`;
    b.textContent = `${flag} ${name}`;
    b.onclick = () => { if (code !== LANG) setLang(code); };
    row.appendChild(b);
  }
  $('lang-switch').replaceWith(row);
}

// ================= Rendu =================
const gfx = new GameRenderer($('game'));
const { renderer, scene, camera } = gfx;


const terrain = new Terrain(scene);
const wsRain = new WindshieldRain(renderer); // pluie et essuie-glaces sur le pare-brise de l'avion du joueur
gfx.attachTerrain(terrain);
const decor = new Decor(scene);
let world = null;

function applySettings(key) {
  gfx.applySettings(settings, key);
  if (!key || key === 'viewDist') terrain.setViewDistance(settings.viewDist * 1000);
  if (!key || key === 'trees' || key === 'decoDist' || key === 'quality' || key === 'c_detail') decor.setOptions({ density: settings.trees, radius: settings.decoDist, q: gfx.cfg });
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
// modèles 3D détaillés (Cub-1) : chargés avant de créer l'avion ; sans eux, modèle simplifié
status(t('Chargement des avions…'), 2);
await loadPlaneModels();
const plane = new Plane(save.aircraft);
let planeMesh = createPlaneMesh(plane.type, { landingLight: true, livery: liveryOf(plane.type) });
plane.smokeColor = new THREE.Color(liveryOf(plane.type).smoke);
plane.smokeLivery = liveryOf(plane.type);
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
// le son est créé juste après le clic « Décoller » : si le navigateur l'a laissé en pause, il repart au geste suivant
for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, () => sound?.resume(), { capture: true, passive: true });
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
  if (isKey('hud', k) || isKey('chat', k)) e.preventDefault();
  onAction((id) => isKey(id, k));
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());

// action déclenchée par une touche du clavier ou un bouton de la manette : is(id) dit si c'est celle de l'action id
function onAction(is) {
  if (is('map')) {
    const nowHidden = $('bigmap').classList.toggle('hidden');
    if (!nowHidden) { mapView.cx = plane.pos.x; mapView.cz = plane.pos.z; drawBigMap(); }
  }
  if (is('journal') && quests) { quests.renderJournal(); $('journal').classList.toggle('hidden'); }
  if (is('help')) $('help').classList.toggle('hidden');
  if (is('hud')) $('hud').classList.toggle('hud-off');
  if (paused) return;
  if (is('chat')) { openChat(); return; }
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
  if (is('wipers')) plane.toggleWipers();
  if (is('smoke')) {
    if (!isOwned('smoke')) { toast(t('💨 Achète le fumigène au hangar (onglet Fumigène)')); return; }
    plane.smokeOn = !plane.smokeOn;
    toast(plane.smokeOn ? t('💨 Fumigène allumé (couleur réglable au hangar)') : t('Fumigène coupé'));
  }
}

// ================= Manette =================
// en vol : boutons → actions (onglet « Touches ») ; dans un menu : naviguer, A / ✕ valider, B / ○ revenir
let capturingPad = null; // action en attente d'un nouveau bouton
const gp = new Gamepads({
  connected: () => {
    toast(t('🎮 Manette détectée : stick gauche = manche, gâchettes = gaz, stick droit = caméra'));
    setTimeout(renderKeys, 100); // noms des boutons Xbox ou PlayStation
  },
  press: padPress,
  release: () => {},
});
// partie de l'écran pilotée à la manette (menu ouvert), ou null en vol
function uiRoot() {
  if (hg.busy) return null;
  const open = OVERLAYS.map($).filter((el) => !el.classList.contains('hidden'));
  if (open.length) return open[open.length - 1];
  if (hg.active) return $('hangar3d');
  if (!started && !$('menu').classList.contains('hidden')) return $('menu');
  return null;
}
function padPress(k) {
  if (capturingPad) {
    const taken = bindPad(capturingPad, k);
    if (taken.length) toast(t('{key} retirée de : {list}', { key: padName(k), list: taken.map((l) => t(l)).join(', ') }));
    capturingPad = null;
    renderKeys();
    return;
  }
  if (chat.open) return;
  if (intro.active) { if (intro.t > 0.4) intro.finish(); return; } // un bouton passe la cinématique
  const root = uiRoot();
  if (root) {
    const focused = root.contains(document.activeElement) && document.activeElement !== document.body ? document.activeElement : null;
    // le bouton qui a ouvert une fenêtre (carte, journal, aide) la referme
    const same = { bigmap: 'map', journal: 'journal', help: 'help' }[root.id];
    if (same && isPad(same, k)) { clearPadFocus(); root.classList.add('hidden'); return; }
    if (k === 'p0') { if (focused) focused.click(); else moveFocus(root, 'down'); }
    else if (k === 'p1' || k === 'p9') {
      clearPadFocus();
      if (hg.active && root.id === 'hangar3d') exitHangar(false);
      else if (root.id === 'menu') { if (k === 'p9') $('start').click(); }
      else closeOverlays();
    } else if ((k === 'p4' || k === 'p5') && root.id === 'pause') {
      // LB / RB : onglet précédent / suivant
      const tabs = [...root.querySelectorAll('.tabs .tab')];
      const i = tabs.findIndex((b) => b.classList.contains('active'));
      tabs[(i + (k === 'p5' ? 1 : tabs.length - 1)) % tabs.length]?.click();
    }
    return;
  }
  if (!started) return;
  if (plane.crashed && (k === 'p0' || k === 'p9')) { respawn(); return; }
  if (k === 'p9') { openPause(); return; }
  // tutoriel : A / ✕ passe les étapes « Continuer »
  if (k === 'p0' && $('tuto-next') && !$('tuto').classList.contains('hidden')) $('tuto-next').click();
  onAction((id) => isPad(id, k));
}
let padLook = false;
function updateGamepad(dt) {
  gp.poll();
  if (!pad.connected) return;
  const root = uiRoot();
  if (root) {
    const d = gp.navDir(dt);
    if (d) moveFocus(root, d);
    if (hg.active && root.id === 'hangar3d' && (gp.axes.rx || gp.axes.ry)) hangar.drag(gp.axes.rx * dt * 400, gp.axes.ry * dt * 300);
    return;
  }
  // stick droit : regarder autour de l'avion
  const { rx, ry } = gp.axes;
  if (rx || ry) {
    padLook = true;
    orbit.dragging = true;
    orbit.yaw -= rx * dt * 2.4;
    orbit.pitch = THREE.MathUtils.clamp(orbit.pitch - ry * dt * 1.6, -0.6, 1.2);
  } else if (padLook) { padLook = false; orbit.dragging = false; }
}

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
  // touches choisies par le joueur, et boutons de manette maintenus
  const on = (id) => (keysFor(id).some((k) => keys.has(k)) || padFor(id).some((k) => gp.held.has(k)) ? 1 : 0);
  const A = gp.axes, c = (v) => THREE.MathUtils.clamp(v, -1, 1);
  // stick gauche tiré vers soi = cabrer, comme un vrai manche
  let pitch = c(on('pitchUp') - on('pitchDown') + A.ly);
  if (settings.invertPitch) pitch = -pitch;
  return {
    pitch,
    roll: c(on('rollRight') - on('rollLeft') + A.lx),
    yaw: c(on('yawRight') - on('yawLeft')),
    throttle: c(on('throttleUp') - on('throttleDown') + A.rt - A.lt),
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
    const ks = [...keysFor(a.id).map((k) => `<kbd>${keyName(k)}</kbd>`), ...padFor(a.id).map((k) => `<kbd class="pad">🎮 ${padName(k)}</kbd>`)].join(' · ') || '—';
    html += `<tr><td>${ks}</td><td>${t(a.label)}</td></tr>`;
  }
  return html + `<tr><td><kbd>${t('Échap')}</kbd></td><td>${t('Pause et paramètres')}</td></tr><tr><td>${t('molette · clic-glisser')}</td><td>${t('Zoom · tourner autour de l\'avion')}</td></tr>`
    + `<tr><th colspan="2">${t('Manette')}</th></tr>`
    + `<tr><td>🎮 ${t('stick gauche')}</td><td>${t('Manche : tirer pour monter, incliner pour tourner')}</td></tr>`
    + `<tr><td>🎮 ${padName('p7')} · ${padName('p6')}</td><td>${t('Plus de gaz · moins de gaz')}</td></tr>`
    + `<tr><td>🎮 ${t('stick droit')}</td><td>${t('Regarder autour de l\'avion')}</td></tr>`
    + `<tr><td>🎮 ${padName('p9')}</td><td>${t('Pause et paramètres')}</td></tr>`
    + `<tr><td>🎮 ${padName('p8')} ${t('maintenu')}</td><td>${t('Deuxième série de boutons (voir ci-dessus)')}</td></tr>`
    + `<tr><td>🎮 ${t('menus')}</td><td>${t('Stick ou croix pour choisir, {a} pour valider, {b} pour revenir, {lb} / {rb} pour changer d\'onglet', { a: padName('p0'), b: padName('p1'), lb: padName('p4'), rb: padName('p5') })}</td></tr>`;
}
// disposition AZERTY / QWERTY : touches par défaut des lettres de pilotage
for (const b of document.querySelectorAll('[data-layout]')) {
  b.onclick = () => { setLayout(b.dataset.layout); capturing = null; renderKeys(); toast(t('Clavier {name} : touches par défaut adaptées', { name: b.dataset.layout.toUpperCase() })); };
}
detectLayout().then((l) => { if (l) { renderKeys(); toast(t('Clavier {name} détecté : touches adaptées', { name: l.toUpperCase() })); } });
function renderKeys() {
  for (const b of document.querySelectorAll('[data-layout]')) b.classList.toggle('on', b.dataset.layout === layout);
  for (const t of document.querySelectorAll('.keys-dyn')) t.innerHTML = helpTable();
  const box = $('keys-list');
  box.innerHTML = '';
  for (const a of ACTIONS) {
    if (a.group) { const h = document.createElement('h3'); h.textContent = t(a.group); box.appendChild(h); continue; }
    const row = document.createElement('div');
    row.className = 'keyrow';
    const chips = keysFor(a.id).map((k) => `<button class="keychip" data-k="${encodeURIComponent(k)}" title="${t('Retirer cette touche')}">${keyName(k)} <i>×</i></button>`).join('');
    const wait = capturing === a.id, waitPad = capturingPad === a.id;
    const padChips = padFor(a.id).map((k) => `<button class="keychip padchip" data-p="${k}" title="${t('Retirer ce bouton')}">🎮 ${padName(k)} <i>×</i></button>`).join('');
    row.innerHTML = `<span>${t(a.label)}</span><div>${chips}<button class="keyadd${wait ? ' wait' : ''}">${wait ? t('Appuie sur une touche… (Échap : annuler)') : t('+ Ajouter')}</button>`
      + `${padChips}<button class="keyadd padadd${waitPad ? ' wait' : ''}">${waitPad ? t('Appuie sur un bouton de la manette…') : t('+ 🎮')}</button></div>`;
    for (const c of row.querySelectorAll('.keychip:not(.padchip)')) c.onclick = () => { unbindKey(a.id, decodeURIComponent(c.dataset.k)); renderKeys(); };
    for (const c of row.querySelectorAll('.padchip')) c.onclick = () => { unbindPad(a.id, c.dataset.p); renderKeys(); };
    row.querySelector('.keyadd:not(.padadd)').onclick = (e) => { e.currentTarget.blur(); capturing = capturing === a.id ? null : a.id; capturingPad = null; renderKeys(); };
    // choisi à la manette, on attend que le bouton A soit relâché avant d'écouter le suivant
    row.querySelector('.padadd').onclick = (e) => { e.currentTarget.blur(); const id = capturingPad === a.id ? null : a.id; capturing = null; capturingPad = null; renderKeys(); setTimeout(() => { capturingPad = id; renderKeys(); }, 250); };
    box.appendChild(row);
  }
}
$('keys-reset').onclick = () => { resetKeys(); resetPad(); capturing = null; capturingPad = null; renderKeys(); toast(t('Touches par défaut rétablies')); };
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
const MAP_RES = 768; // carte de base : ~260 m par pixel sur 200 km (les tuiles détaillées prennent le relais en zoomant)
const mapImg = document.createElement('canvas');
const _mc = new THREE.Color();
// couleur d'un point de la carte (relief ombré depuis le nord-ouest, eau plus sombre en profondeur, courbes de niveau
// quand on est assez près) ; px = taille d'un pixel de la carte en mètres
function mapPixel(wx, wz, px, data, i, contour) {
  const h = terrainHeight(wx, wz);
  data[i + 3] = 255;
  if (h < 0.5) {
    const k = Math.min(1, -h / 300);
    data[i] = 50 - k * 25; data[i + 1] = 125 - k * 45; data[i + 2] = 190 - k * 40;
    // rivage : fine ligne claire à l'endroit où l'eau commence
    if (contour && h > -px * 0.6 && terrainHeight(wx + px, wz) >= 0.5) { data[i] += 60; data[i + 1] += 50; data[i + 2] += 30; }
    return;
  }
  const hx = terrainHeight(wx + px, wz), hz = terrainHeight(wx, wz + px);
  terrainColor(h, Math.hypot(hx - h, hz - h) / px, wx, wz, _mc).convertLinearToSRGB();
  let shade = THREE.MathUtils.clamp(1 + ((h - hx) / px + (h - hz) / px) * 0.9, 0.55, 1.3);
  if (contour) { // courbe de niveau tous les 50 m (plus marquée tous les 250 m)
    const a = Math.floor(h / 50), b = Math.floor(hx / 50), d = Math.floor(hz / 50);
    if (a !== b || a !== d) shade *= Math.max(a, b, d) % 5 === 0 ? 0.72 : 0.88;
  }
  data[i] = _mc.r * 255 * shade; data[i + 1] = _mc.g * 255 * shade; data[i + 2] = _mc.b * 255 * shade;
}
function buildMapImage() {
  mapImg.width = MAP_RES; mapImg.height = MAP_RES;
  const ctx = mapImg.getContext('2d');
  const img = ctx.createImageData(MAP_RES, MAP_RES);
  const px = WORLD.size / MAP_RES;
  for (let y = 0; y < MAP_RES; y++) {
    for (let x = 0; x < MAP_RES; x++) mapPixel(-HALF + (x + 0.5) * px, -HALF + (y + 0.5) * px, px, img.data, (y * MAP_RES + x) * 4, false);
  }
  ctx.putImageData(img, 0, 0);
}

// Cartes détaillées : en zoomant, des tuiles plus fines sont calculées à la demande (quelques-unes par image)
// et gardées en mémoire. Niveaux : 20 km, 5 km, 1,25 km et 312 m de côté, 128 pixels chacun (156 → 2,4 m par pixel).
const TILE_PX = 128;
const TILE_SIZES = [20000, 5000, 1250, 312.5]; // (la carte de base suffit au-delà de 20 km de côté)
const tiles = new Map(); // 'niveau/tx/tz' → canvas
const tileQueue = new Map(); // clé → { lv, tx, tz }
let tileJob = 0, tileFocus = [0, 0];
const MAX_TILES = 500;
function tileFor(lv, tx, tz, owner, wanted) {
  const key = `${lv}/${tx}/${tz}`;
  const c = tiles.get(key);
  if (c) { tiles.delete(key); tiles.set(key, c); return c; } // le plus récemment utilisé passe en dernier
  if (wanted) {
    wanted.add(key);
    if (!tileQueue.has(key)) tileQueue.set(key, { lv, tx, tz, owner });
  }
  return null;
}
function runTileQueue() {
  tileJob = 0;
  if (!tileQueue.size) return;
  // les tuiles les plus proches du centre de la vue d'abord
  const list = [...tileQueue.entries()].map(([k, q]) => {
    const sz = TILE_SIZES[q.lv];
    return [k, q, Math.hypot(-HALF + (q.tx + 0.5) * sz - tileFocus[0], -HALF + (q.tz + 0.5) * sz - tileFocus[1])];
  }).sort((a, b) => a[2] - b[2]);
  const t0 = performance.now();
  for (const [k, q] of list) {
    const sz = TILE_SIZES[q.lv], px = sz / TILE_PX;
    const cv = document.createElement('canvas');
    cv.width = cv.height = TILE_PX;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(TILE_PX, TILE_PX);
    const x0 = -HALF + q.tx * sz, z0 = -HALF + q.tz * sz;
    for (let y = 0; y < TILE_PX; y++) for (let x = 0; x < TILE_PX; x++) mapPixel(x0 + (x + 0.5) * px, z0 + (y + 0.5) * px, px, img.data, (y * TILE_PX + x) * 4, px <= 40);
    ctx.putImageData(img, 0, 0);
    tiles.set(k, cv);
    tileQueue.delete(k);
    if (tiles.size > MAX_TILES) tiles.delete(tiles.keys().next().value);
    if (performance.now() - t0 > 14) break; // ne pas ralentir le jeu
  }
  if (!$('bigmap').classList.contains('hidden')) drawBigMap();
  if (tileQueue.size && !tileJob) tileJob = requestAnimationFrame(runTileQueue); // drawBigMap a pu déjà programmé la suite
}
// dessine les tuiles utiles pour une vue (coarse d'abord, puis le niveau voulu par-dessus)
function drawTiles(ctx, cx, cz, span, W, toX, toY, owner) {
  const need = span / W; // mètres par pixel d'écran
  // niveau le plus grossier qui reste assez net (au plus 2,2 fois plus flou que l'écran) ; sinon le plus fin
  let top = TILE_SIZES.findIndex((sz) => sz / TILE_PX <= need * 2.2);
  if (top < 0) top = TILE_SIZES.length - 1;
  const wanted = new Set();
  // la carte de base (156 m par pixel) suffit tant qu'on est dézoomé
  if (top === 0) { for (const [k, q] of tileQueue) if (q.owner === owner) tileQueue.delete(k); return; }
  tileFocus = [cx, cz];
  ctx.imageSmoothingQuality = 'high';
  for (let lv = Math.max(0, top - 1); lv <= top; lv++) {
    const sz = TILE_SIZES[lv], half = span / 2;
    const tx0 = Math.max(0, Math.floor((cx - half + HALF) / sz)), tx1 = Math.min(Math.ceil(WORLD.size / sz) - 1, Math.floor((cx + half + HALF) / sz));
    const tz0 = Math.max(0, Math.floor((cz - half + HALF) / sz)), tz1 = Math.min(Math.ceil(WORLD.size / sz) - 1, Math.floor((cz + half + HALF) / sz));
    for (let tz = tz0; tz <= tz1; tz++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const c = tileFor(lv, tx, tz, owner, lv === top ? wanted : null);
        if (c) ctx.drawImage(c, toX(-HALF + tx * sz), toY(-HALF + tz * sz), sz * (W / span) + 0.6, sz * (W / span) + 0.6);
      }
    }
  }
  // les tuiles qui ne sont plus à l'écran n'ont plus besoin d'être calculées
  for (const [k, q] of tileQueue) if (q.owner === owner && !wanted.has(k)) tileQueue.delete(k);
  if (tileQueue.size && !tileJob) tileJob = requestAnimationFrame(runTileQueue);
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
  drawTiles(ctx, cx, cz, span, W, toX, toY, full ? 'big' : 'mini');

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
  // repères posés par le joueur (clic sur la grande carte) ; le dernier posé est la destination : trait pointillé
  // depuis l'avion, comme pour une quête
  const dest = save.markers?.[save.markers.length - 1];
  if (dest) {
    ctx.strokeStyle = '#ff5a5a';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(toX(plane.pos.x), toY(plane.pos.z));
    ctx.lineTo(toX(dest.x), toY(dest.z));
    ctx.stroke();
    ctx.setLineDash([]);
  }
  for (const m of save.markers || []) {
    const x = toX(m.x), y = toY(m.z);
    if (x < -20 || y < -20 || x > W + 20 || y > W + 20) continue;
    const r = full ? 9 : 6;
    ctx.fillStyle = '#ff4f4f';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x - r * 1.1, y - r * 1.2, x - r, y - r * 2.6, x, y - r * 2.6);
    ctx.bezierCurveTo(x + r, y - r * 2.6, x + r * 1.1, y - r * 1.2, x, y);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x, y - r * 1.6, r * 0.35, 0, Math.PI * 2); ctx.fill();
    if (full) {
      const d = Math.hypot(m.x - plane.pos.x, m.z - plane.pos.z);
      text(d > 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d)} m`, x + r + 4, y - r * 1.4, '#ffd0d0');
    }
  }
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
  mapView.span = THREE.MathUtils.clamp(mapView.span * (e.deltaY > 0 ? 1.2 : 0.83), 600, WORLD.size * 1.1);
  drawBigMap();
}, { passive: false });
const MAX_MARKERS = 30;
// destination atteinte (à moins de 250 m) : le repère disparaît et le précédent devient la destination
function checkMarkerReached() {
  const m = save.markers?.[save.markers.length - 1];
  if (!m || Math.hypot(m.x - plane.pos.x, m.z - plane.pos.z) > 250) return;
  save.markers.pop();
  persist();
  toast(save.markers.length ? t('📍 Repère atteint ! Cap sur le suivant') : t('📍 Repère atteint !'));
  beep(880, 0.2);
}
// clic gauche (sans glisser) : pose un repère ; clic sur un repère : le retire
function mapClick(e) {
  const r = bigCanvas.getBoundingClientRect();
  const k = mapView.span / r.width;
  const wx = mapView.cx + (e.clientX - r.left - r.width / 2) * k, wz = mapView.cz + (e.clientY - r.top - r.height / 2) * k;
  save.markers ||= [];
  const hit = save.markers.findIndex((m) => {
    const sx = (m.x - mapView.cx) / k + r.width / 2 + r.left, sy = (m.z - mapView.cz) / k + r.height / 2 + r.top;
    return Math.hypot(e.clientX - sx, e.clientY - (sy - 12)) < 16; // la pointe est sous l'icône
  });
  if (hit >= 0) { save.markers.splice(hit, 1); toast(t('Repère retiré')); }
  else if (save.markers.length >= MAX_MARKERS) { toast(t('{n} repères maximum : retires-en un (clic dessus)', { n: MAX_MARKERS })); return; }
  else { save.markers.push({ x: Math.round(wx), z: Math.round(wz) }); toast(t('📍 Repère posé : le trait rouge t\'y guide (clic dessus pour le retirer)')); }
  persist();
  drawBigMap();
}
$('map-clear').onclick = () => { if (!save.markers?.length) return; save.markers = []; persist(); drawBigMap(); toast(t('Repères effacés')); };
bigCanvas.addEventListener('pointerdown', (e) => { if (e.button !== 0) return; mapView.drag = [e.clientX, e.clientY]; mapView.start = [e.clientX, e.clientY]; bigCanvas.setPointerCapture(e.pointerId); });
bigCanvas.addEventListener('pointerup', (e) => {
  const st = mapView.start;
  mapView.drag = null; mapView.start = null;
  if (st && Math.hypot(e.clientX - st[0], e.clientY - st[1]) < 5) mapClick(e);
});
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
  if (r) { scene.remove(r.mesh); disposePlaneMesh(r.mesh); }
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
  // on ne ramène pas en bas quelqu'un qui est en train de relire les anciens messages
  const atBottom = !chat.open || box.scrollHeight - box.scrollTop - box.clientHeight < 30;
  box.appendChild(d);
  while (box.children.length > 150) box.firstChild.remove();
  if (atBottom) box.scrollTop = box.scrollHeight;
  if (!cls.includes('old')) setTimeout(() => d.classList.add('old'), 30000);
}
function openChat() {
  if (!net.ws || net.ws.readyState !== 1) { toast(t('Chat indisponible : pas de connexion au serveur multijoueur')); return; }
  chat.open = true;
  keys.clear(); // sinon une touche de vol enfoncée resterait « bloquée »
  $('chat').classList.add('open');
  $('chat-form').classList.remove('hidden');
  $('chat-input').focus();
  $('chat-lines').scrollTop = $('chat-lines').scrollHeight;
}
function closeChat() {
  chat.open = false;
  $('chat').classList.remove('open');
  $('chat-lines').scrollTop = $('chat-lines').scrollHeight;
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
// cliquer ou tirer la barre de défilement dans l'historique ne ferme pas le chat
$('chat-lines').addEventListener('mousedown', (e) => { if (chat.open) e.preventDefault(); });
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
// prépare les shaders de l'avion, y compris l'habitacle et les essuie-glaces qui ne s'affichent qu'en vue cockpit :
// sinon leur première apparition (touche C, pluie) fige le jeu le temps que la carte graphique les compile
function warmPlane() {
  const cs = planeMesh.userData.cockpitSet;
  wsRain.attach(planeMesh);
  if (cs) cs.visible = true;
  try { renderer.compile(scene, camera); } catch { /* sans gravité : compilé à la première image */ }
  if (cs) cs.visible = false;
}
function rebuildPlaneMesh() {
  scene.remove(planeMesh);
  disposePlaneMesh(planeMesh);
  planeMesh = createPlaneMesh(plane.type, { landingLight: true, livery: liveryOf(plane.type) });
  planeMesh.position.copy(plane.pos);
  planeMesh.quaternion.copy(plane.quat);
  scene.add(planeMesh);
  attachPanel();
  warmPlane();
  plane.smokeColor = new THREE.Color(liveryOf(plane.type).smoke);
  plane.smokeLivery = liveryOf(plane.type);
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
    tutorial.setHidden(true);
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
    if (['body', 'accent', 'stripe', 'tips', 'emblemColor', 'smoke', 'smoke2', 'regColor'].includes(k) && v) out.push(SWATCHES.includes(v) || v === '#ffffff' ? `color:${v}` : 'custom-color');
    if (k === 'regColor' && v) out.push('regColor');
    if (['pattern', 'wings', 'finish', 'emblem', 'smokeMode', 'suit'].includes(k)) out.push(`${k}:${v}`);
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
  hg.pending = { patch, keys: missing, label, price: missing.reduce((n, k) => n + priceOf(k), 0), crate: missing.some(isCrateOnly) };
  clearTimeout(hg.timer);
  hg.timer = setTimeout(() => hangar.setPlane(hg.type, cleanLivery({ ...liveryOf(hg.type), ...patch }), true), 60);
  renderHangarUI();
}
function buyPending() {
  const p = hg.pending;
  if (!p || p.crate || save.money < p.price) return; // les éléments des caisses ne s'achètent pas
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

// ----- Caisses : tirage, puis animation (bande d'éléments qui défile et ralentit jusqu'au gain) -----
const CAT = {
  pattern: ['🎨', PATTERNS], wings: ['✈️', WINGS], finish: ['✨', FINISHES], emblem: ['🛡', EMBLEMS], sticker: ['🏷', STICKERS],
  smokeMode: ['💨', SMOKE_MODES], suit: ['🧑‍✈️', SUITS],
};
function itemInfo(key) {
  if (key === 'regColor') return { icon: '🔤', name: t('Couleur de l\'immatriculation'), cat: t('Décos') };
  const [c, v] = key.split(':');
  const [icon, list] = CAT[c];
  const name = t((list.find(([k]) => k === v) || [, v])[1]);
  const img = c === 'sticker' || c === 'emblem' ? stickerThumb(v, '#f2c21b') : null;
  const cats = { pattern: 'Motif du fuselage', wings: 'Ailes', finish: 'Finition de la peinture', emblem: 'Emblème sur la dérive', sticker: 'Autocollants', smokeMode: 'Effet du fumigène', suit: 'Tenue du pilote' };
  return { icon, name, img, cat: t(cats[c]) };
}
function cardHTML(key) {
  const i = itemInfo(key), r = rarityOf(key);
  return `<div class="crate-item r-${r}">${i.img ? `<img src="${i.img}" alt="">` : `<span class="ci-icon">${i.icon}</span>`}<span class="ci-name">${i.name}</span></div>`;
}
function openCrate(crate) {
  if (!crate || save.money < crate.price || hg.busy) return;
  if ($('crate-open') && !$('crate-open').classList.contains('hidden')) return; // une caisse à la fois
  save.money -= crate.price;
  const owned = save.owned || [];
  const win = rollCrate(crate, owned);
  let refund = 0;
  if (win.duplicate) { refund = Math.round(crate.price * DUPLICATE_REFUND[win.rarity] / 10) * 10; save.money += refund; }
  else save.owned = [...new Set([...owned, win.key])];
  persist(); // le gain est enregistré tout de suite (même si on ferme pendant l'animation)
  // bande : éléments au hasard selon les chances de la caisse, le gain en position 34
  const N = 42, W_IDX = 34;
  const strip = Array.from({ length: N }, (_, i) => (i === W_IDX ? win.key : rollCrate(crate, []).key));
  let el = $('crate-open');
  if (!el) { el = document.createElement('div'); el.id = 'crate-open'; $('hangar3d').append(el); }
  el.innerHTML = `<div class="co-panel glass"><h3>${t(crate.name)}</h3><div class="co-window"><div class="co-strip">${strip.map(cardHTML).join('')}</div><div class="co-marker"></div></div>`
    + `<div class="co-result hidden"></div><button class="co-skip secondary">${t('Passer')}</button></div>`;
  el.classList.remove('hidden');
  const stripEl = el.querySelector('.co-strip'), card = stripEl.children[0];
  const cw = card.getBoundingClientRect().width + 8, winW = el.querySelector('.co-window').clientWidth;
  const target = W_IDX * cw + cw / 2 - winW / 2 + (Math.random() - 0.5) * cw * 0.6;
  stripEl.style.transform = 'translateX(0px)';
  let done = false, lastIdx = -1, raf = 0;
  const finish = () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    stripEl.style.transition = 'none';
    stripEl.style.transform = `translateX(${-(W_IDX * cw + cw / 2 - winW / 2)}px)`;
    const i = itemInfo(win.key), rn = RARITIES.find(([k]) => k === win.rarity);
    const res = el.querySelector('.co-result');
    res.innerHTML = `<div class="co-win r-${win.rarity}">${cardHTML(win.key)}<div><span class="co-rar r-${win.rarity}">${t(rn[1])}</span><b>${i.name}</b><small>${i.cat}</small>`
      + (win.duplicate ? `<small>${t('Doublon : +{n} rendus', { n: PRICE_LABEL(refund) })}</small>` : `<small>${t('Nouveau ! Débloqué sur tous tes avions')}</small>`) + `</div></div>`
      + `<div class="co-btns">${win.duplicate || win.key === 'regColor' ? '' : `<button class="co-try">${t('Essayer sur l\'avion')}</button>`}<button class="co-close secondary">${t('Fermer')}</button></div>`;
    res.classList.remove('hidden');
    el.querySelector('.co-skip').classList.add('hidden');
    el.querySelector('.co-window').classList.add(`glow-${win.rarity}`);
    beep(win.rarity === 'exotique' || win.rarity === 'legendaire' ? 1320 : 880, 0.35, 0.2);
    if (['legendaire', 'exotique'].includes(win.rarity)) setTimeout(() => beep(1760, 0.4, 0.18), 180);
    const close = () => { el.classList.add('hidden'); renderHangarUI(); };
    res.querySelector('.co-close').onclick = close;
    res.querySelector('.co-try')?.addEventListener('click', () => {
      close();
      const [c, v] = win.key.split(':');
      if (c === 'sticker') { hg.tab = 'stickers'; hg.placing = v; renderHangarUI(); } else { hg.tab = c === 'suit' ? 'pilote' : c === 'smokeMode' ? 'fumee' : c === 'emblem' ? 'deco' : 'motifs'; setLivery({ [c]: v }); }
    });
  };
  el.querySelector('.co-skip').onclick = finish;
  requestAnimationFrame(() => {
    stripEl.style.transition = 'transform 5.6s cubic-bezier(0.08, 0.62, 0.1, 1)';
    stripEl.style.transform = `translateX(${-target}px)`;
    // tic à chaque élément qui passe sous le repère
    const tick = () => {
      const m = new DOMMatrixReadOnly(getComputedStyle(stripEl).transform);
      const idx = Math.floor((-m.m41 + winW / 2) / cw);
      if (idx !== lastIdx) { lastIdx = idx; beep(520 + (idx % 3) * 40, 0.025, 0.06); }
      if (!done) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  });
  stripEl.addEventListener('transitionend', finish, { once: true });
  $('hg-money').textContent = `💰 ${PRICE_LABEL(save.money)}`;
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
  if (hg.pending?.crate) {
    // aperçu d'un élément des caisses : on peut l'essayer, pas l'acheter
    buy.innerHTML = `<div><b>${hg.pending.label}</b> — 🎁 ${t('À gagner dans les caisses')}</div><button id="hg-buy-crate">${t('Voir les caisses')}</button><button id="hg-buy-no" class="secondary">${t('Annuler')}</button>`;
    buy.classList.remove('hidden');
    $('hg-buy-crate').onclick = () => { cancelPending(); hg.tab = 'caisses'; renderHangarUI(); };
    $('hg-buy-no').onclick = cancelPending;
  } else if (hg.pending) {
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
  const tag = (key) => (isOwned(key) ? '' : isCrateOnly(key) ? `<em class="price crate" title="${t('Seulement dans les caisses')}">🎁</em>` : `<em class="price">${PRICE_LABEL(priceOf(key))}</em>`);
  const rar = (key) => { const r = RARITIES.find(([k]) => k === rarityOf(key)); return `r-${r[0]}" title="${t(r[1])}`; };
  // tri par rareté (commun → exotique), l'ordre d'origine départage
  const byRarity = (list, prefix) => list.map((it, i) => [it, i]).sort((a, b) => rarityRank(`${prefix}${a[0][0]}`) - rarityRank(`${prefix}${b[0][0]}`) || a[1] - b[1]).map(([it]) => it);
  const colorRow = (key, label, orig) => `<h4>${label}</h4><div class="hg-sw" data-color="${key}">`
    + (['body', 'accent', 'stripe', 'regColor'].includes(key) ? `<button class="orig${view[key] ? '' : ' on'}" data-v="">${t(key === 'regColor' ? 'Automatique' : 'D\'origine')}</button>` : '')
    + SWATCHES.map((c) => `<button style="background:${c}" class="${view[key] === c ? 'on' : ''}${isOwned(`color:${c}`) ? '' : ' lock'}" data-v="${c}" title="${isOwned(`color:${c}`) ? c : `${c} · ${PRICE_LABEL(priceOf(`color:${c}`))}`}"></button>`).join('')
    + (isOwned('custom-color') ? `<input type="color" value="${view[key] || orig}" title="${t('Couleur sur mesure')}">` : `<button class="orig custom" title="${t('Débloque toutes les couleurs')}">${t('🎨 Sur mesure')} ${tag('custom-color')}</button>`)
    + '</div>';
  const chips = (key, list, label) => `<h4>${label}</h4><div class="hg-chips" data-chip="${key}">${byRarity(list, `${key}:`).map(([k, n]) => `<button class="${view[key] === k ? 'on' : ''} ${rar(`${key}:${k}`)}" data-v="${k}" data-n="${t(n)}">${t(n)}${tag(`${key}:${k}`)}</button>`).join('')}</div>`;
  const legend = `<div class="hg-legend">${RARITIES.map(([k, n]) => `<span class="r-${k}">${t(n)}</span>`).join('')}</div>`;
  let html = `<p class="sub shop-note">${t('Chaque élément s\'achète une fois et sert ensuite sur tous tes avions. Clique pour l\'essayer.')} ${t('Les éléments 🎁 se gagnent dans les caisses.')}</p>` + legend;
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
      + `<div class="hg-stickers">${byRarity(STICKERS, 'sticker:').map(([k, n]) => `<button class="${hg.placing === k ? 'on' : ''} ${rar(`sticker:${k}`)}" data-st="${k}"><img src="${stickerThumb(k, hg.stickerColor, k === 'texte' ? (hg.stickerText || 'JP') : '')}" alt=""><span>${t(n)}</span>${tag(`sticker:${k}`)}</button>`).join('')}</div>`
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
      + colorRow('regColor', `${t('Couleur de l\'immatriculation')} ${tag('regColor')}`, view.regColor || '#16181c')
      + chips('emblem', EMBLEMS, t('Emblème sur la dérive')) + colorRow('emblemColor', t('Couleur de l\'emblème'), L.emblemColor)
      + (view.emblem === 'numero' ? `<h4>${t('Numéro de course')}</h4><input type="number" id="hg-num" min="0" max="99" value="${view.number}">` : '');
  } else if (hg.tab === 'caisses') {
    const owned = save.owned || [];
    const got = CRATE_ITEMS.filter((k) => owned.includes(k)).length;
    html += `<p class="sub">${t('Les nouveautés du hangar ne s\'achètent pas : ouvre une caisse pour gagner un élément au hasard. Un doublon te rembourse une partie de la caisse.')}</p>`
      + `<p class="sub"><b>${t('Collection : {n} / {total}', { n: got, total: CRATE_ITEMS.length })}</b></p>`
      + CRATES.map((c) => `<div class="crate-card crate-${c.id}"><div class="crate-box">🎁</div><div class="crate-info"><b>${t(c.name)}</b>`
        + `<div class="crate-odds">${RARITIES.filter(([r]) => c.odds[r]).map(([r, n]) => `<span class="r-${r}">${t(n)} ${(c.odds[r] * 100).toLocaleString(LANG, { maximumFractionDigits: 1 })} %</span>`).join('')}</div></div>`
        + `<button data-crate="${c.id}" ${save.money >= c.price ? '' : 'disabled'}>${t('Ouvrir')} · ${PRICE_LABEL(c.price)}</button></div>`).join('');
  } else if (hg.tab === 'pilote') {
    html += `<p class="sub">${t('La tenue du pilote qui rejoint l\'avion dans la cinématique de début de partie.')}</p>`
      + chips('suit', SUITS, t('Tenue du pilote'));
  } else {
    html += isOwned('smoke')
      ? chips('smokeMode', SMOKE_MODES, t('Effet du fumigène'))
        + colorRow('smoke', t('Couleur du fumigène'), L.smoke)
        + (view.smokeMode === 'bicolore' ? colorRow('smoke2', t('Deuxième couleur'), L.smoke2) : '')
        + `<p class="sub">${t('En vol, appuie sur {key} pour allumer ou couper le fumigène et dessiner dans le ciel.', { key: kbd('smoke') })}</p>`
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
  for (const b of body.querySelectorAll('[data-crate]')) b.onclick = () => openCrate(CRATES.find((c) => c.id === b.dataset.crate));
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
      if (!isOwned(`sticker:${k}`)) { hg.pending = { patch: {}, keys: [`sticker:${k}`], label: t(STICKERS.find(([x]) => x === k)[1]), price: priceOf(`sticker:${k}`), crate: isCrateOnly(`sticker:${k}`) }; hg.placing = null; }
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
  plane.update(dt, input, { difficulty: settings.difficulty, fuelScale: FUEL_SCALE[settings.fuelMode] ?? 4, sensitivity: settings.sensitivity, turbulence: gfx.weatherState?.gust ?? 0, windDir: gfx.weather?.windDir ?? 0 });
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

let fpsTimer = 0, inCockpit = false, frozenFrames = 0;

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
    if (e.type === 'touchdown') { rig.kick(0.25 + e.strength * 0.5); sound?.touchdown(e.strength); gp.rumble(0.2 + e.strength * 0.6, 160); quests?.onTouchdown(e.vs); }
    if (e.type === 'crash') { rig.kick(1.5); sound?.crash(); gp.rumble(1, 600); }
    if (e.type === 'thunder') sound?.thunder(e.delay, e.strength);
  }
}
function frame(now) {
  requestAnimationFrame(frame);
  const rawDt = (now - last) / 1000;
  const realDt = Math.min(0.05, rawDt);
  last = now;
  const wallT = Date.now() / 1000; // horloge commune : bateaux et montgolfières identiques pour tous
  updateGamepad(realDt);

  // hangar : le monde est déchargé, on n'affiche que la scène du hangar
  if (hg.active) {
    hangar.update(realDt);
    renderer.toneMappingExposure = 1;
    hangar.render();
    return;
  }

  if (started && intro.active) {
    // cinématique de début de partie : l'avion attend, moteur arrêté
    planeMesh.position.copy(plane.pos);
    planeMesh.quaternion.copy(plane.quat);
    if (planeMesh.userData.cabin) planeMesh.userData.cabin.visible = true;
    animatePlaneMesh(planeMesh, { ...plane.ctrl, rpm: 0, gearPos: plane.gearPos, flapPos: plane.flapPos, lights: plane.lights, night: gfx.atmo.night }, realDt, wallT);
    intro.update(realDt);
    inCockpit = false;
    netTick(now);
  } else if (started) {
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
    // intérieur de la cabine : seulement quand la caméra est assez près pour le voir par les vitres
    if (planeMesh.userData.cabin) planeMesh.userData.cabin.visible = camera.position.distanceTo(planeMesh.position) < 35;
    animatePlaneMesh(planeMesh, { ...plane.ctrl, rpm: plane.rpm, gearPos: plane.gearPos, flapPos: plane.flapPos, lights: plane.lights, night: gfx.atmo.night }, realDt, wallT);

    // pluie sur le pare-brise : simulée même hors du cockpit (la vitre est déjà mouillée quand on y entre)
    wsRain.attach(planeMesh);
    wsRain.update(realDt, {
      rain: Math.min(1, gfx.weatherState?.rain ?? 0), air: THREE.MathUtils.clamp((plane.ias - 8) / 55, 0, 1),
      on: plane.wipers && !plane.crashed, enabled: gfx.cfg.post && gfx.cfg.raindrops !== false,
    });
    updatePrompt();
    tutorial.update(realDt);
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
    if (placeTimer <= 0) { placeTimer = 1; updatePlace(); updateWeatherChip(); checkMarkerReached(); }

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
    if (r.mesh.userData.cabin) r.mesh.userData.cabin.visible = camera.position.distanceTo(r.mesh.position) < 35;
    animatePlaneMesh(r.mesh, r.st, realDt, wallT);
    // fumigène des autres pilotes, dans la couleur de leur peinture
    if (r.smoke && realDt > 0) {
      r.smokeAcc = (r.smokeAcc || 0) + realDt * 45;
      const lv = net.liveries.get(r.id);
      r.smokeLv ||= lv ? cleanLivery(lv) : null; // remis à zéro quand le joueur change de peinture (removeRemote)
      const col = (r.smokeCol ||= new THREE.Color());
      col.set(r.smokeLv ? smokeColorAt(r.smokeLv, wallT) : '#ffffff'); // mêmes effets (alternance, arc-en-ciel) que chez son pilote
      while (r.smokeAcc > 1) {
        r.smokeAcc--;
        const at = r.mesh.localToWorld(r.mesh.userData.exhaust.clone());
        gfx.effects.smoke.emit(at, new THREE.Vector3((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6), { life: 9, size: 1.1, grow: 5, color: col.clone(), alpha: 0.75, drag: 1.2, rise: 0.15 });
      }
    }
  }

  // menu ouvert (pause, aide, carte, journal, missions) : le jeu est figé, on garde la dernière image au lieu de
  // recalculer la 3D derrière un panneau flouté (c'était l'essentiel du délai d'affichage des menus)
  const frozen = (paused || overlayOpen()) && started && !hg.active;
  if (frozen && frozenFrames++ > 1) return;
  if (!frozen) frozenFrames = 0;
  gfx.render(rawDt, {
    speed: started ? THREE.MathUtils.clamp((plane.ias - 62) / 30, 0, 1) : 0,
    rain: inCockpit ? Math.min(1, gfx.weatherState.rain) : 0,
    glass: started && inCockpit && !intro.active ? wsRain.worldGlass() : null, // eau sur le pare-brise
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
  warmPlane(); // shaders de l'avion (vue cockpit, essuie-glaces) prêts avant le décollage
  status(t('Prêt !'), 100);
  $('start').disabled = false;
  requestAnimationFrame(frame);
  setTimeout(() => { $('loader').classList.add('done'); if (!started && !$('start').disabled) { $('menu').classList.remove('hidden'); $('pilot-name').focus(); } }, 350);
  setTimeout(() => $('loader').remove(), 1400);
})();

$('start').onclick = () => {
  save.name = ($('pilot-name').value.trim() || t('Pilote')).slice(0, 16);
  if (!save.visited.includes('alpha')) save.visited.push('alpha');
  persist();
  $('menu').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('help').classList.add('hidden');
  $('start').disabled = true;
  // tout le reste (son, placement, connexion, tutoriel) attend que le menu ait disparu à l'écran : le clic répond tout de suite
  requestAnimationFrame(() => setTimeout(() => {
    initAudio();
    respawn();
    started = true;
    connect();
    const welcome = () => {
      // premier vol : tutoriel guidé avec flèches (sinon simple rappel)
      if (!save.tutorialDone && !save.completed.length) tutorial.start();
      else toast(t('Bienvenue ! {engine} pour démarrer le moteur, {help} pour l\'aide.', { engine: keyName(keysFor('engine')[0] || 'e'), help: keyName(keysFor('help')[0] || 'h') }));
    };
    if (settings.showIntro === false) { welcome(); return; }
    // cinématique : le pilote rejoint l'avion, puis l'affichage revient
    $('hud').classList.add('cine-hide');
    planeMesh.position.copy(plane.pos);
    planeMesh.quaternion.copy(plane.quat);
    intro.start(plane, planeMesh, () => { $('hud').classList.remove('cine-hide'); welcome(); }, liveryOf(plane.type).suit);
  }, 0));
};
const intro = new Intro({ scene, camera, rig, ground: (x, z) => Math.max(0, groundHeight(x, z)) });
const tutorial = new Tutorial({
  plane,
  agl: () => plane.pos.y - Math.max(0, groundHeight(plane.pos.x, plane.pos.z)) - plane.S.gear,
  isPaused: () => paused || hg.active || overlayOpen(),
  onDone: () => { save.tutorialDone = true; persist(); },
});
// revoir le tutoriel depuis l'aide
$('replay-tuto').onclick = () => { closeOverlays(); tutorial.start(); };

// accès console pour le débogage : jp.plane, jp.renderer.info…
window.jp = { THREE, plane, renderer, settings, gfx, camera, rig, get planeMesh() { return planeMesh; }, decor, terrain, quests: () => quests, setAircraft, tutorial: () => tutorial, intro, wsRain, get inCockpit() { return inCockpit; }, mapTiles: () => ({ built: tiles.size, queued: tileQueue.size }) };
