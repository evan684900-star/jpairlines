// Configuration centralisée du rendu : préréglages de qualité et réglages dérivés.
// Tous les modules de rendu lisent leurs options ici (rien n'est codé en dur ailleurs).

// Préréglages : chaque clé « effet » correspond à une case à cocher des paramètres
// (choisir une qualité remet ces cases à leur valeur par défaut, on peut ensuite les modifier).
// Version Poki : préréglages allégés (moins d'arbres, ombres plus petites, post-traitement limité)
export const QUALITY_PRESETS = {
  low: {
    label: 'Bas',
    pixelRatio: 0.85, shadowMap: 1024, shadowRange: 300, msaa: 0,
    cloudDensity: 0.4, waterRings: 20, particleDensity: 0.3, nearTrees: 0, nearTreeMax: 0, forestDensity: 900,
    effects: { shadows: false, post: false, bloom: false, ao: false, godrays: false, chroma: false, motionFx: true, particles: true },
  },
  medium: {
    label: 'Moyen',
    pixelRatio: 1, shadowMap: 1024, shadowRange: 380, msaa: 0,
    cloudDensity: 0.55, waterRings: 28, particleDensity: 0.5, nearTrees: 110, nearTreeMax: 70, forestDensity: 1800,
    effects: { shadows: true, post: false, bloom: false, ao: false, godrays: false, chroma: false, motionFx: true, particles: true },
  },
  high: {
    label: 'Élevé',
    pixelRatio: 1.25, shadowMap: 2048, shadowRange: 500, msaa: 0,
    cloudDensity: 0.8, waterRings: 40, particleDensity: 0.8, nearTrees: 160, nearTreeMax: 160, forestDensity: 3200,
    effects: { shadows: true, post: true, bloom: true, ao: false, godrays: true, chroma: false, motionFx: true, particles: true },
  },
};

export const EFFECT_KEYS = Object.keys(QUALITY_PRESETS.high.effects);

// Calques three.js : relief (photo pour l'eau) et objets non soumis au tone mapping (marqueurs)
export const LAYERS = { terrain: 1, overlay: 2 };

// Réglages fixes de la direction artistique
export const ART = {
  exposureDay: 0.42,
  exposureNight: 1.15,
  bloomStrength: 0.32,
  bloomRadius: 0.55,
  bloomThreshold: 1.5, // seuil du halo, rapporté à l'exposition
  chromaStrength: 0.0028,
  vignette: 0.32,
  grain: 0.025,
  saturation: 1.12,
  godraysStrength: 0.55,
  flareStrength: 0.6,
  cloudBase: 1500,
  cloudTop: 3100,
  cirrusAlt: 8500,
};

// Préférence « réduire les animations » du système : coupe tremblements et distorsions
export const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// Options effectives à partir des paramètres du joueur
export function renderConfig(settings) {
  const q = QUALITY_PRESETS[settings.quality] || QUALITY_PRESETS.medium;
  const dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;
  const on = (k) => settings[`fx_${k}`] ?? q.effects[k];
  const post = on('post');
  return {
    ...q,
    pixelRatio: Math.min(dpr, q.pixelRatio),
    shadows: on('shadows'),
    post,
    bloom: post && on('bloom'),
    ao: post && on('ao'),
    godrays: post && on('godrays'),
    chroma: post && on('chroma'),
    motionFx: on('motionFx') && !reducedMotion,
    particles: on('particles'),
    adaptive: settings.adaptiveRes,
  };
}
