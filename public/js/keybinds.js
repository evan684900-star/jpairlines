// Touches modifiables : chaque action a une ou plusieurs touches (enregistrées dans le navigateur).
// Les touches sont stockées comme e.key en minuscules ('z', 'arrowup', ' ', 'shift'…).
// Échap reste toujours la touche de pause (pour ne jamais rester bloqué).
import { t } from './i18n.js';

const KEY = 'jpairlines-keys';

export const ACTIONS = [
  { group: 'Pilotage' },
  { id: 'throttleUp', label: 'Plus de gaz', def: ['z', 'w', 'shift'] },
  { id: 'throttleDown', label: 'Moins de gaz', def: ['s', 'control'] },
  { id: 'pitchUp', label: 'Cabrer (monter)', def: ['arrowdown'] },
  { id: 'pitchDown', label: 'Piquer (descendre)', def: ['arrowup'] },
  { id: 'rollLeft', label: 'Incliner à gauche', def: ['arrowleft'] },
  { id: 'rollRight', label: 'Incliner à droite', def: ['arrowright'] },
  { id: 'yawLeft', label: 'Palonnier gauche (direction au sol)', def: ['q', 'a'] },
  { id: 'yawRight', label: 'Palonnier droit (direction au sol)', def: ['d'] },
  { id: 'trimUp', label: 'Trim nez haut', def: ['t'] },
  { id: 'trimDown', label: 'Trim nez bas', def: ['b'] },
  { id: 'brake', label: 'Freins (maintenir)', def: [' '] },
  { group: 'Systèmes' },
  { id: 'engine', label: 'Démarrer / couper le moteur', def: ['e'] },
  { id: 'flapsDown', label: 'Sortir les volets', def: ['f'] },
  { id: 'flapsUp', label: 'Rentrer les volets', def: ['v'] },
  { id: 'gear', label: 'Train d\'atterrissage', def: ['g'] },
  { id: 'parking', label: 'Frein de parking', def: ['p'] },
  { id: 'lights', label: 'Feux de navigation', def: ['l'] },
  { id: 'wipers', label: 'Essuie-glaces', def: ['i'] },
  { id: 'smoke', label: 'Fumigène de voltige', def: ['n'] },
  { id: 'refuel', label: 'Faire le plein (maintenir)', def: ['k'] },
  { group: 'Jeu' },
  { id: 'board', label: 'Tableau des missions', def: ['enter'] },
  { id: 'chat', label: 'Écrire dans le chat', def: ['y'] },
  { id: 'drop', label: 'Larguer un colis', def: ['x'] },
  { id: 'journal', label: 'Journal de quêtes', def: ['j'] },
  { id: 'map', label: 'Grande carte', def: ['m'] },
  { id: 'camera', label: 'Changer de caméra', def: ['c'] },
  { id: 'respawn', label: 'Réapparaître au dernier aéroport', def: ['r'] },
  { id: 'help', label: 'Aide (commandes)', def: ['h'] },
  { id: 'hud', label: 'Afficher / cacher tout l\'affichage (HUD)', def: ['f2'] },
];
const LIST = ACTIONS.filter((a) => a.id);

// Disposition du clavier : AZERTY (français) ou QWERTY (le reste du monde). Par défaut on la devine d'après la
// langue du navigateur, puis on la vérifie avec l'API Keyboard quand elle existe (Chrome, Edge).
// Seules les touches « lettres » du pilotage changent : gaz sur Z (AZERTY) ou W (QWERTY), palonnier gauche sur Q ou A.
const LAYOUT_KEY = 'jpairlines-layout';
const PRESETS = {
  azerty: { throttleUp: ['z', 'shift'], yawLeft: ['q'] },
  qwerty: { throttleUp: ['w', 'shift'], yawLeft: ['a'] },
};
function guessLayout() {
  try {
    const saved = localStorage.getItem(LAYOUT_KEY);
    if (saved === 'azerty' || saved === 'qwerty') return saved;
  } catch { /* stockage indisponible */ }
  const lang = (typeof navigator !== 'undefined' && navigator.language) || 'fr';
  return /^fr\b/i.test(lang) ? 'azerty' : 'qwerty';
}
export let layout = guessLayout();
const defaultsFor = (a) => PRESETS[layout][a.id] || a.def;

let binds = {};
function load() {
  binds = Object.fromEntries(LIST.map((a) => [a.id, [...defaultsFor(a)]]));
  try {
    const saved = JSON.parse(localStorage.getItem(KEY)) || {};
    for (const a of LIST) if (Array.isArray(saved[a.id])) binds[a.id] = saved[a.id].filter((k) => typeof k === 'string' && k !== 'escape').slice(0, 4);
  } catch { /* pas de sauvegarde */ }
}
load();
const store = () => { try { localStorage.setItem(KEY, JSON.stringify(binds)); } catch { /* stockage indisponible */ } };

// change de disposition (touches par défaut) ; les touches que le joueur a modifiées lui-même sont gardées
export function setLayout(l) {
  if (!PRESETS[l]) return;
  layout = l;
  try { localStorage.setItem(LAYOUT_KEY, l); } catch { /* stockage indisponible */ }
  load();
}
// vérifie la vraie disposition du clavier (asynchrone) ; renvoie la disposition détectée ou null
export async function detectLayout() {
  try {
    if (localStorage.getItem(LAYOUT_KEY)) return null; // déjà choisie
    const map = await navigator.keyboard?.getLayoutMap?.();
    if (!map) return null;
    const q = map.get('KeyQ'), w = map.get('KeyW');
    const found = q === 'a' && w === 'z' ? 'azerty' : q === 'q' && w === 'w' ? 'qwerty' : null;
    if (found && found !== layout) { setLayout(found); return found; }
    if (found) localStorage.setItem(LAYOUT_KEY, found);
  } catch { /* API absente ou refusée */ }
  return null;
}

