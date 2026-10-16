// Quêtes d'origine (mêmes identifiants qu'avant : la progression des joueurs est conservée).
// Chaque quête raconte une petite histoire en 3 ou 4 étapes (voir stage() dans kit.js).
import {
  A, L, VOLCANO, city, land, reach, drop, ringsAround, ringsLine, ringsSpiral, terrainFollow, stage,
} from './kit.js';

const alphaVille = city('Alpha-Ville');
const CAP = A('capitale');
// route aérienne Alpha-Ville → Capitale : s'arrête 3 km avant la piste pour laisser la place à l'approche
const routeCapitale = (() => {
  const dx = CAP.x - alphaVille.x, dz = CAP.z - alphaVille.z, l = Math.hypot(dx, dz);
  return { x: CAP.x - (dx / l) * 3000, z: CAP.z - (dz / l) * 3000 };
})();
// course du Colosse : ligne d'anneaux puis tour de la statue (un seul suivi de terrain pour des pentes douces)
const COLOSSE = terrainFollow([
  ...ringsLine(A('alpha').x, A('alpha').z, L('colosse').x, L('colosse').z, 7, 150),
  ...ringsAround(L('colosse').x, L('colosse').z, 700, 4, 150, Math.PI / 4),
], 150);
const zone = (p, radius) => ({ x: p.x, z: p.z, radius });

