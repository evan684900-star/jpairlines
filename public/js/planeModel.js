// Modèles 3D des avions, construits à partir de leur description (aircraft.js) : nez vers -Z.
import * as THREE from 'three';
import { aircraftById } from './aircraft.js';
import { cleanLivery } from './livery.js';
import { dressPilot } from './pilotOutfit.js';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { stickerTexture, drawSticker } from './stickers.js';
// couleur claire (immatriculation en couleur sur fond clair : contour sombre pour rester lisible)
const inkLight = (h) => { const n = parseInt(h.slice(1), 16); return ((n >> 16) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11) > 150; };

// Relie des anneaux de points (même nombre de points) en une surface lisse
// glassOf(i, j, p) (optionnel) : sommets de vitre ; la géométrie a alors 2 groupes (0 = carrosserie, 1 = vitres)
function loft(rings, colorOf, caps = true, glassOf = null) {
  const M = rings[0].length;
  const pos = [], col = [], idx = [], glass = [];
  const c = new THREE.Color();
  rings.forEach((ring, i) => ring.forEach((p, j) => {
    pos.push(p.x, p.y, p.z);
    colorOf(c, i, j, p);
    col.push(c.r, c.g, c.b);
    glass.push(glassOf ? glassOf(i, j, p) : false);
  }));
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < M; j++) {
      const a = i * M + j, b = i * M + ((j + 1) % M), cc = (i + 1) * M + j, d = (i + 1) * M + ((j + 1) % M);
      idx.push(a, cc, b, b, cc, d);
    }
  }
  if (caps) {
    for (const i of [0, rings.length - 1]) {
      const ctr = rings[i].reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(M);
      const ci = pos.length / 3;
      glass.push(false);
      pos.push(ctr.x, ctr.y, ctr.z);
      colorOf(c, i, 0, ctr);
      col.push(c.r, c.g, c.b);
      for (let j = 0; j < M; j++) idx.push(ci, i * M + j, i * M + ((j + 1) % M));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  if (glassOf) {
    // carrosserie d'abord, vitres ensuite
    const body = [], win = [];
    for (let t = 0; t < idx.length; t += 3) (glass[idx[t]] && glass[idx[t + 1]] && glass[idx[t + 2]] ? win : body).push(idx[t], idx[t + 1], idx[t + 2]);
    g.setIndex([...body, ...win]);
    g.addGroup(0, body.length, 0);
    g.addGroup(body.length, win.length, 1);
  } else g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Halo lumineux (feux de navigation, phare) : texture radiale partagée
let glowTex = null;
function glowTexture() {
  if (glowTex) return glowTex;
  const S = 64, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const gr = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.15, 'rgba(255,255,255,0.6)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, S, S);
  glowTex = new THREE.CanvasTexture(cv);
  return glowTex;
}

// Planche de bord par défaut (remplacée par les instruments animés pour l'avion du joueur)
function defaultPanelTexture() {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 192;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#23272c';
  ctx.fillRect(0, 0, 512, 192);
  for (let i = 0; i < 6; i++) {
    const x = 70 + (i % 3) * 86 + (i >= 3 ? 0 : 0), y = 55 + Math.floor(i / 3) * 84;
    ctx.beginPath(); ctx.arc(x, y, 36, 0, Math.PI * 2); ctx.fillStyle = '#0c0d0f'; ctx.fill();
    ctx.strokeStyle = '#555'; ctx.lineWidth = 3; ctx.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Profil d'aile (type NACA 00xx), points de l'extrados puis de l'intrados
function airfoil(n, thick, from = 0, to = 1) {
  const pts = [];
  const yt = (x) => 5 * thick * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1015 * x ** 4);
  for (let i = 0; i < n; i++) {
    const t = from + (to - from) * (1 - Math.cos((i / (n - 1)) * Math.PI)) / 2;
    pts.push([t, yt(t)]);
  }
  const upper = pts.slice().reverse();
  const lower = pts.slice(1, -1).map(([x, y]) => [x, -y]);
  return [...upper, ...lower];
}

const lerp = (a, b, t) => a + (b - a) * t;
function interpKeys(keys, step) {
  const out = [];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    const n = Math.max(1, Math.round((b[0] - a[0]) / step));
    for (let k = 0; k < n; k++) out.push(a.map((v, m) => lerp(v, b[m], k / n)));
  }
  out.push(keys[keys.length - 1]);
  return out;
}


// anneau de section « superellipse » (fuselage, nacelles, flotteurs) ; keel > 0 creuse le dessous en V (coque)
function superRing(z, w, h, yc, M, P, x0 = 0, keel = 0) {
  const r = [];
  for (let j = 0; j < M; j++) {
    const a = (j / M) * Math.PI * 2;
    const cx = Math.cos(a), cy = Math.sin(a);
    let y = h * Math.sign(cy) * Math.abs(cy) ** (2 / P);
    if (keel && cy < 0) y *= 1 - keel * Math.abs(cx);
    r.push(new THREE.Vector3(x0 + w * Math.sign(cx) * Math.abs(cx) ** (2 / P), yc + y, z));
  }
  return r;
}

// demi-largeur du fuselage à une abscisse z (pour placer les mâts des réacteurs)
function fuseWidthAt(fuse, z) {
  for (let i = 0; i < fuse.length - 1; i++) {
    const a = fuse[i], b = fuse[i + 1];
    if (z >= a[0] && z <= b[0]) return lerp(a[1], b[1], (z - a[0]) / (b[0] - a[0]));
  }
  return fuse[fuse.length - 1][1];
}

// cylindre tendu entre deux points (haubans, mâts)
function rod(a, b, r, mat, flat = 2.2) {
  const len = a.distanceTo(b);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8).scale(1, 1, flat), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}

// type : identifiant de l'avion (aircraft.js)
// opts.color / opts.accent : peinture (sinon celle de l'avion) ; opts.detail : intérieur, pilote, halos
// opts.landingLight : vrai phare (avion du joueur) ; opts.livery : personnalisation du hangar (livery.js)
export function createPlaneMesh(type = 'cub', opts = {}) {
  const def = aircraftById(type);
  const MD = def.model;
  const LV = cleanLivery(opts.livery);
  const hex = (c) => (c ? parseInt(c.slice(1), 16) : null);
  const color = hex(LV.body) ?? opts.color ?? def.color, accent = hex(LV.accent) ?? opts.accent ?? def.accent;
  const detail = opts.detail ?? true;
  const g = new THREE.Group();
  // peinture : vernie (clearcoat) par défaut, ou finition choisie au hangar
  const FINISH = {
    brillant: { roughness: 0.34, metalness: 0.04, clearcoat: 0.9, clearcoatRoughness: 0.1 },
    mat: { roughness: 0.82, metalness: 0, clearcoat: 0, clearcoatRoughness: 1 },
    metal: { roughness: 0.32, metalness: 0.75, clearcoat: 0.6, clearcoatRoughness: 0.15 },
    chrome: { roughness: 0.07, metalness: 1, clearcoat: 0.3, clearcoatRoughness: 0.05 },
    nacre: { roughness: 0.25, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05, iridescence: 1, iridescenceIOR: 1.35, iridescenceThicknessRange: [200, 600] },
    satin: { roughness: 0.55, metalness: 0.05, clearcoat: 0.35, clearcoatRoughness: 0.45 },
    candy: { roughness: 0.18, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.02, sheen: 0.4, sheenRoughness: 0.3 },
    vieilli: { roughness: 0.9, metalness: 0.1, clearcoat: 0, clearcoatRoughness: 1 },
    irise: { roughness: 0.2, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.03, iridescence: 1, iridescenceIOR: 1.8, iridescenceThicknessRange: [250, 900] },
    brosse: { roughness: 0.38, metalness: 1, clearcoat: 0, clearcoatRoughness: 1, anisotropy: 0.8 },
    miroir: { roughness: 0.02, metalness: 1, clearcoat: 1, clearcoatRoughness: 0.01 },
    velours: { roughness: 0.95, metalness: 0, clearcoat: 0, clearcoatRoughness: 1, sheen: 1, sheenRoughness: 0.5, sheenColor: 0xffffff },
    givre: { roughness: 0.6, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.55 },
    perle: { roughness: 0.42, metalness: 0.12, clearcoat: 0.7, clearcoatRoughness: 0.3, sheen: 0.6, sheenRoughness: 0.4, iridescence: 0.35, iridescenceIOR: 1.3 },
  }[LV.finish] || { roughness: 0.34, metalness: 0.04, clearcoat: 0.9, clearcoatRoughness: 0.1 };
  // zones peintes à part (par-dessus le motif)
  const ZC = Object.fromEntries(Object.entries(LV.zones).map(([k, v]) => [k, new THREE.Color(hex(v))]));
  const zoneMat = (k, fallback) => (ZC[k] ? new THREE.MeshPhysicalMaterial({ color: ZC[k], ...FINISH }) : fallback);
  const paintProps = { vertexColors: true, ...FINISH };
  const paint = new THREE.MeshPhysicalMaterial({ ...paintProps, side: THREE.DoubleSide });
  const paintOut = new THREE.MeshPhysicalMaterial({ ...paintProps, side: THREE.BackSide }); // surfaces fermées vues de l'extérieur
  const bodyMat = new THREE.MeshPhysicalMaterial({ color, ...FINISH });
  const accentMat = new THREE.MeshPhysicalMaterial({ color: accent, ...FINISH });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1d21, roughness: 0.55, metalness: 0.2 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xc4cad1, roughness: 0.22, metalness: 1 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xe8ebee, roughness: 0.08, metalness: 1 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.92 });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x2a3a48, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.2, side: THREE.DoubleSide,
    depthWrite: false, clearcoat: 0.25, clearcoatRoughness: 0.05, envMapIntensity: 0.5,
  });
  // habitacle : léger éclairage propre (lumière renvoyée par les vitres et la planche)
  const cabin = new THREE.MeshStandardMaterial({ color: 0x4a4f56, roughness: 0.85, metalness: 0, emissive: 0x1d2024 });
  const BODY = new THREE.Color(color), ACC = new THREE.Color(accent), ACC2 = new THREE.Color(hex(LV.stripe) ?? def.acc2 ?? 0x1d3f7a);
  const WHITE = new THREE.Color(0xf4f4f0), BLACK = new THREE.Color(0x18191c), MOUTH = new THREE.Color(0x7a0f14);
  const FRAME = new THREE.Color(0x2a2f36);
  const pick = (k) => (k === 'acc' ? ACC : k === 'acc2' ? ACC2 : BODY);

  // ----- fuselage -----
  const M = 24, P = MD.power ?? 2.6;
  const keysZ = interpKeys(MD.fuse, 0.1);
  const rings = keysZ.map(([z, w, h, yc]) => superRing(z, w, h, yc, M, P));
  const gl = MD.glass;
  const isGlass = gl ? (i, j, p) => {
    const [z, , h, yc] = keysZ[Math.min(i, keysZ.length - 1)];
    const ny = (p.y - yc) / h;
    const [s0, s1, n0, n1] = gl.shield;
    const windshield = z > s0 && z < s1 && ny > n0 && ny < n1;
    let side = false;
    if (Math.abs(p.x) > gl.xMin) {
      for (const sd of gl.sides) {
        if (z <= sd.z0 || z >= sd.z1 || ny <= sd.ny0 || ny >= sd.ny1) continue;
        let ok = !(sd.gaps || []).some((gz) => Math.abs(z - gz) < (sd.gapW ?? 0.06));
        if (sd.period) ok = (z - sd.z0) % sd.period < sd.size; // hublots
        if (ok) side = true;
      }
    }
    const post = gl.posts.some((pz) => Math.abs(z - pz) < 0.04) && ny > gl.sides[0].ny0 + 0.04;
    return (windshield || side) && !post;
  } : null;
  const _wc = new THREE.Color(), _wc2 = new THREE.Color();
  // bruit doux (camouflage, tigre) : valeurs pseudo-aléatoires interpolées
  const hash = (a, b) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };
  const noise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c2 = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * sx + (c2 - a) * sy + (a - b - c2 + d) * sx * sy;
  };
  // motif de peinture du fuselage (z : du nez, négatif, vers la queue ; ny : hauteur relative, -1 en bas, 1 en haut)
  const zNose = MD.fuse[0][0], zTail = MD.fuse[MD.fuse.length - 1][0], len = zTail - zNose;
  const paintFuse = (c, z, ny, p, glb = false) => {
    const u = (z - zNose) / len; // 0 au nez, 1 à la queue
    const ang = Math.atan2(p.y, p.x);
    c.copy(BODY);
    switch (LV.pattern) {
      case 'origine': if (!glb) for (const [a, b, k, zMin] of MD.stripes || []) if (ny > a && ny < b && z > zMin) c.copy(pick(k)); break;
      case 'bande': if (Math.abs(ny + 0.05) < 0.16) c.copy(ACC); else if (Math.abs(ny + 0.05) < 0.22) c.copy(ACC2); break;
      case 'bicolore': if (ny < -0.08) c.copy(ACC); else if (ny < 0.0) c.copy(ACC2); break;
      case 'eclair': {
        const zig = 0.28 * (Math.abs(((u * 7) % 2) - 1) * 2 - 1);
        if (Math.abs(ny - zig) < 0.1 && u > 0.08) c.copy(ACC);
        else if (Math.abs(ny - zig) < 0.15 && u > 0.08) c.copy(ACC2);
        break;
      }
      case 'flammes': {
        const edge = 0.32 + 0.07 * Math.sin(ny * 11) + 0.04 * Math.sin(ny * 23 + 1);
        if (u < edge - 0.08) c.copy(ACC2); else if (u < edge) c.copy(ACC);
        break;
      }
      case 'damier': if (u > 0.45 && (Math.floor(u * 22) + Math.floor((ang + Math.PI) / (Math.PI / 6))) % 2) c.copy(ACC); break;
      case 'pointe': if (u < 0.14 || u > 0.86) c.copy(ACC); else if (u < 0.17 || u > 0.83) c.copy(ACC2); break;
      case 'vagues': { const w = -0.1 + 0.16 * Math.sin(u * 26); if (ny < w - 0.06) c.copy(ACC); else if (ny < w) c.copy(ACC2); break; }
      case 'pois': { // pois de 25 cm sur une grille de 60 cm (z en mètres, tour du fuselage en arc)
        const gz = z / 0.6, ga = (ang * 0.45) / 0.6;
        if (Math.hypot(gz - Math.round(gz), ga - Math.round(ga)) < 0.2) c.copy(ACC);
        break;
      }
      case 'chevrons': if (u > 0.2 && ((u * 9 + Math.abs(ny) * 0.7) % 1) < 0.32) c.copy(((u * 9 + Math.abs(ny) * 0.7) % 1) < 0.08 ? ACC2 : ACC); break;
      case 'tricolore': if (u > 0.82) c.copy(ACC); else if (u > 0.64) c.copy(WHITE); else if (u > 0.46) c.copy(ACC2); break;
      case 'course': if (ny > 0) { const ax = Math.abs(p.x); if (ax > 0.05 && ax < 0.13) c.copy(ACC); else if (ax > 0.13 && ax < 0.16) c.copy(ACC2); } break;
      case 'degrade': c.lerpColors(BODY, ACC, Math.min(1, Math.max(0, (u - 0.1) / 0.8))); break;
      case 'tigre': if (Math.sin(u * 46 + noise(z * 1.5, ang * 2) * 7 + ny * 2.5) > 0.55) c.copy(ACC2); break;
      case 'camo': { const n = noise(z * 0.9, ang * 1.6) + 0.5 * noise(z * 2.2 + 7, ang * 3.4); c.copy(n < 0.55 ? BODY : n < 0.85 ? ACC : n < 1.05 ? ACC2 : BLACK); break; }
      case 'digital': { const qz = Math.floor(z / 0.18) * 0.18, qa = Math.floor(ang / 0.28) * 0.28; const n = noise(qz * 1.1, qa * 1.6) + 0.5 * noise(qz * 2.6 + 3, qa * 3); c.copy(n < 0.55 ? BODY : n < 0.85 ? ACC : n < 1.05 ? ACC2 : BLACK); break; }
      case 'arcenciel': c.setHSL((u * 0.85 + 0.02) % 1, 0.78, 0.55); break;
      // bandes du Débarquement (juin 1944) : 5 bandes blanc/noir autour de l'arrière du fuselage
      case 'invasion': { const k = Math.floor((u - 0.62) / 0.045); if (u > 0.62 && k < 5) c.copy(k % 2 ? BLACK : WHITE); break; }
      // rayons de soleil partant du nez (avions de voltige)
      case 'soleil': { const r = Math.hypot(u * 4, ny * 0.9); if (r < 2.6 && Math.floor((Math.atan2(ny, u * 4) + Math.PI) / (Math.PI / 9)) % 2) c.copy(r < 2.45 ? ACC : ACC2); break; }
      // filet de compagnie : deux lignes fines le long des hublots, la queue relevée
      case 'cheatline': { const y0 = 0.05 + Math.max(0, u - 0.75) * 1.6; if (Math.abs(ny - y0) < 0.075) c.copy(ACC); else if (Math.abs(ny - y0 + 0.13) < 0.04) c.copy(ACC2); break; }
      // rétro : grande virgule qui plonge vers le ventre
      case 'retro': { const y0 = 0.15 - 0.55 * Math.sin(Math.min(1, u * 1.25) * Math.PI * 0.5); if (ny < y0 && ny > y0 - 0.22) c.copy(ACC); else if (ny <= y0 - 0.22 && ny > y0 - 0.3) c.copy(ACC2); break; }
      // chasseur 1944 : dessus vert olive, dessous gris, nez jaune, bandes du Débarquement
      case 'warbird': {
        const olive = _wc.setRGB(0.24, 0.26, 0.14), grey = _wc2.setRGB(0.56, 0.58, 0.6);
        c.copy(ny > -0.15 + 0.06 * Math.sin(u * 20) ? olive : grey);
        if (u < 0.1) c.copy(ACC);
        const k = Math.floor((u - 0.68) / 0.04); if (u > 0.68 && k < 5) c.copy(k % 2 ? BLACK : WHITE);
        break;
      }
      case 'zebre': if (Math.sin(u * 60 + Math.sin(ny * 5 + u * 9) * 2.2 + noise(z * 2, ang) * 2) > 0.35) c.copy(BLACK); break;
      case 'leopard': {
        const n = noise(z * 3.2, ang * 3.2);
        if (n > 0.72) c.copy(BLACK); else if (n > 0.58) c.copy(ACC);
        break;
      }
      case 'hexa': { // nid d'abeille : bords des hexagones en couleur secondaire
        const gx = z / 0.32, gy = (ang * 0.45) / 0.28 + (Math.floor(gx) % 2) * 0.5;
        const fx = Math.abs(gx - Math.round(gx)), fy = Math.abs(gy - Math.round(gy));
        if (Math.max(fx * 1.15 + fy * 0.6, fy * 1.2) > 0.52) c.copy(ACC);
        break;
      }
      case 'ecossais': { // tartan : bandes croisées qui se mélangent
        const a = (Math.floor(z / 0.18) % 4 === 0), b = (Math.floor((ang + Math.PI) / 0.35) % 4 === 0);
        if (a && b) c.copy(BLACK); else if (a || b) c.lerpColors(BODY, ACC, 0.75);
        if (Math.floor(z / 0.06) % 7 === 3 || Math.floor((ang + Math.PI) / 0.12) % 9 === 4) c.lerp(ACC2, 0.6);
        break;
      }
      case 'eclabous': { const n = noise(z * 1.4 + 11, ang * 2.1) + 0.45 * noise(z * 4, ang * 5); if (n > 1.0) c.copy(ACC); else if (n > 0.9) c.copy(ACC2); break; }
      case 'etoiles': { // ciel de nuit : fond secondaire, petites étoiles blanches
        c.copy(ACC2);
        const gz = Math.floor(z / 0.22), ga = Math.floor((ang + Math.PI) / 0.18);
        if (hash(gz, ga) > 0.86) c.copy(WHITE);
        else if (ny > 0.55) c.lerp(ACC, 0.4);
        break;
      }
      case 'pixel': { const h = hash(Math.floor(z / 0.25), Math.floor((ang + Math.PI) / 0.4)); c.copy(h < 0.4 ? BODY : h < 0.7 ? ACC : h < 0.9 ? ACC2 : WHITE); break; }
      case 'carbone': { // tissage du carbone (fond sombre, reflets du tressage)
        const w = (Math.floor(z / 0.14) + Math.floor((ang + Math.PI) / 0.22)) % 2; // assez gros pour la grille de sommets
        c.setRGB(0.05, 0.055, 0.06).lerp(_wc.setRGB(0.16, 0.17, 0.19), w ? 0.9 : 0.2);
        if (u > 0.4 && Math.abs(ny + 0.05) < 0.06) c.copy(ACC);
        break;
      }
      case 'diagonale': { const d = ny + (u - 0.5) * 2.2; if (Math.abs(d) < 0.25) c.copy(ACC); else if (Math.abs(d) < 0.33) c.copy(ACC2); break; }
      default: break;
    }
    // zones : dos, ventre, nez et capot
    if (ZC.nose && u < 0.15) c.copy(ZC.nose);
    else if (ZC.top && ny > 0.5) c.copy(ZC.top);
    else if (ZC.belly && ny < -0.45) c.copy(ZC.belly);
    // dents de requin sous le nez : une bouche rouge sombre bordée de dents blanches en triangle
    if (LV.sharkTeeth && u > 0.02 && u < 0.26 && ny < 0) {
      const t = (u - 0.02) / 0.24;
      const open = 0.3 * Math.sin(t * Math.PI), d = Math.abs(ny + 0.42);
      if (d < open) {
        const tooth = 1 - Math.abs(((t * 10) % 1) - 0.5) * 2;
        c.copy(open - d < open * 0.6 * tooth ? WHITE : MOUTH);
      }
    }
  };
  const fuseGeo = loft(rings, (c, i, j, p) => {
    const [z, , h, yc] = keysZ[Math.min(i, keysZ.length - 1)];
    const ny = (p.y - yc) / h;
    if (isGlass && isGlass(i, j, p)) { c.copy(FRAME); return; }
    paintFuse(c, z, ny, { x: p.x, y: p.y - yc });
  }, true, isGlass);
  const hidden = new THREE.MeshBasicMaterial({ visible: false });
  const fuse = new THREE.Mesh(fuseGeo, isGlass ? [paintOut, glassMat] : paintOut);
  fuse.userData.paint = true;
  g.add(fuse);
  // habitacle : parois intérieures (même géométrie vue de l'intérieur, sans les vitres)
  const shell = new THREE.Mesh(fuseGeo, isGlass ? [cabin, hidden] : cabin);
  g.add(shell);
  // verrière en bulle (avion de voltige)
  const canopyParts = [];
  if (MD.canopy) {
    const cp = MD.canopy;
    const bubble = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(cp.w, cp.h, (cp.z1 - cp.z0) / 2), glassMat);
    bubble.position.set(0, cp.y, (cp.z0 + cp.z1) / 2);
    bubble.renderOrder = 2;
    g.add(bubble);
    // fond de l'habitacle sous la bulle : sans lui, on voyait à travers le verre le dessus du fuselage peint
    // (un « voile blanc » sur la verrière) au lieu d'un cockpit sombre
    let top = cp.y;
    for (const [z, , h, yc] of keysZ) if (z > cp.z0 && z < cp.z1) top = Math.max(top, yc + h);
    const tub = new THREE.Mesh(new THREE.CircleGeometry(1, 36).rotateX(-Math.PI / 2).scale(cp.w * 0.94, 1, ((cp.z1 - cp.z0) / 2) * 0.94),
      new THREE.MeshStandardMaterial({ color: 0x16191d, roughness: 0.9 }));
    tub.position.set(0, Math.min(top + 0.004, cp.y + cp.h * 0.6), (cp.z0 + cp.z1) / 2);
    g.add(tub);
    canopyParts.push(tub); // caché en vue cockpit, comme les décalcomanies
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.025, 6, 40).rotateX(Math.PI / 2).scale(cp.w, 1, (cp.z1 - cp.z0) / 2), dark);
    rim.position.copy(bubble.position);
    g.add(rim);
  }

  // ----- aile -----
  const W = MD.wing;
  const chordAt = (x) => { const s = Math.abs(x); return s < W.taperFrom || W.half <= W.taperFrom ? W.root : lerp(W.root, W.tip, (s - W.taperFrom) / (W.half - W.taperFrom)); };
  const leAt = (x) => W.le + (W.root - chordAt(x)) * 0.25 + Math.abs(x) * W.sweep;
  const yAt = (x) => W.y + Math.abs(x) * W.dihedral;
  const mainTo = 0.74; // le reste de la corde : volets et ailerons mobiles
  const wingRing = (x, thick) => {
    const c = chordAt(x), le = leAt(x);
    return airfoil(10, thick, 0, mainTo).map(([t, y]) => new THREE.Vector3(x, yAt(x) + y * c, le + t * c));
  };
  const half = W.xs || [...new Set([W.half, W.half - 0.3, (W.half + W.taperFrom) / 2, W.taperFrom, W.taperFrom / 2, 0].map((v) => Math.round(v * 100) / 100))]
    .filter((v) => v >= 0 && v <= W.half).sort((a, b) => b - a);
  const wingXs = [...half.map((v) => -v), ...half.slice(0, -1).reverse()];
  const paintWing = (c, p, glb = false) => {
    const s = Math.abs(p.x);
    switch (LV.wings) {
      case 'uni': c.copy(BODY); break;
      case 'bouts': c.copy(s > W.half * 0.72 ? ACC : s > W.half * 0.68 ? ACC2 : BODY); break;
      case 'damier': c.copy(s > W.half * 0.6 && (Math.floor(s / 0.35) + Math.floor((p.z - W.le) / 0.35)) % 2 ? ACC : s > W.half * 0.6 ? WHITE : BODY); break;
      case 'bandes': { const k = Math.floor((s - W.half * 0.3) / 0.28); c.copy(s > W.half * 0.3 && k < 5 ? (k % 2 ? BLACK : WHITE) : BODY); break; }
      case 'chevron': { const v = (p.z - W.le) - s * 0.35; c.copy(v > 0.1 && v < 0.45 && s > W.half * 0.2 ? ACC : v > 0.45 && v < 0.6 && s > W.half * 0.2 ? ACC2 : BODY); break; }
      case 'bord': { const c0 = chordAt(p.x), t = (p.z - leAt(p.x)) / c0; c.copy(t < 0.12 ? ACC : t < 0.16 ? ACC2 : BODY); break; }
      case 'invasion': { const t = (p.z - leAt(p.x)) / chordAt(p.x), k = Math.floor((s - W.half * 0.22) / 0.3); c.copy(s > W.half * 0.22 && k < 5 && t > -0.1 ? (k % 2 ? BLACK : WHITE) : BODY); break; }
      case 'soleil': { const a = Math.atan2(p.z - W.le - 0.6, s); c.copy(s > 0.3 && Math.floor((a + Math.PI) / (Math.PI / 10)) % 2 ? ACC : BODY); break; }
      case 'etoiles': { c.copy(ACC2); if (hash(Math.floor(s / 0.3), Math.floor(p.z / 0.3)) > 0.84) c.copy(WHITE); break; }
      case 'degrade': c.lerpColors(BODY, ACC, Math.min(1, s / W.half)); break;
      case 'fuite': { const t = (p.z - leAt(p.x)) / chordAt(p.x); c.copy(t > 0.86 ? ACC : t > 0.82 ? ACC2 : BODY); break; }
      case 'flammes': { const t = (p.z - leAt(p.x)) / chordAt(p.x), edge = 0.35 + 0.12 * Math.sin(s * 5) + 0.06 * Math.sin(s * 13); c.copy(t < edge - 0.1 ? ACC2 : t < edge ? ACC : BODY); break; }
      default: c.copy(!glb && s > W.accentFrom ? ACC : BODY);
    }
    if (ZC.tips && s > W.half * 0.75) c.copy(ZC.tips);
    else if (ZC.wings && s <= W.half * 0.75) c.copy(ZC.wings);
  };
  const wing = new THREE.Mesh(loft(wingXs.map((x) => wingRing(x, Math.abs(x) > W.half - 0.2 ? W.tipThick : W.thick)),
    (c, i, j, p) => paintWing(c, p)), paint);
  wing.userData.paint = true;
  g.add(wing);
  if (W.winglets) {
    for (const s of [-1, 1]) {
      const c = chordAt(W.half);
      const wl = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.55, c * 0.75), accentMat);
      wl.position.set(s * (W.half + 0.03), yAt(W.half) + 0.27, leAt(W.half) + c * 0.45);
      wl.rotation.z = -s * 0.12;
      g.add(wl);
    }
  }

  // gouvernes : pièces mobiles avec charnière au bord avant
  const surface = (x0, x1, chordFrac, mat) => {
    const xm = (x0 + x1) / 2, c = chordAt(xm);
    const pivot = new THREE.Group();
    pivot.position.set(xm, yAt(xm), leAt(xm) + mainTo * c);
    const piece = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(x1 - x0) - 0.04, 0.05, c * chordFrac), mat);
    piece.position.z = (c * chordFrac) / 2;
    pivot.add(piece);
    g.add(pivot);
    return pivot;
  };
  const surfMat = zoneMat('surfaces', bodyMat), surfAccMat = zoneMat('surfaces', accentMat);
  const flapL = W.flaps ? surface(-W.flaps[1], -W.flaps[0], 0.25, surfMat) : null;
  const flapR = W.flaps ? surface(W.flaps[0], W.flaps[1], 0.25, surfMat) : null;
  const ailL = surface(-W.ail[1], -W.ail[0], 0.25, surfMat), ailR = surface(W.ail[0], W.ail[1], 0.25, surfMat);

  // haubans (aile haute)
  if (W.struts) {
    const [fx, fy, fz] = W.struts.from;
    for (const s of [-1, 1]) {
      const x = s * W.struts.x;
      g.add(rod(new THREE.Vector3(fx * s, fy, fz), new THREE.Vector3(x, yAt(x) - 0.05, W.struts.z), 0.035, metal));
    }
  }

  // ----- empennage -----
  const T = MD.stab;
  const stabRing = (x) => {
    const s = Math.abs(x), c = lerp(T.root, T.tip, s / T.half), le = T.le + s * T.sweep;
    return airfoil(8, 0.09, 0, 0.62).map(([t, y]) => new THREE.Vector3(x, T.y + y * c, le + t * c));
  };
  const stabMesh = new THREE.Mesh(loft([-1, -0.5, 0, 0.5, 1].map((k) => stabRing(k * T.half)), (c) => c.copy(ZC.stab || BODY)), paint);
  stabMesh.userData.paint = true;
  g.add(stabMesh);
  const elevator = new THREE.Group();
  elevator.position.set(0, T.y, T.le + 0.62 * T.root);
  const elevMesh = new THREE.Mesh(new THREE.BoxGeometry(T.half * 2 - 0.2, 0.04, T.root * 0.376), surfAccMat);
  elevMesh.position.z = T.root * 0.188;
  elevator.add(elevMesh);
  g.add(elevator);

  const F = MD.fin;
  const finRing = (y) => {
    const t = (y - F.y0) / (F.y1 - F.y0), c = lerp(F.root, F.tip, t), le = lerp(F.le0, F.le1, t);
    return airfoil(8, 0.1, 0, 0.7).map(([u, w]) => new THREE.Vector3(w * c, y, le + u * c));
  };
  const finMesh = new THREE.Mesh(loft([0, 1 / 3, 2 / 3, 1].map((k) => finRing(lerp(F.y0, F.y1, k))), (c, i, j, p) => c.copy(ZC.fin || (p.y > F.accentFrom ? ACC : BODY))), paint);
  finMesh.userData.paint = true;
  g.add(finMesh);
  const rudder = new THREE.Group();
  rudder.position.set(0, (F.y0 + F.y1) / 2, (F.le0 + 0.7 * F.root + F.le1 + 0.7 * F.tip) / 2 + 0.12);
  const rudMesh = new THREE.Mesh(new THREE.BoxGeometry(0.04, (F.y1 - F.y0) * 0.963, F.root * 0.24), surfAccMat);
  rudMesh.position.z = F.root * 0.12;
  rudder.add(rudMesh);
  g.add(rudder);

  // ----- moteurs : hélices (nez ou nacelles d'aile) -----
  const props = [];
  const tipMat = new THREE.MeshStandardMaterial({ color: hex(LV.tips), roughness: 0.5 });
  for (const pc of MD.props || []) {
    const r = pc.r, sp = pc.spinner ?? 1;
    if (pc.nacelle) {
      const n = pc.nacelle, R = n.rad;
      const keys = [[pc.z + 0.02, R * 0.6, R * 0.6, 0], [pc.z + 0.3, R * 0.92, R * 0.92, 0], [pc.z + 0.9, R, R * 1.02, 0.02], [n.z1 - 1.3, R * 0.95, R * 0.98, 0.02], [n.z1, R * 0.22, R * 0.3, 0.06]];
      const nac = new THREE.Mesh(loft(interpKeys(keys, 0.15).map(([z, w, h, yc]) => superRing(z, w, h, pc.y + yc, 18, 2.4, pc.x)), (c, i, j, p) => c.copy(ZC.nacelles || (p.y - pc.y > R * 0.55 ? ACC : BODY))), paintOut);
      nac.userData.paint = true;
      g.add(nac);
    }
    const spinnerProfile = [[0.2, 0], [0.19, 0.08], [0.15, 0.2], [0.08, 0.31], [0, 0.37]].map(([a, b]) => new THREE.Vector2(a * sp, b * sp));
    const spinner = new THREE.Mesh(new THREE.LatheGeometry(spinnerProfile, 18).rotateX(-Math.PI / 2), zoneMat('spinner', accentMat));
    spinner.position.set(pc.x, pc.y, pc.z);
    g.add(spinner);
    const prop = new THREE.Group();
    prop.position.set(pc.x, pc.y, pc.z - 0.08);
    const nb = pc.blades || 2;
    for (let k = 0; k < nb; k++) {
      const bg = new THREE.BoxGeometry(0.13 * Math.min(1, r * 1.05), 0.95 * r, 0.025, 1, 6, 1).translate(0, 0.52 * r, 0);
      const pa = bg.attributes.position;
      for (let i = 0; i < pa.count; i++) {
        const y = pa.getY(i), yn = y / r, tw = 0.6 - yn * 0.45;
        const x = pa.getX(i) * (1 - yn * 0.35), z = pa.getZ(i);
        pa.setXYZ(i, x * Math.cos(tw) - z * Math.sin(tw), y, x * Math.sin(tw) + z * Math.cos(tw));
      }
      bg.computeVertexNormals();
      const blade = new THREE.Mesh(bg, dark);
      blade.rotation.z = (k * Math.PI * 2) / nb;
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.09, 0.03), tipMat);
      tip.position.y = 1.0 * r;
      tip.rotation.y = 0.15;
      blade.add(tip);
      prop.add(blade);
    }
    g.add(prop);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.05 * r, 32), new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    disc.position.set(pc.x, pc.y, pc.z - 0.1);
    g.add(disc);
    props.push({ prop, disc, spin: pc.spin ?? 1 });
    if (pc.intakes) {
      for (const x of [-0.25, 0.25]) {
        const intake = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.1), dark);
        intake.position.set(pc.x + x, pc.y - 0.18, pc.z + 0.2);
        g.add(intake);
      }
    }
  }

  // ----- réacteurs arrière (jet) : nacelle ouverte, soufflante qui tourne, tuyère, mât -----
  const fans = [];
  const LIP = new THREE.Color(0xd8dde2);
  for (const jc of MD.jets || []) {
    const R = jc.r, L = jc.z1 - jc.z0;
    const keys = [[jc.z0, R * 0.86, R * 0.86, 0], [jc.z0 + 0.1, R * 0.97, R * 0.97, 0], [jc.z0 + 0.45, R, R, 0], [jc.z1 - 0.55, R * 0.92, R * 0.92, 0], [jc.z1, R * 0.74, R * 0.74, 0]];
    const pod = new THREE.Mesh(loft(interpKeys(keys, 0.12).map(([z, w, h, yc]) => superRing(z, w, h, jc.y + yc, 22, 2, jc.x)), (c, i, j, p) => c.copy(i < 2 ? LIP : ZC.nacelles || (p.y - jc.y > R * 0.6 ? ACC : BODY)), false), paintOut);
    pod.userData.paint = true;
    g.add(pod);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(R * 0.9, 0.035, 8, 28), chrome);
    lip.position.set(jc.x, jc.y, jc.z0 + 0.02);
    g.add(lip);
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.86, R * 0.74, L, 22, 1, true).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2b2f35, roughness: 0.6, metalness: 0.5, side: THREE.BackSide }));
    inner.position.set(jc.x, jc.y, (jc.z0 + jc.z1) / 2);
    g.add(inner);
    const fan = new THREE.Group();
    fan.position.set(jc.x, jc.y, jc.z0 + 0.22);
    const hub = new THREE.Mesh(new THREE.ConeGeometry(R * 0.28, R * 0.5, 16).rotateX(-Math.PI / 2), chrome);
    hub.position.z = -0.1;
    fan.add(hub);
    for (let k = 0; k < 16; k++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, R * 0.62, 0.02).translate(0, R * 0.5, 0), metal);
      b.rotation.set(0, 0.5, (k / 16) * Math.PI * 2, 'ZXY');
      fan.add(b);
    }
    g.add(fan);
    fans.push(fan);
    const nozzle = new THREE.Mesh(new THREE.ConeGeometry(R * 0.4, R * 0.9, 16).rotateX(Math.PI / 2), dark);
    nozzle.position.set(jc.x, jc.y, jc.z1 - 0.1);
    g.add(nozzle);
    // mât reliant la nacelle au fuselage
    const zm = (jc.z0 + jc.z1) / 2 + 0.15, fw = fuseWidthAt(MD.fuse, zm) * 0.8;
    const span = Math.abs(jc.x) - R * 0.8 - fw;
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(span + 0.2, 0.09, L * 0.55), bodyMat);
    pylon.position.set(Math.sign(jc.x) * (fw + span / 2), jc.y - 0.05, zm);
    g.add(pylon);
  }

  if (MD.exhaust && !MD.jets) {
    const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.25, 8).rotateX(Math.PI / 2), chrome);
    exhaust.position.set(...MD.exhaust);
    g.add(exhaust);
  }
  if (MD.antenna) {
    const antenna = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.35, 0.08), dark);
    antenna.position.set(...MD.antenna);
    g.add(antenna);
  }

  // ----- train d'atterrissage -----
  const GR = MD.gear, gearH = def.specs.gear, wr = GR.r, wheelY = -gearH + wr;
  const legs = [];
  const pantsMat = zoneMat('pants', bodyMat);
  const wheel = (parent, x, y, z, fairing) => {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(wr, wr, wr * 0.55, 18).rotateZ(Math.PI / 2), rubber);
    w.position.set(x, y, z);
    parent.add(w);
    const hubcap = new THREE.Mesh(new THREE.CylinderGeometry(wr * 0.45, wr * 0.45, wr * 0.58, 12).rotateZ(Math.PI / 2), metal);
    hubcap.position.copy(w.position);
    parent.add(hubcap);
    if (fairing) {
      const f = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10).scale(wr * 0.43, wr * 0.9, wr * 1.83), pantsMat);
      f.position.set(x, y + 0.04, z + 0.05);
      parent.add(f);
    }
  };
  const fixed = !def.specs.retractable;
  const mains = GR.mains, nose = GR.nose;
  if (mains.style === 'float') {
    // roues escamotables logées dans les flotteurs
    const fl = GR.floats;
    for (const s of [-1, 1]) {
      for (const [z, isNose] of [[mains.z, false], [nose.z, true]]) {
        const leg = new THREE.Group();
        const top = fl.bottom + fl.h * 0.5;
        leg.position.set(s * mains.x, top, z);
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, top - wheelY, 8), metal);
        bar.position.y = -(top - wheelY) / 2;
        leg.add(bar);
        wheel(leg, 0, wheelY - top, 0, false);
        if (isNose) leg.scale.setScalar(0.8);
        g.add(leg);
        legs.push(leg);
      }
    }
    // flotteurs : coque en V, pont peint, étrave relevée, redan
    for (const s of [-1, 1]) {
      const b = fl.bottom, h = fl.h / 2, w = fl.w;
      const keys = [[fl.z0, 0.08, 0.08, b + h * 1.5], [fl.z0 + 0.35, w * 0.55, h * 0.6, b + h * 1.15], [fl.z0 + 1.1, w, h, b + h], [mains.z + 0.25, w, h, b + h],
        [mains.z + 0.3, w * 0.96, h * 0.86, b + h * 1.12], [fl.z1 - 1.2, w * 0.75, h * 0.62, b + h * 1.3], [fl.z1, 0.06, 0.08, b + h * 1.75]];
      const floatGeo = loft(interpKeys(keys, 0.2).map(([z, ww, hh, yc]) => superRing(z, ww, hh, yc, 18, 2.6, s * mains.x, 0.45)),
        (c, i, j, p) => c.copy(p.y > b + h * 1.55 ? ACC : p.y < b + 0.12 ? ACC2 : BODY));
      const floatMesh = new THREE.Mesh(floatGeo, paintOut);
      floatMesh.userData.paint = true;
      g.add(floatMesh);
      for (const z of [nose.z + 0.6, mains.z + 0.2]) {
        g.add(rod(new THREE.Vector3(s * mains.x, b + h * 1.9, z), new THREE.Vector3(s * 0.5, -0.45, z - 0.15), 0.04, metal, 2));
        g.add(rod(new THREE.Vector3(s * mains.x, b + h * 1.9, z + 0.4), new THREE.Vector3(s * 0.4, -0.5, z - 0.35), 0.03, metal, 1.5));
      }
    }
  } else {
    for (const s of [-1, 1]) {
      const leg = new THREE.Group();
      if (mains.style === 'spring') {
        // jambe de train à lame (type Cessna)
        leg.position.set(mains.ax * s, mains.ay, mains.z);
        const a = new THREE.Vector3(0, 0, 0), b = new THREE.Vector3((mains.x - mains.ax) * s, wheelY - mains.ay, 0);
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.05, a.distanceTo(b), 0.1), metal);
        bar.position.copy(b).multiplyScalar(0.5);
        bar.rotation.z = Math.atan2(b.x, -b.y);
        leg.add(bar);
        wheel(leg, b.x, b.y, 0, GR.pants);
      } else {
        // jambe oléopneumatique qui se replie dans l'aile ou la nacelle
        leg.position.set(mains.x * s, mains.ay, mains.z);
        const L = mains.ay - wheelY;
        const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, L * 0.62, 10), metal);
        strut.position.y = -L * 0.31;
        const oleo = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, L * 0.5, 10), chrome);
        oleo.position.y = -L * 0.7;
        const brace = rod(new THREE.Vector3(0, -L * 0.15, 0.35), new THREE.Vector3(0, -L * 0.55, 0), 0.025, metal, 1);
        leg.add(strut, oleo, brace);
        wheel(leg, 0.13 * s, wheelY - mains.ay, 0, false);
        leg.userData.fold = mains.fold === 'in' ? -s : 0;
      }
      leg.userData.fixed = fixed;
      g.add(leg);
      legs.push(leg);
    }
    const noseLeg = new THREE.Group();
    noseLeg.position.set(nose.x ?? 0, nose.ay, nose.z);
    const Ln = nose.ay - wheelY;
    const strutN = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, Ln, 8), metal);
    strutN.position.y = -Ln / 2;
    noseLeg.add(strutN);
    wheel(noseLeg, 0, -Ln, 0, GR.pants);
    noseLeg.userData.fixed = fixed;
    g.add(noseLeg);
    legs.push(noseLeg);
  }

  // ----- habitacle : planche de bord, sièges, manches ou yokes, pilote -----
  const CB = MD.cabin;
  const interior = new THREE.Group();
  const panelMat = new THREE.MeshStandardMaterial({ map: defaultPanelTexture(), roughness: 0.6, emissive: 0xffffff, emissiveIntensity: 0, emissiveMap: null });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(CB.panel.w, CB.panel.w * 0.37), panelMat);
  panel.position.set(0, CB.panel.y, CB.panel.z);
  panel.rotation.x = -0.18;
  interior.add(panel);
  const glare = new THREE.Mesh(new THREE.BoxGeometry(CB.panel.w + 0.04, 0.05, 0.3), cabin);
  glare.position.set(0, CB.panel.y + 0.21, CB.panel.z - 0.1);
  interior.add(glare);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(CB.floor.w, 0.04, CB.floor.len), new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.95 }));
  floor.position.set(0, CB.floor.y, CB.floor.z);
  interior.add(floor);
  const seatMat = new THREE.MeshStandardMaterial({ color: CB.stick ? 0x2b2e33 : 0x5a4a3c, roughness: 0.8 });
  for (const [x, z] of CB.seats) {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.45), seatMat);
    seat.position.set(x, CB.seatY, z);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.62, 0.09), seatMat);
    back.position.set(x, CB.seatY + 0.32, z + 0.25);
    back.rotation.x = 0.12;
    interior.add(seat, back);
  }
  const yokes = [];
  if (CB.stick) {
    // manche à balai entre les jambes (ULM, voltige)
    for (const [x, z] of CB.seats.slice(0, CB.seats[0][0] === 0 ? 2 : 1)) {
      const stick = new THREE.Group();
      stick.position.set(x, CB.seatY - 0.12, z - 0.45);
      const rodM = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.5, 8).translate(0, 0.25, 0), dark);
      const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.08, 4, 8), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7 }));
      grip.position.y = 0.52;
      stick.add(rodM, grip);
      stick.userData.stick = true;
      interior.add(stick);
      yokes.push(stick);
    }
  } else {
    for (const x of CB.yokes) {
      const yoke = new THREE.Group();
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.32, 8).rotateX(Math.PI / 2), dark);
      col.position.z = 0.16;
      const wheelY2 = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.016, 6, 20, Math.PI), dark);
      wheelY2.position.z = 0.32;
      wheelY2.rotation.z = Math.PI;
      yoke.add(col, wheelY2);
      yoke.position.set(x, CB.yokeY, CB.yokeZ);
      yoke.userData.z0 = CB.yokeZ;
      interior.add(yoke);
      yokes.push(yoke);
    }
  }
  g.add(interior);
  const [sx, sz] = CB.seats[0];
  let pilot = null;
  if (detail && PILOT) {
    // vrai pilote 3D, hanches sur le coussin du siège
    pilot = new THREE.Group();
    let hipY = CB.seatY + 0.13;
    const sp = seatedPilot(new THREE.Vector3(sx, hipY, sz + 0.1), LV.suit);
    if (MD.canopy) {
      // verrière en bulle : le pilote est assis haut, la tête dans la bulle (sinon caché par le haut du fuselage)
      let top = MD.canopy.y;
      for (const [z, , h, yc] of MD.fuse) if (z > MD.canopy.z0 && z < MD.canopy.z1) top = Math.max(top, yc + h);
      hipY = top - 0.48;
      sp.scale.setScalar(0.88);
      sp.position.copy(new THREE.Vector3(sx, hipY, sz + 0.1)).sub(PILOT.hips.clone().multiplyScalar(0.88).applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
    }
    pilot.add(sp);
    g.add(pilot);
  } else if (detail) {
    pilot = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.3, 4, 10), new THREE.MeshStandardMaterial({ color: 0x2f4a6b, roughness: 0.8 }));
    torso.position.set(sx, CB.seatY + 0.34, sz + 0.07);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), new THREE.MeshStandardMaterial({ color: 0xd9a77e, roughness: 0.7 }));
    head.position.set(sx, CB.seatY + 0.78, sz + 0.03);
    const headset = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.018, 6, 16, Math.PI), dark);
    headset.position.copy(head.position);
    headset.rotation.y = Math.PI / 2;
    pilot.add(torso, head, headset);
    g.add(pilot);
  }

  // ----- habitacle vu de l'intérieur (vue cockpit seulement) -----
  // La carrosserie est cachée en vue cockpit (elle boucherait tout) ; à la place, un habitacle fait pour être vu de
  // la place du pilote : montants de pare-brise fins, casquette, rebords de fenêtre, panneaux de porte, plafond.
  // Le pare-brise et les vitres latérales restent dégagés : on voit devant soi et sur les côtés (ailes, moteurs).
  const cockpitSet = new THREE.Group();
  cockpitSet.visible = false;
  if (detail && !GLB[def.id]) {
    const E = new THREE.Vector3(sx, CB.seatY + 0.83, sz - 0.1);
    const trim = new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.85, side: THREE.DoubleSide });
    const lining = new THREE.MeshStandardMaterial({ color: 0x7d8087, roughness: 0.95, side: THREE.DoubleSide });
    const frameM = new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: 0.55, side: THREE.DoubleSide });
    const box = (w, h, d, x, y, z, mat, rx = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.rotation.x = rx; cockpitSet.add(m); return m; };
    const canopy = !!MD.canopy;
    const zP = CB.panel.z, glareY = CB.panel.y + 0.235;
    const halfW = THREE.MathUtils.clamp(fuseWidthAt(MD.fuse, E.z) * 0.95, 0.38, 0.75);
    const halfWf = THREE.MathUtils.clamp(fuseWidthAt(MD.fuse, zP) * 0.95, 0.3, halfW); // plus étroit vers le nez
    const zBack = E.z + 0.7;
    const sillY = E.y - (canopy ? 0.4 : 0.33);
    // casquette au-dessus de la planche de bord (anti-reflets) et bas du pare-brise
    box(halfWf * 2, 0.04, 0.42, 0, glareY, zP - 0.14, frameM);
    // rebords de fenêtre et panneaux de porte (sous le rebord) de chaque côté
    for (const sgn of [-1, 1]) {
      const x = sgn * halfW, xf = sgn * halfWf;
      const sill = rod(new THREE.Vector3(xf, glareY - 0.02, zP), new THREE.Vector3(x, sillY, zBack), 0.016, trim, 1.3);
      cockpitSet.add(sill);
      const door = new THREE.Mesh(new THREE.PlaneGeometry(zBack - zP, sillY - CB.floor.y).rotateY(Math.PI / 2), trim);
      door.position.set((x + xf) / 2, (sillY + CB.floor.y) / 2 - 0.02, (zP + zBack) / 2);
      door.rotation.y = Math.atan2(x - xf, zBack - zP) * 0.5;
      cockpitSet.add(door);
      // accoudoir
      box(0.07, 0.05, 0.5, x - sgn * 0.06, sillY - 0.12, E.z + 0.05, lining);
      if (!canopy) {
        // montant de pare-brise (fin, incliné) puis montant arrière derrière l'épaule
        const roofY = E.y + 0.3, zTop = zP + 0.5;
        cockpitSet.add(rod(new THREE.Vector3(xf * 1.02, glareY, zP - 0.3), new THREE.Vector3(x * 1.0, roofY, zTop), 0.016, frameM, 1.3));
        cockpitSet.add(rod(new THREE.Vector3(x, sillY, zBack - 0.05), new THREE.Vector3(x * 0.95, roofY, zBack - 0.1), 0.05, trim, 1.5));
        // montant de porte au milieu de la vitre latérale
        cockpitSet.add(rod(new THREE.Vector3(x, sillY, E.z - 0.25), new THREE.Vector3(x * 0.98, roofY, E.z - 0.2), 0.016, frameM, 1.2));
      }
    }
    if (!canopy) {
      const roofY = E.y + 0.3, zTop = zP + 0.5;
      // plafond (garniture claire) avec traverse au-dessus du pare-brise et plafonnier
      box(halfW * 2, 0.03, zBack - zTop + 0.1, 0, roofY + 0.02, (zTop + zBack) / 2, lining);
      box(halfW * 1.95, 0.06, 0.07, 0, roofY, zTop, frameM);
      box(0.12, 0.02, 0.08, 0, roofY, (zTop + zBack) / 2 + 0.1, new THREE.MeshStandardMaterial({ color: 0xd8d8d0, emissive: 0x302c24, roughness: 0.4 }));
      // compas magnétique sur la traverse
      const compass = box(0.08, 0.06, 0.06, 0, roofY - 0.05, zTop + 0.03, frameM);
      compass.add(new THREE.Mesh(new THREE.CircleGeometry(0.024, 16), new THREE.MeshBasicMaterial({ color: 0xe8e4d8 })).translateZ(0.031));
    } else {
      // verrière : arceau avant fin (la bulle elle-même reste visible)
      cockpitSet.add(rod(new THREE.Vector3(-halfWf * 0.9, glareY, zP - 0.32), new THREE.Vector3(halfWf * 0.9, glareY, zP - 0.32), 0.02, frameM, 1));
    }
    // plancher et pédales
    for (const sgn of [-1, 1]) box(0.08, 0.02, 0.14, E.x + sgn * 0.09, CB.floor.y + 0.1, zP + 0.25, frameM, -0.6);
    // bas de l'habitacle : les parois intérieures du fuselage sous le rebord des fenêtres (plancher, côtés, nez sous la
    // planche de bord). Sans elles on voyait le sol à travers l'avion ; au-dessus, tout est dégagé.
    {
      const pos = fuseGeo.attributes.position, idx = fuseGeo.index.array, keep = [];
      const cut = Math.max(sillY, glareY - 0.05);
      for (let t = 0; t < idx.length; t += 3) {
        const a = idx[t], b = idx[t + 1], c = idx[t + 2];
        if (pos.getY(a) < cut && pos.getY(b) < cut && pos.getY(c) < cut) keep.push(a, b, c);
      }
      const lower = new THREE.BufferGeometry();
      lower.setAttribute('position', pos);
      if (fuseGeo.attributes.normal) lower.setAttribute('normal', fuseGeo.attributes.normal);
      lower.setIndex(keep);
      cockpitSet.add(new THREE.Mesh(lower, cabin));
    }
    cockpitSet.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
  }
  g.add(cockpitSet);
  // pare-brise (pour la pluie et les essuie-glaces) : du bas, devant la planche de bord, jusqu'au toit ou à la bulle
  let windshield = null;
  {
    const E = new THREE.Vector3(sx, CB.seatY + 0.83, sz - 0.1);
    const zP = CB.panel.z, glareY = CB.panel.y + 0.235;
    const half = THREE.MathUtils.clamp(fuseWidthAt(MD.fuse, zP) * 0.9, 0.3, 0.7);
    const bot = new THREE.Vector3(0, glareY, zP - 0.3);
    const top = MD.canopy
      ? new THREE.Vector3(0, MD.canopy.y + MD.canopy.h * 0.75, MD.canopy.z0 + (MD.canopy.z1 - MD.canopy.z0) * 0.3)
      : new THREE.Vector3(0, E.y + 0.3, zP + 0.5);
    windshield = { C: bot.clone().add(top).multiplyScalar(0.5), U: new THREE.Vector3(half, 0, 0), V: top.clone().sub(bot).multiplyScalar(0.5) };
  }

  // ----- feux : lampe + halo (visible de loin, brille avec le bloom) -----
  const light = (c, x, y, z, r = 0.07, halo = 0.7) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(6) }));
    m.position.set(x, y, z);
    if (detail) {
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(c).multiplyScalar(1.4), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      spr.scale.setScalar(halo);
      m.add(spr);
    }
    g.add(m);
    return m;
  };
  const LT = MD.lights, tipY = yAt(W.half) + 0.005;
  const lights = [light(0xff1a1a, -(W.half + 0.02), tipY, LT.navZ), light(0x18ff50, W.half + 0.02, tipY, LT.navZ), light(0xffffff, 0, LT.tail[0], LT.tail[1])];
  const strobe = light(0xffffff, 0, LT.strobe[0], LT.strobe[1], 0.09, 1.6);
  const [lx, ly, lz] = LT.landing;
  const landing = light(0xfff3cf, lx, ly, lz, 0.1, 1.0);
  for (const l of [...lights, strobe, landing]) l.visible = false;
  let landingLight = null;
  if (opts.landingLight) {
    // phare d'atterrissage : vraie lumière qui éclaire la piste la nuit
    landingLight = new THREE.SpotLight(0xfff1d6, 0, 1200, 0.3, 0.55, 1.1);
    landingLight.position.set(lx, ly - 0.08, lz - 0.03);
    landingLight.target.position.set(lx, -6, -60);
    g.add(landingLight, landingLight.target);
  }

  // ----- décalcomanies : immatriculation sur le fuselage, emblème sur la dérive -----
  const reg = LV.reg || `F-JP${def.id.slice(0, 2).toUpperCase()}`;
  const zr = zNose + len * 0.66;
  const fr = MD.fuse.find((k, i) => MD.fuse[i + 1] && zr >= k[0] && zr <= MD.fuse[i + 1][0]) || MD.fuse[0];
  const hr = fr[2], wr0 = fuseWidthAt(MD.fuse, zr);
  const regTex = decalTexture('reg', reg, LV, BODY);
  const regH = Math.max(0.12, hr * 0.55), regW = regH * 4;
  const decals = [...canopyParts];
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(regW, regH), decalMat(regTex));
    m.position.set(s * (wr0 + 0.012), fr[3] + hr * 0.05, zr);
    m.rotation.y = s * Math.PI / 2;
    g.add(m);
    decals.push(m);
  }
  if (LV.emblem !== 'aucun') {
    const em = decalTexture('emblem', LV.emblem, LV, BODY);
    const fy = F.y0 + (F.y1 - F.y0) * 0.45, ft = (fy - F.y0) / (F.y1 - F.y0), fc = lerp(F.root, F.tip, ft), fle = lerp(F.le0, F.le1, ft);
    const sz = Math.min((F.y1 - F.y0) * 0.55, fc * 0.6);
    for (const s of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(sz, sz), decalMat(em));
      m.position.set(s * (fc * 0.05 + 0.012), fy, fle + fc * 0.36);
      m.rotation.y = s * Math.PI / 2;
      g.add(m);
      decals.push(m);
    }
  }

  // modèle 3D détaillé (glTF) à la place du modèle dessiné par le code, quand il existe pour cet avion
  let glbInfo = null;
  if (GLB[def.id]) {
    glbInfo = mountGlb(g, GLB[def.id], {
      paintFuse, paintWing, ZC, BODY, ACC, ACC2, LV, FINISH, props, lights, strobe, landing, landingLight, pilot, interior, panel, legs, decals, retractable: def.specs.retractable,
      regTex, emblemTex: LV.emblem !== 'aucun' ? decalTexture('emblem', LV.emblem, LV, BODY) : null,
    });
  }

  // autocollants collés au hangar (projetés sur la carrosserie)
  if (LV.stickers.length) decals.push(...applyStickers(g, LV.stickers));

  g.traverse((o) => { if (o.isMesh && !(o.material instanceof THREE.MeshBasicMaterial) && !Array.isArray(o.material)) { o.castShadow = !o.userData.noCast; o.receiveShadow = true; } });
  fuse.castShadow = true;
  const ex = MD.exhaust;
  g.userData = {
    type: def.id, props, fans, legs, lights, strobe, landing, landingLight,
    flapL: glbInfo?.flapL ?? flapL, flapR: glbInfo?.flapR ?? flapR, ailL: glbInfo?.ailL ?? ailL, ailR: glbInfo?.ailR ?? ailR,
    elevator: glbInfo?.elevator ?? elevator, rudder: glbInfo?.rudder ?? rudder,
    fuse, interior, pilot, panel, yokes: glbInfo?.yokes ?? yokes, decals, cabin: glbInfo?.cabin ?? null,
    shell: glbInfo ? null : shell, cockpitSet: glbInfo ? null : cockpitSet,
    windshield: glbInfo?.windshield ?? windshield,
    // points utiles aux effets et à la caméra (repère de l'avion)
    eye: glbInfo?.eye ?? new THREE.Vector3(sx, CB.seatY + 0.83, sz - 0.1),
    exhaust: glbInfo?.exhaust ?? new THREE.Vector3(ex[0], ex[1] - 0.02, ex[2] + 0.12),
    wingtips: glbInfo?.wingtips ?? [new THREE.Vector3(-W.half, yAt(W.half), MD.tipFxZ), new THREE.Vector3(W.half, yAt(W.half), MD.tipFxZ)],
    wheels: def.geo.wheels.filter((w) => w.brake).map((w) => w.p.clone()).concat(def.geo.wheels.filter((w) => w.nose).map((w) => w.p.clone())),
  };
  return g;
}

