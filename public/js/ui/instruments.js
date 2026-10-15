// Instruments de vol dessinés sur canvas :
// - PFD (écran principal type « glass cockpit ») : horizon artificiel, échelle de tangage, inclinaison,
//   bille, bandes de vitesse et d'altitude, variomètre, bande de cap ;
// - EIS (moteur et systèmes) : régime, carburant, gaz, trim, volets, facteur de charge ;
// - planche de bord 3D du cockpit (six instruments à aiguilles) en texture.
// Les valeurs affichées suivent l'avion avec un lissage (aiguilles fluides). Lecture seule.
import * as THREE from 'three';

const DEG = 180 / Math.PI;
const FONT = '"B612 Mono", "JetBrains Mono", ui-monospace, Menlo, Consolas, monospace';
const C = {
  sky0: '#1d5fb8', sky1: '#5ea4e8', gnd0: '#8a5a2c', gnd1: '#4e3417', line: '#ffffff', text: '#ffffff',
  panel: 'rgba(8,14,22,0.72)', box: '#05080c', cyan: '#3ee6ff', green: '#43e36b', amber: '#ffb52e', red: '#ff3b30', magenta: '#ff5cf0', dim: '#9fb3c8',
};
const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3();

// état lu sur l'avion (sans le modifier)
export function readFlight(plane) {
  _f.set(0, 0, -1).applyQuaternion(plane.quat);
  _r.set(1, 0, 0).applyQuaternion(plane.quat);
  _u.set(0, 1, 0).applyQuaternion(plane.quat);
  return {
    pitch: Math.asin(THREE.MathUtils.clamp(_f.y, -1, 1)) * DEG,
    bank: Math.atan2(-_r.y, _u.y) * DEG,
    ias: plane.ias, alt: plane.pos.y - plane.S.gear, vs: plane.onGround ? 0 : plane.velocity.y,
    hdg: plane.headingDeg, slip: plane.beta * DEG, g: plane.gLoad,
    rpm: plane.rpm, fuel: plane.fuel, throttle: plane.throttle, trim: plane.trim, flaps: plane.flapDeg,
    gear: plane.gearPos, stall: plane.stallWarning, engine: plane.engineOn, onGround: plane.onGround,
  };
}

// lissage critique (aiguilles qui ne sautent pas) ; angles traités à part
class Smooth {
  constructor() { this.v = null; }
  step(target, dt, k = 10) {
    if (!this.v) { this.v = { ...target }; return this.v; }
    const a = 1 - Math.exp(-dt * k);
    for (const key in target) {
      const t = target[key];
      if (typeof t !== 'number') { this.v[key] = t; continue; }
      if (key === 'hdg') { const d = ((t - this.v.hdg + 540) % 360) - 180; this.v.hdg = (this.v.hdg + d * a + 360) % 360; } else this.v[key] += (t - this.v[key]) * a;
    }
    return this.v;
  }
}

