// Sons synthétisés en direct (Web Audio, aucun fichier à télécharger) :
// moteur à pistons dont le régime suit l'hélice, démarreur, vent, pluie, tonnerre, moteurs du train
// et des volets, avertisseur de décrochage, toucher des roues, crash, bips d'alerte.
// familles de sons et leur libellé dans les paramètres
export const SOUND_GROUPS = [
  { key: 'engine', label: 'Moteur et hélice' },
  { key: 'wind', label: 'Vent' },
  { key: 'rain', label: 'Pluie' },
  { key: 'weather', label: 'Tonnerre' },
  { key: 'systems', label: 'Train d\'atterrissage et volets' },
  { key: 'alarms', label: 'Alarmes (décrochage)' },
  { key: 'impacts', label: 'Roues au toucher, crash' },
  { key: 'interface', label: 'Bips des quêtes et du jeu' },
];

export class SoundEngine {
  constructor() {
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    // une piste de volume par famille de sons (réglables dans les paramètres)
    this.bus = {};
    for (const k of SOUND_GROUPS.map((g) => g.key)) { this.bus[k] = ctx.createGain(); this.bus[k].connect(this.master); }
    this.muted = false;
    this.volume = 0.5;
    // bruit blanc partagé
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;

    // ----- moteur : harmoniques de l'allumage + craquements filtrés -----
    this.engGain = this.gain(0, 'engine');
    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.frequency.value = 500;
    this.engFilter.Q.value = 0.8;
    this.engFilter.connect(this.engGain);
    this.engOsc = [['sawtooth', 1, 0.5], ['square', 0.5, 0.35], ['sawtooth', 2, 0.18], ['triangle', 3, 0.12]].map(([type, mul, vol]) => {
      const o = ctx.createOscillator();
      o.type = type;
      const g = ctx.createGain();
      g.gain.value = vol;
      o.connect(g).connect(this.engFilter);
      o.start();
      return { o, mul };
    });
    // battement des pales (modulation d'amplitude)
    this.prop = ctx.createOscillator();
    this.prop.frequency.value = 40;
    this.propDepth = ctx.createGain();
    this.propDepth.gain.value = 0;
    this.prop.connect(this.propDepth).connect(this.engGain.gain);
    this.prop.start();
    this.crackle = this.noise('bandpass', 900, 1.2, this.engFilter);
    this.crackle.g.gain.value = 0.35;
    // second moteur d'un bimoteur : légèrement désaccordé, d'où le battement caractéristique
    this.twinGain = ctx.createGain();
    this.twinGain.gain.value = 0;
    this.twinGain.connect(this.engFilter);
    this.engOsc2 = [['sawtooth', 1, 0.45], ['square', 0.5, 0.3]].map(([type, mul, vol]) => {
      const o = ctx.createOscillator();
      o.type = type;
      const g = ctx.createGain();
      g.gain.value = vol;
      o.connect(g).connect(this.twinGain);
      o.start();
      return { o, mul };
    });

    // ----- réacteurs : sifflement de la turbine + souffle -----
    this.jetWhine = ctx.createOscillator();
    this.jetWhine.type = 'sawtooth';
    this.jetWhineGain = this.gain(0, 'engine');
    const jw = ctx.createBiquadFilter();
    jw.type = 'bandpass'; jw.frequency.value = 2400; jw.Q.value = 6;
    this.jetWhineFilter = jw;
    this.jetWhine.connect(jw).connect(this.jetWhineGain);
    this.jetWhine.start();
    this.jetRoar = this.noise('bandpass', 400, 0.5, this.bus.engine);
    this.jetRumble = this.noise('lowpass', 120, 0.7, this.bus.engine);

    // ----- moteur réaliste (AudioWorklet : explosions des cylindres, pot d'échappement, hélice, turbine) -----
    // Tant qu'il n'est pas chargé (ou si le navigateur ne le permet pas), les oscillateurs ci-dessus servent de secours.
    this.engNode = null;
    ctx.audioWorklet?.addModule('js/ui/engine-worklet.js').then(() => {
      const n = new AudioWorkletNode(ctx, 'jp-engine', { numberOfInputs: 0, outputChannelCount: [2] });
      // cockpit : la cabine étouffe les aigus ; dehors : le son s'assourdit avec la distance
      this.engMuffle = ctx.createBiquadFilter();
      this.engMuffle.type = 'lowpass'; this.engMuffle.frequency.value = 6000; this.engMuffle.Q.value = 0.5;
      // un peu de compression pour que les explosions claquent sans saturer
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = 0.003; comp.release.value = 0.12;
      n.connect(this.engMuffle).connect(comp).connect(this.bus.engine);
      this.engNode = n;
      this.engCfg = '';
    }).catch(() => { /* garde le moteur de secours */ });

    // ----- vraie hélice enregistrée (sounds/helice.wav, CC-BY 3.0, voir sounds/CREDITS.txt) -----
    // mélangée au moteur synthétisé : la boucle est jouée plus ou moins vite pour suivre le régime
    // (enregistrée vers 85 Hz d'allumage) ; un bimoteur a deux sources légèrement désaccordées
    this.propRec = null;
    fetch('sounds/helice.wav').then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b)).then((buf) => {
      this.propRecFilter = ctx.createBiquadFilter();
      this.propRecFilter.type = 'lowpass'; this.propRecFilter.frequency.value = 5000; this.propRecFilter.Q.value = 0.5;
      this.propRecFilter.connect(this.bus.engine);
      this.propRec = [0, 1].map((i) => {
        const src = ctx.createBufferSource();
        src.buffer = buf; src.loop = true;
        const g = ctx.createGain(); g.gain.value = 0;
        const pan = ctx.createStereoPanner(); pan.pan.value = 0;
        src.connect(g).connect(pan).connect(this.propRecFilter);
        src.start(0, (i * 0.37 + Math.random()) % 1 * buf.duration);
        return { src, g, pan };
      });
    }).catch(() => { /* garde le moteur synthétisé seul */ });

    // ----- démarreur -----
    this.starter = ctx.createOscillator();
    this.starter.type = 'sawtooth';
    this.starterGain = this.gain(0, 'engine');
    const sf = ctx.createBiquadFilter();
    sf.type = 'bandpass'; sf.frequency.value = 700; sf.Q.value = 2;
    this.starter.connect(sf).connect(this.starterGain);
    this.starter.start();

    // ----- vent, pluie -----
    this.wind = this.noise('bandpass', 500, 0.7, this.bus.wind);
    this.rain = this.noise('highpass', 2500, 0.5, this.bus.rain); // bruit de secours tant que l'enregistrement charge
    // vraie pluie (enregistrement en boucle) : plus sourde dans le cockpit grâce au filtre passe-bas
    this.rainLoop = null;
    fetch('sounds/pluie.mp3').then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b)).then((buf) => {
      const src = ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      this.rainFilter = ctx.createBiquadFilter();
      this.rainFilter.type = 'lowpass'; this.rainFilter.frequency.value = 9000;
      this.rainLoopGain = ctx.createGain();
      this.rainLoopGain.gain.value = 0;
      src.connect(this.rainFilter).connect(this.rainLoopGain).connect(this.bus.rain);
      src.start(0, Math.random() * buf.duration);
      this.rainLoop = src;
    }).catch(() => { /* garde le bruit de secours */ });
    // ----- moteurs électriques (train, volets) -----
    this.motor = ctx.createOscillator();
    this.motor.type = 'sawtooth';
    this.motor.frequency.value = 120;
    this.motorGain = this.gain(0, 'systems');
    const mf = ctx.createBiquadFilter();
    mf.type = 'lowpass'; mf.frequency.value = 900;
    this.motor.connect(mf).connect(this.motorGain);
    this.motor.start();
    // ----- avertisseur de décrochage -----
    this.horn = ctx.createOscillator();
    this.horn.type = 'square';
    this.horn.frequency.value = 1550;
    this.hornGain = this.gain(0, 'alarms');
    const hf = ctx.createBiquadFilter();
    hf.type = 'bandpass'; hf.frequency.value = 1550; hf.Q.value = 3;
    this.horn.connect(hf).connect(this.hornGain);
    this.horn.start();

    this.prevGear = null;
    this.prevFlap = null;
  }

  gain(v, bus) { const g = this.ctx.createGain(); g.gain.value = v; g.connect(this.bus[bus]); return g; }

  noise(type, freq, q, dest = null) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(dest || this.master);
    src.start();
    return { f, g };
  }

  resume() { if (this.ctx.state === 'suspended') this.ctx.resume(); }

  // settings : volume général, coupure, et volume de chaque famille (snd_moteur… en %)
  setVolume(settings) {
    this.volume = settings.volume;
    this.muted = settings.muted;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume * 1.6, t, 0.05);
    for (const g of SOUND_GROUPS) this.bus[g.key].gain.setTargetAtTime((settings[`snd_${g.key}`] ?? 100) / 100, t, 0.05);
  }

  // s : état de l'avion et du monde (lecture seule) ; view : 'cockpit' | 'outside' ; dist : distance caméra-avion
  update(dt, s, view, dist, weather, paused) {
    const t = this.ctx.currentTime;
    const set = (param, v, tc = 0.08) => param.setTargetAtTime(v, t, tc);
    const inside = view === 'cockpit';
    const atten = inside ? 1 : 1 / (1 + Math.max(0, dist - 15) / 25);
    const on = !paused && !s.crashed;
    // son propre à chaque avion (aircraft.js) : moteur à pistons (simple ou bimoteur) ou réacteurs
    const snd = s.def?.sound || { kind: 'piston', base: 9, range: 81 };
    const jet = snd.kind === 'jet';
    const running = s.engineOn || s.engineStart > 0;
    // moteur à pistons : allumage = régime/30 ; à plein régime ≈ 90 Hz pour l'avion de base
    const rpmHz = (snd.base ?? 9) + s.rpm * (snd.range ?? 81);
    if (this.engNode) {
      // configuration de l'avion (cylindres, pales, pot, bimoteur, réacteur), envoyée une seule fois par avion
      const cfg = JSON.stringify(snd);
      if (cfg !== this.engCfg) {
        this.engCfg = cfg;
        this.engNode.port.postMessage({ kind: jet ? 'jet' : 'piston', cyl: snd.cyl ?? 4, rough: snd.rough ?? 1, blades: snd.blades ?? 2, gear: snd.gear ?? 1, pipe: snd.pipe ?? 130, twin: snd.kind === 'twin' });
      }
      const P = this.engNode.parameters;
      // vilebrequin (tours/s) : rpmHz est la fréquence d'allumage d'un 4 cylindres, soit 2 explosions par tour
      set(P.get('crank'), jet ? s.rpm * 100 : rpmHz / 2, 0.06);
      set(P.get('load'), running ? Math.min(1, s.throttle * 0.85 + s.rpm * 0.25) : 0, 0.1);
      const lv = jet ? (running || s.rpm > 0.05 ? 0.5 + s.rpm * 0.9 : 0) : (running ? 0.9 + s.throttle * 0.5 : s.rpm * 0.6);
      set(P.get('level'), on ? lv * (snd.loud ?? 1) * atten * 0.55 : 0, 0.06);
      set(this.engMuffle.frequency, inside ? 1500 + s.throttle * 900 : Math.max(900, 7000 / (1 + Math.max(0, dist - 20) / 60)), 0.1);
    }
    if (this.propRec) {
      const twin = snd.kind === 'twin';
      const rate = Math.min(1.8, Math.max(0.4, rpmHz / 85)); // pas trop ralentie au ralenti (le son deviendrait boueux)
      // niveau : suit le moteur (moteur arrêté : l'hélice qui tourne encore « en moulinet » s'entend à peine)
      const rl = !jet && on ? (running ? 0.3 + s.throttle * 0.35 : s.rpm * 0.15) * (snd.loud ?? 1) * atten * (twin ? 0.7 : 1) : 0;
      this.propRec.forEach((r, i) => {
        set(r.src.playbackRate, rate * (i ? 1.013 : 1), 0.06);
        set(r.g.gain, i && !twin ? 0 : rl, 0.08);
        set(r.pan.pan, twin ? (i ? 0.45 : -0.45) : 0, 0.2);
      });
      set(this.propRecFilter.frequency, inside ? 1400 + s.throttle * 800 : Math.max(800, 6000 / (1 + Math.max(0, dist - 20) / 60)), 0.1);
    }
    for (const { o, mul } of this.engOsc) set(o.frequency, rpmHz * mul, 0.05);
    for (const { o, mul } of this.engOsc2) set(o.frequency, rpmHz * mul * 1.018, 0.05);
    set(this.prop.frequency, rpmHz, 0.05);
    const level = (running ? 0.06 + s.rpm * 0.16 + s.throttle * 0.05 : s.rpm * 0.03) * (snd.loud ?? 1);
    const old = this.engNode ? 0 : 1; // moteur de secours coupé quand le moteur réaliste est prêt
    set(this.engGain.gain, on && !jet ? level * atten * old : 0);
    set(this.propDepth.gain, on && !jet ? level * atten * 0.45 * old : 0);
    set(this.twinGain.gain, snd.kind === 'twin' ? 0.8 : 0, 0.2);
    set(this.crackle.g.gain, 0.35 * (snd.rough ?? 1), 0.2);
    set(this.engFilter.frequency, (inside ? 380 : 650) + s.throttle * (inside ? 900 : 1800) + s.rpm * 500);
    // réacteurs : sifflement qui monte avec le régime, souffle grave à l'extérieur
    const jr = jet ? s.rpm : 0;
    set(this.jetWhine.frequency, 500 + jr * 5200, 0.3);
    set(this.jetWhineFilter.frequency, 900 + jr * 4200, 0.3);
    set(this.jetWhineGain.gain, on && jet && (running || jr > 0.05) ? (0.012 + jr * 0.05) * atten * (inside ? 0.6 : 1) * (this.engNode ? 0.35 : 1) : 0, 0.2);
    set(this.jetRoar.g.gain, on && jet && !this.engNode ? jr * jr * 0.22 * atten * (inside ? 0.35 : 1) : 0, 0.2);
    set(this.jetRoar.f.frequency, 250 + jr * 900, 0.3);
    set(this.jetRumble.g.gain, on && jet ? jr * jr * 0.3 * atten * (inside ? 0.5 : 1) : 0, 0.2);
    // démarreur pendant la mise en route
    const starting = s.engineStart > 0 && !s.engineOn;
    const startT = s.S?.startTime ?? 1.6;
    set(this.starter.frequency, (jet ? 300 : 90) + ((startT - Math.max(0, s.engineStart)) / startT) * (jet ? 900 : 256), 0.2);
    set(this.starterGain.gain, on && starting ? 0.05 * atten : 0, 0.05);
    // vent : augmente avec la vitesse (plus étouffé dans le cockpit)
    const v = s.speed;
    // + le vent de la météo (sifflement qui monte avec les rafales de pluie et d'orage)
    const gale = weather ? Math.max(0, (weather.windNow ?? weather.wind) - 8) * 0.006 : 0;
    set(this.wind.g.gain, !paused ? Math.min(0.3, (on ? v * v * 0.00004 : 0) + gale) * (inside ? 0.6 : 1) : 0);
    set(this.wind.f.frequency, 250 + v * 9);
    // pluie (tambourine sur la verrière dans le cockpit)
    const rainK = !paused ? Math.min(1, weather?.rain ?? 0) : 0;
    if (this.rainLoop) {
      // enregistrement : fort dehors, étouffé dans le cockpit ; l'intensité suit la pluie (1 = pluie, 1,6 = orage)
      set(this.rainLoopGain.gain, rainK * (inside ? 0.55 : 0.8) * Math.min(1.25, 0.7 + (weather?.rain ?? 0) * 0.3), 0.6);
      set(this.rainFilter.frequency, inside ? 2600 : 9000, 0.3);
      set(this.rain.g.gain, 0, 0.5);
    } else set(this.rain.g.gain, rainK * (inside ? 0.12 : 0.06), 0.5);
    // train et volets en mouvement
    const moving = (this.prevGear !== null && Math.abs(s.gearPos - this.prevGear) > 1e-4) || (this.prevFlap !== null && Math.abs(s.flapPos - this.prevFlap) > 1e-4);
    if (this.prevGear !== null && this.prevGear < 1 && s.gearPos >= 1) this.clunk(0.25);
    if (this.prevGear !== null && this.prevGear > 0 && s.gearPos <= 0) this.clunk(0.2);
    this.prevGear = s.gearPos;
    this.prevFlap = s.flapPos;
    set(this.motorGain.gain, on && moving ? 0.035 * atten : 0, 0.05);
    // avertisseur de décrochage (continu, comme sur un vrai avion léger)
    set(this.hornGain.gain, on && s.stallWarning ? 0.06 : 0, 0.03);
  }

  burst(type, freq, dur, vol, delay = 0, q = 1, bus = 'impacts') {
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.bus[bus]);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  clunk(v) { this.burst('lowpass', 220, 0.25, v, 0, 1, 'systems'); }
  touchdown(strength) { this.burst('bandpass', 1400, 0.35, 0.12 + strength * 0.2, 0, 3); this.burst('lowpass', 160, 0.3, 0.2 + strength * 0.3); }
  crash() { this.burst('lowpass', 300, 2.5, 0.9); this.burst('bandpass', 1200, 1.2, 0.4); }
  thunder(delay, strength) {
    this.burst('lowpass', 120, 4, 0.5 * strength + 0.1, delay, 1, 'weather');
    this.burst('lowpass', 400, 1.5, 0.25 * strength, delay + 0.05, 1, 'weather');
  }

  beep(freq, dur, vol = 0.15, bus = 'interface') {
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.frequency.value = freq;
    g.gain.setValueAtTime(Math.max(0.0001, vol), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.bus[bus]);
    o.start();
    o.stop(t + dur);
  }

  // carillon d'alerte (deux tons)
  chime() { this.beep(880, 0.25, 0.08, 'alarms'); setTimeout(() => this.beep(660, 0.35, 0.08, 'alarms'), 180); }
}
