// Prépare public/vendor (hébergement statique, Vercel, et serveur local) :
// - three.js et ses modules complémentaires ;
// - EZ-Tree (générateur d'arbres réalistes, MIT) adapté au navigateur sans bundler :
//   imports avec extension, presets JSON → modules JS, textures (écorce, feuilles) chargées à la demande ;
// - rochers en glTF de la démo d'EZ-Tree.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dest = path.join(root, 'public/vendor');
const jsm = path.join(root, 'node_modules/three/examples/jsm');
fs.mkdirSync(dest, { recursive: true });
fs.copyFileSync(path.join(root, 'node_modules/three/build/three.module.js'), path.join(dest, 'three.module.js'));

// modules complémentaires utilisés par le jeu (dossiers entiers : ils s'importent entre eux)
const ADDONS = ['objects', 'postprocessing', 'shaders', 'utils', 'environments', 'geometries', 'loaders/GLTFLoader.js'];
for (const f of ADDONS) {
  fs.cpSync(path.join(jsm, f), path.join(dest, 'addons', f), { recursive: true });
}

// ----- EZ-Tree -----
const ez = path.join(root, 'node_modules/@dgreenheck/ez-tree/src');
const ezOut = path.join(dest, 'ez-tree');
fs.rmSync(ezOut, { recursive: true, force: true });
fs.cpSync(path.join(ez, 'lib'), ezOut, { recursive: true });
const withExt = (code) => code.replace(/(from\s+['"])(\.{1,2}\/[^'"]+?)(['"])/g, (m, a, p, b) => {
  if (p.endsWith('.json')) return `${a}${p.slice(0, -5)}.js${b}`;
  return /\.\w+$/.test(p) ? m : `${a}${p}.js${b}`;
});
for (const dir of [ezOut, path.join(ezOut, 'presets')]) {
  for (const f of fs.readdirSync(dir)) {
    const file = path.join(dir, f);
    if (f.endsWith('.json')) {
      fs.writeFileSync(file.replace(/\.json$/, '.js'), `export default ${fs.readFileSync(file, 'utf8')};\n`);
      fs.rmSync(file);
    } else if (f.endsWith('.js')) {
      fs.writeFileSync(file, withExt(fs.readFileSync(file, 'utf8')));
    }
  }
}
// textures : chemins relatifs au module, chargement seulement quand une essence est utilisée
fs.writeFileSync(path.join(ezOut, 'textures.js'), `import * as THREE from 'three';
const loader = new THREE.TextureLoader();
const cache = new Map();
const load = (rel, srgb) => {
  if (cache.has(rel)) return cache.get(rel);
  const t = loader.load(new URL(rel, import.meta.url).href);
  t.premultiplyAlpha = true;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  cache.set(rel, t);
  return t;
};
export function getBarkTexture(barkType, fileType, scale = { x: 1, y: 1 }) {
  const t = load(\`./assets/bark/\${barkType}_\${fileType}_1k.jpg\`, fileType === 'color').clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(scale.x, 1 / scale.y);
  t.needsUpdate = true;
  return t;
}
export function getLeafTexture(leafType) {
  return load(\`./assets/leaves/\${leafType}_color.png\`, true);
}
`);
// rochers (démo d'EZ-Tree)
fs.mkdirSync(path.join(ezOut, 'models'), { recursive: true });
for (const f of ['rock1.glb', 'rock2.glb', 'rock3.glb']) fs.copyFileSync(path.join(ez, 'app/public', f), path.join(ezOut, 'models', f));
fs.copyFileSync(path.join(root, 'node_modules/@dgreenheck/ez-tree/LICENSE'), path.join(ezOut, 'LICENSE'));

console.log('three.js et EZ-Tree copiés dans public/vendor');
