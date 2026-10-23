// Flotte de JP Airlines : caractéristiques de vol, géométrie (roues, points de contact) et dessin de chaque avion.
// Les valeurs sont des ordres de grandeur réels (masses, surfaces, puissances) ; les coefficients sans dimension
// suivent ceux de l'avion de base, retouchés pour donner à chaque appareil son caractère.
// Repère du modèle : nez vers -Z, Y vers le haut, X vers la droite ; origine = centre du fuselage.
import * as THREE from 'three';

const G = 9.81;
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// Points de contact usuels : roues (ressorts amortis), bouts d'ailes, hélice, dessus (retourné), queue, ventre
function contacts({ mass, gear, nose, mains, tips, props = [], tops, tail, bellies, floats = [], extraTails = [] }) {
  const mr = mass / 990; // raideur des amortisseurs proportionnelle à la masse (même enfoncement que l'avion de base)
  const noses = Array.isArray(nose[0]) ? nose : [nose];
  return {
    wheels: [
      ...noses.map(([x, z]) => ({ p: V3(x, -gear, z), k: (32000 * mr) / noses.length, c: (3200 * mr) / noses.length, nose: true })),
      ...[-1, 1].map((s) => ({ p: V3(s * mains[0], -gear, mains[1]), k: 60000 * mr, c: 6000 * mr, brake: true })),
    ],
    hard: [
      ...props.map(([x, y, z]) => ({ p: V3(x, y, z), kind: 'fatal', name: 'L\'hélice a touché le sol' })),
      ...[-1, 1].map((s) => ({ p: V3(s * tips[0], tips[1], tips[2]), kind: 'fatal', name: 'Une aile a touché le sol' })),
      ...tops.map(([y, z]) => ({ p: V3(0, y, z), kind: 'fatal', name: 'L\'avion s\'est retourné' })),
      { p: V3(0, tail[0], tail[1]), kind: 'tail' },
      ...extraTails.map((p) => ({ p: V3(...p), kind: 'tail' })),
      ...bellies.map(([y, z]) => ({ p: V3(0, y, z), kind: 'belly' })),
      // flotteurs : flottent sur l'eau, frottent comme un ventre sur la terre ferme
      ...floats.map(([x, y, z]) => ({ p: V3(x, y, z), kind: 'float', k: 15000 * (mass / 1450), c: 3200 * (mass / 1450), nose: z < -2 })),
    ],
  };
}

// ----------------------------------------------------------------------------------------------------
// Avion de base : Cub-1 (type Cessna 172). Ses valeurs sont celles d'origine, inchangées.
// ----------------------------------------------------------------------------------------------------
const CUB_FUSE = [
  [-3.72, 0.3, 0.3, -0.02], [-3.55, 0.47, 0.45, 0.0], [-3.1, 0.55, 0.55, 0.04], [-2.4, 0.58, 0.66, 0.12],
  [-1.6, 0.59, 0.74, 0.2], [-0.6, 0.59, 0.74, 0.2], [0.4, 0.55, 0.66, 0.18], [1.4, 0.42, 0.5, 0.18],
  [2.6, 0.26, 0.36, 0.24], [3.7, 0.14, 0.26, 0.32], [4.15, 0.07, 0.19, 0.36],
];
const CUB_CABIN = {
  panel: { y: 0.1, z: -1.92, w: 1.08 }, seats: [[-0.27, -0.95], [0.27, -0.95], [-0.27, 0.15], [0.27, 0.15]], seatY: -0.12,
  yokes: [-0.27, 0.27], yokeY: 0.02, yokeZ: -1.86, floor: { y: -0.42, z: -0.7, len: 2.6, w: 1.0 },
};

