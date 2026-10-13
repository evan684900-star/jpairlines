import * as THREE from 'three';
import { groundHeight, onRunway, runwayPoint } from './world.js';

export { createPlaneMesh, animatePlaneMesh } from './planeModel.js';

// ---------- Caractéristiques ----------
export const SPECS = {
  name: 'Cub-1',
  thrust: 4.3, // m/s² à plein gaz
  drag: 4.3 / (68 * 68), // vitesse max ~68 m/s (245 km/h) en palier, train rentré
  stall: 23, // m/s, volets rentrés
  rotate: 25,
  pitchRate: 0.8,
  rollRate: 1.8,
  yawRate: 0.45,
  gear: 1.55, // hauteur du centre au-dessus du sol, train sorti
  belly: 0.7, // idem, train rentré
  fuelCapacity: 160, // litres
  burnIdle: 0.015, // L/s au ralenti
  burnMax: 0.11, // L/s plein gaz (~25 min d'autonomie)
  vFlaps: 46, // vitesse max volets sortis (m/s, ~165 km/h)
  vGear: 58, // vitesse max train sorti (m/s, ~210 km/h)
  flapNotches: [0, 10, 20, 30], // degrés
};

export const DIFFICULTY = {
  easy: { autoLevel: 1, crashVs: 10, damage: false, autoEngine: true },
  normal: { autoLevel: 0.7, crashVs: 7, damage: true, autoEngine: false },
  realistic: { autoLevel: 0, crashVs: 4.5, damage: true, autoEngine: false },
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
    this.velocity = new THREE.Vector3();
    this.events = [];
    this.reset();
    this.fuel = SPECS.fuelCapacity;
  }

  reset() {
    this.speed = 0;
    this.vy = 0;
    this.throttle = 0;
    this.rpm = 0;
    this.engineOn = false;
    this.engineStart = 0; // compte à rebours du démarreur
    this.flaps = 0; // cran demandé
    this.flapPos = 0; // position réelle (animée)
    this.gearDown = true;
    this.gearPos = 1;
    this.gearBroken = false;
    this.parkingBrake = true;
    this.brake = false;
    this.lights = false;
    this.trim = 0;
    this.onGround = true;
    this.crashed = false;
    this.crashReason = '';
    this.landedAt = null;
    this.ctrl = { pitch: 0, roll: 0, yaw: 0 };
  }

  placeOnRunway(a, engineOn = false) {
    this.reset();
    // en bout de piste, face à la piste (léger décalage pour ne pas se superposer aux autres joueurs)
    const back = a.length / 2 - 60 - Math.random() * 120;
    const side = (Math.random() - 0.5) * a.width * 0.4;
    const [x, z] = runwayPoint(a.x, a.z, a.heading, side, back);
    this.pos.set(x, groundHeight(x, z) + SPECS.gear, z);
    this.quat.setFromEuler(new THREE.Euler(0, a.heading, 0, 'YXZ'));
    this.landedAt = a;
    if (engineOn) { this.engineOn = true; this.rpm = 0.15; }
  }

  get euler() {
    return tmpE.setFromQuaternion(this.quat, 'YXZ');
  }

  // cap en degrés (0 = nord = -Z, sens horaire)
  get headingDeg() {
    return ((-THREE.MathUtils.radToDeg(this.euler.y)) % 360 + 360) % 360;
  }

  get stallSpeed() {
    return SPECS.stall * (1 - 0.09 * this.flapPos);
  }

  rotateLocal(axis, angle) {
    tmpQ.setFromAxisAngle(AX[axis], angle);
    this.quat.multiply(tmpQ);
  }

  emit(msg) { this.events.push(msg); }

  // ----- commandes des systèmes -----
  toggleEngine() {
    if (this.engineOn || this.engineStart > 0) {
      this.engineOn = false;
      this.engineStart = 0;
      this.emit('Moteur coupé');
    } else if (this.fuel <= 0) {
      this.emit('Réservoir vide !');
    } else {
      this.engineStart = 1.6;
      this.emit('Démarrage du moteur…');
    }
  }
  setFlaps(delta) {
    this.flaps = THREE.MathUtils.clamp(this.flaps + delta, 0, SPECS.flapNotches.length - 1);
    this.emit(`Volets ${SPECS.flapNotches[this.flaps]}°`);
  }
  toggleGear() {
    if (this.onGround) return this.emit('Impossible de rentrer le train au sol !');
    if (this.gearBroken) return this.emit('Le train est endommagé…');
    this.gearDown = !this.gearDown;
    this.emit(this.gearDown ? 'Sortie du train' : 'Rentrée du train');
  }
  toggleParking() {
    this.parkingBrake = !this.parkingBrake;
    this.emit(this.parkingBrake ? 'Frein de parking serré' : 'Frein de parking desserré');
  }
  toggleLights() {
    this.lights = !this.lights;
    this.emit(this.lights ? 'Feux allumés' : 'Feux éteints');
  }

  update(dt, input, opts) {
    if (this.crashed) return;
    const S = SPECS;
    const diff = DIFFICULTY[opts.difficulty] || DIFFICULTY.normal;
    this.brake = input.brake;

    // ----- moteur & carburant -----
    if (this.engineStart > 0) {
      this.engineStart -= dt;
      this.rpm = Math.min(0.15, this.rpm + dt * 0.1);
      if (this.engineStart <= 0) { this.engineOn = true; this.emit('Moteur en marche'); }
    }
    this.throttle = THREE.MathUtils.clamp(this.throttle + input.throttle * dt * 0.6, 0, 1);
    if (this.engineOn && opts.fuel) {
      this.fuel = Math.max(0, this.fuel - (S.burnIdle + (S.burnMax - S.burnIdle) * this.throttle) * dt);
      if (this.fuel <= 0) { this.engineOn = false; this.emit('Panne sèche ! Le moteur s\'est arrêté.'); }
    }
    const targetRpm = this.engineOn ? 0.15 + 0.85 * this.throttle : 0;
    this.rpm += (targetRpm - this.rpm) * Math.min(1, dt * (this.engineOn ? 1.8 : 0.6));
    const power = this.engineOn ? Math.max(0, (this.rpm - 0.15) / 0.85) : 0;

    // ----- volets & train (animation) -----
    this.flapPos += THREE.MathUtils.clamp(this.flaps - this.flapPos, -dt * 0.6, dt * 0.6);
    this.gearPos += THREE.MathUtils.clamp((this.gearDown ? 1 : 0) - this.gearPos, -dt / 4, dt / 4);

    // dégâts en survitesse
    if (diff.damage && this.flapPos > 0.2 && this.flaps > 0 && this.speed > S.vFlaps + 8) {
      this.flaps = 0;
      this.emit('Survitesse ! Les volets ont été rentrés de force.');
    }
    if (diff.damage && this.gearPos > 0.3 && this.speed > S.vGear + 12 && !this.gearBroken && !this.onGround) {
      this.gearBroken = true;
      this.gearDown = false;
      this.gearPos = 0;
      this.emit('CRAC ! Le train a été arraché par la vitesse !');
    }

    FWD.set(0, 0, -1).applyQuaternion(this.quat);

    // ----- vitesse le long de l'axe -----
    const dragK = S.drag * (1 + this.gearPos * 0.22 + this.flapPos * 0.16);
    let acc = power * S.thrust - dragK * this.speed * this.speed - 9.81 * FWD.y;
    if (this.onGround) {
      let brk = 0.35; // résistance au roulement
      if (input.brake) brk = 7;
      if (this.parkingBrake) brk = 11;
      acc -= brk;
    }
    this.speed = Math.max(0, this.speed + acc * dt);

    const eff = THREE.MathUtils.clamp(this.speed / 30, 0, 1); // efficacité des gouvernes
    const sens = opts.sensitivity || 1;
    const pitchIn = THREE.MathUtils.clamp(input.pitch * sens + this.trim, -1, 1);
    const k = Math.min(1, dt * 8);
    this.ctrl.pitch += (pitchIn - this.ctrl.pitch) * k;
    this.ctrl.roll += (THREE.MathUtils.clamp(input.roll * sens, -1, 1) - this.ctrl.roll) * k;
    this.ctrl.yaw += (input.yaw - this.ctrl.yaw) * k;
    const stall = this.stallSpeed;

    if (this.onGround) {
      const steer = Math.min(1, this.speed / 6);
      this.rotateLocal('y', -this.ctrl.yaw * 0.9 * steer * dt);
      if (this.speed > S.rotate * (1 - 0.06 * this.flapPos)) this.rotateLocal('x', this.ctrl.pitch * S.pitchRate * 0.6 * eff * dt);
    } else {
      this.rotateLocal('x', (this.ctrl.pitch * S.pitchRate + this.flapPos * 0.015) * eff * dt);
      this.rotateLocal('z', -this.ctrl.roll * S.rollRate * eff * dt);
      this.rotateLocal('y', -this.ctrl.yaw * S.yawRate * eff * dt);

      const e = this.euler;
      // stabilité : sans action sur le manche, les ailes reviennent doucement à plat
      if (diff.autoLevel && Math.abs(input.roll) < 0.1 && Math.abs(e.z) < 1.4) this.rotateLocal('z', -e.z * 0.7 * diff.autoLevel * eff * dt);
      // virage coordonné : l'inclinaison fait tourner l'avion
      tmpQ.setFromAxisAngle(UP, Math.sin(e.z) * 0.55 * eff * dt);
      this.quat.premultiply(tmpQ);
      // décrochage : le nez tombe
      const stallAmt = THREE.MathUtils.clamp(1 - this.speed / stall, 0, 1);
      if (stallAmt > 0) this.rotateLocal('x', -stallAmt * 0.9 * dt * Math.sign(Math.cos(e.z) || 1));
    }
    this.quat.normalize();

    // portance insuffisante -> on s'enfonce
    const lift = THREE.MathUtils.clamp(this.speed / stall, 0, 1);
    const sinkTarget = (1 - lift * lift) * 30;
    this.vy += (-sinkTarget - this.vy) * Math.min(1, dt * 1.5);

    FWD.set(0, 0, -1).applyQuaternion(this.quat);
    this.velocity.copy(FWD).multiplyScalar(this.speed);
    this.velocity.y += this.vy;
    this.pos.addScaledVector(this.velocity, dt);

    // ----- sol / eau -----
    let ground = groundHeight(this.pos.x, this.pos.z);
    const water = ground < 0;
    if (water) ground = 0;
    const gearH = S.belly + (S.gear - S.belly) * this.gearPos;

    if (this.pos.y <= ground + gearH) {
      const e = this.euler;
      if (!this.onGround) {
        const vs = this.velocity.y;
        if (water) return this.crash("Amerrissage forcé ! Cet avion n'a pas de flotteurs.");
        if (this.gearPos < 0.95) return this.crash('Atterrissage sur le ventre : le train n\'était pas sorti !');
        if (vs < -diff.crashVs) return this.crash(`Atterrissage trop brutal (${(-vs).toFixed(1)} m/s)`);
        if (Math.abs(e.z) > 0.45) return this.crash('Une aile a touché le sol');
        if (e.x < -0.2) return this.crash('Le nez a percuté le sol');
        if (this.speed > 62) return this.crash('Beaucoup trop rapide pour atterrir');
        if (vs < -diff.crashVs * 0.6) this.emit('Atterrissage un peu dur…');
        else if (this.speed > 15) this.emit('Joli atterrissage !');
      } else if (water) {
        return this.crash("Tu as roulé dans l'eau !");
      }
      this.onGround = true;
      this.pos.y = ground + gearH;
      this.vy = 0;
      // on garde le cap, on remet les ailes à plat
      let pitch = e.x;
      if (this.speed < S.rotate) pitch = Math.max(0, pitch - dt * 0.5);
      pitch = THREE.MathUtils.clamp(pitch, 0, 0.3);
      this.quat.setFromEuler(tmpE.set(pitch, e.y, 0, 'YXZ'));
    } else if (this.pos.y > ground + gearH + 0.5) {
      this.onGround = false;
    }

    // arrêté sur une piste ?
    this.landedAt = this.onGround && this.speed < 3 ? onRunway(this.pos.x, this.pos.z) : null;
  }

  refuel(dt) {
    if (this.fuel >= SPECS.fuelCapacity) return false;
    this.fuel = Math.min(SPECS.fuelCapacity, this.fuel + 15 * dt);
    return true;
  }

  crash(reason) {
    this.crashed = true;
    this.crashReason = reason;
    this.speed = 0;
    this.throttle = 0;
    this.engineOn = false;
    this.rpm = 0;
  }
}
