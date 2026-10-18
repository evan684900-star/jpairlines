// Banc d'essai en vol : un pilote automatique fait voler chaque avion dans différentes situations
// et mesure ses performances (à comparer à l'avion réel dont il s'inspire).
// Usage : node scripts/flight-test.mjs [difficulté] [avion|all]
//   difficulté : easy | normal | realistic (défaut normal) ; avion : cub, moustique, faucon, mistral, albatros, eclair (défaut cub)
import * as THREE from 'three';
import { Plane } from '../public/js/plane.js';
import { AIRCRAFT, aircraftById } from '../public/js/aircraft.js';
import { AIRPORTS, runwayPoint, groundHeight, findSea } from '../public/js/world.js';

const difficulty = process.argv[2] || 'normal';
const which = process.argv[3] || 'cub';

// Performances attendues (km/h, m/s) : références des avions réels, avec une marge de tolérance.
// vr : rotation · vy : vitesse de montée · cruise : vitesse des essais en palier · app : approche (m/s)
const ENVELOPES = {
  cub: { roll: [40, 90], ref: 'Cessna 172', vr: 100, vy: 36, climb1500: [3, 5], climb4000: [1, 3], vmax: [200, 260], cruise: 50, stall: [75, 105], stallFlaps: [60, 90], vbg: 33, ld: [7, 12], app: 34, sink: 1.9, dive: 320, inv: 55, takeoff: 700 },
  moustique: { roll: [30, 80], ref: 'Ikarus C42', vr: 65, vy: 26, climb1500: [3.5, 7], climb4000: [1.5, 5], vmax: [165, 205], cruise: 40, stall: [55, 80], stallFlaps: [45, 70], vbg: 24, ld: [7, 11], app: 24, sink: 1.25, dive: 236, inv: 42, takeoff: 250 },
  faucon: { roll: [180, 400], ref: 'Extra 300', vr: 115, vy: 45, climb1500: [10, 18], climb4000: [5, 13], vmax: [310, 370], cruise: 75, stall: [95, 125], vbg: 38, ld: [6, 10], app: 38, sink: 2.0, dive: 430, inv: 70, takeoff: 450 },
  mistral: { roll: [40, 100], ref: 'Beechcraft Baron', vr: 140, vy: 50, climb1500: [6, 11], climb4000: [3, 8], vmax: [320, 380], cruise: 85, stall: [115, 140], stallFlaps: [100, 125], vbg: 45, ld: [8, 13], app: 43, sink: 2.2, dive: 415, inv: 85, takeoff: 900, brake: 40 },
  albatros: { roll: [35, 90], ref: 'Cessna 206 amphibie', vr: 110, vy: 38, climb1500: [3.5, 7], climb4000: [1.5, 4.5], vmax: [215, 255], cruise: 55, stall: [95, 120], stallFlaps: [80, 105], vbg: 37, ld: [6, 10], app: 38, sink: 1.9, dive: 300, inv: 60, takeoff: 800 },
  eclair: { roll: [50, 130], ref: 'Eclipse 500', vr: 165, vy: 80, climb1500: [12, 25], climb4000: [8, 20], vmax: [580, 660], cruise: 140, stall: [150, 180], stallFlaps: [130, 155], vbg: 60, ld: [10, 16], app: 52, thrApp: 0.32, sink: 2.7, dive: 700, inv: 140, takeoff: 1200, brake: 60 },
};

const OPTS = { difficulty, fuelScale: 1, sensitivity: 1 };
const DT = 1 / 60;
const kmh = (v) => (v * 3.6).toFixed(0);
const deg = (r) => ((r * 180) / Math.PI).toFixed(1);
let results = [];
const report = (name, ok, msg) => { results.push({ name, ok }); console.log(`${ok ? '✔' : '✖'} ${name.padEnd(28)} ${msg}`); };

const fwd = new THREE.Vector3(), up = new THREE.Vector3(), right = new THREE.Vector3();
function attitude(p) {
  fwd.set(0, 0, -1).applyQuaternion(p.quat);
  up.set(0, 1, 0).applyQuaternion(p.quat);
  right.set(1, 0, 0).applyQuaternion(p.quat);
  return { pitch: Math.asin(THREE.MathUtils.clamp(fwd.y, -1, 1)), bank: Math.atan2(-right.y, up.y), hdg: Math.atan2(fwd.x, -fwd.z) };
}
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = THREE.MathUtils.clamp;

