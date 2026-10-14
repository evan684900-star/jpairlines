// Vérifie toutes les quêtes : format, références, géométrie (anneaux au-dessus du relief,
// distances), faisabilité des chronos.
// Usage : node scripts/validate-quests.mjs [fichier]   (ex : centre)  — sans argument : tout
// chaque fichier est chargé séparément : un fichier cassé n'empêche pas de vérifier les autres
const FILES = ['base', 'centre', 'ouest', 'nord', 'sud', 'est', 'defis'];
const QUEST_FILES = {};
const loadErrors = [];
for (const f of FILES) {
  try {
    const mod = await import(`../public/js/quests/${f}.js?t=${Date.now()}`);
    if (!Array.isArray(mod.default)) throw new Error('export default doit être un tableau');
    QUEST_FILES[f] = mod.default;
  } catch (e) {
    loadErrors.push(`[${f}] fichier illisible : ${e.message}`);
    QUEST_FILES[f] = [];
  }
}
import { CATEGORIES, RANKS } from '../public/js/quests/kit.js';
import {
  AIRPORTS, SHIPS, BALLOONS, HALF, terrainHeight, airportById, shipPosition, balloonPosition,
} from '../public/js/world.js';

const only = process.argv[2];
const errors = [], warnings = [];
const err = (file, q, msg) => errors.push(`[${file}] ${q?.id ?? '?'} : ${msg}`);
const warn = (file, q, msg) => warnings.push(`[${file}] ${q?.id ?? '?'} : ${msg}`);
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const ground = (x, z) => Math.max(0, terrainHeight(x, z));
const CRUISE = 55; // m/s, vitesse de croisière raisonnable

const STEP_KEYS = {
  ring: ['x', 'z', 'agl', 'alt', 'size'], land: ['airport'], touch: ['airport'],
  reach: ['x', 'z', 'radius', 'label', 'maxAgl', 'minAgl'], drop: ['x', 'z', 'radius', 'label', 'maxAgl'],
  altitude: ['min'], speed: ['min'], low: ['maxAgl', 'duration', 'label', 'x', 'z', 'radius'],
  hold: ['min', 'max', 'duration'], inverted: ['duration'], follow: ['ship', 'balloon', 'distance', 'duration', 'label'],
};
const COMMON_KEYS = ['type', 'text', 'spawn'];
const SPAWNS = ['raft', 'hiker', 'crate', 'smoke', 'flag', 'tent'];

function ringPos(st) {
  return { x: st.x, z: st.z, y: num(st.alt) ? st.alt : ground(st.x, st.z) + st.agl };
}
function stepPoint(st) {
  if (st.type === 'land' || st.type === 'touch') {
    const a = airportById(st.airport);
    return a ? { x: a.x, z: a.z, y: a.elev } : null;
  }
  if (st.type === 'ring') return ringPos(st);
  if (['reach', 'drop'].includes(st.type)) return { x: st.x, z: st.z, y: ground(st.x, st.z) };
  if (st.type === 'low' && num(st.x)) return { x: st.x, z: st.z, y: ground(st.x, st.z) };
  if (st.type === 'follow') {
    const o = num(st.ship) ? SHIPS[st.ship] : BALLOONS[st.balloon];
    return o ? { x: o.x, z: o.z, y: 0 } : null;
  }
  return null;
}
const inWorld = (p) => Math.abs(p.x) < HALF * 0.95 && Math.abs(p.z) < HALF * 0.95;

