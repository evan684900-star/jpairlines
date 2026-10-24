// Personnalisation des avions (hangar) : options possibles, valeurs par défaut et vérification.
// Sans three.js : aussi chargé par le serveur pour vérifier ce qu'envoient les joueurs.

export const PATTERNS = [
  ['origine', 'D\'origine'], ['uni', 'Uni'], ['bande', 'Grande bande'], ['bicolore', 'Bicolore'],
  ['eclair', 'Éclair'], ['flammes', 'Flammes'], ['damier', 'Damier'], ['pointe', 'Nez et queue'],
  ['vagues', 'Vagues'], ['pois', 'Pois'], ['chevrons', 'Chevrons'], ['tricolore', 'Tricolore'],
  ['course', 'Bandes de course'], ['degrade', 'Dégradé'], ['tigre', 'Tigre'], ['camo', 'Camouflage'],
  ['digital', 'Camouflage numérique'], ['arcenciel', 'Arc-en-ciel'],
  // inspirés de vrais avions : bandes du Débarquement (1944), rayons de soleil des avions de voltige (Pitts),
  // filet de ligne aérienne des années 60, chasseur de la Seconde Guerre mondiale…
  ['invasion', 'Bandes du Débarquement'], ['soleil', 'Rayons de soleil'], ['cheatline', 'Filet de ligne aérienne'],
  ['retro', 'Rétro années 50'], ['warbird', 'Chasseur 1944'], ['zebre', 'Zèbre'], ['leopard', 'Léopard'],
  ['hexa', 'Nid d\'abeille'], ['ecossais', 'Écossais'], ['eclabous', 'Éclaboussures'], ['etoiles', 'Ciel étoilé'],
  ['pixel', 'Pixels 8 bits'], ['carbone', 'Fibre de carbone'], ['diagonale', 'Grande diagonale'],
];
export const FINISHES = [
  ['brillant', 'Brillant'], ['mat', 'Mat'], ['satin', 'Satiné'], ['metal', 'Métallisé'], ['candy', 'Bonbon (vernis profond)'],
  ['chrome', 'Chromé'], ['nacre', 'Nacré'], ['vieilli', 'Vieilli'],
  ['irise', 'Caméléon (change de couleur)'], ['brosse', 'Aluminium brossé'], ['miroir', 'Miroir'], ['velours', 'Velours'],
  ['givre', 'Givré'], ['perle', 'Perle satinée'],
];
export const WINGS = [['origine', 'D\'origine'], ['uni', 'Unies'], ['bouts', 'Bouts colorés'], ['damier', 'Bouts en damier'], ['bandes', 'Bandes noires et blanches'], ['chevron', 'Chevron'], ['bord', 'Bord d\'attaque coloré'],
  ['invasion', 'Bandes du Débarquement'], ['soleil', 'Rayons de soleil'], ['etoiles', 'Étoiles'], ['degrade', 'Dégradé vers les bouts'], ['fuite', 'Bord de fuite coloré'], ['flammes', 'Flammes']];
