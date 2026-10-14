// Quêtes de la région : centre (Base Alpha, Capitale, Lac Miroir, Tour Radio, Grand Stade, Colosse, Château)
import {
  A, L, city, nextTo, land, touch, reach, drop, ring, ringsAround, terrainFollow, windTurbines,
} from './kit.js';

// ----- utilitaires locaux -----
// Point le long de la rangée d'éoliennes du parc 3 : s = distance le long de la rangée depuis la
// première éolienne (côté Capitale), p = décalage perpendiculaire (positif = côté nord).
const T3 = windTurbines(3);
const rowDir = (() => {
  const dx = T3[1].x - T3[0].x, dz = T3[1].z - T3[0].z, l = Math.hypot(dx, dz);
  return { x: dx / l, z: dz / l };
})();
const alongRow = (s, p) => ({ x: T3[0].x + rowDir.x * s - rowDir.z * p, z: T3[0].z + rowDir.z * s + rowDir.x * p });

const capitale = city('Capitale');
const alphaVille = city('Alpha-Ville');
const P = (x, z) => ({ x, z });

// Lieux inventés pour les histoires
const FERME = P(-1000, -6700); // ferme des Durand, entre Alpha et le Lac
const CAMPING = P(3200, -9200); // camping des Pins, près du Lac Miroir
const TECHNICIENS = P(3500, 3100); // cabane des techniciens, au pied de la Tour Radio (côté nord)
const CHANTIER = alongRow(-350, 0); // ouvriers du parc éolien, au bout de la rangée côté Capitale
const VAL_PERDU = P(-5200, 2000); // haut vallon du massif de l'Ouest (~1 550 m)
const REFUGE = P(-3200, 3000); // refuge au pied du vallon
const CHAMP_BALLONS = P(2480, -1140); // pré d'envol des montgolfières, à l'est de Base Alpha

