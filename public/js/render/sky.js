// Ciel atmosphérique (diffusion de Rayleigh/Mie), soleil et lune dynamiques, étoiles,
// cycle jour/nuit, couleurs de la brume et éclairage d'ambiance (environment map).
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { rng } from '../world.js';
import { U } from './shared.js';
import { ART } from './config.js';

const DEG = Math.PI / 180;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Position du soleil : lever vers 5 h 30, coucher vers 20 h 30, 62° à 13 h, -28° à 1 h du matin
export function sunDirection(hour, out = new THREE.Vector3()) {
  const a = ((hour - 13) / 24) * Math.PI * 2;
  const elev = (44.8 * Math.cos(a) + 17.2) * DEG;
  const az = (180 + (hour - 13) * 15) * DEG;
  return out.setFromSphericalCoords(1, Math.PI / 2 - elev, az);
}

function makeStars(count = 4200) {
  const r = rng(2024);
  const pos = new Float32Array(count * 3), mag = new Float32Array(count), tint = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    // plus d'étoiles le long d'une bande (voie lactée)
    let v = new THREE.Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1);
    if (i % 3 === 0) v.set(r() * 2 - 1, (r() - 0.5) * 0.18, r() * 2 - 1).applyAxisAngle(new THREE.Vector3(1, 0, 0.3).normalize(), 1.1);
    v.normalize();
    pos.set([v.x, v.y, v.z], i * 3);
    mag[i] = Math.pow(r(), 6) * 3 + 0.4;
    tint[i] = r();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('mag', new THREE.BufferAttribute(mag, 1));
  g.setAttribute('tint', new THREE.BufferAttribute(tint, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { opacity: { value: 0 }, time: U.jpTime, pr: { value: 1 } },
    vertexShader: /* glsl */`
      attribute float mag; attribute float tint;
      uniform float time; uniform float pr;
      varying float vB; varying float vT;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position * 30000.0, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_Position.z = gl_Position.w * 0.99999;
        float tw = 0.75 + 0.25 * sin(time * (1.5 + tint * 4.0) + tint * 60.0);
        vB = mag * tw * smoothstep(-0.05, 0.25, position.y);
        vT = tint;
        gl_PointSize = (1.2 + mag * 0.9) * pr;
      }`,
    fragmentShader: /* glsl */`
      uniform float opacity; varying float vB; varying float vT;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float a = smoothstep(0.5, 0.0, length(c));
        vec3 col = mix(vec3(0.75, 0.82, 1.0), vec3(1.0, 0.86, 0.7), vT);
        gl_FragColor = vec4(col * vB * a * opacity * 2.5, 1.0);
      }`,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  p.renderOrder = -10;
  return p;
}

function makeMoon() {
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const r = rng(17);
  const glow = ctx.createRadialGradient(S / 2, S / 2, S * 0.18, S / 2, S / 2, S / 2);
  glow.addColorStop(0, 'rgba(200,215,255,0.35)');
  glow.addColorStop(1, 'rgba(200,215,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, S, S);
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S * 0.2, 0, Math.PI * 2);
  ctx.fillStyle = '#f2f1ea';
  ctx.fill();
  ctx.save();
  ctx.clip();
  for (let i = 0; i < 14; i++) {
    ctx.beginPath();
    ctx.arc(S / 2 + (r() - 0.5) * S * 0.36, S / 2 + (r() - 0.5) * S * 0.36, S * (0.02 + r() * 0.06), 0, Math.PI * 2);
    ctx.fillStyle = `rgba(150,150,160,${0.15 + r() * 0.25})`;
    ctx.fill();
  }
  ctx.restore();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, fog: false, depthWrite: false, transparent: true, toneMapped: true }));
  sp.material.color.setScalar(3);
  sp.renderOrder = -9;
  return sp;
}

export class Atmosphere {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;
    this.sky = new Sky();
    this.sky.scale.setScalar(40000);
    this.sky.material.depthWrite = false;
    this.sky.renderOrder = -11;
    scene.add(this.sky);
    this.stars = makeStars();
    this.moon = makeMoon();
    scene.add(this.stars, this.moon);

