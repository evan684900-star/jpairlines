// Chef d'orchestre du rendu : moteur WebGL, scène, ciel, nuages, météo, heure, post-traitement,
// résolution adaptative. Ne touche jamais à la simulation : il lit seulement l'état de l'avion.
import * as THREE from 'three';
import { installShaderExtensions, U, NIGHT_GLOWS } from './shared.js';
import { renderConfig, ART, LAYERS } from './config.js';
import { buildTextures } from './textures.js';
import { buildWorldHeightTexture } from './heightmap.js';
import { Atmosphere } from './sky.js';
import { Clouds } from './clouds.js';
import { Weather } from './weather.js';
import { Water } from './water.js';
import { Effects } from './effects.js';
import { TREE_U } from './trees.js';

installShaderExtensions();

const _c = new THREE.Color();
const WIND_DRIFT = new THREE.Vector2(4.2, 1.6); // dérive des nuages (m/s), identique pour tous les joueurs

export class GameRenderer {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = ART.exposureDay;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0xbfd4e6, 0.0001);
    this.camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.5, 60000);
    this.camera.layers.enable(LAYERS.overlay);
    this.overlayTimer = 0;
    buildTextures();
    this.worldHeight = buildWorldHeightTexture(256);
    this.atmo = new Atmosphere(this.renderer, this.scene);
    this.effects = new Effects(this.scene);
    this.weatherState = null;
    this.fxLight = new THREE.Color();
    this.weather = new Weather();
    this.clouds = null;
    this.cfg = null;
    this.post = null;
    this.postLoading = false;
    this.viewDist = 20000;
    this.fogMul = 1;
    this.appliedWeather = null;
    // mesure des performances
    this.fps = 60;
    this.frameAvg = 1 / 60;
    this.resScale = 1;
    this.adaptTimer = 0;
    addEventListener('resize', () => this.resize());
  }

  // l'eau a besoin du terrain (photo du relief pour la profondeur)
  attachTerrain(terrain) {
    this.terrain = terrain;
    this.water = new Water(this.renderer, this.scene, this.worldHeight, this.cfg?.waterRings ?? 56);
  }

  // à appeler une fois les textures prêtes (nuages : quelques centaines de ms)
  buildClouds() {
    this.clouds = new Clouds(this.cfg?.cloudDensity ?? 1, this.worldHeight);
    this.scene.add(this.clouds.group);
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.post?.setSize(innerWidth, innerHeight, this.renderer.getPixelRatio());
  }

  setPixelRatio() {
    const pr = Math.max(0.4, this.cfg.pixelRatio * this.resScale);
    if (Math.abs(pr - this.renderer.getPixelRatio()) < 0.01) return;
    this.renderer.setPixelRatio(pr);
    this.post?.setSize(innerWidth, innerHeight, pr);
  }

  // settings : paramètres du joueur ; key : réglage modifié (undefined = tout)
  applySettings(settings, key) {
    const cfg = renderConfig(settings);
    const prev = this.cfg;
    this.cfg = cfg;
    if (!key || key === 'quality' || key === 'adaptiveRes' || key === 'c_pixelRatio') { this.resScale = 1; this.warmup = 8; this.setPixelRatio(); }
    if (!key || key === 'viewDist') {
      this.viewDist = settings.viewDist * 1000;
      this.camera.far = this.viewDist * 1.6;
      this.camera.updateProjectionMatrix();
      this.atmo.sky.scale.setScalar(this.camera.far * 0.9);
    }
    if (!key || key === 'fov') { this.camera.fov = settings.fov; this.camera.updateProjectionMatrix(); }
    if (this.clouds && (!key || key === 'clouds')) this.clouds.group.visible = settings.clouds;
    this.atmo.setShadows(cfg.shadows, cfg.shadowMap, cfg.shadowRange);
    this.renderer.shadowMap.enabled = cfg.shadows;
    if (prev && prev.shadows !== cfg.shadows) this.scene.traverse((o) => { if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true; });
    if (this.clouds && prev && prev.cloudDensity !== cfg.cloudDensity) {
      this.scene.remove(this.clouds.group);
      this.buildClouds();
      this.clouds.group.visible = settings.clouds;
    }
    if (this.water && prev && prev.waterRings !== cfg.waterRings) this.water.setRings(cfg.waterRings);
    if (cfg.post) this.loadPost();
    this.post?.configure(cfg);
  }

  // le post-traitement n'est chargé que s'il est activé (chargement paresseux)
  loadPost() {
    if (this.post || this.postLoading) return;
    this.postLoading = true;
    import('./post.js').then(({ PostFX }) => {
      this.post = new PostFX(this.renderer, this.scene, this.camera, this.atmo);
      this.post.setSize(innerWidth, innerHeight, this.renderer.getPixelRatio());
      this.post.configure(this.cfg);
    }).catch((e) => { console.warn('Post-traitement indisponible', e); this.cfg.post = false; });
  }

  // heure courante selon le mode choisi
  hourOf(settings, wallT) {
    if (settings.timeMode === 'cycle') return (wallT / 60) % 24; // une journée en 24 minutes, la même pour tous
    if (settings.timeMode === 'local') { const d = new Date(); return d.getHours() + d.getMinutes() / 60; }
    return settings.timeOfDay;
  }

  // focus : point suivi par les ombres (l'avion) ; state : infos de vol pour les effets
  update(dt, wallT, settings, focus) {
    U.jpTime.value = wallT % 3600;
    const w = this.weather.update(dt, settings.weather, wallT);
    this.weatherState = w;
    // ciel : recalcul seulement si la météo a sensiblement changé
    const aw = this.appliedWeather;
    if (!aw || Math.abs(aw.turbidity - w.turbidity) > 0.04 || Math.abs(aw.darken - w.darken) > 0.04) {
      this.appliedWeather = { turbidity: w.turbidity, darken: w.darken };
      this.atmo.setWeather(this.appliedWeather);
    }
    const before = this.atmo.hour;
    this.atmo.setTime(Math.round(this.hourOf(settings, wallT) * 50) / 50);
    if (this.clouds) {
      if (this.atmo.hour !== before) this.clouds.setLight(this.atmo);
      this.clouds.setWeather(w);
      U.jpCloudOffset.value.set((WIND_DRIFT.x * wallT) % this.clouds.span, (WIND_DRIFT.y * wallT) % this.clouds.span);
      this.clouds.update(dt, this.camera, this.camera.far);
    }
    // brume : densité selon la distance de vue et la météo ; plus dense dans la couche de stratus
    let fog = w.fog;
    if (this.clouds && w.stratus > 0.5) {
      const dy = Math.abs(this.camera.position.y - this.clouds.stratus.position.y);
      fog *= 1 + 25 * (1 - Math.min(1, dy / 90)) * w.stratus;
    }
    this.scene.fog.density = (1.15 / this.viewDist) * fog;
    U.jpFogHeight.value = w.hazeH;
    U.jpFogHeightDensity.value = w.haze;
    U.jpWet.value += ((w.rain > 0.2 ? 1 : 0) - U.jpWet.value) * Math.min(1, dt * (w.rain > 0.2 ? 0.05 : 0.01));
    this.water?.update(dt, this.camera, w, this.weather.windDir, this.terrain.version);
    this.renderer.toneMappingExposure = this.atmo.exposure;
    // lumière des arbres lointains (photos prises sous un éclairage de référence)
    const a = this.atmo;
    TREE_U.uLight.value.copy(a.sun.color).multiplyScalar(a.sun.intensity * 0.42 * Math.max(0.25, Math.min(1, a.lightDir.y * 2 + 0.3)))
      .add(_c.copy(a.hemi.color).multiplyScalar(a.hemi.intensity * 1.1)).multiplyScalar(0.62);
    TREE_U.jpWind.value = Math.min(2, (w.windNow ?? w.wind) / 10);
    const glow = Math.min(1, Math.max(0, (this.atmo.night - 0.3) / 0.5)) + w.darken * 0.4;
    for (const m of NIGHT_GLOWS) m.opacity = Math.min(1, glow);
    this.atmo.follow(focus, this.camera.position, this.camera.far);
    return w;
  }

  // effets liés à l'avion (fumée, poussière, traînées, pluie, éclairs) ; renvoie les événements (son, caméra)
  updateEffects(dt, plane, mesh) {
    const a = this.atmo;
    this.fxLight.copy(a.sun.color).multiplyScalar(a.sun.intensity * 0.2 * Math.max(0.2, a.lightDir.y + 0.3))
      .add(_c.copy(a.hemi.color).multiplyScalar(a.hemi.intensity * 1.6));
    return this.effects.update(dt, plane, mesh, {
      camera: this.camera, weather: this.weatherState, cfg: this.cfg, light: this.fxLight,
      density: this.cfg.particles ? this.cfg.particleDensity : 0,
    });
  }

  // les objets non tonemappés (marqueurs de quêtes, étiquettes) vont sur leur propre calque
  tagOverlays() {
    this.scene.traverse((o) => {
      if (o.layers.mask === 1 && o.material && !Array.isArray(o.material) && o.material.toneMapped === false) o.layers.set(LAYERS.overlay);
    });
  }

  render(dt, fx) {
    this.overlayTimer -= dt;
    if (this.overlayTimer <= 0) { this.overlayTimer = 0.25; this.tagOverlays(); }
    if (this.cfg.post && this.post) this.post.render(dt, fx);
    else this.renderer.render(this.scene, this.camera);
    this.measure(dt);
  }

  // compteur d'images et résolution adaptative (optionnelle) : prudente pour ne pas rendre l'image floue.
  // On attend la fin des chargements, on ignore les à-coups, on ne descend jamais sous 80 %.
  measure(dt) {
    if (!(dt > 0)) return;
    this.frameAvg += (Math.min(dt, 0.25) - this.frameAvg) * 0.05;
    this.fps = 1 / this.frameAvg;
    if (!this.cfg.adaptive) return;
    this.warmup = (this.warmup ?? 8) - dt;
    if (this.warmup > 0) return;
    this.adaptTimer -= dt;
    if (this.adaptTimer > 0) return;
    this.adaptTimer = 1;
    this.slow = this.fps < 45 ? (this.slow || 0) + 1 : 0;
    this.fast = this.fps > 54 ? (this.fast || 0) + 1 : 0;
    if (this.slow >= 3 && this.resScale > 0.8) { this.resScale = Math.max(0.8, this.resScale - 0.1); this.slow = 0; this.setPixelRatio(); }
    else if (this.fast >= 2 && this.resScale < 1) { this.resScale = Math.min(1, this.resScale + 0.1); this.fast = 0; this.setPixelRatio(); }
  }
}
