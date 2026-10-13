import * as THREE from 'three';
import {
  WORLD, AIRPORTS, RUNWAY, LANDMARKS, QUESTS, heightGrid, heightAt, rng, fbm, smoothstep, runwayLocal,
} from './world.js';
import { Plane, createPlaneMesh, SPECS } from './plane.js';

const $ = (id) => document.getElementById(id);
const HALF = WORLD.size / 2;
const N = WORLD.segments + 1;
const STEP = WORLD.size / WORLD.segments;

// ================= Rendu =================
const renderer = new THREE.WebGLRenderer({ canvas: $('game'), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);

const SKY = 0x9cc8ee;
const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 2500, 15000);

const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.5, 40000);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

scene.add(new THREE.HemisphereLight(0xdbeeff, 0x4a5a3a, 0.9));
const sun = new THREE.DirectionalLight(0xfff3dd, 1.6);
sun.position.set(3000, 5000, 2000);
scene.add(sun);

// ================= Terrain =================
function terrainColor(h, slope, x, z, out) {
  const n = fbm(x / 400, z / 400, 2, 5);
  if (h < 4) return out.setRGB(0.86, 0.8, 0.6); // sable
  if (h > 1050 + n * 150) return out.setRGB(0.95, 0.97, 1); // neige
  if (slope > 0.75 || h > 700 + n * 200) return out.setRGB(0.48 + n * 0.1, 0.45 + n * 0.08, 0.42); // roche
  const g = 0.45 + n * 0.25;
  return out.setRGB(0.25 * g + 0.08, 0.55 * g + 0.12, 0.18 * g);
}

function buildTerrain() {
  const pos = new Float32Array(N * N * 3);
  const col = new Float32Array(N * N * 3);
  const c = new THREE.Color();
  for (let iz = 0; iz < N; iz++) {
    for (let ix = 0; ix < N; ix++) {
      const i = iz * N + ix;
      const x = -HALF + ix * STEP, z = -HALF + iz * STEP, h = heightGrid[i];
      pos[i * 3] = x; pos[i * 3 + 1] = h; pos[i * 3 + 2] = z;
      const hx = heightGrid[iz * N + Math.min(N - 1, ix + 1)] - heightGrid[iz * N + Math.max(0, ix - 1)];
      const hz = heightGrid[Math.min(N - 1, iz + 1) * N + ix] - heightGrid[Math.max(0, iz - 1) * N + ix];
      const slope = Math.hypot(hx, hz) / (2 * STEP);
      terrainColor(h, slope, x, z, c);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
  }
  const idx = new Uint32Array((N - 1) * (N - 1) * 6);
  let k = 0;
  for (let iz = 0; iz < N - 1; iz++) {
    for (let ix = 0; ix < N - 1; ix++) {
      const a = iz * N + ix, b = a + 1, cc = a + N, d = cc + 1;
      idx[k++] = a; idx[k++] = cc; idx[k++] = b;
      idx[k++] = b; idx[k++] = cc; idx[k++] = d;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  scene.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })));

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.size * 4, WORLD.size * 4).rotateX(-Math.PI / 2),
    new THREE.MeshPhongMaterial({ color: 0x2a7fb8, shininess: 80, transparent: true, opacity: 0.88 }),
  );
  water.position.y = 0.5;
  scene.add(water);
}

// ================= Labels =================
function makeLabel(text, { color = '#fff', size = 0.035, bg = 'rgba(0,0,0,0.45)', depthTest = true } = {}) {
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d');
  ctx.font = 'bold 40px system-ui, sans-serif';
  const w = Math.ceil(ctx.measureText(text).width) + 30;
  cv.width = w; cv.height = 60;
  ctx.font = 'bold 40px system-ui, sans-serif';
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, 60);
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 15, 32);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, sizeAttenuation: false, depthTest, fog: false }));
  sp.scale.set((size * w) / 60, size, 1);
  sp.renderOrder = 10;
  return sp;
}