// pilote automatique : vise un tangage, une inclinaison, un cap au sol, une vitesse indiquée…
function autopilot(p, t) {
  const a = attitude(p);
  const inp = { pitch: 0, roll: 0, yaw: 0, throttle: 0, brake: false };
  if (t.pitch !== undefined) inp.pitch = clamp((t.pitch - a.pitch) * 4 - p.omega.x * 1.5, -1, 1);
  if (t.bank !== undefined) inp.roll = clamp(wrap(t.bank - a.bank) * 3 + p.omega.z * 0.8, -1, 1);
  if (t.hdg !== undefined) inp.yaw = clamp(wrap(t.hdg - a.hdg) * 4 + p.omega.y * 1.5, -1, 1);
  if (t.elevator !== undefined) inp.pitch = t.elevator;
  if (t.roll !== undefined) inp.roll = t.roll;
  if (t.throttle !== undefined) inp.throttle = clamp((t.throttle - p.throttle) * 20, -1, 1);
  if (t.brake) inp.brake = true;
  return inp;
}
let TYPE = 'cub', S = null, T = null;
function air(alt, ias, opts = {}) {
  const p = new Plane(TYPE);
  p.pos.set(0, alt, 0);
  p.quat.identity();
  p.onGround = false;
  p.parkingBrake = false;
  p.engineOn = true;
  p.rpm = 0.8;
  p.throttle = opts.throttle ?? 0.75;
  p.gearDown = opts.gear ?? false;
  p.gearPos = p.gearDown ? 1 : 0;
  p.flaps = p.flapPos = opts.flaps ?? 0;
  p.velocity.set(0, 0, -ias);
  return p;
}
function fly(p, seconds, target, each) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n && !p.crashed; i++) {
    const tg = typeof target === 'function' ? target(p, i * DT) : target;
    p.update(DT, autopilot(p, tg), OPTS);
    if (each) each(p, i * DT);
    if (!Number.isFinite(p.pos.x + p.pos.y + p.velocity.x + p.omega.x)) throw new Error('NaN dans la simulation');
  }
  return p;
}
// tient une vitesse indiquée en jouant sur le tangage (PID simple)
function holdSpeed(target) {
  let i = 0;
  return (p) => { const e = p.ias - target; i = clamp(i + e * DT * 0.004, -0.15, 0.15); return clamp(e * 0.02 + i, -0.35, 0.35); };
}
// tient une altitude en jouant sur le tangage
function holdAlt(target) {
  return (p) => clamp((target - p.pos.y) * 0.004 - p.velocity.y * 0.02 + 0.03, -0.25, 0.3);
}

