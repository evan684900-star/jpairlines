// Moteur d'avion synthétisé échantillon par échantillon (AudioWorklet).
// Pistons : chaque cylindre explose à son tour (4 temps : une explosion par cylindre tous les 2 tours de vilebrequin).
// Chaque explosion est un coup de pression bref, plus fort et plus « sale » quand on met les gaz, avec un peu de
// hasard (aucun cycle n'est identique). Il résonne dans le pot d'échappement (deux résonateurs), d'où le grondement.
// L'hélice ajoute son souffle rythmé par le passage des pales.
// Turbine (jet) : raies du compresseur et du fan + souffle large.
const TAU = Math.PI * 2;

// résonateur à deux pôles (filtre passe-bande simple, stable)
class Reso {
  constructor() { this.y1 = 0; this.y2 = 0; }
  run(x, f, q, sr) {
    const w = TAU * Math.min(f, sr * 0.45) / sr, r = Math.exp(-w / (2 * q));
    const y = x + 2 * r * Math.cos(w) * this.y1 - r * r * this.y2;
    this.y2 = this.y1; this.y1 = y;
    return y * (1 - r);
  }
}

class Piston {
  constructor(seed) {
    this.phase = Math.random();
    this.next = 0;
    this.env = 0;
    this.amp = 0;
    this.rnd = seed;
    this.pipeA = new Reso(); this.pipeB = new Reso(); this.body = new Reso();
    this.blade = Math.random();
    this.lp = 0; this.lp2 = 0;
  }
  rand() { this.rnd = (this.rnd * 1664525 + 1013904223) >>> 0; return this.rnd / 4294967296; }
  // crank : tours/s ; load 0..1 ; cyl ; rough ; blades ; pipe (Hz) ; sr
  sample(crank, load, cyl, rough, blades, pipe, sr) {
    const fire = (crank * cyl) / 2; // explosions/s
    this.phase += fire / sr;
    if (this.phase >= 1) {
      this.phase -= 1;
      // force de l'explosion : dépend des gaz ; ratés et irrégularités au ralenti
      const miss = load < 0.2 && this.rand() < 0.04 * rough ? 0.2 : 1;
      this.amp = (0.35 + load * 0.9) * (1 + (this.rand() - 0.5) * 0.5 * rough) * miss;
      this.env = 1;
      // décalage léger de la prochaine explosion (moteur vivant)
      this.phase += (this.rand() - 0.5) * 0.05 * rough;
    }
    // coup de pression : montée immédiate, retombée rapide, plus du bruit (gaz qui s'échappent)
    const decay = Math.exp(-(fire * 7 + 60) / sr);
    this.env *= decay;
    const noise = this.rand() * 2 - 1;
    const pulse = this.env * this.amp * (0.75 + 0.6 * noise * (0.3 + load * 0.5));
    // pot d'échappement : deux résonances + caisse (grave)
    let s = this.pipeA.run(pulse, pipe, 2.2, sr) * 2.2 + this.pipeB.run(pulse, pipe * 2.6, 3.5, sr) * 0.9 + this.body.run(pulse, fire * 0.5 + 25, 1.2, sr) * 1.5;
    s += pulse * 0.35;
    // hélice : souffle modulé par le passage des pales (« wop-wop »)
    this.blade = (this.blade + (crank * blades) / sr) % 1;
    const bp = Math.pow(0.5 + 0.5 * Math.cos(TAU * this.blade), 6);
    this.lp += ((this.rand() * 2 - 1) - this.lp) * 0.08;
    s += this.lp * bp * (0.1 + load * 0.35) * Math.min(1, crank / 25);
    return s;
  }
}

class Turbine {
  constructor() { this.p = [0, 0, 0, 0]; this.n1 = 0; this.n2 = 0; this.r = 12345; this.roar = new Reso(); this.hiss = new Reso(); }
  rand() { this.r = (this.r * 1664525 + 1013904223) >>> 0; return this.r / 4294967296; }
  sample(n, load, sr) {
    // raies : fan (grave), compresseur (aigu, qui monte vite), harmonique
    const f = [40 + n * 230, 600 + n * 3600, 1300 + n * 6200, 80 + n * 460];
    const a = [0.25, 0.12 * n, 0.05 * n * n, 0.15];
    let s = 0;
    for (let i = 0; i < 4; i++) { this.p[i] = (this.p[i] + f[i] / sr) % 1; s += Math.sin(TAU * this.p[i]) * a[i]; }
    const w = this.rand() * 2 - 1;
    s += this.roar.run(w, 180 + n * 500, 0.7, sr) * (0.4 + n * n * 1.8);
    s += this.hiss.run(w, 2500 + n * 3000, 1.2, sr) * 0.15 * n;
    return s * (0.55 + 0.45 * n);
  }
}

class EngineProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'crank', defaultValue: 0, minValue: 0, maxValue: 200, automationRate: 'k-rate' },
      { name: 'load', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'level', defaultValue: 0, minValue: 0, maxValue: 4, automationRate: 'k-rate' },
    ];
  }
  constructor() {
    super();
    this.cfg = { kind: 'piston', cyl: 4, rough: 1, blades: 2, gear: 1, pipe: 140, twin: false }; // gear : réduction de l'hélice
    this.eng = [new Piston(1234), new Piston(98765)];
    this.jet = new Turbine();
    this.lvl = 0;
    this.port.onmessage = (e) => Object.assign(this.cfg, e.data);
  }
  process(_in, outputs, params) {
    const out = outputs[0];
    const L = out[0], R = out[1] || out[0];
    const crank = params.crank[0], load = params.load[0], level = params.level[0];
    const c = this.cfg, sr = sampleRate;
    for (let i = 0; i < L.length; i++) {
      this.lvl += (level - this.lvl) * 0.0015;
      let l = 0, r = 0;
      if (this.lvl > 1e-4) {
        if (c.kind === 'jet') {
          l = r = this.jet.sample(Math.min(1, crank / 100), load, sr);
        } else {
          const a = this.eng[0].sample(crank, load, c.cyl, c.rough, c.blades * c.gear, c.pipe, sr);
          if (c.twin) {
            // second moteur légèrement désaccordé : battement caractéristique des bimoteurs, à droite
            const b = this.eng[1].sample(crank * 1.012, load, c.cyl, c.rough, c.blades * c.gear, c.pipe * 1.04, sr);
            l = a * 0.8 + b * 0.35; r = a * 0.35 + b * 0.8;
          } else { l = r = a; }
        }
      }
      // calibrage : même volume perçu que l'ancien moteur (≈ 0,15 RMS à plein régime)
      const k = this.lvl * (c.kind === 'jet' ? 0.13 : 0.022);
      L[i] = l * k;
      if (R !== L) R[i] = r * k;
    }
    return true;
  }
}

registerProcessor('jp-engine', EngineProcessor);
