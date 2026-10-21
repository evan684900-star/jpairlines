// Eau : matériau PBR (reflets du ciel et du soleil), vagues de Gerstner sur une grille radiale
// centrée sur la caméra, couleur selon la profondeur, transparence près des côtes, écume sur les
// rivages et la crête des vagues. La profondeur vient d'une « photo » du relief vu du dessus (GPU).
import * as THREE from 'three';
import { TEX } from './textures.js';
import { injectShared, U } from './shared.js';
import { HEIGHT_GLSL } from './heightmap.js';
import { TERRAIN_LAYER } from '../terrain.js';

const MAX_R = 60000;

// Grille en anneaux : très fine sous la caméra, grossière au loin
function radialGrid(rings, segs) {
  const pos = [0, 0, 0];
  for (let i = 1; i <= rings; i++) {
    const r = MAX_R * Math.pow(i / rings, 3.2);
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      pos.push(Math.cos(a) * r, 0, Math.sin(a) * r);
    }
  }
  const idx = [];
  for (let j = 0; j < segs; j++) idx.push(0, 1 + ((j + 1) % segs), 1 + j);
  for (let i = 1; i < rings; i++) {
    const a0 = 1 + (i - 1) * segs, b0 = 1 + i * segs;
    for (let j = 0; j < segs; j++) {
      const j1 = (j + 1) % segs;
      idx.push(a0 + j, a0 + j1, b0 + j, a0 + j1, b0 + j1, b0 + j);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, k) => (k % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(idx);
  return g;
}

// Photo du relief autour de la caméra : hauteur du sol (m) dans le canal R
class ShoreCapture {
  constructor(renderer, scene, size) {
    this.renderer = renderer;
    this.scene = scene;
    this.R = 3200;
    this.rt = new THREE.WebGLRenderTarget(size, size, { type: THREE.HalfFloatType, depthBuffer: true });
    this.rt.texture.minFilter = this.rt.texture.magFilter = THREE.LinearFilter;
    this.cam = new THREE.OrthographicCamera(-this.R, this.R, this.R, -this.R, 10, 12000);
    this.cam.up.set(0, 0, -1);
    this.cam.layers.set(TERRAIN_LAYER);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: 'varying float vH; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vH = w.y; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: 'varying float vH; void main() { gl_FragColor = vec4(vH, 0.0, 0.0, 1.0); }',
    });
    this.center = new THREE.Vector2(1e9, 1e9);
    this.version = -1;
    this.timer = 0;
    this.clear = new THREE.Color(-500, 0, 0);
  }

  update(dt, cam, terrainVersion) {
    this.timer -= dt;
    const moved = Math.hypot(cam.x - this.center.x, cam.z - this.center.y) > this.R * 0.3;
    if (!(moved || (terrainVersion !== this.version && this.timer <= 0))) return;
    this.timer = 1;
    this.version = terrainVersion;
    const snap = 200;
    this.center.set(Math.round(cam.x / snap) * snap, Math.round(cam.z / snap) * snap);
    this.cam.position.set(this.center.x, 6000, this.center.y);
    this.cam.lookAt(this.center.x, 0, this.center.y);
    this.cam.updateMatrixWorld();
    const r = this.renderer;
    const prevTarget = r.getRenderTarget(), prevClear = r.getClearColor(new THREE.Color()), prevAlpha = r.getClearAlpha();
    const prevAuto = r.shadowMap.autoUpdate, prevBg = this.scene.background, prevFog = this.scene.fog, prevOverride = this.scene.overrideMaterial;
    r.shadowMap.autoUpdate = false;
    this.scene.background = null;
    this.scene.fog = null;
    this.scene.overrideMaterial = this.mat;
    r.setRenderTarget(this.rt);
    r.setClearColor(this.clear, 1);
    r.clear();
    r.render(this.scene, this.cam);
    r.setRenderTarget(prevTarget);
    r.setClearColor(prevClear, prevAlpha);
    r.shadowMap.autoUpdate = prevAuto;
    this.scene.background = prevBg;
    this.scene.fog = prevFog;
    this.scene.overrideMaterial = prevOverride;
  }
}