const CUB = {
  id: 'cub', name: 'Cub-1', role: 'Avion-école', seats: 4, engineLabel: '1 moteur à pistons de 160 ch',
  desc: 'Le fidèle quadriplace à aile haute de JP Airlines : stable, indulgent, il pardonne presque tout. Parfait pour apprendre et pour les missions de tous les jours.',
  unlock: null, color: 0xf4f5f7, accent: 0xc62f2a, acc2: 0x1d3f7a,
  // performances mesurées au banc d'essai (scripts/flight-test.mjs), affichées au hangar
  perf: { vmax: 224, cruise: 187, stall: 79, takeoff: 316, roll: 58 },
  specs: {
    emptyMass: 790, pilotMass: 85, S: 16.2, b: 11.0, c: 1.5,
    inertia: V3(1825, 2667, 1285),
    CL0: 0.25, CLa: 4.9, alphaStall: 0.27, alphaStallNeg: -0.22, CLflap: 0.2, alphaStallFlap: -0.012,
    CD0: 0.026, k: 0.054, CDgear: 0.012, CDflap: 0.014, CDprop: 0.012, CYb: -0.45,
    Clb: -0.09, Clp: -0.47, Clr: 0.09, Clda: 0.05,
    Cm0: 0.045, Cma: -0.9, Cmq: -12, Cmde: 0.42, Cmflap: -0.008,
    Cnb: 0.07, Cnr: -0.1, Cndr: 0.04, Cnda: -0.004, Cnp: -0.03,
    engine: 'piston', maxPower: 119000, staticThrust: 2700, propEff: 0.7,
    fuelCapacity: 160, fuelDensity: 0.72, fuelFlowIdle: 6, fuelFlowMax: 46,
    gear: 1.55, belly: 0.7, vFlaps: 46, vGear: 58, vne: 84, flapNotches: [0, 10, 20, 30],
    retractable: true, feelV: 26, feelFloor: 0.2, // train escamotable (jambes du modèle 3D animées)
  },
  geo: {
    cg: V3(0, -0.15, -1.2),
    wheels: [
      // positions des roues du modèle 3D (models/cub.glb)
      { p: V3(0, -1.55, -2.4), k: 32000, c: 3200, nose: true },
      { p: V3(-1.27, -1.55, -0.75), k: 60000, c: 6000, brake: true },
      { p: V3(1.27, -1.55, -0.75), k: 60000, c: 6000, brake: true },
    ],
    hard: [
      { p: V3(0, -1.15, -3.5), kind: 'fatal', name: 'L\'hélice a touché le sol' }, // marge : l'amortisseur avant s'enfonce au toucher
      { p: V3(-5.5, 0.6, -1.1), kind: 'fatal', name: 'Une aile a touché le sol' },
      { p: V3(5.5, 0.6, -1.1), kind: 'fatal', name: 'Une aile a touché le sol' },
      { p: V3(0, 1.19, 3.85), kind: 'fatal', name: 'L\'avion s\'est retourné' },
      { p: V3(0, 0.72, -1.2), kind: 'fatal', name: 'L\'avion s\'est retourné' },
      { p: V3(0, -0.25, 3.95), kind: 'tail' },
      { p: V3(0, -0.83, -1.6), kind: 'belly' },
      { p: V3(0, -0.72, 1.0), kind: 'belly' },
    ],
  },
  sound: { kind: 'piston', base: 9, range: 81, cyl: 4, blades: 2, pipe: 130 }, // 4 cylindres à plat, 160 ch
  model: {
    fuse: CUB_FUSE,
    glass: {
      shield: [-2.45, -1.72, 0.14, 0.985],
      sides: [{ z0: -1.72, z1: 0.45, ny0: 0.24, ny1: 0.74, gaps: [-0.65], gapW: 0.06 }],
      xMin: 0.25, posts: [-1.72],
    },
    stripes: [[-0.18, -0.04, 'acc', -3.2], [-0.3, -0.22, 'acc2', -3.2]],
    wing: {
      y: 0.99, le: -1.95, half: 5.5, root: 1.6, tip: 1.15, taperFrom: 2.9, dihedral: 0.03, sweep: 0,
      thick: 0.13, tipThick: 0.07, xs: [5.5, 5.2, 4.2, 2.9, 1.5, 0], flaps: [0.62, 2.9], ail: [2.95, 5.2],
      struts: { from: [0.52, -0.32, -1.1], x: 2.7, z: -1.2 }, accentFrom: 4.6,
    },
    stab: { y: 0.4, le: 3.25, half: 1.8, root: 0.85, tip: 0.5, sweep: 0.12 },
    fin: { y0: 0.45, y1: 1.8, root: 1.25, tip: 0.42, le0: 2.75, le1: 3.75, accentFrom: 1.15 },
    props: [{ x: 0, y: 0, z: -3.72, r: 1, blades: 2, spinner: 1, intakes: true }],
    exhaust: [0.22, -0.48, -2.9],
    antenna: [0, 1.12, -0.2],
    gear: { r: 0.3, pants: true, mains: { x: 1.2, z: -0.75, ax: 0.42, ay: -0.48, style: 'spring' }, nose: { z: -3.0, ay: -0.45 } },
    cabin: CUB_CABIN,
    lights: { navZ: -1.5, tail: [1.0, 4.2], strobe: [1.82, 3.95], landing: [-1.6, 0.98, -1.97] },
    tipFxZ: -1.0,
  },
};

