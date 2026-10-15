// Boîte à outils pour écrire des quêtes.
// Ce fichier n'utilise pas three.js : il est aussi chargé par scripts/validate-quests.mjs (Node).
//
// ===== Format d'une quête =====
// {
//   id: 'identifiant-unique',            // kebab-case, unique dans tout le jeu
//   title: 'Titre court',
//   category: 'course' | 'livraison' | 'exploration' | 'voltige' | 'sauvetage' | 'tourisme' | 'defi',
//   airport: 'alpha',                    // quête proposée au tableau de cet aéroport…
//   giver: { x, z },                     // …OU à une balise placée n'importe où (sur la terre ferme)
//   desc: 'Description (1 à 2 phrases, en français, tutoiement)',
//   reward: 500,                         // argent (₣)
//   requires: 'autre-quete' | ['a', 'b'],// optionnel : quêtes à terminer avant
//   minRank: 0..5,                       // optionnel : rang de pilote requis (voir RANKS)
//   timeLimit: 300,                      // optionnel : secondes ; la quête échoue au-delà
//   bonusTime: 200, bonusReward: 300,    // optionnel : bonus si terminée en moins de bonusTime s
//   steps: [ ...étapes, dans l'ordre ],
// }
//
// ===== Étapes =====
// ring     { type:'ring', x, z, agl } ou { …, alt }   anneau à traverser (agl = hauteur au-dessus du sol/de la mer,
//                                                      alt = altitude absolue) ; size optionnel (rayon, défaut 30 m)
// land     { type:'land', airport }                   se poser et s'arrêter sur la piste
// touch    { type:'touch', airport }                  toucher-décoller : toucher la piste puis redécoller sans s'arrêter
// reach    { type:'reach', x, z, radius, label, maxAgl?, minAgl? }   passer dans une zone
// drop     { type:'drop', x, z, radius, label, maxAgl? }             larguer un colis (touche X) : réussi si le colis TOMBE dans
//                                                      la zone (trajectoire balistique : il faut lâcher ~150-250 m avant)
// altitude { type:'altitude', min }                   monter au-dessus de min mètres (altitude absolue)
// speed    { type:'speed', min }                      atteindre min km/h (≈245 km/h en palier, plus en piqué)
// low      { type:'low', maxAgl, duration, label?, x?, z?, radius? }  voler à moins de maxAgl m du sol pendant duration s
//                                                      (si x/z/radius : seulement dans cette zone)
// hold     { type:'hold', min, max, duration }        rester entre min et max m d'altitude pendant duration s
// inverted { type:'inverted', duration }              voler sur le dos pendant duration s
// follow   { type:'follow', ship: i | balloon: i, distance, duration, label }  rester près d'un bateau ou d'une montgolfière
//
// Toute étape accepte aussi :
//   text: 'texte affiché'   (sinon généré automatiquement)
//   spawn: 'raft' | 'hiker' | 'crate' | 'smoke' | 'flag' | 'tent'   objet affiché au point de l'étape pendant l'étape

import {
  AIRPORTS, LANDMARKS, CITIES, SHIPS, BALLOONS, WIND_FARMS, VOLCANO, HALF,
  airportById, landmarkById, terrainHeight, runwayPoint, findCoast, findSea, findPeak, findFlat, turbinePositions,
} from '../world.js';

export { AIRPORTS, LANDMARKS, CITIES, SHIPS, BALLOONS, WIND_FARMS, VOLCANO, HALF, terrainHeight, findCoast, findSea, findPeak, findFlat };

export const CATEGORIES = {
  course: 'Course',
  livraison: 'Livraison',
  exploration: 'Exploration',
  voltige: 'Voltige',
  sauvetage: 'Sauvetage',
  tourisme: 'Tourisme',
  defi: 'Défi',
  transport: 'Transport',
};

// Rangs de pilote (selon l'expérience gagnée = total des récompenses)
export const RANKS = [
  { name: 'Élève pilote', xp: 0 },
  { name: 'Pilote privé', xp: 1500 },
  { name: 'Pilote confirmé', xp: 5000 },
  { name: 'Commandant de bord', xp: 12000 },
  { name: 'Pilote de ligne', xp: 25000 },
  { name: 'As du ciel', xp: 50000 },
];

export function A(id) {
  const a = airportById(id);
  if (!a) throw new Error(`Aéroport inconnu : ${id}`);
  return a;
}
export function L(id) {
  const l = landmarkById(id);
  if (!l) throw new Error(`Lieu inconnu : ${id}`);
  return l;
}
export function city(name) {
  const c = CITIES.find((x) => x.name === name);
  if (!c) throw new Error(`Ville inconnue : ${name}`);
  return c;
}