// ================= Aéroports =================
function runwayTexture() {
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 1024;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#3b3f45';
  ctx.fillRect(0, 0, 64, 1024);
  ctx.fillStyle = '#e8e8e8';
  for (let y = 60; y < 964; y += 50) ctx.fillRect(30, y, 4, 26); // axe
  ctx.fillRect(2, 0, 3, 1024); ctx.fillRect(59, 0, 3, 1024);
  for (let i = 0; i < 6; i++) { ctx.fillRect(8 + i * 8, 6, 4, 34); ctx.fillRect(8 + i * 8, 984, 4, 34); }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function buildAirports() {
  const rwMat = new THREE.MeshLambertMaterial({ map: runwayTexture(), polygonOffset: true, polygonOffsetFactor: -4 });
  const hangarMat = new THREE.MeshLambertMaterial({ color: 0xb8c0c8 });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x8a3b32 });
  const towerMat = new THREE.MeshLambertMaterial({ color: 0xeeeeee });
  for (const a of AIRPORTS) {
    const g = new THREE.Group();
    g.position.set(a.x, a.elev, a.z);
    g.rotation.y = -a.heading;
    const rw = new THREE.Mesh(new THREE.PlaneGeometry(RUNWAY.width, RUNWAY.length).rotateX(-Math.PI / 2), rwMat);
    rw.position.y = 0.15;
    g.add(rw);
    for (let i = 0; i < 3; i++) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(40, 14, 30), hangarMat);
      h.position.set(90, 7, -200 + i * 50);
      const r = new THREE.Mesh(new THREE.BoxGeometry(42, 2, 32), roofMat);
      r.position.set(90, 15, -200 + i * 50);
      g.add(h, r);
    }
    const tw = new THREE.Mesh(new THREE.CylinderGeometry(4, 5, 30, 8), towerMat);
    tw.position.set(80, 15, 120);
    const cab = new THREE.Mesh(new THREE.CylinderGeometry(7, 6, 6, 8), new THREE.MeshLambertMaterial({ color: 0x5aa0d0 }));
    cab.position.set(80, 33, 120);
    g.add(tw, cab);
    const label = makeLabel('🛬 ' + a.name, { color: '#9fe3ff' });
    label.position.set(0, 120, 0);
    g.add(label);
    scene.add(g);
  }
}

// ================= Végétation, villes, nuages =================
function nearRunway(x, z, margin) {
  for (const a of AIRPORTS) {
    const { u, v } = runwayLocal(a, x, z);
    if (Math.abs(u) < 150 + margin && Math.abs(v) < RUNWAY.length / 2 + margin) return true;
  }
  return false;
}

function buildTrees() {
  const r = rng(42);
  const COUNT = 9000;
  const geo = new THREE.ConeGeometry(6, 22, 6).translate(0, 11, 0);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0x2f6b2a, flatShading: true }), COUNT);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  let n = 0;
  for (let tries = 0; tries < COUNT * 12 && n < COUNT; tries++) {
    const x = (r() - 0.5) * WORLD.size, z = (r() - 0.5) * WORLD.size;
    const h = heightAt(x, z);
    if (h < 15 || h > 650) continue;
    if (fbm(x / 1500, z / 1500, 3, 77) < 0.52) continue; // forêts en bosquets
    if (Math.abs(heightAt(x + 20, z) - h) > 12) continue;
    if (nearRunway(x, z, 80)) continue;
    const k = 0.7 + r() * 0.8;
    m.compose(p.set(x, h - 1, z), q, s.set(k, k * (0.8 + r() * 0.5), k));
    mesh.setMatrixAt(n++, m);
  }
  mesh.count = n;
  scene.add(mesh);
}