// ----------------------------------------------------------------------------------------------------
// Moustique : ULM biplace (type Ikarus C42). Léger, lent, décolle en 100 m, monte comme un ascenseur.
// ----------------------------------------------------------------------------------------------------
const MOUSTIQUE = {
  id: 'moustique', name: 'Moustique', role: 'Ultra-léger', seats: 2, engineLabel: '1 moteur Rotax de 100 ch',
  desc: 'Un ULM tout en vitres, à peine 300 kg à vide. Il décolle en 130 m, se pose presque partout et se pilote du bout des doigts. Attention au vent : il est léger !',
  unlock: 'courrier', color: 0xf2c230, accent: 0x23252b, acc2: 0x8a8f99,
  // performances mesurées au banc d'essai (scripts/flight-test.mjs), affichées au hangar
  perf: { vmax: 171, cruise: 144, stall: 59, takeoff: 128, roll: 59 },
  specs: {
    emptyMass: 300, pilotMass: 85, S: 13.0, b: 9.5, c: 1.4,
    inertia: V3(520, 760, 420),
    CL0: 0.3, CLa: 4.8, alphaStall: 0.27, alphaStallNeg: -0.22, CLflap: 0.28, alphaStallFlap: -0.015,
    CD0: 0.04, k: 0.065, CDgear: 0, CDflap: 0.02, CDprop: 0.015, CYb: -0.45,
    Clb: -0.09, Clp: -0.47, Clr: 0.09, Clda: 0.055,
    Cm0: 0.057, Cma: -0.9, Cmq: -12, Cmde: 0.42, Cmflap: -0.008,
    Cnb: 0.07, Cnr: -0.1, Cndr: 0.045, Cnda: -0.004, Cnp: -0.03,
    engine: 'piston', maxPower: 73500, staticThrust: 1500, propEff: 0.6,
    fuelCapacity: 80, fuelDensity: 0.72, fuelFlowIdle: 3, fuelFlowMax: 22,
    gear: 1.3, vFlaps: 33, vGear: 38, vne: 62, flapNotches: [0, 15, 30], retractable: true,
  },
  geo: contacts({
    mass: 443, gear: 1.3, nose: [0, -2.2], mains: [0.95, -0.55],
    tips: [4.75, 0.95, -1.0], props: [[0, -0.85, -2.7]], tops: [[1.45, 3.2], [0.95, -0.9]],
    tail: [0.1, 3.45], bellies: [[-0.5, -1.3], [-0.3, 0.3]],
  }),
  cg: V3(0, -0.1, -0.9),
  sound: { kind: 'piston', base: 14, range: 105, rough: 0.6, cyl: 4, blades: 3, gear: 0.41, pipe: 210 }, // Rotax : tourne vite, réducteur
  model: {
    fuse: [
      [-2.62, 0.22, 0.22, 0.0], [-2.5, 0.36, 0.34, 0.02], [-2.15, 0.46, 0.46, 0.06], [-1.6, 0.55, 0.6, 0.16],
      [-0.9, 0.56, 0.66, 0.22], [-0.2, 0.52, 0.62, 0.24], [0.4, 0.3, 0.4, 0.3], [1.0, 0.16, 0.2, 0.36],
      [2.4, 0.11, 0.15, 0.38], [3.3, 0.08, 0.13, 0.4], [3.55, 0.05, 0.1, 0.42],
    ],
    glass: {
      shield: [-2.12, -1.45, -0.05, 0.985],
      sides: [{ z0: -1.45, z1: 0.12, ny0: -0.25, ny1: 0.82 }],
      xMin: 0.18, posts: [-1.45],
    },
    stripes: [[-0.42, -0.3, 'acc', -2.6]],
    wing: {
      y: 0.95, le: -1.65, half: 4.75, root: 1.45, tip: 1.45, taperFrom: 4.75, dihedral: 0.015, sweep: 0,
      thick: 0.14, tipThick: 0.08, flaps: [0.6, 2.4], ail: [2.45, 4.5],
      struts: { from: [0.5, -0.28, -0.95], x: 2.3, z: -1.1 }, accentFrom: 4.0,
    },
    stab: { y: 0.42, le: 2.85, half: 1.4, root: 0.72, tip: 0.5, sweep: 0.08 },
    fin: { y0: 0.48, y1: 1.45, root: 1.0, tip: 0.5, le0: 2.55, le1: 3.15, accentFrom: 1.1 },
    props: [{ x: 0, y: 0, z: -2.62, r: 0.85, blades: 3, spinner: 0.75 }],
    exhaust: [0.18, -0.35, -2.2],
    gear: { r: 0.24, pants: false, mains: { x: 0.95, z: -0.55, ax: 0.4, ay: -0.4, style: 'spring' }, nose: { z: -2.2, ay: -0.3 } },
    cabin: {
      panel: { y: 0.08, z: -1.72, w: 0.95 }, seats: [[-0.26, -0.75], [0.26, -0.75]], seatY: -0.16, stick: true,
      floor: { y: -0.45, z: -1.0, len: 1.8, w: 0.9 },
    },
    lights: { navZ: -1.1, tail: [0.44, 3.6], strobe: [1.47, 3.2], landing: [-1.4, 0.92, -1.66] },
    tipFxZ: -0.9,
  },
};

