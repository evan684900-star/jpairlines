// Personnalisation des avions (hangar) : options possibles, valeurs par défaut et vérification.
// Sans three.js : aussi chargé par le serveur pour vérifier ce qu'envoient les joueurs.

export const PATTERNS = [
  ['origine', 'D\'origine'], ['uni', 'Uni'], ['bande', 'Grande bande'], ['bicolore', 'Bicolore'],
  ['eclair', 'Éclair'], ['flammes', 'Flammes'], ['damier', 'Damier'], ['pointe', 'Nez et queue'],
  ['vagues', 'Vagues'], ['pois', 'Pois'], ['chevrons', 'Chevrons'], ['tricolore', 'Tricolore'],
  ['course', 'Bandes de course'], ['degrade', 'Dégradé'], ['tigre', 'Tigre'], ['camo', 'Camouflage'],
  ['digital', 'Camouflage numérique'], ['arcenciel', 'Arc-en-ciel'],
];
export const FINISHES = [
  ['brillant', 'Brillant'], ['mat', 'Mat'], ['satin', 'Satiné'], ['metal', 'Métallisé'], ['candy', 'Bonbon (vernis profond)'],
  ['chrome', 'Chromé'], ['nacre', 'Nacré'], ['vieilli', 'Vieilli'],
];
export const WINGS = [['origine', 'D\'origine'], ['uni', 'Unies'], ['bouts', 'Bouts colorés'], ['damier', 'Bouts en damier'], ['bandes', 'Bandes noires et blanches'], ['chevron', 'Chevron'], ['bord', 'Bord d\'attaque coloré']];
export const EMBLEMS = [
  ['aucun', 'Aucun'], ['etoile', 'Étoile'], ['eclair', 'Éclair'], ['coeur', 'Cœur'], ['cocarde', 'Cocarde'],
  ['numero', 'Numéro de course'], ['couronne', 'Couronne'], ['aile', 'Ailes JP'],
];
// zones que l'on peut peindre d'une couleur à part (par-dessus le motif)
export const ZONES = [
  ['top', 'Dos du fuselage'], ['belly', 'Ventre'], ['nose', 'Nez et capot'], ['fin', 'Dérive'], ['stab', 'Stabilisateur'],
  ['wings', 'Ailes'], ['tips', 'Bouts d\'ailes'], ['surfaces', 'Gouvernes (ailerons, volets…)'], ['spinner', 'Cône d\'hélice'],
  ['pants', 'Carénages de roues'], ['nacelles', 'Moteurs et nacelles'],
];
// autocollants : collés n'importe où sur l'avion (dessins dans stickers.js)
export const STICKERS = [
  ['etoile', 'Étoile', 150], ['coeur', 'Cœur', 150], ['eclair', 'Éclair', 200], ['cocarde', 'Cocarde', 250], ['cible', 'Cible', 250],
  ['couronne', 'Couronne', 300], ['flamme', 'Flamme', 300], ['ailes', 'Ailes JP', 300], ['crane', 'Tête de mort', 350],
  ['requin', 'Requin', 400], ['aigle', 'Aigle', 450], ['ancre', 'Ancre', 250], ['soleil', 'Soleil', 200], ['lune', 'Lune', 200],
  ['trefle', 'Trèfle', 200], ['diamant', 'Diamant', 300], ['damier', 'Drapeau à damier', 250], ['fusee', 'Fusée', 350],
  ['patte', 'Patte', 200], ['sourire', 'Sourire', 150], ['note', 'Note de musique', 200], ['fleur', 'Fleur', 200],
  ['erable', 'Feuille d\'érable', 250], ['montagne', 'Montagne', 250], ['onde', 'Vague', 250], ['planete', 'Planète', 350],
  ['texte', 'Texte personnalisé', 400],
];
export const MAX_STICKERS = 16;
// couleurs proposées (le joueur peut aussi choisir n'importe quelle couleur)
export const SWATCHES = [
  '#f4f1ea', '#1c1e22', '#c8261e', '#ff7a1a', '#f2c21b', '#3fae4a', '#1d6f5f', '#2a8fd8',
  '#1d3f7a', '#6b3fa0', '#e8609c', '#8a6238', '#9aa3ad', '#d4af37', '#7fe3ff', '#b4ff3a',
  '#7a0f14', '#ff4f6d', '#ffb38a', '#fff3a0', '#0b3d1f', '#8fbf6a', '#00a6a6', '#9fd4ff',
  '#0a1b3f', '#3a2a6b', '#c9a0ff', '#4a3121', '#d9c3a0', '#5a6068', '#c0c6cc', '#ff00aa',
];

export const DEFAULT_LIVERY = {
  body: null, accent: null, stripe: null, // null = couleurs d'origine de l'avion
  pattern: 'origine', finish: 'brillant', wings: 'origine',
  tips: '#f2c21b', // bouts d'hélice
  reg: '', // immatriculation (vide = celle de l'avion)
  emblem: 'aucun', emblemColor: '#f2c21b', number: 7,
  sharkTeeth: false,
  smoke: '#ffffff', // fumigène (touche N)
  zones: {}, // { zone: '#rrggbb' }
  stickers: [], // [{ k, p:[x,y,z], n:[x,y,z], s, r, c, t, m }]
};