// ----------------------------------------------------------------------------------------------------
// Modèles 3D détaillés (glTF) : chargés au démarrage ; sans eux, le modèle dessiné par le code est utilisé.
// Repère du fichier : nez vers +Z, gauche vers +X, roues posées sur y = 0. On le retourne (nez vers -Z) et on le
// recale pour que ses roues tombent sur les points de contact de la physique (aircraft.js).
// ----------------------------------------------------------------------------------------------------
const GLB = {};
const GLB_FILES = { cub: { file: 'cub.glb', offset: [0, -1.55, 0.45] } };
// Pilote 3D (models/pilote.glb) mis une fois pour toutes en position assise, puis copié dans chaque avion.
// Le modèle regarde vers +z et a les hanches à SEAT_HIPS.y : chaque os est orienté vers une direction voulue.
let PILOT = null;
function poseSeated(root) {
  const B = {};
  root.traverse((o) => { if (o.isBone) B[o.name.replace(/^mixamorig:?/, '')] = o; });
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
  // oriente l'os pour que la direction vers son premier os enfant devienne dir (repère du modèle)
  const aim = (name, dir) => {
    const b = B[name], c = b?.children.find((o) => o.isBone);
    if (!b || !c) return;
    root.updateMatrixWorld(true);
    b.getWorldPosition(v1); c.getWorldPosition(v2);
    qa.setFromUnitVectors(v2.sub(v1).normalize(), dir.clone().normalize());
    b.getWorldQuaternion(qb);
    const world = qa.multiply(qb);
    b.parent.getWorldQuaternion(qb).invert();
    b.quaternion.copy(qb.multiply(world));
  };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  aim('Spine', V(0, 1, -0.12)); aim('Spine1', V(0, 1, -0.08)); aim('Spine2', V(0, 1, -0.04)); aim('Neck', V(0, 1, 0.12)); aim('Head', V(0, 1, 0.05));
  for (const [side, sx] of [['Left', 1], ['Right', -1]]) {
    aim(`${side}UpLeg`, V(sx * 0.12, -0.12, 1));   // cuisses à l'horizontale sur le siège
    aim(`${side}Leg`, V(sx * 0.03, -0.6, 1));      // jambes allongées vers les pédales (petit avion)
    aim(`${side}Foot`, V(0, 0.45, 1));            // pieds sur les pédales
    aim(`${side}Arm`, V(sx * 0.28, -0.75, 0.6));   // bras le long du corps, vers l'avant
    aim(`${side}ForeArm`, V(-sx * 0.12, 0.05, 1)); // avant-bras vers le manche
    aim(`${side}Hand`, V(-sx * 0.1, -0.1, 1));
  }
  root.updateMatrixWorld(true);
  return B.Hips.getWorldPosition(new THREE.Vector3());
}
// habille une copie du pilote (vraie tenue : vêtements, chapeau ou casque, accessoires, voir pilotOutfit.js)
function tintSuit(m, suit) {
  m.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    o.castShadow = true;
    o.userData.shared = true;
  });
  return dressPilot(m, suit);
}
// pilote debout dans sa tenue (aperçu du hangar), ou null si le modèle n'est pas chargé
export function standingPilot(suit) {
  if (!PILOT) return null;
  return tintSuit(cloneSkinned(PILOT.standing), suit);
}
// copie du pilote assis, teinte selon sa tenue ; hips : point où poser les hanches (repère de l'avion)
function seatedPilot(hips, suit) {
  const m = tintSuit(cloneSkinned(PILOT.root), suit); // géométrie commune à tous les avions : jamais libérée
  m.rotation.y = Math.PI; // le modèle regarde vers +z, l'avion vers -z
  m.position.copy(hips).sub(PILOT.hips.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
  return m;
}

export async function loadPlaneModels(base = 'models/') {
  const loader = new GLTFLoader();
  const pilotJob = loader.loadAsync(`${base}pilote.glb`).then((g) => {
    const standing = cloneSkinned(g.scene); // copie debout (aperçu de la tenue au hangar)
    const hips = poseSeated(g.scene);
    PILOT = { root: g.scene, hips, standing };
  }).catch((e) => console.warn('Pilote 3D indisponible, pilote simplifié utilisé', e));
  await Promise.all(Object.entries(GLB_FILES).map(async ([id, f]) => {
    try {
      const gltf = await loader.loadAsync(base + f.file);
      const root = new THREE.Group();
      gltf.scene.rotation.y = Math.PI;
      gltf.scene.position.fromArray(f.offset);
      root.add(gltf.scene);
      root.updateMatrixWorld(true);
      // profil du fuselage (hauteur et centre par tranche) pour appliquer les motifs de peinture
      const shell = root.getObjectByName('Coque_Fuselage');
      const prof = [];
      if (shell) {
        const pos = shell.geometry.attributes.position, v = new THREE.Vector3();
        const bins = new Map();
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(shell.matrixWorld);
          const k = Math.round(v.z / 0.2);
          const b = bins.get(k) || { lo: Infinity, hi: -Infinity };
          b.lo = Math.min(b.lo, v.y); b.hi = Math.max(b.hi, v.y);
          bins.set(k, b);
        }
        for (const [k, b] of [...bins].sort((a, c) => a[0] - c[0])) prof.push([k * 0.2, (b.hi - b.lo) / 2, (b.hi + b.lo) / 2]);
      }
      root.userData.profile = prof;
      GLB[id] = root;
    } catch (e) {
      console.warn(`Modèle 3D ${f.file} indisponible, modèle simplifié utilisé`, e);
    }
  }));
  await pilotJob;
}

