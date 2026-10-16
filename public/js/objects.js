import * as THREE from 'three';
import {
  WORLD, AIRPORTS, LANDMARKS, CITIES, TOWNS, SHIPS, BALLOONS, WIND_FARMS, VOLCANO,
  terrainHeight, groundHeight, rng, shipPosition, balloonPosition, turbinePositions,
} from './world.js';
import { createPlaneMesh } from './plane.js';
import { AIRCRAFT, aircraftById } from './aircraft.js';
import { mergeColored } from './decor.js';
import { createBuildingMaterial } from './render/materials.js';
import { createCityMaterial, parapetGeometry } from './render/buildings.js';
import { TEX, glowPoints } from './render/textures.js';

const lambert = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...extra });

// ---------- Étiquettes (visibles seulement à portée) ----------
export const labels = [];
export function makeLabel(text, { color = '#fff', size = 0.03, depthTest = true } = {}) {
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d');
  const font = '600 38px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 24;
  cv.width = w; cv.height = 56;
  ctx.font = font;
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.85)';
  ctx.shadowBlur = 6;
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.strokeText(text, 12, 30);
  ctx.fillStyle = color;
  ctx.fillText(text, 12, 30);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, sizeAttenuation: false, depthTest, fog: false, toneMapped: false }));
  sp.scale.set((size * w) / 56, size, 1);
  sp.renderOrder = 10;
  return sp;
}
function addLabel(scene, text, x, y, z, range, opts) {
  const sp = makeLabel(text, opts);
  sp.position.set(x, y, z);
  scene.add(sp);
  labels.push({ sp, range });
  return sp;
}
export function updateLabels(cam) {
  for (const l of labels) l.sp.visible = cam.distanceTo(l.sp.position) < l.range;
}

// ---------- Aéroports ----------
function runwayTexture(a) {
  const W = 128, H = 2048;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const r = rng(Math.round(a.x + a.z));
  if (a.surface === 'grass') {
    for (let i = 0; i < 16; i++) { ctx.fillStyle = i % 2 ? '#5f7a3a' : '#6b8743'; ctx.fillRect(0, (i * H) / 16, W, H / 16); }
    for (let i = 0; i < 9000; i++) { ctx.fillStyle = `rgba(${40 + r() * 60},${70 + r() * 60},${20 + r() * 30},0.5)`; ctx.fillRect(r() * W, r() * H, 2, 3 + r() * 4); }
    for (let i = 0; i < 40; i++) { ctx.fillStyle = 'rgba(110,90,60,0.25)'; ctx.fillRect(W * 0.3 + r() * W * 0.4, r() * H, 6, 60); }
    ctx.fillStyle = '#f2f2f2';
    for (let y = 20; y < H; y += 160) { ctx.fillRect(1, y, 5, 26); ctx.fillRect(W - 6, y, 5, 26); }
  } else {
    ctx.fillStyle = '#3c3e42';
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 26000; i++) { const v = 45 + r() * 40; ctx.fillStyle = `rgba(${v},${v},${v + 3},0.5)`; ctx.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 2); }
    // traces de pneus dans les zones de toucher
    for (const end of [0, 1]) {
      for (let i = 0; i < 140; i++) {
        const y = end ? H - 140 - r() * 420 : 140 + r() * 420;
        ctx.fillStyle = 'rgba(20,20,22,0.18)';
        ctx.fillRect(W / 2 - 22 + (r() - 0.5) * 18, y, 7, 30 + r() * 80);
        ctx.fillRect(W / 2 + 15 + (r() - 0.5) * 18, y, 7, 30 + r() * 80);
      }
    }
    // marquages dessinés en mètres (repère : x = travers, y = longueur depuis le bout « haut »)
    ctx.save();
    ctx.scale(W / a.width, H / a.length);
    const L = a.length, Wd = a.width;
    ctx.fillStyle = '#e9e9e6';
    ctx.fillRect(0.8, 0, 0.9, L); ctx.fillRect(Wd - 1.7, 0, 0.9, L); // bords
    for (let y = 120; y < L - 120; y += 50) ctx.fillRect(Wd / 2 - 0.45, y, 0.9, 30); // axe
    const bars = Wd >= 60 ? 16 : 12, bw = 1.8, gap = (Wd - 6 - bars * bw) / (bars - 1);
    for (let i = 0; i < bars; i++) { const x = 3 + i * (bw + gap); ctx.fillRect(x, 6, bw, 30); ctx.fillRect(x, L - 36, bw, 30); } // seuils
    for (const y of [300, L - 345]) { ctx.fillRect(Wd / 2 - 9, y, 4, 45); ctx.fillRect(Wd / 2 + 5, y, 4, 45); } // point de visée
    for (const y of [150, 450, 600, L - 172, L - 472, L - 622]) {
      for (const x of [Wd / 2 - 9, Wd / 2 - 6.5, Wd / 2 + 4.5, Wd / 2 + 7]) ctx.fillRect(x, y, 1.6, 22);
    }
    // numéros de piste (cap / 10)
    const hdg = (THREE.MathUtils.radToDeg(-a.heading) % 360 + 360) % 360;
    const num = (d) => String(Math.round((((d % 360) + 360) % 360) / 10) || 36).padStart(2, '0');
    ctx.font = 'bold 9px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const digits = (txt, y, flip) => {
      ctx.save(); ctx.translate(Wd / 2, y); if (flip) ctx.rotate(Math.PI); ctx.scale(1, 2.1); ctx.fillText(txt, 0, 0); ctx.restore();
    };
    digits(num(hdg), L - 60, false);
    digits(num(hdg + 180), 60, true);
    ctx.restore();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 16;
  return t;
}

