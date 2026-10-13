// Rendu réaliste : ciel atmosphérique, textures procédurales, eau, nuages, lumière du jour.
// Tout est généré par le code (aucune image à télécharger).
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { WORLD, rng } from './world.js';

// ================= Textures procédurales (bouclables) =================
const fade = (t) => t * t * (3 - 2 * t);

function tileNoise(size, period, octaves, seed, ridged = false) {
  const out = new Float32Array(size * size);
  let amp = 1, norm = 0, p = period;
  for (let o = 0; o < octaves; o++, amp *= 0.5, p *= 2) {
    const r = rng(seed + o * 1013);
    const lat = new Float32Array(p * p);
    for (let i = 0; i < lat.length; i++) lat[i] = r();
    for (let y = 0; y < size; y++) {
      const fy = (y / size) * p, iy = Math.floor(fy), ty = fade(fy - iy);
      const y0 = iy % p, y1 = (iy + 1) % p;
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * p, ix = Math.floor(fx), tx = fade(fx - ix);
        const x0 = ix % p, x1 = (ix + 1) % p;
        const a = lat[y0 * p + x0], b = lat[y0 * p + x1], c = lat[y1 * p + x0], d = lat[y1 * p + x1];
        let v = a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
        if (ridged) v = 1 - Math.abs(v * 2 - 1);
        out[y * size + x] += v * amp;
      }
    }
    norm += amp;
  }
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}

function contrast(arr, k) {
  let min = Infinity, max = -Infinity;
  for (const v of arr) { if (v < min) min = v; if (v > max) max = v; }
  for (let i = 0; i < arr.length; i++) arr[i] = Math.min(1, Math.max(0, ((arr[i] - min) / (max - min) - 0.5) * k + 0.5));
  return arr;
}

function dataTexture(size, r, g, b, a, srgb = false) {
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = r[i] * 255; data[i * 4 + 1] = g[i] * 255; data[i * 4 + 2] = b[i] * 255; data[i * 4 + 3] = a ? a[i] * 255 : 255;
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

function normalTexture(size, h, strength) {
  const r = new Float32Array(size * size), g = new Float32Array(size * size), b = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const dx = (h[y * size + ((x + 1) % size)] - h[y * size + ((x - 1 + size) % size)]) * strength;
      const dy = (h[((y + 1) % size) * size + x] - h[((y - 1 + size) % size) * size + x]) * strength;
      const len = Math.hypot(dx, dy, 1);
      r[i] = (-dx / len) * 0.5 + 0.5; g[i] = (-dy / len) * 0.5 + 0.5; b[i] = (1 / len) * 0.5 + 0.5;
    }
  }
  return dataTexture(size, r, g, b);
}

export const TEX = {};
export function buildTextures() {
  const S = 256;
  // détail du sol : R = grain fin, G = taches, B = relief
  const fine = contrast(tileNoise(S, 16, 4, 11), 1.6);
  const blot = contrast(tileNoise(S, 4, 4, 12), 1.4);
  const bump = tileNoise(S, 8, 5, 13);
  TEX.detail = dataTexture(S, fine, blot, bump);
  // roche : R = strates/fissures, G = grain, B = relief
  const ridge = contrast(tileNoise(S, 6, 5, 21, true), 1.5);
  const grain = contrast(tileNoise(S, 32, 3, 22), 1.3);
  TEX.rock = dataTexture(S, ridge, grain, ridge);
  // eau : carte de normales
  TEX.waterNormal = normalTexture(S, tileNoise(S, 8, 5, 31), 6);
  // bouffée de nuage
  TEX.puff = cloudPuffTexture();
}

function cloudPuffTexture() {
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const r = rng(77);
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2, d = r() * S * 0.22;
    const x = S / 2 + Math.cos(a) * d, y = S / 2 + Math.sin(a) * d * 0.8;
    const rad = S * (0.12 + r() * 0.2);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ================= Injection de shaders dans les matériaux standard =================
const WORLD_VARYINGS_VS = /* glsl */`
  vec4 jpWP = vec4(transformed, 1.0);
  vec3 jpWN = objectNormal;
  #ifdef USE_INSTANCING
    jpWP = instanceMatrix * jpWP;
    jpWN = mat3(instanceMatrix) * jpWN;
  #endif
  vWPos = (modelMatrix * jpWP).xyz;
  vWNormal = normalize(mat3(modelMatrix) * jpWN);
`;
function injectWorld(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNormal;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + WORLD_VARYINGS_VS);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNormal;');
}

