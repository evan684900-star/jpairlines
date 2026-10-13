// Monde partagé : tout est généré à partir d'une graine fixe,
// donc chaque joueur obtient exactement la même carte.

export const WORLD = {
  seed: 1337,
  size: 80000, // 80 km x 80 km
  cell: 25, // résolution max du terrain (m), utilisée aussi pour les collisions
  chunk: 2000, // taille d'un morceau de terrain
};
export const HALF = WORLD.size / 2;
const S = WORLD.seed;

function hash(ix, iz, s) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(s, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const fade = (t) => t * t * (3 - 2 * t);
export const smoothstep = (a, b, x) => fade(Math.min(1, Math.max(0, (x - a) / (b - a))));

function valueNoise(x, z, s) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = fade(x - ix), fz = fade(z - iz);
  const a = hash(ix, iz, s), b = hash(ix + 1, iz, s);
  const c = hash(ix, iz + 1, s), d = hash(ix + 1, iz + 1, s);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

export function fbm(x, z, octaves, s) {
  let sum = 0, amp = 1, f = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * f, z * f, s + i * 17);
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

// Générateur pseudo-aléatoire déterministe
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Climat ----------
// temp : 0 = polaire (nord, -Z) → 1 = tropical (sud, +Z) ; dry : > 0.6 = désert
export function climate(x, z) {
  const temp = 0.5 + (z / WORLD.size) * 1.1 + (fbm(x / 15000, z / 15000, 3, S + 40) - 0.5) * 0.4;
  const dry = fbm(x / 20000, z / 20000, 3, S + 50) + ((z - x) / WORLD.size) * 0.55;
  return { temp, dry };
}
export const snowLine = (temp) => 250 + Math.max(0, temp) * 2200;

// ---------- Relief ----------
export const VOLCANO = { x: 25000, z: 14000, r: 6500, h: 2300 };

export function rawHeight(x, z) {
  const d = Math.hypot(x, z) / HALF;
  const cont = fbm(x / 22000, z / 22000, 4, S + 1);
  const isl = fbm(x / 6000, z / 6000, 4, S + 2);
  const landVal = (1 - d * 1.15) * 0.62 + (cont - 0.5) * 0.7 + (isl - 0.5) * 0.45;
  const land = smoothstep(0.14, 0.18, landVal);
  const inland = smoothstep(0.17, 0.34, landVal);
  const hills = (fbm(x / 3500, z / 3500, 5, S) - 0.35) * 320 + 20 + inland * 140;
  const ridge = 1 - Math.abs(fbm(x / 2600, z / 2600, 5, S + 99) * 2 - 1);
  const mtn = smoothstep(0.46, 0.64, fbm(x / 14000, z / 14000, 3, S + 7)) * inland;
  const depth = 40 + 400 * smoothstep(0.14, -0.05, landVal);
  let h = land * hills - (1 - land) * depth + mtn * ridge * ridge * 2600;

  // île volcanique
  const vr = Math.hypot(x - VOLCANO.x, z - VOLCANO.z);
  if (vr < VOLCANO.r) {
    const t = 1 - vr / VOLCANO.r;
    let v = -180 + (VOLCANO.h + 180) * Math.pow(t, 2.2) + (isl - 0.5) * 120 * t;
    if (vr < 500) v -= (1 - vr / 500) ** 2 * 320; // cratère
    h = Math.max(h, v);
  }
  return h;
}

// ---------- Aéroports ----------
export const AIRPORT_TYPES = {
  international: { length: 2600, width: 60, surface: 'asphalt', pad: 380, label: 'International' },
  regional: { length: 1600, width: 45, surface: 'asphalt', pad: 260, label: 'Régional' },
  strip: { length: 950, width: 30, surface: 'grass', pad: 150, label: 'Piste en herbe' },
};

const AIRPORT_SPECS = [
  { id: 'alpha', name: 'Base Alpha', type: 'regional', near: [0, 0], search: 3000 },
  { id: 'capitale', name: 'Capitale International', type: 'international', near: [9000, 4000], search: 6000 },
  { id: 'azur', name: 'Port Azur', type: 'regional', near: [-14000, 9000], search: 6000, maxElev: 120 },
  { id: 'givre', name: 'Mont Givre', type: 'strip', near: [-6000, -10000], search: 7000, minElev: 500 },
  { id: 'glacier', name: 'Station Glacier', type: 'strip', near: [-4000, -26000], search: 8000 },
  { id: 'nord', name: 'Cap Nord', type: 'regional', near: [10000, -22000], search: 8000 },
  { id: 'dunes', name: 'Oasis des Dunes', type: 'regional', near: [-18000, 18000], search: 8000 },
  { id: 'corail', name: 'Île Corail', type: 'strip', near: [6000, 24000], search: 9000 },
  { id: 'volcan', name: 'Base du Volcan', type: 'strip', near: [VOLCANO.x - 4200, VOLCANO.z + 2500], search: 2500 },
  { id: 'levant', name: 'Port-Levant', type: 'international', near: [24000, -6000], search: 8000 },
  { id: 'verte', name: 'Vallée Verte', type: 'regional', near: [-20000, -6000], search: 8000 },
  { id: 'lac', name: 'Lac Miroir', type: 'strip', near: [2000, -12000], search: 6000 },
  { id: 'falaises', name: 'Les Falaises', type: 'strip', near: [-28000, 2000], search: 8000 },
  { id: 'palmes', name: 'Archipel des Palmes', type: 'strip', near: [-6000, 30000], search: 9000 },
];

// Coordonnées locales à la piste (u = travers, v = longueur)
export function runwayLocal(a, x, z) {
  const dx = x - a.x, dz = z - a.z;
  const c = Math.cos(a.heading), s = Math.sin(a.heading);
  return { u: dx * c - dz * s, v: dx * s + dz * c };
}
export function runwayPoint(x, z, heading, u, v) {
  const c = Math.cos(heading), s = Math.sin(heading);
  return [x + u * c + v * s, z - u * s + v * c];
}

// Cherche l'endroit le plus plat près du point voulu
function findAirportSite(spec, placed) {
  const T = AIRPORT_TYPES[spec.type];
  let best = null;
  const R = spec.search, STEP = 500;
  for (let dx = -R; dx <= R; dx += STEP) {
    for (let dz = -R; dz <= R; dz += STEP) {
      const x = spec.near[0] + dx, z = spec.near[1] + dz;
      if (Math.abs(x) > HALF - 3000 || Math.abs(z) > HALF - 3000) continue;
      if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < 6000)) continue;
      const hc = rawHeight(x, z);
      if (hc < 6 || (spec.minElev && hc < spec.minElev) || (spec.maxElev && hc > spec.maxElev)) continue;
      for (let k = 0; k < 8; k++) {
        const heading = (k * Math.PI) / 8;
        let sum = 0, sq = 0, n = 0, min = Infinity;
        for (let t = -0.5; t <= 0.501; t += 0.125) {
          for (const u of [-T.pad * 0.6, 0, T.pad * 0.6]) {
            const [px, pz] = runwayPoint(x, z, heading, u, t * T.length);
            const h = rawHeight(px, pz);
            sum += h; sq += h * h; n++; min = Math.min(min, h);
          }
        }
        if (min < 3) continue;
        const mean = sum / n;
        const sd = Math.sqrt(Math.max(0, sq / n - mean * mean));
        const score = sd + Math.hypot(dx, dz) * 0.004;
        if (!best || score < best.score) best = { x, z, heading, elev: Math.max(8, mean), score };
      }
    }
  }
  return best;
}