const COLOR = /^#[0-9a-f]{6}$/i;
const oneOf = (list, v, d) => (list.some(([k]) => k === v) ? v : d);
const color = (v, d) => (typeof v === 'string' && COLOR.test(v) ? v.toLowerCase() : d);
const num = (v, min, max, d) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d);
const r3 = (v) => Math.round(v * 1000) / 1000;
// texte d'un autocollant : lettres, chiffres et ponctuation simple
export const cleanStickerText = (s) => (typeof s === 'string' ? s.replace(/[^\p{L}\p{N} !?.,'&#+-]/gu, '').trim().slice(0, 12) : '');

function cleanSticker(s) {
  if (!s || typeof s !== 'object' || !STICKERS.some(([k]) => k === s.k)) return null;
  if (!Array.isArray(s.p) || !Array.isArray(s.n) || s.p.length !== 3 || s.n.length !== 3) return null;
  const p = s.p.map((v) => r3(num(v, -20, 20, 0)));
  let n = s.n.map((v) => num(v, -1, 1, 0));
  const l = Math.hypot(...n);
  if (l < 0.1) return null;
  n = n.map((v) => r3(v / l));
  const out = { k: s.k, p, n, s: r3(num(s.s, 0.15, 3, 0.5)), r: Math.round(num(s.r, -180, 180, 0)), c: color(s.c, '#1c1e22'), m: s.m === true };
  if (s.k === 'texte') {
    out.t = cleanStickerText(s.t);
    if (!out.t) return null;
  }
  return out;
}

// livrée complète et sûre à partir de n'importe quel objet (sauvegarde, réseau)
export function cleanLivery(l) {
  const d = DEFAULT_LIVERY;
  if (!l || typeof l !== 'object') return { ...d, zones: {}, stickers: [] };
  const zones = {};
  if (l.zones && typeof l.zones === 'object') for (const [k] of ZONES) { const c = color(l.zones[k], null); if (c) zones[k] = c; }
  return {
    body: color(l.body, null), accent: color(l.accent, null), stripe: color(l.stripe, null),
    pattern: oneOf(PATTERNS, l.pattern, d.pattern), finish: oneOf(FINISHES, l.finish, d.finish), wings: oneOf(WINGS, l.wings, d.wings),
    tips: color(l.tips, d.tips),
    reg: typeof l.reg === 'string' ? l.reg.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 7) : '',
    emblem: oneOf(EMBLEMS, l.emblem, d.emblem), emblemColor: color(l.emblemColor, d.emblemColor),
    number: Number.isInteger(l.number) && l.number >= 0 && l.number <= 99 ? l.number : d.number,
    sharkTeeth: l.sharkTeeth === true,
    smoke: color(l.smoke, d.smoke),
    zones,
    stickers: (Array.isArray(l.stickers) ? l.stickers : []).slice(0, MAX_STICKERS).map(cleanSticker).filter(Boolean),
  };
}

// ----- Boutique du hangar -----
// Chaque élément s'achète une seule fois puis sert sur tous les avions. Clés : 'color:#rrggbb', 'custom-color',
// 'pattern:x', 'wings:x', 'finish:x', 'emblem:x', 'zone:x', 'sticker:x', 'teeth', 'reg', 'smoke'.
// Les couleurs et motifs d'origine sont gratuits.
const P = {
  'custom-color': 2000, teeth: 1000, reg: 500, smoke: 1500,
  'pattern:uni': 200, 'pattern:pointe': 300, 'pattern:bande': 400, 'pattern:bicolore': 400, 'pattern:eclair': 700, 'pattern:damier': 800, 'pattern:flammes': 900,
  'pattern:vagues': 600, 'pattern:pois': 600, 'pattern:chevrons': 700, 'pattern:tricolore': 500, 'pattern:course': 800, 'pattern:degrade': 900,
  'pattern:tigre': 1200, 'pattern:camo': 1200, 'pattern:digital': 1400, 'pattern:arcenciel': 2000,
  'wings:uni': 150, 'wings:bouts': 300, 'wings:bandes': 500, 'wings:damier': 600, 'wings:chevron': 500, 'wings:bord': 300,
  'finish:mat': 400, 'finish:satin': 500, 'finish:metal': 800, 'finish:candy': 1500, 'finish:chrome': 2000, 'finish:nacre': 2500, 'finish:vieilli': 600,
  'emblem:etoile': 300, 'emblem:eclair': 300, 'emblem:coeur': 300, 'emblem:numero': 400, 'emblem:cocarde': 500, 'emblem:aile': 600, 'emblem:couronne': 700,
};
for (const [k] of ZONES) P[`zone:${k}`] = 250;
for (const [k, , price] of STICKERS) P[`sticker:${k}`] = price;
const FREE_COLORS = ['#f4f1ea', '#1c1e22', '#f2c21b', '#ffffff'];
export function priceOf(key) {
  if (key.startsWith('color:')) return FREE_COLORS.includes(key.slice(6)) ? 0 : 150;
  return P[key] ?? 0;
}
export const PRICE_LABEL = (n) => `${n.toLocaleString('fr-FR')} ₣`;