export const EMBLEMS = [
  ['aucun', 'Aucun'], ['etoile', 'Étoile'], ['eclair', 'Éclair'], ['coeur', 'Cœur'], ['cocarde', 'Cocarde'],
  ['numero', 'Numéro de course'], ['couronne', 'Couronne'], ['aile', 'Ailes JP'],
  // mêmes dessins que les autocollants
  ['aigle', 'Aigle'], ['requin', 'Requin'], ['crane', 'Tête de mort'], ['soleil', 'Soleil'], ['planete', 'Planète'],
  ['helice', 'Hélice'], ['boussole', 'Rose des vents'], ['globe', 'Globe'], ['bouclier', 'Bouclier'],
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
  ['avion', 'Silhouette d\'avion', 300], ['helice', 'Hélice', 250], ['boussole', 'Rose des vents', 300], ['globe', 'Globe', 350],
  ['nuage', 'Nuage', 150], ['arcenciel', 'Arc-en-ciel', 300], ['pique', 'Pique', 150], ['flocon', 'Flocon', 200],
  ['goutte', 'Goutte d\'eau', 150], ['bouclier', 'Bouclier', 300], ['galons', 'Galons', 250], ['yinyang', 'Yin et yang', 250],
  ['texte', 'Texte personnalisé', 400],
];
// fumigène : une couleur, deux couleurs en alternance, arc-en-ciel ou bleu-blanc-rouge
export const SMOKE_MODES = [['uni', 'Une couleur'], ['bicolore', 'Deux couleurs en alternance'], ['arcenciel', 'Arc-en-ciel'], ['tricolore', 'Bleu, blanc, rouge']];
// tenue du pilote de la cinématique (teintes : chemise, casquette, pantalon, cravate)
export const SUITS = [
  ['commandant', 'Commandant de bord'], ['voltige', 'Pilote de voltige'], ['vintage', 'Aviateur des années 30'],
  ['nuit', 'Vol de nuit'], ['tropique', 'Tropiques'], ['militaire', 'Escadrille'], ['vip', 'Jet privé'],
  ['course', 'Pilote de course'], ['pompier', 'Pompier du ciel'], ['cowboy', 'Cow-boy du ciel'], ['pirate', 'Pirate de l\'air'],
  ['noel', 'Père Noël'], ['astronaute', 'Cosmonaute'],
];
// Tenues : vêtements recolorés en entier (couleur ou motif, par matériau du modèle : Shirt, Trousers, Cap, Tie,
// Leather = chaussures et ceinture), éléments cachés (hide) et accessoires (acc, voir pilotOutfit.js).
const NO_UNIFORM = ['Cap', 'Tie', 'Insignia'];
export const OUTFITS = {
  commandant: {},
  voltige: { cloth: { Shirt: '#d8261e', Trousers: '#d8261e' }, hide: NO_UNIFORM, acc: { helmet: { color: '#f4f4f0', stripe: '#d8261e' } } },
  vintage: { cloth: { Shirt: '#6b4428', Trousers: '#a88458', Leather: '#3a2414' }, hide: NO_UNIFORM, acc: { leather: { color: '#5a3a20' }, scarf: { color: '#f4f1ea' } } },
  nuit: { cloth: { Shirt: '#1a2233', Trousers: '#1a2233', Cap: '#1a2233' }, hide: ['Tie'], acc: { headset: { color: '#2a2c33' } } },
  tropique: { cloth: { Shirt: { pattern: 'fleurs', color: '#1aa39a', color2: '#ff5a7a' }, Trousers: '#e8dcc0', Leather: '#a8784a' }, hide: NO_UNIFORM, acc: { straw: {}, shades: {} } },
  militaire: {
    cloth: { Shirt: { pattern: 'camo', color: '#6f7448', color2: '#4d5233' }, Trousers: { pattern: 'camo', color: '#6f7448', color2: '#4d5233' }, Leather: '#2a2418' },
    hide: NO_UNIFORM, acc: { helmet: { color: '#4f5634', visor: '#2a2d20' } },
  },
  vip: { cloth: { Shirt: '#16171b', Trousers: '#16171b', Cap: '#16171b', Tie: '#d4af37' }, acc: { shades: {} } },
  course: { cloth: { Shirt: { pattern: 'bandes', color: '#1d4fd8', color2: '#ffffff' }, Trousers: '#1d4fd8' }, hide: NO_UNIFORM, acc: { helmet: { color: '#1d4fd8', stripe: '#ffffff', visor: '#d4a52a' } } },
  pompier: { cloth: { Shirt: { pattern: 'bandes', color: '#2c3a2a', color2: '#e8e24a' }, Trousers: '#2c3a2a', Leather: '#111111' }, hide: NO_UNIFORM, acc: { fire: {} } },
  cowboy: { cloth: { Shirt: { pattern: 'carreaux', color: '#b3131b', color2: '#1c1e22' }, Trousers: '#2f4f80', Leather: '#6b3f1e' }, hide: NO_UNIFORM, acc: { cowboy: {}, scarf: { color: '#c8261e' } } },
  pirate: { cloth: { Shirt: '#f1e6cf', Trousers: '#1c1e22', Leather: '#2a1a10' }, hide: NO_UNIFORM, acc: { pirate: {} } },
  noel: { cloth: { Shirt: '#c8261e', Trousers: '#c8261e', Leather: '#111111' }, hide: NO_UNIFORM, acc: { santa: {}, scarf: { color: '#ffffff' } } },
  astronaute: { cloth: { Shirt: '#f2f2ee', Trousers: '#f2f2ee', Leather: '#c0c6cc' }, hide: NO_UNIFORM, acc: { space: {} } },
};
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
  smoke2: '#c8261e', smokeMode: 'uni', // deuxième couleur, et façon de mélanger les couleurs
  regColor: null, // couleur de l'immatriculation (null = noir ou blanc selon la peinture)
  suit: 'commandant', // tenue du pilote
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
    smoke2: color(l.smoke2, d.smoke2), smokeMode: oneOf(SMOKE_MODES, l.smokeMode, d.smokeMode),
    regColor: color(l.regColor, null), suit: oneOf(SUITS, l.suit, d.suit),
    zones,
    stickers: (Array.isArray(l.stickers) ? l.stickers : []).slice(0, MAX_STICKERS).map(cleanSticker).filter(Boolean),
  };
}

