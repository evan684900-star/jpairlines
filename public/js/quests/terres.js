// Quêtes des nouvelles terres (au-delà du monde d'origine) : routes pour y aller, puis missions sur place.
// Au nord, il fait froid : givrage et pilote qui se refroidit (voir plane.js / main.js, « froid »).
import {
  A, city, stage, land, touch, reach, drop, ring, ringsAround, terrainFollow, findPeak, findFlat, findCoast,
} from './kit.js';
import { OUTER_LIM } from '../world.js';

const P = (x, z) => ({ x, z });
const mid = (a, b, t = 0.5) => P(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t);
// route aérienne entre deux aéroports : un anneau tous les ~5 km, qui suit le relief (marge 300 m) ;
// le dernier anneau est à ~5 km de la piste d'arrivée, pour avoir le temps de descendre
const route = (from, to) => {
  const n = Math.max(2, Math.round(Math.hypot(to.x - from.x, to.z - from.z) / 5000) - 1);
  return terrainFollow(Array.from({ length: n }, (_, i) => ring(mid(from, to, (i + 1) / (n + 1)), 300)), 300, 0.1);
};

const BOREAL = A('boreal'), TAIGA = A('taiga'), FJORD = A('fjord'), ORIENT = A('orient');
const SAVANE = A('savane'), LAGON = A('tropiques'), MANGROVE = A('mangrove'), PONANT = A('ponant');

// lieux des missions, cherchés sur les nouvelles terres
const CAMP_TAIGA = findFlat(TAIGA.x + 6000, TAIGA.z - 4000, 6000, 20, OUTER_LIM); // camp de bûcherons isolé
const SOMMET_FJORD = findPeak(FJORD.x + 4000, FJORD.z - 5000, 7000, OUTER_LIM); // un alpiniste coincé
const PHARE_ORIENT = findCoast(ORIENT.x + 9000, ORIENT.z, 9000, OUTER_LIM);
const ORIENTIA = city('Orientia');
const TROUPEAU = findFlat(SAVANE.x - 5000, SAVANE.z + 4000, 6000, 15, OUTER_LIM); // éléphants à compter
const RECIF = findCoast(LAGON.x + 6000, LAGON.z + 5000, 9000, OUTER_LIM);
const VILLAGE_MANGROVE = findCoast(MANGROVE.x - 6000, MANGROVE.z + 3000, 8000, OUTER_LIM);