function createAirliner(color) {
  const parts = [
    [new THREE.CylinderGeometry(2.2, 2.2, 34, 10).rotateX(Math.PI / 2), color],
    [new THREE.ConeGeometry(2.2, 5, 10).rotateX(-Math.PI / 2).translate(0, 0, -19.5), color],
    [new THREE.ConeGeometry(2.2, 7, 10).rotateX(Math.PI / 2).translate(0, 0.6, 20.5), color],
    [new THREE.BoxGeometry(34, 0.5, 5).translate(0, -0.8, 1), 0xd8dde3],
    [new THREE.BoxGeometry(12, 0.4, 3).translate(0, 0.8, 21), 0xd8dde3],
    [new THREE.BoxGeometry(0.4, 7, 4).translate(0, 4.2, 21), 0x2a4bd8],
    [new THREE.CylinderGeometry(1, 1, 4, 8).rotateX(Math.PI / 2).translate(7, -2, -1), 0x9aa3ad],
    [new THREE.CylinderGeometry(1, 1, 4, 8).rotateX(Math.PI / 2).translate(-7, -2, -1), 0x9aa3ad],
    [new THREE.BoxGeometry(0.6, 2.6, 0.6).translate(0, -3, -12), 0x222831],
    [new THREE.BoxGeometry(5, 2.6, 0.6).translate(0, -3, 3), 0x222831],
  ];
  const m = new THREE.Mesh(mergeColored(parts), lambert(0xffffff, { vertexColors: true, roughness: 0.35, metalness: 0.3 }));
  m.position.y = 4.3;
  m.castShadow = true;
  const g = new THREE.Group();
  g.add(m);
  return g;
}

const TERMINAL_MAT = createBuildingMaterial({ floor: 4.5, bay: 4, glass: 0.95 });