// ----- Boutique du hangar -----
// Chaque élément s'achète une seule fois puis sert sur tous les avions. Clés : 'color:#rrggbb', 'custom-color',
// 'pattern:x', 'wings:x', 'finish:x', 'emblem:x', 'zone:x', 'sticker:x', 'teeth', 'reg', 'smoke', 'smokeMode:x',
// 'regColor', 'suit:x'.
// Les couleurs et motifs d'origine sont gratuits.
const P = {
  'custom-color': 2000, teeth: 1000, reg: 500, smoke: 1500,
  'pattern:uni': 200, 'pattern:pointe': 300, 'pattern:bande': 400, 'pattern:bicolore': 400, 'pattern:eclair': 700, 'pattern:damier': 800, 'pattern:flammes': 900,
  'pattern:vagues': 600, 'pattern:pois': 600, 'pattern:chevrons': 700, 'pattern:tricolore': 500, 'pattern:course': 800, 'pattern:degrade': 900,
  'pattern:tigre': 1200, 'pattern:camo': 1200, 'pattern:digital': 1400, 'pattern:arcenciel': 2000,
  'wings:uni': 150, 'wings:bouts': 300, 'wings:bandes': 500, 'wings:damier': 600, 'wings:chevron': 500, 'wings:bord': 300,
  'finish:mat': 400, 'finish:satin': 500, 'finish:metal': 800, 'finish:candy': 1500, 'finish:chrome': 2000, 'finish:nacre': 2500, 'finish:vieilli': 600,
  'emblem:etoile': 300, 'emblem:eclair': 300, 'emblem:coeur': 300, 'emblem:numero': 400, 'emblem:cocarde': 500, 'emblem:aile': 600, 'emblem:couronne': 700,
  'pattern:invasion': 900, 'pattern:soleil': 1300, 'pattern:cheatline': 600, 'pattern:retro': 900, 'pattern:warbird': 1500, 'pattern:zebre': 1100,
  'pattern:leopard': 1200, 'pattern:hexa': 1300, 'pattern:ecossais': 1000, 'pattern:eclabous': 1100, 'pattern:etoiles': 1400, 'pattern:pixel': 1200,
  'pattern:carbone': 1600, 'pattern:diagonale': 700,
  'wings:invasion': 600, 'wings:soleil': 700, 'wings:etoiles': 700, 'wings:degrade': 500, 'wings:fuite': 300, 'wings:flammes': 800,
  'finish:irise': 3000, 'finish:brosse': 1800, 'finish:miroir': 3500, 'finish:velours': 1200, 'finish:givre': 900, 'finish:perle': 1400,
  'emblem:aigle': 600, 'emblem:requin': 600, 'emblem:crane': 600, 'emblem:soleil': 400, 'emblem:planete': 600, 'emblem:helice': 400,
  'emblem:boussole': 500, 'emblem:globe': 600, 'emblem:bouclier': 500,
  'smokeMode:bicolore': 800, 'smokeMode:arcenciel': 1500, 'smokeMode:tricolore': 1200, 'regColor': 300,
  'suit:voltige': 500, 'suit:vintage': 700, 'suit:nuit': 500, 'suit:tropique': 500, 'suit:militaire': 600, 'suit:vip': 900,
};
for (const [k] of ZONES) P[`zone:${k}`] = 250;
for (const [k, , price] of STICKERS) P[`sticker:${k}`] = price;
const FREE_COLORS = ['#f4f1ea', '#1c1e22', '#f2c21b', '#ffffff'];
export function priceOf(key) {
  if (key.startsWith('color:')) return FREE_COLORS.includes(key.slice(6)) ? 0 : 150;
  return P[key] ?? 0;
}
export const PRICE_LABEL = (n) => `${n.toLocaleString('fr-FR')} ₣`;