export default [
  {
    id: 'premier-vol', title: 'Premier vol', category: 'course', airport: 'alpha',
    desc: 'Ton baptême de l\'air : démarre le moteur (E) et décolle, fais le tour de Base Alpha par les 4 anneaux, puis reviens te poser.',
    reward: 200,
    steps: [
      ...stage('Décoller', { type: 'altitude', min: 400, text: 'Démarre le moteur (E), mets les gaz, et dès 100 km/h tire doucement sur le manche : monte jusqu\'à 400 m' }),
      ...stage('Faire le tour de la base', ringsAround(A('alpha').x, A('alpha').z, 1800, 4, 200, 0)),
      ...stage('Se poser à Base Alpha', land('alpha')),
    ],
  },
  {
    id: 'courrier', title: 'Courrier pour la Capitale', category: 'livraison', airport: 'alpha',
    desc: 'Le facteur est malade ! Largue d\'abord le sac du village sur Alpha-Ville, suis la route aérienne puis livre le reste du courrier à Capitale International.',
    reward: 400, requires: 'premier-vol',
    steps: [
      ...stage('Courrier d\'Alpha-Ville', drop(alphaVille, 180, 'la place d\'Alpha-Ville', {
        text: 'Le village est juste à côté de la piste : largue le sac de courrier (X) au-dessus de la place d\'Alpha-Ville (vise avec la croix blanche)',
      })),
      ...stage('Suivre la route aérienne', terrainFollow(ringsLine(alphaVille.x, alphaVille.z, routeCapitale.x, routeCapitale.z, 4, 250), 200)),
      ...stage('Livrer à la Capitale', land('capitale', { text: 'Pose-toi à Capitale International et arrête-toi : la poste centrale récupère les sacs' })),
    ],
  },
  {
    id: 'tour-radio', title: 'Inspection de l\'antenne', category: 'exploration', airport: 'capitale',
    desc: 'L\'antenne de la Tour Radio grésille. Va jusqu\'à la colline, fais un grand tour puis un tour serré pour l\'inspecter, et rapporte tes photos à la Capitale.',
    reward: 350,
    steps: [
      ...stage('Rejoindre la Tour Radio', reach(L('tour'), 900, 'Tour Radio', { minAgl: 100, text: 'Rejoins la Tour Radio, sur la colline à l\'ouest de la Capitale (reste au-dessus de 100 m du sol)' })),
      ...stage('Grand tour de l\'antenne', terrainFollow(ringsAround(L('tour').x, L('tour').z, 700, 5, 250), 200)),
      ...stage('Tour serré pour les photos', terrainFollow(ringsAround(L('tour').x, L('tour').z, 450, 4, 250, Math.PI / 4), 180)),
      ...stage('Rapporter les photos', land('capitale', { text: 'Pose-toi à Capitale International : les techniciens attendent tes photos' })),
    ],
  },
  {
    id: 'stade', title: 'Survol du match', category: 'tourisme', airport: 'capitale',
    desc: 'Accroche la banderole publicitaire en rase-mottes au-dessus de la piste, survole le Grand Stade, fais un tour d\'honneur puis reviens te poser.',
    reward: 450,
    steps: [
      ...stage('Accrocher la banderole', {
        type: 'low', maxAgl: 40, duration: 5, ...zone(CAP, 700), label: 'au-dessus de la piste de la Capitale',
        text: 'Décolle, fais demi-tour et repasse au-dessus de la piste à moins de 40 m pendant 5 s : le crochet attrape la banderole',
      }),
      ...stage('Survoler le Grand Stade', reach(L('stade'), 300, 'Grand Stade', { maxAgl: 200, text: 'Passe au-dessus du Grand Stade à moins de 200 m : les 40 000 spectateurs doivent lire la banderole !' })),
      ...stage('Tour d\'honneur', ringsAround(L('stade').x, L('stade').z, 800, 4, 200, Math.PI / 2)),
      ...stage('Rentrer à la Capitale', land('capitale', { text: 'Le match commence : rentre te poser à Capitale International' })),
    ],
  },
  {
    id: 'phare', title: 'Le tour du phare', category: 'tourisme', airport: 'azur',
    desc: 'Des touristes ont réservé un vol photo : emmène-les jusqu\'au Phare de l\'Ouest, fais-en le tour par les anneaux, puis ramène-les à Port Azur.',
    reward: 500,
    steps: [
      ...stage('Rejoindre le Phare de l\'Ouest', reach(L('phare'), 1200, 'Phare de l\'Ouest', { text: 'Les touristes sont à bord : mets le cap sur le Phare de l\'Ouest, sur la côte' })),
      ...stage('Tour photo du phare', ringsAround(L('phare').x, L('phare').z, 700, 6, 120)),
      ...stage('Ramener les touristes', land('azur', { text: 'Clic-clac, c\'est dans la boîte ! Ramène les touristes à Port Azur' })),
    ],
  },
  {
    id: 'haute-altitude', title: 'Tête dans les nuages', category: 'defi', airport: 'givre',
    desc: 'La météo de Mont Givre veut des relevés en altitude : monte au-dessus de 3 000 m, tiens un palier stable pour les capteurs, puis redescends te poser.',
    reward: 550,
    steps: [
      ...stage('Monter à 3 000 m', { type: 'altitude', min: 3000, text: 'Monte au-dessus de 3 000 m (monte en larges cercles : le moteur s\'essouffle en altitude)' }),
      ...stage('Relevés en palier', { type: 'hold', min: 3000, max: 3400, duration: 20, text: 'Les capteurs mesurent : reste entre 3 000 et 3 400 m pendant 20 s' }),
      ...stage('Rapporter les relevés', land('givre', { text: 'Relevés terminés ! Redescends te poser à Mont Givre' })),
    ],
  },
  {
    id: 'sommet', title: 'Drapeau sur le Toit du Monde', category: 'exploration', airport: 'givre',
    desc: 'Le club alpin veut voir son drapeau sur le Toit du Monde : prends de l\'altitude, rase le sommet pour y lâcher le drapeau, puis rentre à Mont Givre.',
    reward: 650,
    steps: [
      ...stage('Prendre de l\'altitude', { type: 'altitude', min: 2900, text: 'Le sommet culmine à près de 2 700 m : monte au-dessus de 2 900 m avant de t\'en approcher' }),
      ...stage('Planter le drapeau', reach(L('sommet'), 300, L('sommet').name, { maxAgl: 300, spawn: 'flag', text: 'Rase le Toit du Monde à moins de 300 m : le drapeau est lâché au passage' })),
      ...stage('Rentrer à Mont Givre', land('givre', { text: 'Le drapeau flotte ! Rentre te poser à Mont Givre' })),
    ],
  },
  {
    id: 'observatoire', title: 'Livraison de télescope', category: 'livraison', airport: 'glacier',
    desc: 'L\'Observatoire attend sa nouvelle lentille : va la chercher à Mont Givre, survole l\'Observatoire pour la livrer, puis reviens à Station Glacier.',
    reward: 750,
    steps: [
      ...stage('Chercher la lentille', land('givre', { text: 'La lentille est prête à Mont Givre : va t\'y poser pour la charger' })),
      ...stage('Livrer à l\'Observatoire', reach(L('observatoire'), 400, 'Observatoire', { maxAgl: 300, text: 'Survole l\'Observatoire à moins de 300 m : les astronomes récupèrent la lentille au parachute' })),
      ...stage('Rentrer à Station Glacier', land('glacier')),
    ],
  },
  {
    id: 'phare-nord', title: 'Ravitailler le gardien', category: 'livraison', airport: 'nord',
    desc: 'Le gardien du Phare du Nord n\'a plus de vivres. Rejoins la côte, largue-lui son colis au pied du phare, puis rentre à Cap Nord.',
    reward: 450,
    steps: [
      ...stage('Rejoindre le Phare du Nord', reach(L('phare-nord'), 1500, 'Phare du Nord', { text: 'Le colis de vivres est chargé : vole jusqu\'au Phare du Nord, au bout de la côte' })),
      ...stage('Larguer les vivres', drop(L('phare-nord'), 120, 'le pied du phare', { maxAgl: 200, spawn: 'smoke', text: 'Le gardien a allumé un fumigène : largue le colis (X) au pied du phare, à moins de 200 m du sol' })),
      ...stage('Rentrer à Cap Nord', land('nord')),
    ],
  },
  {
    id: 'epave', title: 'Recherche de l\'épave', category: 'exploration', airport: 'levant',
    desc: 'Un cargo a coulé au large. Rejoins la zone du naufrage, repère l\'épave en volant bas, largue une bouée dessus pour les plongeurs, puis rentre à Port-Levant.',
    reward: 550,
    steps: [
      ...stage('Rejoindre la zone du naufrage', reach(L('epave'), 2500, 'zone du naufrage', { text: 'Le naufrage a eu lieu au large, à l\'est : vole jusqu\'à la zone de recherche' })),
      ...stage('Repérer l\'épave', {
        type: 'low', maxAgl: 150, duration: 8, ...zone(L('epave'), 700), label: 'au-dessus de l\'épave',
        text: 'Descends sous 150 m au-dessus de l\'eau près de l\'épave pendant 8 s pour la repérer',
      }),
      ...stage('Larguer une bouée', drop(L('epave'), 150, 'l\'épave', { spawn: 'smoke', text: 'Largue la bouée (X) juste au-dessus de l\'épave pour guider les plongeurs' })),
      ...stage('Rentrer à Port-Levant', land('levant')),
    ],
  },
  {
    id: 'volcan', title: 'Mesures volcaniques', category: 'exploration', airport: 'levant',
    desc: 'Les volcanologues ont besoin de mesures : rejoins le Volcan, fais le tour du cratère par les anneaux pour les capteurs, puis livre les données à la Base du Volcan.',
    reward: 800,
    steps: [
      ...stage('Rejoindre le Volcan', reach(VOLCANO, 3000, 'le Volcan', { minAgl: 150, text: 'Vole jusqu\'au Volcan, au sud-est, en restant bien au-dessus du relief' })),
      ...stage('Tour du cratère', ringsSpiral(VOLCANO.x, VOLCANO.z, 1400, 6, VOLCANO.h + 200, VOLCANO.h + 200)),
      ...stage('Livrer les données', land('volcan', { text: 'Capteurs pleins ! Pose-toi à la Base du Volcan pour livrer les données' })),
    ],
  },
  {
    id: 'pyramides', title: 'Le secret des pyramides', category: 'tourisme', airport: 'dunes',
    desc: 'Des archéologues veulent des photos aériennes : rejoins les pyramides, tourne autour par les anneaux, fais un passage en rase-mottes, puis rentre à l\'Oasis.',
    reward: 550,
    steps: [
      ...stage('Rejoindre les pyramides', reach(L('pyramides'), 1000, 'Les Pyramides', { text: 'Les pyramides sont à l\'est de l\'oasis : vas-y avec les archéologues' })),
      ...stage('Photos en cercle', ringsAround(L('pyramides').x, L('pyramides').z, 500, 6, 100)),
      ...stage('Passage en rase-mottes', {
        type: 'low', maxAgl: 60, duration: 6, ...zone(L('pyramides'), 900), label: 'près des pyramides',
        text: 'Dernière photo : passe à moins de 60 m du sable près des pyramides pendant 6 s',
      }),
      ...stage('Rentrer à l\'Oasis', land('dunes')),
    ],
  },
  {
    id: 'arche', title: 'Slalom de l\'arche', category: 'course', airport: 'verte',
    desc: 'La course de la côte nord ! Rejoins la mer, passe sous la Grande Arche, enchaîne le slalom au ras de l\'eau puis rentre à Vallée Verte.',
    reward: 750,
    steps: [
      ...stage('Rejoindre la côte', reach(L('arche'), 2500, 'Grande Arche', { text: 'Vole vers le nord jusqu\'à la Grande Arche, plantée dans la mer' })),
      ...stage('Passer sous l\'arche', { type: 'ring', x: L('arche').x, z: L('arche').z, agl: 60, size: 45, text: 'Descends à 60 m et passe sous la Grande Arche !' }),
      ...stage('Slalom au ras de l\'eau', ringsAround(L('arche').x, L('arche').z - 1500, 1100, 5, 60, Math.PI / 2)),
      ...stage('Rentrer à Vallée Verte', land('verte')),
    ],
  },
  {
    id: 'plateforme', title: 'Relève de l\'équipe', category: 'livraison', airport: 'falaises',
    desc: 'L\'équipage de la Plateforme Pétrolière attend son courrier : rejoins la plateforme en mer, largue le sac sur le pont, puis rentre aux Falaises.',
    reward: 550,
    steps: [
      ...stage('Rejoindre la plateforme', reach(L('plateforme'), 2000, 'Plateforme Pétrolière', { text: 'Cap à l\'ouest, en pleine mer : la Plateforme Pétrolière est au large' })),
      ...stage('Larguer le courrier', drop(L('plateforme'), 120, 'le pont de la plateforme', { maxAgl: 250, text: 'Largue le sac de courrier (X) sur la plateforme, à moins de 250 m au-dessus de l\'eau' })),
      ...stage('Rentrer aux Falaises', land('falaises')),
    ],
  },
  {
    id: 'chateau', title: 'Le fantôme du château', category: 'exploration', airport: 'verte',
    desc: 'On dit qu\'un fantôme hante le Château des Brumes. Monte jusqu\'au château, approche-toi à moins de 150 m, fais-en le tour, puis raconte tout à Vallée Verte.',
    reward: 550,
    steps: [
      ...stage('Rejoindre le château', reach(L('chateau'), 1500, 'Château des Brumes', { minAgl: 150, text: 'Le château est perché sur un sommet à près de 2 500 m : monte et vole vers lui' })),
      ...stage('Approcher de près', reach(L('chateau'), 250, 'Château des Brumes', { maxAgl: 150, spawn: 'smoke', text: 'Une étrange fumée s\'élève… approche-toi à moins de 150 m du château' })),
      ...stage('Tour du château', terrainFollow(ringsAround(L('chateau').x, L('chateau').z, 700, 4, 150), 150)),
      ...stage('Raconter à Vallée Verte', land('verte', { text: 'Ce n\'était que la cheminée du gardien ! Rentre le raconter à Vallée Verte' })),
    ],
  },
  {
    id: 'colosse', title: 'Course du Colosse', category: 'course', airport: 'alpha',
    desc: 'Course aller-retour : suis la ligne d\'anneaux jusqu\'au Colosse, contourne la statue par les anneaux, puis reviens te poser à Base Alpha.',
    reward: 450, requires: 'premier-vol',
    steps: [
      ...stage('Aller jusqu\'au Colosse', COLOSSE.slice(0, 7)),
      ...stage('Contourner la statue', COLOSSE.slice(7)),
      ...stage('Retour à Base Alpha', land('alpha')),
    ],
  },
  {
    id: 'palmes', title: 'Vacances aux Palmes', category: 'livraison', airport: 'corail',
    desc: 'Emmène des touristes de l\'Île Corail à l\'Archipel des Palmes : petit détour par le Phare du Sud, un passage au ras des vagues, puis atterrissage aux Palmes.',
    reward: 550,
    steps: [
      ...stage('Montrer le Phare du Sud', reach(L('phare-sud'), 600, 'Phare du Sud', { maxAgl: 300, text: 'Les touristes veulent voir le Phare du Sud : survole-le à moins de 300 m' })),
      ...stage('Au ras des vagues', { type: 'low', maxAgl: 60, duration: 10, label: 'au-dessus de la mer', text: 'Pour le frisson : vole à moins de 60 m au-dessus de la mer pendant 10 s' }),
      ...stage('Se poser aux Palmes', land('palmes', { text: 'Pose-toi à l\'Archipel des Palmes : les vacances commencent !' })),
    ],
  },
  {
    id: 'medecin', title: 'Médecin volant', category: 'sauvetage', airport: 'lac',
    desc: 'Urgence ! Le médecin de Lac Miroir doit soigner un pêcheur à Cap Nord puis un skieur à Mont Givre. Emmène-le, puis ramène-le chez lui.',
    reward: 750,
    steps: [
      ...stage('Pêcheur blessé à Cap Nord', land('nord', { text: 'Le médecin est à bord : fonce à Cap Nord, un pêcheur s\'est blessé' })),
      ...stage('Skieur blessé à Mont Givre', land('givre', { text: 'Le pêcheur est soigné. Direction Mont Givre : un skieur s\'est cassé la jambe' })),
      ...stage('Ramener le médecin', land('lac', { text: 'Bravo ! Ramène le médecin à Lac Miroir' })),
    ],
  },
  {
    id: 'tour-monde', title: 'Le grand tour', category: 'defi', airport: 'alpha',
    desc: 'La quête ultime : fais escale dans 8 aéroports aux quatre coins de la carte (ouest, sud, est, nord), puis reviens à Base Alpha.',
    reward: 4000, requires: 'courrier',
    steps: [
      ...stage('L\'Ouest : Azur et les Dunes', land('azur'), land('dunes')),
      ...stage('Le Sud : Palmes et Corail', land('palmes'), land('corail')),
      ...stage('L\'Est : Volcan et Levant', land('volcan'), land('levant')),
      ...stage('Le Nord, puis retour à Alpha', land('nord'), land('glacier'), land('alpha')),
    ],
  },
];
