// Post-traitement (chargé seulement s'il est activé) :
// scène HDR (MSAA + profondeur) → occlusion ambiante (SSAO) → halo (bloom) → rayons du soleil, reflets
// d'objectif, aberration chromatique, distorsion de vitesse, gouttes sur la verrière, vignette
// → tone mapping ACES (OutputPass) → SMAA (si pas de MSAA) → marqueurs de quêtes et étiquettes (non tonemappés).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { ART, LAYERS } from './config.js';

// Calque des objets non soumis au tone mapping (anneaux de quêtes, étiquettes) : dessinés à la fin
const OVERLAY_LAYER = LAYERS.overlay;

const QUAD_VS = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// ---------- Occlusion ambiante (à partir de la profondeur seule) ----------
const SSAO_FS = /* glsl */`
  uniform sampler2D tDepth;
  uniform mat4 projInv, proj;
  uniform vec3 kernel[12];
  uniform float strength;
  varying vec2 vUv;
  vec3 viewPos(vec2 uv) {
    float d = texture2D(tDepth, uv).x;
    vec4 p = projInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
    return p.xyz / p.w;
  }
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main() {
    float d = texture2D(tDepth, vUv).x;
    if (d >= 0.99999) { gl_FragColor = vec4(1.0); return; }
    vec3 P = viewPos(vUv);
    float dist = -P.z;
    if (dist > 700.0) { gl_FragColor = vec4(1.0); return; }
    vec3 N = normalize(cross(dFdx(P), dFdy(P)));
    float a = hash(gl_FragCoord.xy) * 6.2832;
    vec3 rv = vec3(cos(a), sin(a), 0.0);
    vec3 T = normalize(rv - N * dot(rv, N));
    vec3 B = cross(N, T);
    mat3 tbn = mat3(T, B, N);
    float R = clamp(dist * 0.035, 0.6, 6.0);
    float occ = 0.0;
    for (int i = 0; i < 12; i++) {
      vec3 s = P + tbn * kernel[i] * R;
      vec4 c = proj * vec4(s, 1.0);
      vec2 uv = c.xy / c.w * 0.5 + 0.5;
      float sz = viewPos(uv).z;
      float range = smoothstep(0.0, 1.0, R / max(abs(P.z - sz), 1e-3));
      occ += (sz >= s.z + R * 0.04 ? 1.0 : 0.0) * range;
    }
    float ao = 1.0 - occ / 12.0 * strength;
    ao = mix(ao, 1.0, smoothstep(350.0, 700.0, dist));
    gl_FragColor = vec4(vec3(ao), 1.0);
  }
`;

// composition : couleur × occlusion (flou bilatéral léger)
const COMPOSE_FS = /* glsl */`
  uniform sampler2D tColor, tAO, tDepth;
  uniform vec2 aoTexel;
  uniform float useAO;
  varying vec2 vUv;
  void main() {
    vec4 col = texture2D(tColor, vUv);
    // garde-fou : une valeur invalide (NaN, infini) serait étalée sur tout l'écran par le bloom
    if (any(isnan(col)) || any(isinf(col))) col = vec4(0.0, 0.0, 0.0, 1.0);
    col = min(col, vec4(30000.0));
    if (useAO > 0.5) {
      float d0 = texture2D(tDepth, vUv).x;
      float sum = 0.0, w = 0.0;
      for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) {
        vec2 o = vec2(float(x), float(y)) * aoTexel;
        float dd = texture2D(tDepth, vUv + o).x;
        float ww = 1.0 / (1e-5 + abs(dd - d0) * 3000.0);
        sum += texture2D(tAO, vUv + o).r * ww; w += ww;
      }
      col.rgb *= sum / w;
    }
    gl_FragColor = col;
  }
`;

