// Dessins des autocollants (canvas 256 × 256, centre en 0,0) et textures prêtes pour three.js.
// Chaque dessin utilise la couleur choisie (col) et une couleur de contour (ink) pour rester lisible.
import * as THREE from 'three';

const star = (n, r1, r2, rot = -Math.PI / 2) => {
  const p = new Path2D();
  for (let k = 0; k < n * 2; k++) {
    const r = k % 2 ? r2 : r1, a = rot + (k / (n * 2)) * Math.PI * 2;
    k ? p.lineTo(Math.cos(a) * r, Math.sin(a) * r) : p.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  p.closePath();
  return p;
};
const poly = (pts) => { const p = new Path2D(); pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y))); p.closePath(); return p; };
const circle = (x, y, r) => { const p = new Path2D(); p.arc(x, y, r, 0, Math.PI * 2); return p; };

// chaque dessin : (x = contexte, col, ink, texte) ; trait épais d'abord, remplissage ensuite
const fillStroke = (x, path, col, ink, w = 10) => { x.lineJoin = 'round'; x.lineWidth = w; x.strokeStyle = ink; x.stroke(path); x.fillStyle = col; x.fill(path); };

const DRAW = {
  etoile: (x, c, k) => fillStroke(x, star(5, 112, 46), c, k),
  coeur: (x, c, k) => { const p = new Path2D(); p.moveTo(0, 100); p.bezierCurveTo(-150, 0, -90, -120, 0, -50); p.bezierCurveTo(90, -120, 150, 0, 0, 100); fillStroke(x, p, c, k); },
  eclair: (x, c, k) => fillStroke(x, poly([[20, -118], [-62, 14], [-6, 14], [-30, 118], [62, -20], [6, -20], [34, -118]]), c, k),
  cocarde: (x, c, k) => { fillStroke(x, circle(0, 0, 112), c, k); x.fillStyle = '#f4f4f0'; x.fill(circle(0, 0, 74)); x.fillStyle = c; x.fill(circle(0, 0, 38)); },
  cible: (x, c, k) => { for (const [r, f] of [[112, c], [84, '#f4f4f0'], [56, c], [28, '#f4f4f0']]) { x.fillStyle = f; x.fill(circle(0, 0, r)); } x.lineWidth = 6; x.strokeStyle = k; x.stroke(circle(0, 0, 112)); },
  couronne: (x, c, k) => { fillStroke(x, poly([[-100, 70], [-110, -60], [-50, 0], [0, -95], [50, 0], [110, -60], [100, 70]]), c, k); x.fillStyle = k; for (const px of [-55, 0, 55]) x.fill(circle(px, 40, 10)); },
  flamme: (x, c, k) => {
    const p = new Path2D();
    p.moveTo(0, 115); p.bezierCurveTo(-95, 100, -90, 10, -40, -40); p.bezierCurveTo(-30, 0, -10, 10, -5, 20);
    p.bezierCurveTo(-20, -40, 10, -80, 15, -118); p.bezierCurveTo(60, -60, 100, 0, 75, 60); p.bezierCurveTo(65, 95, 35, 115, 0, 115);
    fillStroke(x, p, c, k);
    const q = new Path2D(); q.moveTo(0, 105); q.bezierCurveTo(-45, 95, -40, 40, -5, 10); q.bezierCurveTo(10, 40, 45, 50, 35, 85); q.bezierCurveTo(25, 100, 15, 105, 0, 105);
    x.fillStyle = '#ffe27a'; x.fill(q);
  },
  ailes: (x, c, k) => {
    const p = new Path2D();
    p.moveTo(-122, -10); p.quadraticCurveTo(-60, -75, 0, -22); p.quadraticCurveTo(60, -75, 122, -10);
    p.quadraticCurveTo(60, 12, 0, 40); p.quadraticCurveTo(-60, 12, -122, -10);
    fillStroke(x, p, c, k);
    x.fillStyle = k; x.font = 'bold 54px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('JP', 0, 8);
  },
  crane: (x, c, k) => {
    const p = new Path2D(); p.arc(0, -20, 85, Math.PI * 0.85, Math.PI * 2.15); p.lineTo(45, 75); p.lineTo(-45, 75); p.closePath();
    fillStroke(x, p, c, k);
    x.fillStyle = k; x.fill(circle(-34, -15, 22)); x.fill(circle(34, -15, 22)); x.fill(poly([[0, 15], [-12, 38], [12, 38]]));
    for (let i = -2; i <= 2; i++) x.fillRect(i * 16 - 3, 55, 6, 22);
  },
  requin: (x, c, k) => {
    const p = new Path2D(); p.moveTo(-120, 10); p.quadraticCurveTo(-40, -55, 70, -20); p.lineTo(40, -95); p.lineTo(95, -15);
    p.quadraticCurveTo(115, -5, 120, 10); p.lineTo(85, 20); p.lineTo(110, 70); p.lineTo(60, 30); p.quadraticCurveTo(-40, 55, -120, 10);
    fillStroke(x, p, c, k);
    x.fillStyle = k; x.fill(circle(-80, -2, 7));
  },
  aigle: (x, c, k) => {
    const p = new Path2D(); p.moveTo(0, -40); p.quadraticCurveTo(-40, -90, -125, -70); p.quadraticCurveTo(-90, -40, -95, -20);
    p.quadraticCurveTo(-60, -25, -45, 0); p.quadraticCurveTo(-30, 40, -20, 60); p.lineTo(-30, 110); p.lineTo(0, 85); p.lineTo(30, 110); p.lineTo(20, 60);
    p.quadraticCurveTo(30, 40, 45, 0); p.quadraticCurveTo(60, -25, 95, -20); p.quadraticCurveTo(90, -40, 125, -70); p.quadraticCurveTo(40, -90, 0, -40);
    fillStroke(x, p, c, k);
    x.fillStyle = '#f4f4f0'; x.fill(circle(0, -55, 22)); x.fillStyle = '#f2c21b'; x.fill(poly([[0, -45], [18, -40], [0, -30]]));
  },
  ancre: (x, c, k) => {
    x.lineCap = 'round'; x.strokeStyle = k; x.lineWidth = 34; const p = new Path2D();
    p.arc(0, -85, 22, 0, Math.PI * 2); p.moveTo(0, -62); p.lineTo(0, 95); p.moveTo(-55, -35); p.lineTo(55, -35); p.moveTo(-95, 30); p.quadraticCurveTo(-80, 100, 0, 100); p.quadraticCurveTo(80, 100, 95, 30);
    x.stroke(p); x.strokeStyle = c; x.lineWidth = 20; x.stroke(p);
  },
  soleil: (x, c, k) => { fillStroke(x, star(12, 120, 80, 0), c, k, 8); x.fillStyle = '#ffe27a'; x.fill(circle(0, 0, 62)); x.lineWidth = 6; x.strokeStyle = k; x.stroke(circle(0, 0, 62)); },
  lune: (x, c, k) => { const p = new Path2D(); p.arc(0, 0, 110, Math.PI * 0.3, Math.PI * 1.7); p.arc(40, 0, 90, Math.PI * 1.55, Math.PI * 0.45, true); p.closePath(); fillStroke(x, p, c, k); },
  trefle: (x, c, k) => { const p = new Path2D(); for (const a of [0, 1, 2, 3]) { const t = (a * Math.PI) / 2 - Math.PI / 4; p.moveTo(Math.cos(t) * 52 + 50, Math.sin(t) * 52); p.arc(Math.cos(t) * 52, Math.sin(t) * 52, 50, 0, Math.PI * 2); } p.moveTo(10, 30); p.rect(-8, 40, 16, 80); fillStroke(x, p, c, k, 8); },
  diamant: (x, c, k) => { fillStroke(x, poly([[-110, -40], [-60, -95], [60, -95], [110, -40], [0, 110]]), c, k); x.strokeStyle = k; x.lineWidth = 5; x.beginPath(); x.moveTo(-110, -40); x.lineTo(110, -40); x.moveTo(-60, -95); x.lineTo(-30, -40); x.lineTo(0, 110); x.lineTo(30, -40); x.lineTo(60, -95); x.stroke(); },
  damier: (x, c, k) => {
    x.fillStyle = k; x.fillRect(-120, -120, 8, 240);
    for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) { x.fillStyle = (i + j) % 2 ? c : '#f4f4f0'; x.fillRect(-110 + i * 44, -110 + j * 40 + Math.sin(i) * 6, 44, 40); }
  },
  fusee: (x, c, k) => {
    fillStroke(x, poly([[-50, 70], [-90, 110], [-80, 40]]), '#f4f4f0', k, 8); fillStroke(x, poly([[50, 70], [90, 110], [80, 40]]), '#f4f4f0', k, 8);
    const p = new Path2D(); p.moveTo(0, -122); p.quadraticCurveTo(70, -50, 50, 80); p.lineTo(-50, 80); p.quadraticCurveTo(-70, -50, 0, -122); fillStroke(x, p, c, k);
    x.fillStyle = '#9fd4ff'; x.fill(circle(0, -20, 24)); x.fillStyle = '#ff7a1a'; x.fill(poly([[-30, 85], [0, 125], [30, 85]]));
  },
  patte: (x, c, k) => { const p = new Path2D(); p.ellipse(0, 40, 60, 50, 0, 0, Math.PI * 2); for (const [px, py] of [[-75, -20], [-30, -70], [30, -70], [75, -20]]) { p.moveTo(px + 28, py); p.ellipse(px, py, 28, 34, 0, 0, Math.PI * 2); } fillStroke(x, p, c, k, 8); },
  sourire: (x, c, k) => { fillStroke(x, circle(0, 0, 112), c, k); x.fillStyle = k; x.fill(circle(-38, -30, 15)); x.fill(circle(38, -30, 15)); x.lineWidth = 14; x.lineCap = 'round'; x.strokeStyle = k; x.beginPath(); x.arc(0, 5, 62, 0.2 * Math.PI, 0.8 * Math.PI); x.stroke(); },
  note: (x, c, k) => { const p = new Path2D(); p.ellipse(-45, 80, 38, 28, -0.4, 0, Math.PI * 2); p.rect(-16, -110, 18, 190); p.moveTo(2, -110); p.quadraticCurveTo(60, -95, 75, -30); p.quadraticCurveTo(55, -65, 2, -70); fillStroke(x, p, c, k, 8); },
  fleur: (x, c, k) => { const p = new Path2D(); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; p.moveTo(Math.cos(a) * 62 + 42, Math.sin(a) * 62); p.ellipse(Math.cos(a) * 62, Math.sin(a) * 62, 42, 42, 0, 0, Math.PI * 2); } fillStroke(x, p, c, k, 8); x.fillStyle = '#ffe27a'; x.fill(circle(0, 0, 38)); },
  erable: (x, c, k) => fillStroke(x, poly([[0, -120], [18, -70], [50, -85], [40, -30], [100, -55], [80, -10], [118, 5], [50, 40], [60, 75], [8, 60], [8, 120], [-8, 120], [-8, 60], [-60, 75], [-50, 40], [-118, 5], [-80, -10], [-100, -55], [-40, -30], [-50, -85], [-18, -70]]), c, k),
  montagne: (x, c, k) => { fillStroke(x, poly([[-122, 90], [-40, -50], [0, 10], [45, -100], [122, 90]]), c, k); x.fillStyle = '#f4f4f0'; x.fill(poly([[45, -100], [72, -40], [55, -50], [40, -35], [22, -55]])); },
  onde: (x, c, k) => { const p = new Path2D(); p.moveTo(-120, 60); p.bezierCurveTo(-110, -60, 0, -110, 60, -60); p.bezierCurveTo(10, -60, -10, -20, 20, 0); p.bezierCurveTo(60, 20, 100, 0, 120, 30); p.lineTo(120, 90); p.lineTo(-120, 90); p.closePath(); fillStroke(x, p, c, k); },
  planete: (x, c, k) => {
    fillStroke(x, circle(0, 0, 70), c, k);
    x.save(); x.rotate(-0.4); x.lineWidth = 22; x.strokeStyle = k; x.beginPath(); x.ellipse(0, 0, 122, 34, 0, 0, Math.PI * 2); x.stroke();
    x.lineWidth = 12; x.strokeStyle = '#f2c21b'; x.stroke(); x.restore();
  },
  texte: (x, c, k, text = 'JP') => {
    const s = text || 'JP';
    let size = 140;
    x.font = `900 ${size}px Arial, sans-serif`;
    while (x.measureText(s).width > 236 && size > 20) { size -= 4; x.font = `900 ${size}px Arial, sans-serif`; }
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
    x.lineWidth = Math.max(4, size * 0.12); x.strokeStyle = k; x.strokeText(s, 0, 6); x.fillStyle = c; x.fillText(s, 0, 6);
  },
};

