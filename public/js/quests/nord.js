// Quêtes de la région : nord (Mont Givre, Station Glacier, Cap Nord, Toit du Monde,
// Observatoire, Phare du Nord, Grande Arche)
import {
  A, L, land, touch, reach, drop, ring, ringsAround, terrainFollow, windTurbines, WIND_FARMS, SHIPS, terrainHeight,
} from './kit.js';

const ARCHE = L('arche');
const OBSERVATOIRE = L('observatoire');
const PHARE_NORD = L('phare-nord');
// Le cargo Banquise (bateau n°0) tourne en rond (rayon ~450 m) près de Station Glacier
const BANQUISE = SHIPS[0];

// Expédition du Toit du Monde : camps posés sur le flanc est du massif
const CAMP_BASE = { x: -12400, z: -17700 }; // ~650 m, à l'entrée du cirque, accessible par l'est
const CAMP_ALTITUDE = { x: -12900, z: -19100 }; // ~1 870 m, épaulement sous le sommet
const ALPINISTE = { x: -13600, z: -19650 }; // ~2 650 m, à 250 m du sommet

// Slalom entre les éoliennes du parc n°2 (au nord-ouest de Station Glacier)
function slalomEoliennes(farmIndex, lateral, agl, size) {
  const f = WIND_FARMS[farmIndex];
  const dx = Math.cos(f.heading), dz = Math.sin(f.heading); // axe de la rangée
  const nx = -dz, nz = dx; // perpendiculaire
  const t = windTurbines(farmIndex);
  const first = t[0], last = t[t.length - 1];
  return [
    ring({ x: first.x - dx * 450, z: first.z - dz * 450 }, 70),
    ...t.map((p, i) => ring({ x: p.x + nx * lateral * (i % 2 ? 1 : -1), z: p.z + nz * lateral * (i % 2 ? 1 : -1) }, agl, { size })),
    ring({ x: last.x + dx * 450, z: last.z + dz * 450 }, 70),
  ];
}

// terrainFollow() garantit la marge au droit de chaque anneau, mais pas toujours sur la ligne droite
// entre un anneau haut et un anneau bas (crête au milieu). On relève donc les deux anneaux d'un segment
// tant que la ligne qui les relie ne passe pas à au moins `marge` m au-dessus du relief.
function suiviSur(rings, clearance = 150, maxSlope = 0.15, marge = 100) {
  const out = terrainFollow(rings, clearance, maxSlope);
  const sol = (x, z) => Math.max(0, terrainHeight(x, z));
  for (let pass = 0; pass < 10; pass++) {
    let ok = true;
    for (let i = 1; i < out.length; i++) {
      const a = out[i - 1], b = out[i];
      let pire = Infinity;
      for (let k = 1; k < 60; k++) {
        const t = k / 60;
        pire = Math.min(pire, a.alt + (b.alt - a.alt) * t - sol(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t));
      }
      if (pire < marge) {
        const d = Math.ceil(marge - pire);
        a.alt += d;
        b.alt += d;
        ok = false;
      }
    }
    if (ok) break;
  }
  return out;
}

// Tour du massif : cercle de 3,3 km autour de son centre, premier anneau du côté de Mont Givre
const MASSIF = { x: -13500, z: -19500 };
const capGivre = Math.atan2(A('givre').z - MASSIF.z, A('givre').x - MASSIF.x);

