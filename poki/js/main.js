import * as THREE from 'three';
import {
  WORLD, HALF, AIRPORTS, LANDMARKS, CITIES, terrainHeight, groundHeight, airportById,
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
import { QuestSystem } from './quests/engine.js';
import { Tutorial } from './tutorial.js';
import { TouchControls } from './touch.js';
import { translateDOM } from './i18n-dom.js';
import { tr, trMsg, lang, setLang } from './i18n.js';

const $ = (id) => document.getElementById(id);
const status = (t, progress) => { $('load-status').textContent = t; if (progress !== undefined) $('load-bar').style.width = `${progress}%`; };
translateDOM(); // version anglaise de la page (avant les icônes)
hydrateIcons();

// ================= Rendu =================
const gfx = new GameRenderer($('game'));
const { renderer, scene, camera } = gfx;


const terrain = new Terrain(scene);
gfx.attachTerrain(terrain);
const decor = new Decor(scene);
let world = null;

function applySettings(key) {
  if (key === 'lang') { setLang(settings.lang); saveSettings(); location.reload(); return; }
  gfx.applySettings(settings, key);
  if (!key || key === 'viewDist') terrain.setViewDistance(settings.viewDist * 1000);
  if (!key || key === 'trees' || key === 'decoDist' || key === 'quality') decor.setOptions({ density: settings.trees, radius: settings.decoDist, q: gfx.cfg });
  if (!key || key === 'showFps') $('fps').classList.toggle('hidden', !settings.showFps);
  if (!key || key === 'volume' || key === 'muted' || key.startsWith('snd_')) sound?.setVolume(settings);
  if (!key || key === 'minimap') $('minimap').classList.toggle('hidden', !settings.minimap);
  if (!key || key === 'showNames') for (const r of remotes.values()) r.label.visible = settings.showNames;
  if (!key || key === 'muted') $('btn-mute').innerHTML = icon(settings.muted ? 'volume-x' : 'volume-2');
  $('btn-mute').classList.toggle('off', settings.muted);
}

// ================= Sauvegarde =================
const SAVE_KEY = 'jpairlines-poki-save';
let save = { name: '', money: 0, completed: [], lastAirport: 'alpha', visited: ['alpha'], aircraft: 'cub' };
try { Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY)) || {}); } catch { /* sauvegarde absente */ }
if (!airportById(save.lastAirport)) save.lastAirport = 'alpha';
if (!Array.isArray(save.visited)) save.visited = ['alpha'];
if (!unlockedAircraft(save).some((a) => a.id === save.aircraft)) save.aircraft = 'cub';
const persist = () => {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* stockage indisponible */ }
};

// ================= Joueur =================
const plane = new Plane(save.aircraft);
let planeMesh = createPlaneMesh(plane.type, { landingLight: true });
scene.add(planeMesh);

// ================= Quêtes =================
let quests = null; // créé après le chargement du monde

