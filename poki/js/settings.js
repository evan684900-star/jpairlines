import { QUALITY_PRESETS, EFFECT_KEYS } from './render/config.js';
import { SOUND_GROUPS } from './ui/audio.js';
import { lang } from './i18n.js';

// Paramètres du joueur (sauvegardés dans le navigateur)
export const SCHEMA = [
  { section: 'Langue / Language' },
  { key: 'lang', label: 'Langue / Language', type: 'select', def: lang, options: [['fr', 'Français'], ['en', 'English']] },
  { section: 'Graphismes' },
  { key: 'quality', label: 'Qualité', type: 'select', def: 'medium', options: [['low', 'Bas'], ['medium', 'Moyen'], ['high', 'Élevé']] },
  { key: 'adaptiveRes', label: 'Résolution adaptative (baisse un peu la netteté si le jeu rame)', type: 'check', def: false },
  { key: 'viewDist', label: 'Distance de vue', type: 'range', def: 14, min: 8, max: 26, step: 2, unit: ' km' },
  { key: 'trees', label: 'Densité de végétation', type: 'range', def: 1, min: 0, max: 2, step: 0.25, unit: '×' },
  { key: 'decoDist', label: 'Distance des arbres', type: 'range', def: 2, min: 1, max: 4, step: 1, unit: ' km × 2' },
  { key: 'fov', label: 'Champ de vision', type: 'range', def: 65, min: 45, max: 95, step: 5, unit: '°' },
  { key: 'clouds', label: 'Nuages', type: 'check', def: true },
  { section: 'Effets visuels' },
  { key: 'fx_shadows', label: 'Ombres', type: 'check', preset: true },
  { key: 'fx_post', label: 'Post-traitement', type: 'check', preset: true },
  { key: 'fx_bloom', label: '· Halo lumineux (bloom)', type: 'check', preset: true },
  { key: 'fx_ao', label: '· Occlusion ambiante (SSAO)', type: 'check', preset: true },
  { key: 'fx_godrays', label: '· Rayons du soleil et reflets d\'objectif', type: 'check', preset: true },
  { key: 'fx_chroma', label: '· Aberration chromatique', type: 'check', preset: true },
  { key: 'fx_motionFx', label: 'Tremblements et distorsion de vitesse', type: 'check', preset: true },
  { key: 'fx_particles', label: 'Particules (poussière, fumée, traînées)', type: 'check', preset: true },
  { section: 'Ciel et météo' },
  { key: 'timeMode', label: 'Heure', type: 'select', def: 'fixed', options: [['fixed', 'Fixe (réglée ci-dessous)'], ['cycle', 'Cycle jour/nuit (24 min)'], ['local', 'Heure de mon ordinateur']] },
  { key: 'timeOfDay', label: 'Heure de la journée', type: 'range', def: 10.5, min: 0, max: 24, step: 0.25, unit: ' h' },
  { key: 'weather', label: 'Météo', type: 'select', def: 'clear', options: [['auto', 'Changeante'], ['clear', 'Grand beau'], ['cloudy', 'Nuageux'], ['overcast', 'Couvert'], ['rain', 'Pluie'], ['storm', 'Orage'], ['fog', 'Brouillard']] },
  { section: 'Simulation' },
  { key: 'difficulty', label: 'Difficulté', type: 'select', def: 'easy', options: [['easy', 'Facile (moteur auto, crash rare)'], ['normal', 'Normale'], ['realistic', 'Réaliste (pas d\'aide)']] },
  { key: 'fuelMode', label: 'Consommation de carburant', type: 'select', def: 'fast', options: [['fast', 'Accélérée ×4 (recommandé)'], ['real', 'Réaliste (×1)'], ['off', 'Désactivée']] },
  { key: 'timeScale', label: 'Accélération du temps', type: 'select', def: '1', options: [['1', '×1'], ['2', '×2'], ['4', '×4']] },
  { section: 'Commandes' },
  { key: 'sensitivity', label: 'Sensibilité du manche', type: 'range', def: 1, min: 0.4, max: 1.6, step: 0.1, unit: '×' },
  { key: 'invertPitch', label: 'Inverser la profondeur (↑ = monter)', type: 'check', def: false },
  { section: 'Interface' },
  { key: 'units', label: 'Unités', type: 'select', def: 'metric', options: [['metric', 'km/h · m'], ['aviation', 'nœuds · pieds']] },
  { key: 'minimap', label: 'Mini-carte', type: 'check', def: true },
  { key: 'showFps', label: 'Compteur d\'images par seconde', type: 'check', def: false },
  { section: 'Sons' },
  { key: 'muted', label: 'Couper le son', type: 'check', def: false },
  { key: 'volume', label: 'Volume général', type: 'range', def: 0.5, min: 0, max: 1, step: 0.05, unit: '' },
  ...SOUND_GROUPS.map((g) => ({ key: `snd_${g.key}`, label: `· ${g.label}`, type: 'range', def: 100, min: 0, max: 150, step: 5, unit: ' %' })),
];

