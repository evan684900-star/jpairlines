// Cinématique de début de partie (version réaliste) : le pilote, sacoche à la main, marche vers l'avion
// (plan large fixe puis caméra épaule qui le suit), ouvre la porte à la main (la main suit la poignée),
// monte (escabeau ou aile), se baisse, entre et s'assoit ; la porte claque et la caméra rejoint la vue de poursuite.
// Caméra « tournée » : focales réelles, coupes franches, panoramiques amortis, léger bougé, vignettage, fondu d'ouverture.
// Une touche, un clic ou un bouton de manette la passe.
import * as THREE from 'three';
import { t as tr } from './i18n.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SUIT_TINTS } from './livery.js';

const clamp01 = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const ease = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const ease5 = (x) => { x = clamp01(x); return x * x * x * (x * (x * 6 - 15) + 10); };
const easeOut = (x) => 1 - (1 - clamp01(x)) ** 3;
const lerp = THREE.MathUtils.lerp;
const TAU = Math.PI * 2;
const wrap = (x) => x - Math.floor(x);
const bump = (u, c, w) => { const d = Math.abs(wrap(u - c + 0.5) - 0.5) / w; return Math.exp(-d * d); };
const dampAngle = (a, b, w, dt) => a + ((((b - a + Math.PI) % TAU) + TAU) % TAU - Math.PI) * (1 - Math.exp(-w * dt));
// bruit lisse (somme de sinus incommensurables) pour le bougé caméra
const wob = (t, f) => Math.sin(t * f) * 0.5 + Math.sin(t * f * 2.13 + 1.7) * 0.3 + Math.sin(t * f * 4.71 + 0.3) * 0.2;

// durées des phases (s)
const OPEN = 1.9, ENTER = 1.8, CLOSE = 1.0, BLEND = 2.3;
const DOOR_MAX = 1.75;
const STRIDE = 1.5, CRUISE = 1.35; // m par cycle de marche (2 pas), vitesse de croisière (m/s)
// gabarit du pilote
// bras aux mesures du modèle pilote.glb (0,26 et 0,265 m) : la main du modèle arrive bien sur la poignée
const THIGH = 0.44, SHIN = 0.41, LEG = THIGH + SHIN, PELVIS_Y = 0.96, UPPER = 0.26, FORE = 0.265;