// couleur de contour : sombre sur une couleur claire, claire sur une couleur sombre
export function inkFor(col) {
  const n = parseInt(col.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return r * 0.3 + g * 0.59 + b * 0.11 > 140 ? '#16181c' : '#f4f4f0';
}

export function drawSticker(canvas, kind, col, text) {
  const x = canvas.getContext('2d');
  x.clearRect(0, 0, canvas.width, canvas.height);
  x.save();
  x.translate(canvas.width / 2, canvas.height / 2);
  x.scale(canvas.width / 256, canvas.height / 256);
  (DRAW[kind] || DRAW.etoile)(x, col, inkFor(col), text);
  x.restore();
}

const cache = new Map();
// texture d'un autocollant ; mirror : version retournée (côté symétrique de l'avion)
export function stickerTexture(kind, col, text, mirror = false) {
  const key = `${kind}|${col}|${text || ''}|${mirror}`;
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  drawSticker(c, kind, col, text);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (mirror) { t.wrapS = THREE.RepeatWrapping; t.repeat.x = -1; t.offset.x = 1; }
  cache.set(key, t);
  if (cache.size > 300) cache.delete(cache.keys().next().value);
  return t;
}

// petite image (pour le catalogue du hangar)
const thumbs = new Map();
export function stickerThumb(kind, col = '#c8261e', text = '') {
  const key = `${kind}|${col}|${text}`;
  if (!thumbs.has(key)) {
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    drawSticker(c, kind, col, text);
    thumbs.set(key, c.toDataURL());
  }
  return thumbs.get(key);
}