// version anglaise des libellés
const EN = {
  _sections: { Graphismes: 'Graphics', 'Effets visuels': 'Visual effects', 'Ciel et météo': 'Sky and weather', Simulation: 'Simulation', Commandes: 'Controls', Interface: 'Interface', Sons: 'Sound' },
  quality: ['Quality', { low: 'Low', medium: 'Medium', high: 'High' }],
  adaptiveRes: ['Adaptive resolution (slightly less sharp if the game is slow)'],
  viewDist: ['View distance'], trees: ['Vegetation density'], decoDist: ['Tree distance'], fov: ['Field of view'], clouds: ['Clouds'],
  fx_shadows: ['Shadows'], fx_post: ['Post-processing'], fx_bloom: ['· Glow (bloom)'], fx_ao: ['· Ambient occlusion (SSAO)'],
  fx_godrays: ['· Sun rays and lens flares'], fx_chroma: ['· Chromatic aberration'], fx_motionFx: ['Shake and speed distortion'],
  fx_particles: ['Particles (dust, smoke, trails)'],
  timeMode: ['Time', { fixed: 'Fixed (set below)', cycle: 'Day/night cycle (24 min)', local: 'My computer\'s time' }],
  timeOfDay: ['Time of day'],
  weather: ['Weather', { auto: 'Changing', clear: 'Clear', cloudy: 'Cloudy', overcast: 'Overcast', rain: 'Rain', storm: 'Storm', fog: 'Fog' }],
  difficulty: ['Difficulty', { easy: 'Easy (auto engine, rare crashes)', normal: 'Normal', realistic: 'Realistic (no assists)' }],
  fuelMode: ['Fuel consumption', { fast: 'Accelerated ×4 (recommended)', real: 'Realistic (×1)', off: 'Off' }],
  timeScale: ['Time acceleration'],
  sensitivity: ['Stick sensitivity'], invertPitch: ['Invert pitch (↑ = climb)'],
  units: ['Units', { aviation: 'knots · feet' }], minimap: ['Minimap'], showFps: ['Frame counter (FPS)'],
  muted: ['Mute'], volume: ['Master volume'],
};
if (lang === 'en') {
  for (const item of SCHEMA) {
    if (item.section) { item.section = EN._sections[item.section] || item.section; continue; }
    const e = EN[item.key];
    if (!e) continue;
    item.label = e[0];
    if (e[1] && item.options) item.options = item.options.map(([v, l]) => [v, e[1][v] || l]);
  }
}

const KEY = 'jpairlines-poki-settings';
export const settings = Object.fromEntries(SCHEMA.filter((s) => s.key && !s.preset).map((s) => [s.key, s.def]));
try { Object.assign(settings, JSON.parse(localStorage.getItem(KEY)) || {}); } catch { /* pas de sauvegarde */ }
// premier lancement sur téléphone ou tablette : qualité basse pour rester fluide
try {
  if (!localStorage.getItem(KEY) && typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) { settings.quality = 'low'; settings.viewDist = 10; }
} catch { /* stockage indisponible */ }
if (!QUALITY_PRESETS[settings.quality]) settings.quality = 'high';
// v2 : la résolution adaptative (qui rendait l'image floue) n'est plus activée par défaut
if ((settings.v || 1) < 2) { settings.adaptiveRes = false; settings.v = 2; }
// cases « effets » : valeurs du préréglage de qualité tant que le joueur ne les a pas changées
export function applyPreset() {
  for (const k of EFFECT_KEYS) settings[`fx_${k}`] = QUALITY_PRESETS[settings.quality].effects[k];
}
if (EFFECT_KEYS.some((k) => typeof settings[`fx_${k}`] !== 'boolean')) applyPreset();
if (settings.fuel === false) settings.fuelMode = 'off'; // ancien réglage
delete settings.fuel;
export const FUEL_SCALE = { fast: 4, real: 1, off: 0 };
export const saveSettings = () => { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* stockage indisponible */ } };

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
      input.onchange = () => {
        settings[s.key] = input.value;
        if (s.key === 'quality') { applyPreset(); buildSettingsForm(container, onChange); }
        saveSettings();
        onChange(s.key);
      };
    } else if (s.type === 'check') {
      input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = settings[s.key];
      input.onchange = () => { settings[s.key] = input.checked; saveSettings(); onChange(s.key); };
    } else {
      const wrap = document.createElement('span');
      wrap.className = 'range';
      input = document.createElement('input');
      input.type = 'range';
      Object.assign(input, { min: s.min, max: s.max, step: s.step, value: settings[s.key] });
      const val = document.createElement('output');
      val.textContent = settings[s.key] + s.unit;
      input.oninput = () => { settings[s.key] = Number(input.value); val.textContent = input.value + s.unit; saveSettings(); onChange(s.key); };
      wrap.append(input, val);
      row.appendChild(wrap);
      container.appendChild(row);
      continue;
    }
    row.appendChild(input);
    container.appendChild(row);
  }
}