export default [
  // ===================== Routes vers les nouvelles terres =====================
  {
    id: 'terres-route-orient', title: 'La route de l\'Orient', category: 'exploration', airport: 'levant',
    desc: 'Au-delà de l\'océan, à l\'est, une terre inconnue ! Suis la route balisée sur près de 50 km et pose-toi à '
      + 'Porte d\'Orient. Fais le plein avant de partir.',
    reward: 1500,
    steps: [
      ...stage('Décoller de Port-Levant', touch('levant', { text: 'Fais un toucher-décoller à Port-Levant pour valider le plan de vol' })),
      ...stage('Traverser l\'océan', route(A('levant'), ORIENT)),
      ...stage('Se poser à Porte d\'Orient', land('orient')),
    ],
  },
  {
    id: 'terres-route-boreal', title: 'Cap au Grand Nord', category: 'exploration', airport: 'nord',
    desc: 'Les terres glacées du nord n\'attendent que toi. Attention au froid : surveille le givrage et ne traîne pas '
      + 'trop haut. Pose-toi à Boréal International.',
    reward: 1600, minRank: 1,
    steps: [
      ...stage('Décoller de Cap Nord', touch('nord')),
      ...stage('Survoler la mer gelée', route(A('nord'), BOREAL)),
      ...stage('Se poser à Boréal International', land('boreal')),
    ],
  },
  {
    id: 'terres-route-ponant', title: 'Vers le Ponant', category: 'exploration', airport: 'falaises',
    desc: 'Le soleil se couche à l\'ouest, sur les terres du Ponant. Suis la route au-dessus de l\'océan et pose-toi '
      + 'à Ponant.',
    reward: 1400,
    steps: [
      ...stage('Décoller des Falaises', touch('falaises')),
      ...stage('Traverser vers l\'ouest', route(A('falaises'), PONANT)),
      ...stage('Se poser à Ponant', land('ponant')),
    ],
  },
  {
    id: 'terres-route-lagon', title: 'Le Grand Lagon', category: 'exploration', airport: 'palmes',
    desc: 'Plein sud, un lagon turquoise grand comme une mer. Rejoins le Grand Lagon en suivant la route balisée.',
    reward: 1300,
    steps: [
      ...stage('Décoller de l\'archipel', touch('palmes')),
      ...stage('Cap au sud', route(A('palmes'), LAGON)),
      ...stage('Se poser au Grand Lagon', land('tropiques')),
    ],
  },

  // ===================== Grand Nord (froid !) =====================
  {
    id: 'terres-taiga-vivres', title: 'Vivres pour la taïga', category: 'livraison', airport: 'boreal', requires: 'terres-route-boreal',
    desc: 'Un camp de bûcherons est coupé du monde par la neige. Largue-leur des vivres, pose-toi à Taïga pour '
      + 'prendre leur courrier, puis rentre à Boréal. Le froid givre l\'avion : ne reste pas longtemps en altitude.',
    reward: 1800,
    steps: [
      ...stage('Larguer les vivres', drop(CAMP_TAIGA, 160, 'camp de bûcherons', { maxAgl: 180, spawn: 'tent', text: 'Largue les vivres (X) sur le camp de bûcherons, à moins de 180 m du sol' })),
      ...stage('Prendre le courrier à Taïga', land('taiga')),
      ...stage('Rentrer à Boréal', land('boreal')),
    ],
  },
  {
    id: 'terres-fjord-alpiniste', title: 'SOS au-dessus du fjord', category: 'sauvetage', airport: 'fjord', requires: 'terres-route-boreal',
    desc: 'Un alpiniste est bloqué près d\'un sommet au-dessus du fjord, et il gèle. Repère-le, largue-lui une '
      + 'couverture de survie, puis préviens les secours en te posant à Fjord-aux-Ours.',
    reward: 2000,
    steps: [
      ...stage('Repérer l\'alpiniste', reach(SOMMET_FJORD, 500, 'sommet du fjord', { spawn: 'hiker', text: 'Survole le sommet au-dessus du fjord pour repérer l\'alpiniste' })),
      ...stage('Larguer la couverture', drop(SOMMET_FJORD, 180, 'alpiniste', { maxAgl: 200, spawn: 'smoke', text: 'Repasse et largue la couverture de survie (X) près de l\'alpiniste, à moins de 200 m du sol' })),
      ...stage('Prévenir les secours', land('fjord')),
    ],
  },

  // ===================== Orient =====================
  {
    id: 'terres-orient-tour', title: 'La tournée d\'Orientia', category: 'tourisme', airport: 'orient', requires: 'terres-route-orient',
    desc: 'L\'office du tourisme veut des photos aériennes de la grande ville. Fais le tour d\'Orientia, file vers le '
      + 'phare de la côte, puis reviens te poser.',
    reward: 1200,
    steps: [
      ...stage('Tour de la ville', terrainFollow(ringsAround(ORIENTIA.x, ORIENTIA.z, ORIENTIA.radius + 900, 6, 250), 220, 0.2)),
      ...stage('Le phare de la côte', reach(PHARE_ORIENT, 400, 'phare de la côte', { text: 'File vers la côte est et survole le phare' })),
      ...stage('Retour à Porte d\'Orient', land('orient')),
    ],
  },
  {
    id: 'terres-savane-safari', title: 'Safari dans la Savane Dorée', category: 'tourisme', airport: 'savane', requires: 'terres-route-orient',
    desc: 'Des touristes veulent voir le grand troupeau de la savane. Survole-le en rase-mottes (moins de 80 m) pendant '
      + '25 s, puis ramène-les à Savane Dorée.',
    reward: 1300,
    steps: [
      ...stage('Rejoindre le troupeau', reach(TROUPEAU, 600, 'grand troupeau')),
      ...stage('Rase-mottes au-dessus du troupeau', { type: 'low', maxAgl: 80, duration: 25, x: TROUPEAU.x, z: TROUPEAU.z, radius: 2500, label: 'la savane' }),
      ...stage('Rentrer à Savane Dorée', land('savane')),
    ],
  },

  // ===================== Sud et ouest =====================
  {
    id: 'terres-lagon-recif', title: 'Le récif du Grand Lagon', category: 'voltige', airport: 'tropiques', requires: 'terres-route-lagon',
    desc: 'Le club de plongée t\'offre un baptême si tu fais le spectacle au-dessus du récif : passe dans les anneaux, '
      + 'vole 5 s sur le dos, puis pose-toi.',
    reward: 1400,
    steps: [
      ...stage('Les anneaux du récif', terrainFollow(ringsAround(RECIF.x, RECIF.z, 1400, 5, 180), 150, 0.2)),
      ...stage('Vol sur le dos', { type: 'inverted', duration: 5, text: 'Retourne l\'avion et vole sur le dos pendant 5 s (garde de la hauteur !)' }),
      ...stage('Se poser au Grand Lagon', land('tropiques')),
    ],
  },
  {
    id: 'terres-mangrove-courrier', title: 'Le facteur de la mangrove', category: 'livraison', airport: 'mangrove', requires: 'terres-route-ponant',
    desc: 'Les villages de la mangrove ne sont reliés que par les airs. Largue le courrier au village de la côte, '
      + 'fais un toucher à Ponant pour le reste du sac, puis rentre à Mangrove.',
    reward: 1500,
    steps: [
      ...stage('Courrier du village', drop(VILLAGE_MANGROVE, 160, 'village de la côte', { maxAgl: 150, spawn: 'crate' })),
      ...stage('Le sac de Ponant', touch('ponant')),
      ...stage('Rentrer à Mangrove', land('mangrove')),
    ],
  },
];