    this.sunDir = new THREE.Vector3();
    this.moonDir = new THREE.Vector3();
    this.lightDir = new THREE.Vector3(); // direction de la lumière principale (soleil ou lune)
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 1.2;
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbcd4ee, 0x5a5440, 0.4);
    scene.add(this.hemi);

    // scène servant à calculer l'éclairage d'ambiance : ciel + sol sombre en dessous de l'horizon
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.skyScene = new THREE.Scene();
    this.skyClone = new Sky();
    this.skyClone.scale.setScalar(1000);
    this.ground = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 12, 0, Math.PI * 2, Math.PI / 2 + 0.02, Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x3a3f2c, side: THREE.BackSide, fog: false }));
    this.skyScene.add(this.skyClone, this.ground);
    this.probe = new THREE.WebGLRenderTarget(8, 8, { type: THREE.FloatType });
    this.probeCam = new THREE.PerspectiveCamera(30, 1, 1, 2000);
    this.horizon = new THREE.Color();
    this.zenith = new THREE.Color();
    this.envRT = null;
    this.shadowSize = 600;
    this.night = 0;
    this.hour = -1;
    this.weather = { turbidity: 0, darken: 0, fogMul: 1 };
    this.setAtmosphere(2.6, 1.9);
  }

  setAtmosphere(turbidity, rayleigh) {
    for (const s of [this.sky, this.skyClone]) {
      const u = s.material.uniforms;
      u.turbidity.value = turbidity;
      u.rayleigh.value = rayleigh;
      u.mieCoefficient.value = 0.003 + (turbidity - 2.6) * 0.0015;
      u.mieDirectionalG.value = 0.8;
    }
  }

  readSky(dir) {
    this.probeCam.position.set(0, 0, 0);
    this.probeCam.lookAt(dir);
    const prev = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.probe);
    this.renderer.render(this.skyScene, this.probeCam);
    const buf = new Float32Array(8 * 8 * 4);
    this.renderer.readRenderTargetPixels(this.probe, 0, 0, 8, 8, buf);
    this.renderer.setRenderTarget(prev);
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < 64; i++) { r += buf[i * 4]; g += buf[i * 4 + 1]; b += buf[i * 4 + 2]; }
    return new THREE.Color(r / 64, g / 64, b / 64);
  }

  // Météo : voile (turbidité), assombrissement du ciel couvert, densité de brume
  setWeather(w) {
    this.weather = w;
    this.setAtmosphere(2.6 + w.turbidity * 7, 1.9 - w.turbidity * 0.9);
    this.hour = -1; // recalcul complet au prochain setTime
  }

  // hour : 0..24 ; recalcule couleurs, lumières et environment map (coûteux : seulement si l'heure change)
  setTime(hour) {
    if (Math.abs(hour - this.hour) < 0.01) return;
    this.hour = hour;
    sunDirection(hour, this.sunDir);
    for (const s of [this.sky, this.skyClone]) s.material.uniforms.sunPosition.value.copy(this.sunDir);
    // lune pleine, en face du soleil, un peu décalée
    this.moonDir.copy(this.sunDir).negate().applyAxisAngle(new THREE.Vector3(1, 0, 0), 0.35);
    if (this.moonDir.y < 0.15) this.moonDir.y = 0.15 + (this.moonDir.y - 0.15) * 0.2;
    this.moonDir.normalize();

    const h = this.sunDir.y;
    const day = smooth(-0.1, 0.12, h); // 0 la nuit, 1 le jour (crépuscule progressif)
    this.night = 1 - day;
    U.jpNight.value = this.night;
    const dark = this.weather.darken;

    // lumière principale : soleil le jour, lune la nuit
    const useSun = h > -0.03;
    this.lightDir.copy(useSun ? this.sunDir : this.moonDir);
    const warm = 1 - Math.min(1, Math.max(0, h) * 2.2);
    if (useSun) {
      this.sun.color.setRGB(1, 0.95 - warm * 0.32, 0.88 - warm * 0.55);
      this.sun.intensity = (0.2 + smooth(-0.03, 0.35, h) * 3.8) * (1 - dark * 0.85);
    } else {
      this.sun.color.setRGB(0.62, 0.72, 1);
      this.sun.intensity = 0.32 * (1 - dark * 0.8);
    }
    this.hemi.intensity = (0.06 + day * 0.42) * (1 - dark * 0.3);
    this.hemi.color.setRGB(0.74, 0.83, 0.93).lerp(new THREE.Color(0.25, 0.32, 0.5), this.night);
    this.hemi.groundColor.setRGB(0.35, 0.33, 0.25).multiplyScalar(0.3 + day * 0.7);

    // étoiles et lune
    this.stars.material.uniforms.opacity.value = smooth(0.35, 0.95, this.night) * (1 - dark);
    this.moon.material.opacity = smooth(0.2, 0.8, this.night) * (1 - dark * 0.9);

    // couleurs du ciel pour la brume et l'eau
    const side = new THREE.Vector3(-this.sunDir.z, 0, this.sunDir.x).normalize();
    const away = this.sunDir.clone().setY(0).normalize().negate();
    this.horizon.copy(this.readSky(side.clone().multiplyScalar(0.7).add(away.multiplyScalar(0.3)).setY(0.04).normalize()));
    this.zenith.copy(this.readSky(new THREE.Vector3(0.01, 1, 0)));
    // nuit : bleu très sombre au lieu du noir complet ; ciel couvert : gris
    const nightCol = new THREE.Color(0.012, 0.018, 0.034);
    this.horizon.lerp(nightCol, smooth(0.6, 1, this.night) * 0.8).addScalar(0.004);
    this.zenith.lerp(new THREE.Color(0.004, 0.007, 0.016), smooth(0.6, 1, this.night) * 0.8);
    const grey = (this.horizon.r + this.horizon.g + this.horizon.b) / 3;
    this.horizon.lerp(new THREE.Color(grey, grey * 1.02, grey * 1.06), dark * 0.85).multiplyScalar(1 - dark * 0.35);
    this.zenith.lerp(this.horizon, dark * 0.8);
    if (this.scene.fog) this.scene.fog.color.copy(this.horizon);
    // diffusion vers le soleil dans la brume (forte au lever et au coucher)
    U.jpFogSun.value.copy(this.sun.color).multiplyScalar((useSun ? 0.05 + warm * 0.25 : 0) * this.sun.intensity * (1 - dark));
    U.jpSunDir.value.copy(this.lightDir);
    this.ground.material.color.setRGB(0.07, 0.08, 0.05).multiplyScalar(0.15 + day * 0.85);

    // éclairage d'ambiance à partir du ciel
    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromScene(this.skyScene, 0, 0.1, 2000);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = (0.12 + day * 0.68) * (1 - dark * 0.3);
  }

  get exposure() {
    return ART.exposureDay + (ART.exposureNight - ART.exposureDay) * this.night;
  }

  setShadows(on, mapSize, range) {
    this.sun.castShadow = on;
    this.shadowSize = range;
    if (this.sun.shadow.mapSize.x !== mapSize) {
      this.sun.shadow.mapSize.set(mapSize, mapSize);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
  }

  // la zone d'ombre suit l'avion ; ciel, étoiles et lune suivent la caméra
  follow(target, camPos, far) {
    this.sky.position.copy(camPos);
    this.stars.position.copy(camPos);
    this.stars.scale.setScalar(far / 32000);
    this.moon.position.copy(camPos).addScaledVector(this.moonDir, far * 0.8);
    this.moon.scale.setScalar(far * 0.8 * 0.09);
    const s = this.shadowSize;
    const cam = this.sun.shadow.camera;
    if (cam.right !== s) {
      cam.left = -s; cam.right = s; cam.top = s; cam.bottom = -s; cam.near = 10; cam.far = 8000;
      cam.updateProjectionMatrix();
    }
    // alignement sur la grille des texels pour éviter le scintillement
    const texel = (2 * s) / this.sun.shadow.mapSize.x;
    const tx = Math.round(target.x / texel) * texel, tz = Math.round(target.z / texel) * texel;
    this.sun.target.position.set(tx, target.y, tz);
    this.sun.position.set(tx, target.y, tz).addScaledVector(this.lightDir, 4000);
  }
}