function checkStep(file, q, st, i) {
  const where = `étape ${i + 1} (${st.type})`;
  if (!STEP_KEYS[st.type]) return err(file, q, `${where} : type inconnu`);
  for (const k of Object.keys(st)) if (!STEP_KEYS[st.type].includes(k) && !COMMON_KEYS.includes(k)) err(file, q, `${where} : champ inconnu « ${k} »`);
  if (st.spawn && !SPAWNS.includes(st.spawn)) err(file, q, `${where} : spawn inconnu ${st.spawn}`);
  if (st.text !== undefined && (typeof st.text !== 'string' || !st.text.trim())) err(file, q, `${where} : text vide`);
  const p = stepPoint(st);
  if (p && !inWorld(p)) err(file, q, `${where} : hors de la carte (${Math.round(p.x)}, ${Math.round(p.z)})`);
  switch (st.type) {
    case 'ring': {
      if (!num(st.x) || !num(st.z)) return err(file, q, `${where} : x/z manquants`);
      if (num(st.agl) === num(st.alt)) return err(file, q, `${where} : il faut soit agl soit alt (un seul)`);
      const size = st.size ?? 30;
      if (size < 20 || size > 80) err(file, q, `${where} : size ${size} hors de [20, 80]`);
      const g = ground(st.x, st.z);
      if (p.y - g < size + 15) err(file, q, `${where} : anneau trop près du sol (${Math.round(p.y - g)} m au-dessus, rayon ${size})`);
      if (p.y > 4500) err(file, q, `${where} : anneau trop haut (${Math.round(p.y)} m)`);
      break;
    }
    case 'land': case 'touch':
      if (!airportById(st.airport)) err(file, q, `${where} : aéroport inconnu ${st.airport}`);
      break;
    case 'reach': case 'drop': {
      if (!num(st.x) || !num(st.z) || !num(st.radius)) return err(file, q, `${where} : x/z/radius manquants`);
      if (st.radius < 80 || st.radius > 3000) err(file, q, `${where} : radius ${st.radius} hors de [80, 3000]`);
      if (!st.label) err(file, q, `${where} : label manquant`);
      if (st.maxAgl !== undefined && (st.maxAgl < 50 || st.maxAgl > 1500)) err(file, q, `${where} : maxAgl ${st.maxAgl} hors de [50, 1500]`);
      if (st.minAgl !== undefined && st.maxAgl !== undefined && st.maxAgl - st.minAgl < 80) err(file, q, `${where} : fenêtre minAgl/maxAgl trop étroite`);
      break;
    }
    case 'altitude':
      if (!num(st.min) || st.min < 300 || st.min > 5000) err(file, q, `${where} : min ${st.min} hors de [300, 5000]`);
      break;
    case 'speed':
      if (!num(st.min) || st.min < 150 || st.min > 330) err(file, q, `${where} : min ${st.min} km/h hors de [150, 330]`);
      break;
    case 'low':
      if (!num(st.maxAgl) || st.maxAgl < 30 || st.maxAgl > 400) err(file, q, `${where} : maxAgl ${st.maxAgl} hors de [30, 400]`);
      if (!num(st.duration) || st.duration < 5 || st.duration > 120) err(file, q, `${where} : duration hors de [5, 120]`);
      if ((num(st.x) || num(st.z) || num(st.radius)) && !(num(st.x) && num(st.z) && num(st.radius))) err(file, q, `${where} : zone incomplète (x, z, radius)`);
      break;
    case 'hold':
      if (!num(st.min) || !num(st.max) || st.max - st.min < 100) err(file, q, `${where} : fenêtre d'altitude trop étroite (< 100 m)`);
      if (st.min < 150 || st.max > 4500) err(file, q, `${where} : altitudes hors de [150, 4500]`);
      if (!num(st.duration) || st.duration < 5 || st.duration > 120) err(file, q, `${where} : duration hors de [5, 120]`);
      break;
    case 'inverted':
      if (!num(st.duration) || st.duration < 2 || st.duration > 20) err(file, q, `${where} : duration hors de [2, 20]`);
      break;
    case 'follow': {
      const hasShip = num(st.ship), hasBalloon = num(st.balloon);
      if (hasShip === hasBalloon) return err(file, q, `${where} : il faut soit ship soit balloon`);
      if (hasShip && !SHIPS[st.ship]) err(file, q, `${where} : bateau ${st.ship} inexistant (0..${SHIPS.length - 1})`);
      if (hasBalloon && !BALLOONS[st.balloon]) err(file, q, `${where} : montgolfière ${st.balloon} inexistante (0..${BALLOONS.length - 1})`);
      if (!num(st.distance) || st.distance < 300 || st.distance > 2000) err(file, q, `${where} : distance hors de [300, 2000]`);
      if (!num(st.duration) || st.duration < 10 || st.duration > 120) err(file, q, `${where} : duration hors de [10, 120]`);
      if (!st.label) err(file, q, `${where} : label manquant`);
      break;
    }
  }
}

// Le segment entre deux anneaux traverse-t-il le relief ?
function segmentClearance(a, b) {
  let min = Infinity;
  for (let k = 1; k < 40; k++) {
    const t = k / 40;
    const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, y = a.y + (b.y - a.y) * t;
    min = Math.min(min, y - ground(x, z));
  }
  return min;
}

function giverPoint(q) {
  if (q.airport) {
    const a = airportById(q.airport);
    return a ? { x: a.x, z: a.z } : null;
  }
  return q.giver;
}

// Estimation du temps nécessaire (s) pour enchaîner les étapes depuis le donneur
function estimateTime(q) {
  let pos = giverPoint(q), t = 60;
  for (const st of q.steps) {
    const p = stepPoint(st);
    if (p && pos) { t += Math.hypot(p.x - pos.x, p.z - pos.z) / CRUISE; pos = p; }
    if (st.type === 'land') t += 90;
    if (st.type === 'touch') t += 40;
    if (num(st.duration)) t += st.duration;
    if (st.type === 'altitude') t += st.min / 6;
    if (st.type === 'follow') t += 30;
  }
  return t;
}

for (const e of loadErrors) errors.push(e);
const ids = new Map();
const all = Object.entries(QUEST_FILES).flatMap(([file, list]) => list.map((q) => ({ file, q })));
for (const { file, q } of all) {
  if (ids.has(q.id)) err(file, q, `id en double (déjà dans ${ids.get(q.id)})`);
  ids.set(q.id, file);
}

