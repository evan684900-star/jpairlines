// Modèle de vol réaliste (type Cessna 172) : corps rigide à 6 degrés de liberté.
// Forces : portance/traînée selon l'incidence, poussée de l'hélice (limitée en puissance),
// gravité, densité de l'air selon l'altitude, effet de sol, roues à amortisseurs avec frottement.
// Moments : stabilité et amortissement aérodynamiques + gouvernes, contacts au sol.
import * as THREE from 'three';
import { groundHeight, onRunway, runwayPoint } from './world.js';

export { createPlaneMesh, animatePlaneMesh } from './planeModel.js';

const G = 9.81;

// ---------- Caractéristiques (ordre de grandeur Cessna 172) ----------
export const SPECS = {
  name: 'Cub-1',
  emptyMass: 790, // kg, avion vide
  pilotMass: 85,
  S: 16.2, // surface alaire (m²)
  b: 11.0, // envergure (m)
  c: 1.5, // corde moyenne (m)
  inertia: new THREE.Vector3(1825, 2667, 1285), // kg·m² autour de X (tangage), Y (lacet), Z (roulis)
  // portance / traînée
  CL0: 0.25, CLa: 4.9, alphaStall: 0.27, alphaStallNeg: -0.22,
  CLflap: 0.2, alphaStallFlap: -0.012, // par cran de volets
  CD0: 0.026, k: 0.054, CDgear: 0.012, CDflap: 0.014, CDprop: 0.012,
  CYb: -0.45,
  // moments (convention aéronautique : roulis à droite, tangage à cabrer, lacet à droite positifs)
  Clb: -0.09, Clp: -0.47, Clr: 0.09, Clda: 0.05,
  Cm0: 0.045, Cma: -0.9, Cmq: -12, Cmde: 0.42, Cmflap: -0.008,
  Cnb: 0.07, Cnr: -0.1, Cndr: 0.04, Cnda: -0.004, Cnp: -0.03,
  // moteur et hélice
  maxPower: 119000, // W (160 ch)
  staticThrust: 2700, // N
  propEff: 0.7,
  // carburant
  fuelCapacity: 160, // litres
  fuelDensity: 0.72, // kg/L
  fuelFlowIdle: 6, // L/h au ralenti
  fuelFlowMax: 46, // L/h plein gaz
  // limites
  gear: 1.55, // hauteur de l'origine du modèle au-dessus du sol, train sorti
  belly: 0.7,
  vFlaps: 46, // vitesse max volets sortis (m/s, ~165 km/h)
  vGear: 58, // vitesse max train sorti (m/s, ~210 km/h)
  vne: 84, // vitesse à ne jamais dépasser (m/s, ~300 km/h)
  flapNotches: [0, 10, 20, 30],
};

// Aides au pilotage et tolérance selon la difficulté
export const DIFFICULTY = {
  easy: { wingLeveler: 1, autoCoord: 1, pitchDamp: 1, crashVs: 6, damage: false, wingDrop: 0, autoEngine: true, gLimit: Infinity },
  normal: { wingLeveler: 0.35, autoCoord: 1, pitchDamp: 0.5, crashVs: 4, damage: true, wingDrop: 0.5, autoEngine: false, gLimit: 8 },
  realistic: { wingLeveler: 0, autoCoord: 0, pitchDamp: 0, crashVs: 3, damage: true, wingDrop: 1, autoEngine: false, gLimit: 6 },
};

// Centre de gravité et points de contact, dans le repère du modèle (nez vers -Z, Y vers le haut, X à droite)
const CG = new THREE.Vector3(0, -0.15, -1.2);
const WHEELS = [
  { p: new THREE.Vector3(0, -1.55, -3.0), k: 32000, c: 3200, nose: true },
  { p: new THREE.Vector3(-1.2, -1.55, -0.75), k: 60000, c: 6000, brake: true },
  { p: new THREE.Vector3(1.2, -1.55, -0.75), k: 60000, c: 6000, brake: true },
];
const HARD_POINTS = [
  { p: new THREE.Vector3(0, -0.98, -3.82), kind: 'fatal', name: 'L\'hélice a touché le sol' },
  { p: new THREE.Vector3(-5.5, 0.95, -1.3), kind: 'fatal', name: 'Une aile a touché le sol' },
  { p: new THREE.Vector3(5.5, 0.95, -1.3), kind: 'fatal', name: 'Une aile a touché le sol' },
  { p: new THREE.Vector3(0, 1.85, 4.0), kind: 'fatal', name: 'L\'avion s\'est retourné' },
  { p: new THREE.Vector3(0, 1.1, -1.2), kind: 'fatal', name: 'L\'avion s\'est retourné' },
  { p: new THREE.Vector3(0, 0.15, 4.2), kind: 'tail' },
  { p: new THREE.Vector3(0, -0.55, -1.6), kind: 'belly' },
  { p: new THREE.Vector3(0, -0.4, 1.2), kind: 'belly' },
];