export const AIRPORTS = [];
for (const spec of AIRPORT_SPECS) {
  let site = null;
  for (let k = 0; k < 3 && !site; k++) site = findAirportSite({ ...spec, search: spec.search * (1 + k) }, AIRPORTS);
  if (!site) { console.warn('Aéroport introuvable', spec.id); continue; }
  const T = AIRPORT_TYPES[spec.type];
  AIRPORTS.push({
    id: spec.id, name: spec.name, type: spec.type, ...T,
    x: site.x, z: site.z, heading: site.heading, elev: Math.round(site.elev),
    reach: T.length / 2 + T.pad + 900,
  });
}
export const airportById = (id) => AIRPORTS.find((a) => a.id === id);

// Hauteur exacte (analytique) avec les aéroports aplanis
export function terrainHeight(x, z) {
  let h = rawHeight(x, z);
  for (const a of AIRPORTS) {
    if (Math.abs(x - a.x) > a.reach || Math.abs(z - a.z) > a.reach) continue;
    const { u, v } = runwayLocal(a, x, z);
    const du = Math.max(0, Math.abs(u) - a.width / 2 - a.pad);
    const dv = Math.max(0, Math.abs(v) - a.length / 2 - 200);
    const w = 1 - smoothstep(0, 700, Math.hypot(du, dv));
    if (w > 0) h += (a.elev - h) * w;
  }
  return h;
}