function buildAirport(scene, a, r, anim) {
  const g = new THREE.Group();
  g.position.set(a.x, a.elev, a.z);
  g.rotation.y = a.heading; // axe local X = travers (u), axe local Z = piste (v)
  const grass = a.surface === 'grass';
  const rwMat = lambert(0xffffff, { map: runwayTexture(a), roughness: grass ? 0.95 : 0.85, polygonOffset: true, polygonOffsetFactor: -4 });
  const rw = new THREE.Mesh(new THREE.PlaneGeometry(a.width, a.length).rotateX(-Math.PI / 2), rwMat);
  rw.position.y = 0.2;
  g.add(rw);

  // parking / taxiway
  const apronMat = lambert(grass ? 0x6d7f4a : 0x6c6e70, { roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 });
  const apronLen = Math.min(a.length * 0.6, 900);
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(110, apronLen).rotateX(-Math.PI / 2), apronMat);
  apron.position.set(a.width / 2 + 70, 0.15, 0);
  g.add(apron);
  for (const v of [-apronLen / 2 + 30, apronLen / 2 - 30]) {
    const tw = new THREE.Mesh(new THREE.PlaneGeometry(30, 20).rotateX(-Math.PI / 2), apronMat);
    tw.position.set(a.width / 2 + 10, 0.16, v);
    g.add(tw);
  }

  const bx = a.width / 2 + 160;
  const hangarMat = lambert(0xa7afb6, { metalness: 0.55, roughness: 0.45 }), roofMat = lambert(0x7d8790, { metalness: 0.6, roughness: 0.4 });
  const white = lambert(0xe6e6e2, { roughness: 0.6 }), glass = lambert(0x24323f, { metalness: 0.7, roughness: 0.08 });
  const nH = a.type === 'international' ? 4 : a.type === 'regional' ? 3 : 1;
  for (let i = 0; i < nH; i++) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(40, 14, 34), hangarMat);
    h.position.set(bx, 7, -apronLen / 2 + 60 + i * 55);
    const rf = new THREE.Mesh(new THREE.CylinderGeometry(17, 17, 40, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), roofMat);
    rf.scale.set(1, 0.35, 1);
    rf.position.set(bx, 14, -apronLen / 2 + 60 + i * 55);
    g.add(h, rf);
  }
  if (a.type === 'international') {
    const term = new THREE.Mesh(new THREE.BoxGeometry(60, 18, 320), TERMINAL_MAT);
    term.position.set(bx + 30, 9, 140);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(70, 2, 330), white);
    roof.position.set(bx + 30, 19, 140);
    g.add(term, roof);
    for (let i = 0; i < 3; i++) {
      const jet = createAirliner([0xffffff, 0xf2f2f4, 0xf4efe6][i]);
      jet.position.set(a.width / 2 + 75, 0, 40 + i * 70);
      jet.rotation.y = Math.PI / 2;
      g.add(jet);
    }
  }
  // tour de contrôle
  const towerH = a.type === 'strip' ? 10 : a.type === 'regional' ? 26 : 45;
  const tw = new THREE.Mesh(new THREE.CylinderGeometry(4, 5, towerH, 8), white);
  tw.position.set(bx - 20, towerH / 2, apronLen / 2 + 20);
  const cab = new THREE.Mesh(new THREE.CylinderGeometry(7, 6, 6, 8), glass);
  cab.position.set(bx - 20, towerH + 3, apronLen / 2 + 20);
  g.add(tw, cab);
  // phare tournant de l'aéroport (vert/blanc) sur la tour, visible la nuit
  const beacon = glowPoints([0, 0, 0], 0xffffff, 14);
  beacon.position.set(bx - 20, towerH + 8, apronLen / 2 + 20);
  g.add(beacon);
  anim.push((dt, t) => { beacon.material.color.setHex(Math.floor(t * 0.8) % 2 ? 0x3dff7a : 0xffffff).multiplyScalar(4); beacon.visible = t % 1.25 < 0.25; });
  // pompe à essence
  const pump = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 6), lambert(0xd83a2e));
  pump.position.set(a.width / 2 + 100, 2, -40);
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 10, 12).rotateZ(Math.PI / 2), white);
  tank.position.set(a.width / 2 + 112, 4, -40);
  g.add(pump, tank);
  // manche à air
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 8), white);
  pole.position.set(-a.width / 2 - 30, 4, -a.length / 2 + 150);
  const sock = new THREE.Mesh(new THREE.ConeGeometry(0.9, 4, 8).rotateZ(Math.PI / 2), lambert(0xff7a1a));
  sock.position.set(-a.width / 2 - 28, 7.5, -a.length / 2 + 150);
  g.add(pole, sock);
  // balisage lumineux : bords de piste (blanc chaud), seuils (vert), halos visibles la nuit
  {
    const lampGeo = new THREE.BoxGeometry(0.8, 0.5, 0.8);
    const n = Math.floor(a.length / 60);
    const lamps = new THREE.InstancedMesh(lampGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff1a8).multiplyScalar(2) }), n * 2);
    const m = new THREE.Matrix4();
    const edge = [], ends = [];
    for (let i = 0; i < n; i++) {
      const v = -a.length / 2 + 30 + i * 60;
      lamps.setMatrixAt(i * 2, m.makeTranslation(a.width / 2 + 3, 0.4, v));
      lamps.setMatrixAt(i * 2 + 1, m.makeTranslation(-a.width / 2 - 3, 0.4, v));
      edge.push(a.width / 2 + 3, 1.6, v, -a.width / 2 - 3, 1.6, v);
    }
    for (const v of [-a.length / 2 - 2, a.length / 2 + 2]) {
      for (let k = 0; k <= 8; k++) ends.push(-a.width / 2 + (k / 8) * a.width, 1.6, v);
    }
    g.add(lamps, glowPoints(edge, 0xffe2a6, 3.2), glowPoints(ends, 0x3dff7a, 3.2));
  }
  // petits avions garés
  const nParked = a.type === 'strip' ? 1 : 3;
  for (let i = 0; i < nParked; i++) {
    // toute la flotte se croise sur les parkings (petits avions seulement sur les pistes en herbe)
    const types = a.type === 'strip' ? ['cub', 'moustique', 'faucon'] : AIRCRAFT.map((x) => x.id);
    const def = aircraftById(types[Math.floor(r() * types.length)]);
    const tint = def.id === 'cub' ? [0xf2d24b, 0x8fd0ff, 0xffffff, 0xff9b8f][Math.floor(r() * 4)] : def.color;
    const p = createPlaneMesh(def.id, { color: tint, accent: def.id === 'cub' ? 0x2a4bd8 : def.accent, detail: false });
    p.position.set(a.width / 2 + 40, def.specs.gear, -apronLen / 2 + 130 + i * 20);
    p.rotation.y = -Math.PI / 2;
    g.add(p);
  }
  g.traverse((o) => { if (o.isMesh && !o.isInstancedMesh) { o.castShadow = true; o.receiveShadow = true; } });
  rw.castShadow = apron.castShadow = false;
  scene.add(g);
  addLabel(scene, a.name, a.x, a.elev + 160, a.z, 30000, { color: '#bfe8ff' });
}

