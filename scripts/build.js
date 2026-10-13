// Copie three.js dans public/vendor pour un hébergement statique (Vercel).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dest = path.join(root, 'public/vendor');
fs.mkdirSync(dest, { recursive: true });
fs.copyFileSync(path.join(root, 'node_modules/three/build/three.module.js'), path.join(dest, 'three.module.js'));
console.log('three.js copié dans public/vendor');