// Hauteur du sol telle que dessinée (triangles de 25 m) : utilisée pour les collisions
export function groundHeight(x, z) {
  const C = WORLD.cell;
  const gx = x / C, gz = z / C;
  const ix = Math.floor(gx), iz = Math.floor(gz);
  const fx = gx - ix, fz = gz - iz;
  const x0 = ix * C, z0 = iz * C;
  const a = terrainHeight(x0, z0), d = terrainHeight(x0 + C, z0 + C);
  const b = terrainHeight(x0 + C, z0), c = terrainHeight(x0, z0 + C);
  if (fx + fz <= 1) return a + (b - a) * fx + (c - a) * fz;
  return d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
}

export function onRunway(x, z) {
  for (const a of AIRPORTS) {
    if (Math.abs(x - a.x) > a.reach || Math.abs(z - a.z) > a.reach) continue;
    const { u, v } = runwayLocal(a, x, z);
    // piste + parking devant les hangars
    if (Math.abs(v) < a.length / 2 + 40 && u > -a.width / 2 - 10 && u < a.width / 2 + 140) return a;
  }
  return null;
}

// ---------- Recherches de lieux ----------
function search(x, z, R, step, test, score) {
  let best = null;
  for (let dx = -R; dx <= R; dx += step) {
    for (let dz = -R; dz <= R; dz += step) {
      const px = x + dx, pz = z + dz;
      if (Math.abs(px) > HALF - 1000 || Math.abs(pz) > HALF - 1000) continue;
      const h = terrainHeight(px, pz);
      if (!test(px, pz, h)) continue;
      const sc = score ? score(px, pz, h) : -Math.hypot(dx, dz);
      if (!best || sc > best.sc) best = { x: px, z: pz, y: h, sc };
    }
  }
  return best || { x, z, y: terrainHeight(x, z) };
}
const nearWater = (x, z, r) => [[r, 0], [-r, 0], [0, r], [0, -r]].some(([dx, dz]) => terrainHeight(x + dx, z + dz) < -3);
const findCoast = (x, z, R = 6000) => search(x, z, R, 200, (px, pz, h) => h > 4 && h < 40 && nearWater(px, pz, 250));
const findSea = (x, z, depth, R = 8000) => search(x, z, R, 400, (px, pz, h) => h < -depth);
const findPeak = (x, z, R) => search(x, z, R, 250, () => true, (px, pz, h) => h);
const findFlat = (x, z, R, minH = 10) => search(x, z, R, 250, (px, pz, h) =>
  h > minH && Math.abs(terrainHeight(px + 150, pz) - h) < 8 && Math.abs(terrainHeight(px, pz + 150) - h) < 8);

// Point culminant de toute la carte (hors volcan)
const SUMMIT = (() => {
  const coarse = search(0, 0, HALF - 2000, 1000, () => true, (px, pz, h) => (Math.hypot(px - VOLCANO.x, pz - VOLCANO.z) < 8000 ? -1 : h));
  return findPeak(coarse.x, coarse.z, 800);
})();

const capitale = airportById('capitale');
const dunes = airportById('dunes');
const strip = ({ x, z, y }) => ({ x, z, y });