function buildCities() {
  const r = rng(7);
  const centers = [
    { x: -5300, z: 4100, n: 140, spread: 500 },
    { x: 500, z: 900, n: 90, spread: 450 },
    { x: 5900, z: 3500, n: 70, spread: 400 },
  ];
  const total = centers.reduce((s, c) => s + c.n, 0);
  const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff }), total);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const palette = [0xd9d2c5, 0xc7b8a3, 0xe8e2d5, 0xa9b4c0, 0xd6a77a, 0xf0ede6];
  const col = new THREE.Color();
  let n = 0;
  for (const c of centers) {
    for (let i = 0; i < c.n * 4 && n < total; i++) {
      const x = c.x + (r() - 0.5) * c.spread * 2, z = c.z + (r() - 0.5) * c.spread * 2;
      const h = heightAt(x, z);
      if (h < 3 || nearRunway(x, z, 60)) continue;
      const d = Math.hypot(x - c.x, z - c.z) / c.spread;
      const tall = 8 + r() * 25 * Math.max(0.2, 1 - d) * (r() < 0.1 ? 3 : 1);
      m.compose(p.set(x, h - 2, z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 3), s.set(14 + r() * 16, tall, 14 + r() * 16));
      mesh.setMatrixAt(n, m);
      mesh.setColorAt(n, col.setHex(palette[Math.floor(r() * palette.length)]));
      n++;
    }
  }
  mesh.count = n;
  scene.add(mesh);
}

function buildClouds() {
  const r = rng(99);
  const COUNT = 260;
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x9aa4ad, flatShading: true, transparent: true, opacity: 0.9 }), COUNT);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  let n = 0;
  for (let c = 0; c < COUNT / 5; c++) {
    const cx = (r() - 0.5) * WORLD.size * 1.2, cz = (r() - 0.5) * WORLD.size * 1.2, cy = 1500 + r() * 900;
    for (let j = 0; j < 5; j++) {
      const k = 120 + r() * 160;
      m.compose(p.set(cx + (r() - 0.5) * 400, cy + (r() - 0.5) * 60, cz + (r() - 0.5) * 300), q, s.set(k * 1.6, k * 0.55, k));
      mesh.setMatrixAt(n++, m);
    }
  }
  scene.add(mesh);
}

// ================= Points d'intérêt =================
function buildLandmarks() {
  const white = new THREE.MeshLambertMaterial({ color: 0xf4f4f4 });
  const red = new THREE.MeshLambertMaterial({ color: 0xc8352b });
  const rock = new THREE.MeshLambertMaterial({ color: 0x8b7e6f, flatShading: true });
  for (const l of LANDMARKS) {
    const g = new THREE.Group();
    const ground = Math.max(0, heightAt(l.x, l.z));
    g.position.set(l.x, ground, l.z);
    if (l.type === 'lighthouse') {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(40, 60, 20, 8), rock);
      base.position.y = 5;
      g.add(base);
      for (let i = 0; i < 5; i++) {
        const seg = new THREE.Mesh(new THREE.CylinderGeometry(8 - i * 0.6, 8.6 - i * 0.6, 12, 12), i % 2 ? red : white);
        seg.position.y = 21 + i * 12;
        g.add(seg);
      }
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(5, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffee88 }));
      lamp.position.y = 82;
      g.add(lamp);
    } else if (l.type === 'tower') {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 6, 220, 4), red);
      t.position.y = 110;
      g.add(t);
      for (let i = 1; i < 5; i++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(10 - i, 2, 10 - i), white);
        b.position.y = i * 45;
        g.add(b);
      }
    } else if (l.type === 'arch') {
      const arch = new THREE.Mesh(new THREE.TorusGeometry(110, 28, 8, 20, Math.PI), rock);
      arch.position.y = -10;
      g.add(arch);
    } else if (l.type === 'wreck') {
      const hull = new THREE.Mesh(new THREE.BoxGeometry(18, 10, 70), new THREE.MeshLambertMaterial({ color: 0x5b3a26 }));
      hull.rotation.set(0.15, 0.6, 0.35);
      hull.position.y = 2;
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 30), new THREE.MeshLambertMaterial({ color: 0x3a2a1c }));
      mast.rotation.z = 0.5;
      mast.position.set(4, 14, 0);
      g.add(hull, mast);
    } else if (l.type === 'summit') {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 16), white);
      pole.position.y = 8;
      const flag = new THREE.Mesh(new THREE.BoxGeometry(8, 5, 0.3), red);
      flag.position.set(4, 13.5, 0);
      g.add(pole, flag);
    }
    const label = makeLabel(l.name, { color: '#ffe9b0', size: 0.03 });
    label.position.y = l.type === 'tower' ? 260 : 140;
    g.add(label);
    scene.add(g);
  }
}

