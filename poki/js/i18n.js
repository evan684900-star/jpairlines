// Langues de la version Poki : français et anglais.
// Langue : choix du joueur (enregistré), sinon celle du navigateur (français si fr-*, anglais sinon).
const KEY = 'jpairlines-poki-lang';
let saved = null;
try { saved = localStorage.getItem(KEY); } catch { /* stockage indisponible */ }
const nav = (typeof navigator !== 'undefined' && navigator.language) || 'en';
export let lang = saved === 'fr' || saved === 'en' ? saved : nav.toLowerCase().startsWith('fr') ? 'fr' : 'en';

export function setLang(l) {
  lang = l;
  try { localStorage.setItem(KEY, l); } catch { /* stockage indisponible */ }
}

const DICT = { fr: {}, en: {} };
// ajoute des textes : add({ cle: ['français', 'english'], … })
export function add(entries) {
  for (const [k, [fr, en]] of Object.entries(entries)) { DICT.fr[k] = fr; DICT.en[k] = en ?? fr; }
}
// texte traduit ; {nom} remplacé par vars.nom
export function t(key, vars) {
  let s = DICT[lang][key] ?? DICT.fr[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
  return s;
}
// choisit entre deux textes écrits directement dans le code
export const tr = (fr, en) => (lang === 'en' ? en : fr);

// Messages de l'avion (journal, crash) : traduits à l'affichage, la physique reste inchangée
const MSG = {
  'Moteur coupé': 'Engine off', 'Réservoir vide !': 'Fuel tank empty!', 'Démarrage du moteur…': 'Starting engine…',
  'Pas de volets sur cet avion': 'No flaps on this plane', 'Train fixe sur cet avion': 'Fixed landing gear on this plane',
  'Impossible de rentrer le train au sol !': 'Can\'t raise the gear on the ground!', 'Le train est endommagé…': 'The landing gear is damaged…',
  'Sortie du train': 'Gear down', 'Rentrée du train': 'Gear up', 'Frein de parking serré': 'Parking brake on', 'Frein de parking desserré': 'Parking brake off',
  'Feux allumés': 'Lights on', 'Feux éteints': 'Lights off', 'Moteur en marche': 'Engine running',
  'Panne sèche ! Le moteur s\'est arrêté.': 'Out of fuel! The engine stopped.',
  'Survitesse ! Les volets ont été rentrés de force.': 'Overspeed! The flaps were forced up.',
  'CRAC ! Le train a été arraché par la vitesse !': 'CRACK! The landing gear was torn off by the speed!',
  'Amerrissage forcé ! Cet avion n\'a pas de flotteurs.': 'Ditched in the water! This plane has no floats.',
  'Tu as roulé dans l\'eau !': 'You taxied into the water!',
  'Train sorti sur l\'eau : l\'hydravion a capoté !': 'Gear down on water: the seaplane flipped over!',
  'L\'hydravion a piqué dans l\'eau !': 'The seaplane nosed into the water!',
  'Atterrissage sur les flotteurs : il fallait sortir les roues !': 'Landed on the floats: you needed the wheels down!',
  'Le train s\'est effondré': 'The landing gear collapsed',
  'Atterrissage sur le ventre : le train n\'était pas sorti !': 'Belly landing: the gear wasn\'t down!',
  'La queue a touché le sol ! Cabre moins.': 'Tail strike! Pitch up less.',
  'Vitesse excessive : la structure a cédé !': 'Too fast: the airframe broke apart!',
  'L\'hélice a touché le sol': 'The propeller hit the ground', 'Une aile a touché le sol': 'A wing hit the ground', 'L\'avion s\'est retourné': 'The plane flipped over',
};
const MSG_RE = [
  [/^Volets (\d+)°$/, 'Flaps $1°'],
  [/^Amerrissage trop brutal \((.+)\)$/, 'Water landing too hard ($1)'],
  [/^Atterrissage trop brutal \((.+)\)$/, 'Landing too hard ($1)'],
  [/^Structure rompue : (.+) !$/, 'Airframe failure: $1!'],
];
export function trMsg(s) {
  if (lang !== 'en') return s;
  if (MSG[s]) return MSG[s];
  for (const [re, rep] of MSG_RE) if (re.test(s)) return s.replace(re, rep);
  return s;
}
