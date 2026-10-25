// Vie au sol des aéroports : véhicules de piste et voitures (modèles Kenney « Car Kit », licence CC0,
// models/vehicules/). Tous les véhicules immobiles d'un aéroport sont fusionnés en un seul objet (une seule texture
// commune), affiché seulement quand on est assez près ; un véhicule de service fait le tour du parking.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { groundHeight } from './world.js';

// longueur réelle de chaque véhicule (m) : le modèle est mis à cette échelle
const MODELS = {
  firetruck: 9, truck: 8, van: 5.2, delivery: 6.5, tractor: 3.6, sedan: 4.6, suv: 4.8, taxi: 4.6, ambulance: 6.4, cone: 0.7, box: 1.1,
};
const SHOW_DIST = 6000; // m : au-delà, les véhicules sont cachés (trop petits pour être vus)

async function loadModels(base) {
  const loader = new GLTFLoader();
  const out = {};
  let material = null;
  await Promise.all(Object.entries(MODELS).map(async ([name, len]) => {
    const gltf = await loader.loadAsync(`${base}${name}.glb`);
    gltf.scene.updateMatrixWorld(true);
    const parts = [];
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      material ??= o.material;
      const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      parts.push(g.index ? g.toNonIndexed() : g);
    });
    const geo = mergeGeometries(parts);
    geo.computeBoundingBox();
    const b = geo.boundingBox, size = b.getSize(new THREE.Vector3());
    // posé au sol, centré, mis à l'échelle de sa longueur réelle (le plus grand côté horizontal)
    const s = len / Math.max(size.x, size.z);
    geo.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2).scale(s, s, s);
    // le modèle regarde vers +z : on garde ce sens (yaw 0 = vers +z local de l'aéroport)
    if (size.x > size.z) geo.rotateY(Math.PI / 2);
    out[name] = geo;
  }));
  const mat = new THREE.MeshStandardMaterial({ map: material.map, roughness: 0.55, metalness: 0.1 });
  return { geo: out, mat };
}

// positions dans le repère de l'aéroport (u = travers côté hangars, v = le long de la piste), yaw en radians
function layout(a) {
  const w = a.width / 2, apronLen = Math.min(a.length * 0.6, 900), bx = w + 160;
  const L = [
    ['truck', w + 96, -58, 0], // camion-citerne près de la pompe
    ['firetruck', w + 112, apronLen / 2 - 14, Math.PI / 2], // pompiers au bout du parking, près de la tour
    ['tractor', w + 54, -apronLen / 2 + 112, Math.PI / 2], // tracteur de piste près des avions garés
    ['sedan', bx - 4, apronLen / 2 + 36, 0], ['suv', bx + 1, apronLen / 2 + 36, 0], ['taxi', bx + 6, apronLen / 2 + 36, Math.PI],
    ['van', bx - 26, -apronLen / 2 + 46, Math.PI / 2],
  ];
  for (let i = 0; i < 4; i++) L.push(['cone', w + 30, -apronLen / 2 + 118 + i * 6, 0]);
  for (let i = 0; i < 3; i++) L.push(['box', bx - 24 + (i % 2) * 1.3, -apronLen / 2 + 72 + i * 1.2, i * 0.4]);
  if (a.type !== 'strip') L.push(['delivery', w + 108, 20, 0], ['ambulance', w + 112, apronLen / 2 - 30, Math.PI / 2]);
  if (a.type === 'international') {
    for (let i = 0; i < 3; i++) L.push(['delivery', w + 98, 52 + i * 70, Math.PI], ['tractor', w + 92, 30 + i * 70, 0]);
    for (let i = 0; i < 6; i++) L.push([['sedan', 'suv', 'taxi'][i % 3], bx + 64, 60 + i * 7, -Math.PI / 2]);
  }
  return L;
}

export class AirportLife {
  constructor(scene, airports) {
    this.scene = scene;
    this.airports = airports;
    this.sites = [];
  }
  async load(base = 'models/vehicules/') {
    const { geo, mat } = await loadModels(base);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    const Y = new THREE.Vector3(0, 1, 0);
    const lotMat = new THREE.MeshStandardMaterial({ color: 0x5f6164, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 });
    for (const a of this.airports) {
      const group = new THREE.Group();
      group.position.set(a.x, a.elev, a.z);
      group.rotation.y = a.heading;
      group.updateMatrixWorld(true);
      const parts = [];
      const wp = new THREE.Vector3();
      for (const [name, u, v, yaw] of layout(a)) {
        // hauteur : le sol réel sous le véhicule (au moins le niveau du parking)
        wp.set(u, 0, v).applyMatrix4(group.matrixWorld);
        const y = Math.max(0.17, groundHeight(wp.x, wp.z) - a.elev + 0.02);
        parts.push(geo[name].clone().applyMatrix4(m.compose(p.set(u, y, v), q.setFromAxisAngle(Y, yaw), one)));
      }
      // parking des voitures, au pied de la tour
      const lot = new THREE.Mesh(new THREE.PlaneGeometry(26, 12).rotateX(-Math.PI / 2), lotMat);
      wp.set(a.width / 2 + 161, 0, Math.min(a.length * 0.6, 900) / 2 + 36).applyMatrix4(group.matrixWorld);
      lot.position.set(a.width / 2 + 161, Math.max(0.16, groundHeight(wp.x, wp.z) - a.elev + 0.05), Math.min(a.length * 0.6, 900) / 2 + 36);
      lot.receiveShadow = true;
      group.add(lot);
      const mesh = new THREE.Mesh(mergeGeometries(parts), mat);
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
      // véhicule de service qui fait le tour du parking
      const mover = new THREE.Mesh(geo.van, mat);
      mover.castShadow = true;
      group.add(mover);
      const w = a.width / 2, apronLen = Math.min(a.length * 0.6, 900);
      const loop = [[w + 22, -apronLen / 2 + 20], [w + 118, -apronLen / 2 + 20], [w + 118, apronLen / 2 - 20], [w + 22, apronLen / 2 - 20]];
      const lens = loop.map((pt, i) => Math.hypot(loop[(i + 1) % 4][0] - pt[0], loop[(i + 1) % 4][1] - pt[1]));
      group.visible = false;
      this.scene.add(group);
      this.sites.push({ a, group, mover, loop, lens, total: lens.reduce((s, l) => s + l, 0), t: Math.random() * 1000 });
    }
  }
  // cam : position de la caméra ; seuls les aéroports proches sont affichés et animés
  update(dt, cam) {
    for (const s of this.sites) {
      const near = Math.hypot(s.a.x - cam.x, s.a.z - cam.z) < SHOW_DIST;
      s.group.visible = near;
      if (!near) continue;
      s.t += dt * 8; // 8 m/s, environ 30 km/h
      let d = s.t % s.total, i = 0;
      while (d > s.lens[i]) { d -= s.lens[i]; i++; }
      const [x0, z0] = s.loop[i], [x1, z1] = s.loop[(i + 1) % 4], k = d / s.lens[i];
      s.mover.position.set(x0 + (x1 - x0) * k, 0.17, z0 + (z1 - z0) * k);
      s.mover.rotation.y = Math.atan2(x1 - x0, z1 - z0);
    }
  }
}
