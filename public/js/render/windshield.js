// Pluie sur le pare-brise, attachée à la vitre (et non à l'écran).
//
// L'eau est simulée dans une petite image propre au pare-brise (512 × 256), mise à jour ~30 fois par seconde :
//   R = épaisseur d'eau (gouttes), G = film d'eau (buée qui floute la vitre).
// Chaque mise à jour : de nouvelles gouttes tombent une par une (plus vite quand il pleut fort), celles qui se
// rejoignent deviennent lourdes et glissent (vers le bas à l'arrêt, vers le haut et les côtés en vol) en laissant une
// traînée, l'eau sèche peu à peu, et les essuie-glaces effacent ce qu'ils balaient.
// Le post-traitement retrouve, pour chaque pixel, l'endroit du pare-brise traversé par le regard et y lit l'eau :
// les gouttes restent collées à la vitre quand on tourne la tête.
// Les essuie-glaces sont de vrais objets 3D fixés à l'avion.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const W = 512, H = 256;
const STEP = 1 / 30;

const SIM_FS = /* glsl */`
  uniform sampler2D tPrev;
  uniform vec2 texel;
  uniform float rain, air, frame, dt, size; // size : largeur / hauteur réelles du pare-brise
  uniform vec4 wipe[2];   // pivot (u, v), angle précédent, angle actuel (radians, dans le plan de la vitre)
  uniform float wipeLen;  // longueur du balai (en hauteurs de vitre)
  uniform float wiping;
  uniform vec4 deposit;   // balai qui change de sens : x = angle, y = 1 s'il dépose son eau à cet angle
  const float B0 = 0.31, B1 = 0.93; // partie en caoutchouc du balai (fraction de la longueur du bras)
  varying vec2 vUv;
  float hash(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }

  // gouttes qui tombent cette fois-ci (grille de cellules : chaque cellule a une petite chance d'en recevoir une)
  float spawn(vec2 uv) {
    vec2 cells = vec2(96.0, 48.0);
    vec2 g = uv * cells;
    vec2 id = floor(g);
    float add = 0.0;
    // ≈ 45 gouttes par seconde sur tout le pare-brise sous une vraie pluie (le double en vol : on fonce dedans)
    float p = rain * (0.00033 + air * 0.0035); // en vol on fonce dans la pluie : bien plus d'impacts
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 c = id + vec2(x, y);
      float h = hash(vec3(c, frame));
      if (h < p) {
        vec2 ctr = c + vec2(hash(vec3(c, frame + 17.0)), hash(vec3(c, frame + 31.0)));
        float r = mix(0.3, 0.8, pow(hash(vec3(c, frame + 53.0)), 2.0)) * (1.0 - 0.45 * air); // impacts plus fins en vol    // rayon (en cellules)
        vec2 d = (g - ctr) * vec2(1.0, 1.0);
        float k = 1.0 - dot(d, d) / (r * r);
        if (k > 0.0) add += sqrt(k) * mix(0.25, 0.5, r);             // dôme d'eau
      }
    }
    return add;
  }

  void main() {
    vec4 s = texture2D(tPrev, vUv);
    float h = s.r, film = s.g;
    // sens d'écoulement : vers le bas à l'arrêt ; en vol, vers le haut et vers les bords (vent relatif)
    float a = smoothstep(0.1, 0.55, air);
    vec2 dir = normalize(mix(vec2(0.0, -1.0), vec2((vUv.x - 0.5) * 1.2, 1.0), a));
    float speed = mix(0.7, 2.4, a);                // texels par mise à jour
    // seuil au-delà duquel l'eau glisse : en vol, le vent arrache même les petites gouttes (traînées)
    float T = mix(0.42, 0.24, a);
    float k = mix(0.5, 0.85, a);
    float hu = texture2D(tPrev, vUv - dir * texel * speed).r;
    float out_ = max(h - T, 0.0) * k;
    float in_ = max(hu - T, 0.0) * k;
    h += in_ * 0.86 - out_;                        // la goutte qui glisse laisse un peu d'eau derrière elle
    // un peu de tension de surface : l'eau s'étale légèrement vers ses voisins plus pleins
    float hn = (texture2D(tPrev, vUv + vec2(texel.x, 0.0)).r + texture2D(tPrev, vUv - vec2(texel.x, 0.0)).r
              + texture2D(tPrev, vUv + vec2(0.0, texel.y)).r + texture2D(tPrev, vUv - vec2(0.0, texel.y)).r) * 0.25;
    h = mix(h, max(h, hn), 0.04 * step(0.08, hn));
    h += spawn(vUv);
    // séchage (rapide en vol, lent à l'arrêt ; plus vite quand il ne pleut plus)
    h = max(0.0, h - dt * (0.006 + h * 0.06 + air * 0.03 + (1.0 - rain) * 0.03));
    film = clamp(film + dt * (rain * 0.025 - 0.012 - air * 0.03), 0.0, 0.45);
    // essuie-glaces : seule la raclette touche la vitre (pas le bras, pas le pivot). Ce qu'elle a parcouru depuis la
    // dernière fois est effacé ; l'eau poussée devant elle est déposée en ligne là où elle change de sens.
    for (int i = 0; i < 2; i++) {
      vec4 w = wipe[i];
      vec2 q = (vUv - w.xy) * vec2(size, 1.0);
      float r = length(q) / wipeLen;
      if (r < B0 || r > B1) continue;
      float th = atan(q.y, q.x);
      float half_ = 0.006 / max(length(q), 0.05);       // demi-largeur de la raclette (angle)
      if (wiping > 0.5 && th > min(w.z, w.w) - half_ && th < max(w.z, w.w) + half_) { h *= 0.03; film *= 0.08; }
      if (deposit.y > 0.5) {
        float d = abs(th - deposit.x) * length(q);           // distance à la raclette (en hauteurs de vitre)
        float n = hash(vec3(floor(r * 60.0), float(i), frame));
        // fin cordon irrégulier de gouttelettes, plus fourni vers le bout du balai
        h += smoothstep(0.012, 0.0, d) * step(0.35, n) * mix(0.25, 0.55, r) * rain;
      }
    }
    // bas de la vitre : l'eau s'écoule par le joint ; en vol, le vent la chasse par le haut et par les côtés
    h *= mix(0.0, 1.0, smoothstep(0.0, 0.06, vUv.y));
    h *= mix(1.0, smoothstep(1.0, 0.93, vUv.y) * smoothstep(0.0, 0.05, min(vUv.x, 1.0 - vUv.x)), a);
    gl_FragColor = vec4(min(h, 1.5), film, 0.0, 1.0);
  }
`;
const QUAD_VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

