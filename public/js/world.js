// Monde partagé : tout est généré à partir d'une graine fixe,
// donc chaque joueur obtient exactement la même carte.

export const WORLD = {
  seed: 1337,
  size: 200000, // 200 km x 200 km : le monde d'origine (80 km, au centre) entouré de nouvelles terres
  cell: 25, // résolution max du terrain (m), utilisée aussi pour les collisions
  chunk: 2000, // taille d'un morceau de terrain
};
export const HALF = WORLD.size / 2;
// monde d'origine (80 km) : tout ce qui y était reste exactement à sa place (relief, aéroports, villes, quêtes)
export const CORE = 80000, CORE_HALF = CORE / 2;
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
  const temp = 0.5 + (z / CORE) * 1.1 + (fbm(x / 15000, z / 15000, 3, S + 40) - 0.5) * 0.4;
  const dry = fbm(x / 20000, z / 20000, 3, S + 50) + ((z - x) / CORE) * 0.55;
  return { temp, dry };
}
export const snowLine = (temp) => 250 + Math.max(0, temp) * 2200;

// ---------- Relief ----------
export const VOLCANO = { x: 25000, z: 14000, r: 6500, h: 2300 };

export function rawHeight(x, z) {
  // au-delà du monde d'origine : nouvelles terres, fondues avec l'océan qui l'entourait
  const q = Math.max(Math.abs(x), Math.abs(z));
  const env = smoothstep(CORE_HALF + 1000, CORE_HALF + 12000, q);
  const core = env < 1 ? coreHeight(x, z) : 0;
  return env > 0 ? core + (outerHeight(x, z, q) - core) * env : core;
}

// Nouvelles terres : grands continents et archipels, chaînes de montagnes, puis l'océan au bord du monde
function outerHeight(x, z, q) {
  const cont = fbm(x / 34000, z / 34000, 4, S + 301);
  const isl = fbm(x / 7000, z / 7000, 4, S + 302);
  const edge = smoothstep(HALF - 9000, HALF - 2000, q); // l'océan revient au bord du monde
  const landVal = 0.17 + (cont - 0.5) * 1.15 + (isl - 0.5) * 0.5 - edge * 0.6;
  const land = smoothstep(0.14, 0.18, landVal);
  const inland = smoothstep(0.17, 0.36, landVal);
  const hills = (fbm(x / 4000, z / 4000, 5, S + 303) - 0.35) * 340 + 20 + inland * 170;
  const ridge = 1 - Math.abs(fbm(x / 3000, z / 3000, 5, S + 304) * 2 - 1);
  const mtn = smoothstep(0.5, 0.68, fbm(x / 16000, z / 16000, 3, S + 305)) * inland;
  const depth = 40 + 500 * smoothstep(0.14, -0.08, landVal);
  return land * hills - (1 - land) * depth + mtn * ridge * ridge * 2900;
}