function updatePrompt() {
  const pr = $('prompt');
  const lines = [];
  if (!plane.crashed && !tutorial.active) {
    const q = quests ? quests.prompt() : '';
    if (q) lines.push(q);
    if (atAirportStopped() && plane.fuel < plane.S.fuelCapacity - 0.5 && FUEL_SCALE[settings.fuelMode] > 0) {
      lines.push(canRefuel()
        ? tr(`⛽ Maintiens <kbd>K</kbd> pour faire le plein : ${Math.round(plane.fuel)} / ${plane.S.fuelCapacity} L (${FUEL_PRICE} ₣/L${save.money < FUEL_PRICE ? `, carburant de secours offert jusqu'à ${EMERGENCY_FUEL} L` : ''})`, `⛽ Hold <kbd>K</kbd> to refuel: ${Math.round(plane.fuel)} / ${plane.S.fuelCapacity} L (${FUEL_PRICE} ₣/L${save.money < FUEL_PRICE ? `, free emergency fuel up to ${EMERGENCY_FUEL} L` : ''})`)
        : tr('⛽ Coupe le moteur (<kbd>E</kbd>) pour faire le plein', '⛽ Stop the engine (<kbd>E</kbd>) to refuel'));
    }
    if (!lines.length && plane.onGround && !plane.engineOn && plane.engineStart <= 0) {
      lines.push(tr('Appuie sur <kbd>E</kbd> pour démarrer le moteur · <kbd>H</kbd> commandes', 'Press <kbd>E</kbd> to start the engine · <kbd>H</kbd> controls'));
    } else if (!lines.length && plane.onGround && plane.parkingBrake && plane.throttle > 0.2) {
      lines.push(tr('Le frein de parking est serré : appuie sur <kbd>P</kbd>', 'The parking brake is on: press <kbd>P</kbd>'));
    }
  }
  const html = lines.join('<br>');
  if (pr.innerHTML !== html) pr.innerHTML = html;
  pr.classList.toggle('hidden', !html);
}

function nearestPlaceName(x, z) {
  let best = null, bd = Infinity;
  for (const p of [...AIRPORTS, ...LANDMARKS, ...CITIES]) {
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
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (k.startsWith('arrow') || k === ' ' || k === 'enter') e.preventDefault();
  keys.add(k);
  if (e.repeat || !started) return;
  if (k === 'escape') {
    if (overlayOpen()) closeOverlays();
    else openPause();
    return;
  }
  if (k === 'm') {
    const nowHidden = $('bigmap').classList.toggle('hidden');
    if (!nowHidden) { mapView.cx = plane.pos.x; mapView.cz = plane.pos.z; drawBigMap(); }
  }
  if (k === 'j' && quests) { quests.renderJournal(); $('journal').classList.toggle('hidden'); }
  if (k === 'h') $('help').classList.toggle('hidden');
  if (paused) return;
  if (k === 'c') { rig.next(); toast(`${tr('Caméra', 'Camera')} : ${rig.modeName}`); }
  if (k === 'r') respawn();
  if (k === 'enter' && quests?.canOpenBoard()) quests.openBoard();
  if (k === 'x') quests?.requestDrop();
  if (plane.crashed) return;
  if (k === 'e') plane.toggleEngine();
  if (k === 'f') plane.setFlaps(1);
  if (k === 'v') plane.setFlaps(-1);
  if (k === 'g') plane.toggleGear();
  if (k === 'p') plane.toggleParking();
  if (k === 'l') plane.toggleLights();
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());

const canvas = $('game');
canvas.addEventListener('pointerdown', (e) => { orbit.dragging = true; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointerup', () => { orbit.dragging = false; });
canvas.addEventListener('pointermove', (e) => {
  if (!orbit.dragging) return;
  orbit.yaw -= e.movementX * 0.006;
  orbit.pitch = THREE.MathUtils.clamp(orbit.pitch - e.movementY * 0.004, -0.6, 1.2);
});
canvas.addEventListener('wheel', (e) => { rig.dist = THREE.MathUtils.clamp(rig.dist * (e.deltaY > 0 ? 1.12 : 0.89), 9, 120); }, { passive: true });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

function readInput() {
  const has = (...ks) => ks.some((k) => keys.has(k));
  let pitch = (has('arrowdown') ? 1 : 0) - (has('arrowup') ? 1 : 0);
  const inp = {
    pitch,
    roll: (has('arrowright') ? 1 : 0) - (has('arrowleft') ? 1 : 0),
    yaw: (has('d') ? 1 : 0) - (has('q', 'a') ? 1 : 0),
    throttle: (has('z', 'w', 'shift') ? 1 : 0) - (has('s', 'control') ? 1 : 0),
    brake: has(' '),
    trim: (has('t') ? 1 : 0) - (has('b') ? 1 : 0),
    refuel: has('k'),
  };
  // commandes tactiles : ajoutées au clavier (le clavier garde la priorité s'il est utilisé)
  const t = touch?.input(plane);
  if (t) {
    if (!inp.pitch) inp.pitch = t.pitch;
    if (!inp.roll) inp.roll = t.roll;
    if (!inp.yaw) inp.yaw = t.yaw;
    if (!inp.throttle) inp.throttle = t.throttle;
    inp.brake = inp.brake || t.brake;
  }
  if (settings.invertPitch) inp.pitch = -inp.pitch;
  return inp;
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
    if (performance.now() - lastFuelMsg > 3000) { lastFuelMsg = performance.now(); logMsg(tr('Plus assez d\'argent pour le carburant !', 'Not enough money for fuel!')); }
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
  touch?.sync(plane);
  $('crash').classList.add('hidden');
  if (far) {
    terrain.buildAround(plane.pos.x, plane.pos.z, 3);
    decor.update(plane.pos.x, plane.pos.z, 50);
  }
}

// ================= Barre d'outils (souris / tactile) =================
const press = (key) => { dispatchEvent(new KeyboardEvent('keydown', { key })); dispatchEvent(new KeyboardEvent('keyup', { key })); };
const touch = new TouchControls(press); // téléphone et tablette
$('btn-camera').onclick = () => press('c');
$('btn-map').onclick = () => press('m');
$('btn-journal').onclick = () => press('j');
$('btn-pause').onclick = () => openPause();
$('btn-hangar').onclick = () => { openPause(); document.querySelector('.tab[data-tab="tab-hangar"]').click(); };
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
document.querySelector('#help .close-help').onclick = () => $('help').classList.add('hidden');
$('open-help').onclick = () => $('help').classList.remove('hidden');
buildSettingsForm($('settings-form'), applySettings);
$('reset-progress').onclick = () => {
  if (!confirm(tr('Effacer argent, quêtes et aéroports visités ?', 'Erase money, quests and visited airports?'))) return;
  save = { name: save.name, money: 0, completed: [], lastAirport: 'alpha', visited: ['alpha'], aircraft: 'cub' };
  persist();
  quests.reset();
  if (plane.type !== 'cub') setAircraft('cub');
  renderHangar();
  toast(tr('Progression effacée', 'Progress erased'));
};

function renderAirportList() {
  const ul = $('airport-list');
  ul.innerHTML = '';
  for (const a of AIRPORTS) {
    const li = document.createElement('li');
    const known = save.visited.includes(a.id);
    li.innerHTML = `<span>${known ? '🛬' : '🔒'} <b>${a.name}</b> <small>· ${a.label}, ${a.elev} m</small></span>`;
    if (known) {
      const b = document.createElement('button');
      b.textContent = tr('Y aller', 'Go');
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
const net = { ws: null, id: null, lastSend: 0, retry: 2000 };
const REMOTE_COLORS = [0xffc4a3, 0xb5e3a1, 0xa3c9ff, 0xf7a3d9, 0xfff19c, 0xc2a3ff];

function wsUrl() {
  return null; // version Poki : solo
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
  ws.onopen = () => { net.retry = 2000; ws.send(JSON.stringify({ t: 'hello', name: save.name })); };
  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg.t === 'welcome') net.id = msg.id;
    if (msg.t === 'players') syncRemotes(msg.list);
  };
  ws.onclose = () => {
    net.ws = null;
    for (const id of [...remotes.keys()]) removeRemote(id);
    $('online').textContent = 'Solo (hors ligne)';
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
  const seen = new Set();
  for (const p of list) {
    if (p.id === net.id || !p.p) continue;
    seen.add(p.id);
    let r = remotes.get(p.id);
    const type = AIRCRAFT[p.a | 0]?.id || 'cub';
    if (r && r.type !== type) { removeRemote(p.id); r = null; } // il a changé d'avion
    if (!r) {
      const mesh = createPlaneMesh(type, { color: REMOTE_COLORS[p.id % REMOTE_COLORS.length] });
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
  }
  for (const id of [...remotes.keys()]) if (!seen.has(id)) removeRemote(id);
  $('online').textContent = `${remotes.size + 1} pilote${remotes.size ? 's' : ''} en ligne`;
}

function netTick(now) {
  if (!net.ws || net.ws.readyState !== 1 || now - net.lastSend < 100) return;
  net.lastSend = now;
  const r2 = (v) => Math.round(v * 100) / 100;
  net.ws.send(JSON.stringify({
    t: 'state',
    p: plane.pos.toArray().map(r2),
    q: plane.quat.toArray().map((v) => Math.round(v * 1e4) / 1e4),
    s: r2(plane.speed), r: r2(plane.rpm), g: r2(plane.gearPos), f: r2(plane.flapPos), l: plane.lights ? 1 : 0, a: aircraftIndex(plane.type),
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
function setAircraft(id) {
  const def = aircraftById(id);
  if (!unlockedAircraft(save).includes(def)) return;
  const here = atAirportStopped() ? plane.landedAt : null;
  plane.setType(def.id);
  scene.remove(planeMesh);
  planeMesh.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
  planeMesh = createPlaneMesh(def.id, { landingLight: true });
  scene.add(planeMesh);
  attachPanel();
  save.aircraft = def.id;
  persist();
  if (here) {
    plane.placeOnRunway(here, DIFFICULTY[settings.difficulty]?.autoEngine);
    rig.reset(plane);
    touch?.sync(plane);
  } else respawn(undefined, true);
  toast(tr(`${def.name} sorti du hangar !`, `${def.name} is out of the hangar!`));
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
      [tr('Vitesse', 'Speed'), p.vmax / 600], [tr('Maniabilité', 'Agility'), Math.min(1, p.roll / 256)], [tr('Autonomie', 'Range'), Math.min(1, st.range / 1650)], [tr('Piste courte', 'Short field'), Math.min(1, 128 / p.takeoff)],
    ];
    const quest = a.unlock && quests?.byId.get(a.unlock);
    const card = document.createElement('div');
    card.className = `aircraft${open ? '' : ' locked'}${cur ? ' current' : ''}`;
    card.innerHTML = `
      <div class="ac-head"><span class="ac-swatch" style="background:#${a.color.toString(16).padStart(6, '0')};border-color:#${a.accent.toString(16).padStart(6, '0')}"></span>
        <div><b>${a.name}</b> <small>${a.role}</small><div class="ac-sub">${a.engineLabel} · ${a.seats} ${tr('places', 'seats')}</div></div></div>
      <p class="ac-desc">${a.desc}</p>
      <div class="ac-bars">${bars.map(([n, v]) => `<div><span>${n}</span><i><em style="width:${Math.round(Math.max(0.06, v) * 100)}%"></em></i></div>`).join('')}</div>
      <div class="ac-specs">${tr(`Max ${p.vmax} km/h · croisière ${p.cruise} km/h · décroche à ${p.stall} km/h · roulage ${p.takeoff} m · autonomie ${st.range} km (${st.hours.toFixed(1)} h)`, `Max ${p.vmax} km/h · cruise ${p.cruise} km/h · stall ${p.stall} km/h · takeoff roll ${p.takeoff} m · range ${st.range} km (${st.hours.toFixed(1)} h)`)}</div>
      <div class="ac-action"></div>`;
    const act = card.querySelector('.ac-action');
    if (cur) act.innerHTML = `<span class="ac-cur">✈️ ${tr('Aux commandes', 'Flying it')}</span>`;
    else if (open) {
      const b = document.createElement('button');
      b.textContent = tr('Piloter cet avion', 'Fly this plane');
      b.onclick = () => { setAircraft(a.id); closeOverlays(); };
      act.appendChild(b);
    } else act.innerHTML = `<span class="ac-lock">🔒 ${tr(`Débloqué par la quête « ${quest ? quest.title : a.unlock} »`, `Unlocked by the quest "${quest ? quest.title : a.unlock}"`)}</span>`;
    box.appendChild(card);
  }
}

function updateHUD(dt) {
  const ground = Math.max(0, groundHeight(plane.pos.x, plane.pos.z));
  const agl = Math.max(0, plane.pos.y - ground - plane.S.gear);
  instruments.update(dt, plane, settings.units, inCockpit, agl);
  panelMat.emissiveIntensity = 0.15 + gfx.atmo.night * 0.55; // éclairage de la planche de bord la nuit
  $('money').textContent = `${save.money} ₣`;
  $('cam-name').textContent = rig.modeName;

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
    if (plane.stallWarning) w.push([tr('DÉCROCHAGE', 'STALL'), '']);
    const overWater = ground <= 0;
    if (plane.gearPos < 0.95 && agl < 150 && plane.throttle < 0.4 && plane.velocity.y < 0 && !(plane.S.amphibious && overWater)) w.push([tr('TRAIN !', 'GEAR!'), '']);
    // hydravion : se poser sur l'eau roues sorties le ferait capoter
    if (plane.S.amphibious && overWater && plane.gearPos > 0.05 && agl < 150 && plane.velocity.y < 0) w.push([tr('TRAIN SORTI : EAU !', 'GEAR DOWN: WATER!'), '']);
    if (plane.gearPos > 0.3 && plane.ias > plane.S.vGear) w.push([tr('VITESSE TRAIN', 'GEAR SPEED'), 'amber']);
    if (plane.ias > plane.S.vne) w.push([tr('SURVITESSE', 'OVERSPEED'), '']);
    if (Math.abs(plane.gLoad) > 4) w.push([`${plane.gLoad.toFixed(1)} G`, 'amber']);
    if (agl < 60 && plane.velocity.y < -8) w.push([tr('TERRAIN', 'TERRAIN'), '']);
  }
  if (plane.flapPos > 0.2 && plane.ias > plane.S.vFlaps) w.push([tr('VITESSE VOLETS', 'FLAP SPEED'), 'amber']);
  if (FUEL_SCALE[settings.fuelMode] > 0 && plane.fuel < plane.S.fuelCapacity * 0.15) w.push([tr('CARBURANT', 'FUEL'), plane.fuel < plane.S.fuelCapacity * 0.05 ? '' : 'amber']);
  const key = w.map((x) => x[0]).join();
  if (key !== warnKey) {
    warnKey = key;
    $('warnings').innerHTML = w.map(([t, c]) => `<span class="${c}">${t}</span>`).join('');
  }
}

function updateWeatherChip() {
  const w = gfx.weather;
  const night = gfx.atmo.night > 0.6;
  const ic = w.target === 'rain' || w.target === 'storm' ? 'cloud-rain' : night ? 'moon' : w.target === 'fog' ? 'wind' : 'sun';
  $('weather-chip').innerHTML = `${icon(ic, 15)}<b>${w.name} · ${String(Math.floor(gfx.atmo.hour)).padStart(2, '0')} h ${String(Math.floor((gfx.atmo.hour % 1) * 60)).padStart(2, '0')}</b>`;
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
    toast(tr('Limite de la carte — fais demi-tour !', 'Edge of the map — turn back!'));
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

  if (started) {
    if (!paused && !plane.crashed) {
      const steps = Number(settings.timeScale) || 1;
      for (let i = 0; i < steps && !plane.crashed; i++) simulate(realDt);
      quests.update(realDt * steps, wallT);
      if (plane.crashed) {
        $('crash-reason').textContent = trMsg(plane.crashReason);
        $('crash').classList.remove('hidden');
        beep(110, 0.6, 0.3);
        quests.onCrash();
      }
    } else quests.update(0, wallT);
    while (plane.events.length) logMsg(trMsg(plane.events.shift()));
    if (plane.landedAt && (save.lastAirport !== plane.landedAt.id || !save.visited.includes(plane.landedAt.id))) {
      save.lastAirport = plane.landedAt.id;
      if (!save.visited.includes(plane.landedAt.id)) {
        save.visited.push(plane.landedAt.id);
        toast(`${tr('Nouvel aéroport découvert', 'New airport discovered')} : ${plane.landedAt.name}`);
      }
      persist();
    }

    planeMesh.position.copy(plane.pos);
    planeMesh.quaternion.copy(plane.quat);
    animatePlaneMesh(planeMesh, { ...plane.ctrl, rpm: plane.rpm, gearPos: plane.gearPos, flapPos: plane.flapPos, lights: plane.lights, night: gfx.atmo.night }, realDt, wallT);

    tutorial.update(paused ? 0 : realDt);
    touch.setCrashed(plane.crashed);
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


// ================= Tutoriel (premier vol) =================
const isTouch = () => document.body.classList.contains('touch');
const tutorial = new Tutorial({
  plane, isTouch,
  getAgl: () => Math.max(0, plane.pos.y - plane.S.gear - Math.max(0, groundHeight(plane.pos.x, plane.pos.z))),
  onFinish: (skipped) => {
    if (skipped || !quests) return;
    toast(tr('Bravo ! Première mission : passe dans les anneaux jaunes, puis pose-toi à Base Alpha', 'Well done! First mission: fly through the yellow rings, then land at Base Alpha'));
    const q = quests.byId.get('premier-vol');
    if (q && !save.completed.includes(q.id) && !quests.active) quests.start(q);
  },
});
let tutoDone = false;
try { tutoDone = localStorage.getItem('jpairlines-poki-tuto') === '1'; } catch { /* stockage indisponible */ }
for (const b of document.querySelectorAll('[data-lang]')) {
  b.classList.toggle('active', b.dataset.lang === lang);
  b.onclick = () => { if (b.dataset.lang !== lang) { setLang(b.dataset.lang); settings.lang = b.dataset.lang; saveSettings(); location.reload(); } };
}
$('replay-tuto').onclick = () => { closeOverlays(); respawn(airportById('alpha'), true); tutorial.start(); };

// ================= Démarrage =================
$('pilot-name').value = save.name;
const tick = () => new Promise((res) => setTimeout(res, 20));
(async () => {
  applySettings();
  status(tr('Construction du terrain…', 'Building the terrain…'), 15);
  await tick();
  const a = airportById(save.lastAirport) || AIRPORTS[0];
  plane.placeOnRunway(a);
  terrain.buildAround(a.x, a.z, 4);
  status(tr('Aéroports, villes et monuments…', 'Airports, cities and landmarks…'), 45);
  await tick();
  world = buildWorldObjects(scene);
  status(tr('Arbres, maisons et rochers…', 'Trees, houses and rocks…'), 55);
  await tick();
  try {
    const [trees, rocks] = await Promise.all([new TreeLibrary().build(renderer), new RockLibrary().load()]);
    decor.setLibraries({ trees, rocks, houses: new HouseLibrary() }, new NearTrees(scene, trees));
  } catch (e) { console.warn('Décor détaillé indisponible', e); }
  status(tr('Ciel et nuages…', 'Sky and clouds…'), 70);
  await tick();
  gfx.buildClouds();
  applySettings('clouds');
  quests = new QuestSystem({
    scene, plane, getSave: () => save, persist, toast, beep, logMsg,
    setPaused: (v) => { paused = v; },
    // une quête terminée peut débloquer un avion
    onQuestDone: (q) => {
      const a = AIRCRAFT.find((x) => x.unlock === q.id);
      if (a) setTimeout(() => toast(tr(`🔓 Nouvel avion débloqué : ${a.name} ! Échap → Hangar pour le piloter`, `🔓 New plane unlocked: ${a.name}! Esc → Hangar to fly it`)), 3200);
    },
  });
  status(tr('Dessin de la carte…', 'Drawing the map…'), 82);
  await tick();
  buildMapImage();
  status(tr('Prêt !', 'Ready!'), 100);
  $('start').disabled = false;
  requestAnimationFrame(frame);
  setTimeout(() => { $('loader').classList.add('done'); if (!started) { $('menu').classList.remove('hidden'); $('pilot-name').focus(); } }, 350);
  setTimeout(() => $('loader').remove(), 1400);
})();

$('start').onclick = () => {
  save.name = ($('pilot-name').value.trim() || 'Pilote').slice(0, 16);
  if (!save.visited.includes('alpha')) save.visited.push('alpha');
  persist();
  $('menu').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('help').classList.add('hidden');
  initAudio();
  respawn();
  started = true;
  if (!tutoDone) { tutoDone = true; tutorial.start(); } else toast(tr('Bon vol ! H pour les commandes, Entrée près d\'un « ! » pour les missions.', 'Have a nice flight! H for controls, Enter near a "!" for missions.'));
};

// accès console pour le débogage : jp.plane, jp.renderer.info…
window.jp = { plane, renderer, settings, gfx, camera, rig, get planeMesh() { return planeMesh; }, decor, terrain, quests: () => quests, setAircraft };