const BUMP_GLSL = /* glsl */`
  vec3 jpBump(vec3 n, float h, float scale) {
    vec2 dH = vec2(dFdx(h), dFdy(h)) * scale;
    vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);
    vec3 r1 = cross(sy, n), r2 = cross(n, sx);
    float det = dot(sx, r1);
    vec3 grad = sign(det) * (dH.x * r1 + dH.y * r2);
    return normalize(abs(det) * n - grad);
  }
`;

// ---------- Terrain ----------
export function createTerrainMaterial() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.tDetail = { value: TEX.detail };
    shader.uniforms.tRock = { value: TEX.rock };
    injectWorld(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tDetail;\nuniform sampler2D tRock;\nfloat jpH;\n' + BUMP_GLSL)
      .replace('#include <color_fragment>', /* glsl */`
        #include <color_fragment>
        {
          vec3 n = normalize(vWNormal);
          float dist = length(vViewPosition);
          float near = 1.0 - smoothstep(600.0, 5000.0, dist);
          vec4 d0 = texture2D(tDetail, vWPos.xz / 2.3);
          vec4 d1 = texture2D(tDetail, vWPos.xz / 9.0);
          float close = 1.0 - smoothstep(30.0, 250.0, dist);
          vec4 d2 = texture2D(tDetail, vWPos.xz / 70.0);
          vec4 d3 = texture2D(tDetail, vWPos.xz / 900.0);
          // variations de couleur à grande échelle (prairies, sols)
          float macro = d3.g;
          vec3 base = diffuseColor.rgb * mix(0.78, 1.18, macro);
          base = mix(base, base * vec3(1.08, 1.0, 0.82), smoothstep(0.55, 0.85, d2.g) * 0.6);
          float grain = mix(mix(d2.r, d1.r, near), d0.r * 0.6 + d1.r * 0.4, close);
          base *= mix(0.86, 1.12, grain);
          // roche en triplanaire sur les pentes
          vec3 bw = pow(abs(n), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
          vec4 rx = texture2D(tRock, vWPos.zy / 40.0), ry = texture2D(tRock, vWPos.xz / 40.0), rz = texture2D(tRock, vWPos.xy / 40.0);
          vec4 rk = rx * bw.x + ry * bw.y + rz * bw.z;
          float slope = 1.0 - n.y;
          float rockW = smoothstep(0.28, 0.5, slope + (d2.g - 0.5) * 0.15);
          vec3 rockCol = mix(vec3(0.33, 0.31, 0.29), vec3(0.55, 0.52, 0.48), rk.r) * mix(0.85, 1.1, rk.g);
          // la neige reste sur les pentes douces
          float isSnow = step(0.6, diffuseColor.r) * step(0.6, diffuseColor.b);
          base = mix(base, diffuseColor.rgb * mix(0.94, 1.03, d2.g), isSnow);
          rockW *= 1.0 - isSnow * (1.0 - smoothstep(0.5, 0.75, slope));
          diffuseColor.rgb = mix(base, rockCol, rockW);
          jpH = mix(mix(mix(d2.b, d1.b, near * 0.7), d0.b, close * 0.6), rk.r, rockW) * (1.0 - isSnow * 0.7);
        }
      `)
      .replace('#include <normal_fragment_begin>', /* glsl */`
        #include <normal_fragment_begin>
        normal = jpBump(normal, jpH, mix(0.6, 0.12, smoothstep(50.0, 3000.0, length(vViewPosition))));
      `);
  };
  return mat;
}

// ---------- Bâtiments avec fenêtres ----------
export function createBuildingMaterial({ floor = 3.4, bay = 3.2, glass = 0.55 } = {}) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0.05 });
  mat.onBeforeCompile = (shader) => {
    injectWorld(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nfloat jpWin;\nfloat jpHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }')
      .replace('#include <color_fragment>', /* glsl */`
        #include <color_fragment>
        {
          vec3 n = normalize(vWNormal);
          jpWin = 0.0;
          if (n.y > 0.7) {
            diffuseColor.rgb *= 0.55; // toit
          } else if (abs(n.y) < 0.3) {
            float u = abs(n.x) > abs(n.z) ? vWPos.z : vWPos.x;
            vec2 cell = vec2(u / ${bay.toFixed(2)}, vWPos.y / ${floor.toFixed(2)});
            vec2 f = fract(cell);
            float w = step(0.18, f.x) * step(f.x, 0.82) * step(0.28, f.y) * step(f.y, 0.86);
            float rnd = jpHash(floor(cell) + floor(vWPos.xz / 50.0));
            w *= step(${(1 - glass).toFixed(2)}, rnd + 0.4);
            jpWin = w;
            vec3 glassCol = mix(vec3(0.07, 0.09, 0.12), vec3(0.32, 0.38, 0.45), rnd);
            diffuseColor.rgb = mix(diffuseColor.rgb * (0.92 + rnd * 0.1), glassCol, w);
          }
        }
      `)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.08, jpWin);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.6, jpWin);');
  };
  return mat;
}

