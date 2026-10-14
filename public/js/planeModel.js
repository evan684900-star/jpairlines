// Modèle 3D détaillé de l'avion de base (type Cessna à aile haute), nez vers -Z.
import * as THREE from 'three';

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

// stations du fuselage : [z, demi-largeur, demi-hauteur, centre y]
const FUSE = [
  [-3.72, 0.3, 0.3, -0.02], [-3.55, 0.47, 0.45, 0.0], [-3.1, 0.55, 0.55, 0.04], [-2.4, 0.58, 0.66, 0.12],
  [-1.6, 0.59, 0.74, 0.2], [-0.6, 0.59, 0.74, 0.2], [0.4, 0.55, 0.66, 0.18], [1.4, 0.42, 0.5, 0.18],
  [2.6, 0.26, 0.36, 0.24], [3.7, 0.14, 0.26, 0.32], [4.15, 0.07, 0.19, 0.36],
];

// opts.detail : intérieur, pilote, halos et phare (avion du joueur et des autres pilotes)
export function createPlaneMesh(color = 0xf4f5f7, accent = 0xc62f2a, opts = {}) {
  const detail = opts.detail ?? true;
  const g = new THREE.Group();
  // peinture vernie (vernis = clearcoat), métal brossé, caoutchouc, plexiglas
  const paintProps = { vertexColors: true, roughness: 0.34, metalness: 0.04, clearcoat: 0.9, clearcoatRoughness: 0.1 };
  const paint = new THREE.MeshPhysicalMaterial({ ...paintProps, side: THREE.DoubleSide });
  const paintOut = new THREE.MeshPhysicalMaterial({ ...paintProps, side: THREE.BackSide }); // fuselage vu de l'extérieur
  const bodyMat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.34, metalness: 0.04, clearcoat: 0.9, clearcoatRoughness: 0.1 });
  const accentMat = new THREE.MeshPhysicalMaterial({ color: accent, roughness: 0.36, metalness: 0.04, clearcoat: 0.9, clearcoatRoughness: 0.12 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1d21, roughness: 0.55, metalness: 0.2 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xc4cad1, roughness: 0.22, metalness: 1 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xe8ebee, roughness: 0.08, metalness: 1 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.92 });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x2a3a48, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.2, side: THREE.DoubleSide,
    depthWrite: false, clearcoat: 0.4, clearcoatRoughness: 0.05, envMapIntensity: 0.7,
  });
  const cabin = new THREE.MeshStandardMaterial({ color: 0x3b3f45, roughness: 0.85, metalness: 0 });
  const BODY = new THREE.Color(color), ACC = new THREE.Color(accent), ACC2 = new THREE.Color(0x1d3f7a);
  const FRAME = new THREE.Color(0x2a2f36);

  // ----- fuselage -----
  const M = 24, P = 2.6;
  const rings = interpKeys(FUSE, 0.1).map(([z, w, h, yc]) => {
    const r = [];
    for (let j = 0; j < M; j++) {
      const a = (j / M) * Math.PI * 2;
      const cx = Math.cos(a), cy = Math.sin(a);
      r.push(new THREE.Vector3(w * Math.sign(cx) * Math.abs(cx) ** (2 / P), yc + h * Math.sign(cy) * Math.abs(cy) ** (2 / P), z));
    }
    return r;
  });
  const keysZ = interpKeys(FUSE, 0.1);
  const isGlass = (i, j, p) => {
    const [z, , h, yc] = keysZ[Math.min(i, keysZ.length - 1)];
    const ny = (p.y - yc) / h;
    const windshield = z > -2.38 && z < -1.72 && ny > 0.28 && ny < 0.93;
    const side = z > -1.72 && z < 0.45 && ny > 0.24 && ny < 0.74 && Math.abs(z + 0.65) > 0.06 && Math.abs(p.x) > 0.25;
    const post = Math.abs(z + 1.72) < 0.04 && ny > 0.28;
    return (windshield || side) && !post;
  };
  const fuseGeo = loft(rings, (c, i, j, p) => {
    const [z, , h, yc] = keysZ[Math.min(i, keysZ.length - 1)];
    const ny = (p.y - yc) / h;
    if (isGlass(i, j, p)) c.copy(FRAME);
    else if (ny > -0.18 && ny < -0.04 && z > -3.2) c.copy(ACC);
    else if (ny > -0.3 && ny < -0.22 && z > -3.2) c.copy(ACC2);
    else c.copy(BODY);
  }, true, isGlass);
  const fuse = new THREE.Mesh(fuseGeo, [paintOut, glassMat]);
  g.add(fuse);
  // habitacle : parois intérieures (même géométrie vue de l'intérieur, sans les vitres)
  const shell = new THREE.Mesh(fuseGeo, [cabin, new THREE.MeshBasicMaterial({ visible: false })]);
  g.add(shell);

  // ----- aile haute -----
  const wingY = 0.99, LE = -1.95;
  const chordAt = (x) => { const s = Math.abs(x); return s < 2.9 ? 1.6 : lerp(1.6, 1.15, (s - 2.9) / 2.6); };
  const wingRing = (x, from, to, thick) => {
    const c = chordAt(x);
    const le = LE + (1.6 - c) * 0.25;
    return airfoil(10, thick, from, to).map(([t, y]) => new THREE.Vector3(x, wingY + Math.abs(x) * 0.03 + y * c, le + t * c));
  };
  const wingXs = [-5.5, -5.2, -4.2, -2.9, -1.5, 0, 1.5, 2.9, 4.2, 5.2, 5.5];
  const wing = new THREE.Mesh(loft(wingXs.map((x) => wingRing(x, 0, 0.74, Math.abs(x) > 5.3 ? 0.07 : 0.13)),
    (c, i, j, p) => c.copy(Math.abs(p.x) > 4.6 ? ACC : BODY)), paint);
  g.add(wing);

  // gouvernes : pièces mobiles avec charnière au bord avant
  const surface = (x0, x1, chordFrac, mat) => {
    const xm = (x0 + x1) / 2, c = chordAt(xm), le = LE + (1.6 - c) * 0.25;
    const pivot = new THREE.Group();
    pivot.position.set(xm, wingY + Math.abs(xm) * 0.03, le + 0.74 * c);
    const piece = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(x1 - x0) - 0.04, 0.05, c * chordFrac), mat);
    piece.position.z = (c * chordFrac) / 2;
    pivot.add(piece);
    g.add(pivot);
    return pivot;
  };
  const flapL = surface(-2.9, -0.62, 0.25, bodyMat), flapR = surface(0.62, 2.9, 0.25, bodyMat);
  const ailL = surface(-5.2, -2.95, 0.25, bodyMat), ailR = surface(2.95, 5.2, 0.25, bodyMat);

  // haubans
  const strut = (x) => {
    const a = new THREE.Vector3(0.52 * Math.sign(x), -0.32, -1.1), b = new THREE.Vector3(x, wingY + Math.abs(x) * 0.03 - 0.05, -1.2);
    const len = a.distanceTo(b);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, len, 8).scale(1, 1, 2.2), metal);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    g.add(m);
  };
  strut(-2.7); strut(2.7);

  // ----- empennage -----
  const stabRing = (x) => {
    const s = Math.abs(x), c = lerp(0.85, 0.5, s / 1.8), le = 3.25 + s * 0.12;
    return airfoil(8, 0.09, 0, 0.62).map(([t, y]) => new THREE.Vector3(x, 0.4 + y * c, le + t * c));
  };
  g.add(new THREE.Mesh(loft([-1.8, -0.9, 0, 0.9, 1.8].map(stabRing), (c) => c.copy(BODY)), paint));
  const elevator = new THREE.Group();
  elevator.position.set(0, 0.4, 3.25 + 0.62 * 0.85);
  const elevMesh = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.04, 0.32), accentMat);
  elevMesh.position.z = 0.16;
  elevator.add(elevMesh);
  g.add(elevator);

  const finRing = (y) => {
    const t = (y - 0.45) / 1.35, c = lerp(1.25, 0.42, t), le = lerp(2.75, 3.75, t);
    return airfoil(8, 0.1, 0, 0.7).map(([u, w]) => new THREE.Vector3(w * c, y, le + u * c));
  };
  g.add(new THREE.Mesh(loft([0.45, 0.9, 1.35, 1.8].map(finRing), (c, i, j, p) => c.copy(p.y > 1.15 ? ACC : BODY)), paint));
  const rudder = new THREE.Group();
  rudder.position.set(0, 1.12, 3.95);
  const rudMesh = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.3, 0.3), accentMat);
  rudMesh.position.z = 0.15;
  rudder.add(rudMesh);
  g.add(rudder);

  // ----- moteur & hélice -----
  const spinnerProfile = [[0.2, 0], [0.19, 0.08], [0.15, 0.2], [0.08, 0.31], [0, 0.37]].map(([r, y]) => new THREE.Vector2(r, y));
  const spinner = new THREE.Mesh(new THREE.LatheGeometry(spinnerProfile, 18).rotateX(-Math.PI / 2), accentMat);
  spinner.position.z = -3.72;
  g.add(spinner);
  const prop = new THREE.Group();
  prop.position.z = -3.8;
  for (let k = 0; k < 2; k++) {
    const bg = new THREE.BoxGeometry(0.13, 0.95, 0.025, 1, 6, 1).translate(0, 0.52, 0);
    const pa = bg.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const y = pa.getY(i), tw = 0.6 - y * 0.45;
      const x = pa.getX(i) * (1 - y * 0.35), z = pa.getZ(i);
      pa.setXYZ(i, x * Math.cos(tw) - z * Math.sin(tw), y, x * Math.sin(tw) + z * Math.cos(tw));
    }
    bg.computeVertexNormals();
    const blade = new THREE.Mesh(bg, dark);
    blade.rotation.z = k * Math.PI;
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.09, 0.03), new THREE.MeshStandardMaterial({ color: 0xf2c21b, roughness: 0.5 }));
    tip.position.y = 1.0;
    tip.rotation.y = 0.15;
    blade.add(tip);
    prop.add(blade);
  }
  g.add(prop);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.05, 32), new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  disc.position.z = -3.82;
  g.add(disc);
  for (const x of [-0.25, 0.25]) {
    const intake = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.1), dark);
    intake.position.set(x, -0.18, -3.52);
    g.add(intake);
  }
  const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.25, 8).rotateX(Math.PI / 2), chrome);
  exhaust.position.set(0.22, -0.48, -2.9);
  g.add(exhaust);
  const antenna = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.35, 0.08), dark);
  antenna.position.set(0, 1.12, -0.2);
  g.add(antenna);

  // ----- train d'atterrissage rentrant -----
  const legs = [];
  const wheel = (parent, x, y, z, fairing) => {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.16, 18).rotateZ(Math.PI / 2), rubber);
    w.position.set(x, y, z);
    parent.add(w);
    if (fairing) {
      const f = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10).scale(0.13, 0.27, 0.55), bodyMat);
      f.position.set(x, y + 0.04, z + 0.05);
      parent.add(f);
    }
  };
  for (const s of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(0.42 * s, -0.48, -0.75);
    const a = new THREE.Vector3(0, 0, 0), b = new THREE.Vector3(0.78 * s, -0.77, 0);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.05, a.distanceTo(b), 0.1), metal);
    bar.position.copy(b).multiplyScalar(0.5);
    bar.rotation.z = Math.atan2(b.x, -b.y);
    leg.add(bar);
    wheel(leg, b.x, b.y, 0, true);
    g.add(leg);
    legs.push(leg);
  }
  const nose = new THREE.Group();
  nose.position.set(0, -0.45, -3.0);
  const strutN = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.8, 8), metal);
  strutN.position.y = -0.4;
  nose.add(strutN);
  wheel(nose, 0, -0.8, 0, true);
  g.add(nose);
  legs.push(nose);

  // ----- habitacle : planche de bord, sièges, manches, pilote -----
  const interior = new THREE.Group();
  const panelMat = new THREE.MeshStandardMaterial({ map: defaultPanelTexture(), roughness: 0.6, emissive: 0xffffff, emissiveIntensity: 0, emissiveMap: null });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.08, 0.4), panelMat);
  panel.position.set(0, 0.22, -1.9);
  panel.rotation.x = -0.18;
  interior.add(panel);
  const glare = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.05, 0.3), cabin);
  glare.position.set(0, 0.43, -2.0);
  interior.add(glare);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.04, 2.6), new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.95 }));
  floor.position.set(0, -0.42, -0.7);
  interior.add(floor);
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x5a4a3c, roughness: 0.8 });
  for (const [x, z] of [[-0.27, -0.95], [0.27, -0.95], [-0.27, 0.15], [0.27, 0.15]]) {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.45), seatMat);
    seat.position.set(x, -0.12, z);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.62, 0.09), seatMat);
    back.position.set(x, 0.2, z + 0.25);
    back.rotation.x = 0.12;
    interior.add(seat, back);
  }
  const yokes = [];
  for (const x of [-0.27, 0.27]) {
    const yoke = new THREE.Group();
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.32, 8).rotateX(Math.PI / 2), dark);
    col.position.z = 0.16;
    const wheelY = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.016, 6, 20, Math.PI), dark);
    wheelY.position.z = 0.32;
    wheelY.rotation.z = Math.PI;
    yoke.add(col, wheelY);
    yoke.position.set(x, 0.12, -1.86);
    interior.add(yoke);
    yokes.push(yoke);
  }
  g.add(interior);
  let pilot = null;
  if (detail) {
    pilot = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.3, 4, 10), new THREE.MeshStandardMaterial({ color: 0x2f4a6b, roughness: 0.8 }));
    torso.position.set(-0.27, 0.22, -0.88);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), new THREE.MeshStandardMaterial({ color: 0xd9a77e, roughness: 0.7 }));
    head.position.set(-0.27, 0.6, -0.92);
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
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(c).multiplyScalar(1.4), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      sp.scale.setScalar(halo);
      m.add(sp);
    }
    g.add(m);
    return m;
  };
  const lights = [light(0xff1a1a, -5.52, 1.16, -1.5), light(0x18ff50, 5.52, 1.16, -1.5), light(0xffffff, 0, 1.0, 4.2)];
  const strobe = light(0xffffff, 0, 1.82, 3.95, 0.09, 1.6);
  const landing = light(0xfff3cf, -1.6, 0.98, -1.97, 0.1, 1.0);
  for (const l of [...lights, strobe, landing]) l.visible = false;
  let landingLight = null;
  if (opts.landingLight) {
    // phare d'atterrissage : vraie lumière qui éclaire la piste la nuit
    landingLight = new THREE.SpotLight(0xfff1d6, 0, 1200, 0.3, 0.55, 1.1);
    landingLight.position.set(-1.6, 0.9, -2.0);
    landingLight.target.position.set(-1.6, -6, -60);
    g.add(landingLight, landingLight.target);
  }

  g.traverse((o) => { if (o.isMesh && !(o.material instanceof THREE.MeshBasicMaterial) && !Array.isArray(o.material)) { o.castShadow = true; o.receiveShadow = true; } });
  fuse.castShadow = true;
  g.userData = {
    prop, disc, flapL, flapR, ailL, ailR, elevator, rudder, legs, lights, strobe, landing, landingLight,
    fuse, interior, pilot, panel, yokes,
    // points utiles aux effets et à la caméra (repère de l'avion)
    eye: new THREE.Vector3(-0.27, 0.62, -1.02),
    exhaust: new THREE.Vector3(0.22, -0.5, -2.78),
    wingtips: [new THREE.Vector3(-5.5, 1.15, -1.0), new THREE.Vector3(5.5, 1.15, -1.0)],
    wheels: [new THREE.Vector3(-1.2, -1.55, -0.75), new THREE.Vector3(1.2, -1.55, -0.75), new THREE.Vector3(0, -1.55, -3.0)],
  };
  return g;
}