const DT = 1 / 240; // pas de simulation (s)
const clamp = THREE.MathUtils.clamp;
const smooth = (x) => x * x * (3 - 2 * x);

// tmp
const _q = new THREE.Quaternion(), _qi = new THREE.Quaternion();
const _fwd = new THREE.Vector3(), _up = new THREE.Vector3(), _right = new THREE.Vector3();
const _vb = new THREE.Vector3(), _vhat = new THREE.Vector3(), _lift = new THREE.Vector3();
const _F = new THREE.Vector3(), _T = new THREE.Vector3(), _Tw = new THREE.Vector3(), _tmp = new THREE.Vector3();
const _r = new THREE.Vector3(), _pw = new THREE.Vector3(), _vp = new THREE.Vector3(), _ww = new THREE.Vector3();
const _hf = new THREE.Vector3(), _side = new THREE.Vector3(), _fc = new THREE.Vector3(), _Iw = new THREE.Vector3();
const _e = new THREE.Euler();
const UPV = new THREE.Vector3(0, 1, 0);

export function airDensity(alt) {
  return 1.225 * Math.pow(Math.max(0.2, 1 - 2.2558e-5 * Math.max(0, alt)), 4.2559);
}

export class Plane {
  constructor() {
    this.pos = new THREE.Vector3(); // origine du modèle 3D (monde)
    this.quat = new THREE.Quaternion();
    this.velocity = new THREE.Vector3(); // vitesse du centre de gravité (monde)
    this.omega = new THREE.Vector3(); // vitesse angulaire (repère avion)
    this.events = [];
    this.fuel = SPECS.fuelCapacity;
    this.reset();
  }

  reset() {
    this.velocity.set(0, 0, 0);
    this.omega.set(0, 0, 0);
    this.speed = 0;
    this.ias = 0;
    this.alpha = 0;
    this.beta = 0;
    this.gLoad = 1;
    this.throttle = 0;
    this.rpm = 0;
    this.engineOn = false;
    this.engineStart = 0;
    this.flaps = 0;
    this.flapPos = 0;
    this.gearDown = true;
    this.gearPos = 1;
    this.gearBroken = false;
    this.parkingBrake = true;
    this.brake = false;
    this.lights = false;
    this.trim = 0;
    this.onGround = true;
    this.wheelsOnGround = 3;
    this.crashed = false;
    this.crashReason = '';
    this.landedAt = null;
    this.stallWarning = false;
    this.ctrl = { pitch: 0, roll: 0, yaw: 0 };
    this.wingDropSign = 0;
    this.lastTailMsg = 0;
    this.time = 0;
  }

  get mass() { return SPECS.emptyMass + SPECS.pilotMass + this.fuel * SPECS.fuelDensity; }
  get euler() { return _e.setFromQuaternion(this.quat, 'YXZ'); }
  // cap en degrés (0 = nord = -Z, sens horaire)
  get headingDeg() {
    _fwd.set(0, 0, -1).applyQuaternion(this.quat);
    return ((THREE.MathUtils.radToDeg(Math.atan2(_fwd.x, -_fwd.z)) % 360) + 360) % 360;
  }
  // vitesse de décrochage (vraie, m/s) dans la configuration et à l'altitude actuelles
  get stallSpeed() {
    const S = SPECS;
    const clMax = S.CL0 + S.CLflap * this.flapPos + S.CLa * (S.alphaStall + S.alphaStallFlap * this.flapPos);
    return Math.sqrt((2 * this.mass * G) / (airDensity(this.pos.y) * S.S * clMax));
  }