// ----------------------------------------------------------------------------------------------------
// Faucon : avion de voltige monoplace en tandem (type Extra 300). 300 ch, profil symétrique, ±10 g.
// ----------------------------------------------------------------------------------------------------
const FAUCON = {
  id: 'faucon', name: 'Faucon', role: 'Voltige', seats: 2, engineLabel: '1 moteur à pistons de 300 ch',
  desc: 'Une bête de voltige : il fait un tonneau complet en moins d\'une seconde et demie, vole aussi bien sur le dos qu\'à l\'endroit et encaisse les grosses ressources. Pas de volets : il faut savoir le poser.',
  unlock: 'centre-coeur', color: 0xffffff, accent: 0xd4232c, acc2: 0x1b1b1f,
  // performances mesurées au banc d'essai (scripts/flight-test.mjs), affichées au hangar
  perf: { vmax: 325, cruise: 278, stall: 109, takeoff: 351, roll: 256 },
  specs: {
    emptyMass: 670, pilotMass: 85, S: 10.7, b: 8.0, c: 1.4,
    inertia: V3(1100, 1700, 800),
    CL0: 0.05, CLa: 5.0, alphaStall: 0.27, alphaStallNeg: -0.29, CLflap: 0, alphaStallFlap: 0,
    CD0: 0.028, k: 0.06, CDgear: 0, CDflap: 0, CDprop: 0.014, CYb: -0.5,
    Clb: -0.05, Clp: -0.4, Clr: 0.07, Clda: 0.09,
    Cm0: 0.037, Cma: -0.6, Cmq: -10, Cmde: 0.5, Cmflap: 0,
    Cnb: 0.08, Cnr: -0.12, Cndr: 0.06, Cnda: -0.003, Cnp: -0.02,
    engine: 'piston', maxPower: 224000, staticThrust: 4300, propEff: 0.75,
    fuelCapacity: 160, fuelDensity: 0.72, fuelFlowIdle: 8, fuelFlowMax: 85,
    gear: 1.35, vFlaps: Infinity, vGear: 70, vne: 113, flapNotches: [0], retractable: true, rollGentle: 0.3,
    gTol: 1.6, feelN: 2.4,
  },
  geo: contacts({
    mass: 863, gear: 1.35, nose: [0, -2.7], mains: [1.0, -0.75],
    tips: [4.0, -0.35, -1.0], props: [[0, -0.93, -3.45]], tops: [[1.4, 3.0], [0.95, -0.5]],
    tail: [-0.05, 3.55], bellies: [[-0.55, -1.4], [-0.45, 0.6]],
  }),
  cg: V3(0, -0.05, -1.0),
  sound: { kind: 'piston', base: 7, range: 70, rough: 1.3, loud: 1.3, cyl: 6, blades: 3, pipe: 100 }, // 6 cylindres de voltige
  model: {
    fuse: [
      [-3.42, 0.2, 0.2, 0.05], [-3.3, 0.38, 0.38, 0.05], [-3.0, 0.48, 0.48, 0.06], [-2.3, 0.52, 0.56, 0.08],
      [-1.4, 0.52, 0.58, 0.1], [-0.5, 0.48, 0.56, 0.12], [0.5, 0.38, 0.46, 0.14], [1.6, 0.26, 0.34, 0.16],
      [2.7, 0.15, 0.24, 0.18], [3.45, 0.07, 0.16, 0.2], [3.6, 0.03, 0.08, 0.2],
    ],
    canopy: { z0: -1.8, z1: 0.6, y: 0.52, w: 0.4, h: 0.44 },
    stripes: [[-0.12, 0.06, 'acc', -3.3], [-0.3, -0.2, 'acc2', -3.3]],
    wing: {
      y: -0.35, le: -1.75, half: 4.0, root: 1.75, tip: 1.05, taperFrom: 0.55, dihedral: 0, sweep: 0,
      thick: 0.16, tipThick: 0.1, flaps: null, ail: [0.65, 3.85], accentFrom: 2.6, checker: true,
    },
    stab: { y: 0.1, le: 2.65, half: 1.55, root: 0.9, tip: 0.55, sweep: 0.14 },
    fin: { y0: 0.2, y1: 1.4, root: 1.25, tip: 0.6, le0: 2.2, le1: 2.95, accentFrom: 0.8 },
    props: [{ x: 0, y: 0.05, z: -3.42, r: 0.98, blades: 3, spinner: 1.05, intakes: true }],
    exhaust: [0.32, -0.35, -2.6],
    gear: { r: 0.26, pants: true, mains: { x: 1.0, z: -0.75, ax: 0.3, ay: -0.5, style: 'spring' }, nose: { z: -2.7, ay: -0.42 } },
    cabin: {
      panel: { y: 0.28, z: -1.6, w: 0.7 }, seats: [[0, -0.75], [0, 0.35]], seatY: -0.22, stick: true,
      floor: { y: -0.42, z: -0.3, len: 2.4, w: 0.7 },
    },
    lights: { navZ: -1.25, tail: [0.24, 3.62], strobe: [1.42, 2.95], landing: [-1.5, -0.33, -1.72] },
    tipFxZ: -1.1,
  },
};

