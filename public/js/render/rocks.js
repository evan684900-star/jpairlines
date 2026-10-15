// Rochers photogrammétriques (modèles glTF de la démo d'EZ-Tree, MIT) : couleur, relief et rugosité réels.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class RockLibrary {
  async load() {
    const loader = new GLTFLoader();
    const files = ['rock1', 'rock2', 'rock3'];
    this.variants = (await Promise.all(files.map((f) => loader.loadAsync(`/vendor/ez-tree/models/${f}.glb`).catch(() => null))))
      .filter(Boolean)
      .map((gltf) => {
        let mesh = null;
        gltf.scene.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
        const geo = mesh.geometry.clone();
        mesh.updateWorldMatrix(true, false);
        geo.applyMatrix4(mesh.matrixWorld);
        // taille normalisée : 1 m de large, posé au sol
        geo.computeBoundingBox();
        const b = geo.boundingBox, size = Math.max(b.max.x - b.min.x, b.max.z - b.min.z);
        geo.translate(-(b.min.x + b.max.x) / 2, -b.min.y - 0.15 * (b.max.y - b.min.y), -(b.min.z + b.max.z) / 2);
        geo.scale(1 / size, 1 / size, 1 / size);
        const mat = mesh.material;
        mat.side = THREE.FrontSide;
        return { geo, mat };
      });
    return this;
  }

  // rocks : [{ m: Matrix4, v }] → un maillage instancié par modèle
  meshes(rocks) {
    const out = [];
    this.variants.forEach((vr, vi) => {
      const list = rocks.filter((r) => r.v % this.variants.length === vi);
      if (!list.length) return;
      const im = new THREE.InstancedMesh(vr.geo, vr.mat, list.length);
      list.forEach((r, i) => im.setMatrixAt(i, r.m));
      im.castShadow = im.receiveShadow = true;
      im.computeBoundingSphere();
      out.push(im);
    });
    return out;
  }
}
