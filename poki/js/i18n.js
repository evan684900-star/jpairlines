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