// ================= Eau =================
export function createWaterMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      time: { value: 0 },
      tNormal: { value: null },
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      sunColor: { value: new THREE.Color(1, 1, 1) },
      skyZenith: { value: new THREE.Color(0.2, 0.4, 0.8) },
      skyHorizon: { value: new THREE.Color(0.7, 0.8, 0.9) },
      deepColor: { value: new THREE.Color(0.012, 0.06, 0.09) },
      shallowColor: { value: new THREE.Color(0.03, 0.2, 0.22) },
    }]),
    vertexShader: /* glsl */`
      #include <common>
      #include <fog_pars_vertex>
      varying vec3 vWPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWPos = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */`
      #include <common>
      #include <fog_pars_fragment>
      uniform float time;
      uniform sampler2D tNormal;
      uniform vec3 sunDir, sunColor, skyZenith, skyHorizon, deepColor, shallowColor;
      varying vec3 vWPos;
      vec3 sampleN(vec2 uv) { return texture2D(tNormal, uv).xyz * 2.0 - 1.0; }
      void main() {
        vec2 p = vWPos.xz;
        float dist = length(cameraPosition - vWPos);
        vec3 n1 = sampleN(p / 38.0 + time * vec2(0.012, 0.008));
        vec3 n2 = sampleN(p / 17.0 + time * vec2(-0.01, 0.015));
        vec3 n3 = sampleN(p / 260.0 + time * vec2(0.003, -0.002));
        vec2 slope = (n1.xy + n2.xy * 0.6) * (1.0 - smoothstep(800.0, 6000.0, dist)) + n3.xy * 0.8;
        vec3 n = normalize(vec3(slope.x * 0.35, 1.0, slope.y * 0.35));
        vec3 v = normalize(cameraPosition - vWPos);
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
        vec3 r = reflect(-v, n);
        r.y = abs(r.y);
        vec3 sky = mix(skyHorizon, skyZenith, pow(clamp(r.y, 0.0, 1.0), 0.45));
        float sun = pow(max(dot(r, sunDir), 0.0), 900.0) * 60.0 + pow(max(dot(r, sunDir), 0.0), 60.0) * 0.4;
        vec3 body = mix(shallowColor, deepColor, clamp(dist / 4000.0 + 0.4, 0.0, 1.0)) * (0.4 + 0.6 * max(sunDir.y, 0.1));
        vec3 col = mix(body, sky, fres) + sunColor * sun;
        float alpha = mix(0.82, 1.0, clamp(fres * 2.5 + dist / 3000.0, 0.0, 1.0));
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
}

// ================= Nuages (panneaux toujours face à la caméra) =================
export function createClouds(count = 520) {
  const r = rng(99);
  const puffs = [];
  for (let c = 0; c < count; c++) {
    const cx = (r() - 0.5) * WORLD.size * 1.2, cz = (r() - 0.5) * WORLD.size * 1.2;
    const cy = 1500 + r() * 1600;
    const big = 0.8 + r() * 1.6;
    const n = 12 + Math.floor(r() * 14);
    for (let j = 0; j < n; j++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 420 * big;
      const dy = (r() - 0.3) * 120 * big;
      puffs.push([cx + Math.cos(a) * d * 1.5, cy + dy, cz + Math.sin(a) * d, (300 + r() * 350) * big, 0.5 + 0.5 * (dy / (120 * big) + 0.3)]);
    }
  }
  const base = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute('position', base.attributes.position);
  geo.setAttribute('uv', base.attributes.uv);
  const pos = new Float32Array(puffs.length * 3), size = new Float32Array(puffs.length), shade = new Float32Array(puffs.length);
  puffs.forEach((p, i) => { pos.set(p.slice(0, 3), i * 3); size[i] = p[3]; shade[i] = Math.min(1, Math.max(0, p[4])); });
  geo.setAttribute('iPos', new THREE.InstancedBufferAttribute(pos, 3));
  geo.setAttribute('iSize', new THREE.InstancedBufferAttribute(size, 1));
  geo.setAttribute('iShade', new THREE.InstancedBufferAttribute(shade, 1));
  geo.instanceCount = puffs.length;

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      tPuff: { value: null },
      litColor: { value: new THREE.Color(1, 1, 1) },
      shadowColor: { value: new THREE.Color(0.6, 0.65, 0.72) },
    }]),
    vertexShader: /* glsl */`
      #include <common>
      #include <fog_pars_vertex>
      attribute vec3 iPos; attribute float iSize; attribute float iShade;
      varying vec2 vUv; varying float vShade; varying float vFade;
      void main() {
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        vec3 wp = iPos + (right * position.x + up * position.y * 0.62) * iSize;
        vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        vUv = uv; vShade = iShade;
        float d = length(cameraPosition - iPos);
        vFade = smoothstep(iSize * 0.4, iSize * 1.6, d);
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */`
      #include <common>
      #include <fog_pars_fragment>
      uniform sampler2D tPuff; uniform vec3 litColor, shadowColor;
      varying vec2 vUv; varying float vShade; varying float vFade;
      void main() {
        float a = texture2D(tPuff, vUv).a;
        float light = clamp(vShade * 0.7 + vUv.y * 0.45, 0.0, 1.0);
        vec3 col = mix(shadowColor, litColor, light);
        gl_FragColor = vec4(col, a * 0.85 * vFade);
        if (gl_FragColor.a < 0.01) discard;
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
  mat.uniforms.tPuff.value = TEX.puff;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  return mesh;
}

