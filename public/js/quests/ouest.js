// Quêtes de la région : ouest (Port Azur, Les Falaises, Vallée Verte, Phare de l'Ouest,
// Plateforme Pétrolière, Château des Brumes)
import {
  A, L, city, offset, stage, land, touch, reach, drop, ring, ringsAround, ringsLine, terrainFollow,
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
    desc: 'La Fête de la mer approche ! Largue (X) un paquet d\'affiches au gardien du Phare de l\'Ouest, récupère celles '
      + 'imprimées aux Falaises d\'un toucher-décoller, puis rapporte-les au comité des fêtes de Port Azur.',
    reward: 650,
    steps: [
      ...stage('Larguer les affiches au phare',
        drop(PHARE, 150, 'Phare de l\'Ouest', {
          maxAgl: 150, spawn: 'flag',
          text: 'Le gardien du phare collera les affiches sur la jetée : largue le paquet (X) au pied du Phare de l\'Ouest, à moins de 150 m du sol',
        })),
      ...stage('Prendre le paquet aux Falaises',
        touch('falaises', { text: 'L\'imprimeur des Falaises a le reste des affiches : toucher-décoller sur sa piste, il les jette à bord au passage !' })),
      ...stage('Rentrer à Port Azur',
        land('azur', { text: 'Reviens te poser à Port Azur, le comité des fêtes t\'attend' })),
    ],
  },
  {
    id: 'ouest-fete-artifices', title: 'Le cargo des artificiers', category: 'exploration', airport: 'azur',
    requires: 'ouest-fete-affiches',
    desc: 'Le cargo qui apporte le feu d\'artifice s\'est perdu dans la brume au large ! Retrouve-le et reste près de lui '
      + '60 s, balise-lui le chenal jusqu\'à la baie par les anneaux, puis pose-toi à Port Azur pour l\'accueillir.',
    reward: 1050,
    steps: [
      ...stage('Retrouver le cargo dans la brume',
        { type: 'follow', ship: 6, distance: 600, duration: 60, label: 'le cargo Feu-Follet',
          text: 'Retrouve le cargo Feu-Follet au large, à l\'ouest, et tourne autour de lui (moins de 600 m, sous 500 m d\'altitude) pendant 60 s' }),
      ...stage('Baliser le chenal',
        ringsLine(-28500, 13000, BAIE.x - 1000, BAIE.z + 300, 5, 60).map((r) => ({ ...r, text: 'Balise le chenal vers la baie : passe dans l\'anneau, le cargo suit ta trace' }))),
      ...stage('Accueillir le cargo à Port Azur',
        land('azur', { text: 'Le cargo est à quai : pose-toi à Port Azur, les artificiers déchargent les fusées' })),
    ],
  },
  {
    id: 'ouest-fete-show', title: 'Le grand show de la baie', category: 'voltige', airport: 'azur',
    requires: 'ouest-fete-artifices', minRank: 1,
    desc: 'Le clou de la fête, c\'est toi ! Ouvre le show par les anneaux de la baie, enchaîne 6 s sur le dos et un piqué '
      + 'à 280 km/h, rase les vagues 12 s pour larguer la torche (X) sur la barge du feu d\'artifice, puis pose-toi.',
    // ~10 km seulement, mais voltige et finale de la chaîne : 900 ₣. Après les anneaux, il faut remonter
    // vers 400 m pour le dos et le piqué (~170 m perdus pour atteindre 280 km/h) : ~7 min pour un vol
    // propre, d'où un bonus à 8 min.
    reward: 900, bonusTime: 480, bonusReward: 300,
    steps: [
      ...stage('Ouvrir le show sur la baie',
        ringsAround(BAIE.x, BAIE.z, 800, 5, 80, Math.PI / 2).map((r) => ({ ...r, text: 'Passe les anneaux devant le public de la baie' }))),
      ...stage('Voltige : le dos et le piqué',
        { type: 'inverted', duration: 6, text: 'Remonte vers 400 m, puis vole 6 s sur le dos (pousse sur le manche) : le public retient son souffle !' },
        { type: 'speed', min: 280, text: 'Piqué spectaculaire : atteins 280 km/h — train rentré (G), sinon il sera arraché !' }),
      ...stage('Allumer le feu d\'artifice',
        { type: 'low', maxAgl: 40, duration: 12, x: BAIE.x, z: BAIE.z, radius: 1300, label: 'baie de Port Azur',
          text: 'Approche de la barge au ras des vagues : moins de 40 m pendant 12 s dans la baie' },
        drop({ x: BAIE.x - 300, z: BAIE.z + 400 }, 120, 'barge du feu d\'artifice', {
          maxAgl: 100, spawn: 'smoke',
          text: 'Largue la torche (X) sur la barge du feu d\'artifice (fumée jaune), à moins de 100 m de l\'eau : c\'est elle qui allume les fusées !',
        })),
      ...stage('Se poser sous les fusées',
        land('azur', { text: 'Pose-toi à Port Azur sous les applaudissements… et les fusées !' })),
    ],
  },

  // ---------- Sauvetage en mer ----------
  {
    id: 'ouest-sos-plateforme', title: 'Un homme à la mer !', category: 'sauvetage', airport: 'verte',
    desc: 'Un ouvrier est tombé de la plateforme pétrolière ! Survole-la pour savoir où, retrouve son canot et largue-lui '
      + 'un kit de survie (X), guide le cargo de secours jusqu\'à lui (40 s), puis fais ton rapport aux Falaises.',
    reward: 1200, bonusTime: 880, bonusReward: 300,
    steps: [
      ...stage('Survoler la plateforme',
        reach(PLATEFORME, 400, PLATEFORME.name, { maxAgl: 300, text: 'Survole la Plateforme Pétrolière, à l\'ouest en mer (sous 300 m) : l\'équipe t\'indique où il est tombé' })),
      ...stage('Secourir le naufragé',
        reach(CANOT, 300, 'canot de survie', {
          maxAgl: 200, spawn: 'raft',
          text: 'Le courant l\'a emporté vers le sud-ouest : repère le canot (fumée orange) à moins de 200 m au-dessus de l\'eau',
        }),
        drop(CANOT, 150, 'canot de survie', {
          maxAgl: 100, spawn: 'raft',
          text: 'Largue le kit de survie (X) près du canot, à moins de 100 m au-dessus de l\'eau',
        })),
      ...stage('Guider le cargo de secours',
        { type: 'follow', ship: 5, distance: 600, duration: 40, label: 'le cargo Marie-Galante',
          text: 'Guide le cargo Marie-Galante vers le canot : reste à moins de 600 m de lui (sous 500 m d\'altitude) pendant 40 s' }),
      ...stage('Faire ton rapport aux Falaises',
        land('falaises', { text: 'L\'ouvrier est à bord du cargo : pose-toi aux Falaises pour faire ton rapport' })),
    ],
  },

  // ---------- Course au ras des flots ----------
  {
    id: 'ouest-rase-falaises', title: 'Au ras des Falaises', category: 'course', airport: 'falaises',
    desc: 'Course côtière ! Longe la côte des Falaises jusqu\'au Phare de l\'Ouest par les anneaux (45 m au-dessus de '
      + 'l\'eau), rase les vagues 15 s sous 40 m pour les photographes du phare, puis franchis l\'arrivée à Port Azur.',
    reward: 700, bonusTime: 380, bonusReward: 200,
    steps: [
      ...stage('Longer les Falaises',
        [
          [-17400, -2700], [-17350, -1500], [-16900, 500], [-16500, 1500],
          [-17200, 2300], [-17450, 3300], [-17800, 4400], [-17900, 5300],
        ].map(([x, z], i) => ring({ x, z }, 45, { size: 28, ...(i === 0 ? { text: 'Départ au bout de la piste, côté mer : cap au sud le long des falaises' } : {}) }))),
      ...stage('Poser pour les photographes',
        { type: 'low', maxAgl: 40, duration: 15, x: PHARE.x, z: PHARE.z, radius: 1500, label: 'devant le phare',
          text: 'Les photographes sont sur la jetée : vole sous 40 m pendant 15 s près du phare' }),
      ...stage('Arriver à Port Azur',
        land('azur', { text: 'Ligne d\'arrivée : pose-toi et arrête-toi à Port Azur' })),
    ],
  },

  // ---------- Concours de précision des montgolfières ----------
  // (pas un simple « suis trois ballons » : « La course des ballons » de defis.js le fait déjà)
  {
    id: 'ouest-montgolfieres', title: 'Le concours de la cible', category: 'tourisme', airport: 'falaises',
    desc: 'Tu es juge au concours des aérostiers ! Largue la cible (X) sur le pré, filme le lancer de Coquelicot puis '
      + 'de Citron (30 s près de chacune), contrôle leurs marqueurs sur la cible sous 80 m et rapporte le classement.',
    reward: 650,
    steps: [
      ...stage('Poser la cible sur le pré',
        drop(PRE_CIBLE, 120, 'pré des aérostiers', {
          maxAgl: 120, spawn: 'flag',
          text: 'Pose la cible : largue la croix de toile (X) sur le pré des aérostiers, au nord-est de la piste, à moins de 120 m du sol',
        })),
      ...stage('Filmer les lancers des ballons',
        { type: 'follow', balloon: 4, distance: 400, duration: 30, label: 'la montgolfière Coquelicot',
          text: 'Coquelicot tourne vers 470 m juste au-dessus de la piste et vise la cible : reste à moins de 400 m d\'elle pendant 30 s pour filmer son lancer' },
        { type: 'follow', balloon: 8, distance: 400, duration: 30, label: 'la montgolfière Citron',
          text: 'Citron tourne vers 900 m, à 3 km au nord-nord-est de la cible : reste 30 s à moins de 400 m d\'elle, le temps qu\'elle lâche son marqueur' }),
      ...stage('Contrôler les marqueurs',
        reach(PRE_CIBLE, 200, 'la cible', {
          maxAgl: 80, spawn: 'flag',
          text: 'Contrôle des marqueurs : passe au-dessus de la cible à moins de 80 m du sol, les juges au sol comptent sur toi',
        })),
      ...stage('Rapporter le classement',
        land('falaises', { text: 'Rapporte le classement aux Falaises : Coquelicot gagne d\'un cheveu !' })),
    ],
  },

  // ---------- Trouvée sur le terrain : au château ----------
  {
    id: 'ouest-bal-fantome', title: 'Le bal du fantôme', category: 'livraison', giver: { x: CHATEAU.x, z: CHATEAU.z },
    minRank: 1,
    desc: 'Le fantôme du château donne un bal ! Va chercher des bougies à Port Azur, largue-les (X) sur le château '
      + '(moins de 200 m au-dessus), ouvre le bal en valsant autour du piton, puis vole 5 s sur le dos pour l\'amuser.',
    reward: 1200,
    steps: [
      ...stage('Chercher les bougies à Port Azur',
        land('azur', { text: `Le cirier de ${PORT_AZUR.name} a 200 bougies pour toi : pose-toi à ${A('azur').name}` })),
      ...stage('Livrer les bougies au château',
        drop(CHATEAU, 150, CHATEAU.name, {
          maxAgl: 200, spawn: 'flag',
          text: 'Remonte au château (2 500 m !) et largue les bougies (X) à moins de 200 m au-dessus de la cour',
        })),
      // une valse de 6 anneaux autour du piton, juste sous les remparts (au moins 2 450 m)
      ...stage('Ouvrir le bal autour du piton',
        terrainFollow(ringsAround(CHATEAU.x, CHATEAU.z, 800, 6, 150, Math.PI / 2).map((r) => ({ ...r, alt: 2450 })), 150)
          .map((r) => ({ ...r, text: 'Les bougies sont allumées : valse autour du piton, juste sous les remparts, et passe dans l\'anneau' }))),
      ...stage('Amuser le fantôme',
        { type: 'inverted', duration: 5, text: 'Le fantôme adore les acrobaties : vole 5 s sur le dos (pousse sur le manche) !' }),
    ],
  },
];
