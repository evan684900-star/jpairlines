// Nuages : cumulus en panneaux éclairés comme des volumes (atlas de normales), triés par distance,
// qui dérivent avec le vent ; couche de stratus que l'on peut survoler ; voile de cirrus en altitude ;
// carte de couverture servant aux ombres des nuages sur le sol.
import * as THREE from 'three';
import { WORLD, rng } from '../world.js';
import { TEX } from './textures.js';
import { U } from './shared.js';
import { ART } from './config.js';
import { HEIGHT_GLSL } from './heightmap.js';

// les nuages forment un motif de 96 km qui se répète (même densité de nuages quelle que soit la taille du monde)
const L = 96000;
const wrap = (v) => ((((v + L / 2) % L) + L) % L) - L / 2;

// Lumière des nuages, partagée par toutes les couches
export const CLOUD_U = {
  cSun: { value: new THREE.Color(1, 1, 1) },
  cAmbTop: { value: new THREE.Color(0.6, 0.7, 0.85) },
  cAmbBottom: { value: new THREE.Color(0.4, 0.45, 0.5) },
  cDarken: { value: 0 },
};

export class Clouds {
  constructor(density, worldHeight) {
    this.group = new THREE.Group();
    this.span = L;
    this.worldHeight = worldHeight;
    this.buildCumulus(density);
    this.buildCloudMap();
    this.stratus = this.makeLayer(2700, 0.0, false);
    this.cirrus = this.makeLayer(ART.cirrusAlt, 0.35, true);
    this.group.add(this.stratus, this.cirrus);
    this.sortTimer = 0;
    this.lastSort = new THREE.Vector3(1e9, 0, 0);
  }