// couleur du fumigène pour la particule n° i émise au temps t (s) : hexadécimal '#rrggbb'
const hsl = (h) => {
  const f = (n) => { const k = (n + h * 12) % 12, a = 0.8 * Math.min(0.55, 0.45); return Math.round(255 * (0.55 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
  return `#${[f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
};
export function smokeColorAt(l, t, i) {
  switch (l.smokeMode) {
    case 'bicolore': return Math.floor(t * 2.5) % 2 ? l.smoke2 : l.smoke;
    case 'arcenciel': return hsl((t * 0.25) % 1);
    case 'tricolore': return ['#1d3f9a', '#f4f4f0', '#d4232c'][Math.floor(t * 2.5) % 3];
    default: return l.smoke;
  }
}

// ----- Raretés et caisses -----
// Les nouveautés du hangar ne s'achètent pas : elles se gagnent dans les caisses. Tous les éléments ont une rareté
// (pour le tri et la couleur dans le hangar).
export const RARITIES = [
  ['commun', 'Commun', '#b9c2cc'], ['rare', 'Rare', '#3d8bff'], ['epique', 'Épique', '#a855ff'],
  ['legendaire', 'Légendaire', '#ffb020'], ['exotique', 'Exotique', '#ff3d7f'],
];
const CRATE_RARITY = {
  commun: ['sticker:nuage', 'sticker:pique', 'sticker:goutte', 'sticker:flocon', 'wings:fuite', 'wings:degrade', 'pattern:diagonale', 'emblem:helice', 'suit:nuit', 'suit:tropique'],
  rare: ['pattern:cheatline', 'pattern:retro', 'pattern:ecossais', 'pattern:pixel', 'sticker:avion', 'sticker:helice', 'sticker:galons', 'sticker:yinyang',
    'sticker:bouclier', 'wings:etoiles', 'wings:invasion', 'emblem:soleil', 'emblem:bouclier', 'finish:givre', 'regColor', 'suit:voltige', 'suit:militaire', 'suit:pompier'],
  epique: ['pattern:invasion', 'pattern:zebre', 'pattern:leopard', 'pattern:hexa', 'pattern:eclabous', 'sticker:boussole', 'sticker:globe', 'sticker:arcenciel',
    'wings:soleil', 'wings:flammes', 'emblem:boussole', 'emblem:globe', 'emblem:requin', 'finish:velours', 'finish:perle', 'smokeMode:bicolore', 'suit:vintage', 'suit:course', 'suit:cowboy'],
  legendaire: ['pattern:soleil', 'pattern:etoiles', 'pattern:carbone', 'emblem:aigle', 'emblem:crane', 'emblem:planete', 'finish:brosse', 'smokeMode:tricolore', 'suit:vip', 'suit:pirate', 'suit:noel'],
  exotique: ['pattern:warbird', 'finish:irise', 'finish:miroir', 'smokeMode:arcenciel', 'suit:astronaute'],
};
const RARITY_OF = {};
for (const [r, keys] of Object.entries(CRATE_RARITY)) for (const k of keys) RARITY_OF[k] = r;
export const CRATE_ITEMS = Object.keys(RARITY_OF);
export const isCrateOnly = (key) => key in RARITY_OF;
// rareté d'un élément : celle des caisses, sinon d'après son prix en boutique
export function rarityOf(key) {
  if (RARITY_OF[key]) return RARITY_OF[key];
  const p = priceOf(key);
  return p <= 300 ? 'commun' : p <= 800 ? 'rare' : p <= 1500 ? 'epique' : p <= 2500 ? 'legendaire' : 'exotique';
}
export const rarityRank = (key) => RARITIES.findIndex(([r]) => r === rarityOf(key));
// chances de chaque rareté (une caisse plus chère donne de meilleures chances)
export const CRATES = [
  { id: 'standard', name: 'Caisse standard', price: 1500, odds: { commun: 0.55, rare: 0.28, epique: 0.13, legendaire: 0.035, exotique: 0.005 } },
  { id: 'pilote', name: 'Caisse de pilote', price: 4000, odds: { commun: 0.22, rare: 0.38, epique: 0.27, legendaire: 0.11, exotique: 0.02 } },
  { id: 'as', name: 'Caisse de l\'As', price: 9000, odds: { commun: 0, rare: 0.3, epique: 0.4, legendaire: 0.24, exotique: 0.06 } },
];
// tirage : rareté selon les chances, puis un élément de cette rareté (de préférence pas encore possédé).
// rnd : fonction 0..1 ; owned : clés possédées. Renvoie { key, rarity, duplicate }
export function rollCrate(crate, owned, rnd = Math.random) {
  let x = rnd(), rarity = 'commun';
  for (const [r] of RARITIES) { const o = crate.odds[r] || 0; if (x < o) { rarity = r; break; } x -= o; rarity = r; }
  const pool = CRATE_RARITY[rarity];
  const fresh = pool.filter((k) => !owned.includes(k));
  const list = fresh.length ? fresh : pool;
  const key = list[Math.floor(rnd() * list.length) % list.length];
  return { key, rarity, duplicate: !fresh.length };
}
// un doublon rend une partie du prix de la caisse
export const DUPLICATE_REFUND = { commun: 0.2, rare: 0.3, epique: 0.45, legendaire: 0.7, exotique: 1 };
