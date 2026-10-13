// Monde partagé : tout est généré à partir d'une graine fixe,
// donc chaque joueur obtient exactement la même carte.

export const WORLD = {
  seed: 1337,
  size: 20000, // 20 km x 20 km
  segments: 400, // résolution du terrain (50 m par case)
};

const HALF = WORLD.size / 2;
const STEP = WORLD.size / WORLD.segments;

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

function rawHeight(x, z) {
  const s = WORLD.seed;
  const d = Math.hypot(x, z) / HALF; // 0 au centre, 1 au bord
  const warp = (fbm(x / 4000, z / 4000, 3, s + 3) - 0.5) * 0.7; // côtes irrégulières
  const land = 1 - smoothstep(0.55, 0.85, d + warp);
  const hills = (fbm(x / 3000, z / 3000, 5, s) - 0.3) * 320 + 30;
  const ridge = 1 - Math.abs(fbm(x / 2200, z / 2200, 4, s + 99) * 2 - 1);
  const mountains = smoothstep(0.5, 0.72, fbm(x / 6000, z / 6000, 2, s + 7));
  const inland = 1 - smoothstep(0.4, 0.75, d + warp);
  return land * hills - (1 - land) * 220 + mountains * ridge * ridge * 1500 * inland;
}

// ---------- Aéroports ----------
// heading en radians : 0 = piste orientée nord/sud
export const AIRPORTS = [
  { id: 'alpha', name: 'Base Alpha', x: 0, z: 0, heading: 0 },
  { id: 'azur', name: 'Port Azur', x: -5300, z: 4700, heading: Math.PI / 2 },
  { id: 'givre', name: 'Mont Givre', x: -4000, z: -350, heading: Math.PI / 4 },
  { id: 'corail', name: 'Île Corail', x: 5800, z: 2900, heading: -Math.PI / 6 },
  { id: 'verte', name: 'Vallée Verte', x: -3600, z: -4200, heading: Math.PI / 3 },
];
export const RUNWAY = { length: 1400, width: 40 };

for (const a of AIRPORTS) a.elev = Math.max(12, rawHeight(a.x, a.z));

// Coordonnées locales à la piste (u = travers, v = longueur)
export function runwayLocal(a, x, z) {
  const dx = x - a.x, dz = z - a.z;
  const c = Math.cos(a.heading), s = Math.sin(a.heading);
  return { u: dx * c - dz * s, v: dx * s + dz * c };
}

function analyticHeight(x, z) {
  let h = rawHeight(x, z);
  for (const a of AIRPORTS) {
    const { u, v } = runwayLocal(a, x, z);
    const du = Math.max(0, Math.abs(u) - 260);
    const dv = Math.max(0, Math.abs(v) - RUNWAY.length / 2 - 150);
    const dist = Math.hypot(du, dv);
    const w = 1 - smoothstep(0, 700, dist);
    h = h + (a.elev - h) * w;
  }
  return h;
}

// Grille de hauteurs utilisée à la fois pour le maillage ET les collisions
const N = WORLD.segments + 1;
export const heightGrid = new Float32Array(N * N);
for (let iz = 0; iz < N; iz++) {
  for (let ix = 0; ix < N; ix++) {
    heightGrid[iz * N + ix] = analyticHeight(-HALF + ix * STEP, -HALF + iz * STEP);
  }
}

// Interpolation identique aux triangles du maillage (diagonale b-c)
export function heightAt(x, z) {
  const gx = (x + HALF) / STEP, gz = (z + HALF) / STEP;
  const ix = Math.min(N - 2, Math.max(0, Math.floor(gx)));
  const iz = Math.min(N - 2, Math.max(0, Math.floor(gz)));
  const fx = Math.min(1, Math.max(0, gx - ix)), fz = Math.min(1, Math.max(0, gz - iz));
  const a = heightGrid[iz * N + ix], b = heightGrid[iz * N + ix + 1];
  const c = heightGrid[(iz + 1) * N + ix], d = heightGrid[(iz + 1) * N + ix + 1];
  if (fx + fz <= 1) return a + (b - a) * fx + (c - a) * fz;
  return d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
}

export function onRunway(x, z) {
  for (const a of AIRPORTS) {
    const { u, v } = runwayLocal(a, x, z);
    if (Math.abs(u) < RUNWAY.width / 2 + 10 && Math.abs(v) < RUNWAY.length / 2 + 30) return a;
  }
  return null;
}

// Point le plus haut de la carte (pour la quête du sommet)
export const SUMMIT = (() => {
  let best = 0;
  for (let i = 1; i < heightGrid.length; i++) if (heightGrid[i] > heightGrid[best]) best = i;
  return { x: -HALF + (best % N) * STEP, z: -HALF + Math.floor(best / N) * STEP, y: heightGrid[best] };
})();

