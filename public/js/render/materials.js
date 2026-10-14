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
    injectShared(shader);
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
          float isSnow = smoothstep(0.45, 0.62, min(diffuseColor.r, diffuseColor.b));
          base = mix(base, diffuseColor.rgb * mix(0.97, 1.02, d3.g), isSnow);
          rockW *= 1.0 - isSnow * (1.0 - smoothstep(0.5, 0.75, slope));
          diffuseColor.rgb = mix(base, rockCol, rockW);
          jpH = mix(mix(mix(d2.b, d1.b, near * 0.7), d0.b, close * 0.6), rk.r, rockW) * (1.0 - isSnow);
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