// ---------- Rayons du soleil : masque (ciel lumineux) puis flou radial vers le soleil ----------
const RAYMASK_FS = /* glsl */`
  uniform sampler2D tColor, tDepth;
  uniform vec2 sunUv; uniform float aspect; uniform float exposure;
  varying vec2 vUv;
  void main() {
    float sky = step(0.99999, texture2D(tDepth, vUv).x);
    vec3 c = texture2D(tColor, vUv).rgb * exposure;
    float lum = dot(c, vec3(0.3, 0.55, 0.15));
    vec2 d = (vUv - sunUv) * vec2(aspect, 1.0);
    float near = exp(-dot(d, d) * 6.0);
    gl_FragColor = vec4(vec3(sky * smoothstep(0.5, 1.6, lum) * near), 1.0);
  }
`;
const RAYBLUR_FS = /* glsl */`
  uniform sampler2D tMask; uniform vec2 sunUv;
  varying vec2 vUv;
  void main() {
    vec2 delta = (sunUv - vUv) / 48.0 * 0.95;
    vec2 uv = vUv;
    float illum = 0.0, decay = 1.0;
    float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    uv += delta * jitter;
    for (int i = 0; i < 48; i++) {
      illum += texture2D(tMask, uv).r * decay;
      decay *= 0.965;
      uv += delta;
    }
    gl_FragColor = vec4(vec3(illum / 48.0 * 3.0), 1.0);
  }
`;

// ---------- Effets de caméra ----------
const CINEMA_FS = /* glsl */`
  uniform sampler2D tDiffuse, tRays, tMask;
  uniform vec2 sunUv; uniform float sunOn; uniform vec3 sunColor; uniform float aspect;
  uniform float rays, flare, chroma, speed, vignette, grain, rain, flash, time, exposure, saturation;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  vec2 hash2(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }

  // gouttes de pluie sur la verrière : cellules avec une goutte qui glisse
  vec3 drops(vec2 uv) {
    vec2 st = uv * vec2(aspect, 1.0) * 9.0;
    vec2 off = vec2(0.0);
    float wet = 0.0;
    for (int l = 0; l < 2; l++) {
      vec2 g = st * (1.0 + float(l) * 0.7) + vec2(0.0, time * (0.25 + float(l) * 0.15));
      vec2 id = floor(g), f = fract(g) - 0.5;
      vec2 r = hash2(id + float(l) * 17.0);
      if (r.x > 0.55) {
        vec2 c = (r - 0.5) * 0.6;
        c.y += fract(time * 0.1 * (0.5 + r.y) + r.x) * 0.3 - 0.15;
        vec2 dv = (f - c) * vec2(1.0, 0.7);
        float d = length(dv);
        float m = smoothstep(0.16, 0.08, d);
        off += dv * m * 0.6;
        wet += m;
      }
    }
    return vec3(off, wet);
  }

  void main() {
    vec2 uv = vUv;
    vec3 dr = vec3(0.0);
    if (rain > 0.01) { dr = drops(uv) * rain; uv -= dr.xy * 0.035; }
    vec2 fromC = uv - 0.5;
    float edge = dot(fromC, fromC);
    // distorsion de vitesse : léger étirement radial vers les bords
    vec3 col = vec3(0.0);
    if (speed > 0.01) {
      for (int i = 0; i < 6; i++) {
        float k = float(i) / 5.0;
        col += texture2D(tDiffuse, uv - fromC * k * speed * 0.035 * edge * 4.0).rgb;
      }
      col /= 6.0;
    } else col = texture2D(tDiffuse, uv).rgb;
    // aberration chromatique (plus forte sur les bords et à grande vitesse)
    if (chroma > 0.0) {
      vec2 o = fromC * edge * chroma * (1.0 + speed * 3.0) * 4.0;
      col.r = texture2D(tDiffuse, uv + o).r;
      col.b = texture2D(tDiffuse, uv - o).b;
    }
    // rayons du soleil
    col += texture2D(tRays, uv).rgb * sunColor * rays;
    // reflets d'objectif (fantômes, halo, étoile) quand le soleil est visible
    if (flare > 0.0 && sunOn > 0.001) {
      float vis = 0.0;
      for (int i = 0; i < 5; i++) {
        vec2 o = vec2(float(i - 2) * 0.004, float((i * 3) % 5 - 2) * 0.004);
        vis += texture2D(tMask, sunUv + o).r;
      }
      vis = clamp(vis / 5.0 * 2.5, 0.0, 1.0) * sunOn;
      if (vis > 0.001) {
        vec2 axis = vec2(0.5) - sunUv;
        vec3 fl = vec3(0.0);
        for (int i = 0; i < 6; i++) {
          float k = float(i) / 5.0;
          vec2 p = sunUv + axis * (0.45 + k * 1.6);
          float sz = 0.025 + fract(k * 7.31) * 0.07;
          float d = length((uv - p) * vec2(aspect, 1.0));
          vec3 tint = mix(vec3(0.4, 0.7, 1.0), vec3(1.0, 0.6, 0.3), fract(k * 3.7));
          fl += tint * smoothstep(sz, sz * 0.55, d) * 0.12;
        }
        vec2 sd = (uv - sunUv) * vec2(aspect, 1.0);
        float sdl = length(sd);
        float ring = smoothstep(0.03, 0.0, abs(length((uv - 0.5 + axis * 0.2) * vec2(aspect, 1.0)) - 0.42));
        float ang = atan(sd.y, sd.x);
        float star = pow(abs(cos(ang * 3.0)), 60.0) * exp(-sdl * 9.0) * 0.8 + exp(-sdl * 28.0) * 0.6;
        fl += vec3(0.6, 0.75, 1.0) * ring * 0.05 + vec3(1.0, 0.95, 0.85) * star;
        col += fl * sunColor * vis * flare / max(exposure, 0.1) * 0.35;
      }
    }
    // éclair d'orage
    col += vec3(0.75, 0.8, 1.0) * flash / max(exposure, 0.1) * 0.22;
    // verrière mouillée : un peu plus floue et plus claire
    col = mix(col, col * 1.05 + 0.02 / max(exposure, 0.1), clamp(dr.z, 0.0, 1.0) * 0.3);
    // étalonnage : couleurs un peu plus franches
    float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = max(mix(vec3(lum), col, saturation), 0.0);
    // vignette et grain
    col *= 1.0 - vignette * smoothstep(0.15, 0.75, edge * 2.0);
    col *= 1.0 + (hash(vUv * 1000.0 + time) - 0.5) * grain;
    gl_FragColor = vec4(col, 1.0);
  }
`;