// pare-brise d'un avion (repère de l'avion) : centre C, demi-largeur U (vers la droite), demi-hauteur V (le long de
// la vitre, vers le haut) ; défini par createPlaneMesh (userData.windshield)
export class WindshieldRain {
  constructor(renderer) {
    this.renderer = renderer;
    const opt = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    this.rt = [new THREE.WebGLRenderTarget(W, H, opt), new THREE.WebGLRenderTarget(W, H, opt)];
    this.cur = 0;
    this.quad = new FullScreenQuad(new THREE.ShaderMaterial({
      vertexShader: QUAD_VS, fragmentShader: SIM_FS, depthTest: false, depthWrite: false,
      uniforms: {
        tPrev: { value: null }, texel: { value: new THREE.Vector2(1 / W, 1 / H) },
        rain: { value: 0 }, air: { value: 0 }, frame: { value: 0 }, dt: { value: STEP }, size: { value: 1.6 },
        wipe: { value: [new THREE.Vector4(), new THREE.Vector4()] }, wipeLen: { value: 0.8 }, wiping: { value: 0 }, deposit: { value: new THREE.Vector4() },
      },
    }));
    this.acc = 0;
    this.frame = 0;
    this.active = false;
    this.mesh = null;
    // essuie-glaces : phase du balayage (0 = garé)
    this.wipePhase = 0;
    this.wipeAngle = 0;
    this.blades = [];
    this.clear();
    // valeurs pour le post-traitement (repère du monde)
    this.C = new THREE.Vector3(); this.U = new THREE.Vector3(); this.V = new THREE.Vector3();
  }

  get texture() { return this.rt[this.cur].texture; }

  clear() {
    const r = this.renderer, prev = r.getRenderTarget(), cc = r.getClearColor(new THREE.Color()), ca = r.getClearAlpha();
    r.setClearColor(0x000000, 1);
    for (const t of this.rt) { r.setRenderTarget(t); r.clear(true, false, false); }
    r.setRenderTarget(prev);
    r.setClearColor(cc, ca);
  }