// ---------- Villes ----------
function buildCities(scene) {
  const total = CITIES.reduce((s, c) => s + c.n, 0);
  const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const mesh = new THREE.InstancedMesh(geo, createCityMaterial(), total);
  mesh.castShadow = mesh.receiveShadow = true;
  // toits : acrotère (rebord) et groupes de climatisation
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x8d8e8c, roughness: 0.8 });
  const parapets = new THREE.InstancedMesh(parapetGeometry(), roofMat, total);
  const acGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const acs = new THREE.InstancedMesh(acGeo, new THREE.MeshStandardMaterial({ color: 0xb4b6b8, roughness: 0.5, metalness: 0.4 }), total * 3);
  parapets.castShadow = acs.castShadow = true;
  parapets.receiveShadow = acs.receiveShadow = true;
  const pm = new THREE.Matrix4(), ps = new THREE.Vector3(), pp = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  let nAc = 0;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const palette = [0xc9c2b5, 0xb7a993, 0xd8d2c5, 0x99a4b0, 0xb89a7a, 0xe0ddd6, 0x7f93a8, 0xa9b4bc, 0x8a8580];
  const col = new THREE.Color();
  const r = rng(7);
  let n = 0;
  const lamps = [];
  for (const c of CITIES) {
    const grid = 60;
    const angle = r() * Math.PI;
    for (let i = 0; i < c.n * 3 && n < total; i++) {
      // rues en damier
      const gx = Math.round(((r() - 0.5) * 2 * c.radius) / grid) * grid, gz = Math.round(((r() - 0.5) * 2 * c.radius) / grid) * grid;
      const x = c.x + gx * Math.cos(angle) - gz * Math.sin(angle);
      const z = c.z + gx * Math.sin(angle) + gz * Math.cos(angle);
      const d = Math.hypot(gx, gz) / c.radius;
      if (d > 1 || r() > 1.1 - d) continue;
      const h = terrainHeight(x, z);
      if (h < 3) continue;
      const tall = 8 + r() * c.tall * Math.pow(Math.max(0.05, 1 - d), 2) * (r() < 0.08 ? 2.2 : 1);
      const w = 20 + r() * 25, dpt = 20 + r() * 25, gy = groundHeight(x, z) - 3;
      m.compose(p.set(x, gy, z), q.setFromAxisAngle(up, -angle), s.set(w, tall + 3, dpt));
      mesh.setMatrixAt(n, m);
      parapets.setMatrixAt(n, pm.compose(pp.set(x, gy + tall + 3, z), q, ps.set(w, 1.1, dpt)));
      for (let k = 0, na = 1 + Math.floor(r() * 3); k < na && nAc < total * 3; k++) {
        const ox = (r() - 0.5) * w * 0.6, oz = (r() - 0.5) * dpt * 0.6;
        const ax = x + ox * Math.cos(angle) + oz * Math.sin(angle), az = z - ox * Math.sin(angle) + oz * Math.cos(angle);
        acs.setMatrixAt(nAc++, pm.compose(pp.set(ax, gy + tall + 3, az), q, ps.set(2 + r() * 3, 1.2 + r() * 1.5, 1.5 + r() * 2)));
      }
      mesh.setColorAt(n, col.setHex(palette[Math.floor(r() * palette.length)]));
      n++;
      // lampadaires dans la rue voisine
      const lx = gx + grid / 2, lz = gz + grid / 2;
      const wx = c.x + lx * Math.cos(angle) - lz * Math.sin(angle), wz = c.z + lx * Math.sin(angle) + lz * Math.cos(angle);
      lamps.push(wx, groundHeight(wx, wz) + 7, wz);
    }
    addLabel(scene, c.name, c.x, terrainHeight(c.x, c.z) + 300, c.z, 18000, { color: '#ffffff', size: 0.027 });
  }
  mesh.count = parapets.count = n;
  acs.count = nAc;
  for (const o of [mesh, parapets, acs]) o.computeBoundingSphere();
  scene.add(mesh, parapets, acs, glowPoints(lamps, 0xffb060, 9));
}