// ---------- Points d'intérêt ----------
export const LANDMARKS = [
  { id: 'phare', name: 'Le Phare', type: 'lighthouse', x: -5600, z: 1300 },
  { id: 'tour', name: 'Tour Radio', type: 'tower', x: 1500, z: 2600 },
  { id: 'arche', name: 'Grande Arche', type: 'arch', x: -2600, z: -7600 },
  { id: 'epave', name: "L'Épave", type: 'wreck', x: 8400, z: -1500 },
  { id: 'sommet', name: 'Le Sommet', type: 'summit', x: SUMMIT.x, z: SUMMIT.z },
];

const airport = (id) => AIRPORTS.find((a) => a.id === id);
const lm = (id) => LANDMARKS.find((l) => l.id === id);

function ringsAround(cx, cz, radius, count, agl, phase = 0) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const t = phase + (i / count) * Math.PI * 2;
    out.push({ type: 'ring', x: cx + Math.cos(t) * radius, z: cz + Math.sin(t) * radius, agl });
  }
  return out;
}

// ---------- Quêtes ----------
// Chaque quête a un « donneur » (balise jaune) placé quelque part sur la carte.
// Types d'objectifs : ring (anneau), land (atterrir à un aéroport),
// reach (approcher un point), altitude (atteindre une altitude).
export const QUESTS = [
  {
    id: 'premier-vol', title: 'Premier vol', giver: { x: 90, z: 520 },
    desc: 'Décolle de Base Alpha et passe les 4 anneaux autour de la base, puis reviens te poser.',
    reward: 200,
    steps: [...ringsAround(0, 0, 1500, 4, 150, -Math.PI / 2), { type: 'land', airport: 'alpha' }],
  },
  {
    id: 'courrier', title: 'Courrier pour Port Azur', giver: { x: -90, z: 520 },
    desc: 'Le facteur est malade ! Apporte le courrier à Port Azur.',
    reward: 350, requires: 'premier-vol',
    steps: [{ type: 'land', airport: 'azur' }],
  },
  {
    id: 'phare', title: 'Le tour du phare', giver: { x: airport('azur').x + 300, z: airport('azur').z + 200 },
    desc: 'Les touristes veulent des photos : fais le tour du phare en passant les anneaux.',
    reward: 400,
    steps: ringsAround(lm('phare').x, lm('phare').z, 700, 6, 120),
  },
  {
    id: 'haute-altitude', title: 'Tête dans les nuages', giver: { x: airport('givre').x - 300, z: airport('givre').z + 300 },
    desc: 'Monte au-dessus de 2 200 m d\'altitude pour mesurer la température.',
    reward: 450,
    steps: [{ type: 'altitude', min: 2200 }],
  },
  {
    id: 'sommet', title: 'Drapeau au sommet', giver: { x: airport('givre').x + 300, z: airport('givre').z - 300 },
    desc: 'Survole le plus haut sommet de l\'île à moins de 250 m.',
    reward: 500,
    steps: [{ type: 'reach', x: SUMMIT.x, z: SUMMIT.z, radius: 250, label: 'Le Sommet' }],
  },
  {
    id: 'ravitaillement', title: 'Ravitaillement', giver: { x: airport('corail').x + 250, z: airport('corail').z },
    desc: 'Transporte des vivres de l\'Île Corail jusqu\'à Mont Givre, avec une escale à Base Alpha.',
    reward: 650,
    steps: [{ type: 'land', airport: 'alpha' }, { type: 'land', airport: 'givre' }],
  },
  {
    id: 'epave', title: 'Recherche de l\'épave', giver: { x: lm('tour').x, z: lm('tour').z + 250 },
    desc: 'Un bateau a coulé à l\'est. Va repérer l\'épave en volant bas.',
    reward: 400,
    steps: [{ type: 'reach', x: lm('epave').x, z: lm('epave').z, radius: 300, maxAgl: 250, label: "L'Épave" }],
  },
  {
    id: 'arche', title: 'Slalom de l\'arche', giver: { x: airport('verte').x + 250, z: airport('verte').z + 250 },
    desc: 'Passe sous la Grande Arche, puis enchaîne les anneaux au ras du sol.',
    reward: 600,
    steps: [
      { type: 'ring', x: lm('arche').x, z: lm('arche').z, agl: 60, size: 45 },
      ...ringsAround(lm('arche').x, lm('arche').z - 1200, 900, 5, 80, Math.PI / 2),
    ],
  },
  {
    id: 'tour-ile', title: 'Le grand tour', giver: { x: 300, z: -300 },
    desc: 'Pose-toi dans les 5 aéroports de l\'île. La quête ultime !',
    reward: 1500, requires: 'courrier',
    steps: ['azur', 'verte', 'givre', 'corail', 'alpha'].map((id) => ({ type: 'land', airport: id })),
  },
];
