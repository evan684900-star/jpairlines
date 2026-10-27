// Modèles de véhicules (Kenney « Car Kit », licence CC0, models/vehicules/), chargés une seule fois pour tout le jeu
// (aéroports et villes) : chaque modèle devient une seule géométrie, posée au sol, centrée, à sa taille réelle,
// tournée vers +z, et tous partagent la même texture.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// longueur réelle de chaque véhicule (m)
const MODELS = {
  firetruck: 9, truck: 8, van: 5.2, delivery: 6.5, tractor: 3.6, sedan: 4.6, suv: 4.8, taxi: 4.6, ambulance: 6.4, cone: 0.7, box: 1.1,
  police: 4.8, 'hatchback-sports': 4.1, 'sedan-sports': 4.5, 'suv-luxury': 5,
};

let job = null;
export function loadVehicles(base = 'models/vehicules/') {
  job ??= (async () => {
    const loader = new GLTFLoader();
    const geo = {};
    let texture = null;
    await Promise.all(Object.entries(MODELS).map(async ([name, len]) => {
      const gltf = await loader.loadAsync(`${base}${name}.glb`);
      gltf.scene.updateMatrixWorld(true);
      const parts = [];
      gltf.scene.traverse((o) => {
        if (!o.isMesh) return;
        texture ??= o.material.map;
        const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
        for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
        parts.push(g.index ? g.toNonIndexed() : g);
      });
      const g = mergeGeometries(parts);
      g.computeBoundingBox();
      const b = g.boundingBox, size = b.getSize(new THREE.Vector3());
      const s = len / Math.max(size.x, size.z);
      g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2).scale(s, s, s);
      if (size.x > size.z) g.rotateY(Math.PI / 2);
      g.computeBoundingSphere();
      geo[name] = g;
    }));
    const mat = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.55, metalness: 0.1 });
    return { geo, mat };
  })();
  return job;
}
