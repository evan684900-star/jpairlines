import * as THREE from 'three';
import { WORLD, HALF, terrainHeight, climate, snowLine, fbm, smoothstep } from './world.js';
import { createTerrainMaterial, createWaterMaterial, TEX } from './graphics.js';

const CH = WORLD.chunk;
const LOD_SEGMENTS = [80, 40, 20, 10]; // 25 m, 50 m, 100 m, 200 m
const MAX_INDEX = Math.ceil(HALF / CH) + 2;

// ---------- Couleur du sol selon l'altitude, la pente et le climat ----------
const fieldHash = (a, b) => {
  let h = Math.imul(a, 73856093) ^ Math.imul(b, 19349663);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
// palette en sRGB (convertie en couleurs linéaires pour le rendu)
const FIELD_COLORS = [[0.7, 0.63, 0.4], [0.38, 0.47, 0.22], [0.44, 0.38, 0.28], [0.45, 0.52, 0.27], [0.32, 0.41, 0.2], [0.55, 0.57, 0.32], [0.62, 0.58, 0.36]];
const SRGB = THREE.SRGBColorSpace;
const mix = (a, b, t) => a + (b - a) * t;

export function terrainColor(h, slope, x, z, out) {
  if (h < -1) {
    const k = Math.min(1, -h / 60);
    return out.setRGB(mix(0.74, 0.16, k), mix(0.68, 0.26, k), mix(0.52, 0.28, k), SRGB);
  }
  if (h < 5) return out.setRGB(0.83, 0.77, 0.6, SRGB);
  const { temp, dry } = climate(x, z);
  const n = fbm(x / 500, z / 500, 2, 5);
  const snow = snowLine(temp) + (n - 0.5) * 300;
  if (h > snow && slope < 1.1) return out.setRGB(0.84, 0.86, 0.9, SRGB);
  if (slope > 0.8 || h > snow - 250) return out.setRGB(0.47 + n * 0.08, 0.44 + n * 0.07, 0.4 + n * 0.06, SRGB);
  if (dry > 0.62 && temp > 0.45) {
    const d = Math.min(1, (dry - 0.62) * 6);
    return out.setRGB(mix(0.6, 0.84, d) + n * 0.04, mix(0.56, 0.7, d) + n * 0.04, mix(0.36, 0.47, d), SRGB);
  }
  if (temp < 0.3) return out.setRGB(0.5 + n * 0.06, 0.51 + n * 0.05, 0.4, SRGB);
  const lush = Math.max(0, Math.min(1, 1.25 - dry * 1.4));
  const forest = smoothstep(0.5, 0.58, fbm(x / 1800, z / 1800, 3, 77)) * (temp > 0.3 ? 1 : 0);
  const g = 0.9 + n * 0.2;
  let r = mix(0.55, 0.3, lush) * g, gg = mix(0.53, 0.42, lush) * g, b = mix(0.3, 0.17, lush) * g;
  // champs cultivés : parcelles irrégulières, orientées selon la région
  const farm = fbm(x / 2600, z / 2600, 2, 300);
  if (h < 450 && slope < 0.14 && farm > 0.56 && forest < 0.5) {
    const ang = fbm(x / 9000, z / 9000, 1, 400) * Math.PI;
    const wx = x + (fbm(x / 600, z / 600, 2, 401) - 0.5) * 140, wz = z + (fbm(x / 600, z / 600, 2, 402) - 0.5) * 140;
    const u = wx * Math.cos(ang) - wz * Math.sin(ang), v = wx * Math.sin(ang) + wz * Math.cos(ang);
    const band = Math.floor(u / 520);
    const iu = Math.floor(u / (90 + fieldHash(band, 3) * 150));
    const iv = Math.floor(v / (140 + fieldHash(iu, band) * 260));
    const hsh = fieldHash(iu * 7 + band, iv);
    if (hsh < smoothstep(0.56, 0.7, farm)) {
      const c = FIELD_COLORS[Math.floor(fieldHash(iv, iu) * FIELD_COLORS.length)];
      const k = 0.8;
      r = mix(r, c[0], k); gg = mix(gg, c[1], k); b = mix(b, c[2], k);
      return out.setRGB(r, gg, b, SRGB);
    }
  }
  r = mix(r, 0.2, forest); gg = mix(gg, 0.29, forest); b = mix(b, 0.12, forest);
  return out.setRGB(r, gg, b, SRGB);
}

// ---------- Construction d'un morceau ----------
function buildChunkGeometry(ci, cj, seg) {
  const step = CH / seg;
  const x0 = ci * CH, z0 = cj * CH;
  const N = seg + 1, B = N + 2;
  const hs = new Float32Array(B * B);
  for (let j = 0; j < B; j++) {
    for (let i = 0; i < B; i++) hs[j * B + i] = terrainHeight(x0 + (i - 1) * step, z0 + (j - 1) * step);
  }
  const vCount = N * N + 4 * N;
  const pos = new Float32Array(vCount * 3), nor = new Float32Array(vCount * 3), col = new Float32Array(vCount * 3);
  const c = new THREE.Color();
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const v = j * N + i;
      const h = hs[(j + 1) * B + i + 1];
      const hL = hs[(j + 1) * B + i], hR = hs[(j + 1) * B + i + 2];
      const hD = hs[j * B + i + 1], hU = hs[(j + 2) * B + i + 1];
      pos[v * 3] = i * step; pos[v * 3 + 1] = h; pos[v * 3 + 2] = j * step;
      const nx = hL - hR, ny = 2 * step, nz = hD - hU;
      const len = Math.hypot(nx, ny, nz);
      nor[v * 3] = nx / len; nor[v * 3 + 1] = ny / len; nor[v * 3 + 2] = nz / len;
      terrainColor(h, Math.hypot(nx, nz) / (2 * step), x0 + i * step, z0 + j * step, c);
      col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b;
    }
  }
  const idx = [];
  for (let j = 0; j < seg; j++) {
    for (let i = 0; i < seg; i++) {
      const a = j * N + i, b = a + 1, cc = a + N, d = cc + 1;
      idx.push(a, cc, b, b, cc, d);
    }
  }
  // « jupes » qui descendent sous les bords pour cacher les fentes entre niveaux de détail
  const skirt = step * 1.5 + 10;
  const edges = [
    Array.from({ length: N }, (_, i) => i),
    Array.from({ length: N }, (_, i) => (N - 1) * N + i),
    Array.from({ length: N }, (_, j) => j * N),
    Array.from({ length: N }, (_, j) => j * N + N - 1),
  ];
  let v = N * N;
  for (const edge of edges) {
    const start = v;
    for (const e of edge) {
      pos[v * 3] = pos[e * 3]; pos[v * 3 + 1] = pos[e * 3 + 1] - skirt; pos[v * 3 + 2] = pos[e * 3 + 2];
      for (let k = 0; k < 3; k++) { nor[v * 3 + k] = nor[e * 3 + k]; col[v * 3 + k] = col[e * 3 + k]; }
      v++;
    }
    for (let k = 0; k < N - 1; k++) {
      const a = edge[k], b = edge[k + 1], sa = start + k, sb = start + k + 1;
      idx.push(a, sa, b, b, sa, sb, a, b, sa, b, sb, sa);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}

// ---------- Gestionnaire de morceaux ----------
export class Terrain {
  constructor(scene) {
    this.scene = scene;
    this.material = createTerrainMaterial();
    this.chunks = new Map();
    this.queue = [];
    this.center = null;
    this.radius = 10;

    this.water = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), createWaterMaterial());
    this.water.material.uniforms.tNormal.value = TEX.waterNormal;
    this.water.position.y = 0.4;
    this.water.renderOrder = 1;
    scene.add(this.water);
  }

  setViewDistance(meters) {
    this.radius = Math.max(3, Math.ceil(meters / CH));
    this.water.scale.set(meters * 3, 1, meters * 3);
    this.center = null;
  }

  static lodFor(d) {
    return d <= 1 ? 0 : d <= 3 ? 1 : d <= 7 ? 2 : 3;
  }

  plan(ci, cj) {
    this.center = [ci, cj];
    const R = this.radius;
    const want = new Map();
    for (let dj = -R; dj <= R; dj++) {
      for (let di = -R; di <= R; di++) {
        if (di * di + dj * dj > (R + 0.5) * (R + 0.5)) continue;
        const i = ci + di, j = cj + dj;
        if (Math.abs(i) > MAX_INDEX || Math.abs(j) > MAX_INDEX) continue;
        const d = Math.max(Math.abs(di), Math.abs(dj));
        want.set(`${i},${j}`, { i, j, d, lod: Terrain.lodFor(d) });
      }
    }
    for (const [key, ch] of this.chunks) {
      if (!want.has(key)) {
        this.scene.remove(ch.mesh);
        ch.mesh.geometry.dispose();
        this.chunks.delete(key);
      }
    }
    this.queue = [...want.entries()]
      .filter(([key, w]) => this.chunks.get(key)?.lod !== w.lod)
      .map(([key, w]) => ({ key, ...w }))
      .sort((a, b) => a.d - b.d);
  }

  build(job) {
    const geo = buildChunkGeometry(job.i, job.j, LOD_SEGMENTS[job.lod]);
    const old = this.chunks.get(job.key);
    if (old) {
      old.mesh.geometry.dispose();
      old.mesh.geometry = geo;
      old.lod = job.lod;
      return;
    }
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.receiveShadow = true;
    mesh.position.set(job.i * CH, 0, job.j * CH);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    this.scene.add(mesh);
    this.chunks.set(job.key, { mesh, lod: job.lod });
  }

  update(x, z, camX, camZ, budgetMs = 6) {
    const ci = Math.floor(x / CH), cj = Math.floor(z / CH);
    if (!this.center || this.center[0] !== ci || this.center[1] !== cj) this.plan(ci, cj);
    const t0 = performance.now();
    while (this.queue.length && performance.now() - t0 < budgetMs) this.build(this.queue.shift());
    this.water.position.x = Math.round(camX / 100) * 100;
    this.water.position.z = Math.round(camZ / 100) * 100;
  }

  // construit d'un coup ce qui est autour du joueur (au démarrage / téléportation)
  buildAround(x, z, maxDist = Infinity) {
    this.plan(Math.floor(x / CH), Math.floor(z / CH));
    this.queue = this.queue.filter((j) => {
      if (j.d > maxDist) return true;
      this.build(j);
      return false;
    });
  }
}
