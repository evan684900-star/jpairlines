// Manette Xbox / PlayStation (API Gamepad des navigateurs, disposition « standard »).
// En vol : stick gauche = manche, gâchettes = gaz, stick droit = caméra, boutons = actions (modifiables).
// Dans les menus : stick ou croix pour choisir, A / ✕ pour valider, B / ○ pour revenir.
import { pad } from './keybinds.js';

const DEAD = 0.12;
const dead = (v) => (Math.abs(v) < DEAD ? 0 : Math.sign(v) * (Math.abs(v) - DEAD) / (1 - DEAD));
const LAYER = 8; // Vue / Share / Create : maintenu, donne une deuxième série d'actions

const isPS = (id) => /054c|playstation|dualsense|dualshock|wireless controller/i.test(id);

export class Gamepads {
  // h : { press(k), release(k) } appelés pour chaque bouton (k = 'p0', 'p8+3'…)
  constructor(h) {
    this.h = h;
    this.prev = [];
    this.held = new Set(); // boutons maintenus (noms 'pN' ou 'p8+N')
    this.layerUsed = false;
    this.axes = { lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0 };
    this.nav = { dir: null, t: 0 };
    addEventListener('gamepadconnected', (e) => this.h.connected?.(e.gamepad));
    addEventListener('gamepaddisconnected', () => { if (!this.current()) { pad.connected = false; pad.active = false; this.releaseAll(); } });
    // dès que le clavier ou la souris servent, les messages montrent de nouveau les touches du clavier
    for (const ev of ['keydown', 'pointerdown']) addEventListener(ev, () => { pad.active = false; }, { capture: true, passive: true });
  }
  current() {
    const list = navigator.getGamepads?.() || [];
    let best = null;
    for (const g of list) if (g && g.connected && (!best || g.timestamp > best.timestamp)) best = g;
    return best;
  }
  releaseAll() {
    for (const k of this.held) this.h.release(k);
    this.held.clear();
    this.prev = [];
  }
  poll() {
    const g = this.current();
    if (!g) { pad.connected = false; return; }
    pad.connected = true;
    pad.style = isPS(g.id) ? 'ps' : 'xbox';
    const std = g.mapping === 'standard';
    const btn = (i) => { const b = g.buttons[i]; return !!b && (b.pressed || b.value > 0.5); };
    const ax = (i) => dead(g.axes[i] || 0);
    const a = this.axes;
    a.lx = ax(0); a.ly = ax(1); a.rx = ax(2); a.ry = ax(3);
    // gâchettes analogiques (boutons 6 et 7 en disposition standard)
    a.lt = std ? (g.buttons[6]?.value || 0) : 0;
    a.rt = std ? (g.buttons[7]?.value || 0) : 0;
    let moved = Math.abs(a.lx) + Math.abs(a.ly) + Math.abs(a.rx) + Math.abs(a.ry) + a.lt + a.rt > 0.3;
    const layer = btn(LAYER);
    for (let i = 0; i < g.buttons.length; i++) {
      const on = btn(i), was = !!this.prev[i];
      this.prev[i] = on;
      if (on === was || i === 6 || i === 7) continue;
      moved = true;
      if (i === LAYER) {
        if (on) this.layerUsed = false;
        // Vue seul (relâché sans autre bouton) : action simple
        else if (!this.layerUsed) { this.h.press('p8'); this.h.release('p8'); }
        continue;
      }
      if (on) {
        const k = layer ? `p${LAYER}+${i}` : `p${i}`;
        if (layer) this.layerUsed = true;
        this.held.add(k);
        this.h.press(k);
      } else {
        for (const k of [`p${i}`, `p${LAYER}+${i}`]) if (this.held.delete(k)) this.h.release(k);
      }
    }
    if (moved) pad.active = true;
  }
  // direction pour naviguer dans les menus (croix ou stick gauche), répétée si on la maintient
  navDir(dt) {
    const g = this.current();
    if (!g) return null;
    const b = (i) => !!g.buttons[i]?.pressed;
    const a = this.axes;
    const d = b(12) || a.ly < -0.6 ? 'up' : b(13) || a.ly > 0.6 ? 'down' : b(14) || a.lx < -0.6 ? 'left' : b(15) || a.lx > 0.6 ? 'right' : null;
    if (d !== this.nav.dir) { this.nav.dir = d; this.nav.t = 0.4; return d; }
    if (!d) return null;
    this.nav.t -= dt;
    if (this.nav.t <= 0) { this.nav.t = 0.12; return d; }
    return null;
  }
  rumble(strength, ms) {
    const g = this.current();
    try { g?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: Math.min(1, strength), weakMagnitude: Math.min(1, strength * 0.6) }); } catch { /* pas de vibrations */ }
  }
}

// ----- Navigation dans les menus à la manette -----
const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
const visible = (el) => {
  if (!el.getClientRects().length) return false;
  const st = getComputedStyle(el);
  return st.visibility !== 'hidden' && st.pointerEvents !== 'none' && !el.closest('.hidden');
};
export function focusables(root) {
  return [...root.querySelectorAll(FOCUSABLE)].filter(visible);
}
// élément le plus proche dans la direction voulue
export function moveFocus(root, dir) {
  const list = focusables(root);
  if (!list.length) return null;
  const cur = list.includes(document.activeElement) ? document.activeElement : null;
  if (!cur) return focusEl(list[0]);
  // curseur de réglage : gauche / droite changent la valeur
  if (cur.type === 'range' && (dir === 'left' || dir === 'right')) {
    if (dir === 'left') cur.stepDown(); else cur.stepUp();
    cur.dispatchEvent(new Event('input', { bubbles: true }));
    cur.dispatchEvent(new Event('change', { bubbles: true }));
    return cur;
  }
  const r = cur.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const [dx, dy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
  let best = null, bestScore = Infinity;
  for (const el of list) {
    if (el === cur) continue;
    const q = el.getBoundingClientRect();
    const ex = q.left + q.width / 2, ey = q.top + q.height / 2;
    const along = (ex - cx) * dx + (ey - cy) * dy;
    if (along <= 4) continue;
    const across = Math.abs((ex - cx) * dy) + Math.abs((ey - cy) * dx);
    const score = along + across * 2.5;
    if (score < bestScore) { bestScore = score; best = el; }
  }
  return best ? focusEl(best) : cur;
}
function focusEl(el) {
  document.querySelector('.pad-focus')?.classList.remove('pad-focus');
  el.classList.add('pad-focus');
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  return el;
}
export function clearPadFocus() { document.querySelector('.pad-focus')?.classList.remove('pad-focus'); }