// marqueurs (non tonemappés) : passent en sRGB et se posent sur l'image finale
const OVERLAY_FS = /* glsl */`
  uniform sampler2D tDiffuse, tOverlay;
  varying vec2 vUv;
  vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
  void main() {
    vec4 base = texture2D(tDiffuse, vUv);
    vec4 o = texture2D(tOverlay, vUv);
    gl_FragColor = vec4(mix(base.rgb, toSRGB(clamp(o.rgb / max(o.a, 1e-4), 0.0, 1.0)), o.a), 1.0);
  }
`;

function quadMat(fs, uniforms) {
  return new THREE.ShaderMaterial({ vertexShader: QUAD_VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false });
}

// Rend la scène (HDR, MSAA, profondeur), l'occlusion ambiante et le masque des rayons du soleil
class ScenePass extends Pass {
  constructor(scene, camera) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.needsSwap = true;
    this.samples = 4;
    this.useAO = false;
    this.useRays = false;
    this.makeTargets(1, 1);
    const kernel = [];
    for (let i = 0; i < 12; i++) {
      const v = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 0.85 + 0.15).normalize();
      const s = i / 12;
      kernel.push(v.multiplyScalar(0.25 + 0.75 * s * s));
    }
    this.ssao = new FullScreenQuad(quadMat(SSAO_FS, {
      tDepth: { value: null }, projInv: { value: new THREE.Matrix4() }, proj: { value: new THREE.Matrix4() },
      kernel: { value: kernel }, strength: { value: 1.25 },
    }));
    this.compose = new FullScreenQuad(quadMat(COMPOSE_FS, {
      tColor: { value: null }, tAO: { value: null }, tDepth: { value: null }, aoTexel: { value: new THREE.Vector2() }, useAO: { value: 0 },
    }));
    this.rayMask = new FullScreenQuad(quadMat(RAYMASK_FS, {
      tColor: { value: null }, tDepth: { value: null }, sunUv: { value: new THREE.Vector2() }, aspect: { value: 1 }, exposure: { value: 1 },
    }));
    this.rayBlur = new FullScreenQuad(quadMat(RAYBLUR_FS, { tMask: { value: null }, sunUv: { value: new THREE.Vector2() } }));
  }

  makeTargets(w, h) {
    this.sceneRT?.dispose();
    this.sceneRT = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: this.samples });
    this.sceneRT.depthTexture = new THREE.DepthTexture(w, h, THREE.FloatType);
    const hw = Math.max(1, Math.floor(w / 2)), hh = Math.max(1, Math.floor(h / 2));
    this.aoRT?.dispose();
    this.aoRT = new THREE.WebGLRenderTarget(hw, hh, { type: THREE.UnsignedByteType, depthBuffer: false });
    this.maskRT?.dispose();
    this.maskRT = new THREE.WebGLRenderTarget(hw, hh, { type: THREE.HalfFloatType, depthBuffer: false });
    this.raysRT?.dispose();
    this.raysRT = new THREE.WebGLRenderTarget(hw, hh, { type: THREE.HalfFloatType, depthBuffer: false });
    // marqueurs : même profondeur que la scène (test de profondeur correct)
    this.overlayRT?.dispose();
    this.overlayRT = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: true });
    this.overlayRT.depthTexture = this.sceneRT.depthTexture;
    this.size = [w, h];
  }

  setSize(w, h) { this.makeTargets(w, h); }

  setSamples(n) {
    if (n === this.samples) return;
    this.samples = n;
    this.makeTargets(...this.size);
  }

  render(renderer, writeBuffer) {
    const cam = this.camera;
    cam.layers.disable(OVERLAY_LAYER);
    renderer.setRenderTarget(this.sceneRT);
    renderer.clear();
    renderer.render(this.scene, cam);
    cam.layers.enable(OVERLAY_LAYER);
    const depth = this.sceneRT.depthTexture;
    if (this.useAO) {
      const u = this.ssao.material.uniforms;
      u.tDepth.value = depth;
      u.proj.value.copy(cam.projectionMatrix);
      u.projInv.value.copy(cam.projectionMatrixInverse);
      renderer.setRenderTarget(this.aoRT);
      this.ssao.render(renderer);
    }
    if (this.useRays) {
      const m = this.rayMask.material.uniforms;
      m.tColor.value = this.sceneRT.texture;
      m.tDepth.value = depth;
      renderer.setRenderTarget(this.maskRT);
      this.rayMask.render(renderer);
      this.rayBlur.material.uniforms.tMask.value = this.maskRT.texture;
      renderer.setRenderTarget(this.raysRT);
      this.rayBlur.render(renderer);
    }
    const c = this.compose.material.uniforms;
    c.tColor.value = this.sceneRT.texture;
    c.tAO.value = this.aoRT.texture;
    c.tDepth.value = depth;
    c.useAO.value = this.useAO ? 1 : 0;
    c.aoTexel.value.set(1 / this.aoRT.width, 1 / this.aoRT.height);
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.compose.render(renderer);
  }

  // objets non tonemappés, testés contre la profondeur de la scène
  renderOverlay(renderer) {
    const cam = this.camera;
    const mask = cam.layers.mask;
    cam.layers.set(OVERLAY_LAYER);
    const bg = this.scene.background;
    this.scene.background = null;
    renderer.setRenderTarget(this.overlayRT);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, false, false);
    const auto = renderer.autoClear;
    renderer.autoClear = false;
    const shadow = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.render(this.scene, cam);
    renderer.shadowMap.autoUpdate = shadow;
    renderer.autoClear = auto;
    renderer.setClearColor(0x000000, 1);
    this.scene.background = bg;
    cam.layers.mask = mask;
  }
}

