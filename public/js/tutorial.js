// Tutoriel du premier vol : une bulle explique chaque geste et une flèche animée montre l'élément de l'écran
// concerné (voyant, instrument, mini-carte…). Chaque étape se valide toute seule quand le joueur l'a faite.
// Les touches affichées sont celles du joueur (onglet « Touches », AZERTY ou QWERTY).
import { t } from './i18n.js';
import { kbd } from './keybinds.js';

const $ = (id) => document.getElementById(id);

export class Tutorial {
  // ctx : { plane, agl() → hauteur sol, isPaused() }
  constructor(ctx) {
    this.ctx = ctx;
    this.i = -1;
    this.timer = 0;
    this.active = false;
    this.box = document.createElement('div');
    this.box.id = 'tuto';
    this.box.className = 'glass hidden';
    this.arrow = document.createElement('div');
    this.arrow.id = 'tuto-arrow';
    this.arrow.className = 'hidden';
    this.arrow.innerHTML = '<svg viewBox="0 0 60 60" width="56" height="56"><path d="M30 4 L52 30 H38 V56 H22 V30 H8 Z" fill="#ffd23f" stroke="#1a1a1a" stroke-width="3" stroke-linejoin="round"/></svg>';
    document.body.append(this.box, this.arrow);
    addEventListener('resize', () => this.place());
  }

  // 15 étapes, regroupées : décoller, voler, puis tout ce qu'il faut savoir pour jouer (quêtes, carte, carburant,
  // atterrissage, argent et hangar, multijoueur). skip() : étape inutile pour cet avion (pas de volets…)
  steps() {
    const p = this.ctx.plane;
    let hdg0 = 0, cam0 = '';
    const hasFlaps = () => p.S.flapNotches.length > 1;
    return [
      { text: () => t('👋 Bienvenue à bord ! Ce tutoriel t\'apprend à décoller, voler, atterrir et à gagner tes premiers ₣. Chaque étape se valide toute seule quand tu fais le geste.'), next: true },
      // ----- décoller -----
      { text: () => t('Démarre le moteur : appuie sur {key}. Le voyant MOTEUR passe au vert.', { key: kbd('engine') }), target: '#sys-engine', done: () => p.engineOn },
      { text: () => t('Desserre le frein de parking : {key}.', { key: kbd('parking') }), target: '#sys-park', done: () => !p.parkingBrake },
      { text: () => t('Sors un cran de volets avec {key} : l\'aile porte plus, l\'avion décolle plus tôt.', { key: kbd('flapsDown') }), target: '#sys-flaps', skip: () => !hasFlaps(), done: () => p.flaps > 0 },
      { text: () => t('Mets les gaz à fond : maintiens {key}. La jauge GAZ se remplit.', { key: kbd('throttleUp') }), target: '#eis', at: [0.5, 0.62], done: () => p.throttle > 0.9 },
      { text: () => t('L\'avion accélère sur la piste. Garde-le droit avec {left} / {right}. Vers 100 km/h (vitesse à gauche), tire doucement sur le manche : {up}.', { left: kbd('yawLeft'), right: kbd('yawRight'), up: kbd('pitchUp') }), target: '#pfd', at: [0.08, 0.5], done: () => !p.onGround && this.ctx.agl() > 15 },
      // ----- voler -----
      { text: () => t('🎉 Tu voles ! Rentre les volets ({flaps}) pour aller plus vite. Sur les avions à train rentrant, {gear} rentre aussi le train.', { flaps: kbd('flapsUp'), gear: kbd('gear') }), target: '#sys-flaps', skip: () => !hasFlaps(), done: () => p.flaps === 0 },
      { text: () => t('Monte jusqu\'à 300 m au-dessus du sol (altitude à droite). Astuce : le trim ({up} / {down}) garde le nez en place sans tenir la touche.', { up: kbd('trimUp'), down: kbd('trimDown') }), target: '#pfd', at: [0.92, 0.5], done: () => this.ctx.agl() > 280 },
      {
        text: () => t('Pour tourner, incline l\'avion avec {left} ou {right} (regarde l\'horizon), puis reviens à plat.', { left: kbd('rollLeft'), right: kbd('rollRight') }),
        target: '#pfd', at: [0.5, 0.45],
        start: () => { hdg0 = p.headingDeg; },
        done: () => { const d = Math.abs(((p.headingDeg - hdg0 + 540) % 360) - 180); return d > 35; },
      },
      {
        text: () => t('Change de vue avec {key} : poursuite, cockpit, caméra libre… (la souris ou le stick droit tournent la caméra).', { key: kbd('camera') }),
        target: '#cam-name', start: () => { cam0 = this.ctx.camMode?.() || ''; }, done: () => (this.ctx.camMode?.() || '') !== cam0,
      },
      // ----- jouer -----
      { text: () => t('Les ! jaunes sont des quêtes, les 🔒 des quêtes à débloquer. Ouvre la grande carte avec {map}, puis referme-la. Pendant une quête, une flèche jaune te guide.', { map: kbd('map') }), target: '#minimap', done: () => this.sawMap && this.ctx.isPaused() === false },
      { text: () => t('⛽ Surveille le carburant (CARB). À l\'arrêt sur un aéroport, maintiens {key} pour faire le plein (ça coûte des ₣). Ton carburant est gardé même si tu quittes le jeu.', { key: kbd('refuel') }), target: '#eis', at: [0.5, 0.3], next: true },
      { text: () => t('🛬 Pour atterrir : aligne-toi sur une piste, réduis les gaz ({down}), sors les volets, descends doucement et freine au sol ({brake}). En cas de souci, {respawn} te ramène au dernier aéroport.', { down: kbd('throttleDown'), brake: kbd('brake'), respawn: kbd('respawn') }), next: true },
      { text: () => t('💰 Pose-toi près d\'une balise jaune et appuie sur {board} pour choisir une mission. Les quêtes rapportent des ₣ et débloquent des avions ; dépense-les au hangar (peintures, tenues, caisses). {journal} ouvre ton journal.', { board: kbd('board'), journal: kbd('journal') }), target: '#money', next: true },
      { text: () => t('Ces boutons ouvrent la caméra, la carte, le journal, le chat ({chat}, pour parler aux autres pilotes), le hangar et les réglages. {help} affiche toutes les touches, {esc} met en pause. Bon vol !', { chat: kbd('chat'), help: kbd('help'), esc: '<kbd>Échap</kbd>' }), target: '#toolbar', at: [0.5, 0.0], next: true, last: true },
    ];
  }

