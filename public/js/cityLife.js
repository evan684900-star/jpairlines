// Vie des villes : des voitures circulent dans les rues (entre les îlots des immeubles, voir CITY_GRIDS dans
// objects.js). Chaque voiture fait le tour d'un pâté de maisons (1 à 3 îlots de côté), sur la voie de droite, en
// suivant le relief. Seules les villes proches de la caméra sont affichées et animées.
import * as THREE from 'three';
import { groundHeight } from './world.js';
import { loadVehicles } from './vehicles.js';
import { CITY_GRIDS } from './objects.js';

const SHOW_DIST = 5000; // m : distance à laquelle une ville s'anime
const CARS = ['sedan', 'suv', 'taxi', 'hatchback-sports', 'sedan-sports', 'suv-luxury', 'van', 'police', 'delivery'];
const WEIGHTS = [5, 4, 2, 2, 1, 2, 2, 1, 1]; // proportions de chaque modèle
const LANE = 3.5; // m : décalage de la voie depuis l'axe de la rue
const STEP = 3; // m : pas du tracé précalculé
const ROAD_W = 13; // m : largeur des rues (asphalte)
const LIFT = 0.22; // m : la chaussée est posée juste au-dessus du sol

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const pick = (r) => {
  let x = r() * WEIGHTS.reduce((a, b) => a + b, 0);
  for (let i = 0; i < CARS.length; i++) { x -= WEIGHTS[i]; if (x < 0) return CARS[i]; }
  return CARS[0];
};

// tour d'un pâté de maisons : points tous les STEP m (x, y, z), sens tel que le pâté soit à droite du conducteur
// (circulation à droite, voie côté trottoir du pâté)
function blockLoop(city, gx, gz, kx, kz) {
  const { c, angle, grid } = city;
  const h = grid / 2 - LANE;
  const u0 = gx - h, u1 = gx + (kx - 1) * grid + h, v0 = gz - h, v1 = gz + (kz - 1) * grid + h;
  // sens horaire vu du dessus (repère x vers la droite, z vers le bas) : le centre est à droite
  const corners = [[u0, v0], [u0, v1], [u1, v1], [u1, v0]];
  const pts = [];
  for (let i = 0; i < 4; i++) {
    const [a0, b0] = corners[i], [a1, b1] = corners[(i + 1) % 4];
    const n = Math.max(1, Math.round(Math.hypot(a1 - a0, b1 - b0) / STEP));
    for (let k = 0; k < n; k++) {
      const u = a0 + ((a1 - a0) * k) / n, v = b0 + ((b1 - b0) * k) / n;
      const x = c.x + u * Math.cos(angle) - v * Math.sin(angle), z = c.z + u * Math.sin(angle) + v * Math.cos(angle);
      pts.push(x, groundHeight(x, z) + LIFT + 0.02, z);
    }
  }
  // vérifie le sens : le centre du pâté doit être à droite du premier tronçon, sinon on inverse
  const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
  const cx = c.x + cu * Math.cos(angle) - cv * Math.sin(angle), cz = c.z + cu * Math.sin(angle) + cv * Math.cos(angle);
  const dx = pts[3] - pts[0], dz = pts[5] - pts[2];
  if ((cx - pts[0]) * -dz + (cz - pts[2]) * dx < 0) {
    const rev = [];
    for (let i = pts.length / 3 - 1; i >= 0; i--) rev.push(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]);
    return new Float32Array(rev);
  }
  return new Float32Array(pts);
}

// chaussée des rues : un ruban qui suit le relief par rue (entre deux carrefours, prolongé pour couvrir les carrefours)
function roadEdge(city, e, pos, uv, idx) {
  const { c, angle, grid } = city;
  const [I, J] = e.slice(1).split(',').map(Number);
  const u0 = I * grid - grid / 2, v0 = J * grid - grid / 2;
  const [du, dv] = e[0] === 'h' ? [1, 0] : [0, 1]; // le long de la rue
  const L = grid + ROAD_W, n = Math.ceil(L / 8);
  const b = pos.length / 3;
  for (let k = 0; k <= n; k++) {
    const t = -ROAD_W / 2 + (L * k) / n;
    for (const side of [-1, 1]) {
      const u = u0 + du * t - dv * side * ROAD_W / 2, v = v0 + dv * t + du * side * ROAD_W / 2;
      const x = c.x + u * Math.cos(angle) - v * Math.sin(angle), z = c.z + u * Math.sin(angle) + v * Math.cos(angle);
      pos.push(x, groundHeight(x, z) + LIFT, z);
      uv.push((side + 1) * 0.5 * ROAD_W / 8, (t + I * 7 + J * 11) / 8);
    }
    if (k < n) { const a = b + k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } // faces tournées vers le haut
  }
}
function roadMesh(pos, uv, idx, mat) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  return m;
}

