// Configuration centralisée du rendu : préréglages de qualité et réglages dérivés.
// Tous les modules de rendu lisent leurs options ici (rien n'est codé en dur ailleurs).

// Préréglages : chaque clé « effet » correspond à une case à cocher des paramètres
// (choisir une qualité remet ces cases à leur valeur par défaut, on peut ensuite les modifier).
export const QUALITY_PRESETS = {
  low: {
    label: 'Bas',
    pixelRatio: 0.75, shadowMap: 1024, shadowRange: 350, msaa: 0,
    cloudDensity: 0.45, waterRings: 24, particleDensity: 0.35, nearTrees: 90, nearTreeMax: 60, forestDensity: 1800,
    effects: { shadows: false, post: false, bloom: false, ao: false, godrays: false, chroma: false, motionFx: true, particles: true, raindrops: false },
  },
  medium: {
    label: 'Moyen',
    pixelRatio: 1, shadowMap: 2048, shadowRange: 500, msaa: 0,
    cloudDensity: 0.7, waterRings: 40, particleDensity: 0.6, nearTrees: 150, nearTreeMax: 150, forestDensity: 3500,
    effects: { shadows: true, post: true, bloom: true, ao: false, godrays: true, chroma: false, motionFx: true, particles: true, raindrops: true },
  },
  high: {
    label: 'Élevé',
    pixelRatio: 1.5, shadowMap: 4096, shadowRange: 650, msaa: 4,
    cloudDensity: 1, waterRings: 56, particleDensity: 1, nearTrees: 220, nearTreeMax: 300, forestDensity: 6000,
    effects: { shadows: true, post: true, bloom: true, ao: true, godrays: true, chroma: true, motionFx: true, particles: true, raindrops: true },
  },
  ultra: {
    label: 'Ultra',
    pixelRatio: 2, shadowMap: 4096, shadowRange: 900, msaa: 4,
    cloudDensity: 1.35, waterRings: 72, particleDensity: 1.4, nearTrees: 320, nearTreeMax: 520, forestDensity: 9000,
    effects: { shadows: true, post: true, bloom: true, ao: true, godrays: true, chroma: true, motionFx: true, particles: true, raindrops: true },
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
  let q = QUALITY_PRESETS[settings.quality] || QUALITY_PRESETS.medium;
  if (settings.quality === 'custom') {
    // personnalisé : le détail du décor vient d'un préréglage choisi, le reste des réglages du joueur
    const base = QUALITY_PRESETS[settings.c_detail] || QUALITY_PRESETS.medium;
    q = { ...base, label: 'Personnalisé', pixelRatio: Number(settings.c_pixelRatio) || 1, shadowMap: Number(settings.c_shadowMap) || 2048,
      shadowRange: Number(settings.c_shadowMap) >= 4096 ? Math.max(base.shadowRange, 650) : base.shadowRange, msaa: Number(settings.c_msaa) || 0 };
  }
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
    raindrops: post && on('raindrops'), // gouttes sur le pare-brise (dessinées par le post-traitement)
    adaptive: settings.adaptiveRes,
  };
}