  start() {
    this.sawMap = false;
    this.list = this.steps();
    this.active = true;
    this.go(0);
  }
  stop(done = true) {
    this.active = false;
    this.box.classList.add('hidden');
    this.arrow.classList.add('hidden');
    if (done) this.ctx.onDone?.();
  }
  go(i) {
    this.i = i;
    this.timer = 0;
    const s = this.list[i];
    if (!s) return this.stop();
    if (s.skip?.()) return this.go(i + 1);
    s.start?.();
    // numéro affiché sans compter les étapes sautées pour cet avion
    const shown = this.list.filter((x) => !x.skip?.()), n = shown.indexOf(s) + 1;
    this.box.innerHTML = `<div class="tuto-step">${t('Tutoriel')} · ${n}/${shown.length}</div><div class="tuto-text">${s.text()}</div>`
      + `<div class="tuto-btns">${s.next ? `<button id="tuto-next">${s.last ? t('Terminer') : t('Continuer')}</button>` : ''}<button id="tuto-skip" class="secondary">${t('Passer le tutoriel')}</button></div>`;
    this.box.classList.remove('hidden');
    if ($('tuto-next')) $('tuto-next').onclick = () => this.go(i + 1);
    $('tuto-skip').onclick = () => this.stop();
    this.place();
  }
  // bulle au centre en haut ; flèche à côté de l'élément visé, pointée vers lui
  place() {
    if (!this.active) return;
    const s = this.list[this.i];
    const el = s?.target && document.querySelector(s.target);
    const r = el?.getBoundingClientRect();
    if (!r || !r.width || getComputedStyle(el).display === 'none' || el.closest('.hidden')) { this.arrow.classList.add('hidden'); return; }
    const [fx, fy] = s.at || [0.5, 0.5];
    const tx = r.left + r.width * fx, ty = r.top + r.height * fy;
    // la flèche arrive du côté où il y a le plus de place
    const fromAbove = ty > innerHeight * 0.45;
    const fromLeft = tx > innerWidth * 0.6;
    const dx = fromLeft ? -1 : tx < innerWidth * 0.3 ? 1 : 0, dy = fromAbove ? -1 : 1;
    const len = Math.hypot(dx, dy) || 1, dist = 46;
    const ax = tx + (dx / len) * dist, ay = ty + (dy / len) * dist;
    const angle = Math.atan2(-(dy / len), -(dx / len)) * 180 / Math.PI + 90; // la pointe (vers le haut dans le SVG) vise la cible
    this.arrow.style.left = `${ax - 28}px`;
    this.arrow.style.top = `${ay - 28}px`;
    this.arrow.style.setProperty('--rot', `${angle}deg`);
    this.arrow.classList.remove('hidden');
  }
  // caché pendant la pause, les menus et le hangar (l'étape en cours est gardée)
  setHidden(h) {
    if (!this.active) return;
    this.wasPaused = h;
    this.box.classList.toggle('hidden', h);
    if (h) this.arrow.classList.add('hidden'); else this.place();
  }
  update(dt) {
    if (!this.active) return;
    const paused = this.ctx.isPaused();
    if (paused !== this.wasPaused) { this.wasPaused = paused; this.setHidden(paused); }
    if (paused) return;
    const s = this.list[this.i];
    this.timer += dt;
    this.place();
    if (s?.done && this.timer > 0.8 && s.done()) this.go(this.i + 1);
  }
}