// ----------------------------------------------------------------------------------------------------
// Mistral : bimoteur d'affaires six places (type Beechcraft Baron). Train rentrant, 350 km/h.
// ----------------------------------------------------------------------------------------------------
const MISTRAL = {
  id: 'mistral', name: 'Mistral', role: 'Bimoteur', seats: 6, engineLabel: '2 moteurs à pistons de 255 ch',
  desc: 'Deux moteurs, six places et un train rentrant : le Mistral avale les longues distances à 340 km/h. Plus lourd et plus rapide, il demande d\'anticiper la descente et de sortir le train à temps.',
  unlock: 'defi-traversee', color: 0xf4f4f0, accent: 0x1f3f7a, acc2: 0xc9a227,
  // performances mesurées au banc d'essai (scripts/flight-test.mjs), affichées au hangar
  perf: { vmax: 333, cruise: 280, stall: 111, takeoff: 477, roll: 76 },
  specs: {
    emptyMass: 1700, pilotMass: 85, S: 18.5, b: 11.5, c: 1.65,
    inertia: V3(5200, 8400, 4600),
    CL0: 0.2, CLa: 5.0, alphaStall: 0.26, alphaStallNeg: -0.2, CLflap: 0.28, alphaStallFlap: -0.015,
    CD0: 0.023, k: 0.05, CDgear: 0.014, CDflap: 0.02, CDprop: 0.02, CYb: -0.5,
    Clb: -0.08, Clp: -0.47, Clr: 0.08, Clda: 0.042,
    Cm0: 0.0234, Cma: -0.9, Cmq: -14, Cmde: 0.5, Cmflap: -0.01,
    Cnb: 0.08, Cnr: -0.12, Cndr: 0.05, Cnda: -0.004, Cnp: -0.03,
    engine: 'piston', maxPower: 380000, staticThrust: 6800, propEff: 0.7,
    fuelCapacity: 450, fuelDensity: 0.72, fuelFlowIdle: 14, fuelFlowMax: 110,
    gear: 1.7, vFlaps: 62, vGear: 75, vne: 112, flapNotches: [0, 15, 30], retractable: true,
  },
  geo: contacts({
    mass: 2109, gear: 1.7, nose: [0, -3.6], mains: [2.0, -0.7],
    tips: [5.75, -0.06, -1.2], props: [[-2.0, -1.15, -3.35], [2.0, -1.15, -3.35]], tops: [[2.05, 3.9], [0.85, -1.5]],
    tail: [0.05, 4.5], bellies: [[-0.7, -2.0], [-0.55, 0.5]],
  }),
  cg: V3(0, -0.2, -1.0),
  sound: { kind: 'twin', base: 8, range: 76, cyl: 6, blades: 3, pipe: 115 },
  model: {
    fuse: [
      [-4.65, 0.12, 0.12, -0.12], [-4.4, 0.3, 0.28, -0.1], [-3.9, 0.46, 0.42, -0.06], [-3.2, 0.58, 0.56, 0.02],
      [-2.5, 0.65, 0.7, 0.1], [-1.5, 0.66, 0.74, 0.12], [-0.3, 0.65, 0.72, 0.12], [0.8, 0.56, 0.62, 0.14],
      [2.0, 0.4, 0.46, 0.2], [3.2, 0.24, 0.32, 0.28], [4.2, 0.12, 0.22, 0.34], [4.55, 0.05, 0.14, 0.36],
    ],
    glass: {
      shield: [-3.05, -2.35, 0.25, 0.97],
      sides: [{ z0: -2.35, z1: 0.75, ny0: 0.2, ny1: 0.66, gaps: [-1.45, -0.35], gapW: 0.12 }],
      xMin: 0.3, posts: [-2.35],
    },
    stripes: [[-0.2, -0.06, 'acc', -4.3], [-0.3, -0.24, 'acc2', -4.3]],
    wing: {
      y: -0.42, le: -1.85, half: 5.75, root: 1.95, tip: 1.15, taperFrom: 1.0, dihedral: 0.06, sweep: 0,
      thick: 0.14, tipThick: 0.08, flaps: [0.75, 3.25], ail: [3.35, 5.45], accentFrom: 5.0,
    },
    stab: { y: 0.48, le: 3.35, half: 2.25, root: 1.0, tip: 0.6, sweep: 0.1 },
    fin: { y0: 0.5, y1: 2.05, root: 1.65, tip: 0.7, le0: 2.6, le1: 3.9, accentFrom: 1.3 },
    props: [-1, 1].map((s) => ({ x: s * 2.0, y: -0.2, z: -3.3, r: 0.95, blades: 3, spinner: 0.85, nacelle: { z1: 0.7, rad: 0.36 }, spin: s })),
    exhaust: [-1.72, -0.42, -2.2],
    gear: { r: 0.3, pants: false, mains: { x: 2.0, z: -0.7, ay: -0.5, style: 'strut' }, nose: { z: -3.6, ay: -0.45 } },
    cabin: {
      panel: { y: 0.14, z: -2.58, w: 1.2 }, seats: [[-0.3, -1.75], [0.3, -1.75], [-0.3, -0.65], [0.3, -0.65], [-0.3, 0.35], [0.3, 0.35]], seatY: -0.2,
      yokes: [-0.3, 0.3], yokeY: 0.04, yokeZ: -2.48, floor: { y: -0.5, z: -1.0, len: 3.6, w: 1.1 },
    },
    lights: { navZ: -1.3, tail: [0.36, 4.6], strobe: [2.07, 3.95], landing: [-1.2, -0.42, -1.92] },
    tipFxZ: -1.1,
  },
};