  placeOnRunway(a, engineOn = false) {
    this.reset();
    // en bout de piste, face à la piste (léger décalage pour ne pas se superposer aux autres joueurs)
    const back = a.length / 2 - 60 - Math.random() * 120;
    const side = (Math.random() - 0.5) * a.width * 0.4;
    const [x, z] = runwayPoint(a.x, a.z, a.heading, side, back);
    this.quat.setFromEuler(new THREE.Euler(0, a.heading, 0, 'YXZ'));
    this.pos.set(x, groundHeight(x, z) + SPECS.gear - 0.04, z);
    this.landedAt = a;
    if (engineOn) { this.engineOn = true; this.rpm = 0.15; }
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
    this.flaps = clamp(this.flaps + delta, 0, SPECS.flapNotches.length - 1);
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

  // Tourne l'avion autour de la verticale (vitesse comprise), ex. demi-tour au bord de la carte
  rotateHeading(angle) {
    _q.setFromAxisAngle(UPV, angle);
    const cg = _tmp.copy(CG).applyQuaternion(this.quat).add(this.pos);
    this.quat.premultiply(_q);
    this.velocity.applyQuaternion(_q);
    this.pos.copy(cg).sub(_r.copy(CG).applyQuaternion(this.quat));
  }

  // ----- boucle principale -----
  update(dt, input, opts) {
    if (this.crashed) return;
    const diff = DIFFICULTY[opts.difficulty] || DIFFICULTY.normal;
    this.brake = !!input.brake;

    this.updateSystems(dt, input, opts, diff);

    // commandes lissées (le clavier est tout-ou-rien : on amène les gouvernes progressivement)
    const sens = opts.sensitivity || 1;
    this.sens = sens;
    const ramp = (cur, target, up, down) => cur + clamp(target - cur, -dt * (Math.abs(target) > Math.abs(cur) ? up : down), dt * (Math.abs(target) > Math.abs(cur) ? up : down));
    this.ctrl.pitch = ramp(this.ctrl.pitch, clamp(input.pitch, -1, 1), 1.5, 3.5);
    this.ctrl.roll = ramp(this.ctrl.roll, clamp(input.roll * sens, -1, 1), 3, 4);
    this.ctrl.yaw = ramp(this.ctrl.yaw, clamp(input.yaw, -1, 1), 3, 4);

    let t = dt;
    while (t > 1e-6 && !this.crashed) {
      const h = Math.min(DT, t);
      this.step(h, input, diff);
      t -= h;
    }
    this.speed = this.velocity.length();
    this.landedAt = this.onGround && this.speed < 3 ? onRunway(this.pos.x, this.pos.z) : null;
  }

  updateSystems(dt, input, opts, diff) {
    const S = SPECS;
    this.time += dt;
    // moteur & carburant
    if (this.engineStart > 0) {
      this.engineStart -= dt;
      this.rpm = Math.min(0.15, this.rpm + dt * 0.1);
      if (this.engineStart <= 0) { this.engineOn = true; this.emit('Moteur en marche'); }
    }
    this.throttle = clamp(this.throttle + input.throttle * dt * 0.6, 0, 1);
    const fuelScale = opts.fuelScale ?? 1;
    if (this.engineOn && fuelScale > 0) {
      const lph = S.fuelFlowIdle + (S.fuelFlowMax - S.fuelFlowIdle) * this.throttle;
      this.fuel = Math.max(0, this.fuel - (lph / 3600) * fuelScale * dt);
      if (this.fuel <= 0) { this.engineOn = false; this.emit('Panne sèche ! Le moteur s\'est arrêté.'); }
    }
    // l'hélice tourne aussi « en moulinet » quand l'avion avance moteur coupé
    const windmill = clamp(this.speed / 120, 0, 0.35);
    const targetRpm = this.engineOn ? 0.15 + 0.85 * this.throttle : windmill;
    this.rpm += (targetRpm - this.rpm) * Math.min(1, dt * (this.engineOn ? 1.8 : 0.6));

    // volets & train
    this.flapPos += clamp(this.flaps - this.flapPos, -dt * 0.6, dt * 0.6);
    this.gearPos += clamp((this.gearDown ? 1 : 0) - this.gearPos, -dt / 4, dt / 4);
    if (diff.damage && this.flapPos > 0.2 && this.flaps > 0 && this.ias > S.vFlaps + 8) {
      this.flaps = 0;
      this.emit('Survitesse ! Les volets ont été rentrés de force.');
    }
    if (diff.damage && this.gearPos > 0.3 && this.ias > S.vGear + 12 && !this.gearBroken && !this.onGround) {
      this.gearBroken = true;
      this.gearDown = false;
      this.gearPos = 0;
      this.emit('CRAC ! Le train a été arraché par la vitesse !');
    }
  }

  step(h, input, diff) {
    const S = SPECS;
    const m = this.mass;
    _fwd.set(0, 0, -1).applyQuaternion(this.quat);
    _up.set(0, 1, 0).applyQuaternion(this.quat);
    _right.set(1, 0, 0).applyQuaternion(this.quat);
    _qi.copy(this.quat).invert();

    const cgW = _tmp.copy(CG).applyQuaternion(this.quat).add(this.pos);
    const cgX = cgW.x, cgY = cgW.y, cgZ = cgW.z;

    // ----- aérodynamique -----
    _vb.copy(this.velocity).applyQuaternion(_qi); // vitesse dans le repère avion
    const V = _vb.length();
    const u = -_vb.z, w = _vb.y, vs = _vb.x;
    const rho = airDensity(cgY);
    const qbar = 0.5 * rho * V * V;
    this.ias = V * Math.sqrt(rho / 1.225);
    const alpha = V > 1 ? Math.atan2(-w, u) : 0;
    const beta = V > 1 ? Math.asin(clamp(vs / V, -1, 1)) : 0;
    this.alpha = alpha;
    this.beta = beta;
    const Vd = Math.max(V, 5);
    const pr = -this.omega.z, qr = this.omega.x, rr = -this.omega.y; // roulis, tangage, lacet (aéro)

    // effet de sol : moins de traînée induite près du sol
    const hGround = cgY - Math.max(0, this.cachedGround ?? -1e9);
    const ge = hGround < S.b ? (() => { const x = (16 * Math.max(hGround, 0.5)) / S.b; return (x * x) / (1 + x * x); })() : 1;

    // aides (selon la difficulté)
    // « sensation » du manche : comme sur un vrai avion, l'effort grandit avec la vitesse. Une touche tenue
    // demande donc un facteur de charge raisonnable (≈ ±1,6 g en croisière) et non le débattement maximal,
    // qui à grande vitesse ferait plonger ou cabrer violemment. À basse vitesse (rotation, arrondi) : plein débattement.
    // sur le dos, il faut pousser fort pour tenir le nez au-dessus de l'horizon : plus d'autorité
    const feel = Math.min(1, Math.max((26 / Vd) ** 2, 0.2) * (this.sens || 1) * (_up.y < 0 ? 2.4 : 1));
    let de = this.ctrl.pitch * feel + this.trim;
    let da = this.ctrl.roll;
    let dr = this.ctrl.yaw;
    const airborne = !this.onGround;
    if (airborne) {
      const bank = Math.atan2(-_right.y, _up.y); // > 0 = incliné à droite
      // le stabilisateur de roulis se désengage au-delà de 60° (voltige, vol sur le dos)
      if (diff.wingLeveler && Math.abs(input.roll) < 0.1 && Math.abs(bank) < 1.05) {
        da += clamp(-bank * 1.2 * diff.wingLeveler - pr * 0.3, -0.6, 0.6);
      }
      if (diff.autoCoord && Math.abs(input.yaw) < 0.1) dr += clamp(beta * 6 * diff.autoCoord, -1, 1);
      if (diff.pitchDamp) de += -qr * 0.25 * diff.pitchDamp;
    }
    de = clamp(de, -1, 1); da = clamp(da, -1, 1); dr = clamp(dr, -1, 1);

    // coefficients de portance (linéaire, décrochage, puis plaque plane jusqu'à ±180°)
    const fp = this.flapPos;
    const aS = S.alphaStall + S.alphaStallFlap * fp, aSN = S.alphaStallNeg;
    const cl0 = S.CL0 + S.CLflap * fp;
    let CL, stalled = 0;
    if (alpha >= aSN && alpha <= aS) CL = cl0 + S.CLa * alpha;
    else {
      const edge = alpha > aS ? aS : aSN;
      const peak = cl0 + S.CLa * edge;
      const t = smooth(clamp(Math.abs(alpha - edge) / 0.25, 0, 1));
      const flat = 1.05 * Math.sin(2 * alpha);
      CL = peak * (1 - t) + flat * t;
      stalled = clamp(Math.abs(alpha - edge) / 0.12, 0, 1);
    }
    let CD = S.CD0 + S.CDgear * this.gearPos + S.CDflap * fp + (this.engineOn ? 0 : S.CDprop) + S.k * CL * CL * ge;
    CD = Math.max(CD, S.CD0 + 1.25 * Math.sin(alpha) ** 2);
    const CY = S.CYb * beta;

    _F.set(0, -m * G, 0);
    _T.set(0, 0, 0);
    if (V > 0.5) {
      _vhat.copy(this.velocity).divideScalar(V);
      _lift.crossVectors(_right, _vhat);
      const ll = _lift.length();
      if (ll > 1e-3) _F.addScaledVector(_lift.divideScalar(ll), CL * qbar * S.S);
      _F.addScaledVector(_vhat, -CD * qbar * S.S);
      _F.addScaledVector(_right, CY * qbar * S.S);
    }

    // décrochage dissymétrique : une aile tombe
    if (stalled > 0 && airborne) {
      if (!this.wingDropSign) this.wingDropSign = Math.random() < 0.5 ? -1 : 1;
    } else if (alpha < aS - 0.05) this.wingDropSign = 0;
    this.stallWarning = airborne && V > 5 && (alpha > aS - 0.05 || alpha < aSN + 0.03);

    const Cl = S.Clb * beta + S.Clp * (pr * S.b) / (2 * Vd) + S.Clr * (rr * S.b) / (2 * Vd) + S.Clda * da
      + this.wingDropSign * stalled * 0.03 * diff.wingDrop;
    const Cm = S.Cm0 + S.Cma * Math.sin(clamp(alpha, -0.8, 0.8)) + S.Cmq * (qr * S.c) / (2 * Vd) + S.Cmde * de + S.Cmflap * fp;
    const Cn = S.Cnb * beta + S.Cnr * (rr * S.b) / (2 * Vd) + S.Cndr * dr + S.Cnda * da + S.Cnp * (pr * S.b) / (2 * Vd);
    // repère three : X = tangage (cabrer +), Y = lacet (nez à gauche +), Z = roulis (aile droite qui monte +)
    _T.set(Cm * qbar * S.S * S.c, -Cn * qbar * S.S * S.b, -Cl * qbar * S.S * S.b);

    // ----- poussée de l'hélice (limitée en puissance) -----
    if (this.engineOn) {
      const sigma = rho / 1.225;
      const power = Math.max(0, (this.rpm - 0.15) / 0.85);
      // moteur atmosphérique : la puissance baisse avec la densité de l'air (formule de Gagg-Ferrar)
      const lapse = Math.max(0, 1.132 * sigma - 0.132);
      const thrust = Math.min(S.staticThrust * power * sigma, (S.propEff * S.maxPower * power * lapse) / Math.max(V, 1));
      _F.addScaledVector(_fwd, thrust);
    }

    // ----- contacts avec le sol -----
    const groundUnder = groundHeight(cgX, cgZ);
    this.cachedGround = groundUnder;
    let wheelsDown = 0;
    if (cgY - Math.max(0, groundUnder) < 12) {
      _ww.copy(this.omega).applyQuaternion(this.quat); // vitesse angulaire (monde)
      _Tw.set(0, 0, 0);
      const gearOk = this.gearPos > 0.95 && !this.gearBroken;
      const points = gearOk ? [...WHEELS, ...HARD_POINTS] : HARD_POINTS;
      for (const pt of points) {
        _r.copy(pt.p).sub(CG).applyQuaternion(this.quat); // bras de levier depuis le CG (monde)
        _pw.set(cgX, cgY, cgZ).add(_r);
        const gh = groundHeight(_pw.x, _pw.z);
        const water = gh < 0;
        const surf = Math.max(0, gh);
        const pen = surf - _pw.y;
        if (pen <= 0) continue;
        _vp.crossVectors(_ww, _r).add(this.velocity); // vitesse du point de contact
        if (water) return this.crash(this.speed > 3 ? 'Amerrissage forcé ! Cet avion n\'a pas de flotteurs.' : 'Tu as roulé dans l\'eau !');
        if (pt.kind === 'fatal') return this.crash(pt.name);
        if (pt.kind === 'belly') {
          if (this.velocity.length() > 2) return this.crash(gearOk ? 'Le train s\'est effondré' : 'Atterrissage sur le ventre : le train n\'était pas sorti !');
        }
        if (!pt.kind) {
          // roue : contrôle de la violence de l'impact
          if (_vp.y < -diff.crashVs) return this.crash(`Atterrissage trop brutal (${(-_vp.y).toFixed(1)} m/s)`);
          if (pen > 0.45) return this.crash('Le train s\'est effondré');
          wheelsDown++;
        }
        if (pt.kind === 'tail' && this.time - this.lastTailMsg > 3) {
          this.lastTailMsg = this.time;
          this.emit('La queue a touché le sol ! Cabre moins.');
        }
        const k = pt.k ?? 80000, c = pt.c ?? 8000;
        const Fn = Math.max(0, k * pen - c * _vp.y);
        // direction de roulement (horizontale) ; la roue avant est orientable au palonnier
        _hf.set(_fwd.x, 0, _fwd.z);
        if (_hf.lengthSq() < 1e-6) _hf.set(0, 0, -1);
        _hf.normalize();
        if (pt.nose) {
          const steer = -this.ctrl.yaw * 0.6 * clamp(1 - this.speed / 40, 0.15, 1);
          _hf.applyAxisAngle(UPV, steer);
        }
        _side.crossVectors(_hf, UPV);
        const vLong = _vp.dot(_hf), vLat = _vp.dot(_side);
        const muLat = pt.kind ? 0.5 : 0.8;
        let muLong = pt.kind ? 0.4 : 0.025;
        if (pt.brake) muLong += this.parkingBrake ? 0.8 : this.brake ? 0.6 : 0;
        _fc.set(0, Fn, 0)
          .addScaledVector(_side, -clamp(vLat / 0.3, -1, 1) * muLat * Fn)
          .addScaledVector(_hf, -clamp(vLong / 0.3, -1, 1) * muLong * Fn);
        _F.add(_fc);
        _Tw.add(_tmp.crossVectors(_r, _fc));
      }
      _T.add(_Tw.applyQuaternion(_qi));
    }
    this.wheelsOnGround = wheelsDown;
    this.onGround = wheelsDown > 0 || (this.onGround && cgY - Math.max(0, groundUnder) < 1.75);

    // facteur de charge
    _tmp.copy(_F).addScaledVector(UPV, m * G);
    this.gLoad = _tmp.dot(_up) / (m * G);
    if (airborne && Math.abs(this.gLoad) > diff.gLimit) return this.crash(`Structure rompue : ${this.gLoad.toFixed(1)} g !`);
    if (diff.damage && this.ias > S.vne * (diff.gLimit < 7 ? 1.1 : 1.2)) return this.crash('Vitesse excessive : la structure a cédé !');

    // ----- intégration (Euler semi-implicite) -----
    this.velocity.addScaledVector(_F, h / m);
    const I = S.inertia;
    _Iw.set(I.x * this.omega.x, I.y * this.omega.y, I.z * this.omega.z);
    _tmp.crossVectors(this.omega, _Iw);
    this.omega.x += ((_T.x - _tmp.x) / I.x) * h;
    this.omega.y += ((_T.y - _tmp.y) / I.y) * h;
    this.omega.z += ((_T.z - _tmp.z) / I.z) * h;
    // au sol presque arrêté : on évite les micro-glissements
    if (this.wheelsOnGround >= 3 && this.speed < 0.2 && !this.engineOn) { this.velocity.multiplyScalar(0.9); this.omega.multiplyScalar(0.9); }

    const cgNew = _pw.set(cgX, cgY, cgZ).addScaledVector(this.velocity, h);
    const ang = this.omega.length() * h;
    if (ang > 1e-9) {
      _q.setFromAxisAngle(_tmp.copy(this.omega).normalize(), ang);
      this.quat.multiply(_q).normalize();
    }
    this.pos.copy(cgNew).sub(_r.copy(CG).applyQuaternion(this.quat));
    this.speed = this.velocity.length();
  }

  refuel(dt) {
    if (this.fuel >= SPECS.fuelCapacity) return 0;
    const add = Math.min(SPECS.fuelCapacity - this.fuel, 15 * dt);
    this.fuel += add;
    return add;
  }

  crash(reason) {
    this.crashed = true;
    this.crashReason = reason;
    this.velocity.set(0, 0, 0);
    this.omega.set(0, 0, 0);
    this.speed = 0;
    this.throttle = 0;
    this.engineOn = false;
    this.rpm = 0;
  }
}