// ---------- Points d'intérêt ----------
export const LANDMARKS = [
  { id: 'sommet', name: 'Le Toit du Monde', type: 'summit', ...strip(SUMMIT) },
  { id: 'volcan', name: 'Le Volcan', type: 'volcano', x: VOLCANO.x, z: VOLCANO.z, y: rawHeight(VOLCANO.x + 520, VOLCANO.z) },
  { id: 'phare', name: 'Phare de l\'Ouest', type: 'lighthouse', ...strip(findCoast(-22000, 6000, 9000)) },
  { id: 'phare-nord', name: 'Phare du Nord', type: 'lighthouse', ...strip(findCoast(12000, -27000)) },
  { id: 'phare-sud', name: 'Phare du Sud', type: 'lighthouse', ...strip(findCoast(3000, 21000)) },
  { id: 'tour', name: 'Tour Radio', type: 'tower', ...strip(findPeak(capitale.x - 3000, capitale.z - 3500, 2500)) },
  { id: 'arche', name: 'Grande Arche', type: 'arch', ...strip(findSea(-16000, -24000, 15, 9000)) },
  { id: 'epave', name: 'L\'Épave', type: 'wreck', ...strip(findSea(32000, 3000, 8, 9000)) },
  { id: 'plateforme', name: 'Plateforme Pétrolière', type: 'rig', ...strip(findSea(-30000, -14000, 80, 9000)) },
  { id: 'chateau', name: 'Château des Brumes', type: 'castle', ...strip(findPeak(-12000, -2000, 3000)) },
  { id: 'pyramides', name: 'Les Pyramides', type: 'pyramids', ...strip(findFlat(dunes.x + 4000, dunes.z + 3000, 4000)) },
  { id: 'observatoire', name: 'Observatoire', type: 'observatory', ...strip(findPeak(-3000, -20000, 5000)) },
  { id: 'stade', name: 'Grand Stade', type: 'stadium', ...strip(findFlat(capitale.x + 2200, capitale.z - 1800, 2500)) },
  { id: 'colosse', name: 'Le Colosse', type: 'statue', ...strip(findFlat(-8000, 6000, 5000, 60)) },
];
export const landmarkById = (id) => LANDMARKS.find((l) => l.id === id);

function pick(a, du, dv) {
  const [x, z] = runwayPoint(a.x, a.z, a.heading, du, dv);
  return { x, z };
}

// Villes (bâtiments générés autour du centre)
export const CITIES = [
  { name: 'Capitale', ...pick(capitale, 2200, 0), radius: 1800, n: 900, tall: 120 },
  { name: 'Port Azur', ...pick(airportById('azur'), 1200, 600), radius: 900, n: 260, tall: 40 },
  { name: 'Port-Levant', ...pick(airportById('levant'), -1600, 1200), radius: 1200, n: 450, tall: 70 },
  { name: 'Alpha-Ville', ...pick(airportById('alpha'), 1300, -500), radius: 700, n: 160, tall: 25 },
  { name: 'Cap Nord', ...pick(airportById('nord'), -1200, 600), radius: 700, n: 150, tall: 25 },
];

// ---------- Trafic : bateaux, montgolfières, éoliennes ----------
function shipRoute(r, x, z) {
  const c = findSea(x, z, 30, 6000);
  if (c.y > -30) return null;
  let radius = 1500 + r() * 2500;
  const ok = (rad) => {
    for (let i = 0; i < 16; i++) {
      const t = (i / 16) * Math.PI * 2;
      if (terrainHeight(c.x + Math.cos(t) * rad, c.z + Math.sin(t) * rad) > -12) return false;
    }
    return true;
  };
  while (radius > 400 && !ok(radius)) radius *= 0.7;
  return radius > 400 ? { x: c.x, z: c.z, radius, speed: 6 + r() * 6, phase: r() * Math.PI * 2, dir: r() < 0.5 ? 1 : -1 } : null;
}
export const SHIPS = (() => {
  const r = rng(555);
  const out = [];
  for (let i = 0; i < 22; i++) {
    const s = shipRoute(r, (r() - 0.5) * WORLD.size * 0.9, (r() - 0.5) * WORLD.size * 0.9);
    if (s) out.push({ ...s, kind: r() < 0.45 ? 'cargo' : 'sail' });
  }
  return out;
})();

export const BALLOONS = (() => {
  const r = rng(808);
  const out = [];
  for (let i = 0; i < 14; i++) {
    const c = findFlat((r() - 0.5) * 50000, (r() - 0.5) * 50000, 6000);
    out.push({ x: c.x, z: c.z, alt: c.y + 300 + r() * 600, radius: 300 + r() * 900, phase: r() * 6.28, speed: 0.01 + r() * 0.01, color: Math.floor(r() * 6) });
  }
  return out;
})();

export const WIND_FARMS = (() => {
  const r = rng(321);
  const out = [];
  for (let i = 0; i < 6; i++) {
    const c = findFlat((r() - 0.5) * 50000, (r() - 0.5) * 50000, 6000, 40);
    out.push({ x: c.x, z: c.z, n: 6 + Math.floor(r() * 8), heading: r() * Math.PI });
  }
  return out;
})();