// ----------------------------------------------------------------------------------------------------
// Albatros : hydravion amphibie (type Cessna 206 sur flotteurs). Se pose sur l'eau ET sur les pistes.
// ----------------------------------------------------------------------------------------------------
const ALBATROS = {
  id: 'albatros', name: 'Albatros', role: 'Hydravion amphibie', seats: 6, engineLabel: '1 moteur à pistons de 285 ch',
  desc: 'Des flotteurs avec des roues dedans : train rentré, il se pose sur la mer, les lacs et les baies ; train sorti, sur les pistes. Ne jamais toucher l\'eau train sorti, il capoterait !',
  unlock: 'ouest-sos-plateforme', color: 0xf6f6f2, accent: 0xe5622a, acc2: 0x274b7a,
  // performances mesurées au banc d'essai (scripts/flight-test.mjs), affichées au hangar
  perf: { vmax: 222, cruise: 182, stall: 95, takeoff: 419, roll: 60 },
  specs: {
    emptyMass: 1150, pilotMass: 85, S: 16.3, b: 11.0, c: 1.5,
    inertia: V3(2700, 3900, 2200),
    CL0: 0.25, CLa: 4.9, alphaStall: 0.27, alphaStallNeg: -0.22, CLflap: 0.2, alphaStallFlap: -0.012,
    CD0: 0.042, k: 0.055, CDgear: 0.006, CDflap: 0.014, CDprop: 0.013, CYb: -0.5,
    Clb: -0.09, Clp: -0.47, Clr: 0.09, Clda: 0.047,
    Cm0: 0.059, Cma: -0.9, Cmq: -12.5, Cmde: 0.45, Cmflap: -0.008,
    Cnb: 0.075, Cnr: -0.11, Cndr: 0.045, Cnda: -0.004, Cnp: -0.03,
    engine: 'piston', maxPower: 210000, staticThrust: 3600, propEff: 0.65,
    fuelCapacity: 300, fuelDensity: 0.72, fuelFlowIdle: 8, fuelFlowMax: 72,
    gear: 2.45, vFlaps: 46, vGear: 62, vne: 80, flapNotches: [0, 10, 20, 30], retractable: true, amphibious: true,
  },
  geo: contacts({
    mass: 1451, gear: 2.45, nose: [[-1.3, -3.3], [1.3, -3.3]], mains: [1.3, -0.9],
    tips: [5.5, 0.95, -1.3], props: [[0, -1.0, -3.85]], tops: [[1.95, 4.0], [1.15, -1.2]],
    tail: [0.15, 4.2], bellies: [[-0.6, -1.6], [-0.45, 1.2]],
    floats: [[-1.3, -2.05, -3.3], [1.3, -2.05, -3.3], [-1.3, -2.05, 1.4], [1.3, -2.05, 1.4]],
    extraTails: [[-1.3, -1.85, 3.0], [1.3, -1.85, 3.0]],
  }),
  cg: V3(0, -0.2, -1.2),
  sound: { kind: 'piston', base: 8, range: 74, rough: 1.1, cyl: 9, blades: 3, pipe: 88 }, // moteur en étoile : grondement rauque
  model: {
    fuse: CUB_FUSE.map(([z, w, h, y]) => [z, w * 1.04, h * 1.04, y]),
    glass: {
      shield: [-2.45, -1.72, 0.14, 0.985],
      sides: [{ z0: -1.72, z1: 0.6, ny0: 0.24, ny1: 0.74, gaps: [-0.65, 0.05], gapW: 0.06 }],
      xMin: 0.25, posts: [-1.72],
    },
    stripes: [[-0.2, -0.04, 'acc', -3.2], [-0.32, -0.24, 'acc2', -3.2]],
    wing: {
      y: 1.02, le: -1.95, half: 5.5, root: 1.6, tip: 1.15, taperFrom: 2.9, dihedral: 0.03, sweep: 0,
      thick: 0.13, tipThick: 0.07, flaps: [0.62, 2.9], ail: [2.95, 5.2],
      struts: { from: [0.54, -0.32, -1.1], x: 2.7, z: -1.2 }, accentFrom: 4.6,
    },
    stab: { y: 0.42, le: 3.25, half: 1.9, root: 0.88, tip: 0.5, sweep: 0.12 },
    fin: { y0: 0.45, y1: 1.95, root: 1.35, tip: 0.45, le0: 2.7, le1: 3.8, accentFrom: 1.2 },
    props: [{ x: 0, y: 0, z: -3.75, r: 1.0, blades: 3, spinner: 1, intakes: true }],
    exhaust: [0.24, -0.5, -2.9],
    antenna: [0, 1.16, -0.2],
    gear: {
      r: 0.25, pants: false, floats: { x: 1.3, z0: -4.5, z1: 3.1, bottom: -2.05, h: 0.62, w: 0.4 },
      mains: { x: 1.3, z: -0.9, style: 'float' }, nose: { z: -3.3, x: 1.3, style: 'float' },
    },
    cabin: CUB_CABIN,
    lights: { navZ: -1.5, tail: [1.0, 4.22], strobe: [1.97, 4.0], landing: [-1.6, 1.0, -1.97] },
    tipFxZ: -1.0,
  },
};

