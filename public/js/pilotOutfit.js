// Tenues du pilote (models/pilote.glb) : vraies tenues, pas une simple teinte.
// Chaque tenue recolore entièrement les vêtements (en gardant le relief des plis), cache ou garde la casquette, la
// cravate et les galons, ajoute un motif (fleurs, camouflage, carreaux, bandes) et des accessoires attachés aux os
// (casque à visière, serre-tête en cuir et lunettes, casque radio, lunettes de soleil, chapeaux, écharpe…).
// dressPilot(root, suit) s'applique à n'importe quelle copie du modèle, dans n'importe quelle pose (assis, debout,
// cinématique) : les accessoires sont placés grâce aux matrices de repos du squelette.
import * as THREE from 'three';
import { OUTFITS } from './livery.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
// repères du modèle au repos (mètres, regard vers +z)
const HEAD = V(0, 1.712, 0.045); // centre de la tête
const NECK = V(0, 1.565, 0.02);

// ----- matériaux et motifs (créés une seule fois, communs à tous les pilotes) -----
const MATS = new Map();
const mat = (color, o = {}) => {
  const key = JSON.stringify([color, o]);
  if (!MATS.has(key)) MATS.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, ...o }));
  return MATS.get(key);
};
const PATTERNS = new Map();
function pattern(kind, a, b) {
  const key = `${kind}${a}${b}`;
  if (PATTERNS.has(key)) return PATTERNS.get(key);
  const S = 256, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = a; g.fillRect(0, 0, S, S);
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  if (kind === 'fleurs') {
    for (let i = 0; i < 70; i++) {
      const x = rnd() * S, y = rnd() * S, r = 5 + rnd() * 9;
      g.fillStyle = [b, '#ffffff', '#ffd23f'][i % 3];
      for (let k = 0; k < 5; k++) { const t = (k / 5) * Math.PI * 2; g.beginPath(); g.arc(x + Math.cos(t) * r, y + Math.sin(t) * r, r * 0.6, 0, 7); g.fill(); }
      g.fillStyle = '#ffef9a'; g.beginPath(); g.arc(x, y, r * 0.4, 0, 7); g.fill();
    }
  } else if (kind === 'camo') {
    for (const c of [b, '#3b3a26', '#8a8455']) {
      g.fillStyle = c;
      for (let i = 0; i < 26; i++) { g.beginPath(); g.ellipse(rnd() * S, rnd() * S, 10 + rnd() * 26, 6 + rnd() * 16, rnd() * 3, 0, 7); g.fill(); }
    }
  } else if (kind === 'carreaux') {
    g.globalAlpha = 0.55; g.fillStyle = b;
    for (let i = 0; i < S; i += 32) { g.fillRect(i, 0, 14, S); g.fillRect(0, i, S, 14); }
    g.globalAlpha = 0.35; g.fillStyle = '#ffffff';
    for (let i = 20; i < S; i += 32) { g.fillRect(i, 0, 2, S); g.fillRect(0, i, S, 2); }
  } else if (kind === 'bandes') {
    g.fillStyle = b;
    for (let i = 0; i < S; i += 64) g.fillRect(0, i + 24, S, 14);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  PATTERNS.set(key, tex);
  return tex;
}
// matériau d'un vêtement pour une tenue : couleur pleine (ou motif) à la place de la texture, plis conservés
const CLOTH = new Map();
function clothMat(base, spec) {
  const key = `${base.uuid}${JSON.stringify(spec)}`;
  if (CLOTH.has(key)) return CLOTH.get(key);
  const m = base.clone();
  if (typeof spec === 'string') { m.map = null; m.color.set(spec); } else {
    m.map = pattern(spec.pattern, spec.color, spec.color2);
    m.color.set('#ffffff');
  }
  m.needsUpdate = true;
  CLOTH.set(key, m);
  return m;
}

// ----- accessoires (géométries dans le repère du modèle au repos) -----
const GEO = new Map();
const geo = (key, make) => { if (!GEO.has(key)) GEO.set(key, make()); return GEO.get(key); };
function part(g, m, pos, rot = [0, 0, 0], scale = [1, 1, 1]) {
  const o = new THREE.Mesh(g, m);
  o.position.copy(pos); o.rotation.set(...rot); o.scale.set(...scale);
  o.castShadow = true;
  o.userData.shared = true;
  return o;
}
// calotte : morceau de sphère autour de la tête (haut et côtés), visière vers l'avant
const shell = (r, down = 1.75) => geo(`shell${r}${down}`, () => new THREE.SphereGeometry(r, 28, 16, 0, Math.PI * 2, 0, down));
const visorGeo = (r) => geo(`visor${r}`, () => new THREE.SphereGeometry(r, 24, 10, Math.PI / 2 - 0.95, 1.9, 1.12, 0.62));
const ring = (r, tube, arc = Math.PI * 2) => geo(`ring${r}${tube}${arc}`, () => new THREE.TorusGeometry(r, tube, 8, 28, arc));
const cyl = (r1, r2, h, n = 24) => geo(`cyl${r1}${r2}${h}${n}`, () => new THREE.CylinderGeometry(r1, r2, h, n));
const ball = (r) => geo(`ball${r}`, () => new THREE.SphereGeometry(r, 16, 10));
const box = (x, y, z) => geo(`box${x}${y}${z}`, () => new THREE.BoxGeometry(x, y, z));

const BUILD = {
  // casque intégral avec visière fumée (voltige, escadrille, course)
  helmet: (o) => [
    part(shell(0.132), mat(o.color, { roughness: 0.25, metalness: 0.1 }), V(HEAD.x, HEAD.y + 0.012, HEAD.z - 0.01), [0, 0, 0], [1, 1.04, 1.06]),
    part(visorGeo(0.138), mat(o.visor || '#1b2230', { roughness: 0.05, metalness: 0.6 }), V(HEAD.x, HEAD.y + 0.012, HEAD.z - 0.01), [0, 0, 0], [1, 1.04, 1.06]),
    ...(o.stripe ? [part(ring(0.133, 0.012, Math.PI), mat(o.stripe, { roughness: 0.3 }), V(HEAD.x, HEAD.y + 0.02, HEAD.z - 0.01), [0, Math.PI / 2, 0])] : []),
  ],
  // serre-tête en cuir des années 30 + lunettes relevées sur le front
  leather: (o) => {
    const m = mat(o.color, { roughness: 0.75 });
    const brass = mat('#b08a3e', { roughness: 0.35, metalness: 0.8 }), glass = mat('#9fd4ff', { roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.55 });
    return [
      part(shell(0.118, 1.85), m, V(HEAD.x, HEAD.y + 0.008, HEAD.z - 0.012), [0, 0, 0], [1, 1.02, 1.05]),
      part(box(0.035, 0.07, 0.05), m, V(HEAD.x + 0.112, HEAD.y - 0.05, HEAD.z - 0.01)),
      part(box(0.035, 0.07, 0.05), m, V(HEAD.x - 0.112, HEAD.y - 0.05, HEAD.z - 0.01)),
      part(ring(0.122, 0.006), mat('#3a2a1a', { roughness: 0.8 }), V(HEAD.x, HEAD.y + 0.055, HEAD.z - 0.005), [Math.PI / 2 - 0.15, 0, 0]),
      ...[1, -1].flatMap((s) => [
        part(ring(0.026, 0.008), brass, V(HEAD.x + s * 0.035, HEAD.y + 0.068, HEAD.z + 0.108), [-0.35, 0, 0]),
        part(cyl(0.025, 0.025, 0.006, 16), glass, V(HEAD.x + s * 0.035, HEAD.y + 0.068, HEAD.z + 0.108), [Math.PI / 2 - 0.35, 0, 0]),
      ]),
    ];
  },
  // casque radio avec micro
  headset: (o) => {
    const m = mat(o.color || '#1c1e22', { roughness: 0.4 });
    return [
      part(ring(0.118, 0.009, Math.PI), m, V(HEAD.x, HEAD.y + 0.0, HEAD.z - 0.005), [0, Math.PI / 2, 0]),
      part(cyl(0.035, 0.035, 0.03), m, V(HEAD.x + 0.105, HEAD.y - 0.01, HEAD.z), [0, 0, Math.PI / 2]),
      part(cyl(0.035, 0.035, 0.03), m, V(HEAD.x - 0.105, HEAD.y - 0.01, HEAD.z), [0, 0, Math.PI / 2]),
      part(cyl(0.005, 0.005, 0.11, 8), m, V(HEAD.x + 0.075, HEAD.y - 0.055, HEAD.z + 0.07), [Math.PI / 2, 0.7, 0]),
      part(ball(0.012), mat('#2a2c33'), V(HEAD.x + 0.03, HEAD.y - 0.065, HEAD.z + 0.115)),
    ];
  },
  // lunettes de soleil (aviateur)
  shades: (o) => {
    const lens = mat(o.color || '#14161c', { roughness: 0.05, metalness: 0.7 }), frame = mat('#d4af37', { roughness: 0.3, metalness: 0.9 });
    return [
      part(ball(0.022), lens, V(HEAD.x + 0.034, HEAD.y + 0.003, HEAD.z + 0.103), [0, 0, 0], [1.15, 0.85, 0.35]),
      part(ball(0.022), lens, V(HEAD.x - 0.034, HEAD.y + 0.003, HEAD.z + 0.103), [0, 0, 0], [1.15, 0.85, 0.35]),
      part(box(0.03, 0.004, 0.004), frame, V(HEAD.x, HEAD.y + 0.012, HEAD.z + 0.108)),
    ];
  },
  // chapeau de paille (tropiques)
  straw: (o) => {
    const m = mat(o.color || '#e8cf8a', { roughness: 0.9 });
    return [
      part(cyl(0.085, 0.1, 0.085), m, V(HEAD.x, HEAD.y + 0.1, HEAD.z - 0.01)),
      part(cyl(0.2, 0.2, 0.01, 32), m, V(HEAD.x, HEAD.y + 0.062, HEAD.z - 0.01)),
      part(cyl(0.101, 0.101, 0.022), mat(o.band || '#c8261e', { roughness: 0.7 }), V(HEAD.x, HEAD.y + 0.075, HEAD.z - 0.01)),
    ];
  },
  // chapeau de cow-boy (bords relevés)
  cowboy: (o) => {
    const m = mat(o.color || '#7a4e2a', { roughness: 0.85 });
    return [
      part(cyl(0.075, 0.098, 0.11), m, V(HEAD.x, HEAD.y + 0.115, HEAD.z - 0.01), [0, 0, 0], [1, 1, 1.15]),
      part(cyl(0.21, 0.21, 0.01, 32), m, V(HEAD.x, HEAD.y + 0.064, HEAD.z - 0.01), [0, 0, 0], [0.9, 1, 1.05]),
      part(ring(0.19, 0.018), m, V(HEAD.x, HEAD.y + 0.08, HEAD.z - 0.01), [Math.PI / 2, 0, 0], [0.9, 1.05, 1]),
      part(cyl(0.1, 0.1, 0.018), mat('#2a1a10'), V(HEAD.x, HEAD.y + 0.078, HEAD.z - 0.01), [0, 0, 0], [1, 1, 1.15]),
    ];
  },
  // bonnet du père Noël
  santa: () => [
    part(cyl(0.01, 0.112, 0.22), mat('#c8261e', { roughness: 0.85 }), V(HEAD.x, HEAD.y + 0.16, HEAD.z - 0.04), [-0.45, 0, 0]),
    part(ring(0.108, 0.026), mat('#ffffff', { roughness: 1 }), V(HEAD.x, HEAD.y + 0.06, HEAD.z - 0.01), [Math.PI / 2 - 0.1, 0, 0]),
    part(ball(0.035), mat('#ffffff', { roughness: 1 }), V(HEAD.x, HEAD.y + 0.235, HEAD.z - 0.13)),
  ],
  // bandana de pirate + bandeau sur l'œil
  pirate: (o) => [
    part(shell(0.114, 1.45), mat(o.color || '#b3131b', { roughness: 0.8 }), V(HEAD.x, HEAD.y + 0.012, HEAD.z - 0.012), [-0.12, 0, 0], [1, 1, 1.05]),
    part(ball(0.03), mat(o.color || '#b3131b', { roughness: 0.8 }), V(HEAD.x, HEAD.y + 0.02, HEAD.z - 0.12)),
    part(cyl(0.021, 0.021, 0.006, 16), mat('#111111'), V(HEAD.x - 0.034, HEAD.y + 0.004, HEAD.z + 0.104), [Math.PI / 2, 0, 0]),
    part(ring(0.11, 0.003), mat('#111111'), V(HEAD.x, HEAD.y + 0.02, HEAD.z), [Math.PI / 2 + 0.25, 0, 0]),
  ],
  // casque de cosmonaute (bulle et visière dorée)
  space: () => [
    part(ball(0.19), mat('#ffffff', { roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.22, depthWrite: false }), V(HEAD.x, HEAD.y + 0.01, HEAD.z - 0.005)),
    part(geo('spvis', () => new THREE.SphereGeometry(0.192, 24, 10, Math.PI / 2 - 1.1, 2.2, 0.55, 0.9)), mat('#d4a52a', { roughness: 0.1, metalness: 1, transparent: true, opacity: 0.75 }), V(HEAD.x, HEAD.y + 0.01, HEAD.z - 0.005)),
    part(ring(0.13, 0.03), mat('#c0c6cc', { roughness: 0.3, metalness: 0.7 }), V(NECK.x, NECK.y - 0.01, NECK.z), [Math.PI / 2, 0, 0]),
  ],
  // casque de pompier
  fire: (o) => [
    part(shell(0.135, 1.6), mat(o.color || '#c8261e', { roughness: 0.3 }), V(HEAD.x, HEAD.y + 0.02, HEAD.z - 0.01), [0, 0, 0], [1, 1.05, 1.1]),
    part(cyl(0.17, 0.17, 0.01, 32), mat(o.color || '#c8261e', { roughness: 0.3 }), V(HEAD.x, HEAD.y + 0.0, HEAD.z - 0.03), [0.12, 0, 0], [0.85, 1, 1.15]),
    part(box(0.05, 0.06, 0.01), mat('#d4af37', { metalness: 0.9, roughness: 0.3 }), V(HEAD.x, HEAD.y + 0.09, HEAD.z + 0.125), [-0.4, 0, 0]),
  ],
  // écharpe autour du cou, avec un pan qui pend
  scarf: (o) => {
    const m = mat(o.color || '#f4f1ea', { roughness: 0.9 });
    return [
      part(ring(0.07, 0.026), m, V(NECK.x, NECK.y, NECK.z), [Math.PI / 2 - 0.15, 0, 0], [1.05, 1, 1]),
      part(box(0.05, 0.2, 0.018), m, V(NECK.x + 0.045, NECK.y - 0.11, NECK.z + 0.085), [0.15, 0, 0.12]),
    ];
  },
};
// os auquel s'attache chaque accessoire
const BONE = { scarf: 'Neck', space: 'Head' };

// applique une tenue (idempotent : une tenue précédente est retirée)
export function dressPilot(root, suit) {
  const o = OUTFITS[suit] || OUTFITS.commandant;
  const bones = {};
  let skel = null;
  root.traverse((x) => {
    if (x.isBone) bones[x.name.replace(/^mixamorig:?/, '')] = x;
    if (x.isSkinnedMesh && !skel) skel = x.skeleton;
  });
  // accessoires de la tenue précédente
  for (const b of Object.values(bones)) for (const c of [...b.children]) if (c.userData.outfit) b.remove(c);
  root.traverse((x) => {
    if (!x.isMesh || x.userData.outfit) return;
    const name = (x.userData.baseMat ??= x.material).name;
    x.material = x.userData.baseMat;
    x.visible = !(o.hide || []).includes(name);
    const spec = o.cloth?.[name];
    if (spec) x.material = clothMat(x.userData.baseMat, spec);
  });
  if (!skel) return root;
  for (const [kind, opts] of Object.entries(o.acc || {})) {
    const bone = bones[BONE[kind] || 'Head'];
    const i = skel.bones.indexOf(bone);
    if (!bone || i < 0 || !BUILD[kind]) continue;
    // repère de l'os au repos (inverse de la matrice de liaison) : l'accessoire suit l'os dans toutes les poses
    const g = new THREE.Group();
    g.userData.outfit = true;
    g.matrixAutoUpdate = false;
    g.matrix.copy(skel.boneInverses[i]);
    for (const p of BUILD[kind](opts || {})) g.add(p);
    bone.add(g);
  }
  return root;
}
