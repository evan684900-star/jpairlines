import * as THREE from 'three';
import { WORLD, AIRPORTS, CITIES, climate, snowLine, fbm, rng, groundHeight, terrainHeight, runwayLocal } from './world.js';
import { createBuildingMaterial } from './render/materials.js';
import { injectShared } from './render/shared.js';

const CH = WORLD.chunk;

// Fusionne plusieurs géométries (indexées) en une seule, avec une couleur par morceau
export function mergeColored(parts) {
  const pos = [], nor = [], col = [], idx = [];
  for (const [g0, color] of parts) {
    const g = g0;
    const c = new THREE.Color(color);
    const base = pos.length / 3;
    const p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      col.push(c.r, c.g, c.b);
    }
    if (g.index) for (const k of g.index.array) idx.push(base + k);
    else for (let i = 0; i < p.count; i++) idx.push(base + i);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.setIndex(idx);
  return out;
}

const TRUNK = 0x4a3526;
// bruit déterministe selon la position : les sommets dupliqués bougent pareil (pas de fissures)
const prand = (x, y, z, k) => { const v = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + k * 4.581) * 43758.5453; return v - Math.floor(v); };

// assombrit le bas du feuillage (occlusion ambiante simple)
function shadeByHeight(geo, h0, h1, min = 0.55) {
  const p = geo.attributes.position, c = geo.attributes.color;
  for (let i = 0; i < p.count; i++) {
    const k = min + (1 - min) * Math.min(1, Math.max(0, (p.getY(i) - h0) / (h1 - h0)));
    c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k);
  }
  return geo;
}
function jitter(geo, amount) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = Math.round(p.getX(i) * 100) / 100, y = Math.round(p.getY(i) * 100) / 100, z = Math.round(p.getZ(i) * 100) / 100;
    p.setXYZ(i, x + (prand(x, y, z, 1) - 0.5) * amount, y + (prand(x, y, z, 2) - 0.5) * amount * 0.5, z + (prand(x, y, z, 3) - 0.5) * amount);
  }
  return geo;
}
function finish(geo, h0, h1) {
  shadeByHeight(geo, h0, h1);
  geo.computeVertexNormals();
  return geo;
}

const TREE_GEOS = {
  conifer: finish(mergeColored([
    [new THREE.CylinderGeometry(0.25, 0.45, 5, 6).translate(0, 2.5, 0), TRUNK],
    [jitter(new THREE.ConeGeometry(3.6, 6, 9, 2), 0.4).translate(0, 5, 0), 0x22402a],
    [jitter(new THREE.ConeGeometry(3.0, 5.5, 9, 2), 0.35).translate(0, 8, 0), 0x264630],
    [jitter(new THREE.ConeGeometry(2.3, 5, 8, 2), 0.3).translate(0, 11, 0), 0x2a4b31],
    [jitter(new THREE.ConeGeometry(1.4, 4, 7, 1), 0.2).translate(0, 14, 0), 0x2e5034],
  ]), 2, 16),
  broadleaf: finish(mergeColored([
    [new THREE.CylinderGeometry(0.3, 0.5, 5, 6).translate(0, 2.5, 0), TRUNK],
    [jitter(new THREE.IcosahedronGeometry(3.4, 1), 0.7).scale(1, 0.85, 1).translate(0, 7.5, 0), 0x3d5d2a],
    [jitter(new THREE.IcosahedronGeometry(2.6, 1), 0.6).translate(1.9, 6.6, 0.8), 0x456730],
    [jitter(new THREE.IcosahedronGeometry(2.5, 1), 0.6).translate(-1.6, 6.9, -1.0), 0x3a5828],
    [jitter(new THREE.IcosahedronGeometry(2.2, 1), 0.5).translate(0.3, 9.6, -0.4), 0x4b6e33],
  ]), 3, 11),
  palm: finish(mergeColored([
    [new THREE.CylinderGeometry(0.22, 0.32, 4, 6).translate(0, 2, 0), 0x7a6248],
    [new THREE.CylinderGeometry(0.2, 0.22, 4, 6).rotateZ(0.12).translate(0.25, 5.9, 0), 0x7a6248],
    [new THREE.CylinderGeometry(0.18, 0.2, 3, 6).rotateZ(0.22).translate(0.75, 9.3, 0), 0x7a6248],
    ...[0, 1, 2, 3, 4, 5, 6].map((k) => [new THREE.BoxGeometry(4.6, 0.08, 0.9).translate(2.3, 0, 0).rotateZ(-0.45).rotateY((k / 7) * Math.PI * 2).translate(1.1, 10.7, 0), k % 2 ? 0x4c7a34 : 0x41692c]),
  ]), 6, 11),
  cactus: finish(mergeColored([
    [new THREE.CylinderGeometry(0.45, 0.5, 6, 8).translate(0, 3, 0), 0x56733f],
    [new THREE.CylinderGeometry(0.3, 0.3, 2, 6).rotateZ(Math.PI / 2).translate(1, 3, 0), 0x56733f],
    [new THREE.CylinderGeometry(0.3, 0.3, 2.2, 6).translate(1.9, 4, 0), 0x56733f],
  ]), 0, 6),
  rock: finish(mergeColored([[jitter(new THREE.DodecahedronGeometry(2.5, 1), 0.9).scale(1.3, 0.7, 1), 0x7d776f]]), -1, 2),
};
// versions simplifiées pour les arbres lointains (niveau de détail)
const TREE_GEOS_FAR = {
  conifer: finish(mergeColored([
    [new THREE.CylinderGeometry(0.3, 0.45, 4, 4).translate(0, 2, 0), TRUNK],
    [new THREE.ConeGeometry(3.4, 13, 6, 1).translate(0, 9, 0), 0x264630],
  ]), 2, 16),
  broadleaf: finish(mergeColored([
    [new THREE.CylinderGeometry(0.35, 0.5, 5, 4).translate(0, 2.5, 0), TRUNK],
    [new THREE.IcosahedronGeometry(3.8, 0).scale(1.1, 0.95, 1.1).translate(0, 7.8, 0), 0x41622c],
  ]), 3, 11),
  palm: TREE_GEOS.palm,
  cactus: TREE_GEOS.cactus,
  rock: TREE_GEOS.rock,
};
const HOUSE_WALL = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const HOUSE_ROOF = new THREE.ConeGeometry(0.78, 0.55, 4).rotateY(Math.PI / 4).translate(0, 1.27, 0);
const WALL_COLORS = [0xe9e1cf, 0xdccbb0, 0xcdbb9c, 0xf0ebe0, 0xc4ad8a, 0xd8c4b4];
const ROOF_COLORS = [0x8e3b2a, 0x733226, 0x4a403c, 0x9a4a2c, 0x5a463c];