// ---------- Points d'intérêt ----------
function buildLandmark(scene, l, anim) {
  const g = new THREE.Group();
  const base = Math.max(0, l.type === 'volcano' ? l.y : groundHeight(l.x, l.z));
  g.position.set(l.x, base, l.z);
  const white = lambert(0xeeeeea, { roughness: 0.6 }), red = lambert(0xb02a22, { roughness: 0.5 }), rock = lambert(0x6f675d, { roughness: 0.95 });
  const stone = lambert(0xa49d90, { roughness: 0.95 }), sand = lambert(0xcdb07a, { roughness: 0.95 });
  const add = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  let labelY = 150;

  switch (l.type) {
    case 'lighthouse': {
      add(new THREE.CylinderGeometry(30, 45, 16, 8), rock, 0, 2);
      for (let i = 0; i < 5; i++) add(new THREE.CylinderGeometry(8 - i * 0.6, 8.6 - i * 0.6, 12, 12), i % 2 ? red : white, 0, 16 + i * 12);
      add(new THREE.SphereGeometry(5, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffee88 }), 0, 77);
      const beam = add(new THREE.ConeGeometry(14, 160, 12, 1, true).rotateZ(Math.PI / 2).translate(80, 0, 0), new THREE.MeshBasicMaterial({ color: 0xfff3b0, transparent: true, opacity: 0.18, depthWrite: false }), 0, 77);
      anim.push((dt) => { beam.rotation.y += dt * 0.8; });
      break;
    }
    case 'tower':
      add(new THREE.CylinderGeometry(1.5, 7, 260, 4), red, 0, 130);
      for (let i = 1; i < 6; i++) add(new THREE.BoxGeometry(11 - i, 2.5, 11 - i), white, 0, i * 45);
      add(new THREE.SphereGeometry(2.5, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2020 }), 0, 262);
      labelY = 300;
      break;
    case 'arch':
      g.position.y = 0;
      add(new THREE.TorusGeometry(120, 30, 8, 20, Math.PI), rock, 0, -10);
      add(new THREE.DodecahedronGeometry(45, 0), rock, 120, 0, 0);
      add(new THREE.DodecahedronGeometry(45, 0), rock, -120, 0, 0);
      break;
    case 'wreck': {
      g.position.y = 0;
      const hull = add(new THREE.BoxGeometry(18, 10, 80), lambert(0x5b3a26), 0, 1);
      hull.rotation.set(0.15, 0.6, 0.35);
      const mast = add(new THREE.CylinderGeometry(0.8, 0.8, 30), lambert(0x3a2a1c), 4, 14, 0);
      mast.rotation.z = 0.5;
      break;
    }
    case 'rig': {
      g.position.y = 0;
      const steel = lambert(0x7f8a94), yellow = lambert(0xf2c230);
      for (const [x, z] of [[-25, -25], [25, -25], [-25, 25], [25, 25]]) add(new THREE.CylinderGeometry(3, 4, 60, 8), steel, x, 10, z);
      add(new THREE.BoxGeometry(80, 8, 80), yellow, 0, 42);
      add(new THREE.BoxGeometry(30, 20, 30), white, -15, 56, -15);
      add(new THREE.CylinderGeometry(1.5, 4, 70, 6), steel, 25, 80, 25);
      add(new THREE.CylinderGeometry(20, 20, 1, 16), lambert(0x33363b), 20, 47, -20); // héliport
      const flame = add(new THREE.ConeGeometry(3, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff8a2a }), 25, 120, 25);
      anim.push((dt, t) => { flame.scale.y = 0.8 + Math.sin(t * 13) * 0.25; });
      labelY = 180;
      break;
    }
    case 'castle':
      add(new THREE.BoxGeometry(70, 22, 70), stone, 0, 11);
      for (const [x, z] of [[-35, -35], [35, -35], [-35, 35], [35, 35]]) {
        add(new THREE.CylinderGeometry(9, 10, 40, 8), stone, x, 20, z);
        add(new THREE.ConeGeometry(11, 16, 8), lambert(0x3d4f7a), x, 48, z);
      }
      add(new THREE.BoxGeometry(24, 50, 24), stone, 0, 25);
      add(new THREE.ConeGeometry(18, 24, 4).rotateY(Math.PI / 4), lambert(0x3d4f7a), 0, 62);
      break;
    case 'pyramids':
      add(new THREE.ConeGeometry(110, 140, 4).rotateY(Math.PI / 4), sand, 0, 65);
      add(new THREE.ConeGeometry(75, 95, 4).rotateY(Math.PI / 4), sand, 220, 42, 120);
      add(new THREE.ConeGeometry(50, 62, 4).rotateY(Math.PI / 4), sand, -180, 26, 160);
      labelY = 220;
      break;
    case 'observatory':
      add(new THREE.CylinderGeometry(22, 24, 18, 16), white, 0, 9);
      add(new THREE.SphereGeometry(22, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), lambert(0xd5dbe2), 0, 18);
      add(new THREE.BoxGeometry(5, 4, 30), lambert(0x222831), 0, 34, -6).rotation.x = 0.6;
      break;
    case 'stadium': {
      const ring = add(new THREE.TorusGeometry(110, 22, 6, 32), lambert(0xd8dde3), 0, 14);
      ring.rotation.x = Math.PI / 2;
      ring.scale.set(1.3, 1, 1);
      add(new THREE.PlaneGeometry(180, 110).rotateX(-Math.PI / 2), lambert(0x3e9a3a), 0, 1);
      labelY = 120;
      break;
    }
    case 'statue':
      add(new THREE.BoxGeometry(40, 30, 40), stone, 0, 15);
      add(new THREE.CylinderGeometry(9, 13, 60, 8), lambert(0x6fa59a, { roughness: 0.5, metalness: 0.6 }), 0, 60);
      add(new THREE.SphereGeometry(9, 8, 6), lambert(0x6fa59a, { roughness: 0.5, metalness: 0.6 }), 0, 100);
      add(new THREE.BoxGeometry(5, 40, 5), lambert(0x6fa59a), 14, 95).rotation.z = -0.3;
      add(new THREE.ConeGeometry(6, 12, 6), new THREE.MeshBasicMaterial({ color: 0xffc94a }), 20, 120);
      labelY = 180;
      break;
    case 'summit':
      add(new THREE.CylinderGeometry(0.5, 0.5, 18), white, 0, 9);
      add(new THREE.BoxGeometry(10, 6, 0.3), red, 5, 15, 0);
      add(new THREE.ConeGeometry(4, 6, 4), stone, 0, 1);
      break;
    case 'volcano': {
      g.position.y = VOLCANO.h - 330;
      add(new THREE.CircleGeometry(260, 24).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x220800, emissive: 0xff4a10, emissiveIntensity: 2.5 }), 0, 0);
      const smokeMat = new THREE.SpriteMaterial({ map: TEX.puff, color: 0x6a6a6a, transparent: true, opacity: 0.9, depthWrite: false });
      const puffs = [];
      for (let i = 0; i < 40; i++) {
        const sp = new THREE.Sprite(smokeMat);
        sp.userData.t = i / 40;
        g.add(sp);
        puffs.push(sp);
      }
      anim.push((dt) => {
        for (const sp of puffs) {
          sp.userData.t = (sp.userData.t + dt * 0.02) % 1;
          const t = sp.userData.t;
          sp.position.set(Math.sin(t * 9 + sp.id) * 60 + t * 600, 100 + t * 1600, Math.cos(t * 7 + sp.id) * 60);
          sp.scale.setScalar(150 + t * 700);
        }
      });
      labelY = 1900;
      break;
    }
  }
  scene.add(g);
  g.traverse((o) => { if (o.isMesh && !(o.material instanceof THREE.MeshBasicMaterial)) { o.castShadow = true; o.receiveShadow = true; } });
  addLabel(scene, l.name, l.x, g.position.y + labelY, l.z, 15000, { color: '#ffe9b0', size: 0.027 });
}

