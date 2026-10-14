// Quêtes de la région : est (Port-Levant, Base du Volcan, le Volcan, l'Épave, parc éolien des Hauts)
import {
  L, VOLCANO, city, land, reach, drop, ring, ringAlt, ringsSpiral, terrainFollow, windTurbines,
} from './kit.js';

// ----- utilitaires locaux -----
const P = (x, z) => ({ x, z });
// Point sur les flancs du volcan : cap en degrés (0 = nord, 90 = est), distance au cratère en m
const flanc = (cap, d) => {
  const h = (cap * Math.PI) / 180;
  return P(VOLCANO.x + Math.sin(h) * d, VOLCANO.z - Math.cos(h) * d);
};

const EPAVE = L('epave'); // (31800, 2800), par 175 m de fond
const PORT_LEVANT = city('Port-Levant'); // (24496, -5063), immeubles jusqu'à 70 m

// Parc éolien des Hauts (parc 1) : rangée nord-sud de 10 éoliennes vers x = 16 500
const T1 = windTurbines(1);
const coteEst = (t) => P(t.x + 150, t.z + 9); // 150 m à l'est d'une éolienne (perpendiculaire à la rangée)

// Lieux inventés pour les histoires
const CAPTEUR_OUEST = flanc(270, 2800); // ~530 m
const CAPTEUR_NORD = flanc(0, 2800); // ~530 m
const CAPTEUR_EST = flanc(90, 2800); // ~530 m
const POSTE_OBS = flanc(45, 2800); // poste d'observation de la Dr Brasier, flanc nord-est (~540 m)
const PANACHE = P(VOLCANO.x + 200, VOLCANO.z); // la fumée dérive vers l'est en montant
const QUAIS = P(25200, -4800); // quais de Port-Levant (~65 m)
const BUREAU_PARC = P(16900, -1300); // cabane des techniciens du parc éolien (~230 m)

