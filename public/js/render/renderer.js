// Chef d'orchestre du rendu : moteur WebGL, scène, ciel, nuages, météo, heure, post-traitement,
// résolution adaptative. Ne touche jamais à la simulation : il lit seulement l'état de l'avion.
import * as THREE from 'three';
import { installShaderExtensions, U } from './shared.js';
import { renderConfig, ART } from './config.js';
import { buildTextures } from './textures.js';
import { buildWorldHeightTexture } from './heightmap.js';
import { Atmosphere } from './sky.js';
import { Clouds } from './clouds.js';
import { Weather } from './weather.js';

installShaderExtensions();

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
    buildTextures();
    this.worldHeight = buildWorldHeightTexture(256);
    this.atmo = new Atmosphere(this.renderer, this.scene);
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
    if (!key || key === 'quality' || key === 'adaptiveRes') { this.resScale = 1; this.setPixelRatio(); }
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
    this.renderer.toneMappingExposure = this.atmo.exposure;
    this.atmo.follow(focus, this.camera.position, this.camera.far);
    return w;
  }

  render(dt, fx) {
    if (this.cfg.post && this.post) this.post.render(dt, fx);
    else this.renderer.render(this.scene, this.camera);
    this.measure(dt);
  }

  // compteur d'images et résolution adaptative (vise 60 images/s)
  measure(dt) {
    if (!(dt > 0)) return;
    this.frameAvg += (dt - this.frameAvg) * 0.05;
    this.fps = 1 / this.frameAvg;
    if (!this.cfg.adaptive) return;
    this.adaptTimer -= dt;
    if (this.adaptTimer > 0) return;
    this.adaptTimer = 1;
    if (this.fps < 52 && this.resScale > 0.55) { this.resScale = Math.max(0.55, this.resScale - 0.1); this.setPixelRatio(); }
    else if (this.fps > 58.5 && this.resScale < 1) { this.resScale = Math.min(1, this.resScale + 0.05); this.setPixelRatio(); }
  }
}