// Point à côté d'une piste : u = travers (positif = côté hangars), v = le long de la piste
export function nextTo(a, u = 110, v = 0) {
  const [x, z] = runwayPoint(a.x, a.z, a.heading, u, v);
  return { x, z };
}
// Point au bout d'une piste (côté v positif ou négatif), à une distance donnée dans l'axe
export function runwayEnd(a, side = 1, beyond = 0) {
  return nextTo(a, 0, side * (a.length / 2 + beyond));
}
// Point à une distance et un cap (degrés, 0 = nord = -Z, 90 = est = +X) d'un point
export function offset(p, distance, headingDeg) {
  const h = (headingDeg * Math.PI) / 180;
  return { x: p.x + Math.sin(h) * distance, z: p.z - Math.cos(h) * distance };
}
export const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// ----- étapes -----
export const land = (airport, extra = {}) => ({ type: 'land', airport, ...extra });
export const touch = (airport, extra = {}) => ({ type: 'touch', airport, ...extra });
export const reach = (p, radius, label, extra = {}) => ({ type: 'reach', x: p.x, z: p.z, radius, label, ...extra });
export const drop = (p, radius, label, extra = {}) => ({ type: 'drop', x: p.x, z: p.z, radius, label, ...extra });
export const ring = (p, agl, extra = {}) => ({ type: 'ring', x: p.x, z: p.z, agl, ...extra });
export const ringAlt = (p, alt, extra = {}) => ({ type: 'ring', x: p.x, z: p.z, alt, ...extra });

// Anneaux en cercle autour d'un point
export function ringsAround(cx, cz, radius, count, agl, phase = 0, extra = {}) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const t = phase + (i / count) * Math.PI * 2;
    out.push({ type: 'ring', x: cx + Math.cos(t) * radius, z: cz + Math.sin(t) * radius, agl, ...extra });
  }
  return out;
}
// Anneaux en ligne droite (le premier est à 1/count du départ, le dernier à l'arrivée)
export function ringsLine(x1, z1, x2, z2, count, agl, extra = {}) {
  const out = [];
  for (let i = 1; i <= count; i++) {
    const t = i / count;
    out.push({ type: 'ring', x: x1 + (x2 - x1) * t, z: z1 + (z2 - z1) * t, agl, ...extra });
  }
  return out;
}
// Anneaux le long d'un chemin (liste de points {x,z}), espacés d'environ `spacing` mètres
export function ringsPath(points, spacing, agl, extra = {}) {
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const n = Math.max(1, Math.round(dist(a, b) / spacing));
    for (let k = i === 0 ? 0 : 1; k <= n; k++) {
      const t = k / n;
      out.push({ type: 'ring', x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, agl, ...extra });
    }
  }
  return out;
}
// Slalom : anneaux en ligne, décalés alternativement à gauche et à droite de `width` mètres
export function slalom(x1, z1, x2, z2, count, width, agl, extra = {}) {
  const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz);
  const nx = -dz / len, nz = dx / len;
  return ringsLine(x1, z1, x2, z2, count, agl, extra).map((r, i) => ({ ...r, x: r.x + nx * width * (i % 2 ? 1 : -1), z: r.z + nz * width * (i % 2 ? 1 : -1) }));
}
// Spirale montante : anneaux en cercle dont l'altitude absolue passe de alt0 à alt1
export function ringsSpiral(cx, cz, radius, count, alt0, alt1, phase = 0, extra = {}) {
  return ringsAround(cx, cz, radius, count, 0, phase, extra).map((r, i) => {
    const { agl, ...rest } = r;
    void agl;
    return { ...rest, alt: alt0 + ((alt1 - alt0) * i) / Math.max(1, count - 1) };
  });
}

// Suivi de terrain : transforme des anneaux (agl ou alt) en anneaux à altitude absolue,
// au moins `clearance` m au-dessus du relief survolé entre deux anneaux, avec une pente
// limitée (≤ maxSlope) pour rester pilotable. À utiliser au-dessus des collines et montagnes.
export function terrainFollow(rings, clearance = 150, maxSlope = 0.25) {
  const gnd = (x, z) => Math.max(0, terrainHeight(x, z));
  const pts = rings.map((r) => ({ ...r }));
  const alts = pts.map((r, i) => {
    let m = gnd(r.x, r.z);
    for (const j of [i - 1, i + 1]) {
      const o = pts[j];
      if (!o) continue;
      for (let k = 1; k <= 10; k++) {
        const t = (k / 10) * 0.5; // moitié du segment de chaque côté
        m = Math.max(m, gnd(r.x + (o.x - r.x) * t, r.z + (o.z - r.z) * t));
      }
    }
    return Math.max(m + clearance, r.alt ?? 0);
  });
  // limite la pente : on relève les anneaux trop bas par rapport à leurs voisins
  for (let pass = 0; pass < 20; pass++) {
    for (let i = 0; i < alts.length; i++) {
      for (const j of [i - 1, i + 1]) {
        if (j < 0 || j >= alts.length) continue;
        const d = Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z);
        alts[i] = Math.max(alts[i], alts[j] - d * maxSlope);
      }
    }
  }
  return pts.map((r, i) => {
    const { agl, ...rest } = r;
    void agl;
    return { ...rest, alt: Math.round(alts[i]) };
  });
}

// Positions des éoliennes d'un parc (index dans WIND_FARMS) réellement visibles dans le jeu :
// sur la terre ferme, loin des aéroports, des villes et des axes d'approche (même règle que l'affichage).
// Hauteur : mât 80 m + pales 36 m → passer à côté, ou au-dessus de 150 m.
export function windTurbines(farmIndex) {
  if (!WIND_FARMS[farmIndex]) throw new Error(`Parc éolien inconnu : ${farmIndex}`);
  return turbinePositions(farmIndex);
}
