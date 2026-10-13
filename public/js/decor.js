import * as THREE from 'three';
import { WORLD, AIRPORTS, CITIES, climate, snowLine, fbm, rng, groundHeight, terrainHeight, runwayLocal } from './world.js';

const CH = WORLD.chunk;

// Fusionne plusieurs géométries en une seule, avec une couleur par morceau
export function mergeColored(parts) {
  const geos = parts.map(([g, color]) => {
    const ng = g.index ? g.toNonIndexed() : g;
    const c = new THREE.Color(color);
    const n = ng.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return ng;
  });
  const total = geos.reduce((s, g) => s + g.attributes.position.count, 0);
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color']) {
    const arr = new Float32Array(total * 3);
    let o = 0;
    for (const g of geos) { arr.set(g.attributes[name].array, o); o += g.attributes[name].array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, 3));
  }
  return out;
}

const TRUNK = 0x6b4a2f;
const TREE_GEOS = {
  conifer: mergeColored([
    [new THREE.CylinderGeometry(0.5, 0.7, 4, 5).translate(0, 2, 0), TRUNK],
    [new THREE.ConeGeometry(4.2, 9, 6).translate(0, 7.5, 0), 0x2c5e2e],
    [new THREE.ConeGeometry(3.2, 7, 6).translate(0, 12, 0), 0x336b33],
  ]),
  broadleaf: mergeColored([
    [new THREE.CylinderGeometry(0.5, 0.7, 5, 5).translate(0, 2.5, 0), TRUNK],
    [new THREE.IcosahedronGeometry(4.5, 0).scale(1, 0.85, 1).translate(0, 8, 0), 0x4a8a35],
  ]),
  palm: mergeColored([
    [new THREE.CylinderGeometry(0.3, 0.45, 10, 5).translate(0, 5, 0), 0x8a6b45],
    [new THREE.BoxGeometry(9, 0.3, 1.6).translate(0, 10, 0), 0x3f8f3a],
    [new THREE.BoxGeometry(1.6, 0.3, 9).translate(0, 10, 0), 0x3f8f3a],
    [new THREE.BoxGeometry(6.5, 0.3, 1.2).rotateY(Math.PI / 4).translate(0, 10.2, 0), 0x4c9c42],
  ]),
  cactus: mergeColored([
    [new THREE.CylinderGeometry(0.6, 0.7, 6, 6).translate(0, 3, 0), 0x4f7f3a],
    [new THREE.BoxGeometry(2.4, 0.8, 0.8).translate(1, 3, 0), 0x4f7f3a],
    [new THREE.BoxGeometry(0.8, 2, 0.8).translate(2, 4, 0), 0x4f7f3a],
  ]),
  rock: mergeColored([[new THREE.DodecahedronGeometry(2.5, 0).scale(1.3, 0.7, 1), 0x8a8580]]),
};
const HOUSE_WALL = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const HOUSE_ROOF = new THREE.ConeGeometry(0.78, 0.55, 4).rotateY(Math.PI / 4).translate(0, 1.27, 0);
const WALL_COLORS = [0xf2ead8, 0xe8d6b5, 0xdcc9a8, 0xf5f0e6, 0xcfb894, 0xe6cfc0];
const ROOF_COLORS = [0xa8432f, 0x8b3a2b, 0x5b4a44, 0xb5552f, 0x6a5145];

const treeMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const houseMat = new THREE.MeshLambertMaterial({ color: 0xffffff });

function inExcludedZone(x, z) {
  for (const a of AIRPORTS) {
    if (Math.abs(x - a.x) > a.reach || Math.abs(z - a.z) > a.reach) continue;
    const { u, v } = runwayLocal(a, x, z);
    if (Math.abs(u) < a.width / 2 + a.pad + 40 && Math.abs(v) < a.length / 2 + 300) return true;
  }
  for (const c of CITIES) if (Math.hypot(x - c.x, z - c.z) < c.radius) return true;
  return false;
}

function chooseTree(x, z, h, r) {
  const { temp, dry } = climate(x, z);
  if (h > snowLine(temp) - 150) return null;
  if (dry > 0.62 && temp > 0.45) return r() < 0.05 ? (r() < 0.6 ? 'cactus' : 'rock') : null;
  const forest = fbm(x / 1800, z / 1800, 3, 77);
  if (temp > 0.85 && h < 60) return forest > 0.4 || r() < 0.2 ? 'palm' : null;
  if (forest < 0.52) return r() < 0.03 ? (r() < 0.5 ? 'rock' : 'broadleaf') : null;
  if (temp < 0.35 || h > 600) return 'conifer';
  return r() < 0.3 ? 'conifer' : 'broadleaf';
}