class ShaderStep extends Pass {
  constructor(fs, uniforms) {
    super();
    this.quad = new FullScreenQuad(quadMat(fs, uniforms));
    this.uniforms = this.quad.material.uniforms;
    this.before = null;
  }
  render(renderer, writeBuffer, readBuffer) {
    this.before?.(renderer);
    this.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
}

export class PostFX {
  constructor(renderer, scene, camera, atmo) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.atmo = atmo;
    this.time = 0;
    this.composer = new EffectComposer(renderer);
    this.scenePass = new ScenePass(scene, camera);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), ART.bloomStrength, ART.bloomRadius, 4);
    this.cinema = new ShaderStep(CINEMA_FS, {
      tDiffuse: { value: null }, tRays: { value: this.scenePass.raysRT.texture }, tMask: { value: this.scenePass.maskRT.texture },
      sunUv: { value: new THREE.Vector2() }, sunOn: { value: 0 }, sunColor: { value: new THREE.Color() }, aspect: { value: 1 },
      rays: { value: 0 }, flare: { value: 0 }, chroma: { value: 0 }, speed: { value: 0 }, vignette: { value: ART.vignette },
      grain: { value: ART.grain }, saturation: { value: ART.saturation }, rain: { value: 0 }, flash: { value: 0 }, time: { value: 0 }, exposure: { value: 1 },
    });
    this.output = new OutputPass();
    this.smaa = new SMAAPass(1, 1);
    this.overlay = new ShaderStep(OVERLAY_FS, { tDiffuse: { value: null }, tOverlay: { value: this.scenePass.overlayRT.texture } });
    this.overlay.before = (r) => this.scenePass.renderOverlay(r);
    for (const p of [this.scenePass, this.bloom, this.cinema, this.output, this.smaa, this.overlay]) this.composer.addPass(p);
    this.sunV = new THREE.Vector3();
  }

  setSize(w, h, pr) {
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    // les cibles internes changent : on rebranche leurs textures
    const sp = this.scenePass;
    this.cinema.uniforms.tRays.value = sp.raysRT.texture;
    this.cinema.uniforms.tMask.value = sp.maskRT.texture;
    this.overlay.uniforms.tOverlay.value = sp.overlayRT.texture;
    this.bloom.setSize(Math.round(w * pr / 2), Math.round(h * pr / 2));
  }

  configure(cfg) {
    this.cfg = cfg;
    this.scenePass.setSamples(cfg.msaa);
    this.setSize(innerWidth, innerHeight, this.renderer.getPixelRatio());
    this.scenePass.useAO = cfg.ao;
    this.scenePass.ssao.material.uniforms.strength.value = 1.25;
    this.scenePass.useRays = cfg.godrays;
    this.bloom.enabled = cfg.bloom;
    this.smaa.enabled = cfg.msaa === 0;
  }

  // fx : { speed 0..1, rain 0..1 (gouttes sur la verrière), flash 0..1 }
  render(dt, fx = {}) {
    this.time += dt;
    const cam = this.camera;
    const atmo = this.atmo;
    const exposure = this.renderer.toneMappingExposure;
    // position du soleil à l'écran
    this.sunV.copy(atmo.sunDir).multiplyScalar(10000).add(cam.position).project(cam);
    const inFront = this.sunV.z < 1 && atmo.sunDir.y > -0.02;
    const sunUv = new THREE.Vector2(this.sunV.x * 0.5 + 0.5, this.sunV.y * 0.5 + 0.5);
    const onScreen = inFront ? Math.max(0, 1 - Math.max(Math.abs(this.sunV.x), Math.abs(this.sunV.y)) * 0.6) : 0;
    const day = 1 - atmo.night;
    const sp = this.scenePass;
    sp.rayMask.material.uniforms.sunUv.value.copy(sunUv);
    sp.rayMask.material.uniforms.aspect.value = cam.aspect;
    sp.rayMask.material.uniforms.exposure.value = exposure;
    sp.rayBlur.material.uniforms.sunUv.value.copy(sunUv);
    sp.useRays = this.cfg.godrays && inFront && day > 0.05;
    const u = this.cinema.uniforms;
    u.sunUv.value.copy(sunUv);
    u.sunOn.value = onScreen * day;
    u.sunColor.value.copy(atmo.sun.color).multiplyScalar(1 / Math.max(exposure, 0.1) * 0.5);
    u.aspect.value = cam.aspect;
    u.rays.value = sp.useRays ? ART.godraysStrength * onScreen : 0;
    u.flare.value = this.cfg.godrays ? ART.flareStrength : 0;
    u.chroma.value = this.cfg.chroma ? ART.chromaStrength : 0;
    u.speed.value = this.cfg.motionFx ? (fx.speed || 0) : 0;
    u.rain.value = fx.rain || 0;
    u.flash.value = fx.flash || 0;
    u.time.value = this.time;
    u.exposure.value = exposure;
    this.bloom.threshold = ART.bloomThreshold / exposure;
    this.composer.render(dt);
  }
}