export default [
  // ---------- Chaîne : l'expédition du Toit du Monde ----------
  {
    id: 'nord-expe-reperage', title: 'Repérage du Toit du Monde', category: 'exploration', airport: 'givre',
    desc: 'L\'alpiniste Lina prépare l\'ascension du Toit du Monde. Fais le tour du massif en passant les anneaux, '
      + 'repère l\'emplacement du camp de base (sous 250 m du sol) puis rapporte tes notes à Mont Givre.',
    reward: 1000,
    steps: [
      // pente limitée à 15 % entre anneaux : on reste pilotable avec un petit monomoteur
      ...suiviSur(ringsAround(MASSIF.x, MASSIF.z, 3300, 8, 150, capGivre), 150, 0.15)
        .map((r) => ({ ...r, text: 'Tour du massif : passe dans l\'anneau et observe les faces de la montagne' })),
      reach(CAMP_BASE, 300, 'camp de base', {
        maxAgl: 250, spawn: 'flag',
        text: 'Repère le camp de base à l\'entrée du cirque, côté est (fanion rouge) : passe à moins de 250 m du sol',
      }),
      land('givre', { text: 'Rapporte tes notes à Lina, à Mont Givre' }),
    ],
  },
  {
    id: 'nord-expe-camps', title: 'Ravitaillement des camps', category: 'livraison', airport: 'givre',
    requires: 'nord-expe-reperage',
    desc: 'L\'expédition est en route ! Largue (X) des vivres au camp d\'altitude (1 870 m, sous 200 m du sol) '
      + 'puis au camp de base (sous 150 m du sol), et reviens à Mont Givre.',
    reward: 1000, bonusTime: 660, bonusReward: 250,
    steps: [
      drop(CAMP_ALTITUDE, 200, 'camp d\'altitude', {
        maxAgl: 200, spawn: 'tent',
        text: 'Camp d\'altitude (1 870 m) : arrive par l\'est et largue les vivres (X) à moins de 200 m du sol — la paroi est juste derrière !',
      }),
      drop(CAMP_BASE, 150, 'camp de base', {
        maxAgl: 150, spawn: 'tent',
        text: 'Redescends au camp de base (650 m) et largue la deuxième caisse (X) à moins de 150 m du sol',
      }),
      land('givre'),
    ],
  },
  {
    id: 'nord-expe-sos', title: 'SOS au Toit du Monde', category: 'sauvetage', airport: 'givre',
    requires: 'nord-expe-camps', minRank: 2,
    desc: 'Lina s\'est blessée à 2 650 m, juste sous le sommet ! Repère-la (sous 300 m du sol), largue-lui le kit de secours '
      + '(X, sous 250 m), puis file à Station Glacier chercher le médecin. Tu as 14 minutes.',
    reward: 1900, timeLimit: 840, bonusTime: 660, bonusReward: 400,
    steps: [
      reach(ALPINISTE, 300, 'Lina', {
        maxAgl: 300, spawn: 'hiker',
        text: 'Monte vers le sommet et repère Lina (fumée rouge) : passe à moins de 300 m du sol',
      }),
      drop(ALPINISTE, 200, 'Lina', {
        maxAgl: 250, spawn: 'hiker',
        text: 'Largue le kit de secours (X) près de Lina, à moins de 250 m du sol — attention aux crêtes !',
      }),
      land('glacier', { text: 'Fonce à Station Glacier chercher le médecin et pose-toi' }),
    ],
  },

  // ---------- Slalom des éoliennes ----------
  {
    id: 'nord-eoliennes', title: 'Slalom des éoliennes', category: 'course', airport: 'glacier',
    desc: 'Le parc éolien du Nord organise sa course annuelle : slalome entre les six éoliennes en passant les anneaux '
      + '(55 à 70 m du sol, à hauteur des pales !), rase la plaine 10 s sous 60 m puis reviens à Station Glacier.',
    reward: 650, bonusTime: 330, bonusReward: 200,
    steps: [
      ...slalomEoliennes(2, 90, 55, 25),
      { type: 'low', maxAgl: 60, duration: 10, x: WIND_FARMS[2].x, z: WIND_FARMS[2].z, radius: 1500, label: 'autour du parc éolien',
        text: 'Tour d\'honneur : vole sous 60 m pendant 10 s autour du parc éolien' },
      land('glacier'),
    ],
  },

  // ---------- Trouvée sur le terrain : sur la côte face à l'Arche ----------
  {
    id: 'nord-regate', title: 'La régate de l\'Arche', category: 'tourisme', giver: { x: -13300, z: -24300 },
    desc: 'Le journal du Nord couvre la régate : reste 40 s à moins de 500 m de trois voiliers (sous 500 m d\'altitude), '
      + 'passe sous la Grande Arche comme eux, puis dépose les photos à Station Glacier.',
    reward: 1100,
    steps: [
      { type: 'follow', ship: 2, distance: 500, duration: 40, label: 'le voilier Albatros',
        text: 'Le voilier Albatros mène la course : reste à moins de 500 m de lui pendant 40 s' },
      ring({ x: ARCHE.x, z: ARCHE.z - 800 }, 50, { text: 'Aligne-toi au nord de la Grande Arche' }),
      ring(ARCHE, 45, { text: 'Passe sous la Grande Arche, comme les voiliers !' }),
      ring({ x: ARCHE.x, z: ARCHE.z + 800 }, 50, { text: 'Ressors au sud de l\'Arche' }),
      { type: 'follow', ship: 1, distance: 500, duration: 40, label: 'le voilier Mistral',
        text: 'Le voilier Mistral remonte à l\'ouest : reste à moins de 500 m de lui pendant 40 s' },
      { type: 'follow', ship: 8, distance: 500, duration: 40, label: 'le voilier Boréal',
        text: 'Le voilier Boréal ferme la marche au nord : reste à moins de 500 m de lui pendant 40 s' },
      land('glacier', { text: 'Dépose les photos à Station Glacier' }),
    ],
  },

  // ---------- Trouvée sur le terrain : à l'Observatoire ----------
  {
    id: 'nord-ballon-sonde', title: 'Mesures en altitude', category: 'exploration', giver: { x: OBSERVATOIRE.x, z: OBSERVATOIRE.z },
    desc: 'L\'astronome veut comparer ses mesures : vole 30 s à moins de 500 m de la montgolfière météo, tiens 3 300-3 500 m '
      + 'pendant 45 s, largue les relevés (X) sur l\'Observatoire (sous 200 m du sol) et pose-toi à Mont Givre.',
    reward: 1000,
    steps: [
      { type: 'follow', balloon: 11, distance: 500, duration: 30, label: 'la montgolfière météo',
        text: 'Rejoins la montgolfière météo au-dessus de la plaine et reste à moins de 500 m d\'elle pendant 30 s' },
      { type: 'hold', min: 3300, max: 3500, duration: 45, text: 'Calibrage : tiens ton altitude entre 3 300 et 3 500 m pendant 45 s' },
      drop(OBSERVATOIRE, 200, OBSERVATOIRE.name, {
        maxAgl: 200, spawn: 'smoke',
        text: 'Largue les relevés (X) sur l\'Observatoire (fumée jaune), à moins de 200 m du sol',
      }),
      land('givre'),
    ],
  },

  // ---------- Tournée postale chronométrée ----------
  {
    id: 'nord-facteur-polaire', title: 'Le facteur du Grand Nord', category: 'livraison', airport: 'nord',
    minRank: 1,
    desc: 'Tournée express ! Largue le courrier (X, sous 150 m) au Phare du Nord puis près du cargo Banquise (sous 120 m), '
      + 'toucher-décoller à Station Glacier, 20 s à moins de 500 m de la montgolfière météo, retour à Cap Nord. 20 min max.',
    reward: 1400, timeLimit: 1200, bonusTime: 960, bonusReward: 300,
    steps: [
      drop(PHARE_NORD, 150, PHARE_NORD.name, {
        maxAgl: 150, spawn: 'flag',
        text: 'Largue le courrier du gardien (X) au pied du Phare du Nord, à moins de 150 m du sol',
      }),
      drop({ x: BANQUISE.x, z: BANQUISE.z }, Math.ceil(BANQUISE.radius + 50), 'cargo Banquise', {
        maxAgl: 120,
        text: 'Le cargo Banquise tourne près de Station Glacier : largue son sac (X) dans la zone, à moins de 120 m de l\'eau',
      }),
      touch('glacier', { text: 'Toucher-décoller à Station Glacier pour récupérer le sac de la station' }),
      { type: 'follow', balloon: 11, distance: 500, duration: 20, label: 'la montgolfière météo',
        text: 'Le météorologue de la montgolfière fait aussi facteur : reste à moins de 500 m de lui pendant 20 s' },
      land('nord', { text: 'Reviens à Cap Nord : la tournée est finie !' }),
    ],
  },
];
