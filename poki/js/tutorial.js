// Tutoriel du premier vol (version Poki) : quelques étapes courtes, validées automatiquement en jouant.
// Il se lance au premier démarrage, peut être passé, et se termine par la première mission.
import * as THREE from 'three';
import { tr } from './i18n.js';

const _r = new THREE.Vector3(), _u = new THREE.Vector3();
const bankOf = (q) => { _r.set(1, 0, 0).applyQuaternion(q); _u.set(0, 1, 0).applyQuaternion(q); return Math.atan2(-_r.y, _u.y); };

// touch : contrôles tactiles affichés (téléphone, tablette) → on nomme les boutons au lieu des touches
const STEPS = [
  {
    text: () => tr('Bienvenue, pilote ! Desserre le frein de parking', 'Welcome, pilot! Release the parking brake'),
    keys: (touch) => (touch ? tr('bouton <b>P</b>', '<b>P</b> button') : '<kbd>P</kbd>'),
    done: (p) => !p.parkingBrake,
  },
  {
    text: () => tr('Mets plein gaz', 'Full throttle'),
    keys: (touch) => (touch ? tr('pousse la manette <b>GAZ</b> vers le haut', 'push the <b>THROTTLE</b> lever up') : tr('maintiens <kbd>Z</kbd> ou <kbd>W</kbd>', 'hold <kbd>W</kbd> or <kbd>Z</kbd>')),
    done: (p) => p.throttle > 0.9,
  },
  {
    text: (p) => tr(`Vers 100 km/h, tire doucement sur le manche pour décoller (${Math.round(p.ias * 3.6)} km/h)`, `At about 100 km/h, gently pull up to take off (${Math.round(p.ias * 3.6)} km/h)`),
    keys: (touch) => (touch ? tr('glisse le <b>manche</b> vers le bas', 'drag the <b>stick</b> down') : tr('flèche <kbd>↓</kbd>', '<kbd>↓</kbd> arrow')),
    done: (p, s) => !p.onGround && s.agl > 15,
  },
  {
    text: () => tr('Bravo, tu voles ! Rentre le train d\'atterrissage', 'You\'re flying! Retract the landing gear'),
    keys: (touch) => (touch ? tr('bouton <b>G</b>', '<b>G</b> button') : '<kbd>G</kbd>'),
    done: (p) => p.gearPos < 0.5 || !p.S.retractable,
  },
  {
    text: () => tr('Incline l\'avion pour tourner', 'Bank the plane to turn'),
    keys: (touch) => (touch ? tr('glisse le <b>manche</b> à gauche ou à droite', 'drag the <b>stick</b> left or right') : tr('flèches <kbd>←</kbd> <kbd>→</kbd>', '<kbd>←</kbd> <kbd>→</kbd> arrows')),
    done: (p, s) => s.turned > 1.2,
  },
  {
    text: (p, s) => tr(`Monte à 300 m au-dessus du sol (${Math.round(s.agl)} m)`, `Climb to 300 m above the ground (${Math.round(s.agl)} m)`),
    keys: (touch) => (touch ? tr('manche vers le bas, plein gaz', 'stick down, full throttle') : tr('flèche <kbd>↓</kbd>, plein gaz', '<kbd>↓</kbd> arrow, full throttle')),
    done: (p, s) => s.agl > 300,
  },
];

export class Tutorial {
  // ctx : { plane, getAgl, isTouch, onFinish }
  constructor(ctx) {
    Object.assign(this, ctx);
    this.box = document.getElementById('tuto');
    this.step = -1;
    this.state = { agl: 0, turned: 0 };
    document.getElementById('tuto-skip').onclick = () => this.finish(true);
  }

  get active() { return this.step >= 0; }

  start() {
    this.step = 0;
    this.state.turned = 0;
    this.box.classList.remove('hidden');
    this.render();
  }

  finish(skipped = false) {
    this.step = -1;
    this.box.classList.add('hidden');
    try { localStorage.setItem('jpairlines-poki-tuto', '1'); } catch { /* stockage indisponible */ }
    this.onFinish?.(skipped);
  }

  render() {
    const st = STEPS[this.step];
    const dots = STEPS.map((_, i) => `<i class="${i < this.step ? 'ok' : i === this.step ? 'cur' : ''}"></i>`).join('');
    const html = `<div class="tuto-text">${st.text(this.plane, this.state)}</div><div class="tuto-keys">${st.keys(this.isTouch())}</div><div class="tuto-dots">${dots}</div>`;
    const body = this.box.querySelector('.tuto-body');
    if (body.innerHTML !== html) body.innerHTML = html;
  }

  update(dt) {
    if (!this.active) return;
    const p = this.plane;
    this.state.agl = this.getAgl();
    if (!p.onGround && Math.abs(bankOf(p.quat)) > 0.35) this.state.turned += dt;
    if (STEPS[this.step].done(p, this.state)) {
      this.step++;
      this.box.classList.remove('pop');
      void this.box.offsetWidth; // relance l'animation
      this.box.classList.add('pop');
      if (this.step >= STEPS.length) return this.finish(false);
    }
    this.render();
  }
}
