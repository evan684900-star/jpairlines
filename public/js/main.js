import * as THREE from 'three';
import {
  WORLD, HALF, AIRPORTS, LANDMARKS, CITIES, terrainHeight, groundHeight, airportById,
} from './world.js';
import { Plane, createPlaneMesh, animatePlaneMesh, SPECS, DIFFICULTY } from './plane.js';
import { Terrain, terrainColor } from './terrain.js';
import { Decor } from './decor.js';
import { buildWorldObjects, makeLabel, updateLabels } from './objects.js';
import { settings, buildSettingsForm } from './settings.js';
import { MULTIPLAYER_URL } from './config.js';
import { buildTextures, Atmosphere } from './graphics.js';
import { QuestSystem } from './quests/engine.js';

const $ = (id) => document.getElementById(id);
const status = (t) => { $('load-status').textContent = t; };

// ================= Rendu =================
const renderer = new THREE.WebGLRenderer({ canvas: $('game'), antialias: true, powerPreference: 'high-performance', logarithmicDepthBuffer: false });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.42;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xbfd4e6, 0.0001);
buildTextures();
const atmo = new Atmosphere(renderer, scene);

const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.5, 60000);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});


const terrain = new Terrain(scene);
const decor = new Decor(scene);
let world = null;

function applySettings(key) {
  if (!key || key === 'quality') renderer.setPixelRatio({ low: 0.75, medium: 1, high: Math.min(devicePixelRatio, 2) }[settings.quality] || 1);
  if (!key || key === 'viewDist') {
    const d = settings.viewDist * 1000;
    terrain.setViewDistance(d);
    scene.fog.density = 1.4 / d;
    camera.far = d * 1.6;
    camera.updateProjectionMatrix();
    atmo.sky.scale.setScalar(camera.far * 0.9);
  }
  if (!key || key === 'trees' || key === 'decoDist') decor.setOptions({ density: settings.trees, radius: settings.decoDist });
  if (!key || key === 'fov') { camera.fov = settings.fov; camera.updateProjectionMatrix(); }
  if (world && (!key || key === 'clouds')) world.clouds.visible = settings.clouds;
  if (!key || key === 'timeOfDay') atmo.setTime(settings.timeOfDay);
  if (!key || key === 'shadows' || key === 'quality') atmo.setShadows(settings.shadows, settings.quality);
  if (!key || key === 'minimap') $('minimap').classList.toggle('hidden', !settings.minimap);
  if (!key || key === 'showNames') for (const r of remotes.values()) r.label.visible = settings.showNames;
  if (!key || key === 'units') {
    const av = settings.units === 'aviation';
    $('u-spd').textContent = av ? 'kt' : 'km/h';
    $('u-alt').textContent = av ? 'ft' : 'm';
    document.querySelector('.u-alt2').textContent = av ? 'ft' : 'm';
    $('u-vs').textContent = av ? 'ft/min' : 'm/s';
  }
}

// ================= Joueur =================
const plane = new Plane();
const planeMesh = createPlaneMesh();
scene.add(planeMesh);

// ================= Sauvegarde =================
const SAVE_KEY = 'jpairlines-save';
let save = { name: '', money: 0, completed: [], lastAirport: 'alpha', visited: ['alpha'] };
try { Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY)) || {}); } catch { /* sauvegarde absente */ }
if (!airportById(save.lastAirport)) save.lastAirport = 'alpha';
if (!Array.isArray(save.visited)) save.visited = ['alpha'];
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* stockage indisponible */ } };

// ================= Quêtes =================
let quests = null; // créé après le chargement du monde

