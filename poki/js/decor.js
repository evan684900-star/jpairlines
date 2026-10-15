import * as THREE from 'three';
import { WORLD, AIRPORTS, CITIES, climate, snowLine, fbm, rng, groundHeight, terrainHeight, runwayLocal } from './world.js';
import { injectShared } from './render/shared.js';
import { variantsOf, TREE_STRIDE } from './render/trees.js';
import { WALL_COLORS, ROOF_COLORS } from './render/buildings.js';

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

// assombrit le bas du feuillage (occlusion ambiante simple)
function shadeByHeight(geo, h0, h1, min = 0.55) {
  const p = geo.attributes.position, c = geo.attributes.color;
  for (let i = 0; i < p.count; i++) {
    const k = min + (1 - min) * Math.min(1, Math.max(0, (p.getY(i) - h0) / (h1 - h0)));
    c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k);
  }
  return geo;
}
function finish(geo, h0, h1) {
  shadeByHeight(geo, h0, h1);
  geo.computeVertexNormals();
  return geo;
}

// palmiers et cactus (géométrie simple, colorée par sommet)
const SIMPLE_GEOS = {
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
};

const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
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

function inExcludedZone(x, z) {
  for (const a of AIRPORTS) {
    if (Math.abs(x - a.x) > a.reach || Math.abs(z - a.z) > a.reach) continue;
    const { u, v } = runwayLocal(a, x, z);
    if (Math.abs(u) < a.width / 2 + a.pad + 40 && Math.abs(v) < a.length / 2 + 300) return true;
  }
  for (const c of CITIES) if (Math.hypot(x - c.x, z - c.z) < c.radius) return true;
  return false;
}

// Campagne (hors forêts) : arbres isolés, buissons, rochers, palmiers des côtes, cactus du désert
function chooseSparse(x, z, h, r) {
  const { temp, dry } = climate(x, z);
  if (h > snowLine(temp) - 150) return r() < 0.15 ? 'rock' : null;
  if (dry > 0.62 && temp > 0.45) return r() < 0.35 ? (r() < 0.6 ? 'cactus' : 'rock') : null;
  if (temp > 0.85 && h < 60) return 'palm';
  const v = r();
  return v < 0.3 ? 'broadleaf' : v < 0.65 ? 'bush' : v < 0.8 ? 'rock' : null;
}

// libs : { trees, houses, rocks } ; opts : { density (réglage végétation), forest (arbres/km² en forêt) }
function buildChunkDecor(ci, cj, opts, libs) {
  const r = rng((ci * 73856093) ^ (cj * 19349663) ^ 0x5eed);
  const group = new THREE.Group();
  const simple = { palm: [], cactus: [] }, rocks = [], houses = [];
  const x0 = ci * CH, z0 = cj * CH;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const pick = { conifer: variantsOf('conifer'), broadleaf: variantsOf('broadleaf'), bush: variantsOf('bush') };
  const density = opts.density;
  // arbres : tableau compact [x, y, z, rotation, échelle, variante]
  const spacing = Math.sqrt(1e6 / Math.max(50, opts.forest * density));
  const cap = Math.ceil((CH / spacing + 1) ** 2) + 2000;
  let data = new Float32Array(cap * TREE_STRIDE), n = 0;
  const addTree = (x, y, z, kind, scale) => {
    if (n >= cap) return;
    const list = pick[kind], o = n * TREE_STRIDE;
    data[o] = x; data[o + 1] = y; data[o + 2] = z; data[o + 3] = r() * 6.283; data[o + 4] = scale; data[o + 5] = list[Math.floor(r() * list.length)];
    n++;
  };
  const place = (x, z, kind, h) => {
    const y = terrainHeight(x, z) - 0.25;
    if (pick[kind]) addTree(x, y, z, kind, 0.75 + r() * 0.55);
    else if (kind === 'rock') {
      const k2 = 1.2 + r() ** 2 * 5;
      m.compose(p.set(x, y + 0.15, z), q.setFromAxisAngle(up, r() * 6.28), s.set(k2, k2 * (0.5 + r() * 0.5), k2 * (0.7 + r() * 0.5)));
      rocks.push({ m: m.clone(), v: Math.floor(r() * 3) });
    } else {
      const k2 = 0.7 + r() * 0.7;
      m.compose(p.set(x, y - 0.55, z), q.setFromAxisAngle(up, r() * 6.28), s.set(k2, k2 * (0.85 + r() * 0.35), k2));
      simple[kind].push(m.clone());
    }
    return h;
  };
  // forêts : grille irrégulière, densité réglable (couvert continu vu d'avion)
  if (density > 0) {
    for (let gz = z0; gz < z0 + CH; gz += spacing) {
      for (let gx = x0; gx < x0 + CH; gx += spacing) {
        const x = gx + r() * spacing, z = gz + r() * spacing;
        const forest = fbm(x / 1800, z / 1800, 3, 77);
        if (forest < 0.5 || r() > Math.min(1, (forest - 0.5) * 8)) continue;
        const h = terrainHeight(x, z);
        if (h < 3) continue;
        const { temp, dry } = climate(x, z);
        if (h > snowLine(temp) - 150 || (dry > 0.62 && temp > 0.45)) continue;
        if (Math.abs(terrainHeight(x + 8, z) - h) + Math.abs(terrainHeight(x, z + 8) - h) > 7) continue;
        if (inExcludedZone(x, z)) continue;
        if (temp > 0.85 && h < 60) { if (r() < 0.25) place(x, z, 'palm', h); continue; }
        const v = r();
        const kind = temp < 0.35 || h > 600 ? (v < 0.04 ? 'bush' : 'conifer') : v < 0.3 ? 'conifer' : v < 0.88 ? 'broadleaf' : 'bush';
        place(x, z, kind, h);
      }
    }
    // campagne : éléments isolés
    const sparse = Math.round(700 * density);
    for (let k = 0; k < sparse; k++) {
      const x = x0 + r() * CH, z = z0 + r() * CH;
      if (fbm(x / 1800, z / 1800, 3, 77) >= 0.5) continue;
      const h = terrainHeight(x, z);
      if (h < 3) continue;
      if (Math.abs(terrainHeight(x + 12, z) - h) + Math.abs(terrainHeight(x, z + 12) - h) > 9 || inExcludedZone(x, z)) continue;
      const kind = chooseSparse(x, z, h, r);
      if (kind) place(x, z, kind, h);
    }
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
    const kind = r();
    const type = kind < 0.24 ? 0 : kind < 0.5 ? 1 : kind < 0.62 ? 2 : kind < 0.78 ? 3 : kind < 0.86 ? 4 : 5;
    const k2 = 0.9 + r() * 0.25;
    m.compose(p.set(x, groundHeight(x, z) - 0.3, z), q.setFromAxisAngle(up, Math.floor(r() * 4) * Math.PI / 2 + (fbm(x / 400, z / 400, 1, 9) - 0.5)), s.set(k2, k2, k2));
    houses.push({ m: m.clone(), type, wall: WALL_COLORS[Math.floor(r() * WALL_COLORS.length)], roof: ROOF_COLORS[Math.floor(r() * ROOF_COLORS.length)] });
  }

  data = data.slice(0, n * TREE_STRIDE);
  if (n) group.add(libs.trees.impostors(data, n, new THREE.Vector3(x0 + CH / 2, 300, z0 + CH / 2)));
  for (const [type, mats] of Object.entries(simple)) {
    if (!mats.length) continue;
    const im = new THREE.InstancedMesh(SIMPLE_GEOS[type], treeMat, mats.length);
    im.castShadow = im.receiveShadow = true;
    const col = new THREE.Color();
    mats.forEach((mm, i) => { im.setMatrixAt(i, mm); im.setColorAt(i, col.setRGB(0.8 + r() * 0.3, 0.8 + r() * 0.3, 0.75 + r() * 0.25)); });
    im.computeBoundingSphere();
    group.add(im);
  }
  for (const mesh of [...(rocks.length ? libs.rocks.meshes(rocks) : []), ...(houses.length ? libs.houses.meshes(houses) : [])]) group.add(mesh);
  group.userData.trees = { data, n };
  return group;
}

