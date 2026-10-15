// Prépare la version Poki (dossier poki/) : copie les bibliothèques (three.js, EZ-Tree) dans poki/vendor
// puis crée dist/jpairlines-poki.zip, prêt à envoyer sur developers.poki.com.
// Usage : node scripts/build-poki.js   (lance d'abord npm run build si public/vendor n'existe pas)
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const vendor = path.join(root, 'public/vendor');
if (!fs.existsSync(path.join(vendor, 'three.module.js'))) execSync('node scripts/build.js', { cwd: root, stdio: 'inherit' });
const out = path.join(root, 'poki/vendor');
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(vendor, out, { recursive: true });

// archive : uniquement ce qui sert au jeu (pas de cartes de source, licences gardées)
const dist = path.join(root, 'dist');
fs.mkdirSync(dist, { recursive: true });
const zip = path.join(dist, 'jpairlines-poki.zip');
fs.rmSync(zip, { force: true });
execSync(`zip -qr -9 "${zip}" . -x "*.map" -x "*.DS_Store" -x "LISEZMOI.md"`, { cwd: path.join(root, 'poki') });
const mb = (fs.statSync(zip).size / 1048576).toFixed(1);
console.log(`Version Poki prête : dist/jpairlines-poki.zip (${mb} Mo)`);