function updatePrompt() {
  const pr = $('prompt');
  let html = quests ? quests.prompt() : '';
  if (plane.crashed) html = '';
  else if (!html && canRefuel() && plane.fuel < SPECS.fuelCapacity - 0.5) {
    html = `⛽ Maintiens <kbd>K</kbd> pour faire le plein (${Math.round(plane.fuel)} / ${SPECS.fuelCapacity} L)`;
  } else if (!html && plane.onGround && !plane.engineOn && plane.engineStart <= 0) {
    html = 'Appuie sur <kbd>E</kbd> pour démarrer le moteur · <kbd>H</kbd> commandes';
  } else if (!html && plane.onGround && plane.parkingBrake && plane.throttle > 0.2) {
    html = 'Le frein de parking est serré : appuie sur <kbd>P</kbd>';
  }
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

let audio = null;
function initAudio() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    // bruit du vent
    const noise = ctx.createBufferSource();
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noise.buffer = buf;
    noise.loop = true;
    const wf = ctx.createBiquadFilter();
    wf.type = 'bandpass';
    wf.frequency.value = 600;
    const wg = ctx.createGain();
    wg.gain.value = 0;
    osc.connect(filter).connect(gain).connect(ctx.destination);
    noise.connect(wf).connect(wg).connect(ctx.destination);
    osc.start();
    noise.start();
    audio = { ctx, osc, gain, wg };
  } catch { audio = null; }
}
function beep(freq, dur, vol = 0.15) {
  if (!audio) return;
  const o = audio.ctx.createOscillator();
  const g = audio.ctx.createGain();
  o.frequency.value = freq;
  g.gain.setValueAtTime(Math.max(0.0001, vol * settings.volume * 2), audio.ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, audio.ctx.currentTime + dur);
  o.connect(g).connect(audio.ctx.destination);
  o.start();
  o.stop(audio.ctx.currentTime + dur);
}

// ================= Entrées =================
const keys = new Set();
let camMode = 0;
let camDist = 19;
const orbit = { yaw: 0, pitch: 0, dragging: false };
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
  if (k === 'c') camMode = (camMode + 1) % 2;
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
canvas.addEventListener('wheel', (e) => { camDist = THREE.MathUtils.clamp(camDist * (e.deltaY > 0 ? 1.12 : 0.89), 9, 120); }, { passive: true });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

function readInput() {
  const has = (...ks) => ks.some((k) => keys.has(k));
  let pitch = (has('arrowdown') ? 1 : 0) - (has('arrowup') ? 1 : 0);
  if (settings.invertPitch) pitch = -pitch;
  return {
    pitch,
    roll: (has('arrowright') ? 1 : 0) - (has('arrowleft') ? 1 : 0),
    yaw: (has('d') ? 1 : 0) - (has('q', 'a') ? 1 : 0),
    throttle: (has('z', 'w', 'shift') ? 1 : 0) - (has('s', 'control') ? 1 : 0),
    brake: has(' '),
    trim: (has('t') ? 1 : 0) - (has('b') ? 1 : 0),
    refuel: has('k'),
  };
}

function canRefuel() {
  return plane.onGround && plane.speed < 1 && !plane.crashed && !!plane.landedAt;
}

function respawn(airport, teleport = false) {
  const a = airport || airportById(save.lastAirport) || AIRPORTS[0];
  quests?.onRespawn(plane.crashed, teleport);
  const far = plane.pos.distanceTo(new THREE.Vector3(a.x, a.elev, a.z)) > 4000;
  const keepFuel = !plane.crashed && plane.fuel > 0 ? plane.fuel : SPECS.fuelCapacity;
  plane.placeOnRunway(a, DIFFICULTY[settings.difficulty]?.autoEngine);
  plane.fuel = keepFuel;
  camQuat.copy(plane.quat);
  $('crash').classList.add('hidden');
  if (far) {
    terrain.buildAround(plane.pos.x, plane.pos.z, 3);
    decor.update(plane.pos.x, plane.pos.z, 50);
  }
}

