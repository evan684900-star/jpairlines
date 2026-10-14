// Matériaux du monde : terrain (détails, roche, neige), bâtiments avec fenêtres.
import * as THREE from 'three';
import { TEX } from './textures.js';
import { injectShared } from './shared.js';

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

// passe une normale du monde dans l'espace de la caméra (remplace la normale d'éclairage)
const WORLD_NORMAL_GLSL = /* glsl */`
  vec3 jpNW;
  float jpRough;
  // normale « tangente » d'une texture projetée sur le plan horizontal
  vec3 jpPlanarN(sampler2D t, vec2 uv) { vec3 n = texture2D(t, uv).xyz * 2.0 - 1.0; return vec3(n.x, 0.0, n.y); }
`;

// ---------- Terrain ----------
// Couleur de base : couleurs des sommets (biome, champs, forêts) ; ici on ajoute le détail :
// herbe et terre avec carte de normales, roche triplanaire sur les pentes, neige, sol mouillé sous la pluie.
export function createTerrainMaterial() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    injectShared(shader);
    shader.uniforms.tDetail = { value: TEX.detail };
    shader.uniforms.tRock = { value: TEX.rock };
    shader.uniforms.tRockN = { value: TEX.rockNormal };
    shader.uniforms.tGroundN = { value: TEX.groundNormal };
    injectWorld(shader);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float snowAlt;\nvarying float vSnowAlt;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSnowAlt = snowAlt;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tDetail, tRock, tRockN, tGroundN;\nuniform float jpWet;\nvarying float vSnowAlt;\n' + WORLD_NORMAL_GLSL)
      .replace('#include <color_fragment>', /* glsl */`
        #include <color_fragment>
        {
          vec3 n = normalize(vWNormal);
          float dist = length(vViewPosition);
          float near = 1.0 - smoothstep(500.0, 4500.0, dist);
          float close = 1.0 - smoothstep(25.0, 220.0, dist);
          vec4 d0 = texture2D(tDetail, vWPos.xz / 2.3);
          vec4 d1 = texture2D(tDetail, vWPos.xz / 9.0);
          vec4 d2 = texture2D(tDetail, vWPos.xz / 70.0);
          vec4 d3 = texture2D(tDetail, vWPos.xz / 900.0);
          vec4 d4 = texture2D(tDetail, vWPos.xz / 5200.0);
          vec3 vc = diffuseColor.rgb;
          // neige au pixel : limite des neiges (par sommet) + bruit, moins sur les pentes raides
          float snowN = (d2.b - 0.5) * 140.0 + (d1.g - 0.5) * 40.0 + (texture2D(tDetail, vWPos.xz / 2600.0).r - 0.5) * 260.0;
          float isSnow = smoothstep(vSnowAlt - 90.0, vSnowAlt + 60.0, vWPos.y + snowN)
            * (1.0 - smoothstep(0.42, 0.62, (1.0 - n.y) + (d1.r - 0.5) * 0.2));
          float isSand = smoothstep(0.42, 0.58, vc.r) * step(vc.g, vc.r) * (1.0 - isSnow);
          // variations de couleur à plusieurs échelles (herbe sèche, herbe grasse, terre)
          vec3 base = vc * mix(0.74, 1.2, d3.g) * mix(0.85, 1.12, d4.r);
          vec3 dry = base * vec3(1.18, 1.05, 0.72);
          vec3 lush = base * vec3(0.82, 1.02, 0.8);
          base = mix(base, dry, smoothstep(0.52, 0.85, d2.g) * 0.55 * (1.0 - isSand));
          base = mix(base, lush, smoothstep(0.55, 0.9, d4.g) * 0.5 * (1.0 - isSand));
          float grain = mix(mix(d2.r, d1.r, near), d0.r * 0.6 + d1.r * 0.4, close);
          base *= mix(0.82, 1.14, grain);
          // roche en triplanaire sur les pentes (strates, fissures)
          vec3 bw = pow(abs(n), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
          vec2 ux = vWPos.zy / 38.0, uy = vWPos.xz / 38.0, uz = vWPos.xy / 38.0;
          vec4 rk = texture2D(tRock, ux) * bw.x + texture2D(tRock, uy) * bw.y + texture2D(tRock, uz) * bw.z;
          vec4 rk2 = texture2D(tRock, ux * 0.13) * bw.x + texture2D(tRock, uy * 0.13) * bw.y + texture2D(tRock, uz * 0.13) * bw.z;
          float slope = 1.0 - n.y;
          float rockW = smoothstep(0.26, 0.48, slope + (d2.g - 0.5) * 0.18 + (rk2.r - 0.5) * 0.12);
          vec3 rockCol = mix(vec3(0.26, 0.245, 0.23), vec3(0.5, 0.47, 0.43), rk.r * 0.6 + rk2.r * 0.4) * mix(0.82, 1.12, rk.g);
          rockCol = mix(rockCol, rockCol * vec3(1.12, 0.98, 0.86), smoothstep(0.4, 0.8, d4.b) * 0.5);
          // la neige tient sur les pentes douces, la roche perce sur les pentes raides
          vec3 snowCol = vec3(0.66, 0.69, 0.74) * mix(0.93, 1.03, d1.r * 0.5 + d3.g * 0.5);
          base = mix(base, snowCol, isSnow);
          rockW *= 1.0 - isSnow * (1.0 - smoothstep(0.5, 0.78, slope));
          vec3 col = mix(base, rockCol, rockW);
          // sol mouillé : plus sombre et plus brillant
          float wet = jpWet * (1.0 - isSnow) * 0.9;
          col *= 1.0 - wet * 0.32;
          diffuseColor.rgb = col;
          jpRough = mix(mix(0.95, 0.82, rockW), 0.55, isSnow);
          jpRough = mix(jpRough, 0.42, wet);

          // normale détaillée (espace monde)
          vec3 pert = jpPlanarN(tGroundN, vWPos.xz / 5.0) * close * 0.9
                    + jpPlanarN(tGroundN, vWPos.xz / 31.0) * near * 0.6
                    + jpPlanarN(tGroundN, vWPos.xz / 210.0) * 0.45;
          pert *= mix(1.0, 0.35, isSnow) * mix(1.0, 0.4, isSand);
          vec3 rnx = texture2D(tRockN, ux).xyz * 2.0 - 1.0;
          vec3 rny = texture2D(tRockN, uy).xyz * 2.0 - 1.0;
          vec3 rnz = texture2D(tRockN, uz).xyz * 2.0 - 1.0;
          vec3 rpert = vec3(0.0, rnx.y, rnx.x) * bw.x + vec3(rny.x, 0.0, rny.y) * bw.y + vec3(rnz.x, rnz.y, 0.0) * bw.z;
          float rockStrength = mix(0.9, 0.5, smoothstep(300.0, 6000.0, dist));
          jpNW = normalize(n + mix(pert, rpert * rockStrength * 1.6, rockW));
        }
      `)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = jpRough;')
      .replace('#include <normal_fragment_begin>', /* glsl */`
        #include <normal_fragment_begin>
        normal = normalize((viewMatrix * vec4(jpNW, 0.0)).xyz);
      `);
  };
  return mat;
}

// ---------- Bâtiments avec fenêtres ----------
export function createBuildingMaterial({ floor = 3.4, bay = 3.2, glass = 0.55 } = {}) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0.05 });
  mat.onBeforeCompile = (shader) => {
    injectShared(shader);
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