const DOWN = new THREE.Vector3(0, -1, 0), XAXIS = new THREE.Vector3(1, 0, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _r = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _e = new THREE.Euler();

// ressort critique (SmoothDamp) : suit une cible sans à-coups
function smoothDamp(cur, vel, target, omega, dt) {
  const x = omega * dt, k = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  _c.subVectors(cur, target);
  _d.copy(vel).addScaledVector(_c, omega).multiplyScalar(dt);
  vel.addScaledVector(_d, -omega).multiplyScalar(k);
  cur.copy(target).add(_c.add(_d).multiplyScalar(k));
}

// ----- Le pilote : commandant de bord articulé (bassin, colonne, poitrine, cou, épaules, coudes, poignets, hanches, genoux, chevilles) -----
function buildPilot() {
  const g = new THREE.Group();
  const M = (color, rough = 0.85, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
  const suit = M(0x1c2b44, 0.88), trouser = M(0x18243a, 0.9), shirt = M(0xefefe9, 0.8), tie = M(0x0e1626, 0.55),
    skin = M(0xd9a582, 0.6), hair = M(0x3a2a1e, 0.95), shoe = M(0x0b0b0c, 0.28), cap = M(0xf4f4f0, 0.55), band = M(0x10151f, 0.5),
    gold = M(0xc9a23a, 0.35, 0.85), lens = M(0x0a0f14, 0.06, 0.7), leather = M(0x3b2416, 0.5);
  const add = (parent, geo, mat, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; parent.add(m); return m;
  };
  const joint = (parent, x, y, z) => { const j = new THREE.Group(); j.position.set(x, y, z); parent.add(j); return j; };
  const caps = (r, l) => new THREE.CapsuleGeometry(r, l, 6, 14);
  const ball = (s = 16) => new THREE.SphereGeometry(1, s, Math.round(s * 0.75));

  const pelvis = joint(g, 0, PELVIS_Y, 0);
  add(pelvis, ball(18), trouser, 0, 0.01, 0, 0.165, 0.11, 0.115);
  add(pelvis, new THREE.CylinderGeometry(0.158, 0.162, 0.045, 20), band, 0, 0.07, 0, 1, 1, 0.76);
  add(pelvis, new THREE.BoxGeometry(0.05, 0.035, 0.012), gold, 0, 0.07, 0.124);
  const legs = [-1, 1].map((s) => {
    const hip = joint(pelvis, s * 0.095, -0.03, 0);
    add(hip, caps(0.078, THIGH - 0.14), trouser, 0, -THIGH / 2, 0);
    const knee = joint(hip, 0, -THIGH, 0);
    add(knee, caps(0.062, SHIN - 0.12), trouser, 0, -SHIN / 2, -0.005);
    const ankle = joint(knee, 0, -SHIN, 0);
    add(ankle, new THREE.BoxGeometry(0.1, 0.075, 0.24), shoe, 0, -0.045, 0.045);
    add(ankle, ball(12), shoe, 0, -0.047, 0.16, 0.05, 0.036, 0.06);
    return { hip, knee, ankle };
  });
  const spine = joint(pelvis, 0, 0.08, 0);
  add(spine, caps(0.145, 0.1), suit, 0, 0.1, 0, 1.02, 1, 0.72);
  const chest = joint(spine, 0, 0.2, 0);
  const chestMesh = add(chest, caps(0.165, 0.14), suit, 0, 0.06, 0, 1.12, 1, 0.74);
  add(chest, new THREE.BoxGeometry(0.075, 0.13, 0.01), shirt, 0, 0.2, 0.116);
  add(chest, new THREE.BoxGeometry(0.03, 0.2, 0.012), tie, 0, 0.12, 0.125);
  add(chest, new THREE.BoxGeometry(0.07, 0.016, 0.01), gold, 0.085, 0.17, 0.12); // insigne « ailes »
  [0.0, -0.09].forEach((y) => add(chest, ball(8), gold, 0.04, y, 0.118, 0.011, 0.011, 0.006));
  const arms = [-1, 1].map((s) => {
    const sh = joint(chest, s * 0.205, 0.18, 0);
    add(sh, ball(14), suit, 0, -0.01, 0, 0.06, 0.06, 0.06);
    add(sh, caps(0.06, UPPER - 0.12), suit, 0, -UPPER / 2, 0);
    const el = joint(sh, 0, -UPPER, 0);
    add(el, caps(0.052, FORE - 0.1), suit, 0, -FORE / 2 + 0.01, 0);
    add(el, new THREE.CylinderGeometry(0.055, 0.055, 0.016, 14), gold, 0, -FORE + 0.07, 0);
    add(el, new THREE.CylinderGeometry(0.055, 0.055, 0.012, 14), gold, 0, -FORE + 0.045, 0);
    add(el, new THREE.CylinderGeometry(0.047, 0.047, 0.03, 14), shirt, 0, -FORE + 0.015, 0);
    const hand = joint(el, 0, -FORE, 0);
    add(hand, ball(12), skin, 0, -0.045, 0.005, 0.026, 0.065, 0.044);
    add(hand, caps(0.013, 0.035), skin, -s * 0.012, -0.03, 0.035).rotation.x = 0.5;
    return { sh, el, hand };
  });
  const neck = joint(chest, 0, 0.27, 0);
  add(neck, new THREE.CylinderGeometry(0.048, 0.056, 0.11, 12), skin, 0, 0.03, 0);
  add(neck, new THREE.CylinderGeometry(0.062, 0.066, 0.05, 14), shirt, 0, -0.01, 0);
  const head = joint(neck, 0, 0.12, 0);
  add(head, ball(20), skin, 0, 0.03, 0.005, 0.098, 0.12, 0.108);
  add(head, ball(14), skin, 0, -0.035, 0.03, 0.075, 0.06, 0.08); // mâchoire
  add(head, new THREE.ConeGeometry(0.018, 0.045, 8), skin, 0, 0.012, 0.115).rotation.x = Math.PI / 2;
  [-1, 1].forEach((s) => add(head, ball(10), skin, s * 0.097, 0.02, -0.005, 0.012, 0.03, 0.02));
  add(head, ball(18), hair, 0, 0.055, -0.014, 0.102, 0.1, 0.105);
  [-1, 1].forEach((s) => add(head, new THREE.BoxGeometry(0.05, 0.028, 0.008), lens, s * 0.035, 0.04, 0.112));
  add(head, new THREE.BoxGeometry(0.024, 0.005, 0.005), gold, 0, 0.05, 0.116);
  add(head, new THREE.CylinderGeometry(0.124, 0.106, 0.075, 24), cap, 0, 0.145, -0.005);
  add(head, new THREE.CylinderGeometry(0.109, 0.109, 0.03, 24), band, 0, 0.098, -0.005);
  add(head, new THREE.CylinderGeometry(0.1, 0.1, 0.01, 20, 1, false, -Math.PI / 2, Math.PI), band, 0, 0.088, 0.055, 1.02, 1, 0.82).rotation.x = 0.22;
  add(head, new THREE.BoxGeometry(0.032, 0.025, 0.008), gold, 0, 0.142, 0.119);
  // sacoche de vol dans la main gauche (pend verticalement, se balance)
  const bag = joint(arms[1].hand, 0, -0.05, 0);
  add(bag, new THREE.BoxGeometry(0.11, 0.28, 0.4), leather, 0, -0.17, 0);
  add(bag, new THREE.BoxGeometry(0.115, 0.04, 0.405), band, 0, -0.06, 0);
  add(bag, new THREE.TorusGeometry(0.045, 0.008, 6, 14, Math.PI), band, 0, -0.03, 0).rotation.y = Math.PI / 2;
  g.userData = { pelvis, spine, chest, chestMesh, neck, head, legs, arms, bag };
  return g;
}

// ----- Pilote 3D (models/pilote.glb, squelette Mixamo) piloté par le squelette simplifié ci-dessus -----
// Le squelette simplifié (invisible) garde toute l'animation : marche, main sur la poignée, accroupi, assis. À chaque
// image, chaque os du modèle est orienté comme le segment correspondant (cuisse, tibia, bras…), en partant de sa pose
// de repos : les proportions du modèle sont gardées et rien ne se déforme. Bassin, dos, cou et tête copient
// l'orientation de leur articulation (avec le décalage mesuré au repos).
const DIRS = [ // os, articulation de départ, articulation d'arrivée (ou direction locale)
  ['LeftUpLeg', (U) => U.legs[1].hip, (U) => U.legs[1].knee], ['LeftLeg', (U) => U.legs[1].knee, (U) => U.legs[1].ankle],
  ['RightUpLeg', (U) => U.legs[0].hip, (U) => U.legs[0].knee], ['RightLeg', (U) => U.legs[0].knee, (U) => U.legs[0].ankle],
  ['LeftFoot', (U) => U.legs[1].ankle, [0, -0.02, 1]], ['RightFoot', (U) => U.legs[0].ankle, [0, -0.02, 1]],
  ['LeftArm', (U) => U.arms[1].sh, (U) => U.arms[1].el], ['LeftForeArm', (U) => U.arms[1].el, (U) => U.arms[1].hand],
  ['RightArm', (U) => U.arms[0].sh, (U) => U.arms[0].el], ['RightForeArm', (U) => U.arms[0].el, (U) => U.arms[0].hand],
  ['LeftHand', (U) => U.arms[1].hand, [0, -1, 0]], ['RightHand', (U) => U.arms[0].hand, [0, -1, 0]],
];
const COPY = [['Hips', 'pelvis'], ['Spine', 'spine'], ['Spine2', 'chest'], ['Neck', 'neck'], ['Head', 'head']];
const _w1 = new THREE.Vector3(), _w2 = new THREE.Vector3(), _ax = new THREE.Vector3(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qc = new THREE.Quaternion();

class PilotSkin {
  // proxy : groupe du squelette simplifié (au repos) ; gltf : modèle chargé
  constructor(proxy, gltf) {
    const root = gltf.scene;
    this.root = root;
    this.bones = {};
    root.traverse((o) => {
      if (o.isBone) this.bones[o.name.replace(/^mixamorig:?/, '')] = o; // GLTFLoader retire le « : » des noms
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; }
    });
    proxy.add(root);
    proxy.updateMatrixWorld(true);
    const U = proxy.userData;
    this.rest = {};
    for (const [k, b] of Object.entries(this.bones)) this.rest[k] = b.quaternion.clone();
    this.hipsRest = this.bones.Hips.position.clone();
    this.pelvisRest = U.pelvis.position.clone();
    // décalage de repos entre l'articulation simplifiée et l'os (dans le repère du pilote)
    const inv = proxy.getWorldQuaternion(new THREE.Quaternion()).invert();
    this.offset = {};
    for (const [bone, j] of COPY) {
      const qj = inv.clone().multiply(U[j].getWorldQuaternion(new THREE.Quaternion()));
      const qb = inv.clone().multiply(this.bones[bone].getWorldQuaternion(new THREE.Quaternion()));
      this.offset[bone] = qj.invert().multiply(qb);
    }
    this.ratio = this.hipsRest.y / this.pelvisRest.y; // jambes du modèle un peu plus longues
    // le modèle cache le squelette simplifié (sauf la sacoche)
    proxy.traverse((o) => { if (o.isMesh && !U.bag.getObjectById(o.id) && !this.root.getObjectById(o.id)) o.visible = false; });
  }
  // orientation monde → locale (parent déjà à jour)
  setWorld(bone, qWorld) {
    bone.parent.getWorldQuaternion(_qa).invert();
    bone.quaternion.copy(_qa.multiply(qWorld));
    bone.updateMatrixWorld(true);
  }
  update(proxy) {
    const U = proxy.userData, B = this.bones;
    proxy.updateMatrixWorld(true);
    for (const [k, q] of Object.entries(this.rest)) B[k].quaternion.copy(q);
    // bassin : position (mise à l'échelle des jambes du modèle) et orientation
    B.Hips.position.copy(this.hipsRest).addScaledVector(_w1.copy(U.pelvis.position).sub(this.pelvisRest), this.ratio);
    B.Hips.position.y = this.hipsRest.y + (U.pelvis.position.y - this.pelvisRest.y) * this.ratio;
    this.root.updateMatrixWorld(true);
    for (const [bone, j] of COPY) {
      this.setWorld(B[bone], U[j].getWorldQuaternion(_qb).multiply(this.offset[bone]));
    }
    // membres : chaque os pointe (axe +Y des os Mixamo) dans la direction du segment correspondant
    for (const [bone, from, to] of DIRS) {
      const b = B[bone];
      if (!b) continue;
      const a = from(U);
      a.getWorldPosition(_w1);
      if (Array.isArray(to)) _w2.set(...to).transformDirection(a.matrixWorld);
      else to(U).getWorldPosition(_w2).sub(_w1);
      if (_w2.lengthSq() < 1e-8) continue;
      _w2.normalize();
      b.getWorldQuaternion(_qc);
      _ax.set(0, 1, 0).applyQuaternion(_qc);
      _qb.setFromUnitVectors(_ax, _w2);
      this.setWorld(b, _qb.multiply(_qc));
    }
  }
  // tenue choisie au hangar : teinte des matériaux (chemise, casquette, pantalon, cravate)
  setSuit(key) {
    const tint = SUIT_TINTS[key] || SUIT_TINTS.commandant;
    this.root.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of [].concat(o.material)) {
        m.userData.base ??= m.color.clone();
        const c = tint[m.name];
        m.color.copy(m.userData.base);
        if (c) m.color.multiply(new THREE.Color(c));
      }
    });
  }
  // position de la main gauche du modèle (la sacoche y est accrochée)
  leftHand(out) { return this.bones.LeftHand.getWorldPosition(out); }
  // amène la main droite du modèle sur un point (poignée) : bras à deux segments, le coude garde son côté actuel
  reachRight(target, w) {
    if (!(w > 0.001)) return;
    const B = this.bones, up = B.RightArm, fore = B.RightForeArm, hand = B.RightHand;
    const S = up.getWorldPosition(new THREE.Vector3()), E = fore.getWorldPosition(new THREE.Vector3()), H = hand.getWorldPosition(new THREE.Vector3());
    const a = S.distanceTo(E), b = E.distanceTo(H);
    const T = H.clone().lerp(target, w);
    const toT = T.clone().sub(S);
    const d = THREE.MathUtils.clamp(toT.length(), Math.abs(a - b) + 1e-3, a + b - 1e-3);
    toT.normalize();
    // plan du bras : contient l'épaule, la cible et le coude actuel
    const pole = E.clone().sub(S);
    const bend = pole.sub(toT.clone().multiplyScalar(pole.dot(toT)));
    if (bend.lengthSq() < 1e-8) bend.set(0, -1, 0).sub(toT.clone().multiplyScalar(-toT.y));
    bend.normalize();
    const x = (a * a - b * b + d * d) / (2 * d), y = Math.sqrt(Math.max(0, a * a - x * x));
    const E2 = S.clone().addScaledVector(toT, x).addScaledVector(bend, y);
    const aim = (bone, from, to) => {
      const dir = to.clone().sub(from).normalize();
      bone.getWorldQuaternion(_qc);
      _ax.set(0, 1, 0).applyQuaternion(_qc);
      _qb.setFromUnitVectors(_ax, dir);
      this.setWorld(bone, _qb.multiply(_qc));
    };
    aim(up, S, E2);
    aim(fore, E2, T);
  }
}