// ---------- Trafic ----------
function buildShips(scene, anim) {
  for (const s of SHIPS) {
    const g = new THREE.Group();
    if (s.kind === 'cargo') {
      const parts = [
        [new THREE.BoxGeometry(22, 10, 130).translate(0, 2, 0), 0x2f3b4a],
        [new THREE.BoxGeometry(18, 12, 18).translate(0, 13, 48), 0xf0f0f0],
        [new THREE.CylinderGeometry(2, 2, 10).translate(0, 22, 52), 0xd83a2e],
      ];
      const cc = [0xd83a2e, 0x2a6fd8, 0xf2c230, 0x3a9a4a, 0xe07a2a];
      for (let i = 0; i < 12; i++) parts.push([new THREE.BoxGeometry(8, 6, 14).translate(i % 2 ? 4.5 : -4.5, 10, -45 + Math.floor(i / 2) * 15), cc[i % cc.length]]);
      g.add(new THREE.Mesh(mergeColored(parts), lambert(0xffffff, { vertexColors: true })));
    } else {
      const parts = [
        [new THREE.BoxGeometry(4, 2.4, 14).translate(0, 0.6, 0), 0xffffff],
        [new THREE.CylinderGeometry(0.2, 0.2, 16).translate(0, 9, -1), 0x8a6b45],
        [new THREE.ConeGeometry(4, 13, 3).scale(0.1, 1, 1).translate(0, 9, 2.2), 0xfafafa],
      ];
      g.add(new THREE.Mesh(mergeColored(parts), lambert(0xffffff, { vertexColors: true })));
    }
    scene.add(g);
    anim.push((dt, t) => {
      const p = shipPosition(s, t);
      g.position.set(p.x, 0, p.z);
      g.rotation.y = s.dir > 0 ? Math.PI - p.angle : -p.angle;
    });
  }
}