// Vue cockpit : on cache la carrosserie qui gênerait (fuselage extérieur, pilote) et on garde l'intérieur
export function setCockpitView(mesh, inside) {
  const u = mesh.userData;
  u.fuse.visible = !inside;
  if (u.pilot) u.pilot.visible = !inside;
}

// Anime les pièces mobiles à partir de l'état (joueur local ou distant)
export function animatePlaneMesh(mesh, st, dt, time) {
  const u = mesh.userData;
  const rpm = st.rpm || 0;
  u.prop.rotation.z += dt * (rpm > 0.05 ? 8 + rpm * 70 : 0);
  u.prop.visible = rpm < 0.45;
  u.disc.material.opacity = rpm > 0.3 ? Math.min(0.35, (rpm - 0.3) * 1.5) : 0;
  u.flapL.rotation.x = u.flapR.rotation.x = (st.flapPos || 0) * 0.17;
  u.ailL.rotation.x = (st.roll || 0) * 0.3;
  u.ailR.rotation.x = -(st.roll || 0) * 0.3;
  u.elevator.rotation.x = -(st.pitch || 0) * 0.35;
  u.rudder.rotation.y = (st.yaw || 0) * 0.35;
  const gp = st.gearPos ?? 1;
  for (const leg of u.legs) {
    leg.rotation.x = -(1 - gp) * Math.PI / 2;
    leg.visible = gp > 0.03;
  }
  for (const y of u.yokes) { y.rotation.z = -(st.roll || 0) * 0.5; y.position.z = -1.86 + (st.pitch || 0) * 0.06; }
  const on = !!st.lights;
  for (const l of u.lights) l.visible = on;
  u.strobe.visible = on && time % 1.2 < 0.08;
  u.landing.visible = on;
  if (u.landingLight) u.landingLight.intensity = on ? 4000 * (st.night ?? 1) : 0;
}
