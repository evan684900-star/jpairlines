// Test du mouvement des autres joueurs (public/js/netMotion.js) : simulation à 60 images/s avec un réseau réaliste
// (délai et gigue), comparée à l'ancienne méthode (viser la dernière position reçue).
// Usage : node scripts/net-motion-test.mjs
import * as THREE from 'three';
import { sendInterval, sameState, newMotion, sampleMotion, motionTarget } from '../public/js/netMotion.js';

let failed = 0;
const check = (name, ok, msg) => { if (!ok) failed++; console.log(`${ok ? '✔' : '✖'} ${name.padEnd(46)} ${msg}`); };
let seed = 5;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

// trajectoires vraies : position (m) et orientation à l'instant t (s)
const straight = (v) => (t) => ({ p: new THREE.Vector3(0, 500, -v * t), q: new THREE.Quaternion() });
const turn = (v, R) => (t) => { const a = (v / R) * t; return { p: new THREE.Vector3(R * Math.cos(a), 500, -R * Math.sin(a)), q: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a) }; };

// erreur moyenne et maximale (m) entre l'avion affiché et sa vraie position, sur 20 s
function simulate(traj, speed, every, extrapolate) {
  const msgs = []; // { t (serveur), arrive, p, q }
  for (let ts = 0; ts < 22000; ts += every) {
    const up = 30 + rnd() * 40, down = 30 + rnd() * 40;
    const { p, q } = traj(ts / 1000);
    msgs.push({ t: ts + up, arrive: ts + up + down, p: p.toArray(), q: q.toArray() });
  }
  const m = newMotion(msgs[0].p), mesh = new THREE.Vector3().fromArray(msgs[0].p), target = new THREE.Vector3();
  let next = 0, sum = 0, max = 0, n = 0;
  for (let now = 0; now < 22000; now += 1000 / 60) {
    while (next < msgs.length && msgs[next].arrive <= now) {
      const g = msgs[next++];
      if (sampleMotion(m, g.p, g.q, speed, g.t, now, (now - g.t) / 1000)) mesh.fromArray(g.p);
    }
    if (extrapolate) motionTarget(m, now, target); else target.copy(m.sp);
    mesh.lerp(target, 1 - Math.exp(-(1 / 60) * 8));
    if (now > 2000) { const e = mesh.distanceTo(traj(now / 1000).p); sum += e; max = Math.max(max, e); n++; }
  }
  return { mean: sum / n, max };
}

console.log('Erreur de position de l\'avion affiché (moyenne / max), ancienne méthode → nouvelle :');
for (const [name, traj, speed, limit] of [
  ['180 km/h tout droit', straight(50), 50, 12], ['540 km/h tout droit (jet)', straight(150), 150, 30], ['virage serré à 215 km/h', turn(60, 300), 60, 25],
]) {
  for (const every of [200, 500, 1000]) {
    const a = simulate(traj, speed, every, false), b = simulate(traj, speed, every, true);
    check(`${name}, ${1000 / every} envoi(s)/s`, b.mean < a.mean && b.mean < limit,
      `${a.mean.toFixed(1)} / ${a.max.toFixed(1)} m → ${b.mean.toFixed(1)} / ${b.max.toFixed(1)} m`);
  }
}

// réapparition à 50 km : l'avion est replacé d'un coup, même après un long silence
for (const gap of [300, 8000]) {
  const m = newMotion([0, 100, 0]);
  sampleMotion(m, [0, 100, 0], [0, 0, 0, 1], 0, 1000, 1000);
  const jumped = sampleMotion(m, [30000, 1500, 40000], [0, 0, 0, 1], 50, 1000 + gap, 1000 + gap);
  check(`réapparition à 50 km après ${gap / 1000} s`, jumped && m.sv.length() <= 51, `saut détecté : ${jumped}, vitesse ${m.sv.length().toFixed(0)} m/s`);
}
// déplacement normal après un silence de 5 s (avion à l'arrêt qui repart) : pas un saut
{
  const m = newMotion([0, 100, 0]);
  sampleMotion(m, [0, 100, 0], [0, 0, 0, 1], 0, 1000, 1000);
  check('redémarrage après 5 s à l\'arrêt', !sampleMotion(m, [0, 100, -150], [0, 0, 0, 1], 40, 6000, 6000), 'pas de saut');
}
// l'avion ne continue pas indéfiniment si plus rien n'arrive
{
  const m = newMotion([0, 100, 0]), out = new THREE.Vector3();
  sampleMotion(m, [0, 100, 0], [0, 0, 0, 1], 50, 1000, 1000);
  sampleMotion(m, [0, 100, -10], [0, 0, 0, 1], 50, 1200, 1200);
  const d = motionTarget(m, 60000, out).distanceTo(m.sp);
  check('silence prolongé', d <= 50 * 2.5 + 0.01, `prolongé de ${d.toFixed(0)} m au plus`);
}
check('cadence d\'envoi', [sendInterval(500), sendInterval(9000), sendInterval(60000), sendInterval(Infinity)].join() === '200,500,1000,2000', 'près 5/s, 15 km 2/s, loin 1/s, seul 1 toutes les 2 s');
// avion à l'arrêt : le tassement de la suspension n'est pas un changement ; rouler, sortir les volets… en sont un
{
  const st = { p: [700, 181.5, -1700], q: [-0.0037, 0.5556, 0.0025, 0.8315], s: 0, r: 0, g: 1, f: 0, l: 0, a: 0, k: 0 };
  const settle = { ...st, q: [-0.0042, 0.5556, 0.0028, 0.8315] };
  const moved = { ...st, p: [700.3, 181.5, -1700] }, flaps = { ...st, f: 0.33 }, turned = { ...st, q: [-0.0037, 0.56, 0.0025, 0.8285] };
  check('avion à l\'arrêt', sameState(st, settle) && !sameState(st, moved) && !sameState(st, flaps) && !sameState(st, turned) && !sameState(st, null), 'tassement ignoré ; déplacement, volets et rotation détectés');
}
console.log(failed ? `\n${failed} échec(s)` : '\nOK');
process.exit(failed ? 1 : 0);