// ----------------------------------------------------------------------------------------------------
// Éclair : biréacteur léger (type Eclipse 500). 600 km/h, cabine pressurisée, empennage en T.
// ----------------------------------------------------------------------------------------------------
const ECLAIR = {
  id: 'eclair', name: 'Éclair', role: 'Jet d\'affaires', seats: 6, engineLabel: '2 réacteurs de 4,1 kN',
  desc: 'Le joyau de la flotte. Deux réacteurs, près de 600 km/h : il traverse la carte en quelques minutes. Les réacteurs mettent du temps à monter en régime et il atterrit vite : approche stabilisée obligatoire.',
  unlock: 'defi-champ-finale', color: 0xf5f6f8, accent: 0x0f6d7a, acc2: 0x9aa4ae,
  // performances mesurées au banc d'essai (scripts/flight-test.mjs), affichées au hangar
  perf: { vmax: 594, cruise: 489, stall: 141, takeoff: 832, roll: 92 },
  specs: {
    emptyMass: 1610, pilotMass: 85, S: 13.4, b: 11.6, c: 1.25,
    inertia: V3(6000, 9500, 4200),
    CL0: 0.15, CLa: 5.2, alphaStall: 0.24, alphaStallNeg: -0.18, CLflap: 0.3, alphaStallFlap: -0.012,
    CD0: 0.024, k: 0.048, CDgear: 0.016, CDflap: 0.025, CDprop: 0.004, CYb: -0.55,
    Clb: -0.08, Clp: -0.45, Clr: 0.08, Clda: 0.03,
    Cm0: 0.0118, Cma: -0.9, Cmq: -16, Cmde: 0.6, Cmflap: -0.012,
    Cnb: 0.09, Cnr: -0.13, Cndr: 0.05, Cnda: -0.003, Cnp: -0.02,
    engine: 'jet', staticThrust: 8200, ram: 0.0016, spool: 0.45, startTime: 4,
    fuelCapacity: 900, fuelDensity: 0.8, fuelFlowIdle: 70, fuelFlowMax: 420,
    gear: 1.53, vFlaps: 72, vGear: 85, vne: 190, flapNotches: [0, 15, 30], retractable: true,
  },
  geo: contacts({
    mass: 2415, gear: 1.53, nose: [0, -3.9], mains: [1.55, -0.3],
    tips: [5.8, -0.22, 0.4], tops: [[2.5, 4.4], [0.85, -1.5]],
    tail: [0.15, 4.9], bellies: [[-0.8, -2.0], [-0.7, 0.8]],
  }),
  cg: V3(0, -0.15, -0.5),
  sound: { kind: 'jet' },
  model: {
    fuse: [
      [-5.25, 0.05, 0.05, -0.05], [-5.05, 0.25, 0.22, -0.05], [-4.6, 0.45, 0.4, -0.02], [-3.9, 0.62, 0.6, 0.04],
      [-3.1, 0.74, 0.76, 0.1], [-2.2, 0.78, 0.82, 0.12], [-0.5, 0.78, 0.82, 0.12], [1.0, 0.74, 0.78, 0.14],
      [2.2, 0.6, 0.64, 0.22], [3.4, 0.42, 0.48, 0.32], [4.4, 0.24, 0.32, 0.4], [4.95, 0.1, 0.18, 0.44],
    ],
    glass: {
      shield: [-3.78, -3.02, 0.28, 0.9],
      sides: [
        { z0: -3.02, z1: -2.55, ny0: 0.3, ny1: 0.72 },
        { z0: -2.3, z1: 1.05, ny0: 0.12, ny1: 0.44, period: 0.62, size: 0.34 },
      ],
      xMin: 0.4, posts: [-3.02],
    },
    stripes: [[-0.06, 0.04, 'acc', -4.7], [-0.14, -0.1, 'acc2', -4.7]],
    wing: {
      y: -0.55, le: -0.95, half: 5.8, root: 2.3, tip: 0.9, taperFrom: 0.85, dihedral: 0.05, sweep: 0.1,
      thick: 0.12, tipThick: 0.08, flaps: [0.85, 3.3], ail: [3.4, 5.35], accentFrom: 5.2, winglets: true,
    },
    stab: { y: 2.45, le: 4.05, half: 2.05, root: 1.05, tip: 0.55, sweep: 0.22 },
    fin: { y0: 0.65, y1: 2.45, root: 2.1, tip: 1.2, le0: 2.75, le1: 4.15, accentFrom: 1.6 },
    jets: [-1, 1].map((s) => ({ x: s * 1.1, y: 0.58, z0: 1.5, z1: 3.55, r: 0.37 })),
    exhaust: [-1.1, 0.58, 3.6],
    antenna: [0, 0.98, 0.4],
    gear: { r: 0.28, pants: false, mains: { x: 1.55, z: -0.3, ay: -0.6, style: 'strut', fold: 'in' }, nose: { z: -3.9, ay: -0.55 } },
    cabin: {
      panel: { y: 0.2, z: -3.28, w: 1.3 }, seats: [[-0.32, -2.45], [0.32, -2.45], [-0.36, -1.2], [0.36, -1.2], [-0.36, -0.1], [0.36, -0.1]], seatY: -0.24,
      yokes: [-0.32, 0.32], yokeY: 0.02, yokeZ: -3.12, floor: { y: -0.6, z: -1.0, len: 4.4, w: 1.3 },
    },
    lights: { navZ: 0.55, tail: [0.44, 5.0], strobe: [2.52, 4.45], landing: [-1.4, -0.55, -0.85] },
    tipFxZ: 0.5,
  },
};