// ================= Pause / paramètres / voyage =================
function openPause() {
  paused = true;
  $('pause').classList.remove('hidden');
  renderAirportList();
}
$('resume').onclick = closeOverlays;
for (const b of document.querySelectorAll('.tab')) {
  b.onclick = () => {
    for (const t of document.querySelectorAll('.tab')) t.classList.toggle('active', t === b);
    for (const body of document.querySelectorAll('.tab-body')) body.classList.toggle('hidden', body.id !== b.dataset.tab);
  };
}
$('tab-help').innerHTML = $('help-template').innerHTML;
document.querySelector('#help .help-content').innerHTML = $('help-template').innerHTML;
document.querySelector('#help .close-help').onclick = () => $('help').classList.add('hidden');
$('open-help').onclick = () => $('help').classList.remove('hidden');
buildSettingsForm($('settings-form'), applySettings);
$('reset-progress').onclick = () => {
  if (!confirm('Effacer argent, quêtes et aéroports visités ?')) return;
  save = { name: save.name, money: 0, completed: [], lastAirport: 'alpha', visited: ['alpha'] };
  persist();
  quests.reset();
  toast('Progression effacée');
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
      b.textContent = 'Y aller';
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
    if (!r) {
      const mesh = createPlaneMesh(REMOTE_COLORS[p.id % REMOTE_COLORS.length], 0x2a4bd8);
      const label = makeLabel(p.name, { size: 0.026 });
      label.position.y = 6;
      label.visible = settings.showNames;
      mesh.add(label);
      mesh.position.fromArray(p.p);
      mesh.quaternion.fromArray(p.q);
      scene.add(mesh);
      r = { mesh, label, name: p.name, tp: new THREE.Vector3(), tq: new THREE.Quaternion(), st: {} };
      remotes.set(p.id, r);
    }
    r.tp.fromArray(p.p);
    r.tq.fromArray(p.q);
    r.st = { rpm: p.r ?? 0.6, gearPos: p.g ?? 1, flapPos: p.f ?? 0, lights: !!p.l };
  }
  for (const id of [...remotes.keys()]) if (!seen.has(id)) removeRemote(id);
  $('online').textContent = `🌐 ${remotes.size + 1} pilote${remotes.size ? 's' : ''} en ligne`;
}

function netTick(now) {
  if (!net.ws || net.ws.readyState !== 1 || now - net.lastSend < 100) return;
  net.lastSend = now;
  const r2 = (v) => Math.round(v * 100) / 100;
  net.ws.send(JSON.stringify({
    t: 'state',
    p: plane.pos.toArray().map(r2),
    q: plane.quat.toArray().map((v) => Math.round(v * 1e4) / 1e4),
    s: r2(plane.speed), r: r2(plane.rpm), g: r2(plane.gearPos), f: r2(plane.flapPos), l: plane.lights ? 1 : 0,
  }));
}

// ================= Caméra / HUD =================
const camQuat = new THREE.Quaternion();
const camOffset = new THREE.Vector3();
const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.09);
const orbitQ = new THREE.Quaternion();
const orbitE = new THREE.Euler();
const viewQ = new THREE.Quaternion();

function updateCamera(dt) {
  if (!orbit.dragging) {
    orbit.yaw *= Math.exp(-dt * 1.5);
    orbit.pitch *= Math.exp(-dt * 1.5);
  }
  orbitQ.setFromEuler(orbitE.set(-orbit.pitch, orbit.yaw, 0, 'YXZ'));
  if (camMode === 0) {
    camQuat.slerp(plane.quat, 1 - Math.exp(-dt * 4));
    viewQ.copy(camQuat).multiply(orbitQ);
    camOffset.set(0, camDist * 0.24, camDist).applyQuaternion(viewQ);
    camera.position.copy(plane.pos).add(camOffset);
    camera.quaternion.copy(viewQ).multiply(tilt);
  } else {
    camQuat.copy(plane.quat);
    camOffset.set(0, 1.1, -0.9).applyQuaternion(plane.quat);
    camera.position.copy(plane.pos).add(camOffset);
    camera.quaternion.copy(plane.quat).multiply(orbitQ);
  }
  planeMesh.visible = camMode === 0 || plane.crashed;
  const g = Math.max(0, groundHeight(camera.position.x, camera.position.z)) + 1.5;
  if (camera.position.y < g) camera.position.y = g;
}

const setSys = (id, cls) => { const el = $(id); el.classList.remove('on', 'warn', 'bad'); if (cls) el.classList.add(cls); };
let warnKey = '';

