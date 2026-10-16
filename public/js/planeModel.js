// Modèles 3D des avions, construits à partir de leur description (aircraft.js) : nez vers -Z.
import * as THREE from 'three';
import { aircraftById } from './aircraft.js';
import { cleanLivery } from './livery.js';

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
  }[LV.finish];
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
    depthWrite: false, clearcoat: 0.4, clearcoatRoughness: 0.05, envMapIntensity: 0.7,
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
  // motif de peinture du fuselage (z : du nez, négatif, vers la queue ; ny : hauteur relative, -1 en bas, 1 en haut)
  const zNose = MD.fuse[0][0], zTail = MD.fuse[MD.fuse.length - 1][0], len = zTail - zNose;
  const paintFuse = (c, z, ny, p) => {
    const u = (z - zNose) / len; // 0 au nez, 1 à la queue
    const ang = Math.atan2(p.y, p.x);
    c.copy(BODY);
    switch (LV.pattern) {
      case 'origine': for (const [a, b, k, zMin] of MD.stripes || []) if (ny > a && ny < b && z > zMin) c.copy(pick(k)); break;
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
      default: break;
    }
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
  g.add(fuse);
  // habitacle : parois intérieures (même géométrie vue de l'intérieur, sans les vitres)
  const shell = new THREE.Mesh(fuseGeo, isGlass ? [cabin, hidden] : cabin);
  g.add(shell);
  // verrière en bulle (avion de voltige)
  if (MD.canopy) {
    const cp = MD.canopy;
    const bubble = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(cp.w, cp.h, (cp.z1 - cp.z0) / 2), glassMat);
    bubble.position.set(0, cp.y, (cp.z0 + cp.z1) / 2);
    bubble.renderOrder = 2;
    g.add(bubble);
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
  const paintWing = (c, p) => {
    const s = Math.abs(p.x);
    switch (LV.wings) {
      case 'uni': c.copy(BODY); break;
      case 'bouts': c.copy(s > W.half * 0.72 ? ACC : s > W.half * 0.68 ? ACC2 : BODY); break;
      case 'damier': c.copy(s > W.half * 0.6 && (Math.floor(s / 0.35) + Math.floor((p.z - W.le) / 0.35)) % 2 ? ACC : s > W.half * 0.6 ? WHITE : BODY); break;
      case 'bandes': { const k = Math.floor((s - W.half * 0.3) / 0.28); c.copy(s > W.half * 0.3 && k < 5 ? (k % 2 ? BLACK : WHITE) : BODY); break; }
      default: c.copy(s > W.accentFrom ? ACC : BODY);
    }
  };
  const wing = new THREE.Mesh(loft(wingXs.map((x) => wingRing(x, Math.abs(x) > W.half - 0.2 ? W.tipThick : W.thick)),
    (c, i, j, p) => paintWing(c, p)), paint);
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
  const flapL = W.flaps ? surface(-W.flaps[1], -W.flaps[0], 0.25, bodyMat) : null;
  const flapR = W.flaps ? surface(W.flaps[0], W.flaps[1], 0.25, bodyMat) : null;
  const ailL = surface(-W.ail[1], -W.ail[0], 0.25, bodyMat), ailR = surface(W.ail[0], W.ail[1], 0.25, bodyMat);

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
  g.add(new THREE.Mesh(loft([-1, -0.5, 0, 0.5, 1].map((k) => stabRing(k * T.half)), (c) => c.copy(BODY)), paint));
  const elevator = new THREE.Group();
  elevator.position.set(0, T.y, T.le + 0.62 * T.root);
  const elevMesh = new THREE.Mesh(new THREE.BoxGeometry(T.half * 2 - 0.2, 0.04, T.root * 0.376), accentMat);
  elevMesh.position.z = T.root * 0.188;
  elevator.add(elevMesh);
  g.add(elevator);

  const F = MD.fin;
  const finRing = (y) => {
    const t = (y - F.y0) / (F.y1 - F.y0), c = lerp(F.root, F.tip, t), le = lerp(F.le0, F.le1, t);
    return airfoil(8, 0.1, 0, 0.7).map(([u, w]) => new THREE.Vector3(w * c, y, le + u * c));
  };
  g.add(new THREE.Mesh(loft([0, 1 / 3, 2 / 3, 1].map((k) => finRing(lerp(F.y0, F.y1, k))), (c, i, j, p) => c.copy(p.y > F.accentFrom ? ACC : BODY)), paint));
  const rudder = new THREE.Group();
  rudder.position.set(0, (F.y0 + F.y1) / 2, (F.le0 + 0.7 * F.root + F.le1 + 0.7 * F.tip) / 2 + 0.12);
  const rudMesh = new THREE.Mesh(new THREE.BoxGeometry(0.04, (F.y1 - F.y0) * 0.963, F.root * 0.24), accentMat);
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
      const nac = new THREE.Mesh(loft(interpKeys(keys, 0.15).map(([z, w, h, yc]) => superRing(z, w, h, pc.y + yc, 18, 2.4, pc.x)), (c, i, j, p) => c.copy(p.y - pc.y > R * 0.55 ? ACC : BODY)), paintOut);
      g.add(nac);
    }
    const spinnerProfile = [[0.2, 0], [0.19, 0.08], [0.15, 0.2], [0.08, 0.31], [0, 0.37]].map(([a, b]) => new THREE.Vector2(a * sp, b * sp));
    const spinner = new THREE.Mesh(new THREE.LatheGeometry(spinnerProfile, 18).rotateX(-Math.PI / 2), accentMat);
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
    const pod = new THREE.Mesh(loft(interpKeys(keys, 0.12).map(([z, w, h, yc]) => superRing(z, w, h, jc.y + yc, 22, 2, jc.x)), (c, i, j, p) => c.copy(i < 2 ? LIP : p.y - jc.y > R * 0.6 ? ACC : BODY), false), paintOut);
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
  const wheel = (parent, x, y, z, fairing) => {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(wr, wr, wr * 0.55, 18).rotateZ(Math.PI / 2), rubber);
    w.position.set(x, y, z);
    parent.add(w);
    const hubcap = new THREE.Mesh(new THREE.CylinderGeometry(wr * 0.45, wr * 0.45, wr * 0.58, 12).rotateZ(Math.PI / 2), metal);
    hubcap.position.copy(w.position);
    parent.add(hubcap);
    if (fairing) {
      const f = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10).scale(wr * 0.43, wr * 0.9, wr * 1.83), bodyMat);
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
      g.add(new THREE.Mesh(floatGeo, paintOut));
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
  if (detail) {
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
  const decals = [];
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

  g.traverse((o) => { if (o.isMesh && !(o.material instanceof THREE.MeshBasicMaterial) && !Array.isArray(o.material)) { o.castShadow = true; o.receiveShadow = true; } });
  fuse.castShadow = true;
  const ex = MD.exhaust;
  g.userData = {
    type: def.id, props, fans, flapL, flapR, ailL, ailR, elevator, rudder, legs, lights, strobe, landing, landingLight,
    fuse, interior, pilot, panel, yokes, decals,
    // points utiles aux effets et à la caméra (repère de l'avion)
    eye: new THREE.Vector3(sx, CB.seatY + 0.83, sz - 0.1),
    exhaust: new THREE.Vector3(ex[0], ex[1] - 0.02, ex[2] + 0.12),
    wingtips: [new THREE.Vector3(-W.half, yAt(W.half), MD.tipFxZ), new THREE.Vector3(W.half, yAt(W.half), MD.tipFxZ)],
    wheels: def.geo.wheels.filter((w) => w.brake).map((w) => w.p.clone()).concat(def.geo.wheels.filter((w) => w.nose).map((w) => w.p.clone())),
  };
  return g;
}

// Textures des décalcomanies (dessinées sur un canvas)
const decalCache = new Map();
function decalTexture(kind, value, LV, BODY) {
  const lum = BODY.r * 0.3 + BODY.g * 0.59 + BODY.b * 0.11;
  const ink = lum > 0.5 ? '#16181c' : '#f4f4f0';
  const key = `${kind}|${value}|${LV.emblemColor}|${LV.number}|${ink}`;
  if (decalCache.has(key)) return decalCache.get(key);
  const c = document.createElement('canvas');
  c.width = kind === 'reg' ? 512 : 256;
  c.height = kind === 'reg' ? 128 : 256;
  const x = c.getContext('2d');
  if (kind === 'reg') {
    x.fillStyle = ink;
    x.font = 'bold 92px "Arial Narrow", Arial, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(value, 256, 68, 500);
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

// Vue cockpit : on cache la carrosserie qui gênerait (fuselage extérieur, pilote) et on garde l'intérieur
export function setCockpitView(mesh, inside) {
  const u = mesh.userData;
  u.fuse.visible = !inside;
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