const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
// les arbres ondulent doucement dans le vent (le haut bouge, le pied reste fixe)
treeMat.onBeforeCompile = (shader) => {
  injectShared(shader);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nuniform float jpTime;')
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 jpBase = instanceMatrix[3].xyz;
        float jpSway = max(0.0, position.y - 2.0) * 0.012;
        transformed.x += sin(jpTime * 1.3 + jpBase.x * 0.05 + jpBase.z * 0.03) * jpSway;
        transformed.z += cos(jpTime * 1.1 + jpBase.z * 0.05) * jpSway * 0.7;
      #endif`);
};
const wallMat = createBuildingMaterial({ floor: 2.9, bay: 2.6, glass: 0.45 });
const roofMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75 });

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
    im.userData.tree = type;
    im.castShadow = true;
    im.receiveShadow = true;
    mats.forEach((mm, i) => {
      im.setMatrixAt(i, mm);
      im.setColorAt(i, col.setRGB(0.8 + r() * 0.3, 0.8 + r() * 0.3, 0.75 + r() * 0.25));
    });
    im.computeBoundingSphere();
    group.add(im);
  }
  if (houses.length) {
    const walls = new THREE.InstancedMesh(HOUSE_WALL, wallMat, houses.length);
    const roofs = new THREE.InstancedMesh(HOUSE_ROOF, roofMat, houses.length);
    walls.castShadow = roofs.castShadow = true;
    walls.receiveShadow = roofs.receiveShadow = true;
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

  // niveau de détail : arbres complets près du joueur, simplifiés plus loin
  applyLod(g, i, j) {
    const far = Math.max(Math.abs(i - this.center[0]), Math.abs(j - this.center[1])) > 1;
    for (const o of g.children) if (o.userData.tree) o.geometry = (far ? TREE_GEOS_FAR : TREE_GEOS)[o.userData.tree];
  }

  update(x, z, budgetMs = 4) {
    const ci = Math.floor(x / CH), cj = Math.floor(z / CH);
    if (!this.center || this.center[0] !== ci || this.center[1] !== cj) {
      this.center = [ci, cj];
      for (const [key, g] of this.groups) { const [i, j] = key.split(',').map(Number); this.applyLod(g, i, j); }
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
      this.applyLod(g, job.i, job.j);
    }
  }
}
