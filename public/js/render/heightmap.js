// Carte des hauteurs du monde entier en basse résolution (texture), pour les shaders :
// les nuages évitent le relief, l'eau connaît la profondeur au large.
import * as THREE from 'three';
import { WORLD, terrainHeight } from '../world.js';

export const HEIGHT_RANGE = [-400, 3600]; // m, encodés sur 16 bits (R = octet fort, G = octet faible)

export function buildWorldHeightTexture(res = 256) {
  const data = new Uint8Array(res * res * 4);
  const [h0, h1] = HEIGHT_RANGE;
  for (let y = 0; y < res; y++) {
    for (let x = 0; x < res; x++) {
      const wx = ((x + 0.5) / res - 0.5) * WORLD.size, wz = ((y + 0.5) / res - 0.5) * WORLD.size;
      const v = Math.round(Math.min(1, Math.max(0, (terrainHeight(wx, wz) - h0) / (h1 - h0))) * 65535);
      const i = (y * res + x) * 4;
      data[i] = v >> 8; data[i + 1] = v & 255; data[i + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, res, res, THREE.RGBAFormat);
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

// Fonction GLSL correspondante : hauteur du terrain (m) en un point du monde
export const HEIGHT_GLSL = /* glsl */`
  uniform sampler2D jpWorldHeight;
  float jpTerrainH(vec2 xz) {
    vec4 t = texture2D(jpWorldHeight, xz / ${WORLD.size.toFixed(1)} + 0.5);
    return ${HEIGHT_RANGE[0].toFixed(1)} + (t.r * 255.0 * 256.0 + t.g * 255.0) / 65535.0 * ${(HEIGHT_RANGE[1] - HEIGHT_RANGE[0]).toFixed(1)};
  }
`;