export const AIRCRAFT = [CUB, MOUSTIQUE, FAUCON, MISTRAL, ALBATROS, ECLAIR];
export const aircraftById = (id) => AIRCRAFT.find((a) => a.id === id) || CUB;
export const aircraftIndex = (id) => Math.max(0, AIRCRAFT.findIndex((a) => a.id === id));

// Valeurs déduites : sensation du manche réglée pour que chaque avion demande à peu près le même
// facteur de charge quand on tient une touche (≈ +1,6 g en plus, plus pour la voltige)
for (const a of AIRCRAFT) {
  const S = a.specs;
  S.name = a.name;
  S.pilotMass ??= 85;
  S.belly ??= 0.7;
  S.gTol ??= 1;
  S.spool ??= 1.8;
  S.startTime ??= 1.6;
  if (a.cg) a.geo.cg = a.cg;
  if (S.feelV === undefined) {
    const m = S.emptyMass + S.pilotMass + S.fuelCapacity * S.fuelDensity;
    const n1 = S.feelN ?? 1.58;
    S.feelV = Math.sqrt((n1 * -S.Cma * 2 * m * G) / (S.CLa * S.Cmde * 1.225 * S.S));
    // plancher : à la VNE, une touche tenue demande ≈ +3,3 g (comme l'avion de base)
    S.feelFloor = (3.3 / 1.58) * (S.feelV / S.vne) ** 2;
  }
}

// avions débloqués pour une sauvegarde
export function unlockedAircraft(save) {
  return AIRCRAFT.filter((a) => !a.unlock || save.completed?.includes(a.unlock));
}