function updateHUD() {
  const av = settings.units === 'aviation';
  const ground = Math.max(0, groundHeight(plane.pos.x, plane.pos.z));
  const agl = Math.max(0, plane.pos.y - ground - SPECS.gear);
  const alt = (m) => Math.round(av ? m * 3.281 : m);
  $('spd').textContent = Math.round(plane.speed * (av ? 1.944 : 3.6));
  $('alt').textContent = alt(plane.pos.y);
  $('agl').textContent = alt(agl);
  const vs = plane.onGround ? 0 : plane.velocity.y;
  $('vs').textContent = av ? Math.round(vs * 196.85) : vs.toFixed(1);
  $('hdg').textContent = String(Math.round(plane.headingDeg) % 360).padStart(3, '0');
  $('thr').style.width = `${plane.throttle * 100}%`;
  $('rpm').style.width = `${plane.rpm * 100}%`;
  $('fuel').style.width = `${(plane.fuel / SPECS.fuelCapacity) * 100}%`;
  $('trim').style.left = `${50 + plane.trim * 100}%`;
  $('money').textContent = `${save.money} ₣`;

  setSys('sys-engine', plane.engineOn ? 'on' : plane.engineStart > 0 ? 'warn' : null);
  const gear = document.querySelector('#sys-gear .gear');
  gear.className = 'gear ' + (plane.gearBroken ? 'moving' : plane.gearPos > 0.99 ? 'down' : plane.gearPos < 0.01 ? 'up' : 'moving');
  $('flaps-val').textContent = `${Math.round(plane.flapPos * 10)}°`;
  setSys('sys-brake', plane.brake ? 'warn' : null);
  setSys('sys-park', plane.parkingBrake ? 'bad' : null);
  setSys('sys-lights', plane.lights ? 'on' : null);

  // alarmes
  const w = [];
  if (!plane.onGround && !plane.crashed) {
    if (plane.speed < plane.stallSpeed * 1.12) w.push(['DÉCROCHAGE', '']);
    if (plane.gearPos < 0.95 && agl < 150 && plane.throttle < 0.4 && plane.velocity.y < 0) w.push(['TRAIN !', '']);
    if (plane.gearPos > 0.3 && plane.speed > SPECS.vGear) w.push(['VITESSE TRAIN', 'amber']);
    if (agl < 60 && plane.velocity.y < -8) w.push(['TERRAIN', '']);
  }
  if (plane.flapPos > 0.2 && plane.speed > SPECS.vFlaps) w.push(['VITESSE VOLETS', 'amber']);
  if (settings.fuel && plane.fuel < SPECS.fuelCapacity * 0.15) w.push(['CARBURANT', plane.fuel < SPECS.fuelCapacity * 0.05 ? '' : 'amber']);
  const key = w.map((x) => x[0]).join();
  if (key !== warnKey) {
    warnKey = key;
    $('warnings').innerHTML = w.map(([t, c]) => `<span class="${c}">${t}</span>`).join('');
  }
}

function updatePlace() {
  const a = AIRPORTS.find((x) => Math.hypot(x.x - plane.pos.x, x.z - plane.pos.z) < 3000);
  $('place').textContent = `📍 ${a ? a.name : nearestPlaceName(plane.pos.x, plane.pos.z)}`;
}

// ================= Boucle =================
let last = performance.now();
let mapTimer = 0, labelTimer = 0, placeTimer = 0, stallBeep = 0;

