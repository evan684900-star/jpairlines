// Langues du jeu : français (langue du code) et anglais.
// Le texte français sert de clé : t('Quête abandonnée') renvoie la traduction anglaise si elle existe,
// sinon le français (jamais de texte vide). Variables : t('Bonjour {nom} !', { nom }).
// Le HTML statique (index.html) est traduit par translateDom(), qui remplace les textes connus.
import uiHtml from './lang/en-html.js';
import uiMain from './lang/en-main.js';
import uiMisc from './lang/en-misc.js';
import quests from './lang/en-quests.js';
import quests2 from './lang/en-quests2.js';

const KEY = 'jpairlines-lang';
const EN = { ...quests, ...quests2, ...uiMisc, ...uiMain, ...uiHtml };

function detect() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'fr' || saved === 'en') return saved;
  } catch { /* stockage indisponible */ }
  return /^fr\b/i.test(navigator.language || 'fr') ? 'fr' : 'en';
}
export const LANG = typeof navigator === 'undefined' ? 'fr' : detect();
export const isEN = LANG === 'en';

const norm = (s) => s.replace(/\s+/g, ' ').trim();
export function t(fr, vars) {
  let s = fr;
  if (isEN && typeof fr === 'string') s = EN[fr] ?? EN[norm(fr)] ?? fr;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
  return s;
}

export function setLang(l) {
  try { localStorage.setItem(KEY, l); } catch { /* stockage indisponible */ }
  location.reload();
}

// traduit les textes et attributs (title, placeholder, aria-label) d'un morceau de page
export function translateDom(root = document.body) {
  if (!isEN) return;
  // contenu des <template> (aide, etc.) : copié dans la page plus tard, on le traduit à la source
  for (const tpl of root.querySelectorAll('template')) translateDom(tpl.content);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const n of nodes) {
    const raw = n.nodeValue, key = norm(raw);
    if (!key || n.parentElement?.closest('script,style,svg')) continue;
    const tr = EN[key];
    if (tr) n.nodeValue = raw.replace(raw.trim(), tr);
  }
  for (const el of root.querySelectorAll('[title],[placeholder],[aria-label]')) {
    for (const a of ['title', 'placeholder', 'aria-label']) {
      const v = el.getAttribute(a);
      if (v && EN[norm(v)]) el.setAttribute(a, EN[norm(v)]);
    }
  }
}