for (const { file, q } of all) {
  if (only && file !== only) continue;
  if (!/^[a-z0-9-]+$/.test(q.id || '')) err(file, q, 'id invalide (kebab-case attendu)');
  if (!q.title || q.title.length > 40) err(file, q, 'title manquant ou trop long (> 40)');
  if (!q.desc || q.desc.length < 20 || q.desc.length > 240) err(file, q, 'desc manquante, trop courte ou trop longue (20-240)');
  if (!CATEGORIES[q.category] || q.category === 'transport') err(file, q, `category invalide : ${q.category}`);
  if (!num(q.reward) || q.reward < 100 || q.reward > 6000) err(file, q, `reward ${q.reward} hors de [100, 6000]`);
  if (!!q.airport === !!q.giver) err(file, q, 'il faut soit airport soit giver (un seul)');
  if (q.airport && !airportById(q.airport)) err(file, q, `aéroport inconnu ${q.airport}`);
  if (q.giver) {
    if (!num(q.giver.x) || !num(q.giver.z)) err(file, q, 'giver sans x/z');
    else {
      if (terrainHeight(q.giver.x, q.giver.z) < 2) err(file, q, 'balise (giver) dans l\'eau');
      if (!inWorld(q.giver)) err(file, q, 'balise hors carte');
    }
  }
  for (const r of [q.requires].flat().filter(Boolean)) if (!ids.has(r)) err(file, q, `requires inconnu : ${r}`);
  if (q.minRank !== undefined && (!Number.isInteger(q.minRank) || q.minRank < 0 || q.minRank >= RANKS.length)) err(file, q, 'minRank invalide');
  if (!Array.isArray(q.steps) || !q.steps.length) { err(file, q, 'aucune étape'); continue; }
  if (q.steps.length > 30) warn(file, q, `${q.steps.length} étapes, c'est beaucoup`);
  q.steps.forEach((st, i) => checkStep(file, q, st, i));
  // enchaînement des anneaux
  for (let i = 1; i < q.steps.length; i++) {
    const a = q.steps[i - 1], b = q.steps[i];
    if (a.type !== 'ring' || b.type !== 'ring') continue;
    const pa = ringPos(a), pb = ringPos(b);
    const d = Math.hypot(pa.x - pb.x, pa.z - pb.z);
    if (d < 120) err(file, q, `anneaux ${i} et ${i + 1} trop proches (${Math.round(d)} m)`);
    if (d > 9000) err(file, q, `anneaux ${i} et ${i + 1} trop éloignés (${Math.round(d)} m)`);
    const climb = Math.abs(pb.y - pa.y) / Math.max(d, 1);
    if (climb > 0.35) err(file, q, `pente trop forte entre anneaux ${i} et ${i + 1} (${Math.round(climb * 100)} %)`);
    const c = segmentClearance(pa, pb);
    if (c < -60) err(file, q, `un relief bloque le passage entre anneaux ${i} et ${i + 1} (${Math.round(-c)} m sous le sol)`);
    else if (c < 10) warn(file, q, `passage serré entre anneaux ${i} et ${i + 1} (marge ${Math.round(c)} m)`);
  }
  if (q.timeLimit !== undefined) {
    const need = estimateTime(q);
    if (!num(q.timeLimit) || q.timeLimit < need * 1.15) err(file, q, `timeLimit ${q.timeLimit} s trop court (estimation ${Math.round(need)} s, prévoir ≥ ${Math.ceil(need * 1.15)})`);
  }
  if (q.bonusTime !== undefined) {
    if (!num(q.bonusReward)) err(file, q, 'bonusTime sans bonusReward');
    const need = estimateTime(q);
    if (q.bonusTime < need * 0.85) err(file, q, `bonusTime ${q.bonusTime} s impossible (estimation ${Math.round(need)} s)`);
    if (q.timeLimit && q.bonusTime >= q.timeLimit) err(file, q, 'bonusTime doit être < timeLimit');
  }
}

// rapport
const files = Object.entries(QUEST_FILES).filter(([f]) => !only || f === only);
for (const [file, list] of files) {
  const cats = {};
  for (const q of list) cats[q.category] = (cats[q.category] || 0) + 1;
  console.log(`${file.padEnd(8)} ${String(list.length).padStart(3)} quêtes  ${Object.entries(cats).map(([c, n]) => `${c}:${n}`).join(' ')}`);
}
console.log(`TOTAL ${all.length} quêtes, aéroports : ${AIRPORTS.length}, bateaux : ${SHIPS.length}, montgolfières : ${BALLOONS.length}`);
void shipPosition; void balloonPosition;
for (const w of warnings) console.log('⚠ ', w);
for (const e of errors) console.log('✖ ', e);
console.log(errors.length ? `\n${errors.length} erreur(s)` : '\nOK : aucune erreur');
process.exit(errors.length ? 1 : 0);
