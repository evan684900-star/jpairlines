import * as THREE from 'three';
import { heightAt, onRunway } from './world.js';

// ---------- Modèle 3D de l'avion de base (nez vers -Z) ----------
export function createPlaneMesh(color = 0xe8eef5, accent = 0xd83a2e) {
  const g = new THREE.Group();
  const body = new THREE.MeshLambertMaterial({ color });
  const stripe = new THREE.MeshLambertMaterial({ color: accent });
  const dark = new THREE.MeshLambertMaterial({ color: 0x222831 });
  const glass = new THREE.MeshLambertMaterial({ color: 0x6fb7e0, emissive: 0x112233 });

  const add = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };

  add(new THREE.BoxGeometry(1.3, 1.3, 6), body, 0, 0, 0); // fuselage
  add(new THREE.BoxGeometry(1.0, 0.9, 2.2), body, 0, 0.1, 3.9); // queue
  add(new THREE.BoxGeometry(1.1, 0.7, 1.4), glass, 0, 0.75, -0.8); // cockpit
  add(new THREE.BoxGeometry(10, 0.18, 1.6), body, 0, 0.55, -0.6); // ailes
  add(new THREE.BoxGeometry(1.2, 0.2, 1.62), stripe, 4.4, 0.56, -0.6); // bouts d'ailes
  add(new THREE.BoxGeometry(1.2, 0.2, 1.62), stripe, -4.4, 0.56, -0.6);
  add(new THREE.BoxGeometry(3.6, 0.12, 0.9), body, 0, 0.3, 4.7); // stabilisateur
  add(new THREE.BoxGeometry(0.15, 1.5, 1.0), stripe, 0, 1.1, 4.7); // dérive
  add(new THREE.BoxGeometry(1.32, 0.25, 6.02), stripe, 0, -0.1, 0); // bande
  add(new THREE.BoxGeometry(0.7, 0.7, 0.4), dark, 0, 0, -3.15); // capot moteur

  // train d'atterrissage
  const wheel = new THREE.CylinderGeometry(0.32, 0.32, 0.2, 10).rotateZ(Math.PI / 2);
  add(wheel, dark, 0.9, -1.2, -0.8);
  add(wheel, dark, -0.9, -1.2, -0.8);
  add(wheel, dark, 0, -1.2, -2.6);
  add(new THREE.BoxGeometry(0.08, 0.6, 0.08), dark, 0.9, -0.8, -0.8);
  add(new THREE.BoxGeometry(0.08, 0.6, 0.08), dark, -0.9, -0.8, -0.8);
  add(new THREE.BoxGeometry(0.08, 0.6, 0.08), dark, 0, -0.8, -2.6);

  // hélice
  const prop = new THREE.Group();
  prop.position.set(0, 0, -3.4);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.6, 0.06), dark);
  const blade2 = blade.clone();
  blade2.rotation.z = Math.PI / 2;
  prop.add(blade, blade2);
  g.add(prop);
  g.userData.prop = prop;
  return g;
}

// ---------- Physique arcade ----------
export const SPECS = {
  name: 'Cub-1 (avion de base)',
  thrust: 9, // m/s² à plein gaz
  drag: 9 / (65 * 65), // vitesse max ~65 m/s (~235 km/h) en palier
  stall: 22, // vitesse de décrochage (m/s)
  rotate: 25, // vitesse de rotation au décollage
  pitchRate: 0.8,
  rollRate: 1.8,
  yawRate: 0.45,
  gear: 1.55, // hauteur des roues sous le centre
};

const FWD = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const AX = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };

export class Plane {
  constructor() {
    this.pos = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.speed = 0;
    this.vy = 0;
    this.throttle = 0;
    this.onGround = true;
    this.crashed = false;
    this.crashReason = '';
    this.velocity = new THREE.Vector3();
    this.landedAt = null; // aéroport où l'avion est arrêté
  }

  placeOnRunway(a) {
    // en bout de piste, face à la piste (léger décalage pour ne pas se superposer aux autres joueurs)
    const back = 480 + Math.random() * 150;
    const side = (Math.random() - 0.5) * 20;
    const s = Math.sin(a.heading), c = Math.cos(a.heading);
    this.pos.set(a.x - s * back + c * side, 0, a.z + c * back + s * side);
    this.pos.y = heightAt(this.pos.x, this.pos.z) + SPECS.gear;
    this.quat.setFromEuler(new THREE.Euler(0, -a.heading, 0, 'YXZ'));
    this.speed = 0;
    this.vy = 0;
    this.throttle = 0;
    this.onGround = true;
    this.crashed = false;
    this.landedAt = a;
  }

  get euler() {
    return tmpE.setFromQuaternion(this.quat, 'YXZ');
  }

