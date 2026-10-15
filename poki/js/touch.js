// Commandes tactiles (téléphone, tablette) : manche virtuel à gauche, manette des gaz et boutons à droite.
// Elles s'affichent dès qu'on touche l'écran (ou sur un appareil tactile), et remplacent le clavier.
import { tr } from './i18n.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
// capture du doigt (suivi même s'il sort de la zone) ; sans effet si le navigateur la refuse
const capture = (el, e) => { try { el.setPointerCapture(e.pointerId); } catch { /* pas de capture */ } };

export class TouchControls {
  // press(key) : simule une touche du clavier (mêmes actions que sur ordinateur)
  constructor(press) {
    this.press = press;
    this.enabled = false;
    this.stick = { x: 0, y: 0 }; // -1..1 (y > 0 = manche tiré = cabrer)
    this.throttle = null; // position de la manette 0..1 (null = pas encore touchée)
    this.brake = false;
    this.build();
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    if (coarse) this.enable();
    addEventListener('touchstart', () => this.enable(), { once: true, passive: true });
  }

  enable() {
    if (this.enabled) return;
    this.enabled = true;
    document.body.classList.add('touch');
  }

  build() {
    const root = document.createElement('div');
    root.id = 'touch-ui';
    root.innerHTML = `
      <div class="t-stick" id="t-stick"><div class="t-knob"></div><span>${tr('MANCHE', 'STICK')}</span></div>
      <div class="t-right">
        <div class="t-buttons">
          <button data-k="e">${tr('Moteur', 'Engine')}<b>E</b></button>
          <button data-k="p">${tr('Frein park.', 'Park brake')}<b>P</b></button>
          <button data-k="g">${tr('Train', 'Gear')}<b>G</b></button>
          <button data-k="f">${tr('Volets +', 'Flaps +')}<b>F</b></button>
          <button data-k="v">${tr('Volets −', 'Flaps −')}<b>V</b></button>
          <button data-k="x">${tr('Larguer', 'Drop')}<b>X</b></button>
          <button data-k="Enter">${tr('Missions', 'Missions')}<b>⏎</b></button>
          <button data-k="c">${tr('Caméra', 'Camera')}<b>C</b></button>
          <button id="t-brake" class="t-hold">${tr('Freins', 'Brakes')}<b>⏸</b></button>
        </div>
        <div class="t-throttle" id="t-throttle"><div class="t-fill"></div><div class="t-handle"></div><span>${tr('GAZ', 'THROTTLE')}</span></div>
      </div>
      <button class="t-respawn" data-k="r">${tr('Repartir', 'Restart')} (R)</button>`;
    document.body.appendChild(root);
    this.root = root;

    // boutons : une pression = une touche
    for (const b of root.querySelectorAll('[data-k]')) {
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.press(b.dataset.k); b.classList.add('on'); setTimeout(() => b.classList.remove('on'), 150); });
    }
    // freins : maintenir
    const brake = root.querySelector('#t-brake');
    const setBrake = (v) => { this.brake = v; brake.classList.toggle('on', v); };
    brake.addEventListener('pointerdown', (e) => { e.preventDefault(); capture(brake, e); setBrake(true); });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) brake.addEventListener(ev, () => setBrake(false));

    // manche : glisser depuis le point touché, rayon ~60 px, retour au centre quand on lâche
    const stick = root.querySelector('#t-stick'), knob = stick.querySelector('.t-knob');
    let origin = null;
    const moveStick = (e) => {
      if (!origin) return;
      const R = Math.min(70, stick.clientWidth * 0.38);
      const dx = clamp((e.clientX - origin.x) / R, -1, 1), dy = clamp((e.clientY - origin.y) / R, -1, 1);
      this.stick.x = dx; this.stick.y = dy;
      knob.style.transform = `translate(${dx * R}px, ${dy * R}px)`;
    };
    stick.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      capture(stick, e);
      const r = knob.getBoundingClientRect();
      origin = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      stick.classList.add('active');
      moveStick(e);
    });
    stick.addEventListener('pointermove', moveStick);
    const release = () => { origin = null; this.stick.x = this.stick.y = 0; knob.style.transform = ''; stick.classList.remove('active'); };
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) stick.addEventListener(ev, release);

    // manette des gaz : position absolue (haut = plein gaz), reste où on la laisse
    const thr = root.querySelector('#t-throttle');
    const setThr = (e) => {
      const r = thr.getBoundingClientRect();
      this.throttle = clamp(1 - (e.clientY - r.top) / r.height, 0, 1);
      this.drawThrottle(this.throttle);
    };
    thr.addEventListener('pointerdown', (e) => { e.preventDefault(); capture(thr, e); setThr(e); thr.dragging = true; });
    thr.addEventListener('pointermove', (e) => { if (thr.dragging) setThr(e); });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) thr.addEventListener(ev, () => { thr.dragging = false; });
    this.thrEl = thr;
  }

  drawThrottle(v) {
    this.thrEl.querySelector('.t-fill').style.height = `${v * 100}%`;
    this.thrEl.querySelector('.t-handle').style.bottom = `calc(${v * 100}% - 14px)`;
  }

  // entrées pour la simulation (mêmes conventions que le clavier) ; plane : pour suivre la manette des gaz
  input(plane) {
    if (!this.enabled) return null;
    if (this.throttle === null) this.sync(plane);
    const curve = (v) => Math.sign(v) * Math.abs(v) ** 1.4; // plus de précision près du centre
    return {
      pitch: curve(this.stick.y),
      roll: curve(this.stick.x),
      yaw: plane.onGround ? this.stick.x : 0, // au sol, le manche dirige aussi la roue avant
      throttle: clamp((this.throttle - plane.throttle) * 12, -1, 1),
      brake: this.brake,
    };
  }

  // la manette reprend la position des gaz de l'avion (réapparition, changement d'avion)
  sync(plane) {
    this.throttle = plane.throttle;
    this.drawThrottle(this.throttle);
  }

  setCrashed(v) { this.root.classList.toggle('crashed', v); }
}
