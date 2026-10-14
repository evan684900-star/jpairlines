// Quêtes de la région : ouest (Port Azur, Les Falaises, Vallée Verte, Phare de l'Ouest,
// Plateforme Pétrolière, Château des Brumes)
import {
  A, L, city, offset, land, touch, reach, drop, ring, ringsAround, ringsLine, terrainFollow,
} from './kit.js';

const PHARE = L('phare');
const PLATEFORME = L('plateforme');
const CHATEAU = L('chateau');
const PORT_AZUR = city('Port Azur');

// La baie au sud-ouest de Port Azur (2 km au sud de l'aéroport), où se déroule la Fête de la mer
const BAIE = { x: -15200, z: 9500 };
// Le canot du naufragé, à 3 km au sud-ouest de la plateforme
const CANOT = offset(PLATEFORME, 3000, 230);
// Le pré des aérostiers, entre la piste des Falaises et les collines (~25 m, bien plat)
const PRE_CIBLE = { x: -15400, z: -3600 };

export default [
  // ---------- Chaîne : la Fête de la mer de Port Azur ----------
  {
    id: 'ouest-fete-affiches', title: 'Les affiches de la fête', category: 'livraison', airport: 'azur',
    desc: 'La Fête de la mer approche ! Largue les affiches (X) au pied du Phare de l\'Ouest (sous 150 m du sol), '
      + 'fais un toucher-décoller aux Falaises pour leur paquet, puis reviens à Port Azur.',
    reward: 650,
    steps: [
      drop(PHARE, 150, 'Phare de l\'Ouest', {
        maxAgl: 150, spawn: 'flag',
        text: 'Largue les affiches (X) au pied du Phare de l\'Ouest, à moins de 150 m du sol',
      }),
      touch('falaises', { text: 'Toucher-décoller aux Falaises : le paquet d\'affiches part avec la secousse !' }),
      land('azur', { text: 'Reviens te poser à Port Azur, le comité des fêtes t\'attend' }),
    ],
  },
  {
    id: 'ouest-fete-artifices', title: 'Le cargo des artificiers', category: 'exploration', airport: 'azur',
    requires: 'ouest-fete-affiches',
    desc: 'Le cargo qui apporte le feu d\'artifice tourne en rond dans la brume au large ! Reste 60 s à moins de '
      + '600 m de lui (et sous 500 m d\'altitude), balise le chenal en passant les anneaux, puis pose-toi à Port Azur.',
    reward: 1050,
    steps: [
      { type: 'follow', ship: 6, distance: 600, duration: 60, label: 'le cargo Feu-Follet',
        text: 'Retrouve le cargo Feu-Follet au large et tourne autour de lui (moins de 600 m, sous 500 m d\'altitude) pendant 60 s' },
      ...ringsLine(-28500, 13000, BAIE.x - 1000, BAIE.z + 300, 5, 60).map((r) => ({ ...r, text: 'Balise le chenal : passe dans l\'anneau, le cargo suit ta trace' })),
      land('azur'),
    ],
  },
  {
    id: 'ouest-fete-show', title: 'Le grand show de la baie', category: 'voltige', airport: 'azur',
    requires: 'ouest-fete-artifices', minRank: 1,
    desc: 'Le clou de la fête, c\'est toi ! Anneaux sur la baie, 6 s sur le dos, piqué à 280 km/h (train rentré !), 12 s au ras '
      + 'des vagues (sous 40 m), torche larguée (X, sous 100 m) sur la barge du feu d\'artifice, puis pose-toi à Port Azur.',
    // ~10 km seulement, mais voltige et finale de la chaîne : 900 ₣. Après les anneaux, il faut remonter
    // vers 400 m pour le dos et le piqué (~170 m perdus pour atteindre 280 km/h) : ~7 min pour un vol
    // propre, d'où un bonus à 8 min.
    reward: 900, bonusTime: 480, bonusReward: 300,
    steps: [
      ...ringsAround(BAIE.x, BAIE.z, 800, 5, 80, Math.PI / 2).map((r) => ({ ...r, text: 'Passe les anneaux devant le public de la baie' })),
      { type: 'inverted', duration: 6, text: 'Remonte vers 400 m, puis vole 6 s sur le dos (pousse sur le manche) : le public retient son souffle !' },
      { type: 'speed', min: 280, text: 'Piqué spectaculaire : atteins 280 km/h — train rentré (G), sinon il sera arraché !' },
      { type: 'low', maxAgl: 40, duration: 12, x: BAIE.x, z: BAIE.z, radius: 1300, label: 'baie de Port Azur',
        text: 'Rase les vagues de la baie : moins de 40 m pendant 12 s' },
      drop({ x: BAIE.x - 300, z: BAIE.z + 400 }, 120, 'barge du feu d\'artifice', {
        maxAgl: 100, spawn: 'smoke',
        text: 'Largue la torche (X) sur la barge du feu d\'artifice (fumée jaune), à moins de 100 m de l\'eau',
      }),
      land('azur', { text: 'Pose-toi à Port Azur sous les applaudissements… et les fusées !' }),
    ],
  },

  // ---------- Sauvetage en mer ----------
  {
    id: 'ouest-sos-plateforme', title: 'Un homme à la mer !', category: 'sauvetage', airport: 'verte',
    desc: 'Un ouvrier est tombé à l\'eau ! Survole la plateforme (sous 300 m), repère son canot (sous 200 m), '
      + 'largue-lui un kit (X, sous 100 m), reste 40 s à moins de 600 m du cargo de secours (sous 500 m), puis pose-toi aux Falaises.',
    reward: 1200, bonusTime: 880, bonusReward: 300,
    steps: [
      reach(PLATEFORME, 400, PLATEFORME.name, { maxAgl: 300, text: 'Survole la Plateforme Pétrolière (sous 300 m) : l\'équipe t\'indique où il est tombé' }),
      reach(CANOT, 300, 'canot de survie', {
        maxAgl: 200, spawn: 'raft',
        text: 'Le courant l\'a emporté vers le sud-ouest : repère le canot (fumée orange) à moins de 200 m au-dessus de l\'eau',
      }),
      drop(CANOT, 150, 'canot de survie', {
        maxAgl: 100, spawn: 'raft',
        text: 'Largue le kit de survie (X) près du canot, à moins de 100 m au-dessus de l\'eau',
      }),
      { type: 'follow', ship: 5, distance: 600, duration: 40, label: 'le cargo Marie-Galante',
        text: 'Guide le cargo Marie-Galante vers le canot : reste à moins de 600 m de lui (sous 500 m d\'altitude) pendant 40 s' },
      land('falaises', { text: 'Pose-toi aux Falaises pour faire ton rapport' }),
    ],
  },

  // ---------- Course au ras des flots ----------
  {
    id: 'ouest-rase-falaises', title: 'Au ras des Falaises', category: 'course', airport: 'falaises',
    desc: 'Longe la côte des Falaises au Phare de l\'Ouest en passant les anneaux (45 m au-dessus de l\'eau), '
      + 'rase les vagues 15 s sous 40 m près du phare, puis pose-toi à Port Azur.',
    reward: 700, bonusTime: 380, bonusReward: 200,
    steps: [
      ...[
        [-17400, -2700], [-17350, -1500], [-16900, 500], [-16500, 1500],
        [-17200, 2300], [-17450, 3300], [-17800, 4400], [-17900, 5300],
      ].map(([x, z]) => ring({ x, z }, 45, { size: 28 })),
      { type: 'low', maxAgl: 40, duration: 15, x: PHARE.x, z: PHARE.z, radius: 1500, label: 'devant le phare',
        text: 'Les photographes sont sur la jetée : vole sous 40 m pendant 15 s près du phare' },
      land('azur'),
    ],
  },

  // ---------- Concours de précision des montgolfières ----------
  // (pas un simple « suis trois ballons » : « La course des ballons » de defis.js le fait déjà)
  {
    id: 'ouest-montgolfieres', title: 'Le concours de la cible', category: 'tourisme', airport: 'falaises',
    desc: 'Tu es juge au concours des aérostiers ! Largue la cible (X, sous 120 m) sur le pré, reste 30 s à moins de 400 m '
      + 'de Coquelicot puis de Citron (et de 500 m de leur altitude), contrôle la cible sous 80 m et reviens aux Falaises.',
    reward: 650,
    steps: [
      drop(PRE_CIBLE, 120, 'pré des aérostiers', {
        maxAgl: 120, spawn: 'flag',
        text: 'Pose la cible : largue la croix de toile (X) sur le pré des aérostiers, au nord-est de la piste, à moins de 120 m du sol',
      }),
      { type: 'follow', balloon: 4, distance: 400, duration: 30, label: 'la montgolfière Coquelicot',
        text: 'Coquelicot tourne vers 470 m juste au-dessus de la piste et vise la cible : reste à moins de 400 m d\'elle pendant 30 s pour filmer son lancer' },
      { type: 'follow', balloon: 8, distance: 400, duration: 30, label: 'la montgolfière Citron',
        text: 'Citron tourne vers 900 m, à 3 km au nord-nord-est de la cible : reste 30 s à moins de 400 m d\'elle, le temps qu\'elle lâche son marqueur' },
      reach(PRE_CIBLE, 200, 'la cible', {
        maxAgl: 80, spawn: 'flag',
        text: 'Contrôle des marqueurs : passe au-dessus de la cible à moins de 80 m du sol, les juges au sol comptent sur toi',
      }),
      land('falaises', { text: 'Rapporte le classement aux Falaises : Coquelicot gagne d\'un cheveu !' }),
    ],
  },

  // ---------- Trouvée sur le terrain : au château ----------
  {
    id: 'ouest-bal-fantome', title: 'Le bal du fantôme', category: 'livraison', giver: { x: CHATEAU.x, z: CHATEAU.z },
    minRank: 1,
    desc: 'Le fantôme du château donne un bal ! Pose-toi à Port Azur chercher des bougies, largue-les (X) sur le château '
      + '(moins de 200 m au-dessus), passe les anneaux autour du piton puis vole 5 s sur le dos pour l\'amuser.',
    reward: 1200,
    steps: [
      land('azur', { text: `Le cirier de ${PORT_AZUR.name} a 200 bougies pour toi : pose-toi à ${A('azur').name}` }),
      drop(CHATEAU, 150, CHATEAU.name, {
        maxAgl: 200, spawn: 'flag',
        text: 'Remonte au château (2 500 m !) et largue les bougies (X) à moins de 200 m au-dessus de la cour',
      }),
      // une valse de 6 anneaux autour du piton, juste sous les remparts (au moins 2 450 m)
      ...terrainFollow(ringsAround(CHATEAU.x, CHATEAU.z, 800, 6, 150, Math.PI / 2).map((r) => ({ ...r, alt: 2450 })), 150)
        .map((r) => ({ ...r, text: 'Valse autour du piton, juste sous les remparts : passe dans l\'anneau' })),
      { type: 'inverted', duration: 5, text: 'Le fantôme adore les acrobaties : vole 5 s sur le dos (pousse sur le manche) !' },
    ],
  },
];