// cycle de marche (ph en cycles, amp 0 = immobile, climb 0..1 = monte des marches)
// appui talon → pied à plat → poussée sur la pointe ; bassin qui oscille ; épaules en opposition ; tête stabilisée
function poseGait(p, ph, amp, time, climb = 0) {
  const U = p.userData;
  let maxV = 0;
  U.legs.forEach(({ hip, knee, ankle }, i) => {
    const u = wrap(ph + i * 0.5);
    const flex = (0.4 * Math.cos(TAU * (u + 0.07)) + 0.03) * amp + climb * 0.55 * bump(u, 0.85, 0.15);
    const kn = 0.05 + amp * (0.18 * bump(u, 0.12, 0.08) + 1.05 * bump(u, 0.73, 0.12)) + climb * 0.9 * bump(u, 0.8, 0.15);
    hip.rotation.set(-flex, 0, 0);
    knee.rotation.x = kn;
    const pitch = amp * (-0.22 * bump(u, 0.0, 0.05) + 0.5 * bump(u, 0.57, 0.06));
    ankle.rotation.x = lerp(flex - kn + pitch, -0.12 * amp, bump(u, 0.8, 0.1));
    maxV = Math.max(maxV, THIGH * Math.cos(flex) + SHIN * Math.cos(flex - kn));
  });
  const sw = Math.sin(TAU * ph), yaw = 0.07 * amp * Math.cos(TAU * (ph + 0.07)), roll = -0.03 * amp * sw;
  const breath = Math.sin(time * 1.7);
  U.pelvis.position.set(-0.02 * amp * sw + 0.006 * (1 - amp) * Math.sin(time * 0.8), PELVIS_Y - (LEG - maxV), 0);
  U.pelvis.rotation.set(0, yaw, roll);
  U.spine.rotation.set(0.04 + 0.04 * amp + climb * 0.18, -1.4 * yaw, -0.6 * roll);
  U.chest.rotation.set(0.004 * breath, -0.3 * yaw, 0);
  U.chestMesh.scale.set(1.12 * (1 + 0.006 * breath), 1, 0.74 * (1 + 0.014 * breath));
  U.neck.rotation.set(-0.03 - 0.04 * amp - climb * 0.12, 0.7 * yaw, 0.4 * roll);
  U.head.rotation.set(0.02 * amp * Math.cos(TAU * 2 * ph), 0, 0);
  const carry = U.bag.visible;
  U.arms.forEach(({ sh, el, hand }, i) => {
    const s = i ? 1 : -1, c = Math.cos(TAU * (ph + i * 0.5 + 0.04)), bagArm = i === 1 && carry;
    sh.rotation.set(amp * c * (bagArm ? 0.1 : 0.36) + 0.04, 0, s * (bagArm ? 0.16 : 0.07));
    el.rotation.set(-(bagArm ? 0.08 : 0.2 + 0.3 * amp * Math.max(0, -c)), 0, 0);
    hand.rotation.set(0, 0, 0);
  });
}