function suite() {
  // ===== 1. Au sol, à l'arrêt =====
  {
    const a = AIRPORTS[0];
    const p = new Plane(TYPE);
    p.placeOnRunway(a);
    const start = p.pos.clone();
    fly(p, 10, {});
    const att = attitude(p);
    const drift = p.pos.distanceTo(start);
    report('Au sol, immobile', !p.crashed && drift < 0.3 && Math.abs(att.pitch) < 0.03 && p.onGround,
      `dérive ${drift.toFixed(2)} m, assiette ${deg(att.pitch)}°, ${p.wheelsOnGround} roues au sol`);
  }

  // ===== 2. Décollage =====
  let takeoff;
  {
    const a = AIRPORTS[0];
    const p = new Plane(TYPE);
    p.placeOnRunway(a);
    p.engineOn = true; p.rpm = 0.15; p.parkingBrake = false; p.flaps = p.flapPos = Math.min(1, S.flapNotches.length - 1);
    const start = p.pos.clone();
    const hdg0 = attitude(p).hdg;
    let liftoff = null, maxDev = 0;
    fly(p, 60, (pp, t) => {
      const air = !pp.onGround;
      if (air && !liftoff) liftoff = { d: pp.pos.distanceTo(start), ias: pp.ias, t };
      const [cx, cz] = [a.x, a.z];
      const { u } = (() => { const dx = pp.pos.x - cx, dz = pp.pos.z - cz, c = Math.cos(a.heading), s = Math.sin(a.heading); return { u: dx * c - dz * s }; })();
      maxDev = Math.max(maxDev, Math.abs(u));
      return { throttle: 1, hdg: hdg0, pitch: pp.ias * 3.6 > T.vr ? 0.14 : 0, bank: air ? 0 : undefined };
    }, (pp) => {
      if (!pp.onGround && pp.pos.y - groundHeight(pp.pos.x, pp.pos.z) > 15 && pp.flaps) pp.flaps = 0;
      // en montée, le pilote trime pour garder l'assiette sans forcer sur le manche (T / B)
      if (!pp.onGround) pp.trim = clamp(pp.trim + (0.14 - attitude(pp).pitch) * DT * 0.5, -0.5, 0.5);
    });
    takeoff = liftoff;
    report(`Décollage (volets ${S.flapNotches[Math.min(1, S.flapNotches.length - 1)]}°)`, !!liftoff && !p.crashed && liftoff.d < T.takeoff && maxDev < 15,
      liftoff ? `roulage ${liftoff.d.toFixed(0)} m en ${liftoff.t.toFixed(1)} s, décolle à ${kmh(liftoff.ias)} km/h, écart d'axe max ${maxDev.toFixed(1)} m ${p.crashed ? '— CRASH ' + p.crashReason : ''}` : `pas décollé ${p.crashReason}`);
  }

  // ===== 3. Montée =====
  {
    const p = air(700, T.vy, { throttle: 1 });
    const hs = holdSpeed(T.vy);
    const rates = {};
    let ceiling = null;
    fly(p, 1500, (pp) => ({ throttle: 1, pitch: 0.12 + hs(pp), bank: 0 }), (pp, t) => {
      for (const h of [500, 1500, 3000, 4000]) if (!rates[h] && pp.pos.y > h) rates[h] = pp.velocity.y;
      if (!ceiling && t > 60 && pp.velocity.y < 0.5) ceiling = pp.pos.y;
    });
    // hors mode réaliste, la puissance en altitude est adoucie (altLapse) : le taux de montée à 4 000 m peut être 40 % plus fort
    const hi4000 = T.climb4000[1] * (difficulty === 'realistic' ? 1 : 1.4);
    report(`Montée à ${kmh(T.vy)} km/h`, rates[1500] > T.climb1500[0] && rates[1500] < T.climb1500[1] * (difficulty === 'realistic' ? 1 : 1.1) && rates[4000] > T.climb4000[0] && rates[4000] < hi4000,
      `vario ${Object.entries(rates).map(([h, v]) => `${h} m : ${v.toFixed(1)} m/s`).join(', ')} ; plafond ≈ ${ceiling ? Math.round(ceiling) : `> ${Math.round(p.pos.y)}`} m`);
  }

  // ===== 4. Vitesse max en palier =====
  {
    const p = air(1000, T.cruise, { throttle: 1 });
    const ha = holdAlt(1000);
    fly(p, 300, (pp) => ({ throttle: 1, pitch: ha(pp), bank: 0 }));
    const vmax = p.ias;
    const p2 = air(1000, T.cruise, { throttle: 0.65 });
    fly(p2, 300, (pp) => ({ throttle: 0.65, pitch: ha(pp), bank: 0 }));
    report('Vitesse en palier', vmax * 3.6 > T.vmax[0] && vmax * 3.6 < T.vmax[1], `plein gaz ${kmh(vmax)} km/h, 65 % ${kmh(p2.ias)} km/h (attendu ${T.vmax.join('–')} km/h)`);
  }

  // ===== 5. Décrochage =====
  for (const flaps of S.flapNotches.length > 1 ? [0, S.flapNotches.length - 1] : [0]) {
    const p = air(1500, T.stall[1] / 3.6 + 8, { throttle: 0, flaps, gear: true });
    let stallIas = null, warnIas = null;
    fly(p, 90, (pp) => ({ throttle: 0, pitch: clamp(0.05 + (1500 - pp.pos.y) * 0.01, 0, 0.5), bank: 0 }), (pp) => {
      if (!warnIas && pp.stallWarning) warnIas = pp.ias;
      if (!stallIas && pp.alpha > S.alphaStall + S.alphaStallFlap * pp.flapPos) stallIas = pp.ias;
    });
    const range = flaps ? T.stallFlaps : T.stall;
    report(`Décrochage volets ${S.flapNotches[flaps]}°`, stallIas && stallIas * 3.6 > range[0] && stallIas * 3.6 < range[1],
      `alarme à ${warnIas ? kmh(warnIas) : '?'} km/h, décroche à ${stallIas ? kmh(stallIas) : '?'} km/h (attendu ${range.join('–')})`);
  }

  // ===== 6. Virage à 30° d'inclinaison =====
  {
    const p = air(1000, T.cruise, { throttle: 0.75 });
    const ha = holdAlt(1000);
    let h0 = null, maxBeta = 0, turned = 0;
    fly(p, 40, (pp) => ({ throttle: 0.75, pitch: ha(pp) + 0.03, bank: Math.PI / 6 }), (pp, t) => {
      // cap cumulé (un avion lent peut faire plus d'un demi-tour en 30 s)
      if (t > 10 && h0 !== null) { const hh = attitude(pp).hdg; turned += wrap(hh - h0); h0 = hh; }
      if (t > 10 && h0 === null) h0 = attitude(pp).hdg;
      if (t > 10) maxBeta = Math.max(maxBeta, Math.abs(pp.beta));
    });
    const rate = Math.abs(turned) / 30;
    const theory = (9.81 * Math.tan(Math.PI / 6)) / p.speed;
    report('Virage 30°', Math.abs(rate - theory) / theory < 0.25 && maxBeta < 0.1,
      `taux ${deg(rate)}°/s (théorie ${deg(theory)}°/s), dérapage max ${deg(maxBeta)}°, altitude ${Math.round(p.pos.y)} m, ${p.gLoad.toFixed(2)} g`);
  }

  // ===== 7. Plané moteur coupé =====
  {
    const p = air(2000, T.vbg, { throttle: 0 });
    p.engineOn = false;
    const hs = holdSpeed(T.vbg);
    const x0 = p.pos.clone();
    fly(p, 120, (pp) => ({ throttle: 0, pitch: -0.05 + hs(pp), bank: 0 }));
    const d = Math.hypot(p.pos.x - x0.x, p.pos.z - x0.z), dh = x0.y - p.pos.y;
    report('Plané moteur coupé', d / dh > T.ld[0] && d / dh < T.ld[1], `finesse ${(d / dh).toFixed(1)} (attendu ${T.ld.join('–')}), taux de chute ${(dh / 120).toFixed(1)} m/s`);
  }

  // ===== 8. Atterrissage =====
  function landing(sink, gear = true) {
    const a = AIRPORTS[0];
    const p = new Plane(TYPE);
    const dist = 1500;
    const [x, z] = runwayPoint(a.x, a.z, a.heading, 0, a.length / 2 + dist);
    p.quat.setFromEuler(new THREE.Euler(0, a.heading, 0, 'YXZ'));
    const hdg0 = attitude(p).hdg;
    // on vise un point 300 m après le seuil (une approche un peu trop plongeante se pose quand même sur la piste)
    p.pos.set(x, a.elev + (dist + 300) * Math.tan((3 * Math.PI) / 180) + 2, z);
    fwd.set(0, 0, -1).applyQuaternion(p.quat);
    p.velocity.copy(fwd).multiplyScalar(T.app).add(new THREE.Vector3(0, -sink * 0.3, 0));
    p.onGround = false; p.parkingBrake = false; p.engineOn = true; p.rpm = 0.3; p.throttle = 0.25;
    p.gearDown = gear; p.gearPos = gear ? 1 : 0; p.flaps = p.flapPos = Math.min(2, S.flapNotches.length - 1);
    let td = null, stopped = null;
    fly(p, 120, (pp) => {
      const hAgl = pp.pos.y - S.gear - Math.max(0, groundHeight(pp.pos.x, pp.pos.z));
      const lp = (() => { const dx = pp.pos.x - a.x, dz = pp.pos.z - a.z, c = Math.cos(a.heading), s = Math.sin(a.heading); return dx * c - dz * s; })();
      if (pp.onGround) return { throttle: 0, hdg: hdg0, brake: pp.ias < (T.brake ?? 25), pitch: 0 };
      const targetVs = hAgl > 8 ? -sink : -0.6;
      const pitch = clamp(attitude(pp).pitch + (targetVs - pp.velocity.y) * 0.03, -0.15, 0.2);
      // gaz d'approche : par paliers (avions légers) ou proportionnels (réacteurs, lents à répondre)
      const thr = T.thrApp !== undefined ? clamp(T.thrApp + (T.app - pp.ias) * 0.06, 0, 1)
        : pp.ias < T.app - 3 ? 0.45 : pp.ias > T.app + 2 ? 0.05 : 0.25;
      void lp;
      return { throttle: hAgl > 8 ? thr : 0, pitch, bank: 0 };
    }, (pp, t) => {
      if (process.env.DEBUG_LANDING && Math.round(t * 60) % 60 === 0) {
        const dx = pp.pos.x - a.x, dz = pp.pos.z - a.z, c = Math.cos(a.heading), s2 = Math.sin(a.heading);
        console.log('  t', t.toFixed(0), 'v(piste)', Math.round(dx * s2 + dz * c), 'u', Math.round(dx * c - dz * s2), 'h', (pp.pos.y - a.elev).toFixed(1), 'ias', kmh(pp.ias), 'vs', pp.velocity.y.toFixed(1), 'sol', pp.onGround, 'arrêt', !!pp.landedAt);
      }
      if (!td && pp.onGround) td = { vs: pp.velocity.y, ias: pp.ias, t };
      if (!stopped && pp.landedAt) stopped = { t, at: pp.landedAt.name };
    });
    return { p, td, stopped };
  }
  {
    const { p, td, stopped } = landing(T.sink);
    report('Atterrissage normal', !p.crashed && !!stopped, `touché à ${td ? kmh(td.ias) : '?'} km/h, vario ${td ? td.vs.toFixed(1) : '?'} m/s, ${stopped ? `arrêté à ${stopped.at}` : 'pas arrêté'} ${p.crashed ? '— CRASH ' + p.crashReason : ''}`);
  }
  {
    const { p } = landing(T.sink, false);
    report('Atterrissage train rentré', p.crashed, p.crashed ? `crash attendu : ${p.crashReason}` : 'pas de crash !?');
  }
  {
    // impact brutal : on pique droit sur la piste
    const a = AIRPORTS[0];
    const p = new Plane(TYPE);
    p.pos.set(a.x, a.elev + 12, a.z);
    p.quat.setFromEuler(new THREE.Euler(-0.15, a.heading, 0, 'YXZ'));
    p.velocity.set(0, -9, 0).addScaledVector(fwd.set(0, 0, -1).applyQuaternion(p.quat), 30);
    p.onGround = false; p.parkingBrake = false;
    fly(p, 10, { pitch: -0.15, throttle: 0 });
    report('Impact à 9 m/s', p.crashed, p.crashed ? `crash attendu : ${p.crashReason}` : 'pas de crash !?');
  }

  // ===== 9. Vol sur le dos =====
  {
    const p = air(1500, T.inv, { throttle: 1 });
    let invTime = 0, minAlt = Infinity;
    fly(p, 40, (pp, t) => {
      if (t < 4) return { throttle: 1, pitch: 0.05, bank: 0 };
      // sur le dos, il faut POUSSER sur le manche pour garder le nez au-dessus de l'horizon
      const att = attitude(pp);
      const invUp = Math.abs(att.bank) > 2.4;
      return { throttle: 1, bank: Math.PI, elevator: invUp ? clamp(-0.25 - (1500 - pp.pos.y) * 0.004 + pp.velocity.y * 0.03 - pp.omega.x * 0.5, -0.9, 0.3) : 0 };
    }, (pp, t) => { up.set(0, 1, 0).applyQuaternion(pp.quat); if (up.y < -0.5) invTime += DT; if (t > 6) minAlt = Math.min(minAlt, pp.pos.y); });
    report('Vol sur le dos', invTime > (difficulty === 'realistic' ? 12 : 25) && !p.crashed, `${invTime.toFixed(1)} s sur le dos, altitude mini ${Math.round(minAlt)} m ${p.crashed ? '— CRASH ' + p.crashReason : ''}`);
  }

  // ===== 10. Piqué =====
  {
    const p = air(3000, T.cruise, { throttle: 1 });
    let vmax = 0;
    // ressource progressive (moins de 3,5 g) : en mode réaliste, tirer trop fort casse l'avion
    let recover = false;
    fly(p, 30, (pp) => {
      if (pp.ias * 3.6 > T.dive) recover = true;
      if (!recover) return { throttle: 1, pitch: -0.6, bank: 0 };
      return { throttle: 0, bank: 0, elevator: clamp(0.2 - (pp.gLoad - 3) * 0.3 - pp.omega.x * 0.3, -0.3, 0.35) };
    }, (pp) => { vmax = Math.max(vmax, pp.ias); });
    report('Piqué à -35° puis ressource', vmax * 3.6 > T.dive - 20 && !p.crashed, `vitesse max ${kmh(vmax)} km/h ${p.crashed ? `— ${p.crashReason}` : ''} (VNE ${kmh(S.vne)} km/h)`);
  }

  // ===== 11. Taux de roulis : ailerons en butée =====
  {
    const p = air(1500, T.cruise, { throttle: 0.75 });
    let maxRate = 0;
    fly(p, 3, { throttle: 0.75, elevator: 0, roll: 1 }, (pp) => { maxRate = Math.max(maxRate, Math.abs(pp.omega.z)); });
    const r = maxRate * 57.3;
    report('Taux de roulis', r > T.roll[0] && r < T.roll[1], `${r.toFixed(0)}°/s à ${kmh(T.cruise)} km/h (attendu ${T.roll.join('–')}°/s)`);
  }

  // ===== 12. Robustesse : commandes aléatoires =====
  {
    let nan = false, crashes = 0;
    for (let k = 0; k < 6; k++) {
      const p = air(2500, T.cruise, { throttle: 0.7 });
      let seed = k * 977 + 1;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
      try {
        for (let i = 0; i < 60 * 90 && !p.crashed; i++) {
          p.update(i % 3 === 0 ? 0.05 : DT, { pitch: rnd(), roll: rnd(), yaw: rnd(), throttle: rnd(), brake: false }, OPTS);
          if (!Number.isFinite(p.pos.y + p.omega.x + p.velocity.y)) { nan = true; break; }
        }
      } catch { nan = true; }
      if (p.crashed) crashes++;
    }
    report('Commandes aléatoires (90 s)', !nan, nan ? 'NaN détecté !' : `aucun NaN (${crashes}/6 se sont crashés, normal)`);
  }


}