export default [
  // ===================== École de pilotage (petite chaîne) =====================
  {
    id: 'centre-ecole-tour-de-piste', title: 'Leçon 1 : le tour de piste', category: 'defi', airport: 'alpha',
    desc: 'Monique, ta monitrice, est intransigeante : un tour de piste par les 2 anneaux, un toucher-décoller, '
      + 'un palier entre 450 et 600 m pendant 20 s, puis un atterrissage complet à Base Alpha.',
    reward: 300,
    steps: [
      ring(nextTo(A('alpha'), 1000, 500), 250, { text: 'Vent arrière : passe l\'anneau parallèle à la piste' }),
      ring(nextTo(A('alpha'), 800, -1500), 200, { text: 'Étape de base : passe l\'anneau, puis aligne-toi sur la piste' }),
      touch('alpha', { text: 'Toucher-décoller à Base Alpha : les roues touchent, plein gaz, on repart !' }),
      { type: 'hold', min: 450, max: 600, duration: 20, text: 'Palier : tiens ton altitude entre 450 et 600 m pendant 20 s (le trim est ton ami)' },
      land('alpha', { text: 'Atterrissage complet à Base Alpha. Monique prend des notes…' }),
    ],
  },
  {
    id: 'centre-ecole-examen', title: 'Examen : la piste courte', category: 'defi', airport: 'alpha',
    requires: 'centre-ecole-tour-de-piste',
    desc: 'Le jour de l\'examen ! Toucher-décoller sur l\'herbe de Lac Miroir, palier entre 600 et 750 m pendant 30 s, '
      + 'passage à moins de 50 m au-dessus de la piste pendant 8 s, puis pose-toi là-bas.',
    reward: 600,
    steps: [
      touch('lac', { text: 'Toucher-décoller sur la piste en herbe de Lac Miroir (950 m seulement !)' }),
      { type: 'hold', min: 600, max: 750, duration: 30, text: 'Palier : entre 600 et 750 m pendant 30 s. L\'examinateur chronomètre.' },
      {
        type: 'low', maxAgl: 50, duration: 8, x: A('lac').x, z: A('lac').z, radius: 700,
        text: 'Passage bas au-dessus de la piste de Lac Miroir : moins de 50 m du sol pendant 8 s',
      },
      land('lac', { text: 'Atterrissage de précision sur la piste courte de Lac Miroir. Diplôme en vue !' }),
    ],
  },

  // ===================== La tournée de Gaston (chaîne de 3 quêtes) =====================
  {
    id: 'centre-facteur-tournee', title: 'La tournée de Gaston', category: 'livraison', airport: 'alpha',
    desc: 'Gaston le facteur est guéri mais il a le vertige. Largue le courrier sur la ferme des Durand puis au '
      + 'camping des Pins (à moins de 150 m du sol), et termine à Lac Miroir.',
    reward: 480,
    steps: [
      drop(FERME, 150, 'Ferme des Durand', { maxAgl: 150, spawn: 'flag' }),
      drop(CAMPING, 150, 'Camping des Pins', { maxAgl: 150, spawn: 'tent' }),
      land('lac', { text: 'Pose-toi à Lac Miroir : Gaston t\'attend au bureau de poste' }),
    ],
  },
  {
    id: 'centre-facteur-recommande', title: 'Recommandé express', category: 'livraison', airport: 'lac',
    requires: 'centre-facteur-tournee',
    desc: 'Un recommandé urgent pour le maire d\'Alpha-Ville ! Largue-le sur la mairie (moins de 150 m du sol) '
      + 'puis file te poser à Capitale International. Gaston a promis : 10 minutes, pas une de plus.',
    reward: 750, timeLimit: 600,
    steps: [
      drop(alphaVille, 200, 'Mairie d\'Alpha-Ville', { maxAgl: 150, spawn: 'flag' }),
      land('capitale', { text: 'Pose-toi à Capitale International avant la fin du chrono' }),
    ],
  },
  {
    id: 'centre-facteur-fantome', title: 'Une lettre pour le fantôme', category: 'exploration', airport: 'capitale',
    requires: 'centre-facteur-recommande', minRank: 1,
    desc: 'Une lettre adressée « au Fantôme, Château des Brumes » ! Prends Gaston à Base Alpha, largue-la sur le '
      + 'château (moins de 200 m du sol), reste 40 s près de la montgolfière qui s\'enfuit, puis ramène Gaston.',
    reward: 1500,
    steps: [
      land('alpha', { text: 'Passe prendre Gaston à Base Alpha (et fais le plein avec K, ça va grimper !)' }),
      drop(L('chateau'), 200, 'Château des Brumes (2 520 m)', { maxAgl: 200, spawn: 'flag' }),
      {
        type: 'follow', balloon: 1, distance: 800, duration: 40, label: 'le « fantôme » en montgolfière',
        text: 'Le « fantôme » s\'enfuit en montgolfière vers 1 000 m ! Reste à moins de 800 m de lui pendant 40 s',
      },
      land('alpha', { text: 'C\'était le baron Léon et ses farces… Ramène Gaston à Base Alpha' }),
    ],
  },

  // ===================== Capitale =====================
  {
    id: 'centre-bapteme', title: 'Le baptême de Mamie Josette', category: 'tourisme', airport: 'capitale',
    desc: 'Mamie Josette fête ses 90 ans avec son premier vol ! Palier tout en douceur entre 500 et 650 m pendant 20 s, '
      + 'tour de la Capitale par les anneaux, survol des gratte-ciel, puis retour à l\'aéroport.',
    reward: 450,
    steps: [
      { type: 'hold', min: 500, max: 650, duration: 20, text: 'Tout en douceur : tiens-toi entre 500 et 650 m pendant 20 s' },
      ...ringsAround(capitale.x, capitale.z, 1500, 6, 220, Math.PI),
      ring(capitale, 380, { size: 40, text: 'Survol des gratte-ciel (ils montent jusqu\'à 270 m !)' }),
      land('capitale', { text: 'Pose-toi en douceur à Capitale International. Mamie applaudit !' }),
    ],
  },
  {
    id: 'centre-eoliennes', title: 'Slalom des éoliennes', category: 'course', airport: 'capitale',
    desc: 'Le parc éolien à l\'ouest de la Capitale organise un slalom ! Passe entre les mâts par les anneaux '
      + '(vers 60-70 m du sol, gare aux pales), puis reviens te poser à Capitale International.',
    reward: 550, bonusTime: 330, bonusReward: 200,
    steps: [
      ring(alongRow(-600, 0), 100, { text: 'Entrée du slalom : aligne-toi sur la rangée d\'éoliennes' }),
      ring(alongRow(110, 0), 60, { text: 'Passe entre les deux premières éoliennes' }),
      ring(alongRow(440, 170), 70),
      ring(alongRow(770, 0), 60, { text: 'Entre les mâts !' }),
      ring(alongRow(1100, -170), 70),
      ring(alongRow(1430, 0), 60, { text: 'Dernière porte entre les éoliennes' }),
      ring(alongRow(1750, 450), 120, { text: 'Sortie : dégage vers le nord, le relief monte à l\'ouest' }),
      land('capitale'),
    ],
  },
  {
    id: 'centre-banderole', title: 'Banderole publicitaire', category: 'tourisme', airport: 'alpha',
    desc: '« Mangez des crêpes chez Yvonne ! » Promène la banderole à moins de 150 m au-dessus d\'Alpha-Ville (20 s), '
      + 'au-dessus des gratte-ciel de la Capitale, puis à moins de 200 m autour du Grand Stade (15 s).',
    reward: 600,
    steps: [
      {
        type: 'low', maxAgl: 150, duration: 20, x: alphaVille.x, z: alphaVille.z, radius: 1000, label: 'au-dessus d\'Alpha-Ville',
        text: 'Promène la banderole au-dessus d\'Alpha-Ville : moins de 150 m du sol pendant 20 s',
      },
      ring(capitale, 380, { size: 40, text: 'Passe au-dessus des gratte-ciel de la Capitale (pas plus bas, ils font 270 m !)' }),
      {
        type: 'low', maxAgl: 200, duration: 15, x: L('stade').x, z: L('stade').z, radius: 700, label: 'autour du Grand Stade',
        text: 'Tourne autour du Grand Stade à moins de 200 m du sol pendant 15 s : les supporters lisent !',
      },
      land('capitale'),
    ],
  },
  {
    id: 'centre-pizza', title: 'Pizza express', category: 'livraison', airport: 'alpha',
    desc: 'Luigi d\'Alpha-Ville livre par avion ! Largue les pizzas aux techniciens de la Tour Radio puis aux ouvriers '
      + 'du parc éolien (moins de 150 m du sol), et pose-toi à la Capitale. Elles doivent arriver chaudes : 7 min !',
    reward: 600, timeLimit: 420, bonusTime: 320, bonusReward: 150,
    steps: [
      drop(TECHNICIENS, 150, 'Techniciens de la Tour Radio', { maxAgl: 150, spawn: 'crate' }),
      drop(CHANTIER, 150, 'Ouvriers du parc éolien', { maxAgl: 150, spawn: 'crate' }),
      land('capitale', { text: 'Pose-toi à Capitale International : la dernière pizza est pour la tour de contrôle' }),
    ],
  },
  {
    id: 'centre-meeting', title: 'Meeting aérien de la Capitale', category: 'voltige', airport: 'capitale',
    minRank: 2,
    desc: 'Le grand meeting ! Anneau au-dessus du Grand Stade, 8 s sur le dos, piqué à 290 km/h, chandelle au-dessus '
      + 'de 900 m, passage à moins de 50 m le long de la piste pendant 8 s, puis atterrissage.',
    reward: 1100,
    steps: [
      ring(L('stade'), 400, { size: 40, text: 'Ouverture du meeting : passe l\'anneau au-dessus du Grand Stade' }),
      { type: 'inverted', duration: 8, text: 'Passage dos devant le public : vole sur le dos pendant 8 s' },
      { type: 'speed', min: 290, text: 'Piqué ! Atteins 290 km/h (et pense à redresser…)' },
      { type: 'altitude', min: 900, text: 'Chandelle : remonte au-dessus de 900 m' },
      {
        type: 'low', maxAgl: 50, duration: 8, x: A('capitale').x, z: A('capitale').z, radius: 1300,
        text: 'Passage bas le long de la piste de la Capitale : moins de 50 m du sol pendant 8 s',
      },
      land('capitale', { text: 'Pose-toi sous les applaudissements !' }),
    ],
  },

  // ===================== Quêtes trouvées sur le terrain =====================
  {
    id: 'centre-montgolfieres', title: 'La fête des montgolfières', category: 'tourisme', giver: CHAMP_BALLONS,
    desc: 'Le photographe du club veut des clichés : reste à moins de 700 m de la montgolfière de Léon (40 s), puis '
      + 'à moins de 600 m de celle du baron, vers 2 000 m au-dessus des sommets (40 s), et pose-toi à Base Alpha.',
    reward: 700,
    steps: [
      { type: 'follow', balloon: 2, distance: 700, duration: 40, label: 'la montgolfière de Léon' },
      {
        type: 'follow', balloon: 5, distance: 600, duration: 40, label: 'la montgolfière du baron',
        text: 'Monte rejoindre le baron vers 2 000 m (sommets à 2 100 m tout près !) et reste à moins de 600 m de lui pendant 40 s',
      },
      land('alpha'),
    ],
  },
  {
    id: 'centre-colosse-salut', title: 'Le salut au Colosse', category: 'voltige',
    giver: P(-6700, 6750), minRank: 1,
    desc: 'Le gardien du Colosse exige du respect : fais le tour de la statue par les 5 anneaux, salue-la 6 s sur le dos, '
      + 'puis tire ta révérence à moins de 60 m du sol pendant 8 s près d\'elle.',
    reward: 500,
    steps: [
      ...ringsAround(L('colosse').x, L('colosse').z, 450, 5, 120, Math.PI / 2),
      { type: 'inverted', duration: 6, text: 'Salue le Colosse : vole sur le dos pendant 6 s' },
      {
        type: 'low', maxAgl: 60, duration: 8, x: L('colosse').x, z: L('colosse').z, radius: 700,
        text: 'Révérence : passe à moins de 60 m du sol près du Colosse pendant 8 s',
      },
    ],
  },
  {
    id: 'centre-randonneur', title: 'Perdu dans le Val Perdu', category: 'sauvetage', giver: REFUGE, minRank: 1,
    desc: 'Le gardien du refuge s\'inquiète : un randonneur est coincé dans le haut vallon (1 550 m). Repère sa fumée '
      + '(moins de 400 m du sol), largue-lui la trousse de secours (moins de 250 m du sol) et préviens Base Alpha.',
    reward: 750,
    steps: [
      reach(VAL_PERDU, 400, 'fumée dans le Val Perdu', { maxAgl: 400, spawn: 'smoke', text: 'Remonte le vallon vers l\'ouest et repère la fumée (moins de 400 m du sol)' }),
      drop(VAL_PERDU, 200, 'le randonneur', { maxAgl: 250, spawn: 'hiker', text: 'Largue la trousse de secours (X) près du randonneur, à moins de 250 m du sol' }),
      land('alpha', { text: 'Pose-toi à Base Alpha pour prévenir les secours en montagne' }),
    ],
  },
];

void terrainFollow;