// ================= Joueur =================
const plane = new Plane();
const planeMesh = createPlaneMesh();
scene.add(planeMesh);

// ================= Sauvegarde =================
const SAVE_KEY = 'jpairlines-save';
let save = { name: '', money: 0, completed: [], lastAirport: 'alpha' };
try { Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY)) || {}); } catch { /* sauvegarde absente */ }
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* stockage indisponible */ } };

// ================= Quêtes =================
const ringGeo = new THREE.TorusGeometry(1, 0.07, 8, 32);
const ringMat = new THREE.MeshBasicMaterial({ color: 0xffc928, fog: false });
const ringNextMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, fog: false });
const beamMat = new THREE.MeshBasicMaterial({ color: 0xffc928, transparent: true, opacity: 0.35, depthWrite: false, fog: false });

const quest = { active: null, step: 0, objects: [], marker: null };
const givers = [];

function stepPos(st) {
  if (st.type === 'land') {
    const a = AIRPORTS.find((x) => x.id === st.airport);
    return new THREE.Vector3(a.x, a.elev, a.z);
  }
  if (st.type === 'ring') return new THREE.Vector3(st.x, Math.max(0, heightAt(st.x, st.z)) + st.agl, st.z);
  if (st.type === 'reach') return new THREE.Vector3(st.x, Math.max(0, heightAt(st.x, st.z)), st.z);
  return null;
}

function stepText(st) {
  if (st.type === 'ring') return 'Passe dans l\'anneau jaune';
  if (st.type === 'land') return `Pose-toi et arrête-toi à ${AIRPORTS.find((a) => a.id === st.airport).name}`;
  if (st.type === 'reach') return `Rejoins : ${st.label}` + (st.maxAgl ? ` (à moins de ${st.maxAgl} m du sol)` : '');
  if (st.type === 'altitude') return `Monte au-dessus de ${st.min} m`;
  return '';
}

const questAvailable = (q) => !save.completed.includes(q.id) && (!q.requires || save.completed.includes(q.requires));

function buildGivers() {
  for (const q of QUESTS) {
    const y = Math.max(0, heightAt(q.giver.x, q.giver.z));
    const g = new THREE.Group();
    g.position.set(q.giver.x, y, q.giver.z);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(25, 25, 500, 16, 1, true), beamMat);
    beam.position.y = 250;
    const label = makeLabel('! ' + q.title, { color: '#ffd23f', size: 0.032, depthTest: false });
    label.position.y = 520;
    g.add(beam, label);
    scene.add(g);
    givers.push({ q, g });
  }
  refreshGivers();
}

function refreshGivers() {
  for (const { q, g } of givers) g.visible = questAvailable(q) && quest.active !== q;
}

function clearQuestObjects() {
  for (const o of quest.objects) scene.remove(o);
  quest.objects = [];
}

function showStep() {
  clearQuestObjects();
  const q = quest.active;
  if (!q) return;
  const st = q.steps[quest.step];
  const p = stepPos(st);
  if (st.type === 'ring') {
    const prev = quest.step > 0 ? stepPos(q.steps[quest.step - 1]) : plane.pos.clone();
    for (let k = 0; k < 2; k++) {
      const s2 = q.steps[quest.step + k];
      if (!s2 || s2.type !== 'ring') break;
      const r = new THREE.Mesh(ringGeo, k === 0 ? ringMat : ringNextMat);
      r.scale.setScalar(s2.size || 30);
      r.position.copy(stepPos(s2));
      r.lookAt(k === 0 ? prev : p);
      scene.add(r);
      quest.objects.push(r);
    }
  } else if (p) {
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(st.radius || 60, st.radius || 60, 3000, 24, 1, true), beamMat);
    beam.position.set(p.x, p.y + 1500, p.z);
    scene.add(beam);
    quest.objects.push(beam);
  }
  $('quest-box').classList.remove('hidden');
  $('quest-title').textContent = `${q.title} (${quest.step + 1}/${q.steps.length})`;
  $('quest-step').textContent = stepText(st);
}