  // heading en degrés (0 = nord = -Z, sens horaire)
  get headingDeg() {
    const h = (-THREE.MathUtils.radToDeg(this.euler.y)) % 360;
    return (h + 360) % 360;
  }

  rotateLocal(axis, angle) {
    tmpQ.setFromAxisAngle(AX[axis], angle);
    this.quat.multiply(tmpQ);
  }

  update(dt, input) {
    if (this.crashed) return;
    const S = SPECS;

    // gaz
    this.throttle = THREE.MathUtils.clamp(this.throttle + input.throttle * dt * 0.6, 0, 1);

    FWD.set(0, 0, -1).applyQuaternion(this.quat);

    // vitesse le long de l'axe de l'avion
    let acc = this.throttle * S.thrust - S.drag * this.speed * this.speed - 9.81 * FWD.y;
    if (this.onGround) acc -= input.brake ? 7 : 0.4;
    this.speed = Math.max(0, this.speed + acc * dt);

    const eff = THREE.MathUtils.clamp(this.speed / 30, 0, 1); // efficacité des gouvernes

    if (this.onGround) {
      // roulage : direction au palonnier
      const steer = Math.min(1, this.speed / 6);
      this.rotateLocal('y', -input.yaw * 0.9 * steer * dt);
      if (this.speed > S.rotate) this.rotateLocal('x', input.pitch * S.pitchRate * 0.6 * eff * dt);
    } else {
      this.rotateLocal('x', input.pitch * S.pitchRate * eff * dt);
      this.rotateLocal('z', -input.roll * S.rollRate * eff * dt);
      this.rotateLocal('y', -input.yaw * S.yawRate * eff * dt);

      // virage coordonné : l'inclinaison fait tourner l'avion
      const e = this.euler;
      // stabilité : sans action sur le manche, les ailes reviennent doucement à plat
      if (Math.abs(input.roll) < 0.1 && Math.abs(e.z) < 1.4) this.rotateLocal('z', -e.z * 0.7 * Math.min(eff, 1) * dt);
      tmpQ.setFromAxisAngle(UP, Math.sin(e.z) * 0.55 * Math.min(eff, 1) * dt);
      this.quat.premultiply(tmpQ);

      // décrochage : le nez tombe
      const stallAmt = THREE.MathUtils.clamp(1 - this.speed / S.stall, 0, 1);
      if (stallAmt > 0) this.rotateLocal('x', -stallAmt * 0.9 * dt * Math.sign(Math.cos(e.z) || 1));
    }
    this.quat.normalize();

    // portance insuffisante -> on s'enfonce
    const lift = THREE.MathUtils.clamp(this.speed / S.stall, 0, 1);
    const sinkTarget = (1 - lift * lift) * 30;
    this.vy += (-sinkTarget - this.vy) * Math.min(1, dt * 1.5);

    FWD.set(0, 0, -1).applyQuaternion(this.quat);
    this.velocity.copy(FWD).multiplyScalar(this.speed);
    this.velocity.y += this.vy;
    this.pos.addScaledVector(this.velocity, dt);

    // collision sol / eau
    let ground = heightAt(this.pos.x, this.pos.z);
    const water = ground < 0;
    if (water) ground = 0;

    if (this.pos.y <= ground + S.gear) {
      const e = this.euler;
      if (!this.onGround) {
        const vs = this.velocity.y;
        if (water) return this.crash("Amerrissage forcé ! Cet avion n'a pas de flotteurs.");
        if (vs < -7) return this.crash(`Atterrissage trop brutal (${(-vs).toFixed(1)} m/s)`);
        if (Math.abs(e.z) > 0.45) return this.crash('Une aile a touché le sol');
        if (e.x < -0.2) return this.crash('Le nez a percuté le sol');
        if (this.speed > 60) return this.crash('Beaucoup trop rapide pour atterrir');
      } else if (water) {
        return this.crash("Tu as roulé dans l'eau !");
      }
      this.onGround = true;
      this.pos.y = ground + S.gear;
      this.vy = 0;
      // on garde le cap, on remet les ailes à plat
      let pitch = e.x;
      if (this.speed < S.rotate) pitch = Math.max(0, pitch - dt * 0.5);
      pitch = THREE.MathUtils.clamp(pitch, 0, 0.3);
      this.quat.setFromEuler(tmpE.set(pitch, e.y, 0, 'YXZ'));
    } else if (this.pos.y > ground + S.gear + 0.5) {
      this.onGround = false;
    }

    // arrêté sur une piste ?
    this.landedAt = this.onGround && this.speed < 3 ? onRunway(this.pos.x, this.pos.z) : null;
  }

  crash(reason) {
    this.crashed = true;
    this.crashReason = reason;
    this.speed = 0;
    this.throttle = 0;
  }
}