function setupCanvas(cv, w, h) {
  const dpr = Math.min(2, devicePixelRatio || 1);
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

export class Instruments {
  constructor(pfdCanvas, eisCanvas) {
    this.pfd = pfdCanvas;
    this.eis = eisCanvas;
    this.smooth = new Smooth();
    this.panelCanvas = document.createElement('canvas');
    this.panelCanvas.width = 1024; this.panelCanvas.height = 384;
    this.panelTexture = new THREE.CanvasTexture(this.panelCanvas);
    this.panelTexture.colorSpace = THREE.SRGBColorSpace;
    this.panelTimer = 0;
  }

  // units : 'metric' | 'aviation'
  // agl : hauteur au-dessus du sol (m), affichée sous la bande d'altitude près du sol
  update(dt, plane, units, drawPanel, agl = 0) {
    this.S = plane.S; // limites de l'avion piloté (VNE, réservoir, type de moteur)
    const s = this.smooth.step({ ...readFlight(plane), agl }, dt);
    const av = units === 'aviation';
    const u = {
      spd: av ? 1.944 : 3.6, spdName: av ? 'KT' : 'KM/H',
      alt: av ? 3.281 : 1, altName: av ? 'FT' : 'M',
      vs: av ? 196.85 : 1, vsName: av ? 'FT/MIN' : 'M/S',
    };
    const W = this.pfd.clientWidth || 440, H = this.pfd.clientHeight || 300;
    this.drawPFD(setupCanvas(this.pfd, W, H), W, H, s, u);
    const W2 = this.eis.clientWidth || 150, H2 = this.eis.clientHeight || 300;
    this.drawEIS(setupCanvas(this.eis, W2, H2), W2, H2, s);
    this.panelTimer -= dt;
    if (drawPanel && this.panelTimer <= 0) { this.panelTimer = 1 / 20; this.drawPanel(s, u); }
  }

  // ---------- écran principal ----------
  drawPFD(ctx, W, H, s, u) {
    ctx.clearRect(0, 0, W, H);
    const tapeW = Math.round(W * 0.16), hdgH = Math.round(H * 0.12);
    const ax = tapeW + 6, aw = W - 2 * tapeW - 12, ah = H - hdgH - 4;
    const cx = ax + aw / 2, cy = ah / 2;
    const ppd = ah / 50; // pixels par degré de tangage
    // --- horizon artificiel ---
    ctx.save();
    roundRect(ctx, ax, 0, aw, ah, 10);
    ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate(-s.bank / DEG);
    ctx.translate(0, s.pitch * ppd);
    const big = Math.max(W, H) * 2;
    let g = ctx.createLinearGradient(0, -big / 2, 0, 0);
    g.addColorStop(0, C.sky0); g.addColorStop(1, C.sky1);
    ctx.fillStyle = g; ctx.fillRect(-big, -big, big * 2, big);
    g = ctx.createLinearGradient(0, 0, 0, big / 2);
    g.addColorStop(0, C.gnd0); g.addColorStop(1, C.gnd1);
    ctx.fillStyle = g; ctx.fillRect(-big, 0, big * 2, big);
    ctx.strokeStyle = C.line; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-big, 0); ctx.lineTo(big, 0); ctx.stroke();
    // échelle de tangage
    ctx.font = `600 ${Math.round(ah * 0.045)}px ${FONT}`;
    ctx.fillStyle = C.text; ctx.textBaseline = 'middle';
    ctx.lineWidth = 1.5;
    for (let p = -90; p <= 90; p += 2.5) {
      if (p === 0 || Math.abs(p - s.pitch) > 22) continue;
      const y = -p * ppd;
      const major = p % 10 === 0, mid = p % 5 === 0;
      const len = major ? aw * 0.22 : mid ? aw * 0.12 : aw * 0.06;
      ctx.beginPath(); ctx.moveTo(-len / 2, y); ctx.lineTo(len / 2, y); ctx.stroke();
      if (major) { ctx.textAlign = 'right'; ctx.fillText(Math.abs(p), -len / 2 - 4, y); ctx.textAlign = 'left'; ctx.fillText(Math.abs(p), len / 2 + 4, y); }
    }
    ctx.restore();
    // --- échelle d'inclinaison ---
    ctx.save();
    ctx.translate(cx, cy);
    const R = ah * 0.42;
    ctx.strokeStyle = C.line; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, R, (-150 * Math.PI) / 180, (-30 * Math.PI) / 180); ctx.stroke();
    for (const b of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) {
      const a = ((b - 90) * Math.PI) / 180, l = Math.abs(b) % 30 === 0 ? 12 : 7;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * R, Math.sin(a) * R); ctx.lineTo(Math.cos(a) * (R + l), Math.sin(a) * (R + l)); ctx.stroke();
    }
    ctx.rotate(-s.bank / DEG);
    ctx.fillStyle = Math.abs(s.bank) > 45 ? C.amber : C.text;
    ctx.beginPath(); ctx.moveTo(0, -R + 2); ctx.lineTo(-8, -R + 14); ctx.lineTo(8, -R + 14); ctx.closePath(); ctx.fill();
    // bille (dérapage)
    const sx = THREE.MathUtils.clamp(-s.slip * 1.6, -14, 14);
    ctx.fillRect(-10 + sx, -R + 17, 20, 4);
    ctx.restore();
    // symbole avion fixe
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = '#ffd400'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-aw * 0.16, aw * 0.05); ctx.lineTo(-aw * 0.1, aw * 0.05); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(aw * 0.16, aw * 0.05); ctx.lineTo(aw * 0.1, aw * 0.05); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillRect(-aw * 0.3, -2, aw * 0.07, 4); ctx.fillRect(aw * 0.23, -2, aw * 0.07, 4);
    ctx.restore();
    // alarme de décrochage
    if (s.stall) {
      ctx.font = `700 ${Math.round(ah * 0.07)}px ${FONT}`;
      ctx.fillStyle = C.red; ctx.textAlign = 'center';
      ctx.fillText('STALL', cx, cy + ah * 0.28);
    }
    // facteur de charge
    ctx.font = `600 ${Math.round(ah * 0.045)}px ${FONT}`;
    ctx.textAlign = 'left'; ctx.fillStyle = Math.abs(s.g) > 3.5 ? C.amber : C.dim;
    ctx.fillText(`${s.g.toFixed(1)} G`, ax + 8, ah - 12);

    // --- bandes de vitesse et d'altitude ---
    const spd = s.ias * u.spd;
    this.tape(ctx, 0, 0, tapeW, ah, spd, u.spd === 3.6 ? 10 : 5, u.spd === 3.6 ? 4.2 : 7, u.spdName, (v) => {
      const ms = v / u.spd;
      if (ms > this.S.vne) return C.red;
      if (ms > this.S.vne * 0.85) return C.amber;
      return ms < 25 ? null : C.green;
    }, true);
    const alt = s.alt * u.alt;
    this.tape(ctx, W - tapeW, 0, tapeW, ah, alt, u.alt === 1 ? 20 : 100, u.alt === 1 ? 2.2 : 0.45, u.altName, null, false);
    if (s.agl < 750) {
      ctx.font = `700 ${Math.round(ah * 0.05)}px ${FONT}`;
      ctx.textAlign = 'center'; ctx.fillStyle = s.agl < 60 && !s.onGround ? C.amber : C.green;
      ctx.fillText(`SOL ${Math.round(s.agl * u.alt)}`, W - tapeW / 2, 14);
    }
    // variomètre
    const vs = s.vs * u.vs;
    ctx.fillStyle = C.panel;
    const vx = W - tapeW - 10;
    const vScale = u.vs === 1 ? 10 : 2000;
    const vy = THREE.MathUtils.clamp(-vs / vScale, -1, 1) * ah * 0.4;
    ctx.fillStyle = vs > 0 ? C.green : C.cyan;
    ctx.fillRect(vx, cy + Math.min(0, vy), 5, Math.abs(vy));
    ctx.font = `600 ${Math.round(ah * 0.045)}px ${FONT}`;
    ctx.textAlign = 'right'; ctx.fillStyle = C.text;
    ctx.fillText(`${vs >= 0 ? '+' : ''}${u.vs === 1 ? vs.toFixed(1) : Math.round(vs / 10) * 10}`, W - tapeW - 14, cy + (vs >= 0 ? -ah * 0.42 : ah * 0.42));

    // --- bande de cap ---
    const hy = H - hdgH;
    ctx.fillStyle = C.panel;
    roundRect(ctx, ax, hy, aw, hdgH, 8); ctx.fill();
    ctx.save();
    roundRect(ctx, ax, hy, aw, hdgH, 8); ctx.clip();
    ctx.strokeStyle = C.line; ctx.fillStyle = C.text; ctx.lineWidth = 1.5;
    ctx.font = `600 ${Math.round(hdgH * 0.38)}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const pxDeg = aw / 70;
    for (let d = Math.floor(s.hdg - 40); d <= s.hdg + 40; d++) {
      if (d % 5) continue;
      const x = cx + (d - s.hdg) * pxDeg;
      const hd = ((d % 360) + 360) % 360;
      ctx.beginPath(); ctx.moveTo(x, hy); ctx.lineTo(x, hy + (hd % 10 ? 5 : 9)); ctx.stroke();
      if (hd % 30 === 0) ctx.fillText({ 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[hd] ?? String(hd / 10), x, hy + hdgH * 0.62);
    }
    ctx.restore();
    ctx.fillStyle = C.box; ctx.strokeStyle = C.line;
    roundRect(ctx, cx - 26, hy - 2, 52, hdgH * 0.62, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.text; ctx.textAlign = 'center';
    ctx.fillText(String(Math.round(s.hdg) % 360).padStart(3, '0'), cx, hy + hdgH * 0.28);
  }

  // bande déroulante (vitesse à gauche, altitude à droite)
  tape(ctx, x, y, w, h, value, step, pxPerUnit, label, colorOf, left) {
    ctx.save();
    ctx.fillStyle = C.panel;
    roundRect(ctx, x, y, w, h, 8); ctx.fill();
    roundRect(ctx, x, y, w, h, 8); ctx.clip();
    const cy = y + h / 2;
    ctx.strokeStyle = C.line; ctx.fillStyle = C.text; ctx.lineWidth = 1.5;
    ctx.font = `600 ${Math.round(h * 0.05)}px ${FONT}`;
    ctx.textBaseline = 'middle'; ctx.textAlign = left ? 'right' : 'left';
    const span = h / 2 / pxPerUnit;
    if (colorOf) {
      for (let v = Math.floor((value - span) / 2) * 2; v < value + span; v += 2) {
        const c = colorOf(v);
        if (!c) continue;
        ctx.fillStyle = c;
        const yy = cy - (v - value) * pxPerUnit;
        ctx.fillRect(left ? x + w - 6 : x, yy - 2 * pxPerUnit, 6, 2 * pxPerUnit + 0.5);
      }
      ctx.fillStyle = C.text;
    }
    for (let v = Math.floor((value - span) / step) * step; v <= value + span; v += step) {
      if (v < 0 && colorOf) continue;
      const yy = cy - (v - value) * pxPerUnit;
      const major = Math.round(v / step) % 2 === 0;
      ctx.beginPath();
      if (left) { ctx.moveTo(x + w - 6, yy); ctx.lineTo(x + w - (major ? 16 : 11), yy); } else { ctx.moveTo(x, yy); ctx.lineTo(x + (major ? 10 : 5), yy); }
      ctx.stroke();
      if (major) ctx.fillText(String(Math.round(v)), left ? x + w - 20 : x + 14, yy);
    }
    ctx.restore();
    // fenêtre de lecture
    const bh = h * 0.12;
    ctx.fillStyle = C.box; ctx.strokeStyle = C.line; ctx.lineWidth = 1.5;
    roundRect(ctx, x + 2, cy - bh / 2, w - 4, bh, 5); ctx.fill(); ctx.stroke();
    ctx.fillStyle = colorOf?.(value) === C.red ? C.red : C.text;
    ctx.font = `700 ${Math.round(bh * 0.6)}px ${FONT}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(Math.round(value)), x + w / 2, cy + 1);
    ctx.font = `600 ${Math.round(h * 0.04)}px ${FONT}`;
    ctx.fillStyle = 'rgba(5,8,12,0.85)';
    roundRect(ctx, x + 3, y + h - 20, w - 6, 17, 4); ctx.fill();
    ctx.fillStyle = C.cyan;
    ctx.fillText(label, x + w / 2, y + h - 11);
  }

  // ---------- moteur et systèmes ----------
  drawEIS(ctx, W, H, s) {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = C.panel;
    roundRect(ctx, 0, 0, W, H, 10); ctx.fill();
    const pad = 10, fs = Math.max(10, Math.round(W * 0.08));
    // régime (cadran) : tours/minute pour une hélice, % N1 pour un réacteur
    const jet = this.S.engine === 'jet';
    const rpm = jet ? s.rpm * 100 : s.rpm * 2700, top = jet ? 105 : 2900;
    const R = W * 0.3, gx = W / 2, gy = R + 14;
    const a0 = Math.PI * 0.8, a1 = Math.PI * 2.2;
    const ang = (v) => a0 + (a1 - a0) * Math.min(1, v / top);
    ctx.lineWidth = 7;
    const arcs = jet ? [[0, 70, '#2c3a46'], [70, 100, C.green], [100, 105, C.red]] : [[0, 2100, '#2c3a46'], [2100, 2700, C.green], [2700, 2900, C.red]];
    for (const [from, to, col] of arcs) {
      ctx.strokeStyle = col; ctx.beginPath(); ctx.arc(gx, gy, R, ang(from), ang(to)); ctx.stroke();
    }
    ctx.strokeStyle = C.text; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + Math.cos(ang(rpm)) * (R - 4), gy + Math.sin(ang(rpm)) * (R - 4)); ctx.stroke();
    ctx.fillStyle = C.text; ctx.font = `700 ${fs + 2}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(jet ? `${Math.round(rpm)}` : String(Math.round(rpm / 10) * 10), gx, gy + R * 0.55);
    ctx.font = `600 ${fs - 2}px ${FONT}`; ctx.fillStyle = C.cyan;
    ctx.fillText(jet ? 'N1 %' : 'TR/MIN', gx, gy + R * 0.95);
    // barres : carburant, gaz, trim
    let y = gy + R + 22;
    const bar = (label, frac, col, text, center = false) => {
      ctx.textAlign = 'left'; ctx.fillStyle = C.dim; ctx.font = `600 ${fs - 1}px ${FONT}`;
      ctx.fillText(label, pad, y);
      ctx.textAlign = 'right'; ctx.fillStyle = C.text;
      ctx.fillText(text, W - pad, y);
      y += fs * 0.9;
      ctx.fillStyle = '#26323d';
      roundRect(ctx, pad, y, W - 2 * pad, 7, 3.5); ctx.fill();
      ctx.fillStyle = col;
      if (center) { const xx = pad + (W - 2 * pad) * frac; ctx.fillRect(xx - 2, y - 2, 4, 11); } else { roundRect(ctx, pad, y, Math.max(7, (W - 2 * pad) * frac), 7, 3.5); ctx.fill(); }
      y += fs * 1.6;
    };
    const fuelFrac = s.fuel / this.S.fuelCapacity;
    bar('CARB', fuelFrac, fuelFrac < 0.05 ? C.red : fuelFrac < 0.15 ? C.amber : C.green, `${Math.round(s.fuel)} L`);
    bar('GAZ', s.throttle, C.cyan, `${Math.round(s.throttle * 100)} %`);
    bar('TRIM', 0.5 + s.trim, C.text, s.trim > 0.01 ? 'CABRÉ' : s.trim < -0.01 ? 'PIQUÉ' : 'NEUTRE', true);
    // volets
    ctx.textAlign = 'left'; ctx.fillStyle = C.dim; ctx.fillText('VOLETS', pad, y);
    ctx.textAlign = 'right'; ctx.fillStyle = C.text; ctx.fillText(`${Math.round(s.flaps)}°`, W - pad, y);
  }

  // ---------- planche de bord 3D (six instruments à aiguilles) ----------
  drawPanel(s, u) {
    const ctx = this.panelCanvas.getContext('2d');
    const W = 1024, H = 384;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#2b3036'); g.addColorStop(1, '#1d2125');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const r = 70;
    const dial = (x, y, draw, label) => {
      ctx.save(); ctx.translate(x, y);
      ctx.fillStyle = '#0b0c0e'; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#6b7178'; ctx.lineWidth = 6; ctx.stroke();
      draw();
      ctx.fillStyle = '#c8ced6'; ctx.font = '600 15px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(label, 0, r * 0.62);
      ctx.restore();
    };
    const ticks = (n, from, to, len = 10) => {
      ctx.strokeStyle = '#e8e8e8'; ctx.lineWidth = 2;
      for (let i = 0; i <= n; i++) { const a = from + (to - from) * (i / n); ctx.beginPath(); ctx.moveTo(Math.cos(a) * (r - 6), Math.sin(a) * (r - 6)); ctx.lineTo(Math.cos(a) * (r - 6 - len), Math.sin(a) * (r - 6 - len)); ctx.stroke(); }
    };
    const needle = (a, len = r - 14, w = 4, col = '#ffffff') => {
      ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-Math.cos(a) * 12, -Math.sin(a) * 12); ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len); ctx.stroke();
      ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill();
    };
    const top = 100, bot = 280, cols = [130, 300, 470];
    const spd = s.ias * u.spd;
    dial(cols[0], top, () => { ticks(20, -Math.PI * 1.25, Math.PI * 0.25); needle(-Math.PI * 1.25 + Math.min(1, spd / (u.spd === 3.6 ? 320 : 170)) * Math.PI * 1.5); }, u.spdName);
    dial(cols[1], top, () => {
      ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r - 4, 0, Math.PI * 2); ctx.clip();
      ctx.rotate(-s.bank / DEG); ctx.translate(0, s.pitch * 2.2);
      ctx.fillStyle = '#2e6fc0'; ctx.fillRect(-200, -200, 400, 200);
      ctx.fillStyle = '#7a4a1e'; ctx.fillRect(-200, 0, 400, 200);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-200, 0); ctx.lineTo(200, 0); ctx.stroke();
      for (const p of [-20, -10, 10, 20]) { ctx.beginPath(); ctx.moveTo(-18, -p * 2.2); ctx.lineTo(18, -p * 2.2); ctx.stroke(); }
      ctx.restore();
      ctx.strokeStyle = '#ffb000'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-36, 0); ctx.lineTo(-10, 0); ctx.lineTo(0, 8); ctx.lineTo(10, 0); ctx.lineTo(36, 0); ctx.stroke();
    }, '');
    dial(cols[2], top, () => {
      ticks(10, -Math.PI / 2, Math.PI * 1.5, 12);
      const alt = s.alt * u.alt;
      needle(-Math.PI / 2 + ((alt % 1000) / 1000) * Math.PI * 2, r - 14, 4);
      needle(-Math.PI / 2 + ((alt % 10000) / 10000) * Math.PI * 2, r * 0.5, 7);
    }, u.altName);
    dial(cols[0], bot, () => {
      ctx.rotate(THREE.MathUtils.clamp(-s.bank / DEG * 0.5, -0.6, 0.6));
      ctx.fillStyle = '#fff'; ctx.fillRect(-40, -4, 80, 8); ctx.fillRect(-4, -14, 8, 12);
      ctx.rotate(-THREE.MathUtils.clamp(-s.bank / DEG * 0.5, -0.6, 0.6));
      ctx.fillStyle = '#ddd'; ctx.beginPath(); ctx.arc(THREE.MathUtils.clamp(-s.slip * 2, -30, 30), 30, 7, 0, Math.PI * 2); ctx.fill();
    }, '');
    dial(cols[1], bot, () => {
      ctx.save(); ctx.rotate(-s.hdg / DEG);
      ctx.fillStyle = '#fff'; ctx.font = '700 18px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const [t, a] of [['N', 0], ['E', 90], ['S', 180], ['W', 270]]) { ctx.save(); ctx.rotate(a / DEG); ctx.fillText(t, 0, -r + 26); ctx.restore(); }
      ticks(36, 0, Math.PI * 2, 8);
      ctx.restore();
      ctx.fillStyle = '#ffb000'; ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(-10, 12); ctx.lineTo(10, 12); ctx.closePath(); ctx.fill();
    }, '');
    dial(cols[2], bot, () => { ticks(12, Math.PI * 0.5, Math.PI * 2.5); needle(Math.PI + THREE.MathUtils.clamp(s.vs / 10, -1, 1) * Math.PI * 0.85); }, u.vsName);
    // moteur : régime et carburant
    dial(700, top, () => { ticks(14, -Math.PI * 1.25, Math.PI * 0.25); needle(-Math.PI * 1.25 + Math.min(1, s.rpm) * Math.PI * 1.5); }, this.S.engine === 'jet' ? 'N1' : 'RPM');
    dial(700, bot, () => { ticks(4, -Math.PI * 0.75, -Math.PI * 0.25); needle(-Math.PI * 0.75 + (s.fuel / this.S.fuelCapacity) * Math.PI * 0.5, r - 18, 4, '#ffd04a'); }, 'FUEL');
    // voyants
    const lamp = (x, y, on, col, text) => {
      ctx.fillStyle = on ? col : '#2a2a2a'; ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#c8ced6'; ctx.font = '600 15px sans-serif'; ctx.textAlign = 'left'; ctx.fillText(text, x + 20, y + 5);
    };
    lamp(830, 70, s.gear > 0.99, '#3cff6a', 'TRAIN');
    lamp(830, 120, s.gear > 0.01 && s.gear < 0.99, '#ff4a3a', 'TRANSIT');
    lamp(830, 170, s.stall, '#ff4a3a', 'STALL');
    lamp(830, 220, s.fuel < this.S.fuelCapacity * 0.15, '#ffb000', 'FUEL');
    lamp(830, 270, s.engine, '#3cff6a', 'MOTEUR');
    this.panelTexture.needsUpdate = true;
  }
}