export class Water {
  constructor(renderer, scene, worldHeight, rings = 56) {
    this.scene = scene;
    this.shore = new ShoreCapture(renderer, scene, 1024);
    this.uniforms = {
      tNormal: { value: TEX.waterNormal },
      tDetail: { value: TEX.detail },
      tShore: { value: this.shore.rt.texture },
      shoreCenter: { value: this.shore.center },
      shoreR: { value: this.shore.R },
      jpWorldHeight: { value: worldHeight },
      waveAmp: { value: 0.6 },
      waveDir: { value: new THREE.Vector2(1, 0.3).normalize() },
      shallowColor: { value: new THREE.Color(0.05, 0.34, 0.33) },
      deepColor: { value: new THREE.Color(0.006, 0.04, 0.07) },
    };
    this.material = this.createMaterial();
    this.mesh = new THREE.Mesh(radialGrid(rings, 128), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.receiveShadow = true;
    this.mesh.position.y = 0.4;
    scene.add(this.mesh);
  }

  setRings(rings) {
    this.mesh.geometry.dispose();
    this.mesh.geometry = radialGrid(rings, 128);
  }

  createMaterial() {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.06, metalness: 0, transparent: true, depthWrite: true });
    const U2 = this.uniforms;
    // vagues de Gerstner : direction (angle relatif au vent), longueur d'onde (m), cambrure
    const WAVES = [[0.0, 62, 0.32], [0.55, 33, 0.28], [-0.7, 19, 0.24], [1.6, 9.5, 0.18], [-1.9, 5.3, 0.14]];
    // hauteur cumulée des vagues (m) pour une amplitude de 1 : sert à les limiter en eau peu profonde
    const WAVE_SUM = WAVES.reduce((n, [, L, q]) => n + (L / (2 * Math.PI)) * q, 0).toFixed(3);
    const waveGLSL = WAVES.map(([a, L, q]) => `jpWave(p, rot(waveDir, ${a.toFixed(2)}), ${L.toFixed(1)}, ${q.toFixed(2)}, amp, sp, P, N, J);`).join('\n');
    mat.onBeforeCompile = (shader) => {
      injectShared(shader);
      Object.assign(shader.uniforms, U2);
      const common = /* glsl */`
        uniform sampler2D tShore; uniform vec2 shoreCenter; uniform float shoreR;
        uniform float waveAmp; uniform vec2 waveDir; uniform float jpTime;
        ${HEIGHT_GLSL}
        // hauteur du fond (m) et précision (1 = photo du relief près de la caméra, 0 = carte globale grossière)
        vec2 jpGround(vec2 xz) {
          vec2 uv = vec2(0.5 + (xz.x - shoreCenter.x) / (2.0 * shoreR), 0.5 + (shoreCenter.y - xz.y) / (2.0 * shoreR));
          float far = jpTerrainH(xz);
          vec2 e = min(uv, 1.0 - uv);
          float inside = smoothstep(0.02, 0.12, min(e.x, e.y));
          if (inside <= 0.0) return vec2(far, 0.0);
          float near = texture2D(tShore, uv).r;
          return near < -400.0 ? vec2(far, 0.0) : vec2(mix(far, near, inside), inside);
        }
        vec2 rot(vec2 d, float a) { float c = cos(a), s = sin(a); return vec2(d.x * c - d.y * s, d.x * s + d.y * c); }
        // sp : écart entre les sommets de la grille ici. Une vague plus courte que 4 écarts ne peut pas être dessinée :
        // ses normales par sommet tomberaient au hasard et feraient des triangles sombres dans le reflet du ciel
        void jpWave(vec2 p, vec2 d, float L, float q, float amp, float sp, inout vec3 P, inout vec3 N, inout float J) {
          amp *= smoothstep(4.0, 8.0, L / sp);
          if (amp < 0.001) return;
          float k = 6.2832 / L;
          float c = sqrt(9.81 / k);
          float A = q / k * amp;
          float th = k * dot(d, p) - c * k * jpTime;
          float s = sin(th), co = cos(th);
          P += vec3(d.x * q * A * co, A * s, d.y * q * A * co);
          N += vec3(-d.x * k * A * co, -q * k * A * s, -d.y * k * A * co);
          J -= q * k * A * s;
        }
      `;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${common}\nvarying vec3 vWW; varying float vCrest;`)
        .replace('#include <beginnormal_vertex>', /* glsl */`
          vec3 jpP = vec3(0.0); vec3 jpN = vec3(0.0, 1.0, 0.0); float jpJ = 1.0;
          {
            vec2 p = (modelMatrix * vec4(position, 1.0)).xz;
            float depth = max(0.0, -jpGround(p).x);
            float dcam = length(p - cameraPosition.xz);
            // les vagues s'aplatissent quand le fond est proche (lacs, bords de plage) : leur creux ne doit jamais
            // descendre sous le fond (sinon le fond apparaît par taches sombres au milieu de l'eau)
            float amp = min(waveAmp, depth * 0.12 / ${WAVE_SUM}) * smoothstep(2.0, 20.0, depth) * (1.0 - smoothstep(600.0, 3500.0, dcam));
            vec3 P = vec3(0.0), N = vec3(0.0, 1.0, 0.0); float J = 1.0;
            float sp = max(0.5, dcam * 0.05); // la grille est radiale : 128 sommets par cercle
            if (amp > 0.001) { ${waveGLSL} }
            jpP = P; jpN = normalize(N); jpJ = J;
          }
          vec3 objectNormal = jpN;
          #ifdef USE_TANGENT
            vec3 objectTangent = vec3( tangent.xyz );
          #endif
        `)
        .replace('#include <begin_vertex>', /* glsl */`
          vec3 transformed = position + jpP;
          vWW = (modelMatrix * vec4(transformed, 1.0)).xyz;
          vCrest = clamp(1.0 - jpJ, 0.0, 1.0);
        `);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', /* glsl */`#include <common>
          ${common}
          uniform sampler2D tNormal; uniform sampler2D tDetail; uniform vec3 shallowColor, deepColor;
          uniform float jpNight; uniform float jpWet;
          varying vec3 vWW; varying float vCrest;
          float jpFoam;`)
        .replace('#include <color_fragment>', /* glsl */`
          #include <color_fragment>
          {
            // profondeur au pixel (et non par sommet : la grille est grossière au loin)
            vec2 gr = jpGround(vWW.xz);
            float depth = max(0.0, -gr.x);
            float vAccurate = gr.y;
            float dist = length(cameraPosition - vWW);
            // couleur selon la profondeur : turquoise près des côtes, bleu nuit au large
            float deep = 1.0 - exp(-depth / 7.0);
            vec3 water = mix(shallowColor, deepColor, deep);
            // écume : bord de plage (bande animée) + crêtes des vagues
            vec2 fuv = vWW.xz / 7.0;
            float n1 = texture2D(tDetail, fuv + vec2(jpTime * 0.02, 0.0)).r;
            float n2 = texture2D(tDetail, fuv * 0.37 - vec2(0.0, jpTime * 0.015)).g;
            float band = sin(depth * 2.6 - jpTime * 1.4 + n2 * 6.0) * 0.5 + 0.5;
            float shore = (1.0 - smoothstep(0.0, 2.2, depth)) * (0.55 + 0.45 * band) * vAccurate;
            float crest = smoothstep(0.35, 0.8, vCrest);
            jpFoam = clamp((shore + crest * 0.8) * smoothstep(0.25, 0.75, n1 * 0.6 + n2 * 0.6), 0.0, 1.0);
            jpFoam *= 1.0 - smoothstep(1500.0, 5000.0, dist);
            diffuseColor.rgb = mix(water, vec3(0.92, 0.95, 0.97), jpFoam);
            // transparence seulement là où la profondeur est connue précisément (sinon taches sombres au large)
            diffuseColor.a = mix(mix(1.0, mix(0.25, 0.97, smoothstep(0.0, 9.0, depth)), vAccurate), 1.0, jpFoam);
          }
        `)
        .replace('#include <roughnessmap_fragment>', /* glsl */`
          #include <roughnessmap_fragment>
          roughnessFactor = mix(0.05, 0.16, smoothstep(400.0, 9000.0, length(cameraPosition - vWW))) + jpWet * 0.06;
          roughnessFactor = mix(roughnessFactor, 0.7, jpFoam);
        `)
        .replace('#include <normal_fragment_begin>', /* glsl */`
          #include <normal_fragment_begin>
          {
            float dist = length(cameraPosition - vWW);
            vec2 p = vWW.xz;
            vec3 a = texture2D(tNormal, p / 41.0 + jpTime * vec2(0.011, 0.007)).xyz * 2.0 - 1.0;
            vec3 b = texture2D(tNormal, p / 13.0 + jpTime * vec2(-0.015, 0.013)).xyz * 2.0 - 1.0;
            vec3 c = texture2D(tNormal, p / 330.0 + jpTime * vec2(0.002, -0.003)).xyz * 2.0 - 1.0;
            float near = 1.0 - smoothstep(300.0, 4000.0, dist);
            vec2 slope = (a.xy + b.xy * 0.7) * near * 0.35 + c.xy * 0.22;
            vec3 nw = normalize(normalize((vec4(normal, 0.0) * viewMatrix).xyz) + vec3(slope.x, 0.0, slope.y));
            normal = normalize((viewMatrix * vec4(nw, 0.0)).xyz);
            // vu en rasant, une pente de vague ne doit jamais tourner le dos à la caméra : sinon son reflet
            // part vers le sol et fait des taches sombres au loin
            vec3 jpV = normalize(vViewPosition);
            float jpNV = dot(normal, jpV);
            if (jpNV < 0.12) normal = normalize(normal + jpV * (0.12 - jpNV));
          }
        `)
        .replace('#include <opaque_fragment>', /* glsl */`
          // les reflets restent visibles même là où l'eau est transparente (Fresnel)
          float jpFres = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 5.0);
          float jpSpec = clamp(dot(reflectedLight.directSpecular + reflectedLight.indirectSpecular, vec3(0.33)), 0.0, 1.0);
          gl_FragColor = vec4(outgoingLight, clamp(diffuseColor.a + jpFres * 0.8 + jpSpec, 0.0, 1.0));
        `);
    };
    return mat;
  }

  // weather : vent (m/s) ; windDir : direction (radians)
  update(dt, camera, weather, windDir, terrainVersion) {
    this.shore.update(dt, camera.position, terrainVersion);
    // la grille suit la caméra, alignée sur 2 m pour éviter que les vagues « glissent »
    this.mesh.position.x = Math.round(camera.position.x / 2) * 2;
    this.mesh.position.z = Math.round(camera.position.z / 2) * 2;
    const wind = weather.wind;
    this.uniforms.waveAmp.value += (Math.min(1.6, 0.35 + wind / 10) - this.uniforms.waveAmp.value) * Math.min(1, dt);
    this.uniforms.waveDir.value.set(Math.cos(windDir), Math.sin(windDir));
    // de nuit l'eau est plus sombre
    const k = 1 - U.jpNight.value * 0.6;
    this.uniforms.shallowColor.value.setRGB(0.05 * k, 0.34 * k, 0.33 * k);
  }
}
