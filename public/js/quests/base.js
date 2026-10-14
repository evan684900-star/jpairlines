// Quêtes d'origine (mêmes identifiants qu'avant : la progression des joueurs est conservée)
import { A, L, VOLCANO, land, reach, ringsAround, ringsLine, ringsSpiral, terrainFollow } from './kit.js';

export default [
  {
    id: 'premier-vol', title: 'Premier vol', category: 'course', airport: 'alpha',
    desc: 'Démarre le moteur (E), décolle, passe les 4 anneaux autour de la base puis reviens te poser.',
    reward: 200,
    steps: [...ringsAround(A('alpha').x, A('alpha').z, 1800, 4, 200, 0), land('alpha')],
  },
  {
    id: 'courrier', title: 'Courrier pour la Capitale', category: 'livraison', airport: 'alpha',
    desc: 'Le facteur est malade ! Apporte le courrier à Capitale International.',
    reward: 350, requires: 'premier-vol',
    steps: [land('capitale')],
  },
  {
    id: 'tour-radio', title: 'Inspection de l\'antenne', category: 'exploration', airport: 'capitale',
    desc: 'Fais deux tours de la Tour Radio pour vérifier l\'antenne.',
    reward: 300,
    steps: terrainFollow([...ringsAround(L('tour').x, L('tour').z, 600, 5, 250), ...ringsAround(L('tour').x, L('tour').z, 600, 5, 250)], 200),
  },
  {
    id: 'stade', title: 'Survol du match', category: 'tourisme', airport: 'capitale',
    desc: 'Une banderole publicitaire doit survoler le Grand Stade à basse altitude (moins de 200 m).',
    reward: 350,
    steps: [reach(L('stade'), 300, 'Grand Stade', { maxAgl: 200 }), land('capitale')],
  },
  {
    id: 'phare', title: 'Le tour du phare', category: 'tourisme', airport: 'azur',
    desc: 'Les touristes veulent des photos : fais le tour du Phare de l\'Ouest en passant les anneaux.',
    reward: 450,
    steps: ringsAround(L('phare').x, L('phare').z, 700, 6, 120),
  },
  {
    id: 'haute-altitude', title: 'Tête dans les nuages', category: 'defi', airport: 'givre',
    desc: 'Monte au-dessus de 3 000 m d\'altitude pour mesurer la température.',
    reward: 500,
    steps: [{ type: 'altitude', min: 3000 }],
  },
  {
    id: 'sommet', title: 'Drapeau sur le Toit du Monde', category: 'exploration', airport: 'givre',
    desc: 'Survole le plus haut sommet de la carte à moins de 300 m.',
    reward: 600,
    steps: [reach(L('sommet'), 300, L('sommet').name)],
  },
  {
    id: 'observatoire', title: 'Livraison de télescope', category: 'livraison', airport: 'glacier',
    desc: 'Récupère la lentille à Mont Givre, survole l\'Observatoire, puis reviens à Station Glacier.',
    reward: 750,
    steps: [land('givre'), reach(L('observatoire'), 400, 'Observatoire'), land('glacier')],
  },
  {
    id: 'phare-nord', title: 'Ravitailler le gardien', category: 'livraison', airport: 'nord',
    desc: 'Le gardien du Phare du Nord attend ses vivres : survole le phare à basse altitude.',
    reward: 400,
    steps: [reach(L('phare-nord'), 300, 'Phare du Nord', { maxAgl: 200 }), land('nord')],
  },
  {
    id: 'epave', title: 'Recherche de l\'épave', category: 'exploration', airport: 'levant',
    desc: 'Un bateau a coulé au large. Va repérer l\'épave en volant bas.',
    reward: 450,
    steps: [reach(L('epave'), 300, 'L\'Épave', { maxAgl: 250 })],
  },
  {
    id: 'volcan', title: 'Mesures volcaniques', category: 'exploration', airport: 'levant',
    desc: 'Les scientifiques ont besoin de mesures : fais le tour du cratère puis pose-toi à la Base du Volcan.',
    reward: 800,
    steps: [...ringsSpiral(VOLCANO.x, VOLCANO.z, 1400, 6, VOLCANO.h + 200, VOLCANO.h + 200), land('volcan')],
  },
  {
    id: 'pyramides', title: 'Le secret des pyramides', category: 'tourisme', airport: 'dunes',
    desc: 'Des archéologues veulent des photos aériennes : passe les anneaux autour des pyramides.',
    reward: 500,
    steps: ringsAround(L('pyramides').x, L('pyramides').z, 500, 6, 100),
  },
  {
    id: 'arche', title: 'Slalom de l\'arche', category: 'course', airport: 'verte',
    desc: 'Passe sous la Grande Arche puis enchaîne les anneaux au ras de l\'eau.',
    reward: 700,
    steps: [
      { type: 'ring', x: L('arche').x, z: L('arche').z, agl: 60, size: 45 },
      ...ringsAround(L('arche').x, L('arche').z - 1500, 1100, 5, 60, Math.PI / 2),
    ],
  },
  {
    id: 'plateforme', title: 'Relève de l\'équipe', category: 'livraison', airport: 'falaises',
    desc: 'Survole la Plateforme Pétrolière pour larguer le courrier de l\'équipage.',
    reward: 550,
    steps: [reach(L('plateforme'), 250, 'Plateforme', { maxAgl: 200 }), land('falaises')],
  },
  {
    id: 'chateau', title: 'Le fantôme du château', category: 'exploration', airport: 'verte',
    desc: 'On raconte qu\'un fantôme hante le Château des Brumes. Va voir de plus près (moins de 150 m).',
    reward: 450,
    steps: [reach(L('chateau'), 250, 'Château', { maxAgl: 150 })],
  },
  {
    id: 'colosse', title: 'Course du Colosse', category: 'course', airport: 'alpha',
    desc: 'Course d\'anneaux entre Base Alpha et le Colosse, puis retour à la base.',
    reward: 450, requires: 'premier-vol',
    steps: [...terrainFollow(ringsLine(A('alpha').x, A('alpha').z, L('colosse').x, L('colosse').z, 7, 150), 150), land('alpha')],
  },
  {
    id: 'palmes', title: 'Vacances aux Palmes', category: 'livraison', airport: 'corail',
    desc: 'Emmène des touristes de l\'Île Corail à l\'Archipel des Palmes.',
    reward: 500,
    steps: [land('palmes')],
  },
  {
    id: 'medecin', title: 'Médecin volant', category: 'sauvetage', airport: 'lac',
    desc: 'Urgence ! Emmène le médecin à Cap Nord puis à Mont Givre.',
    reward: 650,
    steps: [land('nord'), land('givre')],
  },
  {
    id: 'tour-monde', title: 'Le grand tour', category: 'defi', airport: 'alpha',
    desc: 'Pose-toi dans 8 aéroports aux quatre coins de la carte. La quête ultime !',
    reward: 4000, requires: 'courrier',
    steps: ['azur', 'dunes', 'palmes', 'corail', 'volcan', 'levant', 'nord', 'glacier'].map((id) => land(id)),
  },
];