export class Intro {
  // ctx : { scene, camera, rig, ground(x, z) }
  constructor(ctx) {
    this.ctx = ctx;
    this.active = false;
    this.pilot = buildPilot();
    this.pilot.visible = false;
    ctx.scene.add(this.pilot);
    // vrai personnage 3D : chargé en arrière-plan ; d'ici là, le pilote simplifié sert de secours
    this.skin = null;
    new GLTFLoader().loadAsync('models/pilote.glb').then((g) => { this.gltf = g; if (!this.active) this.mountSkin(); })
      .catch((e) => console.warn('Pilote 3D indisponible, pilote simplifié utilisé', e));
    // vignettage + fondu d'ouverture
    this.fx = document.createElement('div');
    Object.assign(this.fx.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '5', display: 'none', background: '#000' });
    this.vig = document.createElement('div');
    Object.assign(this.vig.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '5', display: 'none',
      background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,0.42) 100%)' });
    this.bars = document.createElement('div');
    this.bars.id = 'cine';
    this.bars.className = 'hidden';
    document.body.append(this.vig, this.fx, this.bars);
    this.camPos = new THREE.Vector3(); this.camLook = new THREE.Vector3();
    this.camVel = new THREE.Vector3(); this.lookVel = new THREE.Vector3();
    this.tmp = new THREE.Vector3();
    this.fix = new THREE.Vector3();
    this.ray = new THREE.Raycaster(); this.avDir = new THREE.Vector3(); this.avFrom = new THREE.Vector3();
  }

  // trouve la porte : un rayon tiré depuis la gauche de l'avion vers le siège du pilote
  findDoor(mesh) {
    const eye = mesh.userData.eye || new THREE.Vector3(0, 1, 0);
    mesh.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
    const dir = new THREE.Vector3(1, 0, 0).transformDirection(mesh.matrixWorld);
    const parts = [];
    mesh.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && o.visible && !o.userData.noDoor && !o.material?.transparent) parts.push(o); });
    const ray = new THREE.Raycaster();
    const cast = (dz) => {
      ray.set(new THREE.Vector3(-12, eye.y - 0.35, eye.z + dz).applyMatrix4(mesh.matrixWorld), dir);
      ray.far = 14;
      return ray.intersectObjects(parts, false).map((h) => ({ h, x: h.point.clone().applyMatrix4(inv).x }));
    };
    const [mid, a, b] = [cast(0), cast(-0.3), cast(0.3)];
    const near = (list, x) => list.some((o) => Math.abs(o.x - x) < 0.12);
    const hit = mid.find((o) => o.x < 0 && near(a, o.x) && near(b, o.x))?.h || mid.find((o) => o.x < 0)?.h;
    const local = hit ? hit.point.clone().applyMatrix4(inv) : new THREE.Vector3(-0.6, eye.y - 0.35, eye.z);
    const down = new THREE.Vector3(0, -1, 0).transformDirection(mesh.matrixWorld);
    const surfaceAt = (x, z) => {
      ray.set(new THREE.Vector3(x, eye.y + 3, z).applyMatrix4(mesh.matrixWorld), down);
      ray.far = 8;
      const h = ray.intersectObjects(parts, false)[0];
      return h ? h.point.clone().applyMatrix4(inv).y : null;
    };
    return { local, eye, mat: hit?.object.material, surfaceAt, inv, parts };
  }

  start(plane, mesh, onDone, suit) {
    this.stop();
    this.mountSkin(); // modèle chargé pendant une cinématique précédente
    this.skin?.setSuit(suit);
    this.onDone = onDone;
    this.plane = plane;
    this.mesh = mesh;
    const { local, eye, mat, surfaceAt, parts } = this.findDoor(mesh);
    this.eye = eye;
    this.parts = parts;
    const w = 0.85, h = 0.85;
    // porte articulée sur son bord avant, poignée sur le bord arrière, ouverture sombre derrière
    const doorMat = (Array.isArray(mat) ? mat[0] : mat)?.clone?.() || new THREE.MeshStandardMaterial({ color: 0xdddddd });
    doorMat.side = THREE.DoubleSide;
    this.hinge = new THREE.Group();
    this.hinge.position.set(local.x - 0.025, local.y, local.z - w / 2);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.03, h, w), doorMat);
    panel.position.set(0, 0, w / 2);
    panel.castShadow = true;
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.035, h * 0.42, w * 0.7), new THREE.MeshStandardMaterial({ color: 0x1d2a36, roughness: 0.05, metalness: 0.5 }));
    glass.position.set(0, h * 0.2, w / 2);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.12), new THREE.MeshStandardMaterial({ color: 0x8a9096, roughness: 0.3, metalness: 0.9 }));
    handle.position.set(-0.03, -0.12, w - 0.09);
    this.hinge.add(panel, glass, handle);
    this.hinge.traverse((o) => { o.userData.noDoor = true; });
    this.handleOut = new THREE.Vector3(-0.05, -0.12, w - 0.09);
    this.handleIn = new THREE.Vector3(0.04, -0.12, w - 0.09);
    mesh.add(this.hinge);
    this.hole = new THREE.Mesh(new THREE.BoxGeometry(0.04, h - 0.03, w - 0.03), new THREE.MeshBasicMaterial({ color: 0x07080a }));
    this.hole.position.copy(local);
    this.hole.userData.noDoor = true;
    mesh.add(this.hole);

    this.doorLocal = local.clone();
    this.groundY = this.ctx.ground(plane.pos.x, plane.pos.z);
    const wy = (y) => new THREE.Vector3(0, y, 0).applyMatrix4(mesh.matrixWorld).y;
    const gLY = this.groundY - wy(0); // hauteur locale du sol
    const wingAt = (x, z) => {
      const ys = [-0.25, 0, 0.25].map((dz) => surfaceAt(x, z + dz));
      if (ys.some((y) => y === null)) return null;
      const hh = wy(ys[1]) - this.groundY;
      return hh > 0.25 && hh < 1.9 && Math.max(...ys) - Math.min(...ys) < 0.35 ? ys[1] : null;
    };
    // point d'arrêt : à côté de la porte, en retrait vers l'arrière pour ne pas être balayé par son ouverture
    let stand = new THREE.Vector3(local.x - 0.42, gLY, local.z + 0.55);
    let start = new THREE.Vector3(local.x - 7.5, gLY, local.z + 4.5);
    const blocked = (a) => [0.3, 0.45, 0.6, 0.75, 0.9].some((f) => wingAt(lerp(a.x, stand.x, f), lerp(a.z, stand.z, f)) !== null);
    const under = wingAt(local.x - 0.9, local.z);
    if (under === null && blocked(start)) start = new THREE.Vector3(local.x - 7.5, gLY, local.z - 4.5);
    const path = [start];
    const floorLocal = local.y - 0.45;
    let sillOut;
    const board = [];
    this.stairs = null;
    if (under !== null) {
      // aile basse : on contourne le bord de fuite, on monte sur l'aile, on marche jusqu'à la porte
      let zTE = local.z + 4;
      for (let dz = 0; dz < 4; dz += 0.15) if (wingAt(local.x - 0.9, local.z + dz) === null) { zTE = local.z + dz; break; }
      const onWing = (x, z) => new THREE.Vector3(x, (surfaceAt(x, z) ?? under) + 0.02, z);
      path.push(new THREE.Vector3(local.x - 1.2, gLY, zTE + 0.7), onWing(local.x - 0.95, Math.max(zTE - 0.3, local.z + 0.6)));
      stand = onWing(local.x - 0.45, local.z + 0.55);
      path.push(stand);
      sillOut = new THREE.Vector3(local.x - 0.28, Math.max(stand.y, floorLocal), local.z + 0.05);
      board.push(stand, sillOut);
    } else {
      const sill = wy(floorLocal) - this.groundY;
      if (sill > 0.55) {
        // porte haute : escabeau (décalé vers l'arrière pour que le pilote ouvre depuis le sol, à côté)
        const n = Math.ceil(sill / 0.24), steps = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.45, metalness: 0.7 });
        const zc = local.z + 0.12, xs = (i) => local.x - 0.2 - (n - 1 - i) * 0.26;
        for (let i = 0; i < n; i++) {
          const st = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.8), m);
          st.position.set(xs(i), gLY + (i + 1) * (sill / n) - 0.025, zc);
          st.castShadow = st.receiveShadow = true;
          steps.add(st);
        }
        const run = (n - 1) * 0.26 + 0.3, len = Math.hypot(run, sill), ang = Math.atan2(sill, run);
        [-1, 1].forEach((s) => {
          const r = new THREE.Mesh(new THREE.BoxGeometry(len, 0.06, 0.025), m);
          r.position.set(local.x - 0.05 - run / 2, gLY + sill / 2, zc + s * 0.41);
          r.rotation.z = -ang;
          r.castShadow = true;
          steps.add(r);
        });
        steps.traverse((o) => { o.userData.noDoor = true; });
        mesh.add(steps);
        this.stairs = steps;
        stand = new THREE.Vector3(local.x - 0.42, gLY, local.z + 0.78);
        path.push(stand);
        sillOut = new THREE.Vector3(local.x - 0.28, floorLocal, local.z + 0.08);
        board.push(stand, new THREE.Vector3(xs(0) - 0.32, gLY, zc), new THREE.Vector3(xs(0) + 0.05, gLY + sill / n, zc), sillOut);
        this.climbT = 0.9 + n * 0.42;
      } else {
        path.push(stand);
        sillOut = new THREE.Vector3(local.x - 0.28, Math.max(gLY, floorLocal), local.z + 0.05);
        board.push(stand, sillOut);
      }
    }
    if (!this.stairs) this.climbT = 1.0;
    this.curve = new THREE.CatmullRomCurve3(path, false, 'centripetal');
    this.boardCurve = new THREE.CatmullRomCurve3(board, false, 'centripetal');
    this.len = this.curve.getLength();
    this.boardLen = this.boardCurve.getLength();
    // profil de vitesse : démarre, marche, ralentit
    this.walkT = clamp(this.len / CRUISE + 1.15, 3.8, 8.5);
    this.ta = 1.0; this.td = 1.3;
    this.vmax = this.len / (this.walkT - (this.ta + this.td) / 2);
    // pour se baisser sous le haut de la porte
    const floorW = wy(sillOut.y), roofW = wy(local.y + h / 2);
    const drop = Math.max(0, floorW + 1.84 - roofW + 0.05);
    const bend = clamp(drop / 0.55, 0.25, 1.05), rem = drop - 0.88 * (1 - Math.cos(bend));
    this.duck = { bend, phi: rem > 0 ? Math.acos(Math.max(0.35, 1 - rem / LEG)) : 0.12 };
    this.grabLocal = new THREE.Vector3(local.x - 0.01, local.y + h / 2 - 0.06, local.z + w / 2 - 0.05);
    this.seatLocal = eye.clone().setY(eye.y - 0.62);

    // plans fixes (repère de l'avion), hauteur au-dessus du sol corrigée pour ne jamais être dans une aile
    const safe = (x, z, hh) => {
      const s = surfaceAt(x, z);
      if (s !== null) {
        const sh = wy(s) - this.groundY;
        hh = sh < 2.1 ? Math.max(hh, sh + 0.6) : Math.min(hh, sh - 0.35);
      }
      return { x, z, h: hh };
    };
    const s0 = path[0], sN = path[path.length - 1];
    this.walkDir = new THREE.Vector3(sN.x - s0.x, 0, sN.z - s0.z).normalize();
    // plan 1 : en avant du pilote, à l'extérieur, l'avion dans le cadre derrière lui
    const sg = s0.z > local.z ? 1 : -1;
    const doorH = wy(local.y) - this.groundY;
    this.shot1 = safe(local.x - 4.6, local.z - 3.6 * sg, 0.95);
    this.shot3 = safe(local.x - 2.6, local.z - 2.0, wy(stand.y) - this.groundY + 1.35); // contrechamp : son visage, sa main sur la poignée
    this.shot4 = safe(local.x - 5.6, local.z + 2.8, Math.max(1.5, doorH - 0.1));

    const T1 = this.walkT, T2 = T1 + OPEN, T3 = T2 + this.climbT + ENTER, T4 = T3 + CLOSE;
    this.times = { T1, T2, T3, T4, T5: T4 + BLEND, cutA: Math.max(Math.min(2.2, T1 - 1.2), T1 * 0.5) };
    mesh.updateMatrixWorld(true);
    this.t = 0; this.phase = 0; this.shot = 0; this.kick = 0; this.kicked = false;
    this.curve.getTangentAt(0, _a).transformDirection(mesh.matrixWorld);
    this.yaw = Math.atan2(_a.x, _a.z);
    this.prevBoard = null;
    this.baseFov = this.ctx.camera.fov;
    this.active = true;
    this.pilot.visible = true;
    this.pilot.userData.bag.visible = true;
    this.bars.innerHTML = `<span>${tr('Appuie sur une touche pour passer ▸')}</span>`;
    this.bars.classList.remove('hidden');
    this.fx.style.display = this.vig.style.display = 'block';
    this.fx.style.opacity = '1';
    this.skip = (e) => {
      if (this.t <= 0.4) return;
      e.stopImmediatePropagation();
      this.finish();
    };
    addEventListener('keydown', this.skip, true);
    addEventListener('pointerdown', this.skip, true);
  }

  // installe le modèle 3D : le squelette simplifié est remis au repos pour mesurer les décalages
  mountSkin() {
    if (this.skin || !this.gltf) return;
    const U = this.pilot.userData;
    this.pilot.traverse((o) => { if (!o.isMesh && o !== this.pilot) o.quaternion.identity(); });
    U.pelvis.position.set(0, PELVIS_Y, 0);
    const pos = this.pilot.position.clone(), q = this.pilot.quaternion.clone();
    this.pilot.position.set(0, 0, 0); this.pilot.quaternion.identity();
    this.skin = new PilotSkin(this.pilot, this.gltf);
    this.pilot.position.copy(pos); this.pilot.quaternion.copy(q);
  }

  toWorld(v, out, onGround = true) {
    out.copy(v).applyMatrix4(this.mesh.matrixWorld);
    if (onGround) out.y = Math.max(this.groundY, this.ctx.ground(out.x, out.z));
    return out;
  }
  curvePoint(curve, u, out) {
    curve.getPointAt(clamp01(u), out).applyMatrix4(this.mesh.matrixWorld);
    out.y = Math.max(out.y, this.ctx.ground(out.x, out.z));
    return out;
  }
  shotPos(s, out) {
    out.set(s.x, 0, s.z).applyMatrix4(this.mesh.matrixWorld);
    out.y = Math.max(this.groundY, this.ctx.ground(out.x, out.z)) + s.h;
    return out;
  }
  distAt(t) {
    const T = this.walkT, v = this.vmax, ta = this.ta, td = this.td;
    if (t < ta) return (0.5 * v * t * t) / ta;
    if (t < T - td) return 0.5 * v * ta + v * (t - ta);
    const r = Math.max(0, T - t);
    return this.len - (0.5 * v * r * r) / td;
  }
  speedAt(t) {
    const T = this.walkT, v = this.vmax;
    return t < this.ta ? (v * t) / this.ta : t < T - this.td ? v : (v * Math.max(0, T - t)) / this.td;
  }
  // la caméra ne passe jamais à travers l'avion (nacelle, aile, dérive) : rayon de la cible vers la caméra,
  // en partant un peu devant la cible (qui est souvent sur la paroi elle-même)
  blockedAt(pos, look) {
    const dir = this.avDir.subVectors(pos, look), L = dir.length();
    if (L < 0.8) return null;
    dir.divideScalar(L);
    this.ray.set(this.avFrom.copy(look).addScaledVector(dir, 0.4), dir);
    this.ray.far = L - 0.4;
    const h = this.ray.intersectObjects(this.parts, false)[0];
    return h ? { dir, d: 0.4 + h.distance } : null;
  }
  avoid(pos, look) {
    const b = this.blockedAt(pos, look);
    if (b) pos.copy(look).addScaledVector(b.dir, Math.max(0.7, b.d - 0.3));
  }
  // à chaque coupe : décalage qui dégage la vue (plus haut, puis plus à l'extérieur) au lieu de coller la caméra au pilote
  clearShot(pos, looks, left) {
    const out = new THREE.Vector3(), at = new THREE.Vector3();
    for (const [up, side] of [[0, 0], [0.6, 0], [1.2, 0], [0, 1.5], [0.8, 1.5], [1.8, 0], [1.2, 3], [2.2, 2]]) {
      out.set(0, up, 0).addScaledVector(left, side);
      at.copy(pos).add(out);
      if (looks.every((l) => !this.blockedAt(at, l))) return out;
    }
    return out.set(0, 0, 0);
  }
  doorOpenAngle(k) {
    const pop = 0.05 * ease((k - 0.3) / 0.08); // déverrouillage
    const sw = easeOut((k - 0.4) / 0.48);
    return Math.max(pop, DOOR_MAX * sw) + 0.04 * Math.sin(Math.PI * clamp01((k - 0.86) / 0.14)); // butée qui rebondit
  }

  // bras à deux segments vers une cible (cinématique inverse) ; se penche si la cible est trop loin
  reach(arm, target, w, lean = true) {
    if (w <= 0.001) return;
    if (arm === this.pilot.userData.arms[0]) this.goal = { p: target.clone(), w }; // repris par le modèle 3D
    const { sh, el } = arm, sp = this.pilot.userData.spine;
    const toLocal = () => { sh.parent.updateWorldMatrix(true, false); return sh.parent.worldToLocal(_r.copy(target)).sub(sh.position); };
    let d = toLocal();
    const over = d.length() - (UPPER + FORE) * 0.97;
    if (lean && over > 0) { sp.rotation.x += Math.min(0.35, over * 1.1) * w; d = toLocal(); }
    const len = clamp(d.length(), 0.15, UPPER + FORE - 0.005);
    d.normalize();
    const alpha = Math.acos(clamp((UPPER * UPPER + len * len - FORE * FORE) / (2 * UPPER * len), -1, 1));
    const flex = Math.PI - Math.acos(clamp((UPPER * UPPER + FORE * FORE - len * len) / (2 * UPPER * FORE), -1, 1));
    _q.setFromUnitVectors(DOWN, d).multiply(_q2.setFromAxisAngle(XAXIS, alpha));
    sh.quaternion.slerp(_q, w);
    el.rotation.x = lerp(el.rotation.x, -flex, w);
  }
  // tourne la tête (et un peu le cou) vers un point
  look(target, w) {
    if (w <= 0.001) return;
    const { neck, head } = this.pilot.userData;
    neck.parent.updateWorldMatrix(true, false);
    const d = neck.parent.worldToLocal(_r.copy(target)).sub(neck.position);
    const yaw = clamp(Math.atan2(d.x, d.z), -1.2, 1.2), pitch = clamp(-Math.atan2(d.y - 0.15, Math.hypot(d.x, d.z)), -0.6, 0.5);
    neck.rotation.y = lerp(neck.rotation.y, yaw * 0.45, w);
    head.rotation.y = lerp(head.rotation.y, yaw * 0.55, w);
    head.rotation.x = lerp(head.rotation.x, pitch, w);
  }
  hangBag(swing) {
    const { bag, arms } = this.pilot.userData;
    this.pilot.updateMatrixWorld(true);
    arms[1].hand.getWorldQuaternion(_q).invert();
    this.pilot.getWorldQuaternion(_q2);
    bag.quaternion.copy(_q).multiply(_q2).multiply(_q3.setFromEuler(_e.set(swing, 0, swing * 0.3)));
  }
  // se baisse, passe la porte et s'assoit (c : 0 → 1)
  poseEnter(c, t) {
    const p = this.pilot, U = p.userData;
    poseGait(p, 0, 0, t, 0);
    const crouch = ease(c / 0.3) * (1 - ease((c - 0.55) / 0.45)), sit = ease((c - 0.35) / 0.65), phi = crouch * this.duck.phi;
    U.legs.forEach(({ hip, knee, ankle }, i) => {
      const lead = i === 0 ? 1 : 0.8; // une jambe passe avant l'autre
      hip.rotation.x = lerp(-phi * lead - (i === 0 ? 0.35 * crouch : 0), -1.5, sit);
      knee.rotation.x = lerp(2 * phi * lead + (i === 0 ? 0.5 * crouch : 0), 1.6, sit);
      ankle.rotation.x = lerp(-phi * lead, -0.15, sit);
    });
    U.pelvis.position.y = lerp(PELVIS_Y - LEG * (1 - Math.cos(phi)), PELVIS_Y, sit);
    U.spine.rotation.x = crouch * this.duck.bend - sit * 0.08;
    U.neck.rotation.x = -crouch * 0.3;
    U.arms[1].sh.rotation.x = -0.5 * crouch - 0.3 * sit;
    U.arms[1].el.rotation.x = -0.4 * sit;
  }

  // dt : pas de temps ; anyPad : un bouton de manette vient d'être appuyé
  update(dt, anyPad) {
    if (!this.active) return;
    if (anyPad && this.t > 0.4) { this.finish(); return; }
    dt = Math.min(dt, 1 / 20);
    this.goal = null; // cible de la main pour cette image (posée par reach)
    this.t += dt;
    const t = this.t, p = this.pilot, U = p.userData, cam = this.ctx.camera, M = this.mesh;
    const { T1, T2, T3, T4, T5, cutA } = this.times;
    // le pilote assis de l'avion n'apparaît qu'une fois celui de la cinématique installé
    if (M.userData.pilot) M.userData.pilot.visible = this.t >= T3;
    M.updateMatrixWorld(true);
    const fwd = new THREE.Vector3(0, 0, -1).transformDirection(M.matrixWorld).setY(0).normalize();
    const left = new THREE.Vector3(-1, 0, 0).transformDirection(M.matrixWorld).setY(0).normalize();
    const door = this.toWorld(this.doorLocal, new THREE.Vector3(), false);
    const yawIn = Math.atan2(-left.x, -left.z), yawFwd = Math.atan2(fwd.x, fwd.z);
    let doorAngle = 0, bagSwing = 0;
    p.visible = t < T4;

    if (t < T1) {
      // ----- marche -----
      const v = this.speedAt(t), u = clamp01(this.distAt(t) / this.len);
      this.curvePoint(this.curve, u, p.position);
      this.curve.getTangentAt(u, _a).transformDirection(M.matrixWorld);
      this.yaw = dampAngle(this.yaw, Math.atan2(_a.x, _a.z), 6, dt);
      this.phase += (v * dt) / STRIDE;
      const amp = Math.min(1, v / 1.15);
      const climb = clamp01((Math.abs(_a.y) / Math.max(0.2, Math.hypot(_a.x, _a.z))) * 1.2) * amp;
      p.rotation.set(0, this.yaw, 0);
      poseGait(p, this.phase, amp, t, climb);
      bagSwing = 0.12 * amp * Math.sin(TAU * this.phase + 0.6);
      this.look(_b.copy(door).setY(door.y + 0.1), 0.85 * ease((t - T1 * 0.45) / (T1 * 0.4)));
    } else if (t < T2) {
      // ----- ouvre la porte : se tourne, saisit la poignée, tire, accompagne, lâche -----
      const k = (t - T1) / OPEN;
      doorAngle = -this.doorOpenAngle(k);
      this.hinge.rotation.y = doorAngle;
      this.hinge.updateMatrixWorld(true);
      const hw = this.hinge.localToWorld(_b.copy(this.handleOut));
      this.curvePoint(this.curve, 1, p.position);
      const aim = _a.copy(door).addScaledVector(fwd, -0.25);
      const prev = this.yaw;
      this.yaw = dampAngle(this.yaw, Math.atan2(aim.x - p.position.x, aim.z - p.position.z), 5, dt);
      const amp = clamp01((Math.abs(this.yaw - prev) / dt) * 0.35) * 0.4;
      if (amp > 0.03) this.phase += dt * 1.1;
      p.rotation.set(0, this.yaw, 0);
      poseGait(p, this.phase, amp, t, 0);
      this.reach(U.arms[0], hw, ease((k - 0.08) / 0.22) * (1 - ease((k - 0.66) / 0.18)));
      this.look(hw, ease(k / 0.2) * (1 - 0.6 * ease((k - 0.75) / 0.25)));
    } else if (t < T3) {
      // ----- monte (escabeau / aile / seuil), se baisse, entre, s'assoit -----
      doorAngle = -DOOR_MAX + 0.012 * Math.sin(t * 1.3);
      const tb = t - T2, grab = this.toWorld(this.grabLocal, new THREE.Vector3(), false);
      if (tb < this.climbT) {
        const k = tb / this.climbT, u = ease5(k);
        this.curvePoint(this.boardCurve, u, p.position);
        if (this.prevBoard) this.phase += this.prevBoard.distanceTo(p.position) / (this.stairs ? 0.62 : STRIDE);
        this.prevBoard = (this.prevBoard || new THREE.Vector3()).copy(p.position);
        this.boardCurve.getTangentAt(clamp01(u), _a).transformDirection(M.matrixWorld);
        const tangYaw = Math.atan2(_a.x, _a.z);
        this.yaw = dampAngle(this.yaw, k > 0.7 ? yawIn : tangYaw, k > 0.7 ? 7 : 5, dt);
        const sp = this.boardLen * (ease5(k + 0.02) - ease5(k)) / (0.02 * this.climbT);
        const amp = Math.min(this.stairs ? 0.55 : 0.8, sp / 1.1);
        p.rotation.set(0, this.yaw, 0);
        poseGait(p, this.phase, amp, t, this.stairs ? clamp01(sp * 2) : clamp01(_a.y * 3));
        this.reach(U.arms[0], grab, ease((k - 0.55) / 0.35), false);
        this.look(_b.copy(door), 0.6);
      } else {
        const c = ease5((tb - this.climbT) / ENTER);
        U.bag.visible = c < 0.45; // pose la sacoche à ses pieds avant de s'asseoir (sinon elle dépasse de la cabine)
        const from = this.boardCurve.getPointAt(1, _a).applyMatrix4(M.matrixWorld);
        const seat = this.toWorld(this.seatLocal, _b, false);
        seat.y -= PELVIS_Y;
        p.position.lerpVectors(from, seat, ease((c - 0.12) / 0.88));
        this.yaw = lerp(yawIn, yawIn + ((((yawFwd - yawIn + Math.PI) % TAU) + TAU) % TAU - Math.PI), ease((c - 0.35) / 0.6));
        p.rotation.set(0, this.yaw, 0);
        this.poseEnter(c, t);
        this.reach(U.arms[0], grab, 1 - ease((c - 0.35) / 0.2), false);
      }
    } else if (t < T4) {
      // ----- assis, tire la porte qui claque -----
      const kc = (t - T3) / CLOSE;
      U.bag.visible = false;
      // assis à sa place (même si une saccade a sauté la phase d'entrée)
      this.toWorld(this.seatLocal, p.position, false).y -= PELVIS_Y;
      p.rotation.set(0, yawFwd, 0);
      doorAngle = -DOOR_MAX * (1 - ease(kc ** 1.3)) + 0.03 * Math.sin(Math.PI * clamp01((kc - 0.9) / 0.1));
      this.hinge.rotation.y = doorAngle;
      this.hinge.updateMatrixWorld(true);
      this.poseEnter(1, t);
      this.reach(U.arms[0], this.hinge.localToWorld(_b.copy(this.handleIn)), ease(kc / 0.15) * (1 - ease((kc - 0.7) / 0.3)), false);
    }
    if (t >= T4 && !this.kicked) { this.kicked = true; this.kick = 1; }
    this.hinge.rotation.y = t >= T4 ? 0 : doorAngle;
    if (this.skin && p.visible) {
      this.skin.update(p);
      if (this.goal) this.skin.reachRight(this.goal.p, this.goal.w);
      this.goal = null;
      // la sacoche suit la vraie main du modèle
      if (U.bag.visible) U.bag.position.copy(U.arms[1].hand.worldToLocal(this.skin.leftHand(_w1))).add(_w2.set(0, -0.03, 0));
    }
    if (p.visible && U.bag.visible) this.hangBag(bagSwing);

    // ----- caméra : quatre plans, puis fondu vers la vue de poursuite -----
    const pos = new THREE.Vector3(), look = new THREE.Vector3();
    const head = U.head.getWorldPosition(new THREE.Vector3());
    let shot, focal, hand, wPos, wLook;
    if (t < cutA) {
      // 1. plan large fixe, bas, téléobjectif : le pilote traverse le cadre devant l'avion ; l'opérateur panote
      shot = 1; focal = 24; hand = 0.004; wPos = 30; wLook = 2.6;
      this.shotPos(this.shot1, pos).addScaledVector(_a.copy(this.walkDir).transformDirection(M.matrixWorld), 0.1 * t);
      look.copy(p.position).setY(p.position.y + 1.1).lerp(_b.copy(door).addScaledVector(fwd, -1.2), 0.45);
    } else if (t < T1) {
      // 2. caméra épaule qui le suit et découvre la porte
      shot = 2; focal = 30; hand = 0.014; wPos = 2.4; wLook = 3;
      const hd = _a.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      pos.copy(p.position).addScaledVector(hd, -2.6).addScaledVector(left, 0.7).setY(p.position.y + 1.6);
      look.copy(p.position).addScaledVector(hd, 1.2).setY(p.position.y + 1.3).lerp(door, 0.3 + 0.4 * ease((t - cutA) / (T1 - cutA)));
    } else if (t < T2) {
      // 3. plan rapproché : la main sur la poignée, la porte qui s'ouvre (léger travelling avant)
      shot = 3; focal = 28; hand = 0.009; wPos = 30; wLook = 4;
      this.shotPos(this.shot3, pos).lerp(door, 0.12 * ease((t - T1) / OPEN));
      look.copy(head).lerp(this.hinge.localToWorld(_a.copy(this.handleOut)), 0.45);
    } else {
      // 4. plan large de trois quarts arrière : il monte, se baisse, entre ; la porte claque (travelling + grue)
      shot = 4; focal = 35; hand = 0.006; wPos = 30; wLook = 2.2;
      const k = clamp01((t - T2) / (T4 - T2));
      this.shotPos(this.shot4, pos).lerp(door, 0.15 * ease(k)).y += 0.25 * ease(k);
      look.copy(door).setY(door.y - 0.1);
      if (p.visible) look.lerp(head, 0.35);
    }
    // plan 4 : voir la porte et aussi le pilote qui monte (souvent derrière une aile ou une nacelle)
    if (shot !== this.shot) this.fix = this.clearShot(pos, shot === 4 ? [look, this.toWorld(this.boardCurve.getPointAt(0.5, new THREE.Vector3()), new THREE.Vector3(), false).setY(door.y - 0.2)] : [look], left);
    pos.add(this.fix);
    this.avoid(pos, look);
    pos.y = Math.max(pos.y, Math.max(this.groundY, this.ctx.ground(pos.x, pos.z)) + 0.25);
    if (shot !== this.shot) {
      // coupe franche
      this.shot = shot;
      this.camPos.copy(pos); this.camLook.copy(look);
      this.camVel.set(0, 0, 0); this.lookVel.set(0, 0, 0);
      cam.setFocalLength(focal);
      this.shotFov = cam.fov;
    }
    smoothDamp(this.camPos, this.camVel, pos, wPos, dt);
    smoothDamp(this.camLook, this.lookVel, look, wLook, dt);
    this.kick *= Math.exp(-dt * 7);
    const fade = t >= T4 ? 1 - ease((t - T4) / BLEND) : 1;
    const shake = _a.set(wob(t, 1.1), wob(t + 11, 0.9), wob(t + 23, 1.3)).multiplyScalar(hand * fade);
    shake.y += 0.025 * this.kick * Math.sin(t * 38);
    const roll = (wob(t + 5, 0.7) * hand * 0.4 + 0.006 * this.kick * Math.sin(t * 31)) * fade;
    const placeShot = () => {
      cam.position.copy(this.camPos).add(shake);
      cam.lookAt(_b.copy(this.camLook).addScaledVector(shake, 1.6));
      cam.rotateZ(roll);
    };
    if (t >= T4) {
      const k = ease5((t - T4) / BLEND);
      cam.fov = this.baseFov;
      cam.updateProjectionMatrix();
      this.ctx.rig.update(dt, this.plane, this.mesh, { motion: false, shake: 0 });
      const tq = _q3.copy(cam.quaternion), tp = _d.copy(cam.position), tf = cam.fov;
      placeShot();
      // trajectoire en arc autour de l'avion (jamais à travers la dérive ou les ailes)
      const C = M.getWorldPosition(_r), sp = cam.position;
      const a0 = Math.atan2(sp.x - C.x, sp.z - C.z), a1 = Math.atan2(tp.x - C.x, tp.z - C.z);
      const a = a0 + ((((a1 - a0 + Math.PI) % TAU) + TAU) % TAU - Math.PI) * k;
      const rr = lerp(Math.hypot(sp.x - C.x, sp.z - C.z), Math.hypot(tp.x - C.x, tp.z - C.z), k) + Math.sin(Math.PI * k) * 2.5;
      const yy = lerp(sp.y, tp.y, k) + Math.sin(Math.PI * k) * 0.8;
      sp.set(C.x + Math.sin(a) * rr, yy, C.z + Math.cos(a) * rr);
      cam.quaternion.slerp(tq, k);
      cam.fov = lerp(this.shotFov, tf, k);
      cam.updateProjectionMatrix();
      if (t >= T5) this.finish();
    } else {
      placeShot();
    }
    this.fx.style.opacity = String(1 - ease(t / 0.8));
    this.vig.style.opacity = String(fade);
  }

  stop() {
    const drop = (o) => { if (!o) return; o.removeFromParent(); o.traverse((c) => { c.geometry?.dispose(); c.material?.dispose?.(); }); };
    drop(this.stairs); this.stairs = null;
    drop(this.hinge); this.hinge = null;
    drop(this.hole); this.hole = null;
    if (this.mesh?.userData.pilot) this.mesh.userData.pilot.visible = true;
    if (this.active && this.baseFov) { this.ctx.camera.fov = this.baseFov; this.ctx.camera.updateProjectionMatrix(); }
    this.pilot.visible = false;
    this.bars.classList.add('hidden');
    this.fx.style.display = this.vig.style.display = 'none';
    if (this.skip) { removeEventListener('keydown', this.skip, true); removeEventListener('pointerdown', this.skip, true); this.skip = null; }
    this.active = false;
  }
  finish() {
    if (!this.active) return;
    this.stop();
    this.onDone?.();
  }
}
