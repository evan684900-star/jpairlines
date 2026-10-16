// Personnalisation des avions (hangar) : options possibles, valeurs par défaut et vérification.
// Sans three.js : aussi chargé par le serveur pour vérifier ce qu'envoient les joueurs.

export const PATTERNS = [
  ['origine', 'D\'origine'], ['uni', 'Uni'], ['bande', 'Grande bande'], ['bicolore', 'Bicolore'],
  ['eclair', 'Éclair'], ['flammes', 'Flammes'], ['damier', 'Damier'], ['pointe', 'Nez et queue'],
];
export const FINISHES = [
  ['brillant', 'Brillant'], ['mat', 'Mat'], ['metal', 'Métallisé'], ['chrome', 'Chromé'], ['nacre', 'Nacré'],
];
export const WINGS = [['origine', 'D\'origine'], ['uni', 'Unies'], ['bouts', 'Bouts colorés'], ['damier', 'Bouts en damier'], ['bandes', 'Bandes noires et blanches']];
export const EMBLEMS = [
  ['aucun', 'Aucun'], ['etoile', 'Étoile'], ['eclair', 'Éclair'], ['coeur', 'Cœur'], ['cocarde', 'Cocarde'],
  ['numero', 'Numéro de course'], ['couronne', 'Couronne'], ['aile', 'Ailes JP'],
];
// couleurs proposées (le joueur peut aussi choisir n'importe quelle couleur)
export const SWATCHES = [
  '#f4f1ea', '#1c1e22', '#c8261e', '#ff7a1a', '#f2c21b', '#3fae4a', '#1d6f5f', '#2a8fd8',
  '#1d3f7a', '#6b3fa0', '#e8609c', '#8a6238', '#9aa3ad', '#d4af37', '#7fe3ff', '#b4ff3a',
];

export const DEFAULT_LIVERY = {
  body: null, accent: null, stripe: null, // null = couleurs d'origine de l'avion
  pattern: 'origine', finish: 'brillant', wings: 'origine',
  tips: '#f2c21b', // bouts d'hélice
  reg: '', // immatriculation (vide = celle de l'avion)
  emblem: 'aucun', emblemColor: '#f2c21b', number: 7,
  sharkTeeth: false,
  smoke: '#ffffff', // fumigène (touche N)
};

const COLOR = /^#[0-9a-f]{6}$/i;
const oneOf = (list, v, d) => (list.some(([k]) => k === v) ? v : d);
const color = (v, d) => (typeof v === 'string' && COLOR.test(v) ? v.toLowerCase() : d);

// livrée complète et sûre à partir de n'importe quel objet (sauvegarde, réseau)
export function cleanLivery(l) {
  const d = DEFAULT_LIVERY;
  if (!l || typeof l !== 'object') return { ...d };
  return {
    body: color(l.body, null), accent: color(l.accent, null), stripe: color(l.stripe, null),
    pattern: oneOf(PATTERNS, l.pattern, d.pattern), finish: oneOf(FINISHES, l.finish, d.finish), wings: oneOf(WINGS, l.wings, d.wings),
    tips: color(l.tips, d.tips),
    reg: typeof l.reg === 'string' ? l.reg.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 7) : '',
    emblem: oneOf(EMBLEMS, l.emblem, d.emblem), emblemColor: color(l.emblemColor, d.emblemColor),
    number: Number.isInteger(l.number) && l.number >= 0 && l.number <= 99 ? l.number : d.number,
    sharkTeeth: l.sharkTeeth === true,
    smoke: color(l.smoke, d.smoke),
  };
}