function startQuest(q) {
  quest.active = q;
  quest.step = 0;
  refreshGivers();
  showStep();
  toast(`Nouvelle quête : ${q.title}`);
}

function stopQuest() {
  clearQuestObjects();
  quest.active = null;
  $('quest-box').classList.add('hidden');
  $('arrow').classList.add('hidden');
  refreshGivers();
}

function completeStep() {
  const q = quest.active;
  quest.step++;
  if (quest.step >= q.steps.length) {
    save.money += q.reward;
    if (!save.completed.includes(q.id)) save.completed.push(q.id);
    persist();
    stopQuest();
    toast(`✅ ${q.title} terminée ! +${q.reward} ₣`);
    beep(880, 0.25);
  } else {
    beep(660, 0.12);
    showStep();
  }
}

function updateQuest() {
  const q = quest.active;
  if (!q) return;
  const st = q.steps[quest.step];
  const p = stepPos(st);
  const agl = plane.pos.y - Math.max(0, heightAt(plane.pos.x, plane.pos.z));
  let done = false;
  if (st.type === 'ring') done = plane.pos.distanceTo(p) < (st.size || 30) + 4;
  else if (st.type === 'land') done = plane.landedAt?.id === st.airport;
  else if (st.type === 'reach') done = Math.hypot(plane.pos.x - p.x, plane.pos.z - p.z) < st.radius && (!st.maxAgl || agl < st.maxAgl);
  else if (st.type === 'altitude') done = plane.pos.y >= st.min;

  // flèche de direction + distance
  if (p) {
    const dx = p.x - plane.pos.x, dz = p.z - plane.pos.z;
    const bearing = THREE.MathUtils.radToDeg(Math.atan2(dx, -dz));
    const rel = bearing - plane.headingDeg;
    $('arrow').classList.remove('hidden');
    $('arrow').style.transform = `rotate(${rel}deg)`;
    const d = Math.hypot(dx, dz);
    $('quest-dist').textContent = d > 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d)} m`;
  } else {
    $('arrow').classList.add('hidden');
    $('quest-dist').textContent = `Altitude : ${Math.round(plane.pos.y)} / ${st.min} m`;
  }
  if (done) completeStep();
}

let nearGiver = null;
function updateGivers() {
  nearGiver = null;
  for (const { q, g } of givers) {
    if (!g.visible) continue;
    const d = Math.hypot(plane.pos.x - g.position.x, plane.pos.z - g.position.z);
    if (d < 300 && plane.pos.y - g.position.y < 600) nearGiver = q;
  }
  const pr = $('prompt');
  if (nearGiver && !plane.crashed) {
    pr.innerHTML = `<b>${nearGiver.title}</b> — ${nearGiver.desc}<br>Récompense : ${nearGiver.reward} ₣ · <kbd>F</kbd> pour accepter`
      + (quest.active ? '<br><small>(remplace la quête en cours)</small>' : '');
    pr.classList.remove('hidden');
  } else pr.classList.add('hidden');
}

function renderJournal() {
  const ul = $('quest-list');
  ul.innerHTML = '';
  for (const q of QUESTS) {
    const li = document.createElement('li');
    const done = save.completed.includes(q.id);
    li.className = done ? 'done' : quest.active === q ? 'active' : '';
    const status = done ? '✅ ' : quest.active === q ? '▶ ' : questAvailable(q) ? '❗ ' : '🔒 ';
    li.innerHTML = `<span class="r">${q.reward} ₣</span><b>${status}${q.title}</b><br><small>${q.desc}</small>`;
    ul.appendChild(li);
  }
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
    osc.connect(filter).connect(gain).connect(ctx.destination);
    osc.start();
    audio = { ctx, osc, gain };
  } catch { audio = null; }
}
function beep(freq, dur) {
  if (!audio) return;
  const o = audio.ctx.createOscillator();
  const g = audio.ctx.createGain();
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.15, audio.ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, audio.ctx.currentTime + dur);
  o.connect(g).connect(audio.ctx.destination);
  o.start();
  o.stop(audio.ctx.currentTime + dur);
}

// ================= Entrées clavier =================
const keys = new Set();
let invertPitch = false;
let camMode = 0;
addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (e.target.tagName === 'INPUT') return;
  if (k.startsWith('arrow') || k === ' ') e.preventDefault();
  keys.add(k);
  if (e.repeat || !started) return;
  if (k === 'c') camMode = (camMode + 1) % 2;
  if (k === 'm') { $('bigmap').classList.toggle('hidden'); drawMap($('bigmap-canvas'), 0, 0, WORLD.size, true); }
  if (k === 'j') { renderJournal(); $('journal').classList.toggle('hidden'); }
  if (k === 'i') { invertPitch = !invertPitch; toast(invertPitch ? 'Profondeur inversée' : 'Profondeur normale'); }
  if (k === 'r') respawn();
  if (k === 'f' && nearGiver) startQuest(nearGiver);
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());

function readInput() {
  const has = (...ks) => ks.some((k) => keys.has(k));
  let pitch = (has('arrowdown') ? 1 : 0) - (has('arrowup') ? 1 : 0);
  if (invertPitch) pitch = -pitch;
  return {
    pitch,
    roll: (has('arrowright') ? 1 : 0) - (has('arrowleft') ? 1 : 0),
    yaw: (has('d') ? 1 : 0) - (has('q', 'a') ? 1 : 0),
    throttle: (has('z', 'w', 'shift') ? 1 : 0) - (has('s', 'control') ? 1 : 0),
    brake: has(' '),
  };
}

function respawn() {
  const a = AIRPORTS.find((x) => x.id === save.lastAirport) || AIRPORTS[0];
  plane.placeOnRunway(a);
  camQuat.copy(plane.quat);
  $('crash').classList.add('hidden');
}

$('abandon').onclick = () => { stopQuest(); renderJournal(); };

// ================= Carte (minimap + grande carte) =================
const mapImg = document.createElement('canvas');
function buildMapImage() {
  const R = 400;
  mapImg.width = R; mapImg.height = R;
  const ctx = mapImg.getContext('2d');
  const img = ctx.createImageData(R, R);
  const c = new THREE.Color();
  for (let y = 0; y < R; y++) {
    for (let x = 0; x < R; x++) {
      const wx = -HALF + (x / R) * WORLD.size, wz = -HALF + (y / R) * WORLD.size;
      const h = heightAt(wx, wz);
      if (h < 0.5) c.setRGB(0.16, 0.45, 0.7); else terrainColor(h, 0, wx, wz, c);
      const shade = h < 0.5 ? 1 : 0.8 + Math.min(0.3, (heightAt(wx - 30, wz - 30) - h) / -60 * 0.1 + 0.1);
      const i = (y * R + x) * 4;
      img.data[i] = c.r * 255 * shade; img.data[i + 1] = c.g * 255 * shade; img.data[i + 2] = c.b * 255 * shade; img.data[i + 3] = 255;
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
  ctx.fillStyle = '#2a73b3';
  ctx.fillRect(0, 0, W, W);
  const k = mapImg.width / WORLD.size;
  ctx.drawImage(mapImg, (cx - span / 2 + HALF) * k, (cz - span / 2 + HALF) * k, span * k, span * k, 0, 0, W, W);

  ctx.font = `bold ${full ? 14 : 11}px system-ui`;
  for (const a of AIRPORTS) {
    ctx.fillStyle = '#9fe3ff';
    ctx.fillRect(toX(a.x) - 3, toY(a.z) - 3, 6, 6);
    if (full) ctx.fillText(a.name, toX(a.x) + 6, toY(a.z) + 4);
  }
  if (full) for (const l of LANDMARKS) { ctx.fillStyle = '#ffe9b0'; ctx.fillText('◆ ' + l.name, toX(l.x) - 5, toY(l.z) + 4); }
  for (const { q, g } of givers) {
    if (!g.visible) continue;
    ctx.fillStyle = '#ffd23f';
    ctx.fillText('!', toX(q.giver.x) - 2, toY(q.giver.z) + 4);
    if (full) ctx.fillText(q.title, toX(q.giver.x) + 6, toY(q.giver.z) + 4);
  }
  if (quest.active) {
    const p = stepPos(quest.active.steps[quest.step]);
    if (p) {
      ctx.strokeStyle = '#ffc928';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(toX(p.x), toY(p.z), 6, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  for (const r of remotes.values()) {
    ctx.fillStyle = '#ff7ad9';
    ctx.beginPath();
    ctx.arc(toX(r.mesh.position.x), toY(r.mesh.position.z), 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // avion du joueur
  ctx.save();
  ctx.translate(toX(plane.pos.x), toY(plane.pos.z));
  ctx.rotate(THREE.MathUtils.degToRad(plane.headingDeg));
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#000';
  ctx.beginPath();
  ctx.moveTo(0, -8); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.restore();
}

// ================= Multijoueur =================
const remotes = new Map();
const net = { ws: null, id: null, lastSend: 0 };
const REMOTE_COLORS = [0xffc4a3, 0xb5e3a1, 0xa3c9ff, 0xf7a3d9, 0xfff19c, 0xc2a3ff];

function connect() {
  if (!location.protocol.startsWith('http')) return;
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  net.ws = ws;
  ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', name: save.name }));
  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg.t === 'welcome') net.id = msg.id;
    if (msg.t === 'players') syncRemotes(msg.list);
  };
  ws.onclose = () => {
    net.ws = null;
    for (const id of [...remotes.keys()]) removeRemote(id);
    $('online').textContent = 'Hors ligne';
    setTimeout(connect, 3000);
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
      const label = makeLabel(p.name, { size: 0.028 });
      label.position.y = 6;
      mesh.add(label);
      mesh.position.fromArray(p.p);
      mesh.quaternion.fromArray(p.q);
      scene.add(mesh);
      r = { mesh, tp: new THREE.Vector3(), tq: new THREE.Quaternion(), speed: 0 };
      remotes.set(p.id, r);
    }
    r.tp.fromArray(p.p);
    r.tq.fromArray(p.q);
    r.speed = p.s || 0;
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
    s: r2(plane.speed),
  }));
}

// ================= Boucle =================
const camQuat = new THREE.Quaternion();
const camOffset = new THREE.Vector3();
const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.09);
let started = false;
let last = performance.now();

function updateCamera(dt) {
  if (camMode === 0) {
    camQuat.slerp(plane.quat, 1 - Math.exp(-dt * 4));
    camOffset.set(0, 4.5, 19).applyQuaternion(camQuat);
    camera.position.copy(plane.pos).add(camOffset);
    camera.quaternion.copy(camQuat).multiply(tilt);
  } else {
    camQuat.copy(plane.quat);
    camOffset.set(0, 1.1, -0.9).applyQuaternion(plane.quat);
    camera.position.copy(plane.pos).add(camOffset);
    camera.quaternion.copy(plane.quat);
  }
  planeMesh.visible = camMode === 0 || plane.crashed;
  const g = Math.max(0, heightAt(camera.position.x, camera.position.z)) + 1.5;
  if (camera.position.y < g) camera.position.y = g;
}

function updateHUD() {
  const agl = plane.pos.y - Math.max(0, heightAt(plane.pos.x, plane.pos.z)) - SPECS.gear;
  $('spd').textContent = Math.round(plane.speed * 3.6);
  $('alt').textContent = Math.round(plane.pos.y);
  $('agl').textContent = Math.max(0, Math.round(agl));
  $('vs').textContent = (plane.onGround ? 0 : plane.velocity.y).toFixed(1);
  $('hdg').textContent = String(Math.round(plane.headingDeg) % 360).padStart(3, '0');
  $('thr').style.width = `${plane.throttle * 100}%`;
  $('stall').classList.toggle('hidden', plane.onGround || plane.speed > SPECS.stall * 1.1);
  $('money').textContent = `${save.money} ₣`;
}

let mapTimer = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (started) {
    if (!plane.crashed) {
      plane.update(dt, readInput());
      if (plane.crashed) {
        $('crash-reason').textContent = plane.crashReason;
        $('crash').classList.remove('hidden');
        beep(110, 0.6);
      }
    }
    // limite de la carte : on renvoie l'avion vers l'île
    const lim = HALF * 0.98;
    if (Math.abs(plane.pos.x) > lim || Math.abs(plane.pos.z) > lim) {
      plane.pos.x = THREE.MathUtils.clamp(plane.pos.x, -lim, lim);
      plane.pos.z = THREE.MathUtils.clamp(plane.pos.z, -lim, lim);
      plane.quat.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI * dt));
      toast('Limite de la carte — fais demi-tour !');
    }
    if (plane.landedAt && save.lastAirport !== plane.landedAt.id) {
      save.lastAirport = plane.landedAt.id;
      persist();
    }

    planeMesh.position.copy(plane.pos);
    planeMesh.quaternion.copy(plane.quat);
    planeMesh.userData.prop.rotation.z += dt * (5 + plane.throttle * 60);

    updateQuest();
    updateGivers();
    updateCamera(dt);
    updateHUD();
    netTick(now);

    mapTimer -= dt;
    if (mapTimer <= 0) {
      mapTimer = 0.1;
      drawMap($('minimap'), plane.pos.x, plane.pos.z, 6000, false);
      if (!$('bigmap').classList.contains('hidden')) drawMap($('bigmap-canvas'), 0, 0, WORLD.size, true);
    }

    if (audio) {
      audio.osc.frequency.value = 45 + plane.throttle * 70 + plane.speed * 0.4;
      audio.gain.gain.value = plane.crashed ? 0 : 0.03 + plane.throttle * 0.05;
    }
  } else {
    // menu : petite rotation de caméra autour de la base
    const t = now / 1000 * 0.05;
    camera.position.set(Math.sin(t) * 1500, 500, Math.cos(t) * 1500);
    camera.lookAt(0, 100, 0);
  }

  // autres joueurs : interpolation douce
  const k = 1 - Math.exp(-dt * 8);
  for (const r of remotes.values()) {
    r.mesh.position.lerp(r.tp, k);
    r.mesh.quaternion.slerp(r.tq, k);
    r.mesh.userData.prop.rotation.z += dt * 40;
  }

  renderer.render(scene, camera);
}

// ================= Démarrage =================
$('pilot-name').value = save.name;
setTimeout(() => {
  buildTerrain();
  buildAirports();
  buildTrees();
  buildCities();
  buildClouds();
  buildLandmarks();
  buildGivers();
  buildMapImage();
  $('load-status').textContent = 'Carte prête !';
  $('start').disabled = false;
  requestAnimationFrame(frame);
}, 30);
$('start').disabled = true;

$('start').onclick = () => {
  save.name = ($('pilot-name').value.trim() || 'Pilote').slice(0, 16);
  persist();
  $('menu').classList.add('hidden');
  $('hud').classList.remove('hidden');
  initAudio();
  respawn();
  started = true;
  connect();
  toast('Bienvenue ! Les balises jaunes « ! » sont des quêtes.');
};
