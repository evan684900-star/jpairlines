// Défis transverses sur toute la carte : la Coupe des Quatre Vents (championnat en 4 manches),
// records (altitude, traversée ouest-est, tour des phares), escortes, grand sauvetage en mer,
// rase-vagues, marathon de toucher-décoller et voltige au-dessus du volcan.
import {
  A, L, VOLCANO, land, touch, reach, drop, ring, ringAlt, ringsAround, slalom,
} from './kit.js';

// ----- utilitaires locaux -----
const P = (x, z) => ({ x, z });
const hold = (min, max, duration, text) => ({ type: 'hold', min, max, duration, text });
const low = (maxAgl, duration, text, zone = {}) => ({ type: 'low', maxAgl, duration, text, ...zone });

// Spirale à plusieurs tours (ringsSpiral du kit ne fait qu'un tour) : `turns` tours, de alt0 à alt1
function spirale(cx, cz, radius, count, turns, alt0, alt1, phase = 0, extra = {}) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const t = phase + (i / (count - 1)) * turns * Math.PI * 2;
    out.push({
      type: 'ring', x: cx + Math.cos(t) * radius, z: cz + Math.sin(t) * radius,
      alt: Math.round(alt0 + ((alt1 - alt0) * i) / (count - 1)), ...extra,
    });
  }
  return out;
}

// Arc d'anneaux autour d'un point c, de a0 à a1 degrés (0 = est, 90 = sud, 180 = ouest, 270 = nord)
function arc(c, radius, a0, a1, count, agl, extra = {}) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const t = ((a0 + ((a1 - a0) * i) / (count - 1)) * Math.PI) / 180;
    out.push(ring(P(c.x + Math.cos(t) * radius, c.z + Math.sin(t) * radius), agl, extra));
  }
  return out;
}

// ----- lieux -----
const PHARE_O = L('phare'), PHARE_N = L('phare-nord'), PHARE_S = L('phare-sud');
const PLAGE_FALAISES = P(-16600, -1100); // plage au nord de la piste des Falaises (~10 m)
const BOUEE_FALAISES = P(-17900, -3300); // en mer, au large du bout de piste ouest
const CAMP_VOLCANO = P(24500, 10500); // camp des volcanologues, flanc nord de l'île (~260 m)
const PRE_BALLONS = P(22300, -2300); // pré d'envol des montgolfières, sur les hauteurs à l'ouest de Port-Levant

// Grand sauvetage en mer du Nord-Est
const NAUFRAGE = P(28000, -19000); // dernière position connue du voilier Goéland
const ZONE_RECHERCHE = P(29500, -23000);
const RADEAU_1 = P(31000, -26500);
const RADEAU_2 = P(33000, -33500);

