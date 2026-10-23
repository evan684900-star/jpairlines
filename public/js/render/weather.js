// Météo (purement visuelle : le vent ne modifie pas le vol) : couverture nuageuse, voile, brume,
// pluie, orage. En mode « changeante », la météo dépend de l'heure UTC : la même pour tous les joueurs.
const STATES = {
  clear: { name: 'Grand beau', cover: 0.2, stratus: 0, cirrus: 0.4, darken: 0, turbidity: 0, fog: 1, hazeH: 450, haze: 0.00005, rain: 0, storm: 0, wind: 4, turb: 0 },
  cloudy: { name: 'Nuageux', cover: 0.55, stratus: 0, cirrus: 0.55, darken: 0.08, turbidity: 0.12, fog: 1.1, hazeH: 450, haze: 0.00008, rain: 0, storm: 0, wind: 7, turb: 0.05 },
  overcast: { name: 'Couvert', cover: 0.78, stratus: 0.82, cirrus: 0, darken: 0.42, turbidity: 0.45, fog: 1.35, hazeH: 500, haze: 0.00014, rain: 0, storm: 0, wind: 9, turb: 0.12 },
  rain: { name: 'Pluie', cover: 0.88, stratus: 0.95, cirrus: 0, darken: 0.62, turbidity: 0.65, fog: 1.9, hazeH: 600, haze: 0.0003, rain: 1, storm: 0, wind: 14, turb: 0.4 },
  storm: { name: 'Orage', cover: 1, stratus: 1, cirrus: 0, darken: 0.82, turbidity: 0.85, fog: 2.2, hazeH: 700, haze: 0.0004, rain: 1.6, storm: 1, wind: 22, turb: 1 },
  fog: { name: 'Brouillard', cover: 0.3, stratus: 0.25, cirrus: 0.2, darken: 0.2, turbidity: 0.6, fog: 1.6, hazeH: 140, haze: 0.0045, rain: 0, storm: 0, wind: 2, turb: 0 },
};
const KEYS = ['cover', 'stratus', 'cirrus', 'darken', 'turbidity', 'fog', 'hazeH', 'haze', 'rain', 'storm', 'wind', 'turb'];
// probabilités du mode « changeante »
const AUTO = [['clear', 0.34], ['cloudy', 0.3], ['overcast', 0.12], ['rain', 0.1], ['storm', 0.05], ['fog', 0.09]];
const SEGMENT = 1200; // la météo change toutes les 20 min

function hash(n) {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const wob = (t) => Math.sin(t) * 0.55 + Math.sin(t * 2.37 + 1.3) * 0.3 + Math.sin(t * 5.1 + 4.1) * 0.15;
function autoState(seg) {
  let r = hash(seg), acc = 0;
  for (const [k, p] of AUTO) { acc += p; if (r < acc) return k; }
  return 'clear';
}

export class Weather {
  constructor() {
    this.current = { ...STATES.clear };
    this.target = 'clear';
    this.windDir = 0.6; // direction d'où vient le vent (radians)
    this.initialized = false;
  }

  get name() { return STATES[this.target].name; }

  // mode : 'auto' ou une clé de STATES ; wallT : horloge commune (s)
  update(dt, mode, wallT) {
    let key = mode;
    if (mode === 'auto' || !STATES[mode]) {
      const seg = Math.floor(wallT / SEGMENT);
      key = autoState(seg);
      this.windDir = hash(seg + 77) * Math.PI * 2;
    }
    this.target = key;
    const goal = STATES[key];
    // transition progressive (~30 s) d'une météo à l'autre
    const k = this.initialized ? 1 - Math.exp(-dt * 0.1) : 1;
    for (const p of KEYS) this.current[p] += (goal[p] - this.current[p]) * k;
    this.initialized = true;
    // rafales : quand il pleut, le vent souffle par à-coups (jusqu'à +60 % en orage)
    this.gust = wob(wallT * 0.35) * 0.5 + 0.5;
    this.current.gust = this.gust * this.current.turb;
    this.current.windNow = this.current.wind * (1 + 0.6 * this.current.gust);
    return this.current;
  }
}