function coreHeight(x, z) {
  const d = Math.hypot(x, z) / CORE_HALF;
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
  // nouvelles terres (au-delà du monde d'origine)
  { id: 'boreal', name: 'Boréal International', type: 'international', near: [0, -70000], search: 16000, outer: true },
  { id: 'taiga', name: 'Taïga', type: 'strip', near: [-55000, -62000], search: 14000, outer: true },
  { id: 'fjord', name: 'Fjord-aux-Ours', type: 'regional', near: [58000, -60000], search: 14000, outer: true },
  { id: 'orient', name: 'Porte d\'Orient', type: 'international', near: [72000, 0], search: 16000, outer: true },
  { id: 'savane', name: 'Savane Dorée', type: 'regional', near: [60000, 58000], search: 14000, outer: true },
  { id: 'tropiques', name: 'Grand Lagon', type: 'regional', near: [0, 72000], search: 16000, outer: true },
  { id: 'mangrove', name: 'Mangrove', type: 'strip', near: [-58000, 60000], search: 14000, outer: true },
  { id: 'ponant', name: 'Ponant', type: 'international', near: [-72000, 0], search: 16000, outer: true },
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
  const R = spec.search, STEP = spec.outer ? 1250 : 500; // nouvelles terres : recherche plus large, donc plus espacée
  for (let dx = -R; dx <= R; dx += STEP) {
    for (let dz = -R; dz <= R; dz += STEP) {
      const x = spec.near[0] + dx, z = spec.near[1] + dz;
      const lim = (spec.outer ? HALF : CORE_HALF) - 3000;
      if (Math.abs(x) > lim || Math.abs(z) > lim) continue;
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
function search(x, z, R, step, test, score, lim = CORE_HALF - 1000) {
  let best = null;
  for (let dx = -R; dx <= R; dx += step) {
    for (let dz = -R; dz <= R; dz += step) {
      const px = x + dx, pz = z + dz;
      if (Math.abs(px) > lim || Math.abs(pz) > lim) continue;
      const h = terrainHeight(px, pz);
      if (!test(px, pz, h)) continue;
      const sc = score ? score(px, pz, h) : -Math.hypot(dx, dz);
      if (!best || sc > best.sc) best = { x: px, z: pz, y: h, sc };
    }
  }
  return best || { x, z, y: terrainHeight(x, z) };
}
const nearWater = (x, z, r) => [[r, 0], [-r, 0], [0, r], [0, -r]].some(([dx, dz]) => terrainHeight(x + dx, z + dz) < -3);
export const findCoast = (x, z, R = 6000) => search(x, z, R, 200, (px, pz, h) => h > 4 && h < 40 && nearWater(px, pz, 250));
export const findSea = (x, z, depth, R = 8000) => search(x, z, R, 400, (px, pz, h) => h < -depth);
export const findPeak = (x, z, R) => search(x, z, R, 250, () => true, (px, pz, h) => h);
export const findFlat = (x, z, R, minH = 10) => search(x, z, R, 250, (px, pz, h) =>
  h > minH && Math.abs(terrainHeight(px + 150, pz) - h) < 8 && Math.abs(terrainHeight(px, pz + 150) - h) < 8);

// Point culminant de toute la carte (hors volcan)
const SUMMIT = (() => {
  const coarse = search(0, 0, CORE_HALF - 2000, 1000, () => true, (px, pz, h) => (Math.hypot(px - VOLCANO.x, pz - VOLCANO.z) < 8000 ? -1 : h));
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

export function pick(a, du, dv) {
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
  // nouvelles terres
  ...[['Boréalis', 'boreal', 1500, 110], ['Orientia', 'orient', 1500, 100], ['Ponant-la-Grande', 'ponant', 1400, 90], ['Lagon-City', 'tropiques', 900, 45]]
    .filter(([, id]) => airportById(id))
    .map(([name, id, radius, tall]) => ({ name, ...pick(airportById(id), radius + 600, 0), radius, n: Math.round(radius * 0.45), tall })),
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
// Villages : maisons groupées le long de rues, près des aéroports sans ville et dans les campagnes
// (les maisons sont posées par decor.js, les noms affichés par objects.js)
export const TOWNS = [
  ['Givre-le-Bourg', 'givre'], ['Hameau des Glaces', 'glacier'], ['Ksar des Dunes', 'dunes'], ['Village de Corail', 'corail'],
  ['Cendreville', 'volcan'], ['Verte-sur-Prés', 'verte'], ['Miroir-les-Bains', 'lac'], ['Falaise-Haute', 'falaises'], ['Port-Palmes', 'palmes'],
  ['Saint-Aubin', null, [5000, 6000]], ['Les Granges', null, [-9000, 2000]], ['Montrouge', null, [16000, -14000]], ['Beaulieu', null, [-2000, 12000]],
  // nouvelles terres
  ['Taïga-les-Pins', 'taiga'], ['Ours-sur-Fjord', 'fjord'], ['Savane-Dorée', 'savane'], ['Palétuviers', 'mangrove'],
].filter(([, airport]) => !airport || airportById(airport)).map(([name, airport, at], i) => {
  const near = airport ? pick(airportById(airport), 950, 350) : { x: at[0], z: at[1] };
  const p = findFlat(near.x, near.z, 1800, 6);
  return { name, x: p.x, z: p.z, radius: 380 + (i % 3) * 60, n: 55 + (i % 4) * 12, angle: (i * 0.7) % Math.PI };
});

export const SHIPS = (() => {
  const r = rng(555);
  const out = [];
  for (let i = 0; i < 22; i++) {
    const s = shipRoute(r, (r() - 0.5) * CORE * 0.9, (r() - 0.5) * CORE * 0.9);
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
  // une montgolfière vole toujours au moins 250 m au-dessus du relief de tout son circuit
  for (const b of out) {
    let relief = 0;
    for (let k = 0; k < 36; k++) {
      const a = (k / 36) * Math.PI * 2;
      for (const rr of [0, b.radius * 0.5, b.radius, b.radius + 300]) relief = Math.max(relief, terrainHeight(b.x + Math.cos(a) * rr, b.z + Math.sin(a) * rr));
    }
    b.alt = Math.max(b.alt, relief + 250);
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

// Éoliennes réellement construites d'un parc : sur la terre ferme, loin des aéroports et des villes,
// et jamais dans l'axe d'approche d'une piste. Utilisé par l'affichage ET par les quêtes.
export function turbinePositions(farmIndex) {
  const f = WIND_FARMS[farmIndex];
  if (!f) return [];
  const out = [];
  for (let i = 0; i < f.n; i++) {
    const x = f.x + Math.cos(f.heading) * (i - f.n / 2) * 220, z = f.z + Math.sin(f.heading) * (i - f.n / 2) * 220;
    if (terrainHeight(x, z) < 5) continue;
    if (AIRPORTS.some((a) => Math.hypot(x - a.x, z - a.z) < a.length / 2 + a.pad + 500)) continue;
    if (CITIES.some((c) => Math.hypot(x - c.x, z - c.z) < c.radius + 200)) continue;
    if (AIRPORTS.some((a) => { const { u, v } = runwayLocal(a, x, z); return Math.abs(u) < 450 && Math.abs(v) < a.length / 2 + 3500; })) continue;
    out.push({ x, z });
  }
  return out;
}

// ---------- Positions des objets mobiles (horloge commune t en secondes) ----------
// Tous les joueurs voient les bateaux et montgolfières au même endroit.
export function shipPosition(s, t) {
  const a = s.phase + (s.dir * s.speed * t) / s.radius;
  return { x: s.x + Math.cos(a) * s.radius, y: 0, z: s.z + Math.sin(a) * s.radius, angle: a };
}
export function balloonPosition(b, t) {
  const a = b.phase + t * b.speed;
  return { x: b.x + Math.cos(a) * b.radius, y: b.alt + Math.sin(t * 0.2 + b.phase) * 25, z: b.z + Math.sin(a) * b.radius };
}
