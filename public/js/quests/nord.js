// Quêtes de la région : nord (Mont Givre, Station Glacier, Cap Nord, Toit du Monde,
// Observatoire, Phare du Nord, Grande Arche)
import {
  A, L, land, touch, reach, drop, ring, ringsAround, windTurbines, WIND_FARMS, SHIPS, terrainHeight,
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

// Le photographe du Journal du Nord, sur la côte (~115 m), 3 km à l'est de la Grande Arche
const PHOTOGRAPHE = { x: -13300, z: -24300 };

// Slalom du parc éolien n°2 (4 km au sud-sud-ouest de Station Glacier). Les éoliennes ne sont qu'à 220 m
// l'une de l'autre : zigzaguer autour de chacune demanderait des virages de 80 m de rayon, impossibles
// pour l'avion (~300 m à 45° d'inclinaison). On contourne donc les éoliennes deux par deux : une porte
// à côté de chaque paire, en alternant les côtés ; la trajectoire recoupe la rangée à mi-chemin entre
// deux mâts (à 110 m de chacun, les pales en balaient moins de 30 m sur le côté).
function slalomEoliennes(farmIndex, lateral, agl) {
  const f = WIND_FARMS[farmIndex];
  const ux = Math.cos(f.heading), uz = Math.sin(f.heading); // axe de la rangée
  const nx = -uz, nz = ux; // perpendiculaire
  const t = windTurbines(farmIndex);
  const at = (along, lat) => ({ x: t[0].x + ux * along + nx * lat, z: t[0].z + uz * along + nz * lat });
  const len = 220 * (t.length - 1);
  const portes = [];
  for (let k = 0; 2 * k + 1 < t.length; k++) portes.push(ring(at(220 * (2 * k + 0.5), lateral * (k % 2 ? 1 : -1)), agl));
  return [ring(at(-450, 0), agl + 10), ...portes, ring(at(len + 450, 0), agl + 10)];
}

// Suivi de terrain « pilotable » pour ce petit monomoteur. terrainFollow() du kit ne garantit la marge
// qu'au droit des anneaux (pas sur la ligne droite entre deux anneaux) et autorise des pentes de 25 %,
// alors que l'avion ne monte qu'à ~4 m/s (pente ≈ 8-10 % au mieux). Ici, dans l'ordre du parcours :
// marge `clearance` sous chaque anneau, `ligne` m au-dessus du relief sur tout le segment,
// montée ≤ `montee` et descente ≤ `descente`. Les anneaux sont relevés par petits pas jusqu'à
// satisfaire toutes les contraintes (on reste ainsi proche du minimum nécessaire).
function suiviDoux(rings, { clearance = 150, ligne = 120, montee = 0.07, descente = 0.15 } = {}) {
  const sol = (x, z) => Math.max(0, terrainHeight(x, z));
  const pts = rings.map((r) => ({ ...r }));
  const alts = pts.map((r) => Math.max(sol(r.x, r.z) + clearance, r.alt ?? 0));
  for (let pass = 0; pass < 5000; pass++) {
    let change = false;
    const monte = (i, v) => { if (v > alts[i] + 0.5) { alts[i] = v; change = true; } };
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], d = Math.hypot(b.x - a.x, b.z - a.z);
      const n = Math.ceil(d / 40);
      let pire = Infinity, tPire = 0.5;
      for (let k = 1; k < n; k++) {
        const t = k / n;
        const m = alts[i - 1] + (alts[i] - alts[i - 1]) * t - sol(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t);
        if (m < pire) { pire = m; tPire = t; }
      }
      if (pire < ligne) {
        const s = Math.min(5, ligne - pire);
        monte(i - 1, alts[i - 1] + s * (1 - tPire) + 0.6);
        monte(i, alts[i] + s * tPire + 0.6);
      }
      monte(i - 1, alts[i] - montee * d);
      monte(i, alts[i - 1] - descente * d);
    }
    if (!change) break;
  }
  return pts.map((r, i) => {
    const { agl, ...rest } = r;
    void agl;
    return { ...rest, alt: Math.round(alts[i]) };
  });
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
      // montée ≤ 7 % et descente ≤ 15 % entre anneaux : pilotable avec un petit monomoteur
      ...suiviDoux(ringsAround(MASSIF.x, MASSIF.z, 3300, 8, 150, capGivre))
        .map((r, i) => ({
          ...r,
          text: i === 0
            ? `Premier anneau à ${r.alt} m au sud-est du massif : spirale au-dessus de Mont Givre pour prendre de la hauteur avant d'y aller`
            : 'Tour du massif : passe dans l\'anneau et observe les faces de la montagne',
        })),
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
    // ~6 min de montée jusqu'au camp d'altitude, puis 1 200 m à redescendre : 13 min, c'est un bon chrono
    reward: 1000, bonusTime: 780, bonusReward: 250,
    steps: [
      drop(CAMP_ALTITUDE, 200, 'camp d\'altitude', {
        maxAgl: 200, spawn: 'tent',
        text: 'Camp d\'altitude (1 870 m) : arrive par l\'est vers 2 000 m, largue les vivres (X) à moins de 200 m du sol, puis vire aussitôt au sud — la paroi est juste derrière !',
      }),
      drop(CAMP_BASE, 150, 'camp de base', {
        maxAgl: 150, spawn: 'tent',
        text: 'Redescends au camp de base (650 m) — sors du cirque par l\'est pour perdre de la hauteur — et largue la deuxième caisse (X) à moins de 150 m du sol',
      }),
      land('givre'),
    ],
  },
  {
    id: 'nord-expe-sos', title: 'SOS au Toit du Monde', category: 'sauvetage', airport: 'givre',
    requires: 'nord-expe-camps', minRank: 2,
    desc: 'Lina s\'est blessée à 2 650 m, juste sous le sommet ! Repère-la (sous 300 m du sol), largue-lui le kit de secours '
      + '(X, sous 250 m), puis file à Station Glacier chercher le médecin. Tu as 20 minutes.',
    // la montée de 555 m à ~2 900 m prend à elle seule ~10 min plein gaz (≈ 4 m/s), la descente vers
    // Station Glacier ~3 min : ~16 min pour un vol sans faute
    reward: 1900, timeLimit: 1200, bonusTime: 960, bonusReward: 400,
    steps: [
      reach(ALPINISTE, 300, 'Lina', {
        maxAgl: 300, spawn: 'hiker',
        text: 'Grimpe plein gaz vers 2 900 m (spirale si besoin, ~10 min de montée) et repère Lina (fumée rouge) près du sommet : passe à moins de 300 m du sol',
      }),
      drop(ALPINISTE, 200, 'Lina', {
        maxAgl: 250, spawn: 'hiker',
        text: 'Largue le kit de secours (X) près de Lina, à moins de 250 m du sol — attention aux crêtes !',
      }),
      land('glacier', { text: 'Fonce à Station Glacier chercher le médecin et pose-toi (pique train rentré, ne le sors que sous 210 km/h)' }),
    ],
  },

  // ---------- Slalom des éoliennes ----------
  {
    id: 'nord-eoliennes', title: 'Slalom des éoliennes', category: 'course', airport: 'glacier',
    desc: 'Le parc éolien du Nord organise sa course annuelle : slalome entre les six éoliennes par les 5 anneaux '
      + '(60 à 70 m du sol, à hauteur des pales !), rase la plaine 10 s sous 60 m puis reviens à Station Glacier.',
    reward: 650, bonusTime: 400, bonusReward: 200,
    steps: [
      ...slalomEoliennes(2, 100, 60).map((r, i, all) => ({
        ...r,
        text: i === 0 ? 'Entrée du slalom, à l\'ouest de la rangée : aborde l\'anneau cap à l\'est, dans l\'axe des éoliennes'
          : i === all.length - 1 ? 'Sortie du slalom, dans l\'axe de la rangée'
            : `Porte ${i} : passe à côté de la paire d'éoliennes, puis recoupe la rangée entre deux mâts`,
      })),
      { type: 'low', maxAgl: 60, duration: 10, x: WIND_FARMS[2].x, z: WIND_FARMS[2].z, radius: 1500, label: 'autour du parc éolien',
        text: 'Tour d\'honneur : vole sous 60 m pendant 10 s autour du parc éolien' },
      land('glacier'),
    ],
  },

  // ---------- Trouvée sur le terrain : le photographe sur la côte, face à l'Arche ----------
  // (pas une régate : « La régate du Volcan » d'est.js suit déjà des voiliers entre des bouées)
  {
    id: 'nord-arche-reportage', title: 'La une du Journal du Nord', category: 'tourisme', giver: PHOTOGRAPHE,
    desc: 'Le photographe du Journal du Nord a fixé un appareil sur ton aile ! Escorte l\'Albatros 40 s (< 500 m, sous 500 m), '
      + 'passe sous la Grande Arche, rase l\'eau 10 s sous 30 m, largue la pellicule (X, < 150 m) et pose-toi à Station Glacier.',
    reward: 800,
    steps: [
      { type: 'follow', ship: 2, distance: 500, duration: 40, label: 'le voilier Albatros',
        text: 'L\'Albatros file vers l\'Arche : reste à moins de 500 m de lui, sous 500 m d\'altitude, pendant 40 s' },
      ring({ x: ARCHE.x, z: ARCHE.z - 800 }, 50, { text: 'Aligne-toi au nord de la Grande Arche, cap au sud' }),
      ring(ARCHE, 45, { text: 'Passe sous la Grande Arche : clic-clac, c\'est dans la boîte !' }),
      ring({ x: ARCHE.x, z: ARCHE.z + 800 }, 50, { text: 'Ressors au sud de l\'Arche' }),
      { type: 'low', maxAgl: 30, duration: 10, x: ARCHE.x, z: ARCHE.z, radius: 1200, label: 'devant l\'Arche',
        text: 'Photo de couverture : rase l\'eau à moins de 30 m pendant 10 s près de l\'Arche' },
      drop(PHOTOGRAPHE, 150, 'le photographe', {
        maxAgl: 150, spawn: 'flag',
        text: 'Largue la pellicule (X) au photographe, sur la côte à 3 km à l\'est de l\'Arche, à moins de 150 m du sol',
      }),
      land('glacier', { text: 'Pose-toi à Station Glacier : demain, c\'est toi qui fais la une !' }),
    ],
  },

  // ---------- Trouvée sur le terrain : à l'Observatoire ----------
  {
    id: 'nord-ballon-sonde', title: 'Mesures en altitude', category: 'exploration', giver: { x: OBSERVATOIRE.x, z: OBSERVATOIRE.z },
    desc: 'L\'astronome veut comparer ses mesures : vole 30 s à moins de 500 m de la montgolfière météo, tiens 2 000-2 200 m '
      + 'pendant 45 s, largue les relevés (X) sur l\'Observatoire (sous 200 m du sol) et pose-toi à Mont Givre.',
    reward: 1000,
    steps: [
      { type: 'follow', balloon: 11, distance: 500, duration: 30, label: 'la montgolfière météo',
        text: 'Rejoins la montgolfière météo au-dessus de la plaine, à l\'est (vers 680 m), et reste à moins de 500 m d\'elle pendant 30 s' },
      { type: 'hold', min: 2000, max: 2200, duration: 45, text: 'Calibrage : monte et tiens ton altitude entre 2 000 et 2 200 m pendant 45 s (le trim t\'aidera)' },
      drop(OBSERVATOIRE, 200, OBSERVATOIRE.name, {
        maxAgl: 200, spawn: 'smoke',
        text: 'Largue les relevés (X) sur l\'Observatoire (fumée jaune), à moins de 200 m du sol — arrive par le sud, le relief monte juste derrière',
      }),
      land('givre'),
    ],
  },

  // ---------- Tournée postale chronométrée ----------
  {
    id: 'nord-facteur-polaire', title: 'Le facteur du Grand Nord', category: 'livraison', airport: 'nord',
    minRank: 1,
    desc: 'Tournée express ! Largue le courrier (X, sous 150 m) au Phare du Nord puis près du cargo Banquise (sous 120 m), '
      + 'toucher-décoller à Station Glacier, 20 s à moins de 500 m de la montgolfière météo, retour à Cap Nord. 21 min max.',
    // ~43 km et 4 manœuvres : ~18 min pour un bon pilote, ~16 min à fond
    reward: 1400, timeLimit: 1260, bonusTime: 1020, bonusReward: 300,
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
        text: 'Le météorologue de la montgolfière (vers 680 m) fait aussi facteur : reste à moins de 500 m de lui pendant 20 s' },
      land('nord', { text: 'Reviens à Cap Nord : la tournée est finie !' }),
    ],
  },
];