// ===== Hydravion : amerrissage, déjaugeage, train sorti sur l'eau =====
function seaplane() {
  const sea = findSea(-16000, -24000, 15, 9000);
  const water = (gear) => {
    const p = air(60, T.app, { throttle: 0.25, gear, flaps: 2 });
    p.pos.set(sea.x, 60, sea.z);
    let touched = false, stopped = false;
    fly(p, 90, (pp) => {
      const h = pp.pos.y - S.gear;
      if (pp.onGround) return { throttle: 0, pitch: 0.05, bank: 0 };
      const targetVs = h > 8 ? -T.sink : -0.6;
      return { throttle: h > 8 ? 0.2 : 0, pitch: clamp(attitude(pp).pitch + (targetVs - pp.velocity.y) * 0.03, -0.15, 0.2), bank: 0 };
    }, (pp) => { if (pp.onWater) touched = true; if (touched && pp.speed < 1) stopped = true; });
    return { p, touched, stopped };
  };
  {
    const { p, touched, stopped } = water(false);
    report('Amerrissage train rentré', touched && stopped && !p.crashed, `${touched ? 'touche l\'eau' : 'pas touché'}, ${stopped ? 'arrêté et flotte' : 'pas arrêté'} ${p.crashed ? '— CRASH ' + p.crashReason : ''} (assiette ${deg(attitude(p).pitch)}°)`);
    // déjaugeage et décollage depuis l'eau
    p.engineOn = true; p.rpm = 0.2; p.flaps = 1;
    const start = p.pos.clone();
    let off = null;
    fly(p, 90, (pp) => ({ throttle: 1, pitch: pp.ias * 3.6 > T.vr ? 0.12 : 0.04, bank: 0 }), (pp) => { if (!off && !pp.onGround && pp.pos.y - S.gear > 3) off = pp.pos.distanceTo(start); });
    report('Décollage depuis l\'eau', !!off && !p.crashed, off ? `déjauge et décolle en ${Math.round(off)} m` : `pas décollé ${p.crashReason}`);
  }
  {
    const { p } = water(true);
    report('Amerrissage train sorti', difficulty === 'easy' ? !p.crashed : p.crashed, p.crashed ? `crash attendu : ${p.crashReason}` : 'pas de crash');
  }
}

let failedTotal = 0;
for (const def of which === 'all' ? AIRCRAFT : [aircraftById(which)]) {
  TYPE = def.id; S = def.specs; T = ENVELOPES[def.id]; results = [];
  console.log(`\n=== ${def.name} (${def.role}, réf. ${T.ref}) ===`);
  suite();
  if (S.amphibious) seaplane();
  const failed = results.filter((r) => !r.ok).length;
  failedTotal += failed;
  console.log(`${results.length - failed}/${results.length} essais réussis (${def.name}, difficulté ${difficulty})`);
}
process.exit(failedTotal ? 1 : 0);
