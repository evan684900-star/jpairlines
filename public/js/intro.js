// Cinématique de début de partie : le pilote marche vers l'avion (la caméra tourne autour de lui), ouvre la porte,
// monte à bord, la porte se referme et la caméra rejoint doucement la vue de poursuite.
// Une touche, un clic ou un bouton de manette la passe.
import * as THREE from 'three';
import { t as tr } from './i18n.js';

const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const lerp = THREE.MathUtils.lerp;
// durées des phases (s)
const OPEN = 1.0, BOARD = 1.5, CLOSE = 0.7, BLEND = 1.8;

// ----- Le pilote : petit personnage en formes simples, articulé aux épaules, hanches et genoux -----
function buildPilot() {
  const g = new THREE.Group();
  const M = (color, rough = 0.8) => new THREE.MeshStandardMaterial({ color, roughness: rough });
  const suit = M(0x1f3a5f), skin = M(0xe0b08a, 0.7), boot = M(0x2a1d14, 0.6), cap = M(0xf2f2ee, 0.6), dark = M(0x111111, 0.35), gold = M(0xd4af37, 0.4);
  const mesh = (geo, mat, x, y, z, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
  // jambes : hanche → cuisse → genou → mollet → botte
  const legs = [-1, 1].map((s) => {
    const hip = new THREE.Group(); hip.position.set(s * 0.11, 0.92, 0); g.add(hip);
    mesh(new THREE.CapsuleGeometry(0.075, 0.32, 4, 10), suit, 0, -0.22, 0, hip);
    const knee = new THREE.Group(); knee.position.set(0, -0.45, 0); hip.add(knee);
    mesh(new THREE.CapsuleGeometry(0.065, 0.3, 4, 10), suit, 0, -0.2, 0, knee);
    mesh(new THREE.BoxGeometry(0.12, 0.09, 0.26), boot, 0, -0.42, 0.05, knee);
    return { hip, knee };
  });
  // buste, ceinture, col
  mesh(new THREE.CapsuleGeometry(0.17, 0.36, 4, 12), suit, 0, 1.22, 0).scale.set(1.05, 1, 0.75);
  mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 14), dark, 0, 0.98, 0).scale.set(1.05, 1, 0.78);
  mesh(new THREE.BoxGeometry(0.06, 0.04, 0.02), gold, -0.08, 1.36, 0.13); // insigne « ailes »
  // bras : épaule → avant-bras → main
  const arms = [-1, 1].map((s) => {
    const sh = new THREE.Group(); sh.position.set(s * 0.23, 1.42, 0); g.add(sh);
    mesh(new THREE.CapsuleGeometry(0.06, 0.24, 4, 10), suit, 0, -0.16, 0, sh);
    const el = new THREE.Group(); el.position.set(0, -0.33, 0); sh.add(el);
    mesh(new THREE.CapsuleGeometry(0.055, 0.22, 4, 10), suit, 0, -0.14, 0, el);
    mesh(new THREE.SphereGeometry(0.055, 10, 8), skin, 0, -0.3, 0, el);
    return { sh, el };
  });
  // tête : visage, casquette de pilote avec visière, lunettes de soleil
  const head = new THREE.Group(); head.position.set(0, 1.62, 0); g.add(head);
  mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.08, 10), skin, 0, -0.06, 0, head);
  mesh(new THREE.SphereGeometry(0.115, 16, 12), skin, 0, 0.07, 0, head).scale.set(0.92, 1.05, 0.95);
  mesh(new THREE.CylinderGeometry(0.125, 0.12, 0.08, 16), cap, 0, 0.17, 0, head);
  mesh(new THREE.CylinderGeometry(0.128, 0.128, 0.025, 16), dark, 0, 0.135, 0, head);
  mesh(new THREE.BoxGeometry(0.2, 0.015, 0.09), dark, 0, 0.13, 0.13, head);
  mesh(new THREE.BoxGeometry(0.035, 0.025, 0.01), gold, 0, 0.18, 0.124, head);
  mesh(new THREE.BoxGeometry(0.17, 0.035, 0.02), dark, 0, 0.08, 0.1, head);
  g.userData = { legs, arms, head };
  return g;
}

