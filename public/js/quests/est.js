// Quêtes de la région : est (Port-Levant, Base du Volcan, le Volcan, l'Épave, parc éolien des Hauts)
import {
  L, VOLCANO, city, stage, land, reach, drop, ring, ringAlt, windTurbines,
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
// 150 m à l'est de l'éolienne n° i (perpendiculaire à la rangée) ; borné au nombre d'éoliennes réellement construites
const coteEst = (i) => { const t = T1[Math.min(i, T1.length - 1)]; return P(t.x + 150, t.z + 9); };

// Le cône est raide (pente ~40 % à 2,8 km du cratère) : les largages sur les flancs se font en
// longeant la pente (le long des courbes de niveau), jamais face au volcan.
// Le vrai sommet (bord du cratère) culmine vers 2 000 m (VOLCANO.h = 2300 est une valeur nominale).
const CAPTEUR_OUEST = flanc(270, 2800); // ~530 m
const CAPTEUR_NORD = flanc(0, 2800); // ~530 m
const CAPTEUR_EST = flanc(90, 2800); // ~530 m
const POSTE_OBS = flanc(45, 2800); // poste d'observation de la Dr Brasier, flanc nord-est (~540 m)
const PANACHE = P(VOLCANO.x + 150, VOLCANO.z); // la fumée dérive vers l'est en montant (~+150 m vers 2 300 m)
const QUAIS = P(25250, -4500); // quais de Port-Levant, au bord de l'eau (~10 m)
const BUREAU_PARC = P(16900, -1300); // cabane des techniciens du parc éolien (~230 m)

export default [
  // ===================== Le réveil du volcan (chaîne de 3 quêtes) =====================
  {
    id: 'est-volcan-capteurs', title: 'Les sismographes de la Dr Brasier', category: 'exploration', airport: 'volcan',
    desc: 'Le volcan gronde ! Largue 3 sismographes sur ses flancs ouest, nord et est (sous 150 m du sol), tiens 30 s '
      + 'entre 1 200 et 1 400 m pour relayer leurs signaux, puis rapporte les premières mesures à la base.',
    reward: 850,
    steps: [
      ...stage('Poser les sismographes',
        drop(CAPTEUR_OUEST, 150, 'flanc ouest (530 m)', {
          maxAgl: 150, spawn: 'flag',
          text: 'Vers 650 m, longe le flanc ouest du sud vers le nord (jamais face à la pente !) et largue le premier sismographe (X), à moins de 150 m du sol',
        }),
        drop(CAPTEUR_NORD, 150, 'flanc nord (530 m)', {
          maxAgl: 150, spawn: 'flag', text: 'Contourne le cône par le nord à la même hauteur : largue le deuxième sur le flanc nord, à moins de 150 m du sol',
        }),
        drop(CAPTEUR_EST, 150, 'flanc est (530 m)', {
          maxAgl: 150, spawn: 'flag', text: 'Continue le tour du cône : largue le dernier sur le flanc est, à moins de 150 m du sol',
        })),
      ...stage('Relayer les signaux',
        {
          type: 'hold', min: 1200, max: 1400, duration: 30,
          text: 'Relais radio : écarte-toi du cône, monte et tiens ton altitude entre 1 200 et 1 400 m pendant 30 s, le temps que les sismographes se calent',
        }),
      ...stage('Rentrer à la Base du Volcan',
        land('volcan', { text: 'Contourne le cône et pose-toi à la Base du Volcan, sur la côte en face de l\'île : la Dr Brasier épluche déjà les courbes' })),
    ],
  },
  {
    id: 'est-volcan-panache', title: 'Dans le panache', category: 'defi', airport: 'volcan',
    requires: 'est-volcan-capteurs', minRank: 1,
    desc: 'Les sismographes s\'affolent : prélève des cendres ! Traverse le panache d\'ouest en est (2 250 m), puis du nord '
      + 'au sud (2 400 m), redescends en piqué à 280 km/h et livre les flacons au laboratoire de Port-Levant.',
    reward: 1200,
    steps: [
      ...stage('Traverser le panache vers l\'est',
        ringAlt(P(VOLCANO.x - 1350, VOLCANO.z), 2250, {
          text: 'Prends d\'abord de la hauteur au-dessus de la mer (2 250 m, ça prend une dizaine de minutes), puis première passe d\'ouest en est',
        }),
        ringAlt(P(PANACHE.x, PANACHE.z), 2250, { size: 50, text: 'En plein dans la fumée, 250 m au-dessus du cratère : garde le cap à l\'est !' }),
        ringAlt(P(VOLCANO.x + 1650, VOLCANO.z), 2250, { text: 'Sortie côté est : premier flacon plein' })),
      ...stage('Traverser le panache vers le sud',
        ringAlt(P(PANACHE.x, VOLCANO.z - 1500), 2400, {
          text: 'Deuxième passe, du nord au sud : grand virage à gauche par le nord en remontant à 2 400 m',
        }),
        ringAlt(P(PANACHE.x, PANACHE.z), 2400, { size: 50, text: 'Re-belote dans la fumée : cap au sud !' }),
        ringAlt(P(PANACHE.x, VOLCANO.z + 1500), 2400, { text: 'Sortie côté sud : deuxième flacon plein' })),
      ...stage('Redescendre en piqué',
        { type: 'speed', min: 280, text: 'Les flacons sont pleins : pique vers la mer, au sud, jusqu\'à 280 km/h (rentre le train, sinon il sera arraché !)' }),
      ...stage('Livrer les flacons à Port-Levant',
        land('levant', { text: 'Livre les flacons au laboratoire de Port-Levant, au nord : contourne le cône, tu es maintenant plus bas que le cratère !' })),
    ],
  },
  {
    id: 'est-volcan-evacuation', title: 'Évacuation du volcan', category: 'sauvetage', airport: 'levant',
    requires: 'est-volcan-panache', minRank: 2, timeLimit: 1620, bonusTime: 1200, bonusReward: 400,
    desc: 'Éruption imminente ! Donne l\'alerte au-dessus de Port-Levant, largue des masques (X) à l\'équipe du flanc '
      + 'nord-est, embarque la Dr Brasier à la Base du Volcan et fuis le nuage de cendres jusqu\'à Port-Levant. 27 min !',
    reward: 2400,
    steps: [
      ...stage('Donner l\'alerte à Port-Levant',
        reach(PORT_LEVANT, 700, 'Port-Levant', {
          maxAgl: 300, text: 'Donne l\'alerte : survole Port-Levant à moins de 300 m du sol (immeubles de 70 m !)',
        })),
      ...stage('Secourir l\'équipe du flanc',
        reach(POSTE_OBS, 400, 'fumée du poste d\'observation', {
          maxAgl: 300, spawn: 'smoke', text: 'Fonce au volcan : repère la fumée du poste d\'observation sur le flanc nord-est (< 300 m du sol), puis vire aussitôt : le cône monte vite derrière',
        }),
        drop(POSTE_OBS, 150, 'l\'équipe du poste', {
          maxAgl: 150, spawn: 'hiker',
          text: 'Largue les masques à gaz et la radio (X) à l\'équipe, à moins de 150 m du sol, en longeant la pente (jamais face au cône !)',
        })),
      ...stage('Embarquer la Dr Brasier',
        land('volcan', { text: 'Contourne le cône par le nord et pose-toi à la Base du Volcan : la Dr Brasier embarque' })),
      ...stage('Fuir le nuage de cendres',
        {
          type: 'low', maxAgl: 100, duration: 30,
          text: 'Le nuage de cendres arrive : file vers le nord en rasant les flots, à moins de 100 m du sol (ou de l\'eau) pendant 30 s',
        },
        land('levant', { text: 'Pose-toi à Port-Levant : tout le monde est sain et sauf !' })),
    ],
  },

  // ===================== La mer du Levant =====================
  {
    id: 'est-epave-plongeurs', title: 'Les plongeurs de l\'épave', category: 'livraison', airport: 'levant',
    requires: 'epave', // suite de « Recherche de l'épave » (base.js)
    desc: 'Le Bélouga, le bateau des plongeurs, a perdu son GPS : escorte-le 30 s, retrouve l\'épave en rasant l\'eau '
      + '(15 s sous 60 m), largue les bouteilles aux plongeurs (X, sous 80 m) et rentre à Port-Levant.',
    reward: 1050,
    steps: [
      ...stage('Guider le Bélouga',
        {
          type: 'follow', ship: 10, distance: 600, duration: 30, label: 'le cargo Bélouga',
          text: 'Rejoins le Bélouga au sud de Port-Levant : reste à moins de 600 m (et sous 500 m) pendant 30 s pour lui montrer le cap',
        }),
      ...stage('Retrouver l\'épave',
        {
          type: 'low', maxAgl: 60, duration: 15, x: EPAVE.x, z: EPAVE.z, radius: 700, label: 'au-dessus de l\'épave',
          text: 'Cherche la coque sous l\'eau : rase les flots à moins de 60 m près de l\'épave pendant 15 s',
        }),
      ...stage('Ravitailler les plongeurs',
        drop(EPAVE, 120, 'les plongeurs', {
          maxAgl: 80, spawn: 'raft', text: 'Les plongeurs sont déjà à l\'eau : largue les bouteilles de plongée (X) près d\'eux, à moins de 80 m au-dessus de l\'eau',
        })),
      ...stage('Rentrer à Port-Levant',
        land('levant', { text: 'Rentre à Port-Levant : les plongeurs t\'offrent une pièce d\'or (en chocolat)' })),
    ],
  },
  {
    id: 'est-regate', title: 'La régate du Volcan', category: 'tourisme', airport: 'volcan',
    desc: 'Commente la régate pour la radio : suis l\'Écume au départ (30 s), contrôle les 4 bouées du parcours au large, '
      + 'suis la remontée du Sirocco (30 s), salue le vainqueur sur le dos et pose-toi pour la remise des trophées.',
    reward: 1050,
    steps: [
      ...stage('Suivre le départ',
        {
          type: 'follow', ship: 13, distance: 600, duration: 30, label: 'le voilier Écume',
          text: 'Rejoins l\'Écume, en tête de la régate : reste à moins de 600 m (et sous 500 m) pendant 30 s',
        }),
      ...stage('Contrôler les bouées',
        ring(P(18800, 21000), 60, { text: 'Bouée n° 1 : le parcours fait le tour du plan d\'eau, au large au sud de la base' }),
        ring(P(21000, 24500), 60, { text: 'Bouée n° 2 : cap au sud-est' }),
        ring(P(24500, 22500), 60, { text: 'Bouée n° 3 : on remonte vers le nord-est' }),
        ring(P(22000, 20200), 60, { text: 'Bouée n° 4 : dernière bouée, les voiliers sont au coude à coude !' })),
      ...stage('Suivre le sprint du Sirocco',
        {
          type: 'follow', ship: 4, distance: 600, duration: 30, label: 'le voilier Sirocco',
          text: 'Le Sirocco remonte tout le monde ! Reste à moins de 600 m de lui (et sous 500 m) pendant 30 s',
        },
        { type: 'inverted', duration: 5, text: 'Le Sirocco a gagné ! Remonte un peu, puis salue l\'équipage : vole sur le dos pendant 5 s' }),
      ...stage('Remettre les trophées',
        land('volcan', { text: 'Pose-toi à la Base du Volcan pour la remise des trophées' })),
    ],
  },
  {
    id: 'est-contrebande', title: 'Contrebande au large', category: 'exploration', airport: 'levant',
    minRank: 1,
    desc: 'Les douanes soupçonnent un cargo : patrouille le long de la côte, retrouve le guetteur dans sa montgolfière '
      + '(30 s), puis file au nord photographier le cargo (45 s) et le voilier complice (20 s), et rentre.',
    reward: 1600,
    steps: [
      ...stage('Patrouiller le long de la côte',
        ring(P(20500, -10500), 150, { text: 'Patrouille côtière : longe la côte vers le nord-ouest (fais le plein avant, la tournée est longue !)' }),
        ring(P(19000, -13500), 150, { text: 'Continue le long de la côte, le guetteur n\'est plus loin' })),
      ...stage('Retrouver le guetteur',
        {
          type: 'follow', balloon: 3, distance: 600, duration: 30, label: 'Cassis, la montgolfière du guetteur',
          text: 'Le guetteur des douanes t\'attend à bord de Cassis, sa montgolfière (vers 850 m) : reste à moins de 600 m de lui (et de 500 m de son altitude) pendant 30 s, il t\'indique le cargo',
        }),
      ...stage('Photographier les suspects',
        {
          type: 'follow', ship: 11, distance: 700, duration: 45, label: 'le cargo suspect',
          text: 'Cap au nord-est, au large (20 km) : photographie le cargo suspect en restant à moins de 700 m (et sous 500 m) pendant 45 s',
        },
        {
          type: 'follow', ship: 7, distance: 700, duration: 20, label: 'le voilier complice',
          text: 'Un voilier lui tourne autour… Reste à moins de 700 m de lui (et sous 500 m) pendant 20 s',
        }),
      ...stage('Rapporter les photos',
        land('levant', { text: 'Rapporte les photos aux douanes de Port-Levant' })),
    ],
  },

  // ===================== Quête trouvée sur le terrain =====================
  {
    id: 'est-eoliennes', title: 'L\'inspecteur des éoliennes', category: 'livraison', giver: BUREAU_PARC,
    desc: 'Inspecte la rangée d\'éoliennes par les 4 anneaux (côté est) : une pale est fêlée ! Demande à Paulette, dans sa '
      + 'montgolfière, si le vent permet la réparation (30 s), largue la commande sur les quais de Port-Levant et pose-toi.',
    reward: 600,
    steps: [
      ...stage('Inspecter les éoliennes',
        ring(coteEst(0), 90, { text: 'Inspection : longe les éoliennes par l\'est, 150 m à côté des mâts (pales jusqu\'à 116 m)' }),
        ring(coteEst(3), 90, { text: 'Continue le long de la rangée et regarde bien les pales' }),
        ring(coteEst(6), 90, { text: 'Continue le long de la rangée et regarde bien les pales' }),
        ring(coteEst(9), 90, { text: 'Dernière éolienne : une pale est fêlée, note-le !' })),
      ...stage('Consulter Paulette',
        {
          type: 'follow', balloon: 10, distance: 500, duration: 30, label: 'Mirabelle, la montgolfière de Paulette',
          text: 'Paulette mesure le vent depuis Mirabelle, sa montgolfière (vers 750 m) : reste à moins de 500 m d\'elle (et de 500 m de son altitude) pendant 30 s',
        }),
      ...stage('Commander la pale au port',
        drop(QUAIS, 150, 'quais de Port-Levant', {
          maxAgl: 200, spawn: 'crate', text: 'Le vent tombe demain, parfait ! Largue la commande de pièces (X) sur les quais de Port-Levant, à moins de 200 m du sol',
        })),
      ...stage('Se poser à Port-Levant',
        land('levant', { text: 'Pose-toi à Port-Levant : la nouvelle pale arrive par cargo' })),
    ],
  },
];
