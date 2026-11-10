// Mouvement des avions des autres joueurs et cadence d'envoi (logique pure, testée par scripts/net-motion-test.mjs).
// Les positions arrivent de 5 fois par seconde à une fois toutes les 5 s : entre deux, l'avion continue sur sa lancée.
import * as THREE from 'three';

const MAX_SPEED = 400; // m/s : plus vite que n'importe quel avion du jeu ; au-delà, c'est une réapparition
const HORIZON = 2.5; // s : durée maximale de la prolongation, puis l'avion attend la position suivante
const _p = new THREE.Vector3(), _q = new THREE.Quaternion();

// Intervalle entre deux envois de ma position (ms), selon la distance du joueur le plus proche (Infinity = seul) :
// le trafic (quota Firebase) est gardé pour les joueurs qui se voient vraiment.
export function sendInterval(nearest) {
  return nearest < 3000 ? 200 : nearest < 15000 ? 500 : nearest < Infinity ? 1000 : 2000;
}

// Deux états envoyés sont-ils « les mêmes » ? (avion à l'arrêt : inutile de le renvoyer, un signe de vie suffit)
// Petite tolérance : la suspension d'un avion posé finit de se tasser pendant longtemps (quelques centièmes de degré).
export function sameState(a, b) {
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (Math.abs(a.p[i] - b.p[i]) > 0.05) return false;
  for (let i = 0; i < 4; i++) if (Math.abs(a.q[i] - b.q[i]) > 0.002) return false;
  return Math.abs(a.s - b.s) < 0.2 && Math.abs(a.r - b.r) < 0.02 && a.g === b.g && a.f === b.f && a.l === b.l && a.a === b.a && a.k === b.k;
}

// état de mouvement d'un autre joueur
export function newMotion(p) {
  return { sp: new THREE.Vector3().fromArray(p), sv: new THREE.Vector3(), t: 0, at: 0, age: 0 };
}

// Nouvelle position reçue. p, q : position et orientation ; s : vitesse (m/s) ; t : heure du serveur à l'envoi (ms) ;
// now : horloge locale (ms) ; age : ancienneté de la position à la réception (s), d'après l'heure du serveur.
// Vitesse déduite des deux dernières positions, sinon du cap et de la vitesse annoncée.
// Renvoie true si le joueur a fait un saut impossible (réapparition) : il faut alors le placer d'un coup.
export function sampleMotion(m, p, q, s, t, now, age = 0) {
  const dt = m.t ? (t - m.t) / 1000 : 0;
  _p.fromArray(p);
  const jumped = !!m.t && _p.distanceTo(m.sp) > MAX_SPEED * Math.max(dt, 0.2) + 200;
  if (!jumped && dt > 0.05 && dt < 6) m.sv.copy(_p).sub(m.sp).divideScalar(dt);
  else m.sv.set(0, 0, -1).applyQuaternion(_q.fromArray(q)).multiplyScalar(s || 0);
  m.sp.copy(_p);
  m.t = t;
  m.at = now;
  m.age = Math.min(0.5, Math.max(0, age)); // le trajet sur le réseau est rattrapé (au plus une demi-seconde)
  return jumped;
}

// position visée à l'instant now : dernière position reçue, prolongée par la vitesse
export function motionTarget(m, now, out) {
  return out.copy(m.sp).addScaledVector(m.sv, Math.min(HORIZON, m.age + (now - m.at) / 1000));
}