function simulate(dt) {
  const input = readInput();
  plane.trim = THREE.MathUtils.clamp(plane.trim + input.trim * dt * 0.25, -0.5, 0.5);
  plane.update(dt, input, { difficulty: settings.difficulty, fuel: settings.fuel, sensitivity: settings.sensitivity });
  if (input.refuel && canRefuel()) plane.refuel(dt);
  // limite de la carte : on renvoie l'avion vers le centre
  const lim = HALF * 0.97;
  if (Math.abs(plane.pos.x) > lim || Math.abs(plane.pos.z) > lim) {
    plane.pos.x = THREE.MathUtils.clamp(plane.pos.x, -lim, lim);
    plane.pos.z = THREE.MathUtils.clamp(plane.pos.z, -lim, lim);
    plane.quat.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI * dt));
    toast('Limite de la carte — fais demi-tour !');
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const realDt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const wallT = Date.now() / 1000; // horloge commune : bateaux et montgolfières identiques pour tous

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
        toast(`Nouvel aéroport découvert : ${plane.landedAt.name}`);
      }
      persist();
    }

    planeMesh.position.copy(plane.pos);
    planeMesh.quaternion.copy(plane.quat);
    animatePlaneMesh(planeMesh, { ...plane.ctrl, rpm: plane.rpm, gearPos: plane.gearPos, flapPos: plane.flapPos, lights: plane.lights }, realDt, wallT);

    updatePrompt();
    updateCamera(realDt);
    updateHUD();
    netTick(now);

    mapTimer -= realDt;
    if (mapTimer <= 0) {
      mapTimer = 0.1;
      if (settings.minimap) drawMap($('minimap'), plane.pos.x, plane.pos.z, 8000, false);
      if (!$('bigmap').classList.contains('hidden')) drawBigMap();
    }
    placeTimer -= realDt;
    if (placeTimer <= 0) { placeTimer = 1; updatePlace(); }

    if (audio) {
      const v = settings.volume;
      audio.osc.frequency.value = 40 + plane.rpm * 90;
      audio.gain.gain.value = plane.crashed || paused ? 0 : plane.rpm * 0.08 * v;
      audio.wg.gain.value = paused ? 0 : Math.min(0.12, plane.speed * plane.speed * 0.00003) * v;
      stallBeep -= realDt;
      if (warnKey.includes('DÉCROCHAGE') && stallBeep <= 0) { beep(1200, 0.15, 0.08); stallBeep = 0.4; }
    }
  } else {
    const t = (now / 1000) * 0.04;
    const a = airportById(save.lastAirport) || AIRPORTS[0];
    camera.position.set(a.x + Math.sin(t) * 2500, a.elev + 700, a.z + Math.cos(t) * 2500);
    camera.lookAt(a.x, a.elev + 100, a.z);
  }

  terrain.update(plane.pos.x, plane.pos.z, camera.position.x, camera.position.z, started ? 5 : 12);
  decor.update(plane.pos.x, plane.pos.z, started ? 3 : 8);
  labelTimer -= realDt;
  if (labelTimer <= 0) { labelTimer = 0.5; updateLabels(camera.position); }
  world.update(realDt, wallT);
  updateAtmosphere(wallT);

  // autres joueurs : interpolation douce
  const k = 1 - Math.exp(-realDt * 8);
  for (const r of remotes.values()) {
    r.mesh.position.lerp(r.tp, k);
    r.mesh.quaternion.slerp(r.tq, k);
    animatePlaneMesh(r.mesh, r.st, realDt, wallT);
  }

  renderer.render(scene, camera);
}

const sunTmp = new THREE.Color();
function updateAtmosphere(t) {
  atmo.follow(started ? plane.pos : camera.position, camera.position);
  const w = terrain.water.material.uniforms;
  w.time.value = t % 10000;
  w.sunDir.value.copy(atmo.sunDir);
  w.sunColor.value.copy(atmo.sun.color).multiplyScalar(atmo.sun.intensity * 0.35);
  w.skyZenith.value.copy(atmo.zenith);
  w.skyHorizon.value.copy(atmo.horizon);
  if (world) {
    const c = world.clouds.material.uniforms;
    sunTmp.copy(atmo.sun.color).multiplyScalar(0.6 + atmo.sun.intensity * 0.35);
    c.litColor.value.copy(sunTmp);
    c.shadowColor.value.copy(atmo.horizon).multiplyScalar(0.75);
  }
}

// ================= Démarrage =================
$('pilot-name').value = save.name;
const tick = () => new Promise((res) => setTimeout(res, 20));
(async () => {
  applySettings();
  status('Construction du terrain…');
  await tick();
  const a = airportById(save.lastAirport) || AIRPORTS[0];
  plane.placeOnRunway(a);
  terrain.buildAround(a.x, a.z, 4);
  status('Aéroports, villes et monuments…');
  await tick();
  world = buildWorldObjects(scene);
  applySettings('clouds');
  quests = new QuestSystem({
    scene, plane, getSave: () => save, persist, toast, beep, logMsg,
    setPaused: (v) => { paused = v; },
  });
  status('Dessin de la carte…');
  await tick();
  buildMapImage();
  status('Prêt !');
  $('start').disabled = false;
  requestAnimationFrame(frame);
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
  connect();
  toast('Bienvenue ! E pour démarrer le moteur, H pour l\'aide.');
};

// accès console pour le débogage : jp.plane, jp.renderer.info…
window.jp = { plane, renderer, settings, quests: () => quests };
