// Paramètres du joueur (sauvegardés dans le navigateur)
export const SCHEMA = [
  { section: 'Graphismes' },
  { key: 'quality', label: 'Qualité', type: 'select', def: 'medium', options: [['low', 'Basse'], ['medium', 'Moyenne'], ['high', 'Haute']] },
  { key: 'viewDist', label: 'Distance de vue', type: 'range', def: 20, min: 8, max: 36, step: 2, unit: ' km' },
  { key: 'trees', label: 'Densité de végétation', type: 'range', def: 1, min: 0, max: 2, step: 0.25, unit: '×' },
  { key: 'decoDist', label: 'Distance des arbres', type: 'range', def: 2, min: 1, max: 4, step: 1, unit: ' km × 2' },
  { key: 'fov', label: 'Champ de vision', type: 'range', def: 65, min: 45, max: 95, step: 5, unit: '°' },
  { key: 'clouds', label: 'Nuages', type: 'check', def: true },
  { key: 'shadows', label: 'Ombres', type: 'check', def: true },
  { key: 'timeOfDay', label: 'Heure de la journée', type: 'range', def: 10.5, min: 6, max: 20, step: 0.5, unit: ' h' },
  { section: 'Simulation' },
  { key: 'difficulty', label: 'Difficulté', type: 'select', def: 'normal', options: [['easy', 'Facile (moteur auto, crash rare)'], ['normal', 'Normale'], ['realistic', 'Réaliste (pas d\'aide)']] },
  { key: 'fuel', label: 'Consommation de carburant', type: 'check', def: true },
  { key: 'timeScale', label: 'Accélération du temps', type: 'select', def: '1', options: [['1', '×1'], ['2', '×2'], ['4', '×4']] },
  { section: 'Commandes' },
  { key: 'sensitivity', label: 'Sensibilité du manche', type: 'range', def: 1, min: 0.4, max: 1.6, step: 0.1, unit: '×' },
  { key: 'invertPitch', label: 'Inverser la profondeur (↑ = monter)', type: 'check', def: false },
  { section: 'Interface' },
  { key: 'units', label: 'Unités', type: 'select', def: 'metric', options: [['metric', 'km/h · m'], ['aviation', 'nœuds · pieds']] },
  { key: 'showNames', label: 'Noms des joueurs', type: 'check', def: true },
  { key: 'minimap', label: 'Mini-carte', type: 'check', def: true },
  { key: 'volume', label: 'Volume', type: 'range', def: 0.5, min: 0, max: 1, step: 0.05, unit: '' },
];

const KEY = 'jpairlines-settings';
export const settings = Object.fromEntries(SCHEMA.filter((s) => s.key).map((s) => [s.key, s.def]));
try { Object.assign(settings, JSON.parse(localStorage.getItem(KEY)) || {}); } catch { /* pas de sauvegarde */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* stockage indisponible */ } };

// Construit le formulaire ; onChange(key) est appelé à chaque modification
export function buildSettingsForm(container, onChange) {
  container.innerHTML = '';
  for (const s of SCHEMA) {
    if (s.section) {
      const h = document.createElement('h3');
      h.textContent = s.section;
      container.appendChild(h);
      continue;
    }
    const row = document.createElement('label');
    row.className = 'setting';
    const name = document.createElement('span');
    name.textContent = s.label;
    row.appendChild(name);
    let input;
    if (s.type === 'select') {
      input = document.createElement('select');
      for (const [v, t] of s.options) input.add(new Option(t, v));
      input.value = settings[s.key];
      input.onchange = () => { settings[s.key] = input.value; save(); onChange(s.key); };
    } else if (s.type === 'check') {
      input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = settings[s.key];
      input.onchange = () => { settings[s.key] = input.checked; save(); onChange(s.key); };
    } else {
      const wrap = document.createElement('span');
      wrap.className = 'range';
      input = document.createElement('input');
      input.type = 'range';
      Object.assign(input, { min: s.min, max: s.max, step: s.step, value: settings[s.key] });
      const val = document.createElement('output');
      val.textContent = settings[s.key] + s.unit;
      input.oninput = () => { settings[s.key] = Number(input.value); val.textContent = input.value + s.unit; save(); onChange(s.key); };
      wrap.append(input, val);
      row.appendChild(wrap);
      continue;
    }
    row.appendChild(input);
    container.appendChild(row);
  }
}