function buildChunkDecor(ci, cj, density) {
  const r = rng((ci * 73856093) ^ (cj * 19349663) ^ 0x5eed);
  const group = new THREE.Group();
  const lists = { conifer: [], broadleaf: [], palm: [], cactus: [], rock: [] };
  const houses = [];
  const x0 = ci * CH, z0 = cj * CH;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  const count = Math.round(1100 * density);
  for (let k = 0; k < count; k++) {
    const x = x0 + r() * CH, z = z0 + r() * CH;
    const h = terrainHeight(x, z);
    if (h < 3) continue;
    const slope = Math.abs(terrainHeight(x + 12, z) - h) + Math.abs(terrainHeight(x, z + 12) - h);
    if (slope > 9 || inExcludedZone(x, z)) continue;
    const type = chooseTree(x, z, h, r);
    if (!type) continue;
    const k2 = 0.7 + r() * 0.7;
    m.compose(p.set(x, groundHeight(x, z) - 0.8, z), q.setFromAxisAngle(up, r() * 6.28), s.set(k2, k2 * (0.85 + r() * 0.35), k2));
    lists[type].push(m.clone());
  }

  // villages
  const vCount = Math.round(160 * Math.min(density, 1.5));
  for (let k = 0; k < vCount; k++) {
    const x = x0 + r() * CH, z = z0 + r() * CH;
    if (fbm(x / 2600, z / 2600, 2, 300) < 0.66) continue;
    const h = terrainHeight(x, z);
    if (h < 4 || h > 1200) continue;
    if (Math.abs(terrainHeight(x + 15, z) - h) + Math.abs(terrainHeight(x, z + 15) - h) > 4) continue;
    if (inExcludedZone(x, z)) continue;
    m.compose(p.set(x, groundHeight(x, z) - 0.5, z), q.setFromAxisAngle(up, Math.floor(r() * 4) * Math.PI / 2 + (fbm(x / 400, z / 400, 1, 9) - 0.5)),
      s.set(8 + r() * 7, 5 + r() * 4, 8 + r() * 9));
    houses.push({ m: m.clone(), wall: WALL_COLORS[Math.floor(r() * WALL_COLORS.length)], roof: ROOF_COLORS[Math.floor(r() * ROOF_COLORS.length)] });
  }

  const col = new THREE.Color();
  for (const [type, mats] of Object.entries(lists)) {
    if (!mats.length) continue;
    const im = new THREE.InstancedMesh(TREE_GEOS[type], treeMat, mats.length);
    mats.forEach((mm, i) => {
      im.setMatrixAt(i, mm);
      im.setColorAt(i, col.setHSL(0, 0, 0.82 + r() * 0.3));
    });
    im.computeBoundingSphere();
    group.add(im);
  }
  if (houses.length) {
    const walls = new THREE.InstancedMesh(HOUSE_WALL, houseMat, houses.length);
    const roofs = new THREE.InstancedMesh(HOUSE_ROOF, houseMat, houses.length);
    houses.forEach((hh, i) => {
      walls.setMatrixAt(i, hh.m); roofs.setMatrixAt(i, hh.m);
      walls.setColorAt(i, col.setHex(hh.wall)); roofs.setColorAt(i, col.setHex(hh.roof));
    });
    walls.computeBoundingSphere(); roofs.computeBoundingSphere();
    group.add(walls, roofs);
  }
  return group;
}

// Végétation et maisons : seulement autour du joueur
export class Decor {
  constructor(scene) {
    this.scene = scene;
    this.groups = new Map();
    this.queue = [];
    this.center = null;
    this.radius = 2;
    this.density = 1;
  }

  setOptions({ density, radius }) {
    if (density !== this.density || radius !== this.radius) {
      this.density = density;
      this.radius = radius;
      for (const g of this.groups.values()) this.dispose(g);
      this.groups.clear();
      this.center = null;
    }
  }

  dispose(g) {
    this.scene.remove(g);
    g.traverse((o) => o.isInstancedMesh && o.dispose());
  }

  update(x, z, budgetMs = 4) {
    const ci = Math.floor(x / CH), cj = Math.floor(z / CH);
    if (!this.center || this.center[0] !== ci || this.center[1] !== cj) {
      this.center = [ci, cj];
      const R = this.radius;
      for (const [key, g] of this.groups) {
        const [i, j] = key.split(',').map(Number);
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) > R + 1) { this.dispose(g); this.groups.delete(key); }
      }
      this.queue = [];
      for (let dj = -R; dj <= R; dj++) {
        for (let di = -R; di <= R; di++) {
          const key = `${ci + di},${cj + dj}`;
          if (!this.groups.has(key)) this.queue.push({ key, i: ci + di, j: cj + dj, d: Math.max(Math.abs(di), Math.abs(dj)) });
        }
      }
      this.queue.sort((a, b) => a.d - b.d);
    }
    if (this.density <= 0) return;
    const t0 = performance.now();
    while (this.queue.length && performance.now() - t0 < budgetMs) {
      const job = this.queue.shift();
      const g = buildChunkDecor(job.i, job.j, this.density);
      this.scene.add(g);
      this.groups.set(job.key, g);
    }
  }
}