export class CityLife {
  constructor(scene) {
    this.scene = scene;
    this.cities = [];
  }
  async load() {
    this.res = await loadVehicles();
    const tex = new THREE.TextureLoader().load('textures/bitume-couleur.jpg');
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    this.roadMat = new THREE.MeshStandardMaterial({ map: tex, color: 0x9a9a9c, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    for (const city of CITY_GRIDS) if (city.cells.size) this.cities.push({ c: city.c, grid: city, built: false });
  }
  // voitures et rues d'une ville, préparées la première fois qu'on s'en approche. Le tracé suit le relief (calcul un
  // peu long pour une grande ville) : le travail est découpé en petits morceaux, quelques millisecondes par image.
  *build(city) {
    const { geo, mat } = this.res;
    const r = rng(Math.round(city.c.x * 7 + city.c.z * 13));
    const cells = [...city.grid.cells].map((k) => k.split(',').map(Number));
    const n = Math.min(320, Math.max(20, Math.round(cells.length * 0.45)));
    const cars = [];
    // rues : les quatre côtés de chaque îlot bâti et le tour de chaque pâté parcouru (indices des carrefours)
    const edges = new Set();
    const addEdges = (I0, J0, I1, J1) => {
      for (let I = I0; I < I1; I++) { edges.add(`h${I},${J0}`); edges.add(`h${I},${J1}`); }
      for (let J = J0; J < J1; J++) { edges.add(`v${I0},${J}`); edges.add(`v${I1},${J}`); }
    };
    const G = city.grid.grid;
    for (const [gx, gz] of cells) addEdges(gx / G, gz / G, gx / G + 1, gz / G + 1);
    for (let i = 0; i < n; i++) {
      const [gx, gz] = cells[Math.floor(r() * cells.length)];
      const kx = 1 + Math.floor(r() * 3), kz = 1 + Math.floor(r() * 3);
      addEdges(gx / G, gz / G, gx / G + kx, gz / G + kz);
      const path = blockLoop(city.grid, gx, gz, kx, kz);
      const len = path.length / 3;
      cars.push({ model: pick(r), path, len, s: r() * len * STEP, speed: 8 + r() * 6 });
      if (i % 8 === 7) yield;
    }
    // une forme instanciée par modèle de voiture
    const meshes = {};
    for (const name of CARS) {
      const count = cars.filter((car) => car.model === name).length;
      if (!count) continue;
      const im = new THREE.InstancedMesh(geo[name], mat, count);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.castShadow = im.receiveShadow = true;
      // sphère englobante : toute la ville (les voitures y bougent)
      im.boundingSphere = new THREE.Sphere(new THREE.Vector3(city.c.x, groundHeight(city.c.x, city.c.z), city.c.z), city.c.radius + 200);
      this.scene.add(im);
      meshes[name] = { im, next: 0 };
    }
    const pos = [], uv = [], idx = [];
    let k = 0;
    for (const e of edges) { roadEdge(city.grid, e, pos, uv, idx); if (++k % 60 === 0) yield; }
    const road = roadMesh(pos, uv, idx, this.roadMat);
    this.scene.add(road);
    Object.assign(city, { cars, meshes, road, built: true });
  }
  update(dt, cam) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), Y = new THREE.Vector3(0, 1, 0);
    for (const city of this.cities) {
      const near = Math.hypot(city.c.x - cam.x, city.c.z - cam.z) < SHOW_DIST + city.c.radius;
      if (near && !city.built) {
        city.job ??= this.build(city);
        const t0 = performance.now();
        while (!city.built && performance.now() - t0 < 8) city.job.next();
      }
      if (!city.built) continue;
      for (const k of Object.values(city.meshes)) k.im.visible = near;
      city.road.visible = near;
      if (!near) continue;
      for (const k of Object.values(city.meshes)) k.next = 0;
      for (const car of city.cars) {
        car.s = (car.s + car.speed * dt) % (car.len * STEP);
        const f = car.s / STEP, i = Math.floor(f) % car.len, j = (i + 1) % car.len, t = f - Math.floor(f);
        const P = car.path;
        p.set(P[i * 3] + (P[j * 3] - P[i * 3]) * t, P[i * 3 + 1] + (P[j * 3 + 1] - P[i * 3 + 1]) * t, P[i * 3 + 2] + (P[j * 3 + 2] - P[i * 3 + 2]) * t);
        // cap lissé : direction entre le point précédent et le suivant (virages adoucis)
        const a = (i - 1 + car.len) % car.len, b = (i + 2) % car.len;
        q.setFromAxisAngle(Y, Math.atan2(P[b * 3] - P[a * 3], P[b * 3 + 2] - P[a * 3 + 2]));
        const k = city.meshes[car.model];
        k.im.setMatrixAt(k.next++, m.compose(p, q, one));
      }
      for (const k of Object.values(city.meshes)) k.im.instanceMatrix.needsUpdate = true;
    }
  }
}