// ---------- Quêtes ----------
// Chaque quête a un « donneur » (balise jaune) placé quelque part sur la carte.
// Types d'objectifs : ring (anneau), land (atterrir à un aéroport),
// reach (approcher un point), altitude (atteindre une altitude).
const A = airportById;
const L = landmarkById;
const nextTo = (a, u = 110, v = 0) => pick(a, u, v);

function ringsAround(cx, cz, radius, count, agl, phase = 0) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const t = phase + (i / count) * Math.PI * 2;
    out.push({ type: 'ring', x: cx + Math.cos(t) * radius, z: cz + Math.sin(t) * radius, agl });
  }
  return out;
}
function ringsLine(x1, z1, x2, z2, count, agl) {
  const out = [];
  for (let i = 1; i <= count; i++) {
    const t = i / count;
    out.push({ type: 'ring', x: x1 + (x2 - x1) * t, z: z1 + (z2 - z1) * t, agl });
  }
  return out;
}

export const QUESTS = [
  {
    id: 'premier-vol', title: 'Premier vol', giver: nextTo(A('alpha'), 100, A('alpha').length / 2 - 250),
    desc: 'Démarre le moteur (E), décolle, passe les 4 anneaux autour de la base puis reviens te poser.',
    reward: 200,
    steps: [...ringsAround(A('alpha').x, A('alpha').z, 1800, 4, 200, 0), { type: 'land', airport: 'alpha' }],
  },
  {
    id: 'courrier', title: 'Courrier pour la Capitale', giver: nextTo(A('alpha'), 100, A('alpha').length / 2 - 450),
    desc: 'Le facteur est malade ! Apporte le courrier à Capitale International.',
    reward: 350, requires: 'premier-vol',
    steps: [{ type: 'land', airport: 'capitale' }],
  },
  {
    id: 'tour-radio', title: 'Inspection de l\'antenne', giver: nextTo(A('capitale'), 140, -600),
    desc: 'Fais deux tours de la Tour Radio pour vérifier l\'antenne.',
    reward: 300,
    steps: [...ringsAround(L('tour').x, L('tour').z, 600, 5, 250), ...ringsAround(L('tour').x, L('tour').z, 600, 5, 250)],
  },
  {
    id: 'stade', title: 'Survol du match', giver: nextTo(A('capitale'), 140, -300),
    desc: 'Une banderole publicitaire doit survoler le Grand Stade à basse altitude (moins de 200 m).',
    reward: 350,
    steps: [{ type: 'reach', x: L('stade').x, z: L('stade').z, radius: 300, maxAgl: 200, label: 'Grand Stade' }, { type: 'land', airport: 'capitale' }],
  },
  {
    id: 'phare', title: 'Le tour du phare', giver: nextTo(A('azur'), 120, 0),
    desc: 'Les touristes veulent des photos : fais le tour du Phare de l\'Ouest en passant les anneaux.',
    reward: 450,
    steps: ringsAround(L('phare').x, L('phare').z, 700, 6, 120),
  },
  {
    id: 'haute-altitude', title: 'Tête dans les nuages', giver: nextTo(A('givre'), 90, 0),
    desc: 'Monte au-dessus de 3 000 m d\'altitude pour mesurer la température.',
    reward: 500,
    steps: [{ type: 'altitude', min: 3000 }],
  },
  {
    id: 'sommet', title: 'Drapeau sur le Toit du Monde', giver: nextTo(A('givre'), 90, -200),
    desc: 'Survole le plus haut sommet de la carte à moins de 300 m.',
    reward: 600,
    steps: [{ type: 'reach', x: L('sommet').x, z: L('sommet').z, radius: 300, label: L('sommet').name }],
  },
  {
    id: 'observatoire', title: 'Livraison de télescope', giver: nextTo(A('glacier'), 90, 0),
    desc: 'Récupère la lentille à Mont Givre, survole l\'Observatoire, puis reviens à Station Glacier.',
    reward: 750,
    steps: [{ type: 'land', airport: 'givre' }, { type: 'reach', x: L('observatoire').x, z: L('observatoire').z, radius: 400, label: 'Observatoire' }, { type: 'land', airport: 'glacier' }],
  },
  {
    id: 'phare-nord', title: 'Ravitailler le gardien', giver: nextTo(A('nord'), 120, 0),
    desc: 'Le gardien du Phare du Nord attend ses vivres : survole le phare à basse altitude.',
    reward: 400,
    steps: [{ type: 'reach', x: L('phare-nord').x, z: L('phare-nord').z, radius: 300, maxAgl: 200, label: 'Phare du Nord' }, { type: 'land', airport: 'nord' }],
  },
  {
    id: 'epave', title: 'Recherche de l\'épave', giver: nextTo(A('levant'), 140, 0),
    desc: 'Un bateau a coulé au large. Va repérer l\'épave en volant bas.',
    reward: 450,
    steps: [{ type: 'reach', x: L('epave').x, z: L('epave').z, radius: 300, maxAgl: 250, label: 'L\'Épave' }],
  },
  {
    id: 'volcan', title: 'Mesures volcaniques', giver: nextTo(A('levant'), 140, 400),
    desc: 'Les scientifiques ont besoin de mesures : fais le tour du cratère puis pose-toi à la Base du Volcan.',
    reward: 800,
    steps: [...ringsAround(VOLCANO.x, VOLCANO.z, 1400, 6, 0).map((s) => ({ ...s, alt: VOLCANO.h + 200 })), { type: 'land', airport: 'volcan' }],
  },
  {
    id: 'pyramides', title: 'Le secret des pyramides', giver: nextTo(A('dunes'), 120, 0),
    desc: 'Des archéologues veulent des photos aériennes : passe les anneaux autour des pyramides.',
    reward: 500,
    steps: ringsAround(L('pyramides').x, L('pyramides').z, 500, 6, 100),
  },
  {
    id: 'arche', title: 'Slalom de l\'arche', giver: nextTo(A('verte'), 120, 0),
    desc: 'Passe sous la Grande Arche puis enchaîne les anneaux au ras de l\'eau.',
    reward: 700,
    steps: [
      { type: 'ring', x: L('arche').x, z: L('arche').z, agl: 60, size: 45 },
      ...ringsAround(L('arche').x, L('arche').z - 1500, 1100, 5, 60, Math.PI / 2),
    ],
  },
  {
    id: 'plateforme', title: 'Relève de l\'équipe', giver: nextTo(A('falaises'), 90, 0),
    desc: 'Survole la Plateforme Pétrolière pour larguer le courrier de l\'équipage.',
    reward: 550,
    steps: [{ type: 'reach', x: L('plateforme').x, z: L('plateforme').z, radius: 250, maxAgl: 200, label: 'Plateforme' }, { type: 'land', airport: 'falaises' }],
  },
  {
    id: 'chateau', title: 'Le fantôme du château', giver: nextTo(A('verte'), 120, 300),
    desc: 'On raconte qu\'un fantôme hante le Château des Brumes. Va voir de plus près (moins de 150 m).',
    reward: 450,
    steps: [{ type: 'reach', x: L('chateau').x, z: L('chateau').z, radius: 250, maxAgl: 150, label: 'Château' }],
  },
  {
    id: 'colosse', title: 'Course du Colosse', giver: nextTo(A('alpha'), 100, -A('alpha').length / 2 + 300),
    desc: 'Course d\'anneaux entre Base Alpha et le Colosse, puis retour à la base.',
    reward: 450, requires: 'premier-vol',
    steps: [...ringsLine(A('alpha').x, A('alpha').z, L('colosse').x, L('colosse').z, 7, 150), { type: 'land', airport: 'alpha' }],
  },
  {
    id: 'palmes', title: 'Vacances aux Palmes', giver: nextTo(A('corail'), 90, 0),
    desc: 'Emmène des touristes de l\'Île Corail à l\'Archipel des Palmes.',
    reward: 500,
    steps: [{ type: 'land', airport: 'palmes' }],
  },
  {
    id: 'medecin', title: 'Médecin volant', giver: nextTo(A('lac'), 90, 0),
    desc: 'Urgence ! Emmène le médecin à Cap Nord puis à Mont Givre.',
    reward: 650,
    steps: [{ type: 'land', airport: 'nord' }, { type: 'land', airport: 'givre' }],
  },
  {
    id: 'tour-monde', title: 'Le grand tour', giver: nextTo(A('alpha'), 100, -A('alpha').length / 2 + 500),
    desc: 'Pose-toi dans 8 aéroports aux quatre coins de la carte. La quête ultime !',
    reward: 4000, requires: 'courrier',
    steps: ['azur', 'dunes', 'palmes', 'corail', 'volcan', 'levant', 'nord', 'glacier'].filter(A).map((id) => ({ type: 'land', airport: id })),
  },
];
