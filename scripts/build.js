// Copie three.js et ses modules complémentaires dans public/vendor pour un hébergement statique (Vercel).
// En local, server.js les sert directement depuis node_modules.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dest = path.join(root, 'public/vendor');
const jsm = path.join(root, 'node_modules/three/examples/jsm');
fs.mkdirSync(dest, { recursive: true });
fs.copyFileSync(path.join(root, 'node_modules/three/build/three.module.js'), path.join(dest, 'three.module.js'));

// modules complémentaires utilisés par le jeu (dossiers entiers : ils s'importent entre eux)
const ADDONS = ['objects', 'postprocessing', 'shaders', 'utils', 'loaders/GLTFLoader.js'];
for (const f of ADDONS) {
  fs.cpSync(path.join(jsm, f), path.join(dest, 'addons', f), { recursive: true });
}
console.log('three.js copié dans public/vendor');