const PAINTED = /^(Peinture_Blanche|Bande_Bleue|Bande_Rouge)$/;
// installe le modèle glTF dans le groupe de l'avion et le relie aux animations, feux, peinture et cockpit
function mountGlb(g, src, k) {
  const procedural = [...g.children];
  const model = src.clone(true);
  model.traverse((o) => { if (o.isMesh) o.userData.shared = true; }); // géométries du fichier, communes à tous les avions
  g.add(model);
  g.updateMatrixWorld(true);
  const box = (o) => new THREE.Box3().setFromObject(o);
  const center = (o) => box(o).getCenter(new THREE.Vector3());
  const find = (n) => model.getObjectByName(n);

  // le modèle dessiné par le code disparaît (on garde ses feux, le pilote et la planche de bord animée)
  const keep = new Set([...k.lights, k.strobe, k.landing, k.landingLight, k.landingLight?.target, k.pilot, k.interior, ...k.props.map((p) => p.disc)].filter(Boolean));
  for (const o of procedural) if (!keep.has(o)) g.remove(o);
  for (const o of [...k.interior.children]) if (o !== k.panel) k.interior.remove(o);
  k.legs.length = 0; // remplacées par les jambes du modèle (ci-dessous) si le train est escamotable
  k.decals.length = 0;

  // peinture : couleurs par sommet calculées avec les mêmes motifs et zones que le modèle dessiné
  const prof = src.userData.profile;
  const section = (z) => {
    if (!prof.length) return [0.6, 0];
    let i = prof.findIndex((p) => p[0] >= z);
    if (i <= 0) return [prof[Math.max(0, i)][1], prof[Math.max(0, i)][2]];
    const a = prof[i - 1], b = prof[i], t = (z - a[0]) / (b[0] - a[0] || 1);
    return [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  };
  const origine = k.LV.pattern === 'origine';
  const paintMats = new Map();
  const c = new THREE.Color(), v = new THREE.Vector3();
  model.traverse((o) => {
    if (!o.isMesh || !PAINTED.test(o.material?.name || '')) return;
    const n = o.name, matName = o.material.name;
    const stripe = matName !== 'Peinture_Blanche';
    // bandes d'origine : seulement avec la peinture d'origine (sinon elles suivent le motif choisi)
    const pos = o.geometry.attributes.position;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      if (stripe && origine) c.copy(matName === 'Bande_Bleue' ? k.ACC2 : k.ACC);
      else if (/^(Aile|Volet|Aileron|Bande_Saumon)/.test(n)) {
        k.paintWing(c, v, true);
        if (/^(Volet|Aileron)/.test(n) && k.ZC.surfaces) c.copy(k.ZC.surfaces);
      } else if (/^Stabilisateur/.test(n)) c.copy(k.ZC.stab || k.BODY);
      else if (/^(Gouverne|Tab_|Bande_Gouverne)/.test(n)) c.copy(k.ZC.surfaces || k.BODY);
      else if (/^Derive/.test(n)) c.copy(k.ZC.fin || k.BODY);
      else if (/^Carenage/.test(n)) c.copy(k.ZC.pants || k.BODY);
      else {
        const [h, yc] = section(v.z);
        k.paintFuse(c, v.z, (v.y - yc) / Math.max(0.05, h), { x: v.x, y: v.y - yc }, true);
      }
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    // géométrie partagée (positions, normales) + couleurs propres à cet avion
    const geo = new THREE.BufferGeometry();
    geo.setIndex(o.geometry.index);
    for (const [name, a] of Object.entries(o.geometry.attributes)) geo.setAttribute(name, a);
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.boundingBox = o.geometry.boundingBox; geo.boundingSphere = o.geometry.boundingSphere;
    o.geometry = geo;
    o.userData.shared = false;
    const side = o.material.side;
    if (!paintMats.has(side)) paintMats.set(side, new THREE.MeshPhysicalMaterial({ vertexColors: true, ...k.FINISH, side }));
    o.material = paintMats.get(side);
    o.userData.paint = true;
  });

  // pièces mobiles : on les accroche à un pivot placé sur leur charnière (bord avant = côté nez, z minimal)
  const hinge = (name) => {
    const o = find(name);
    if (!o) return null;
    const b = box(o), pivot = new THREE.Group();
    pivot.position.set((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, b.min.z);
    g.add(pivot);
    pivot.attach(o);
    return pivot;
  };
  const out = {
    flapL: hinge('Volet_Gauche'), flapR: hinge('Volet_Droite'), ailL: hinge('Aileron_Gauche'), ailR: hinge('Aileron_Droite'),
    elevator: hinge('Gouverne_Profondeur'), rudder: hinge('Gouverne_Direction'),
  };
  // hélice : les pales tournent autour du cône
  const cone = find('Cone_Helice');
  if (cone && k.props[0]) {
    const hub = center(cone), spin = new THREE.Group();
    spin.position.copy(hub);
    g.add(spin);
    for (const n of ['Pale_Helice_1', 'Pale_Helice_2']) { const b = find(n); if (b) spin.attach(b); }
    const p0 = k.props[0];
    p0.prop = spin;
    p0.disc.position.set(hub.x, hub.y, hub.z - 0.06);
    p0.disc.scale.setScalar(0.92);
  }
  // train d'atterrissage escamotable : les jambes principales se replient vers le fuselage, la roue avant vers l'arrière
  if (k.retractable) {
    const leg = (names, fold) => {
      const parts = names.map(find).filter(Boolean);
      if (!parts.length) return;
      const b = new THREE.Box3();
      for (const o of parts) b.union(box(o));
      const pivot = new THREE.Group();
      // charnière en haut de la jambe, côté fuselage
      pivot.position.set(fold ? (fold > 0 ? b.max.x : b.min.x) : (b.min.x + b.max.x) / 2, b.max.y, fold ? (b.min.z + b.max.z) / 2 : b.min.z);
      g.add(pivot);
      for (const o of parts) pivot.attach(o);
      pivot.userData.fold = fold;
      k.legs.push(pivot);
    };
    leg(['Jambe_Train_Gauche', 'Essieu_Gauche', 'Marchepied_Gauche', 'Roue_Principale_Gauche', 'Carenage_Roue_Gauche'], 1);
    leg(['Jambe_Train_Droite', 'Essieu_Droite', 'Marchepied_Droite', 'Roue_Principale_Droite', 'Carenage_Roue_Droite'], -1);
    leg(['Train_Avant'], 0);
  }
  // manches : pivot au centre (tourne pour le roulis, avance / recule pour le tangage)
  out.yokes = ['Manche_Pilote', 'Manche_CoPilote'].map((n) => {
    const o = find(n);
    if (!o) return null;
    const pivot = new THREE.Group();
    pivot.position.copy(center(o));
    g.add(pivot);
    pivot.attach(o);
    pivot.userData.z0 = pivot.position.z;
    return pivot;
  }).filter(Boolean);
  // planche de bord animée par-dessus celle du modèle (dont on cache les cadrans en relief)
  for (const n of ['Instruments', 'Pile_Radio', 'Interrupteurs', 'Boite_A_Gants']) { const o = find(n); if (o) o.visible = false; }
  const dash = find('Tableau_De_Bord');
  if (dash) {
    const b = box(dash);
    k.panel.position.set(0, (b.min.y + b.max.y) / 2, b.max.z + 0.006);
    k.panel.rotation.set(0, 0, 0);
    k.panel.scale.set((b.max.x - b.min.x) / k.panel.geometry.parameters.width, (b.max.y - b.min.y) / k.panel.geometry.parameters.height, 1);
  }
  // feux du modèle dessiné, replacés sur ceux du fichier
  const at = (n) => (find(n) ? center(find(n)) : null);
  const place = (lamp, n) => { const p = at(n); if (lamp && p) lamp.position.copy(p); };
  place(k.lights[0], 'Feu_Nav_Gauche'); place(k.lights[1], 'Feu_Nav_Droite'); place(k.lights[2], 'Feu_Arriere');
  place(k.strobe, 'Feu_Anticollision'); place(k.landing, 'Phare_Atterrissage');
  if (k.landingLight && at('Phare_Atterrissage')) {
    const p = at('Phare_Atterrissage');
    k.landingLight.position.copy(p);
    k.landingLight.target.position.set(p.x, -6, p.z - 60);
  }
  // pilote assis dans le siège avant gauche du modèle
  const seat = find('Siege_Avant_Gauche');
  if (k.pilot && seat) {
    const b = box(seat);
    k.pilot.position.set(0, b.min.y + 0.12 - (-0.12), (b.min.z + b.max.z) / 2 + 0.95 - 0.03);
  }
  const shield = find('Pare_Brise');
  if (shield) {
    // vitre inclinée : bas vers l'avant (z min), haut vers l'arrière (z max)
    const b = box(shield);
    const bot = new THREE.Vector3((b.min.x + b.max.x) / 2, b.min.y, b.min.z), top = new THREE.Vector3((b.min.x + b.max.x) / 2, b.max.y, b.max.z);
    out.windshield = { C: bot.clone().add(top).multiplyScalar(0.5), U: new THREE.Vector3((b.max.x - b.min.x) / 2, 0, 0), V: top.sub(bot).multiplyScalar(0.5) };
  }
  if (seat) {
    const b = box(seat);
    out.eye = new THREE.Vector3((b.min.x + b.max.x) / 2, b.max.y - 0.21, b.max.z - 0.42); // un peu plus bas : on voit mieux la piste // tête droite, un peu en avant de l'appuie-tête : on voit mieux par le pare-brise
  }
  const exh = at('Echappement');
  if (exh) out.exhaust = exh.add(new THREE.Vector3(0, -0.02, 0.1));
  const nl = at('Feu_Nav_Gauche'), nr = at('Feu_Nav_Droite');
  if (nl && nr) out.wingtips = [nl, nr];
  // plaques d'immatriculation d'origine : remplacées par nos décalcomanies
  const plates = ['Immatriculation_Gauche', 'Immatriculation_Droite'].map((n) => find(n)).filter(Boolean).map((o) => ({ o, b: box(o) }));
  for (const { o } of plates) o.visible = false;

  // optimisation : les pièces fixes sont fusionnées par matériau (même image, ~10 fois moins d'appels de dessin) ;
  // l'intérieur de la cabine est à part pour pouvoir le cacher quand la caméra est loin
  const cabin = new THREE.Group();
  g.add(cabin);
  out.cabin = cabin;
  const targets = mergeStatic(model, g, cabin, src);
  g.remove(model);
  for (const { b } of plates) {
    const sx = 1;
    const p = b.getCenter(new THREE.Vector3());
    k.decals.push(...projectDecal(g, targets, p, new THREE.Vector3(Math.sign(p.x) || sx, 0, 0), b.max.z - b.min.z, (b.max.z - b.min.z) / 4, 0, k.regTex));
  }
  if (k.emblemTex) {
    const fin = find('Derive');
    if (fin) {
      const b = box(fin), p = b.getCenter(new THREE.Vector3()), sz = Math.min(b.max.y - b.min.y, b.max.z - b.min.z) * 0.55;
      for (const sx of [-1, 1]) k.decals.push(...projectDecal(g, targets, new THREE.Vector3(sx * 0.06, p.y, p.z + 0.2), new THREE.Vector3(sx, 0, 0), sz, sz, 0, k.emblemTex));
    }
  }
  return out;
}

// Fusion des pièces fixes : une géométrie par matériau (et par jeu d'attributs). Les pièces non peintes sont
// identiques pour tous les avions de ce type : leur fusion est faite une fois et partagée. Renvoie les maillages peints.
function mergeStatic(model, g, cabin, src) {
  g.updateMatrixWorld(true);
  const visible = (o) => { for (let n = o; n && n !== model; n = n.parent) if (!n.visible) return false; return true; };
  const inside = (o) => { for (let n = o; n && n !== model; n = n.parent) if (n.name === 'Interieur') return true; return false; };
  const groups = new Map();
  model.traverse((o) => {
    if (!o.isMesh || !visible(o)) return;
    const geo = o.geometry;
    const names = ['position', 'normal', ...(geo.attributes.uv ? ['uv'] : []), ...(geo.attributes.color ? ['color'] : [])];
    const key = `${o.material.uuid}|${names.join(',')}|${inside(o) ? 'in' : 'out'}`;
    if (!groups.has(key)) groups.set(key, { mat: o.material, names, inside: inside(o), paint: !!o.userData.paint, list: [] });
    groups.get(key).list.push(o);
  });
  src.userData.merged ||= new Map();
  const painted = [];
  for (const [key, grp] of groups) {
    let geo = grp.paint ? null : src.userData.merged.get(key);
    if (!geo) {
      const parts = grp.list.map((o) => {
        const sgeo = new THREE.BufferGeometry();
        for (const n of grp.names) sgeo.setAttribute(n, o.geometry.attributes[n].clone());
        sgeo.setIndex(o.geometry.index ? o.geometry.index.clone() : [...Array(o.geometry.attributes.position.count).keys()]);
        sgeo.applyMatrix4(o.matrixWorld);
        return sgeo;
      });
      geo = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
      for (const p of parts) if (p !== geo) p.dispose();
      if (!geo) continue;
      geo.computeBoundingBox();
      geo.computeBoundingSphere();
      if (!grp.paint) src.userData.merged.set(key, geo);
    }
    const m = new THREE.Mesh(geo, grp.mat);
    m.userData.noCast = grp.inside; // l'intérieur ne projette pas d'ombre visible
    m.receiveShadow = true;
    m.userData.shared = !grp.paint; // géométrie partagée : ne pas la libérer avec l'avion
    if (grp.paint) { m.userData.paint = true; painted.push(m); }
    (grp.inside ? cabin : g).add(m);
  }
  return painted;
}

// projette une image sur les pièces données (décalcomanie qui épouse la carrosserie)
function projectDecal(g, targets, p, n, w, h, rotDeg, tex, mirror = false) {
  _do.position.copy(p);
  _do.lookAt(p.clone().add(n));
  _do.rotateZ(THREE.MathUtils.degToRad(rotDeg));
  const size = new THREE.Vector3(w, h, Math.max(0.25, Math.max(w, h) * 0.6));
  let map = tex;
  if (mirror) { map = tex.clone(); map.wrapS = THREE.RepeatWrapping; map.repeat.x = -1; map.offset.x = 1; map.needsUpdate = true; }
  const mat = new THREE.MeshStandardMaterial({ map, transparent: true, depthWrite: false, roughness: 0.45, polygonOffset: true, polygonOffsetFactor: -4, side: THREE.DoubleSide });
  _sph.set(p, Math.max(w, h));
  const out = [];
  for (const mesh of targets) {
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    _box.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
    if (!_box.intersectsSphere(_sph)) continue;
    const geo = keepFront(new DecalGeometry(mesh, p, _do.rotation, size), p, n);
    if (!geo) continue;
    const d = new THREE.Mesh(geo, mat);
    d.renderOrder = 3;
    g.add(d);
    out.push(d);
  }
  return out;
}

// Autocollants : chaque autocollant est projeté (DecalGeometry) sur les pièces peintes qu'il touche.
// st : { k, p:[x,y,z], n:[x,y,z], s, r, c, t, m } dans le repère de l'avion ; m = copie symétrique de l'autre côté.
const _dp = new THREE.Vector3(), _dn = new THREE.Vector3(), _do = new THREE.Object3D(), _box = new THREE.Box3(), _sph = new THREE.Sphere();
export function applyStickers(g, stickers) {
  g.updateMatrixWorld(true);
  const targets = [];
  g.traverse((o) => { if (o.isMesh && o.userData.paint) targets.push(o); });
  const out = [];
  for (const st of stickers) {
    for (const mirror of st.m ? [false, true] : [false]) {
      _dp.fromArray(st.p);
      _dn.fromArray(st.n).normalize();
      if (mirror) { _dp.x = -_dp.x; _dn.x = -_dn.x; }
      _do.position.copy(_dp);
      _do.lookAt(_dp.clone().add(_dn));
      _do.rotateZ(THREE.MathUtils.degToRad(mirror ? -st.r : st.r));
      const size = new THREE.Vector3(st.s, st.s, Math.max(0.25, st.s * 0.6));
      const mat = new THREE.MeshStandardMaterial({
        map: stickerTexture(st.k, st.c, st.t, mirror), transparent: true, depthWrite: false, roughness: 0.45,
        polygonOffset: true, polygonOffsetFactor: -4, side: THREE.DoubleSide,
      });
      _sph.set(_dp, st.s);
      for (const mesh of targets) {
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
        _box.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
        if (!_box.intersectsSphere(_sph)) continue;
        const geo = keepFront(new DecalGeometry(mesh, _dp, _do.rotation, size), _dp, _dn);
        if (!geo) continue;
        const d = new THREE.Mesh(geo, mat);
        d.renderOrder = 3;
        g.add(d);
        out.push(d);
      }
    }
  }
  return out;
}
// ne garde que la face visée (sinon l'autocollant traverserait les ailes minces et apparaîtrait dessous)
function keepFront(geo, p, n) {
  const pos = geo.attributes.position;
  if (!pos || !pos.count) return null;
  const keep = [];
  for (let i = 0; i < pos.count; i += 3) {
    const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3 - p.x;
    const cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3 - p.y;
    const cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3 - p.z;
    if (cx * n.x + cy * n.y + cz * n.z > -0.06) keep.push(i);
  }
  if (!keep.length) return null;
  if (keep.length * 3 === pos.count) return geo;
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const a = geo.attributes[name];
    if (!a) continue;
    const arr = new Float32Array(keep.length * 3 * a.itemSize);
    keep.forEach((i, k) => { for (let v = 0; v < 3; v++) for (let c = 0; c < a.itemSize; c++) arr[(k * 3 + v) * a.itemSize + c] = a.array[(i + v) * a.itemSize + c]; });
    out.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
  }
  geo.dispose();
  return out;
}

// Textures des décalcomanies (dessinées sur un canvas)
const decalCache = new Map();
function decalTexture(kind, value, LV, BODY) {
  const lum = BODY.r * 0.3 + BODY.g * 0.59 + BODY.b * 0.11;
  const ink = lum > 0.5 ? '#16181c' : '#f4f4f0';
  const key = `${kind}|${value}|${LV.emblemColor}|${LV.number}|${ink}|${LV.regColor}`;
  if (decalCache.has(key)) return decalCache.get(key);
  const c = document.createElement('canvas');
  c.width = kind === 'reg' ? 512 : 256;
  c.height = kind === 'reg' ? 128 : 256;
  const x = c.getContext('2d');
  if (kind === 'reg') {
    x.fillStyle = LV.regColor || ink;
    if (LV.regColor) { x.lineWidth = 7; x.lineJoin = 'round'; x.strokeStyle = inkLight(LV.regColor) ? '#16181c' : '#f4f4f0'; } // contour lisible
    x.font = 'bold 92px "Arial Narrow", Arial, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    if (LV.regColor) x.strokeText(value, 256, 68, 500);
    x.fillText(value, 256, 68, 500);
  } else if (!['etoile', 'eclair', 'coeur', 'cocarde', 'numero', 'couronne', 'aile'].includes(value)) {
    drawSticker(c, value, LV.emblemColor); // emblèmes qui reprennent un dessin d'autocollant
  } else {
    const col = LV.emblemColor;
    x.translate(128, 128);
    x.lineJoin = 'round';
    x.fillStyle = col;
    x.strokeStyle = ink;
    x.lineWidth = 8;
    const path = new Path2D();
    if (value === 'etoile') {
      for (let k = 0; k < 10; k++) { const r = k % 2 ? 46 : 112, a = (k / 10) * Math.PI * 2 - Math.PI / 2; k ? path.lineTo(Math.cos(a) * r, Math.sin(a) * r) : path.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
      path.closePath();
    } else if (value === 'eclair') {
      [[20, -118], [-62, 14], [-6, 14], [-30, 118], [62, -20], [6, -20], [34, -118]].forEach(([a, b], k) => (k ? path.lineTo(a, b) : path.moveTo(a, b)));
      path.closePath();
    } else if (value === 'coeur') {
      path.moveTo(0, 100);
      path.bezierCurveTo(-150, 0, -90, -120, 0, -50);
      path.bezierCurveTo(90, -120, 150, 0, 0, 100);
    } else if (value === 'cocarde' || value === 'numero') {
      path.arc(0, 0, 112, 0, Math.PI * 2);
    } else if (value === 'couronne') {
      [[-100, 70], [-110, -60], [-50, 0], [0, -95], [50, 0], [110, -60], [100, 70]].forEach(([a, b], k) => (k ? path.lineTo(a, b) : path.moveTo(a, b)));
      path.closePath();
    } else if (value === 'aile') {
      path.moveTo(-120, -10);
      path.quadraticCurveTo(-60, -70, 0, -20);
      path.quadraticCurveTo(60, -70, 120, -10);
      path.quadraticCurveTo(60, 10, 0, 40);
      path.quadraticCurveTo(-60, 10, -120, -10);
    }
    x.stroke(path);
    x.fill(path);
    if (value === 'cocarde') {
      x.fillStyle = '#f4f4f0'; x.beginPath(); x.arc(0, 0, 74, 0, Math.PI * 2); x.fill();
      x.fillStyle = col; x.beginPath(); x.arc(0, 0, 38, 0, Math.PI * 2); x.fill();
    }
    if (value === 'numero' || value === 'aile') {
      x.fillStyle = value === 'numero' ? ink : ink;
      x.font = `bold ${value === 'numero' ? 130 : 54}px Arial, sans-serif`;
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText(value === 'numero' ? String(LV.number) : 'JP', 0, value === 'numero' ? 8 : 6);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  decalCache.set(key, t);
  return t;
}
function decalMat(map) {
  return new THREE.MeshStandardMaterial({ map, transparent: true, roughness: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
}

// libère la mémoire d'un avion retiré de la scène (sans toucher aux géométries partagées entre avions)
export function disposePlaneMesh(mesh) {
  mesh.traverse((o) => { if (o.isMesh && !o.userData.shared) o.geometry.dispose(); });
}

// Vue cockpit : on cache la carrosserie qui gênerait (fuselage extérieur, pilote) et on garde l'intérieur
export function setCockpitView(mesh, inside) {
  const u = mesh.userData;
  u.fuse.visible = !inside;
  if (u.shell) u.shell.visible = !inside; // parois vues du dehors à travers les vitres ; dedans, l'habitacle prend le relais
  if (u.cockpitSet) u.cockpitSet.visible = inside;
  for (const d of u.decals || []) d.visible = !inside;
  if (u.pilot) u.pilot.visible = !inside;
}

// Anime les pièces mobiles à partir de l'état (joueur local ou distant)
export function animatePlaneMesh(mesh, st, dt, time) {
  const u = mesh.userData;
  const rpm = st.rpm || 0;
  for (const p of u.props) {
    p.prop.rotation.z += dt * (rpm > 0.05 ? 8 + rpm * 70 : 0) * p.spin;
    p.prop.visible = rpm < 0.45;
    p.disc.material.opacity = rpm > 0.3 ? Math.min(0.35, (rpm - 0.3) * 1.5) : 0;
  }
  for (const f of u.fans) f.rotation.z += dt * rpm * 55;
  if (u.flapL) u.flapL.rotation.x = u.flapR.rotation.x = (st.flapPos || 0) * 0.17;
  u.ailL.rotation.x = (st.roll || 0) * 0.3;
  u.ailR.rotation.x = -(st.roll || 0) * 0.3;
  u.elevator.rotation.x = -(st.pitch || 0) * 0.35;
  u.rudder.rotation.y = (st.yaw || 0) * 0.35;
  const gp = st.gearPos ?? 1;
  for (const leg of u.legs) {
    if (leg.userData.fixed) continue;
    if (leg.userData.fold) leg.rotation.z = leg.userData.fold * (1 - gp) * Math.PI / 2;
    else leg.rotation.x = -(1 - gp) * Math.PI / 2;
    leg.visible = gp > 0.03;
  }
  for (const y of u.yokes) {
    if (y.userData.stick) { y.rotation.x = (st.pitch || 0) * 0.3; y.rotation.z = -(st.roll || 0) * 0.3; continue; }
    y.rotation.z = -(st.roll || 0) * 0.5;
    y.position.z = y.userData.z0 + (st.pitch || 0) * 0.06;
  }
  const on = !!st.lights;
  for (const l of u.lights) l.visible = on;
  u.strobe.visible = on && time % 1.2 < 0.08;
  u.landing.visible = on;
  if (u.landingLight) u.landingLight.intensity = on ? 4000 * (st.night ?? 1) : 0;
}