  buildCumulus(density) {
    const r = rng(99);
    const puffs = [];
    this.cloudList = [];
    const count = Math.round(560 * density);
    for (let c = 0; c < count; c++) {
      const cx = (r() - 0.5) * L, cz = (r() - 0.5) * L;
      const big = 0.7 + r() ** 2 * 2.2;
      const cy = ART.cloudBase + r() * (ART.cloudTop - ART.cloudBase) * 0.6;
      const cover = r(); // le nuage n'apparaît que si la couverture du ciel dépasse cette valeur
      this.cloudList.push({ x: cx, z: cz, radius: 520 * big, cover });
      const n = Math.round((10 + r() * 12) * Math.min(1.6, big));
      for (let j = 0; j < n; j++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 430 * big;
        // dôme : plus haut au centre, base plate
        const dome = 1 - (d / (430 * big)) ** 2;
        const dy = r() * 260 * big * dome;
        const size = (260 + r() * 300) * big * (0.75 + dome * 0.4);
        puffs.push([cx + Math.cos(a) * d * 1.4, cy + dy + size * 0.18, cz + Math.sin(a) * d, size, dy / (260 * big), cover, Math.floor(r() * 4), r() * 6.283]);
      }
    }
    this.puffs = puffs;
    const N = puffs.length;
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);
    geo.setAttribute('uv', base.attributes.uv);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aData = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4).setUsage(THREE.DynamicDrawUsage); // taille, hauteur, couverture, rotation
    this.aVar = new THREE.InstancedBufferAttribute(new Float32Array(N), 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPos', this.aPos);
    geo.setAttribute('iData', this.aData);
    geo.setAttribute('iVar', this.aVar);
    geo.instanceCount = N;
    this.order = new Uint32Array(N).map((_, i) => i);
    this.keys = new Float32Array(N);
    this.writeOrder();

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        tAtlas: { value: TEX.cloudAtlas },
        jpWorldHeight: { value: this.worldHeight },
        span: { value: L },
      }]),
      vertexShader: /* glsl */`
        #include <common>
        #include <fog_pars_vertex>
        ${HEIGHT_GLSL}
        uniform vec2 jpCloudOffset; uniform float jpCloudCover; uniform float span; uniform float jpTime;
        attribute vec3 iPos; attribute vec4 iData; attribute float iVar;
        varying vec2 vUv; varying float vShade; varying float vFade; varying vec3 vRight; varying vec3 vUp; varying vec3 vToCam;
        void main() {
          vec3 c = iPos;
          c.xz = mod(c.xz + jpCloudOffset + span * 0.5, span) - span * 0.5;
          float size = iData.x * (0.85 + jpCloudCover * 0.3);
          // visible selon la couverture du ciel (apparition progressive)
          float vis = smoothstep(iData.z, iData.z + 0.08, jpCloudCover);
          // pas de bouffée dans la montagne, ni au bord de la zone qui boucle
          float ground = jpTerrainH(c.xz);
          vis *= smoothstep(ground + size * 0.1, ground + size * 0.55, c.y);
          vis *= 1.0 - smoothstep(span * 0.5 - 4000.0, span * 0.5, max(abs(c.x), abs(c.z)));
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          vec3 wp = c + (right * position.x + up * position.y * 0.7) * size;
          vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          vec2 cell = vec2(mod(iVar, 2.0), floor(iVar / 2.0));
          vUv = (uv + cell) * 0.5;
          vShade = clamp(iData.y, 0.0, 1.0);
          float d = length(cameraPosition - c);
          vFade = vis * smoothstep(size * 0.25, size * 1.1, d);
          vRight = right; vUp = up; vToCam = normalize(cameraPosition - c);
          #include <fog_vertex>
        }
      `,
      fragmentShader: /* glsl */`
        #include <common>
        #include <fog_pars_fragment>
        uniform sampler2D tAtlas;
        uniform vec3 cSun, cAmbTop, cAmbBottom; uniform float cDarken;
        varying vec2 vUv; varying float vShade; varying float vFade; varying vec3 vRight; varying vec3 vUp; varying vec3 vToCam;
        void main() {
          vec4 t = texture2D(tAtlas, vUv);
          float a = t.a * vFade;
          if (a < 0.01) discard;
          vec2 nxy = t.rg * 2.0 - 1.0;
          vec3 n = normalize(vRight * nxy.x + vUp * nxy.y + vToCam * sqrt(max(0.05, 1.0 - dot(nxy, nxy))));
          vec3 L = jpSunDir;
          float diff = clamp(dot(n, L) * 0.6 + 0.4, 0.0, 1.0);
          float body = mix(0.45, 1.0, vShade);
          vec3 amb = mix(cAmbBottom, cAmbTop, clamp(n.y * 0.5 + 0.5, 0.0, 1.0)) * mix(0.55, 1.0, vShade);
          // diffusion vers l'avant : les bords minces s'illuminent à contre-jour
          float phase = pow(max(dot(-vToCam, L), 0.0), 7.0);
          vec3 col = amb + cSun * (diff * body * 0.9 + phase * (1.0 - t.b) * 2.4);
          col *= 1.0 - cDarken * 0.55;
          gl_FragColor = vec4(col, a * 0.92);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }
      `,
    });
    Object.assign(mat.uniforms, CLOUD_U);
    this.cumulus = new THREE.Mesh(geo, mat);
    this.cumulus.frustumCulled = false;
    this.cumulus.renderOrder = 3;
    this.group.add(this.cumulus);
  }

  writeOrder() {
    const P = this.aPos.array, D = this.aData.array, V = this.aVar.array;
    for (let k = 0; k < this.order.length; k++) {
      const p = this.puffs[this.order[k]];
      P[k * 3] = p[0]; P[k * 3 + 1] = p[1]; P[k * 3 + 2] = p[2];
      D[k * 4] = p[3]; D[k * 4 + 1] = p[4]; D[k * 4 + 2] = p[5]; D[k * 4 + 3] = p[7];
      V[k] = p[6];
    }
    this.aPos.needsUpdate = this.aData.needsUpdate = this.aVar.needsUpdate = true;
  }

  // tri du plus loin au plus proche (transparence correcte)
  sort(cam) {
    const off = U.jpCloudOffset.value;
    for (let i = 0; i < this.puffs.length; i++) {
      const p = this.puffs[i];
      const dx = wrap(p[0] + off.x) - cam.x, dy = p[1] - cam.y, dz = wrap(p[2] + off.y) - cam.z;
      this.keys[i] = dx * dx + dy * dy + dz * dz;
    }
    const keys = this.keys;
    this.order.sort((a, b) => keys[b] - keys[a]);
    this.writeOrder();
  }

  // Carte de couverture (ombres) : R = nuages visibles dès 35 % de couverture, G = 65 %, B = tous
  buildCloudMap() {
    const S = 512;
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, S, S);
    ctx.globalCompositeOperation = 'lighter';
    for (const c of this.cloudList) {
      const x = (c.x / L + 0.5) * S, y = (c.z / L + 0.5) * S, rad = (c.radius / L) * S * 1.1;
      const col = `${c.cover < 0.35 ? 255 : 0},${c.cover < 0.65 ? 255 : 0},255`;
      for (const [dx, dy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) {
        const g = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rad);
        g.addColorStop(0, `rgba(${col},0.9)`);
        g.addColorStop(0.6, `rgba(${col},0.5)`);
        g.addColorStop(1, `rgba(${col},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(x + dx, y + dy, rad * 1.3, rad, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.minFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    U.jpCloudMap.value = t;
    U.jpCloudMapSize.value = L;
    U.jpCloudAlt.value = ART.cloudBase + 300;
  }

  // Couche horizontale (stratus ou cirrus) qui suit la caméra
  makeLayer(alt, cover, cirrus) {
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: !cirrus,
      side: THREE.DoubleSide,
      fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        tVeil: { value: TEX.cloudVeil }, cover: { value: cover }, cirrus: { value: cirrus ? 1 : 0 }, alt: { value: alt },
      }]),
      vertexShader: /* glsl */`
        #include <common>
        #include <fog_pars_vertex>
        varying vec3 vW;
        varying float vRadius;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vW = wp.xyz;
          vRadius = modelMatrix[0][0] * 0.5;
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }
      `,
      fragmentShader: /* glsl */`
        #include <common>
        #include <fog_pars_fragment>
        uniform sampler2D tVeil; uniform float cover; uniform float cirrus; uniform float alt;
        uniform vec3 cSun, cAmbTop, cAmbBottom; uniform float cDarken;
        varying vec3 vW;
        varying float vRadius;
        void main() {
          vec2 p = vW.xz + jpCloudOffset * (cirrus > 0.5 ? 2.5 : 1.0);
          float n;
          if (cirrus > 0.5) {
            vec2 q = vec2(p.x * 0.6 + p.y * 0.25, p.y) / 9000.0;
            n = texture2D(tVeil, q).g * 0.6 + texture2D(tVeil, q * 3.1 + 0.37).g * 0.4;
          } else {
            n = texture2D(tVeil, p / 14000.0).r * 0.62 + texture2D(tVeil, p / 3100.0 + 0.21).b * 0.38;
          }
          float a = smoothstep(1.0 - cover, 1.0 - cover + (cirrus > 0.5 ? 0.5 : 0.22), n);
          float d = length(vW.xz - cameraPosition.xz);
          a *= 1.0 - smoothstep(0.6, 1.0, d / vRadius);
          if (a < 0.01) discard;
          bool above = cameraPosition.y > alt;
          float thick = smoothstep(0.0, 1.0, a);
          vec3 lit = cAmbTop + cSun * (0.55 + 0.35 * max(jpSunDir.y, 0.0));
          vec3 under = mix(cAmbBottom * 0.9, cAmbBottom * 0.45, thick * (1.0 - cirrus));
          vec3 col = cirrus > 0.5 ? lit * 0.95 : (above ? lit * mix(1.0, 0.82, n) : under + cSun * 0.08 * (1.0 - thick));
          col *= 1.0 - cDarken * 0.5;
          gl_FragColor = vec4(col, a * (cirrus > 0.5 ? 0.55 : 0.97));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }
      `,
    });
    Object.assign(mat.uniforms, CLOUD_U);
    const m = new THREE.Mesh(geo, mat);
    m.position.y = alt;
    m.frustumCulled = false;
    m.renderOrder = cirrus ? 0 : 1;
    return m;
  }

  // weather : { cover, stratus, cirrus, darken }
  setWeather(w) {
    U.jpCloudCover.value = w.cover;
    this.stratus.material.uniforms.cover.value = w.stratus;
    this.stratus.visible = w.stratus > 0.01;
    this.cirrus.material.uniforms.cover.value = w.cirrus;
    this.cirrus.visible = w.cirrus > 0.01;
    CLOUD_U.cDarken.value = w.darken;
    U.jpCloudShadow.value = 0.55 + w.darken * 0.25;
  }

  // lumière des nuages à partir de l'atmosphère
  setLight(atmo) {
    CLOUD_U.cSun.value.copy(atmo.sun.color).multiplyScalar(0.25 + atmo.sun.intensity * 0.3);
    CLOUD_U.cAmbTop.value.copy(atmo.zenith).lerp(atmo.horizon, 0.5).multiplyScalar(1.2).addScalar(0.02 * (1 - atmo.night));
    CLOUD_U.cAmbBottom.value.copy(atmo.horizon).multiplyScalar(0.62);
  }

  update(dt, camera, far) {
    for (const layer of [this.stratus, this.cirrus]) {
      layer.position.x = camera.position.x;
      layer.position.z = camera.position.z;
      layer.scale.set(far * 2.2, 1, far * 2.2);
    }
    this.sortTimer -= dt;
    if (this.sortTimer <= 0 && (this.lastSort.distanceToSquared(camera.position) > 150 * 150 || this.sortTimer < -1.5)) {
      this.sortTimer = 0.4;
      this.lastSort.copy(camera.position);
      this.sort(camera.position);
    }
  }
}
