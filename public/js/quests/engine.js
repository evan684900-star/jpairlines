// Moteur des quêtes : balises, tableau des missions, suivi des objectifs, chronos,
// missions de transport du jour et rangs de pilote.
import * as THREE from 'three';
import {
  AIRPORTS, LANDMARKS, CITIES, SHIPS, BALLOONS, terrainHeight, airportById, shipPosition, balloonPosition, rng, runwayLocal,
} from '../world.js';
import { QUESTS } from './index.js';
import { CATEGORIES, RANKS, nextTo } from './kit.js';
import { makeLabel } from '../objects.js';
import { TEX } from '../render/textures.js';

const $ = (id) => document.getElementById(id);
const ground = (x, z) => Math.max(0, terrainHeight(x, z));
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const fmtDist = (d) => (d > 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d)} m`);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const CAT_ICON = { course: '🏁', livraison: '📦', exploration: '🧭', voltige: '🌀', sauvetage: '🛟', tourisme: '📷', defi: '🏆', transport: '✈️' };

// ---------- Missions de transport du jour (identiques pour tous les joueurs) ----------
const CARGO = [
  { name: 'Passagers', what: 'des passagers', icon: '🧳' }, { name: 'Courrier', what: 'le courrier', icon: '✉️' },
  { name: 'Pièces détachées', what: 'des pièces détachées', icon: '⚙️' },
  { name: 'Médicaments', what: 'des médicaments', icon: '💊', urgent: true }, { name: 'Fruits frais', what: 'des fruits frais', icon: '🍊', urgent: true },
  { name: 'Journaux du matin', what: 'les journaux du matin', icon: '📰', urgent: true },
  { name: 'Matériel scientifique', what: 'du matériel scientifique', icon: '🔬' },
  { name: 'Touristes', what: 'un groupe de touristes', icon: '📷' }, { name: 'Colis express', what: 'un colis express', icon: '📦', urgent: true },
  { name: 'Équipe de tournage', what: 'une équipe de tournage', icon: '🎬' },
];
const hashStr = (s) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0;
export const dayKey = () => Math.floor(Date.now() / 86400000);

export function jobsFor(a, day = dayKey()) {
  const r = rng(hashStr(a.id) ^ Math.imul(day, 2654435761));
  const cands = AIRPORTS.filter((b) => b !== a && Math.hypot(b.x - a.x, b.z - a.z) > 5000 && Math.hypot(b.x - a.x, b.z - a.z) < 45000);
  const jobs = [];
  for (let k = 0; k < 3 && cands.length; k++) {
    const dest = cands.splice(Math.floor(r() * cands.length), 1)[0];
    const cargo = CARGO[Math.floor(r() * CARGO.length)];
    const d = Math.hypot(dest.x - a.x, dest.z - a.z);
    let reward = Math.round((120 + d * 0.022) / 10) * 10;
    const job = {
      id: `job:${a.id}:${day}:${k}`, job: true, category: 'transport', airport: a.id,
      title: `${cargo.icon} ${cargo.name} → ${dest.name}`,
      desc: `Transporte ${cargo.what} de ${a.name} à ${dest.name} (${(d / 1000).toFixed(1)} km).`,
      steps: [{ type: 'land', airport: dest.id }],
    };
    if (cargo.urgent) {
      job.timeLimit = Math.round(d / 42 + 240);
      reward = Math.round((reward * 1.4) / 10) * 10;
      job.desc += ` Urgent : ${fmtTime(job.timeLimit)} maximum !`;
    }
    job.reward = reward;
    jobs.push(job);
  }
  return jobs;
}

// ---------- Objets de mission ----------
const MAT = {
  orange: new THREE.MeshStandardMaterial({ color: 0xff6a1a, roughness: 0.6 }),
  red: new THREE.MeshStandardMaterial({ color: 0xc8261e, roughness: 0.6 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x8a6238, roughness: 0.9 }),
  white: new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.6 }),
  skin: new THREE.MeshStandardMaterial({ color: 0xd9a77e, roughness: 0.8 }),
  blue: new THREE.MeshStandardMaterial({ color: 0x2a4bd8, roughness: 0.6 }),
};

function smokeColumn(color = 0xff7a2a) {
  const g = new THREE.Group();
  const mat = new THREE.SpriteMaterial({ map: TEX.puff, color, transparent: true, depthWrite: false, opacity: 0.9 });
  for (let i = 0; i < 14; i++) {
    const sp = new THREE.Sprite(mat);
    sp.userData.t = i / 14;
    g.add(sp);
  }
  g.userData.update = (dt) => {
    for (const sp of g.children) {
      sp.userData.t = (sp.userData.t + dt * 0.12) % 1;
      const t = sp.userData.t;
      sp.position.set(t * 25, 4 + t * 140, Math.sin(t * 6 + sp.id) * 6);
      sp.scale.setScalar(8 + t * 45);
      sp.material.opacity = 0.9 * (1 - t);
    }
  };
  return g;
}

function person(mat = MAT.blue) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.9, 4, 8), mat);
  body.position.y = 0.8;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), MAT.skin);
  head.position.y = 1.65;
  g.add(body, head);
  return g;
}

function spawnMesh(kind) {
  const g = new THREE.Group();
  if (kind === 'raft') {
    const raft = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.45, 8, 16).rotateX(Math.PI / 2), MAT.orange);
    raft.position.y = 0.3;
    const p = person();
    p.scale.setScalar(0.9);
    g.add(raft, p, smokeColumn());
  } else if (kind === 'hiker' || kind === 'tent') {
    const tent = new THREE.Mesh(new THREE.ConeGeometry(1.8, 1.8, 4), MAT.orange);
    tent.position.y = 0.9;
    g.add(tent);
    if (kind === 'hiker') {
      const p = person(MAT.red);
      p.position.set(2.5, 0, 0);
      g.add(p, smokeColumn(0xff3020));
    }
  } else if (kind === 'crate') {
    const c = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), MAT.wood);
    c.position.y = 1;
    g.add(c, smokeColumn(0x30c050));
  } else if (kind === 'smoke') {
    g.add(smokeColumn(0xffd23f));
  } else if (kind === 'flag') {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 8), MAT.white);
    pole.position.y = 4;
    const flag = new THREE.Mesh(new THREE.BoxGeometry(3, 1.8, 0.05), MAT.red);
    flag.position.set(1.5, 7, 0);
    g.add(pole, flag);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// ---------- Matériaux des repères ----------
const ringGeo = new THREE.TorusGeometry(1, 0.07, 8, 40);
const ringMat = new THREE.MeshBasicMaterial({ color: 0xffc928, fog: false, toneMapped: false });
const ringNextMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, fog: false, toneMapped: false });
const beamMat = new THREE.MeshBasicMaterial({ color: 0xffc928, transparent: true, opacity: 0.3, depthWrite: false, fog: false, toneMapped: false });
const giverMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.28, depthWrite: false, fog: false, toneMapped: false });
const targetMat = new THREE.MeshBasicMaterial({ color: 0xff5a2a, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
const aimMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false });

export class QuestSystem {
  // ctx : { scene, plane, getSave, persist, toast, beep, logMsg, setPaused }
  constructor(ctx) {
    Object.assign(this, ctx);
    this.quests = QUESTS;
    this.byId = new Map(QUESTS.map((q) => [q.id, q]));
    this.active = null; // { q, step, elapsed, timer, touched, objects[], moving }
    this.clusters = [];
    this.drops = [];
    this.dropRequested = false;
    this.nearCluster = null;
    this.boardAirport = null;
    this.buildClusters();
  }

  get save() { return this.getSave(); }

  // ----- progression -----
  ensureSave() {
    const s = this.save;
    if (!Array.isArray(s.completed)) s.completed = [];
    if (typeof s.xp !== 'number') s.xp = s.money || 0;
    const day = dayKey();
    if (!s.jobs || s.jobs.day !== day) s.jobs = { day, done: [] };
    return s;
  }
  rankIndex(xp = this.ensureSave().xp) {
    let r = 0;
    RANKS.forEach((k, i) => { if (xp >= k.xp) r = i; });
    return r;
  }
  isDone(q) { return q.job ? this.ensureSave().jobs.done.includes(q.id) : this.ensureSave().completed.includes(q.id); }
  lockReason(q) {
    const missing = [q.requires].flat().filter(Boolean).filter((id) => !this.save.completed.includes(id));
    if (missing.length) return `Termine d'abord « ${missing.map((id) => this.byId.get(id)?.title || id).join(' », « ')} »`;
    if (q.minRank && this.rankIndex() < q.minRank) return `Rang requis : ${RANKS[q.minRank].name}`;
    return '';
  }
  isAvailable(q) { return !this.isDone(q) && !this.lockReason(q); }

  // ----- balises (regroupées par lieu) -----
  giverPoint(q) {
    if (q.airport) {
      const a = airportById(q.airport);
      return nextTo(a, a.width / 2 + 95, a.length * 0.22);
    }
    return q.giver;
  }
  buildClusters() {
    for (const q of this.quests) {
      const p = this.giverPoint(q);
      let c = q.airport
        ? this.clusters.find((k) => k.airport === q.airport)
        : this.clusters.find((k) => !k.airport && Math.hypot(k.x - p.x, k.z - p.z) < 600);
      if (!c) {
        c = { x: p.x, z: p.z, airport: q.airport || null, quests: [] };
        this.clusters.push(c);
      }
      c.quests.push(q);
    }
    for (const c of this.clusters) {
      const y = ground(c.x, c.z);
      const g = new THREE.Group();
      g.position.set(c.x, y, c.z);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(18, 18, 500, 16, 1, true), giverMat);
      beam.position.y = 250;
      g.add(beam);
      this.scene.add(g);
      c.group = g;
      c.y = y;
    }
    this.refreshClusters();
  }
  refreshClusters() {
    for (const c of this.clusters) {
      const avail = c.quests.filter((q) => this.isAvailable(q) && this.active?.q !== q);
      c.available = avail.length;
      c.group.visible = avail.length > 0;
      const text = avail.length === 1 ? `! ${avail[0].title}` : `! ${avail.length} quêtes`;
      if (c.labelText !== text) {
        if (c.label) c.group.remove(c.label);
        c.label = makeLabel(text, { color: '#ffd23f', size: 0.027, depthTest: false });
        c.label.position.y = 520;
        c.group.add(c.label);
        c.labelText = text;
      }
    }
  }

  // ----- tableau des missions -----
  boardContext() {
    const p = this.plane.pos;
    const agl = p.y - ground(p.x, p.z);
    let airport = null;
    if (this.plane.onGround && this.plane.speed < 3) {
      airport = AIRPORTS.find((a) => Math.hypot(a.x - p.x, a.z - p.z) < a.length / 2 + 800) || null;
    }
    const cluster = this.clusters.find((c) => c.available > 0 && Math.hypot(c.x - p.x, c.z - p.z) < 400 && agl < 700) || null;
    if (!airport && cluster?.airport && this.plane.onGround) airport = airportById(cluster.airport);
    return { airport, cluster };
  }
  canOpenBoard() {
    if (this.plane.crashed) return false;
    const { airport, cluster } = this.boardContext();
    return !!(airport || cluster);
  }
  openBoard() {
    const { airport, cluster } = this.boardContext();
    if (!airport && !cluster) return false;
    const quests = new Set();
    if (cluster) cluster.quests.forEach((q) => quests.add(q));
    if (airport) this.clusters.filter((c) => c.airport === airport.id).forEach((c) => c.quests.forEach((q) => quests.add(q)));
    const jobs = airport ? jobsFor(airport) : [];
    const place = airport ? airport.name : this.placeName(cluster.x, cluster.z);
    const s = this.ensureSave();
    const item = (q) => {
      const done = this.isDone(q), lock = this.lockReason(q), active = this.active?.q.id === q.id;
      const extra = [q.timeLimit ? `⏱ ${fmtTime(q.timeLimit)}` : '', q.bonusTime ? `bonus +${q.bonusReward} ₣ en moins de ${fmtTime(q.bonusTime)}` : ''].filter(Boolean).join(' · ');
      const btn = done ? '<span class="tag done">✅ Terminée</span>'
        : active ? '<span class="tag">▶ En cours</span>'
          : lock ? `<span class="tag lock">🔒 ${esc(lock)}</span>`
            : `<button data-accept="${esc(q.id)}">Accepter</button>`;
      return `<li class="${done ? 'done' : ''}"><div><b>${q.job ? '' : `${CAT_ICON[q.category] || ''} `}${esc(q.title)}</b> <span class="r">${q.reward} ₣</span><br>
        <small>${esc(q.desc)}</small>${extra ? `<br><small class="extra">${esc(extra)}</small>` : ''}</div>${btn}</li>`;
    };
    const qs = [...quests].sort((a, b) => this.isDone(a) - this.isDone(b) || a.reward - b.reward);
    $('board-title').textContent = `Tableau des missions — ${place}`;
    $('board-rank').textContent = `${RANKS[this.rankIndex()].name} · ${s.xp} XP`;
    $('board-list').innerHTML = (qs.length ? `<h3>Quêtes</h3><ul>${qs.map(item).join('')}</ul>` : '')
      + (jobs.length ? `<h3>Missions de transport du jour</h3><ul>${jobs.map(item).join('')}</ul>` : '');
    this.boardJobs = jobs;
    for (const b of $('board-list').querySelectorAll('[data-accept]')) {
      b.onclick = () => {
        const id = b.dataset.accept;
        const q = this.byId.get(id) || jobs.find((j) => j.id === id);
        if (q) this.start(q);
        this.closeBoard();
      };
    }
    $('board').classList.remove('hidden');
    this.setPaused(true);
    return true;
  }
  closeBoard() {
    $('board').classList.add('hidden');
    this.setPaused(false);
  }

  // ----- déroulement -----
  start(q) {
    this.abandon(true);
    // needAirborne : il faut décoller avant qu'un atterrissage compte (anti-téléportation)
    this.active = { q, step: 0, elapsed: 0, timer: 0, touched: false, objects: [], moving: null, needAirborne: this.plane.onGround };
    this.refreshClusters();
    this.showStep();
    this.toast(`Nouvelle quête : ${q.title}`);
    this.beep(520, 0.15);
  }
  abandon(silent = false) {
    if (!this.active) return;
    this.clearObjects();
    this.active = null;
    $('quest-box').classList.add('hidden');
    $('arrow').classList.add('hidden');
    this.refreshClusters();
    if (!silent) this.toast('Quête abandonnée');
  }
  fail(reason) {
    const q = this.active?.q;
    this.abandon(true);
    this.toast(`❌ ${q ? q.title : 'Quête'} : ${reason}`);
    this.beep(160, 0.5, 0.25);
  }
  clearObjects() {
    if (!this.active) return;
    for (const o of this.active.objects) this.scene.remove(o);
    this.active.objects = [];
    this.active.moving = null;
  }
  add(obj) {
    this.scene.add(obj);
    this.active.objects.push(obj);
    return obj;
  }

  stepPoint(st, t = Date.now() / 1000) {
    switch (st.type) {
      case 'ring': return new THREE.Vector3(st.x, st.alt ?? ground(st.x, st.z) + st.agl, st.z);
      case 'land': case 'touch': { const a = airportById(st.airport); return new THREE.Vector3(a.x, a.elev, a.z); }
      case 'reach': case 'drop': return new THREE.Vector3(st.x, ground(st.x, st.z), st.z);
      case 'low': return st.x !== undefined ? new THREE.Vector3(st.x, ground(st.x, st.z), st.z) : null;
      case 'follow': {
        const p = st.ship !== undefined ? shipPosition(SHIPS[st.ship], t) : balloonPosition(BALLOONS[st.balloon], t);
        return new THREE.Vector3(p.x, p.y, p.z);
      }
      default: return null;
    }
  }

  stepText(st) {
    if (st.text) return st.text;
    const kmh = (v) => `${v} km/h`;
    switch (st.type) {
      case 'ring': return 'Passe dans l\'anneau jaune';
      case 'land': return `Pose-toi et arrête-toi à ${airportById(st.airport).name}`;
      case 'touch': return `Toucher-décoller à ${airportById(st.airport).name} (touche la piste puis remets les gaz)`;
      case 'reach': return `Rejoins : ${st.label}${st.maxAgl ? ` (à moins de ${st.maxAgl} m du sol)` : ''}${st.minAgl ? ` (au moins ${st.minAgl} m au-dessus du sol)` : ''}`;
      case 'drop': return `Largue le colis (X) sur : ${st.label}${st.maxAgl ? ` — à moins de ${st.maxAgl} m du sol` : ''} · vise avec la croix blanche`;
      case 'altitude': return `Monte au-dessus de ${st.min} m`;
      case 'speed': return `Atteins ${kmh(st.min)}`;
      case 'low': return `Vole à moins de ${st.maxAgl} m du sol pendant ${st.duration} s${st.label ? ` (${st.label})` : ''}`;
      case 'hold': return `Tiens ton altitude entre ${st.min} et ${st.max} m pendant ${st.duration} s`;
      case 'inverted': return `Vole sur le dos pendant ${st.duration} s`;
      case 'follow': return `Reste à moins de ${st.distance} m de : ${st.label} (${st.duration} s)`;
      default: return '';
    }
  }

  showStep() {
    const A = this.active;
    this.clearObjects();
    const { q } = A;
    const st = q.steps[A.step];
    A.timer = 0;
    A.touched = false;
    const p = this.stepPoint(st);
    if (st.type === 'ring') {
      const prev = A.step > 0 && q.steps[A.step - 1].type === 'ring' ? this.stepPoint(q.steps[A.step - 1]) : this.plane.pos.clone();
      for (let k = 0; k < 2; k++) {
        const s2 = q.steps[A.step + k];
        if (!s2 || s2.type !== 'ring') break;
        const r = this.add(new THREE.Mesh(ringGeo, k === 0 ? ringMat : ringNextMat));
        r.scale.setScalar(s2.size || 30);
        r.position.copy(this.stepPoint(s2));
        r.lookAt(k === 0 ? prev : p);
      }
    } else if (p) {
      const rad = st.radius || (st.type === 'follow' ? 60 : 80);
      const beam = this.add(new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, 4000, 32, 1, true), beamMat));
      beam.position.set(p.x, p.y + 2000, p.z);
      if (st.type === 'follow') A.moving = beam;
      if (st.type === 'drop') {
        const tgt = this.add(new THREE.Mesh(new THREE.RingGeometry(st.radius * 0.85, st.radius, 48).rotateX(-Math.PI / 2), targetMat));
        tgt.position.set(p.x, p.y + 1.5, p.z);
        // croix de visée : point d'impact prévu du colis
        const cross = new THREE.Group();
        for (const r of [0, Math.PI / 2]) {
          const bar = new THREE.Mesh(new THREE.PlaneGeometry(40, 6).rotateX(-Math.PI / 2).rotateY(r + Math.PI / 4), aimMat);
          cross.add(bar);
        }
        cross.visible = false;
        A.aimMarker = this.add(cross);
      }
    }
    if (st.spawn && p) {
      const m = this.add(spawnMesh(st.spawn));
      m.position.set(p.x, Math.max(0, terrainHeight(p.x, p.z)) + (terrainHeight(p.x, p.z) < 0 ? 0.2 : 0), p.z);
    }
    $('quest-box').classList.remove('hidden');
    $('quest-title').textContent = `${q.job ? '' : `${CAT_ICON[q.category] || ''} `}${q.title} (${A.step + 1}/${q.steps.length})`;
    $('quest-step').textContent = this.stepText(st);
    $('quest-progress').classList.add('hidden');
  }

  completeStep() {
    const A = this.active;
    A.step++;
    if (A.step < A.q.steps.length) {
      this.beep(660, 0.12);
      this.showStep();
      return;
    }
    const q = A.q;
    const s = this.ensureSave();
    const bonus = q.bonusTime && A.elapsed <= q.bonusTime ? q.bonusReward : 0;
    const gain = q.reward + bonus;
    const before = this.rankIndex();
    s.money += gain;
    s.xp += gain;
    if (q.job) s.jobs.done.push(q.id);
    else if (!s.completed.includes(q.id)) s.completed.push(q.id);
    this.persist();
    this.abandon(true);
    this.toast(`✅ ${q.title} terminée ! +${gain} ₣${bonus ? ` (dont bonus chrono ${bonus} ₣)` : ''}`);
    this.beep(880, 0.25);
    const after = this.rankIndex();
    if (after > before) setTimeout(() => this.toast(`🎖 Nouveau rang : ${RANKS[after].name} !`), 3000);
  }

  requestDrop() {
    if (!this.active) return;
    const st = this.active.q.steps[this.active.step];
    if (st.type !== 'drop') return;
    this.dropRequested = true;
  }

  // appelée à chaque image : dt = temps simulé (0 en pause)
  update(dt, wallT) {
    this.updateDrops(dt);
    const A = this.active;
    if (!A) return;
    for (const o of A.objects) o.traverse?.((c) => c.userData.update?.(dt));
    const { q } = A;
    const st = q.steps[A.step];
    const plane = this.plane;
    const pos = plane.pos;
    A.elapsed += dt;
    if (q.timeLimit && A.elapsed > q.timeLimit) return this.fail('temps écoulé');
    const agl = pos.y - ground(pos.x, pos.z);
    const airborne = !plane.onGround && !plane.crashed;
    if (airborne && agl > 15) A.needAirborne = false;
    const p = this.stepPoint(st, wallT);
    if (A.moving && p) A.moving.position.set(p.x, p.y + 2000, p.z);
    const hd = p ? Math.hypot(pos.x - p.x, pos.z - p.z) : 0;
    let done = false, progress = null;

    switch (st.type) {
      case 'ring': done = pos.distanceTo(p) < (st.size || 30) + 4; break;
      case 'land': done = !A.needAirborne && plane.landedAt?.id === st.airport; break;
      case 'touch': {
        // il faut toucher la piste elle-même (pas le parking), puis redécoller
        if (!A.needAirborne && plane.onGround) {
          const a = airportById(st.airport);
          const { u, v } = runwayLocal(a, pos.x, pos.z);
          if (Math.abs(u) < a.width / 2 + 5 && Math.abs(v) < a.length / 2 + 20) A.touched = true;
        }
        done = A.touched && airborne && agl > 5;
        if (A.touched && !airborne) progress = 0.5;
        break;
      }
      case 'reach': done = hd < st.radius && (!st.maxAgl || agl < st.maxAgl) && (!st.minAgl || agl > st.minAgl); break;
      case 'drop': {
        // le colis est jugé là où il touche le sol (trajectoire balistique), comme en vrai
        A.aimTimer = (A.aimTimer || 0) - dt;
        if (A.aimTimer <= 0 || this.dropRequested) {
          A.aimTimer = 0.15;
          A.impact = this.predictImpact();
          if (A.aimMarker) {
            A.aimMarker.visible = airborne && Math.hypot(A.impact.x - p.x, A.impact.z - p.z) < 3000;
            A.aimMarker.position.set(A.impact.x, A.impact.y + 1.2, A.impact.z);
          }
        }
        if (this.dropRequested) {
          this.dropRequested = false;
          this.spawnDrop();
          const miss = Math.hypot(A.impact.x - p.x, A.impact.z - p.z);
          if (st.maxAgl && agl >= st.maxAgl) this.logMsg(`Trop haut ! Descends sous ${st.maxAgl} m du sol`);
          else if (miss < st.radius) done = true;
          else this.logMsg(`Raté ! Le colis tombe à ${fmtDist(miss)} de la cible`);
        }
        break;
      }
      case 'altitude': done = pos.y >= st.min; progress = Math.min(1, pos.y / st.min); break;
      case 'speed': done = plane.speed * 3.6 >= st.min; progress = Math.min(1, (plane.speed * 3.6) / st.min); break;
      case 'low': {
        const inZone = st.x === undefined || hd < st.radius;
        A.timer = airborne && agl < st.maxAgl && inZone ? A.timer + dt : 0;
        progress = A.timer / st.duration;
        done = A.timer >= st.duration;
        break;
      }
      case 'hold': {
        A.timer = airborne && pos.y >= st.min && pos.y <= st.max ? A.timer + dt : 0;
        progress = A.timer / st.duration;
        done = A.timer >= st.duration;
        break;
      }
      case 'inverted': {
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(plane.quat);
        A.timer = airborne && up.y < -0.5 ? A.timer + dt : 0;
        progress = A.timer / st.duration;
        done = A.timer >= st.duration;
        break;
      }
      case 'follow': {
        const close = hd < st.distance && Math.abs(pos.y - p.y) < 500 && airborne;
        if (close) A.timer += dt;
        progress = A.timer / st.duration;
        done = A.timer >= st.duration;
        break;
      }
    }

    // affichage
    if (p) {
      const rel = THREE.MathUtils.radToDeg(Math.atan2(p.x - pos.x, -(p.z - pos.z))) - plane.headingDeg;
      $('arrow').classList.remove('hidden');
      $('arrow').style.transform = `rotate(${rel}deg)`;
    } else $('arrow').classList.add('hidden');
    let info = p ? fmtDist(Math.hypot(p.x - pos.x, p.z - pos.z)) : '';
    if (st.type === 'ring' && p) info += ` · anneau à ${Math.round(p.y)} m`;
    if (st.type === 'altitude' || st.type === 'hold') info = `Altitude : ${Math.round(pos.y)} m`;
    if (st.type === 'speed') info = `Vitesse : ${Math.round(plane.speed * 3.6)} km/h`;
    if (st.type === 'low') info = `${info ? info + ' · ' : ''}Hauteur : ${Math.max(0, Math.round(agl))} m`;
    if (q.timeLimit) info += ` · ⏱ ${fmtTime(Math.max(0, q.timeLimit - A.elapsed))}`;
    else if (q.bonusTime) info += ` · ⏱ ${fmtTime(A.elapsed)} (bonus < ${fmtTime(q.bonusTime)})`;
    $('quest-dist').textContent = info;
    const bar = $('quest-progress');
    if (progress !== null) {
      bar.classList.remove('hidden');
      bar.firstElementChild.style.width = `${Math.min(100, progress * 100)}%`;
    } else bar.classList.add('hidden');

    if (done) this.completeStep();
  }

  // trajectoire du colis : même dynamique que updateDrops (gravité + freinage de l'air)
  predictImpact() {
    const pos = this.plane.pos.clone().add(new THREE.Vector3(0, -1.5, 0));
    const vel = this.plane.velocity.clone().multiplyScalar(0.9);
    const h = 0.05;
    for (let i = 0; i < 1200; i++) {
      vel.y -= 9.81 * h;
      vel.multiplyScalar(1 - 0.15 * h);
      pos.addScaledVector(vel, h);
      const g = ground(pos.x, pos.z);
      if (pos.y < g + 0.7) { pos.y = g; break; }
    }
    return pos;
  }

  spawnDrop() {
    const c = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), MAT.wood);
    c.castShadow = true;
    c.position.copy(this.plane.pos).add(new THREE.Vector3(0, -1.5, 0));
    this.scene.add(c);
    this.drops.push({ mesh: c, vel: this.plane.velocity.clone().multiplyScalar(0.9), life: 25, landed: false });
  }
  updateDrops(dt) {
    for (const d of this.drops) {
      d.life -= dt;
      if (d.landed) continue;
      d.vel.y -= 9.81 * dt;
      d.vel.multiplyScalar(1 - 0.15 * dt);
      d.mesh.position.addScaledVector(d.vel, dt);
      d.mesh.rotation.x += dt * 2;
      const g = ground(d.mesh.position.x, d.mesh.position.z);
      if (d.mesh.position.y < g + 0.7) { d.mesh.position.y = g + 0.7; d.landed = true; }
    }
    for (const d of this.drops.filter((x) => x.life <= 0)) this.scene.remove(d.mesh);
    this.drops = this.drops.filter((x) => x.life > 0);
  }

  onCrash() {
    if (this.active?.q.timeLimit) this.fail('crash pendant une mission chronométrée');
  }
  // réapparition : après un crash la quête continue (il faudra redécoller) ;
  // une téléportation volontaire l'annule
  onRespawn(crashed, teleport) {
    if (!this.active) return;
    if (teleport || !crashed) { this.abandon(true); this.toast('Quête annulée (réapparition)'); return; }
    this.active.needAirborne = true;
    this.active.touched = false;
  }

  // ----- textes du HUD -----
  prompt() {
    if (this.plane.crashed) return '';
    const { airport, cluster } = this.boardContext();
    if (cluster) {
      const n = cluster.available;
      return `<kbd>Entrée</kbd> ${n === 1 ? `<b>${esc(cluster.quests.find((q) => this.isAvailable(q)).title)}</b>` : `${n} quêtes disponibles ici`}${airport ? ' + missions de transport' : ''}`;
    }
    if (airport) return `<kbd>Entrée</kbd> tableau des missions de ${esc(airport.name)}`;
    return '';
  }

  placeName(x, z) {
    let best = null, bd = Infinity;
    for (const p of [...AIRPORTS, ...LANDMARKS, ...CITIES]) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bd) { bd = d; best = p; }
    }
    return bd < 4000 ? best.name : `${Math.round(x / 1000)} km, ${Math.round(z / 1000)} km`;
  }

  renderJournal() {
    const s = this.ensureSave();
    const r = this.rankIndex();
    const next = RANKS[r + 1];
    const done = this.quests.filter((q) => this.isDone(q)).length;
    $('journal-rank').innerHTML = `<b>${RANKS[r].name}</b> · ${s.xp} XP${next ? ` — prochain rang : ${next.name} (${next.xp} XP)` : ''}`
      + `<div class="bar"><div style="width:${next ? Math.min(100, ((s.xp - RANKS[r].xp) / (next.xp - RANKS[r].xp)) * 100) : 100}%"></div></div>`
      + `<small>${done} / ${this.quests.length} quêtes terminées · ${s.jobs.done.length} mission(s) de transport aujourd'hui</small>`;
    const groups = {};
    for (const q of this.quests) (groups[q.category] ||= []).push(q);
    let html = '';
    for (const [cat, list] of Object.entries(groups)) {
      const n = list.filter((q) => this.isDone(q)).length;
      html += `<h3>${CAT_ICON[cat] || ''} ${CATEGORIES[cat] || cat} <small>${n}/${list.length}</small></h3><ul>`;
      for (const q of list) {
        const isDone = this.isDone(q), lock = this.lockReason(q), act = this.active?.q.id === q.id;
        const icon = isDone ? '✅' : act ? '▶' : lock ? '🔒' : '❗';
        const where = q.airport ? airportById(q.airport).name : this.placeName(q.giver.x, q.giver.z);
        html += `<li class="${isDone ? 'done' : act ? 'active' : ''}"><span class="r">${q.reward} ₣</span><b>${icon} ${esc(q.title)}</b> <small>· ${esc(where)}</small><br>`
          + `<small>${esc(lock && !isDone ? lock : q.desc)}</small></li>`;
      }
      html += '</ul>';
    }
    $('quest-list').innerHTML = html;
  }

  // ----- carte -----
  drawMap(ctx, toX, toY, full, span, text) {
    for (const c of this.clusters) {
      if (!c.available) continue;
      text('!', toX(c.x) - 2, toY(c.z) + 4, '#ffd23f');
      if (full && span < 40000) text(c.available === 1 ? c.quests.find((q) => this.isAvailable(q)).title : `${c.available} quêtes`, toX(c.x) + 6, toY(c.z) + 16, '#ffd23f');
    }
    if (!this.active) return;
    const p = this.stepPoint(this.active.q.steps[this.active.step]);
    if (!p) return;
    ctx.strokeStyle = '#ffc928';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(toX(p.x), toY(p.z), 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(toX(this.plane.pos.x), toY(this.plane.pos.z));
    ctx.lineTo(toX(p.x), toY(p.z));
    ctx.stroke();
    ctx.setLineDash([]);
  }

  reset() {
    this.abandon(true);
    this.refreshClusters();
  }
}