// ================= Ciel, soleil, heure de la journée =================
export class Atmosphere {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;
    this.sky = new Sky();
    this.sky.scale.setScalar(40000);
    this.sky.material.depthWrite = false;
    scene.add(this.sky);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 2.6;
    u.rayleigh.value = 1.9;
    u.mieCoefficient.value = 0.003;
    u.mieDirectionalG.value = 0.8;

    this.sunDir = new THREE.Vector3();
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 1.5;
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbcd4ee, 0x5a5440, 0.4);
    scene.add(this.hemi);

    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.skyScene = new THREE.Scene();
    this.skyClone = new Sky();
    this.skyClone.scale.setScalar(1000);
    for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) this.skyClone.material.uniforms[k].value = u[k].value;
    this.skyScene.add(this.skyClone);
    this.probe = new THREE.WebGLRenderTarget(8, 8, { type: THREE.FloatType });
    this.probeCam = new THREE.PerspectiveCamera(30, 1, 1, 2000);
    this.horizon = new THREE.Color();
    this.zenith = new THREE.Color();
    this.envRT = null;
    this.shadowSize = 600;
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

  // hour : 5 à 21
  setTime(hour) {
    const t = (hour - 6) / 12; // 0 = lever, 1 = coucher
    const elev = Math.max(-0.08, Math.sin(t * Math.PI)) * THREE.MathUtils.degToRad(62);
    const az = THREE.MathUtils.degToRad(100 + t * 160);
    this.sunDir.setFromSphericalCoords(1, Math.PI / 2 - elev, az);
    for (const s of [this.sky, this.skyClone]) s.material.uniforms.sunPosition.value.copy(this.sunDir);

    // couleur et intensité du soleil (plus chaude quand il est bas)
    const h = Math.max(0, this.sunDir.y);
    const warm = 1 - Math.min(1, h * 3.2);
    this.sun.color.setRGB(1, 0.95 - warm * 0.35, 0.88 - warm * 0.6);
    this.sun.intensity = 0.25 + Math.min(1, h * 4) * 3.8;
    this.hemi.intensity = 0.15 + Math.min(1, h * 3) * 0.35;

    // couleurs du ciel pour le brouillard et l'eau
    const side = new THREE.Vector3(-this.sunDir.z, 0, this.sunDir.x).normalize();
    const away = this.sunDir.clone().setY(0).normalize().negate();
    this.horizon.copy(this.readSky(side.clone().multiplyScalar(0.7).add(away.multiplyScalar(0.3)).setY(0.04).normalize()));
    this.zenith.copy(this.readSky(new THREE.Vector3(0.01, 1, 0)));
    if (this.scene.fog) this.scene.fog.color.copy(this.horizon);

    // éclairage d'ambiance à partir du ciel
    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromScene(this.skyScene, 0, 0.1, 2000);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = 0.35 + Math.min(1, h * 3) * 0.45;
  }

  setShadows(on, quality) {
    this.sun.castShadow = on;
    const size = quality === 'high' ? 4096 : 2048;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
  }

  // la zone d'ombre suit l'avion
  follow(target, camPos) {
    this.sky.position.copy(camPos);
    const s = this.shadowSize;
    const cam = this.sun.shadow.camera;
    cam.left = -s; cam.right = s; cam.top = s; cam.bottom = -s; cam.near = 10; cam.far = 6000;
    cam.updateProjectionMatrix();
    // alignement sur la grille des texels pour éviter le scintillement
    const texel = (2 * s) / this.sun.shadow.mapSize.x;
    const tx = Math.round(target.x / texel) * texel, tz = Math.round(target.z / texel) * texel;
    this.sun.target.position.set(tx, target.y, tz);
    this.sun.position.set(tx, target.y, tz).addScaledVector(this.sunDir, 3000);
  }
}
