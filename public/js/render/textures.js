// Textures procédurales (aucune image à télécharger) : bruit bouclable, cartes de normales,
// détails du sol, roche, eau, bouffées de nuages.
import * as THREE from 'three';
import { rng } from '../world.js';
import { NIGHT_GLOWS } from './shared.js';

const fade = (t) => t * t * (3 - 2 * t);

// Bruit de valeur bouclable (fractal), valeurs ~0..1
export function tileNoise(size, period, octaves, seed, ridged = false) {
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

export function contrast(arr, k) {
  let min = Infinity, max = -Infinity;
  for (const v of arr) { if (v < min) min = v; if (v > max) max = v; }
  for (let i = 0; i < arr.length; i++) arr[i] = Math.min(1, Math.max(0, ((arr[i] - min) / (max - min) - 0.5) * k + 0.5));
  return arr;
}

export function dataTexture(size, r, g, b, a, srgb = false) {
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

// carte de normales (espace tangent, X = u, Y = v) à partir d'une carte de hauteur bouclable ; A = hauteur
export function normalTexture(size, h, strength) {
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
  return dataTexture(size, r, g, b, h);
}

export const TEX = {};
export function buildTextures() {
  const S = 256;
  // détail du sol : R = grain fin, G = taches, B = relief
  const fine = contrast(tileNoise(S, 16, 4, 11), 1.6);
  const blot = contrast(tileNoise(S, 4, 4, 12), 1.4);
  const bump = tileNoise(S, 8, 5, 13);
  TEX.detail = dataTexture(S, fine, blot, bump);
  // relief du sol (normales) : mottes et brins à petite échelle
  const groundH = tileNoise(S, 32, 4, 14);
  for (let i = 0; i < groundH.length; i++) groundH[i] = groundH[i] * 0.6 + fine[i] * 0.4;
  TEX.groundNormal = normalTexture(S, groundH, 5);
  // roche : R = strates/fissures, G = grain, B = relief ; et ses normales
  const ridge = contrast(tileNoise(S, 6, 5, 21, true), 1.5);
  const grain = contrast(tileNoise(S, 32, 3, 22), 1.3);
  TEX.rock = dataTexture(S, ridge, grain, ridge);
  const rockH = new Float32Array(S * S);
  for (let i = 0; i < rockH.length; i++) rockH[i] = ridge[i] * 0.75 + grain[i] * 0.25;
  TEX.rockNormal = normalTexture(S, rockH, 9);
  // eau : carte de normales (vagues)
  TEX.waterNormal = normalTexture(S, tileNoise(S, 8, 5, 31), 6);
  // bruit doux pour les voiles nuageux (stratus, cirrus)
  const veil = tileNoise(S, 4, 6, 41);
  const wisp = tileNoise(S, 3, 6, 42, true);
  TEX.cloudVeil = dataTexture(S, contrast(veil, 1.3), contrast(wisp, 1.2), veil);
  // bouffée de nuage simple (fumée, poussière…) et atlas de bouffées éclairables
  TEX.puff = puffTexture();
  TEX.glow = glowTexture();
  TEX.cloudAtlas = cloudAtlas();
}

// halo d'une lampe (balisage, lampadaires, feux)
function glowTexture() {
  const S = 64, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const gr = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.12, 'rgba(255,255,255,0.75)');
  gr.addColorStop(0.35, 'rgba(255,255,255,0.18)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(cv);
}

// nuage de points lumineux (halos), allumés la nuit seulement
export function glowPoints(positions, color, size) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const m = new THREE.PointsMaterial({
    map: TEX.glow, color: new THREE.Color(color).multiplyScalar(2.5), size, sizeAttenuation: true,
    transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  NIGHT_GLOWS.add(m);
  const pts = new THREE.Points(g, m);
  pts.renderOrder = 4;
  return pts;
}

function puffTexture() {
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

// Atlas 2×2 de bouffées de cumulus : R,G = normale (x,y) de la surface du nuage, B = épaisseur, A = densité.
// La normale permet d'éclairer chaque panneau comme un volume (côté soleil clair, côté opposé sombre).
function cloudAtlas() {
  const T = 128, S = T * 2;
  const data = new Uint8Array(S * S * 4);
  const noise = tileNoise(T, 8, 4, 55);
  for (let v = 0; v < 4; v++) {
    const r = rng(300 + v);
    const balls = [];
    const nb = 5 + v * 2;
    for (let k = 0; k < nb; k++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.22;
      balls.push([0.5 + Math.cos(a) * d * 1.2, 0.52 + Math.sin(a) * d * 0.7 - 0.04, 0.13 + r() * 0.13]);
    }
    const ox = (v % 2) * T, oy = Math.floor(v / 2) * T;
    const field = new Float32Array(T * T);
    for (let y = 0; y < T; y++) {
      for (let x = 0; x < T; x++) {
        const px = (x + 0.5) / T, py = (y + 0.5) / T;
        let h = 0;
        for (const [bx, by, br] of balls) {
          const dd = ((px - bx) ** 2 + (py - by) ** 2) / (br * br);
          if (dd < 1) h = Math.max(h, Math.sqrt(1 - dd) * br * 3);
        }
        // base plus plate (les cumulus ont un fond horizontal)
        const flat = Math.min(1, Math.max(0, (0.78 - py) / 0.12));
        field[y * T + x] = h * flat * (0.75 + noise[y * T + x] * 0.5);
      }
    }
    for (let y = 0; y < T; y++) {
      for (let x = 0; x < T; x++) {
        const f = (xx, yy) => field[Math.min(T - 1, Math.max(0, yy)) * T + Math.min(T - 1, Math.max(0, xx))];
        const h = f(x, y);
        const dx = (f(x + 1, y) - f(x - 1, y)) * 6, dy = (f(x, y + 1) - f(x, y - 1)) * 6;
        const len = Math.hypot(dx, dy, 1);
        // ligne 0 de la texture = bas de l'image (v = 0) : on écrit les lignes à l'envers
        const i = ((oy + T - 1 - y) * S + ox + x) * 4;
        data[i] = (-dx / len * 0.5 + 0.5) * 255;
        data[i + 1] = (dy / len * 0.5 + 0.5) * 255;
        data[i + 2] = Math.min(1, h * 1.6) * 255;
        data[i + 3] = Math.min(1, Math.max(0, (h - 0.04) * 3.2)) * 255;
      }
    }
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}