export default [
  // =====================================================================
  // La Coupe des Quatre Vents : championnat en 4 manches de difficulté croissante
  // =====================================================================
  {
    id: 'defi-champ-qualif', title: 'Coupe des Quatre Vents : qualifs', category: 'course', airport: 'nord',
    desc: 'Gégé, le commentateur, t\'a inscrit à la Coupe ! Slalom de 6 anneaux à 100 m du sol, toucher-décoller '
      + 'à Station Glacier, palier entre 400 et 550 m pendant 20 s, puis retour à Cap Nord.',
    reward: 750, bonusTime: 760, bonusReward: 150,
    steps: [
      ...slalom(7500, -22500, -500, -24500, 6, 250, 100),
      touch('glacier', { text: 'Toucher-décoller sur l\'herbe de Station Glacier : les roues touchent, plein gaz !' }),
      hold(400, 550, 20, 'Palier de qualification : entre 400 et 550 m pendant 20 s. Gégé chronomètre…'),
      land('nord', { text: 'Retour à Cap Nord : pose-toi, les résultats tombent à l\'arrivée' }),
    ],
  },
  {
    id: 'defi-champ-precision', title: 'Coupe : l\'épreuve de précision', category: 'defi', airport: 'falaises',
    requires: 'defi-champ-qualif', minRank: 1,
    desc: 'Manche 2 : palier entre 300 et 400 m (30 s), sac de farine sur la croix de la plage (< 100 m du sol), '
      + 'puis sur la bouée (< 80 m), 8 s sur le dos, passage à moins de 30 m sur la piste (8 s) et atterrissage.',
    reward: 700,
    steps: [
      hold(300, 400, 30, 'Palier au cordeau : entre 300 et 400 m pendant 30 s, les juges ont des jumelles'),
      drop(PLAGE_FALAISES, 100, 'la croix sur la plage', {
        maxAgl: 100, spawn: 'flag', text: 'Largue le sac de farine (X) sur la croix de la plage, à moins de 100 m du sol',
      }),
      drop(BOUEE_FALAISES, 80, 'la bouée fumigène', {
        maxAgl: 80, spawn: 'smoke', text: 'Deuxième sac (X) sur la bouée fumigène au large : moins de 80 m au-dessus de l\'eau !',
      }),
      { type: 'inverted', duration: 8, text: 'Figure imposée : 8 s sur le dos devant la tribune (garde de la hauteur !)' },
      low(30, 8, 'Passage bas : moins de 30 m au-dessus de la piste des Falaises pendant 8 s', {
        x: A('falaises').x, z: A('falaises').z, radius: 900,
      }),
      land('falaises', { text: 'Atterrissage de précision aux Falaises : la piste en herbe ne fait que 950 m' }),
    ],
  },
  {
    id: 'defi-champ-volcan', title: 'Coupe : Grand Prix du Volcan', category: 'course', airport: 'volcan',
    requires: 'defi-champ-precision', minRank: 2,
    timeLimit: 1000, bonusTime: 760, bonusReward: 300,
    desc: 'Manche 3, contre Hector, le triple champion : tour de l\'île du Volcan par 10 anneaux à 55 m au-dessus '
      + 'des vagues, 20 s à moins de 30 m de l\'eau, puis pose-toi à Base du Volcan. 16 min 40 maximum !',
    reward: 1500,
    steps: [
      ...ringsAround(VOLCANO.x, VOLCANO.z, 5500, 10, 55, (200 * Math.PI) / 180, { size: 35 }).map((r, i) => (i === 0
        ? { ...r, text: 'Départ ! Premier anneau au nord du détroit, puis tour de l\'île dans le sens des aiguilles d\'une montre' }
        : r)),
      low(30, 20, 'Au ras des vagues : moins de 30 m au-dessus de l\'eau pendant 20 s'),
      land('volcan', { text: 'Pose-toi à Base du Volcan avant Hector !' }),
    ],
  },
  {
    id: 'defi-champ-finale', title: 'Coupe : la Grande Finale', category: 'defi', airport: 'capitale',
    requires: 'defi-champ-volcan', minRank: 3,
    timeLimit: 1740, bonusTime: 1300, bonusReward: 600,
    desc: 'Finale ! Tour Radio, slalom à 70 m du sol, toucher à Lac Miroir, 1 500 m, 12 s sur le dos, piqué à 310 km/h, '
      + 'palier 700-800 m (20 s), ballon largué sur le Stade (< 150 m), passage à < 30 m et posé à la Capitale. 29 min !',
    reward: 3200,
    steps: [
      ringAlt(L('tour'), 1000, { size: 40, text: 'Ouverture : passe l\'anneau au-dessus de la Tour Radio (1 000 m)' }),
      ...slalom(4000, -1000, 4500, -9500, 7, 250, 70),
      touch('lac', { text: 'Toucher-décoller sur la piste en herbe de Lac Miroir' }),
      { type: 'altitude', min: 1500, text: 'Remonte au-dessus de 1 500 m pour le programme de voltige' },
      { type: 'inverted', duration: 12, text: 'Passage dos : 12 s sur le dos, le public retient son souffle' },
      { type: 'speed', min: 310, text: 'Piqué ! Atteins 310 km/h (train rentré, G, sinon il sera arraché)' },
      hold(700, 800, 20, 'Rétablis : palier entre 700 et 800 m pendant 20 s'),
      drop(L('stade'), 120, 'le Grand Stade', {
        maxAgl: 150, spawn: 'flag', text: 'Largue le ballon du match (X) sur le Grand Stade, à moins de 150 m du sol',
      }),
      low(30, 10, 'Passage d\'honneur : moins de 30 m au-dessus de la piste de la Capitale pendant 10 s', {
        x: A('capitale').x, z: A('capitale').z, radius: 1400,
      }),
      land('capitale', { text: 'Pose-toi à Capitale International : l\'Hélice d\'Or est à toi, Hector te tire son chapeau !' }),
    ],
  },

  // =====================================================================
  // Records
  // =====================================================================
  {
    id: 'defi-record-altitude', title: 'Record d\'altitude', category: 'defi', airport: 'lac',
    minRank: 1,
    desc: 'Le record du club est de 4 500 m : bats-le ! Monte au-dessus de 4 600 m, tiens un palier entre 4 200 et '
      + '4 400 m pendant 45 s pour l\'homologation, passe l\'anneau à 3 000 m au-dessus du lac et pose-toi à Lac Miroir.',
    reward: 900,
    steps: [
      { type: 'altitude', min: 4600, text: 'Monte au-dessus de 4 600 m : plein gaz, nez haut vers 150 km/h, ça grimpe d\'environ 10 m/s' },
      hold(4200, 4400, 45, 'Homologation : reste entre 4 200 et 4 400 m pendant 45 s'),
      ringAlt(A('lac'), 3000, { size: 60, text: 'Redescends vers Lac Miroir et passe l\'anneau à 3 000 m au-dessus de la piste' }),
      land('lac', { text: 'Pose-toi à Lac Miroir : le record est homologué !' }),
    ],
  },
  {
    id: 'defi-traversee', title: 'La grande traversée', category: 'defi', airport: 'verte',
    minRank: 2, timeLimit: 2200, bonusTime: 1650, bonusReward: 500,
    desc: 'Traverse la carte d\'ouest en est : borne Ouest en mer, côte nord, escale obligatoire à Station Glacier '
      + 'pour le plein (moteur coupé, K), Phare du Nord, borne Est, puis Port-Levant. 36 min 40 maximum !',
    reward: 2300,
    steps: [
      ring(P(-27000, -24000), 80, { size: 50, text: 'Rejoins la borne Ouest, en mer au large de la côte nord-ouest' }),
      ring(P(-20500, -24800), 80, { size: 40 }),
      ring(P(-13000, -25500), 150, { size: 40, text: 'Passe l\'anneau au-dessus de la côte' }),
      land('glacier', { text: 'Escale technique à Station Glacier : arrête-toi, coupe le moteur (E) et fais le plein (K) !' }),
      ring(P(4000, -28000), 150, { size: 40 }),
      ring(PHARE_N, 200, { size: 40, text: 'Salue le gardien : anneau au-dessus du Phare du Nord' }),
      ring(P(19000, -26000), 100, { size: 40 }),
      ring(P(26000, -25000), 80, { size: 50, text: 'Borne Est : tu as traversé la carte !' }),
      land('levant', { text: 'Pose-toi à Port-Levant pour arrêter le chrono' }),
    ],
  },
  {
    id: 'defi-tour-phares', title: 'Le tour des phares', category: 'defi', airport: 'corail',
    minRank: 1, bonusTime: 1750, bonusReward: 400,
    desc: 'Contourne les trois phares côté mer par 5 anneaux à 120 m : Phare du Sud, Phare de l\'Ouest, escale à Port '
      + 'Azur pour le plein, Phare du Nord, puis pose-toi à Cap Nord. Près de 90 km : gère ton carburant !',
    reward: 2400,
    steps: [
      ...arc(PHARE_S, 600, 0, 180, 5, 120),
      reach(PHARE_O, 800, 'Phare de l\'Ouest', { text: 'Cap au nord-ouest : rejoins le Phare de l\'Ouest (le massif sur la route culmine à 1 900 m, la côte est plus sûre)' }),
      ...arc(PHARE_O, 600, 45, 225, 5, 120),
      land('azur', { text: 'Escale à Port Azur : arrête-toi, coupe le moteur (E) et refais le plein (K). Le Phare du Nord est à 44 km, derrière des sommets de 2 000 m' }),
      ...arc(PHARE_N, 600, 225, 405, 5, 120),
      land('nord', { text: 'Pose-toi à Cap Nord : les trois gardiens te saluent !' }),
    ],
  },

  // =====================================================================
  // Escortes, sauvetage, rase-mottes, marathon
  // =====================================================================
  {
    id: 'defi-ballons', title: 'La course des ballons', category: 'tourisme', giver: PRE_BALLONS,
    desc: 'Tu es le commissaire volant de la course des ballons : reste 40 s à moins de 500 m de Mirabelle, puis de '
      + 'Cassis (contourne le massif !) et de Pistache, et pose-toi à Lac Miroir pour rendre ton rapport.',
    reward: 1000,
    steps: [
      { type: 'follow', balloon: 10, distance: 500, duration: 40, label: 'la montgolfière Mirabelle', text: 'Reste à moins de 500 m de Mirabelle (vers 750 m) pendant 40 s' },
      {
        type: 'follow', balloon: 3, distance: 500, duration: 40, label: 'la montgolfière Cassis',
        text: 'Cassis file vers le nord-ouest : contourne le massif par la côte et reste à moins de 500 m d\'elle (40 s)',
      },
      { type: 'follow', balloon: 6, distance: 500, duration: 40, label: 'la montgolfière Pistache', text: 'Dernière concurrente, à l\'ouest derrière une colline de 1 000 m : reste à moins de 500 m de Pistache (vers 550 m) pendant 40 s' },
      land('lac', { text: 'Pose-toi à Lac Miroir et rends ton rapport : personne n\'a triché !' }),
    ],
  },
  {
    id: 'defi-sauvetage-mer', title: 'Tempête sur la mer du Nord-Est', category: 'sauvetage', airport: 'levant',
    minRank: 1,
    desc: 'Le voilier Goéland a sombré ! Rejoins sa position, ratisse la zone sous 100 m (45 s), survole chaque radeau '
      + '(< 150 m) et largue-lui un canot (< 100 m), guide le cargo Saint-Bernard (40 s à < 800 m), pose-toi à Cap Nord.',
    reward: 1800,
    steps: [
      reach(NAUFRAGE, 400, 'dernière position du Goéland', { spawn: 'smoke', text: 'Rejoins la dernière position connue du Goéland, au nord-est en mer' }),
      low(100, 45, 'Ratisse la zone de recherche : moins de 100 m au-dessus des vagues pendant 45 s', {
        x: ZONE_RECHERCHE.x, z: ZONE_RECHERCHE.z, radius: 3000,
      }),
      reach(RADEAU_1, 300, 'radeau de survie', { maxAgl: 150, spawn: 'raft', text: 'Un radeau orange ! Passe au-dessus à moins de 150 m' }),
      drop(RADEAU_1, 120, 'les naufragés', { maxAgl: 100, spawn: 'raft', text: 'Largue le canot pneumatique (X) près du radeau, à moins de 100 m de l\'eau' }),
      {
        type: 'follow', ship: 11, distance: 800, duration: 40, label: 'le cargo Saint-Bernard',
        text: 'Guide le cargo Saint-Bernard vers les naufragés : reste à moins de 800 m de lui (et sous 500 m) pendant 40 s',
      },
      reach(RADEAU_2, 300, 'second radeau', { maxAgl: 150, spawn: 'raft', text: 'Il manque le skipper ! Fouille plus au nord-est et survole son radeau à moins de 150 m' }),
      drop(RADEAU_2, 120, 'le skipper', { maxAgl: 100, spawn: 'raft', text: 'Largue le dernier canot (X) au skipper, à moins de 100 m de l\'eau' }),
      land('nord', { text: 'Pose-toi à Cap Nord : le cargo y débarque tout l\'équipage, sain et sauf !' }),
    ],
  },
  {
    id: 'defi-rase-vagues', title: 'Au ras des vagues', category: 'course', airport: 'palmes',
    desc: 'Escorte 30 s le cargo Saint-Christophe (< 500 m), rase l\'eau à moins de 30 m pendant 90 s, slalom de 6 anneaux '
      + 'à 45 m, 30 s sous 40 m autour du Phare du Sud, puis pose-toi à Île Corail. Interdit de mouiller les roues !',
    reward: 1200,
    steps: [
      { type: 'follow', ship: 3, distance: 500, duration: 30, label: 'le cargo Saint-Christophe', text: 'Escorte le cargo Saint-Christophe : reste à moins de 500 m de lui (et sous 500 m d\'altitude) pendant 30 s' },
      low(30, 90, 'Rase-vagues : moins de 30 m au-dessus de l\'eau pendant 90 s, sans remonter !'),
      ...slalom(-1500, 25500, 5500, 21000, 6, 200, 45),
      low(40, 30, 'Tourne autour du Phare du Sud à moins de 40 m du sol pendant 30 s', { x: PHARE_S.x, z: PHARE_S.z, radius: 1500 }),
      land('corail', { text: 'Pose-toi à Île Corail, le pêcheur t\'offre la sardinade' }),
    ],
  },
  {
    id: 'defi-marathon', title: 'Le marathon des pistes', category: 'defi', airport: 'dunes',
    minRank: 1, bonusTime: 1200, bonusReward: 300,
    desc: 'Cinq aéroports, aucune pause : toucher-décoller à Port Azur, aux Falaises, à Vallée Verte et sur la piste '
      + 'perchée de Mont Givre, puis pose-toi à Lac Miroir. Bonus si tu boucles tout en moins de 20 min.',
    reward: 1300,
    steps: [
      touch('azur', { text: 'Premier toucher-décoller à Port Azur, juste au nord-ouest des Dunes : le chrono tourne !' }),
      touch('falaises', { text: 'Toucher-décoller aux Falaises : longe la côte, la piste en herbe ne fait que 950 m' }),
      touch('verte', { text: 'Toucher-décoller à Vallée Verte, plus au nord le long de la côte' }),
      touch('givre', { text: 'Toucher-décoller à Mont Givre : piste perchée à 555 m, une crête de 1 000 m la précède' }),
      land('lac', { text: 'Dernière ligne droite : redescends vers la plaine et pose-toi à Lac Miroir' }),
    ],
  },

  // =====================================================================
  // Voltige trouvée sur le terrain
  // =====================================================================
  {
    id: 'defi-voltige-volcan', title: 'Le dragon du Volcan', category: 'voltige', giver: CAMP_VOLCANO,
    minRank: 2,
    desc: 'Les volcanologues veulent filmer un « dragon » : grimpe en spirale autour du cône par 10 anneaux (1 200 à '
      + '2 700 m), 15 s sur le dos, piqué à 320 km/h, palier 1 000-1 100 m (25 s) et pose-toi à Base du Volcan.',
    reward: 1200,
    steps: [
      ...spirale(VOLCANO.x, VOLCANO.z, 2400, 10, 1.5, 1200, 2700, -Math.PI / 2).map((r, i) => (i === 0
        ? { ...r, text: 'Prends d\'abord de la hauteur au-dessus de la mer, puis passe l\'anneau au nord du cône (1 200 m)' }
        : r)),
      { type: 'inverted', duration: 15, text: 'Le dragon se retourne : 15 s sur le dos au-dessus du cratère' },
      { type: 'speed', min: 320, text: 'Le dragon plonge : piqué à 320 km/h (train rentré, G !)' },
      hold(1000, 1100, 25, 'Rétablis-toi : palier entre 1 000 et 1 100 m pendant 25 s, au-dessus de la mer et loin du cône'),
      land('volcan', { text: 'Pose-toi à Base du Volcan, les volcanologues ont tout filmé' }),
    ],
  },
];
