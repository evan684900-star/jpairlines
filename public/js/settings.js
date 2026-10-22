import { QUALITY_PRESETS, EFFECT_KEYS } from './render/config.js';
import { SOUND_GROUPS } from './ui/audio.js';
import { t } from './i18n.js';

// Paramètres du joueur (sauvegardés dans le navigateur)
export const SCHEMA = [
  { section: 'Graphismes' },
  { key: 'quality', label: 'Qualité', type: 'select', def: 'high', options: [['low', 'Bas'], ['medium', 'Moyen'], ['high', 'Élevé'], ['ultra', 'Ultra']] },
  { key: 'adaptiveRes', label: 'Résolution adaptative (baisse un peu la netteté si le jeu rame)', type: 'check', def: false },
  { key: 'viewDist', label: 'Distance de vue', type: 'range', def: 20, min: 8, max: 36, step: 2, unit: ' km' },
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
  { key: 'weather', label: 'Météo', type: 'select', def: 'auto', options: [['auto', 'Changeante (la même pour tous)'], ['clear', 'Grand beau'], ['cloudy', 'Nuageux'], ['overcast', 'Couvert'], ['rain', 'Pluie'], ['storm', 'Orage'], ['fog', 'Brouillard']] },
  { section: 'Simulation' },
  { key: 'difficulty', label: 'Difficulté', type: 'select', def: 'normal', options: [['easy', 'Facile (moteur auto, crash rare)'], ['normal', 'Normale'], ['realistic', 'Réaliste (pas d\'aide)']] },
  { key: 'fuelMode', label: 'Consommation de carburant', type: 'select', def: 'fast', options: [['fast', 'Accélérée ×4 (recommandé)'], ['real', 'Réaliste (×1)'], ['off', 'Désactivée']] },
  { key: 'timeScale', label: 'Accélération du temps', type: 'select', def: '1', options: [['1', '×1'], ['2', '×2'], ['4', '×4']] },
  { section: 'Commandes' },
  { key: 'sensitivity', label: 'Sensibilité du manche', type: 'range', def: 1, min: 0.4, max: 1.6, step: 0.1, unit: '×' },
  { key: 'invertPitch', label: 'Inverser la profondeur (↑ = monter)', type: 'check', def: false },
  { section: 'Interface' },
  { key: 'hudScale', label: 'Taille de l\'affichage (HUD)', type: 'range', def: 0.85, min: 0.5, max: 1.3, step: 0.05, unit: '×' },
  { key: 'showInstruments', label: 'Instruments de vol (horizon, vitesse, altitude)', type: 'check', def: true },
  { key: 'showSystems', label: 'Voyants (moteur, train, volets…)', type: 'check', def: true },
  { key: 'showToolbar', label: 'Barre de boutons', type: 'check', def: true },
  { key: 'showIntro', label: 'Cinématique au début de la partie', type: 'check', def: true },
  { key: 'units', label: 'Unités', type: 'select', def: 'metric', options: [['metric', 'km/h · m'], ['aviation', 'nœuds · pieds']] },
  { key: 'showNames', label: 'Noms des joueurs', type: 'check', def: true },
  { key: 'minimap', label: 'Mini-carte', type: 'check', def: true },
  { key: 'showFps', label: 'Compteur d\'images par seconde', type: 'check', def: false },
  { section: 'Sons' },
  { key: 'muted', label: 'Couper le son', type: 'check', def: false },
  { key: 'volume', label: 'Volume général', type: 'range', def: 0.5, min: 0, max: 1, step: 0.05, unit: '' },
  ...SOUND_GROUPS.map((g) => ({ key: `snd_${g.key}`, label: `· ${g.label}`, type: 'range', def: 100, min: 0, max: 150, step: 5, unit: ' %' })),
];

const KEY = 'jpairlines-settings';
export const settings = Object.fromEntries(SCHEMA.filter((s) => s.key && !s.preset).map((s) => [s.key, s.def]));
try { Object.assign(settings, JSON.parse(localStorage.getItem(KEY)) || {}); } catch { /* pas de sauvegarde */ }
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
      h.textContent = t(s.section);
      container.appendChild(h);
      continue;
    }
    const row = document.createElement('label');
    row.className = 'setting';
    const name = document.createElement('span');
    name.textContent = s.label.startsWith('· ') ? `· ${t(s.label.slice(2))}` : t(s.label);
    row.appendChild(name);
    let input;
    if (s.type === 'select') {
      input = document.createElement('select');
      for (const [v, txt] of s.options) input.add(new Option(t(txt), v));
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