  // nouvel avion : essuie-glaces fixés à son pare-brise
  attach(mesh) {
    if (mesh === this.mesh) return;
    for (const b of this.blades) { b.removeFromParent(); b.traverse((o) => { o.geometry?.dispose(); }); }
    this.blades = [];
    this.mesh = mesh;
    this.ws = mesh.userData.windshield || null;
    this.clear();
    if (!this.ws) return;
    const { C, U, V } = this.ws;
    const w = U.length() * 2, h = V.length() * 2;
    this.size = w / h;
    this.pivots = [[0.27, 0.04], [0.68, 0.04]];
    this.len = 0.82; // en hauteurs de vitre
    // repère direct (U, V, U×V) : l'angle des bras suit le même sens que dans la simulation. Les pièces sont posées
    // du côté extérieur de la vitre (signe « out »).
    const N = new THREE.Vector3().crossVectors(U, V).normalize();
    const out = N.dot(C.clone().sub(mesh.userData.eye || new THREE.Vector3())) < 0 ? -1 : 1;
    this.N = N;
    const armM = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.5, metalness: 0.6 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.9 });
    const L = this.len * h;
    for (const [pu, pv] of this.pivots) {
      // repère de la vitre : x le long de U, y le long de V, z vers l'extérieur
      const hub = new THREE.Group();
      const basis = new THREE.Matrix4().makeBasis(U.clone().normalize(), V.clone().normalize(), N);
      hub.quaternion.setFromRotationMatrix(basis);
      hub.position.copy(C).addScaledVector(U, pu * 2 - 1).addScaledVector(V, pv * 2 - 1).addScaledVector(N, 0.012 * out);
      const arm = new THREE.Group();
      // bras de 0 à 92 % ; raclette (caoutchouc) de 31 à 93 %, comme dans la simulation (B0, B1)
      const rod = new THREE.Mesh(new THREE.BoxGeometry(L * 0.92, 0.012, 0.008).translate(L * 0.46, 0, 0.016 * out), armM);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(L * 0.62, 0.016, 0.014).translate(L * 0.62, 0, 0.004 * out), rubber);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.02, 12).rotateX(Math.PI / 2), armM);
      arm.add(rod, blade, cap);
      hub.add(arm);
      hub.userData.arm = arm;
      mesh.add(hub);
      this.blades.push(hub);
    }
    this.setBlades(this.parkAngle());
  }
  parkAngle() { return 0.1; }
  setBlades(a) {
    this.wipeAngle = a;
    for (const b of this.blades) b.userData.arm.rotation.z = a;
  }

  // dt (s), rain 0..1, air 0..1 (vitesse), on : essuie-glaces en marche, enabled : effet activé
  update(dt, { rain, air, on, enabled }) {
    if (!this.ws || !enabled) { this.active = false; return; }
    // essuie-glaces : aller-retour de 0,1 à 2,0 rad (≈ 1,4 s par aller-retour) ; à l'arrêt, finit et se gare
    const prevA = this.wipeAngle;
    if (on || this.wipePhase % (Math.PI * 2) > 0.02) {
      this.wipePhase += dt * 4.4;
      if (!on && this.wipePhase % (Math.PI * 2) < dt * 4.4) this.wipePhase = 0; // revenu en position garée
    }
    const a = this.parkAngle() + (2.0 - this.parkAngle()) * (0.5 - 0.5 * Math.cos(this.wipePhase));
    // changement de sens (en haut, ou retour en bas) : la raclette lâche l'eau qu'elle poussait
    const dir = Math.sign(a - prevA);
    if (dir && this.lastDir && dir !== this.lastDir) this.depositAt = prevA;
    if (dir) this.lastDir = dir;
    this.setBlades(a);
    this.sweepLo = Math.min(this.sweepLo ?? prevA, prevA, a);
    this.sweepHi = Math.max(this.sweepHi ?? prevA, prevA, a);
    // rien à simuler : vitre sèche
    if (rain < 0.005 && !this.active) return;
    this.acc += Math.min(dt, 0.25);
    if (this.acc < STEP) { this.active = true; return; }
    const steps = Math.min(3, Math.floor(this.acc / STEP));
    this.acc -= steps * STEP;
    const u = this.quad.material.uniforms;
    u.rain.value = rain; u.air.value = air; u.size.value = this.size; u.wipeLen.value = this.len;
    const r = this.renderer, prev = r.getRenderTarget();
    for (let i = 0; i < steps; i++) {
      u.frame.value = (this.frame = (this.frame + 1) % 100000);
      u.wiping.value = this.sweepHi - this.sweepLo > 1e-4 ? 1 : 0;
      this.pivots.forEach(([pu, pv], k) => u.wipe.value[k].set(pu, pv, this.sweepLo, this.sweepHi));
      this.sweepLo = this.sweepHi = a;
      u.deposit.value.set(this.depositAt ?? 0, this.depositAt !== undefined && this.depositAt !== null ? 1 : 0, 0, 0);
      this.depositAt = null;
      u.tPrev.value = this.rt[this.cur].texture;
      this.cur ^= 1;
      r.setRenderTarget(this.rt[this.cur]);
      this.quad.render(r);
    }
    r.setRenderTarget(prev);
    this.active = true;
  }

  // position du pare-brise dans le monde (pour le post-traitement)
  worldGlass() {
    if (!this.active || !this.ws) return null;
    const m = this.mesh;
    m.updateMatrixWorld();
    this.C.copy(this.ws.C).applyMatrix4(m.matrixWorld);
    this.U.copy(this.ws.U).transformDirection(m.matrixWorld).multiplyScalar(this.ws.U.length());
    this.V.copy(this.ws.V).transformDirection(m.matrixWorld).multiplyScalar(this.ws.V.length());
    return { C: this.C, U: this.U, V: this.V, tex: this.texture };
  }
}