// pose de marche (phase en radians, amp 0 = immobile)
function poseWalk(p, phase, amp) {
  const { legs, arms } = p.userData;
  legs.forEach(({ hip, knee }, i) => {
    const s = Math.sin(phase + i * Math.PI);
    hip.rotation.x = s * 0.55 * amp;
    knee.rotation.x = Math.max(0, -Math.cos(phase + i * Math.PI)) * 0.8 * amp;
  });
  arms.forEach(({ sh, el }, i) => {
    sh.rotation.set(-Math.sin(phase + i * Math.PI) * 0.45 * amp, 0, (i ? -1 : 1) * 0.08);
    el.rotation.x = -0.25 * amp;
  });
  p.position.y += Math.abs(Math.sin(phase)) * 0.035 * amp;
}

export class Intro {
  // ctx : { scene, camera, rig, ground(x, z) }
  constructor(ctx) {
    this.ctx = ctx;
    this.active = false;
    this.pilot = buildPilot();
    this.pilot.visible = false;
    ctx.scene.add(this.pilot);
    this.bars = document.createElement('div');
    this.bars.id = 'cine';
    this.bars.className = 'hidden';
    document.body.append(this.bars);
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.tmp = new THREE.Vector3();
  }

  // trouve la porte : un rayon tiré depuis la gauche de l'avion vers le siège du pilote
  findDoor(mesh) {
    const eye = mesh.userData.eye || new THREE.Vector3(0, 1, 0);
    mesh.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
    const dir = new THREE.Vector3(1, 0, 0).transformDirection(mesh.matrixWorld);
    // seulement les vraies pièces de l'avion (pas les feux, halos et autres sprites)
    const parts = [];
    mesh.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && o.visible && !o.userData.noDoor && !o.material?.transparent) parts.push(o); });
    // trois rayons côte à côte : la paroi du fuselage est touchée par les trois au même endroit, un hauban fin non
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
    // hauteur (repère de l'avion) de la surface sous un point : aile, sinon null
    const down = new THREE.Vector3(0, -1, 0).transformDirection(mesh.matrixWorld);
    const surfaceAt = (x, z) => {
      ray.set(new THREE.Vector3(x, eye.y + 3, z).applyMatrix4(mesh.matrixWorld), down);
      ray.far = 8;
      const h = ray.intersectObjects(parts, false)[0];
      return h ? h.point.clone().applyMatrix4(inv).y : null;
    };
    return { local, eye, mat: hit?.object.material, surfaceAt, inv };
  }

  start(plane, mesh, onDone) {
    this.stop();
    this.onDone = onDone;
    this.plane = plane;
    this.mesh = mesh;
    const { local, eye, mat, surfaceAt, inv } = this.findDoor(mesh);
    this.eye = eye;
    // porte : panneau articulé sur son bord avant (vers le nez = -z), qui s'ouvre vers l'extérieur
    const doorMat = (Array.isArray(mat) ? mat[0] : mat)?.clone?.() || new THREE.MeshStandardMaterial({ color: 0xdddddd });
    doorMat.side = THREE.DoubleSide;
    const w = 0.85, h = 0.85;
    this.hinge = new THREE.Group();
    this.hinge.position.set(local.x - 0.025, local.y, local.z - w / 2);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.03, h, w), doorMat);
    panel.position.set(0, 0, w / 2);
    panel.userData.noDoor = true;
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.035, h * 0.42, w * 0.7), new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.1, metalness: 0.3 }));
    glass.position.set(0, h * 0.2, w / 2);
    this.hinge.add(panel, glass);
    mesh.add(this.hinge);
    // trajet du pilote (repère de l'avion) : part de l'arrière gauche et s'arrête devant la porte
    this.doorLocal = local.clone();
    this.groundY = this.ctx.ground(plane.pos.x, plane.pos.z); // sol de la piste sous l'avion
    const wy = (y) => new THREE.Vector3(0, y, 0).applyMatrix4(mesh.matrixWorld).y; // hauteur monde (avion presque à plat)
    const groundLocalY = this.groundY - wy(0) + 0; // décalage sol ↔ repère de l'avion
    // aile basse sous ce point : surface large (trois rayons voisins au même niveau, donc pas un hauban)
    // à moins de 1,9 m du sol, sous laquelle on ne peut pas passer debout
    const wingAt = (x, z) => {
      const ys = [-0.25, 0, 0.25].map((dz) => surfaceAt(x, z + dz));
      if (ys.some((y) => y === null)) return null;
      const h = wy(ys[1]) - this.groundY;
      return h > 0.25 && h < 1.9 && Math.max(...ys) - Math.min(...ys) < 0.35 ? ys[1] : null;
    };
    const isWing = (y) => y !== null;
    // départ à l'arrière gauche, ou à l'avant si une aile basse barre le chemin direct
    let start = new THREE.Vector3(local.x - 7.5, 0, local.z + 4.5);
    const end0 = new THREE.Vector3(local.x - 0.75, 0, local.z - 0.05);
    const blocked = (a) => [0.3, 0.45, 0.6, 0.75, 0.9].some((f) => wingAt(lerp(a.x, end0.x, f), lerp(a.z, end0.z, f)) !== null);
    const under = wingAt(local.x - 0.9, local.z);
    if (under === null && blocked(start)) start = new THREE.Vector3(local.x - 7.5, 0, local.z - 4.5);
    const path = [{ p: start, ground: true }];
    this.stairs = null;
    if (isWing(under)) {
      // aile basse : on contourne le bord de fuite, on monte sur l'aile et on marche jusqu'à la porte
      let zTE = local.z + 4;
      for (let dz = 0; dz < 4; dz += 0.15) if (!isWing(wingAt(local.x - 0.9, local.z + dz))) { zTE = local.z + dz; break; }
      const onWing = (x, z) => new THREE.Vector3(x, (surfaceAt(x, z) ?? under) + 0.02, z);
      path.push({ p: new THREE.Vector3(local.x - 1.2, 0, zTE + 0.7), ground: true });
      path.push({ p: onWing(local.x - 0.95, zTE - 0.3), ground: false });
      path.push({ p: onWing(local.x - 0.6, local.z + 0.3), ground: false });
    } else {
      path.push({ p: end0, ground: true });
      // porte haute (jet, bimoteur) : petit escabeau
      const sill = wy(local.y - 0.45) - this.groundY;
      if (sill > 0.55) {
        const n = Math.ceil(sill / 0.24), steps = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.5, metalness: 0.6 });
        for (let i = 0; i < n; i++) {
          const st = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.7), m);
          st.position.set(local.x - 0.2 - (n - 1 - i) * 0.26, groundLocalY + (i + 1) * (sill / n), local.z - 0.05);
          st.castShadow = true;
          steps.add(st);
        }
        mesh.add(steps);
        this.stairs = steps;
        // le pilote s'arrête au pied de l'escabeau
        path[path.length - 1].p = new THREE.Vector3(local.x - 0.55 - n * 0.26, 0, local.z - 0.05);
      }
    }
    this.path = path;
    mesh.updateMatrixWorld(true);
    let len = 0;
    const pts = path.map((w) => this.toWorld(w.p, new THREE.Vector3(), w.ground));
    for (let i = 1; i < pts.length; i++) len += pts[i].distanceTo(pts[i - 1]);
    this.walkT = Math.min(7, Math.max(3.5, len / 1.45));
    this.t = 0;
    this.active = true;
    this.pilot.visible = true;
    this.pilot.scale.setScalar(1);
    this.pilot.userData.head.rotation.set(0, 0, 0);
    this.bars.innerHTML = `<span>${tr('Appuie sur une touche pour passer ▸')}</span>`;
    this.bars.classList.remove('hidden');
    // passer la cinématique : n'importe quelle touche ou clic (au bout d'un court instant)
    this.skip = (e) => {
      if (this.t <= 0.4) return;
      e.stopImmediatePropagation(); // la touche ne pilote pas l'avion
      this.finish();
    };
    addEventListener('keydown', this.skip, true);
    addEventListener('pointerdown', this.skip, true);
  }

  // point du repère de l'avion → monde, posé au sol
  toWorld(v, out, onGround = true) {
    out.copy(v).applyMatrix4(this.mesh.matrixWorld);
    if (onGround) out.y = Math.max(this.groundY, this.ctx.ground(out.x, out.z));
    return out;
  }

  // dt : pas de temps ; anyPad : un bouton de manette vient d'être appuyé
  update(dt, anyPad) {
    if (!this.active) return;
    if (anyPad && this.t > 0.4) { this.finish(); return; }
    this.t += dt;
    const t = this.t, p = this.pilot, cam = this.ctx.camera;
    this.mesh.updateMatrixWorld(true);
    const pts = this.path.map((w) => this.toWorld(w.p, new THREE.Vector3(), w.ground));
    const b = pts[pts.length - 1];
    const door = this.toWorld(this.doorLocal, new THREE.Vector3(), false);
    const fwd = new THREE.Vector3(0, 0, -1).transformDirection(this.mesh.matrixWorld).setY(0).normalize();
    const left = new THREE.Vector3(-1, 0, 0).transformDirection(this.mesh.matrixWorld).setY(0).normalize();
    const T1 = this.walkT, T2 = T1 + OPEN, T3 = T2 + BOARD, T4 = T3 + CLOSE, T5 = T4 + BLEND;
    let doorAngle = 0;

    if (t < T1) {
      // marche (accélère au départ, ralentit à l'arrivée)
      const k = t / T1;
      const s = k < 0.15 ? (k * k) / 0.3 : k > 0.85 ? 1 - ((1 - k) * (1 - k)) / 0.3 : (k - 0.075) / 0.85;
      // position le long du trajet (longueur parcourue)
      const segs = pts.slice(1).map((q, i) => q.distanceTo(pts[i]));
      let d = s * segs.reduce((n, x) => n + x, 0), i = 0;
      while (i < segs.length - 1 && d > segs[i]) d -= segs[i++];
      p.position.lerpVectors(pts[i], pts[i + 1], Math.min(1, d / (segs[i] || 1)));
      const dir = this.tmp.subVectors(pts[i + 1], pts[i]);
      p.rotation.set(0, Math.atan2(dir.x, dir.z), 0);
      poseWalk(p, t * 7.5, k > 0.92 ? (1 - k) / 0.08 : Math.min(1, t * 3));
    } else if (t < T2) {
      // se tourne vers la porte et l'ouvre
      const k = (t - T1) / OPEN;
      p.position.copy(b);
      const toDoor = this.tmp.subVectors(door, b);
      p.rotation.set(0, Math.atan2(toDoor.x, toDoor.z), 0);
      poseWalk(p, 0, 0);
      const arm = p.userData.arms[1];
      arm.sh.rotation.x = -1.3 * ease(Math.min(1, k * 2.5)) * (k > 0.8 ? (1 - k) / 0.2 : 1);
      doorAngle = -1.75 * ease((k - 0.25) / 0.75);
    } else if (t < T3) {
      // monte à bord : vers la porte, puis vers le siège
      const k = (t - T2) / BOARD;
      doorAngle = -1.75;
      const seat = this.toWorld(this.eye.clone().setY(this.eye.y - 0.6), new THREE.Vector3(), false);
      // le seuil de la porte, juste devant la paroi
      const sill = door.clone().addScaledVector(left, 0.25).setY(Math.max(b.y, door.y - 0.45));
      // se baisse pour que la tête passe sous le haut de la porte
      const roof = door.y + 0.55;
      const duck = Math.min(1, Math.max(0.55, (roof - p.position.y) / 1.78));
      if (k < 0.45) {
        p.position.lerpVectors(b, sill, ease(k / 0.45));
        poseWalk(p, k * 14, 0.8);
        p.scale.set(1, lerp(1, duck, ease(k / 0.45)), 1);
      } else {
        // se baisse et se glisse à l'intérieur vers le siège
        const c = ease((k - 0.45) / 0.55);
        p.position.lerpVectors(sill, seat.setY(sill.y - 0.25), c);
        poseWalk(p, 0, 0);
        p.userData.legs.forEach(({ hip, knee }) => { hip.rotation.x = -1.4 * c; knee.rotation.x = 1.4 * c; });
        p.userData.head.rotation.x = 0.4 * c;
        p.scale.set(1, duck * (1 - 0.3 * c), 1);
      }
      if (k > 0.7) p.visible = false;
    } else if (t < T4) {
      p.visible = false;
      doorAngle = -1.75 * (1 - ease((t - T3) / CLOSE));
    } else {
      p.visible = false;
      doorAngle = 0;
    }
    this.hinge.rotation.y = doorAngle;

    // ----- caméra -----
    let pos, look;
    if (t < T1) {
      // tourne autour du pilote, toujours du côté extérieur (jamais dans l'avion)
      const ang = lerp(1.15, -0.85, ease(t / T1));
      const r = 3.6 - t * 0.12;
      const out = left.clone().multiplyScalar(Math.cos(ang)).addScaledVector(fwd, Math.sin(ang));
      pos = p.position.clone().addScaledVector(out, r).setY(p.position.y + 1.45 + Math.sin(t * 0.6) * 0.15);
      look = p.position.clone().setY(p.position.y + 1.15);
    } else {
      // plan large de côté sur la porte
      pos = door.clone().addScaledVector(left, 7.5).addScaledVector(fwd, 3).setY(this.groundY + 1.25);
      look = door.clone().setY(door.y - 0.2);
    }
    if (t <= dt) { this.camPos.copy(pos); this.camLook.copy(look); }
    this.camPos.lerp(pos, t < T1 ? 1 : 1 - Math.exp(-dt * 3));
    this.camLook.lerp(look, t < T1 ? 1 : 1 - Math.exp(-dt * 3));
    if (t >= T4) {
      // dernière phase : la caméra de jeu calcule sa vue, on y glisse doucement
      this.ctx.rig.update(dt, this.plane, this.mesh, { motion: false, shake: 0 });
      const k = ease((t - T4) / BLEND);
      const tq = cam.quaternion.clone(), tp = cam.position.clone();
      cam.position.copy(this.camPos);
      cam.lookAt(this.camLook);
      cam.position.lerp(tp, k);
      cam.quaternion.slerp(tq, k);
      if (t >= T5) this.finish();
    } else {
      cam.position.copy(this.camPos);
      cam.lookAt(this.camLook);
    }
  }

  stop() {
    if (this.stairs) { this.stairs.removeFromParent(); this.stairs.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); }); this.stairs = null; }
    if (this.hinge) { this.hinge.removeFromParent(); this.hinge.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); }); this.hinge = null; }
    this.pilot.visible = false;
    this.bars.classList.add('hidden');
    if (this.skip) { removeEventListener('keydown', this.skip, true); removeEventListener('pointerdown', this.skip, true); this.skip = null; }
    this.active = false;
  }
  finish() {
    if (!this.active) return;
    this.stop();
    this.onDone?.();
  }
}