function buildBalloons(scene, anim) {
  const colors = [0xe84a3a, 0xf2c230, 0x3a8ae8, 0x9a4ae8, 0x3ac87a, 0xff8a2a];
  for (const b of BALLOONS) {
    const g = new THREE.Group();
    const env = new THREE.Mesh(new THREE.SphereGeometry(10, 28, 18).scale(1, 1.2, 1), lambert(colors[b.color], { roughness: 0.55 }));
    env.position.y = 16;
    const stripes = new THREE.Mesh(new THREE.SphereGeometry(10.1, 12, 2, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.1).scale(1, 1.2, 1), lambert(0xffffff));
    stripes.position.y = 16;
    const basket = new THREE.Mesh(new THREE.BoxGeometry(3, 2.4, 3), lambert(0x8a6b45));
    g.add(env, stripes, basket);
    scene.add(g);
    anim.push((dt, t) => {
      const p = balloonPosition(b, t);
      g.position.set(p.x, p.y, p.z);
    });
  }
}

function buildWindFarms(scene, anim) {
  const towerGeo = new THREE.CylinderGeometry(1.2, 2.2, 80, 8).translate(0, 40, 0);
  const white = lambert(0xf2f4f6);
  const bladeGeo = new THREE.BoxGeometry(1.4, 36, 0.4).translate(0, 18, 0);
  WIND_FARMS.forEach((f, fi) => {
    turbinePositions(fi).forEach(({ x, z }, i) => {
      const g = new THREE.Group();
      g.position.set(x, groundHeight(x, z) - 1, z);
      g.add(new THREE.Mesh(towerGeo, white));
      const nac = new THREE.Mesh(new THREE.BoxGeometry(3.5, 3.5, 8), white);
      nac.position.set(0, 81, 0);
      const rotor = new THREE.Group();
      rotor.position.set(0, 81, -4.5);
      for (let k = 0; k < 3; k++) {
        const bl = new THREE.Mesh(bladeGeo, white);
        bl.rotation.z = (k * Math.PI * 2) / 3;
        rotor.add(bl);
      }
      g.add(nac, rotor);
      g.rotation.y = 0.6;
      scene.add(g);
      const sp = 0.8 + (i % 3) * 0.1;
      anim.push((dt) => { rotor.rotation.z += dt * sp; });
    });
  });
}

// ---------- Construction globale ----------
export function buildWorldObjects(scene) {
  const anim = [];
  const r = rng(4242);
  for (const a of AIRPORTS) buildAirport(scene, a, r, anim);
  buildCities(scene);
  for (const t of TOWNS) addLabel(scene, t.name, t.x, terrainHeight(t.x, t.z) + 160, t.z, 9000, { color: '#f4ead2', size: 0.022 });
  for (const l of LANDMARKS) buildLandmark(scene, l, anim);
  buildShips(scene, anim);
  buildBalloons(scene, anim);
  buildWindFarms(scene, anim);
  return {
    update(dt, t) { for (const f of anim) f(dt, t); },
  };
}