export default [
  // ===================== Le réveil du volcan (chaîne de 3 quêtes) =====================
  {
    id: 'est-volcan-capteurs', title: 'Les sismographes de la Dr Brasier', category: 'exploration', airport: 'volcan',
    desc: 'Le volcan gronde ! Largue 3 sismographes sur ses flancs ouest, nord et est (à moins de 150 m du sol), '
      + 'grimpe en spirale par les 5 anneaux, traverse l\'anneau au-dessus du cratère et reviens à la base.',
    reward: 950,
    steps: [
      drop(CAPTEUR_OUEST, 150, 'flanc ouest (530 m)', {
        maxAgl: 150, spawn: 'flag', text: 'Monte vers 600 m avant d\'atteindre l\'île, puis largue le premier sismographe (X) sur le flanc ouest (530 m), à moins de 150 m du sol',
      }),
      drop(CAPTEUR_NORD, 150, 'flanc nord (530 m)', {
        maxAgl: 150, spawn: 'flag', text: 'Contourne le volcan par le nord : largue le deuxième sur le flanc nord, à moins de 150 m du sol',
      }),
      drop(CAPTEUR_EST, 150, 'flanc est (530 m)', {
        maxAgl: 150, spawn: 'flag', text: 'Continue à contourner le cône : largue le dernier sur le flanc est, à moins de 150 m du sol. Ensuite, il va falloir grimper !',
      }),
      ...terrainFollow(ringsSpiral(VOLCANO.x, VOLCANO.z, 2000, 5, 1300, 2250, Math.PI / 2), 200).map((r, i) => ({
        ...r, text: i === 0 ? 'Monte en spirale autour du cône : premier anneau à 1 300 m (tourne au large pour prendre de la hauteur)' : 'Continue la spirale vers le sommet',
      })),
      ringAlt(VOLCANO, 2350, { size: 50, text: 'Passe l\'anneau au-dessus du cratère : ça sent le soufre !' }),
      land('volcan', { text: 'Redescends te poser à la Base du Volcan, sur la côte en face de l\'île' }),
    ],
  },
  {
    id: 'est-volcan-panache', title: 'Dans le panache', category: 'defi', airport: 'volcan',
    requires: 'est-volcan-capteurs', minRank: 1,
    desc: 'Prélève des cendres : 6 anneaux en spirale autour du panache (2 200 à 2 700 m), traversée de la fumée '
      + '(450 à 900 m au-dessus du cratère), palier à 2 500-2 700 m 20 s, piqué à 280 km/h, livraison à Port-Levant.',
    reward: 1200,
    steps: [
      ...terrainFollow(ringsSpiral(PANACHE.x, PANACHE.z, 750, 6, 2200, 2700, Math.PI), 200).map((r, i) => ({
        ...r, text: i === 0 ? 'Prends d\'abord de la hauteur au-dessus de la mer (2 200 m !), puis entre dans la spirale autour du panache' : 'Spirale autour du panache, toujours plus haut',
      })),
      reach(PANACHE, 250, 'cœur du panache', {
        minAgl: 450, maxAgl: 900, text: 'Plonge dans la fumée : traverse le cœur du panache, entre 450 et 900 m au-dessus du cratère',
      }),
      { type: 'hold', min: 2500, max: 2700, duration: 20, text: 'Prélèvement : tiens ton altitude entre 2 500 et 2 700 m pendant 20 s' },
      { type: 'speed', min: 280, text: 'Les flacons sont pleins : redescends en piqué jusqu\'à 280 km/h (rentre le train !)' },
      land('levant', { text: 'Livre les flacons au laboratoire de Port-Levant' }),
    ],
  },
  {
    id: 'est-volcan-evacuation', title: 'Évacuation du volcan', category: 'sauvetage', airport: 'levant',
    requires: 'est-volcan-panache', minRank: 2, timeLimit: 1500, bonusTime: 1150, bonusReward: 400,
    desc: 'Éruption imminente ! Survole Port-Levant puis l\'équipe du flanc nord-est (< 300 m du sol), largue les '
      + 'masques (< 150 m), pose-toi à la Base du Volcan, vole 30 s sous 100 m et rentre à Port-Levant. 25 min !',
    reward: 2400,
    steps: [
      reach(PORT_LEVANT, 700, 'Port-Levant', {
        maxAgl: 300, text: 'Donne l\'alerte : survole Port-Levant à moins de 300 m du sol (immeubles de 70 m !)',
      }),
      reach(POSTE_OBS, 400, 'fumée du poste d\'observation', {
        maxAgl: 300, spawn: 'smoke', text: 'Fonce au volcan : repère la fumée du poste d\'observation sur le flanc nord-est (< 300 m du sol)',
      }),
      drop(POSTE_OBS, 150, 'l\'équipe du poste', {
        maxAgl: 150, spawn: 'hiker', text: 'Largue les masques à gaz et la radio (X) à l\'équipe, à moins de 150 m du sol',
      }),
      land('volcan', { text: 'Contourne le cône par le nord et pose-toi à la Base du Volcan : la Dr Brasier embarque (fais le plein, K)' }),
      {
        type: 'low', maxAgl: 100, duration: 30,
        text: 'Le nuage de cendres arrive : file vers le nord en rasant les flots, à moins de 100 m du sol (ou de l\'eau) pendant 30 s',
      },
      land('levant', { text: 'Pose-toi à Port-Levant : tout le monde est sain et sauf !' }),
    ],
  },

  // ===================== La mer du Levant =====================
  {
    id: 'est-epave-plongeurs', title: 'Les plongeurs de l\'épave', category: 'livraison', airport: 'levant',
    desc: 'Le Bélouga a perdu son GPS : escorte-le 30 s (à moins de 600 m, sous 500 m), repère l\'épave en rasant '
      + 'l\'eau 15 s (< 60 m), largue les bouteilles aux plongeurs (< 80 m) et rentre à Port-Levant.',
    reward: 1050,
    steps: [
      {
        type: 'follow', ship: 10, distance: 600, duration: 30, label: 'le cargo Bélouga',
        text: 'Rejoins le Bélouga au sud de Port-Levant : reste à moins de 600 m (et sous 500 m) pendant 30 s pour lui montrer le cap',
      },
      {
        type: 'low', maxAgl: 60, duration: 15, x: EPAVE.x, z: EPAVE.z, radius: 700, label: 'au-dessus de l\'épave',
        text: 'Cherche la coque sous l\'eau : rase les flots à moins de 60 m près de l\'épave pendant 15 s',
      },
      drop(EPAVE, 120, 'les plongeurs', {
        maxAgl: 80, spawn: 'raft', text: 'Largue les bouteilles de plongée (X) aux plongeurs, à moins de 80 m au-dessus de l\'eau',
      }),
      land('levant', { text: 'Rentre à Port-Levant : les plongeurs t\'offrent une pièce d\'or (en chocolat)' }),
    ],
  },
  {
    id: 'est-regate', title: 'La régate du Volcan', category: 'tourisme', airport: 'volcan',
    desc: 'Commente la régate : suis l\'Écume 30 s (< 600 m, sous 500 m), passe les 4 bouées au sud de l\'île du '
      + 'Volcan, suis le Sirocco 30 s, salue le vainqueur 5 s sur le dos et pose-toi à la Base du Volcan.',
    reward: 1050,
    steps: [
      {
        type: 'follow', ship: 13, distance: 600, duration: 30, label: 'le voilier Écume',
        text: 'Rejoins l\'Écume, en tête de la régate : reste à moins de 600 m (et sous 500 m) pendant 30 s',
      },
      ring(P(21000, 19000), 60, { text: 'Bouée n° 1 : le parcours longe la côte sud de l\'île du Volcan' }),
      ring(P(23500, 19600), 60, { text: 'Bouée n° 2' }),
      ring(P(26000, 19600), 60, { text: 'Bouée n° 3' }),
      ring(P(28500, 18800), 60, { text: 'Bouée n° 4 : dernière bouée, demi-tour vers l\'ouest !' }),
      {
        type: 'follow', ship: 4, distance: 600, duration: 30, label: 'le voilier Sirocco',
        text: 'Le Sirocco remonte tout le monde ! Reste à moins de 600 m de lui (et sous 500 m) pendant 30 s',
      },
      { type: 'inverted', duration: 5, text: 'Le Sirocco a gagné ! Salue l\'équipage : vole sur le dos pendant 5 s' },
      land('volcan', { text: 'Pose-toi à la Base du Volcan pour la remise des trophées' }),
    ],
  },
  {
    id: 'est-contrebande', title: 'Contrebande au large', category: 'exploration', airport: 'levant',
    minRank: 1,
    desc: 'Les douanes soupçonnent un cargo : longe la côte par 2 anneaux, retrouve 30 s la montgolfière du guetteur, '
      + 'file au nord photographier le cargo (45 s) et le voilier complice (20 s), sous 500 m, puis rentre.',
    reward: 1600,
    steps: [
      ring(P(20500, -10500), 150, { text: 'Patrouille côtière : longe la côte vers le nord-ouest (fais le plein avant, la tournée est longue !)' }),
      ring(P(19000, -13500), 150, { text: 'Continue le long de la côte' }),
      {
        type: 'follow', balloon: 3, distance: 600, duration: 30, label: 'la montgolfière du guetteur',
        text: 'Le guetteur des douanes t\'attend dans sa montgolfière (vers 850 m) : reste à moins de 600 m de lui pendant 30 s',
      },
      {
        type: 'follow', ship: 11, distance: 700, duration: 45, label: 'le cargo suspect',
        text: 'Cap au nord-est, au large (20 km) : photographie le cargo suspect en restant à moins de 700 m (et sous 500 m) pendant 45 s',
      },
      {
        type: 'follow', ship: 7, distance: 700, duration: 20, label: 'le voilier complice',
        text: 'Un voilier lui tourne autour… Reste à moins de 700 m de lui (et sous 500 m) pendant 20 s',
      },
      land('levant', { text: 'Rapporte les photos aux douanes de Port-Levant' }),
    ],
  },

  // ===================== Quête trouvée sur le terrain =====================
  {
    id: 'est-eoliennes', title: 'L\'inspecteur des éoliennes', category: 'livraison', giver: BUREAU_PARC,
    desc: 'Longe la rangée d\'éoliennes par les 4 anneaux (côté est), retrouve 30 s la montgolfière météo (à moins '
      + 'de 500 m), largue la liste des pièces sur les quais de Port-Levant (< 200 m du sol) et pose-toi.',
    reward: 600,
    steps: [
      ring(coteEst(T1[0]), 90, { text: 'Inspection : longe les éoliennes par l\'est, 150 m à côté des mâts (pales jusqu\'à 116 m)' }),
      ring(coteEst(T1[3]), 90),
      ring(coteEst(T1[6]), 90),
      ring(coteEst(T1[9]), 90, { text: 'Dernière éolienne : une pale est fêlée, note-le !' }),
      {
        type: 'follow', balloon: 10, distance: 500, duration: 30, label: 'la montgolfière météo',
        text: 'Paulette mesure le vent depuis sa montgolfière (vers 750 m) : reste à moins de 500 m d\'elle pendant 30 s',
      },
      drop(QUAIS, 150, 'quais de Port-Levant', {
        maxAgl: 200, spawn: 'crate', text: 'Largue la liste des pièces (X) sur les quais de Port-Levant, à moins de 200 m du sol',
      }),
      land('levant', { text: 'Pose-toi à Port-Levant : la nouvelle pale arrive par cargo' }),
    ],
  },
];