// Végétation et maisons : seulement autour du joueur (arbres 3D tout près, imposteurs plus loin)
export class Decor {
  constructor(scene) {
    this.scene = scene;
    this.groups = new Map();
    this.queue = [];
    this.center = null;
    this.radius = 2;
    this.density = 1;
    this.libs = null;
    this.near = null;
    this.nearRadius = 200;
    this.nearMax = 300;
    this.forest = 6000;
  }

  // bibliothèques chargées de façon asynchrone (arbres EZ-Tree, maisons, rochers)
  setLibraries(libs, nearTrees) {
    this.libs = libs;
    this.near = nearTrees;
    this.center = null;
  }

  // density : réglage « végétation » ; radius : en morceaux de 2 km ; q : préréglage de qualité (forêts, arbres 3D)
  setOptions({ density, radius, q }) {
    if (q) { this.nearRadius = q.nearTrees; this.nearMax = q.nearTreeMax; }
    const forest = q ? q.forestDensity : this.forest;
    if (density !== this.density || radius !== this.radius || forest !== this.forest) {
      this.density = density;
      this.radius = radius;
      this.forest = forest;
      for (const g of this.groups.values()) this.dispose(g);
      this.groups.clear();
      this.center = null;
    }
  }

  dispose(g) {
    this.scene.remove(g);
    g.traverse((o) => {
      if (o.userData.disposeGeometry) o.geometry.dispose();
      if (!o.isInstancedMesh) return;
      o.dispose();
    });
  }

  // camPos : position de la caméra (arbres 3D autour d'elle)
  update(x, z, budgetMs = 4, dt = 0, camPos = null) {
    if (!this.libs) return;
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
    if (this.density > 0) {
      const t0 = performance.now();
      while (this.queue.length && performance.now() - t0 < budgetMs) {
        const job = this.queue.shift();
        const g = buildChunkDecor(job.i, job.j, { density: this.density, forest: this.forest }, this.libs);
        this.scene.add(g);
        this.groups.set(job.key, g);
      }
    }
    // arbres 3D : morceaux autour de la caméra
    if (this.near && camPos) {
      const ki = Math.floor(camPos.x / CH), kj = Math.floor(camPos.z / CH);
      const lists = [];
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const g = this.groups.get(`${ki + di},${kj + dj}`);
        if (g) lists.push(g.userData.trees);
      }
      this.near.update(dt, camPos, lists, this.nearRadius, this.nearMax);
    }
  }
}
