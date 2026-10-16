// Touches modifiables : chaque action a une ou plusieurs touches (enregistrées dans le navigateur).
// Les touches sont stockées comme e.key en minuscules ('z', 'arrowup', ' ', 'shift'…).
// Échap reste toujours la touche de pause (pour ne jamais rester bloqué).
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
  { id: 'refuel', label: 'Faire le plein (maintenir)', def: ['k'] },
  { group: 'Jeu' },
  { id: 'board', label: 'Tableau des missions', def: ['enter'] },
  { id: 'drop', label: 'Larguer un colis', def: ['x'] },
  { id: 'journal', label: 'Journal de quêtes', def: ['j'] },
  { id: 'map', label: 'Grande carte', def: ['m'] },
  { id: 'camera', label: 'Changer de caméra', def: ['c'] },
  { id: 'respawn', label: 'Réapparaître au dernier aéroport', def: ['r'] },
  { id: 'help', label: 'Aide (commandes)', def: ['h'] },
];
const LIST = ACTIONS.filter((a) => a.id);

let binds = {};
function load() {
  binds = Object.fromEntries(LIST.map((a) => [a.id, [...a.def]]));
  try {
    const saved = JSON.parse(localStorage.getItem(KEY)) || {};
    for (const a of LIST) if (Array.isArray(saved[a.id])) binds[a.id] = saved[a.id].filter((k) => typeof k === 'string' && k !== 'escape').slice(0, 4);
  } catch { /* pas de sauvegarde */ }
}
load();
const store = () => { try { localStorage.setItem(KEY, JSON.stringify(binds)); } catch { /* stockage indisponible */ } };

export const keysFor = (id) => binds[id] || [];
export const isKey = (id, k) => keysFor(id).includes(k);
export const actionLabel = (id) => LIST.find((a) => a.id === id)?.label || id;

// associe une touche à une action ; elle est retirée des autres actions (renvoie leurs noms)
export function bindKey(id, k) {
  if (k === 'escape') return [];
  const taken = [];
  for (const a of LIST) {
    if (a.id !== id && binds[a.id].includes(k)) { binds[a.id] = binds[a.id].filter((x) => x !== k); taken.push(a.label); }
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
export const keyName = (k) => NAMES[k] || (k.length === 1 ? k.toUpperCase() : k.charAt(0).toUpperCase() + k.slice(1));
// première touche d'une action, en <kbd> (pour les messages à l'écran)
export const kbd = (id) => `<kbd>${keysFor(id).length ? keyName(keysFor(id)[0]) : '—'}</kbd>`;