export const keysFor = (id) => binds[id] || [];
export const isKey = (id, k) => keysFor(id).includes(k);
export const actionLabel = (id) => t(LIST.find((a) => a.id === id)?.label || id);

// associe une touche à une action ; elle est retirée des autres actions (renvoie leurs noms)
export function bindKey(id, k) {
  if (k === 'escape') return [];
  const taken = [];
  for (const a of LIST) {
    if (a.id !== id && binds[a.id].includes(k)) { binds[a.id] = binds[a.id].filter((x) => x !== k); taken.push(t(a.label)); }
  }
  if (!binds[id].includes(k)) binds[id] = [...binds[id], k].slice(-4);
  store();
  return taken;
}
export function unbindKey(id, k) { binds[id] = binds[id].filter((x) => x !== k); store(); }
export function resetKeys() { try { localStorage.removeItem(KEY); } catch { /* stockage indisponible */ } load(); }

// nom lisible d'une touche
const NAMES = {
  ' ': 'Espace', enter: 'Entrée', shift: 'Maj', control: 'Ctrl', alt: 'Alt', tab: 'Tab', backspace: 'Retour', meta: 'Cmd',
  arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→', pageup: 'Page ↑', pagedown: 'Page ↓', home: 'Début', end: 'Fin', insert: 'Inser', delete: 'Suppr',
};
export const keyName = (k) => (NAMES[k] && t(NAMES[k])) || (k.length === 1 ? k.toUpperCase() : k.charAt(0).toUpperCase() + k.slice(1));
// première touche d'une action, en <kbd> (pour les messages à l'écran) : bouton de manette si le joueur s'en sert
export const kbd = (id) => {
  if (pad.active && padFor(id).length) return `<kbd class="pad">${padName(padFor(id)[0])}</kbd>`;
  return `<kbd>${keysFor(id).length ? keyName(keysFor(id)[0]) : '—'}</kbd>`;
};

// ----- Manette (Xbox, PlayStation et toute manette « standard ») -----
// Boutons notés 'p0'…'p16' (numéros de la disposition standard des navigateurs). Maintenir Vue / Share (p8) donne
// une deuxième série d'actions : 'p8+0' = Vue + A. Les sticks et gâchettes ne se changent pas (voir gamepad.js).
const PAD_KEY = 'jpairlines-pad';
export const PAD_DEFAULTS = {
  brake: ['p0'], gear: ['p1'], engine: ['p2'], camera: ['p3'], yawLeft: ['p4'], yawRight: ['p5'],
  flapsUp: ['p12'], flapsDown: ['p13'], trimDown: ['p14'], trimUp: ['p15'], parking: ['p10'], smoke: ['p11'],
  map: ['p8'], board: ['p8+0'], respawn: ['p8+1'], refuel: ['p8+2'], journal: ['p8+3'], lights: ['p8+4'], drop: ['p8+5'],
  hud: ['p8+12'], help: ['p8+13'], wipers: ['p8+14'],
};
// état partagé : manette branchée, dernière entrée venant de la manette, style des noms de boutons
export const pad = { connected: false, active: false, style: 'xbox' };
let padBinds = {};
function loadPad() {
  padBinds = Object.fromEntries(LIST.map((a) => [a.id, [...(PAD_DEFAULTS[a.id] || [])]]));
  try {
    const saved = JSON.parse(localStorage.getItem(PAD_KEY)) || {};
    for (const a of LIST) if (Array.isArray(saved[a.id])) padBinds[a.id] = saved[a.id].filter((k) => typeof k === 'string' && /^p\d+(\+\d+)?$/.test(k)).slice(0, 3);
  } catch { /* pas de sauvegarde */ }
}
loadPad();
const storePad = () => { try { localStorage.setItem(PAD_KEY, JSON.stringify(padBinds)); } catch { /* stockage indisponible */ } };
export const padFor = (id) => padBinds[id] || [];
export const isPad = (id, k) => padFor(id).includes(k);
export function bindPad(id, k) {
  const taken = [];
  for (const a of LIST) {
    if (a.id !== id && padBinds[a.id].includes(k)) { padBinds[a.id] = padBinds[a.id].filter((x) => x !== k); taken.push(t(a.label)); }
  }
  if (!padBinds[id].includes(k)) padBinds[id] = [...padBinds[id], k].slice(-3);
  storePad();
  return taken;
}
export function unbindPad(id, k) { padBinds[id] = padBinds[id].filter((x) => x !== k); storePad(); }
export function resetPad() { try { localStorage.removeItem(PAD_KEY); } catch { /* stockage indisponible */ } loadPad(); }
const PAD_NAMES = {
  xbox: ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Vue', 'Menu', 'L🕹', 'R🕹', '✚↑', '✚↓', '✚←', '✚→', 'Xbox'],
  ps: ['✕', '○', '□', '△', 'L1', 'R1', 'L2', 'R2', 'Create', 'Options', 'L3', 'R3', '✚↑', '✚↓', '✚←', '✚→', 'PS'],
};
// nom d'un bouton selon la manette branchée (« Vue + A », « Create + ✕ »)
export function padName(k) {
  const names = PAD_NAMES[pad.style] || PAD_NAMES.xbox;
  const one = (n) => { const i = Number(n); return t(names[i] ?? `B${i}`); };
  const m = /^p(\d+)(?:\+(\d+))?$/.exec(k);
  if (!m) return k;
  return m[2] !== undefined ? `${one(m[1])} + ${one(m[2])}` : one(m[1]);
}
