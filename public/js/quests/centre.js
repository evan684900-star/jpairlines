// Quêtes de la région : centre (Base Alpha, Capitale, Lac Miroir, Tour Radio, Grand Stade, Colosse, Château)
import {
  A, L, city, nextTo, land, touch, reach, drop, ring, ringAlt, ringsAround, windTurbines, AIRPORTS, CITIES, dist,
} from './kit.js';

// ----- utilitaires locaux -----
const P = (x, z) => ({ x, z });

// Éoliennes réellement dessinées : objects.js n'affiche pas celles qui sont trop près d'un aéroport
// ou d'une ville (windTurbines() du kit les renvoie quand même).
const visible = (p) => !AIRPORTS.some((a) => dist(p, a) < a.length / 2 + a.pad + 500)
  && !CITIES.some((c) => dist(p, c) < c.radius + 200);
const T3 = windTurbines(3).filter(visible); // parc à l'ouest de la Capitale ; T3[0] = la plus proche de l'aéroport

// Axe de piste : point à `d` m au-delà du seuil (côté -1 ou +1 de la piste), décalé de `u` m sur le travers,
// et altitude d'une pente d'approche de 3° (ILS)
const seuil = (a, side, d, u = 0) => nextTo(a, u, side * (a.length / 2 + d));
const pente3 = (a, d) => Math.round(a.elev + d * Math.tan((3 * Math.PI) / 180));

// Cœur dessiné dans le ciel (courbe classique), pointe vers le sud ; `s` = mètres par unité (largeur 32 s)
function coeur(c, s, n, alt) {
  const out = [];
  for (let k = 0; k <= n; k++) {
    const t = (2 * Math.PI * k) / n;
    const X = 16 * Math.sin(t) ** 3;
    const Y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    out.push(ringAlt(P(c.x + X * s, c.z - Y * s), alt));
  }
  return out;
}

const capitale = city('Capitale');
const alphaVille = city('Alpha-Ville');
const CAP = A('capitale');

// Lieux inventés pour les histoires
const FERME = P(-1000, -6700); // ferme des Durand, entre Alpha et le Lac (~205 m)
const CAMPING = P(3200, -9200); // camping des Pins, près du Lac Miroir (~255 m)
const TECHNICIENS = P(3900, 2200); // cabane des techniciens, en plaine au pied nord-est de la colline de la Tour Radio (~125 m)
const CHANTIER = (() => { // chantier de deux nouvelles éoliennes, au bout de la rangée côté Capitale (~205 m)
  const dx = T3[0].x - T3[1].x, dz = T3[0].z - T3[1].z, l = Math.hypot(dx, dz);
  return P(T3[0].x + (dx / l) * 400, T3[0].z + (dz / l) * 400);
})();
const VAL_PERDU = P(-5200, 2000); // haut vallon du massif de l'Ouest (~1 550 m), ouvert vers l'est
const REFUGE = P(-3200, 3000); // refuge au pied du vallon (~600 m)
const CHAMP_BALLONS = P(2480, -1140); // pré d'envol des montgolfières, à l'est de Base Alpha (~155 m)
const MANOIR = P(BALLOONS_CENTRE1().x, BALLOONS_CENTRE1().z); // manoir du comte, sous le cercle de la montgolfière n°1 (~225 m)
const TOURNESOLS = P(2800, -5800); // ferme des Tournesols, entre Alpha et le Lac (~275 m)
function BALLOONS_CENTRE1() { return { x: -7037, z: -6003 }; }

export default [
  // ===================== École de pilotage (petite chaîne) =====================
  {
    id: 'centre-ecole-tour-de-piste', title: 'Leçon 1 : le tour de piste', category: 'defi', airport: 'alpha',
    desc: 'Monique, ta monitrice, est intransigeante : un tour de piste par les 2 anneaux, un toucher-décoller, '
      + 'un palier entre 450 et 600 m d\'altitude pendant 20 s, puis un atterrissage complet à Base Alpha.',
    reward: 300,
    steps: [
      ring(nextTo(A('alpha'), 1000, 300), 250, { text: 'Vent arrière : passe l\'anneau, au nord de la piste et parallèle à elle' }),
      ring(nextTo(A('alpha'), 700, -2300), 150, { text: 'Étape de base : passe l\'anneau, puis fais demi-tour pour t\'aligner sur la piste' }),
      touch('alpha', { text: 'Toucher-décoller à Base Alpha : les roues touchent, plein gaz, on repart !' }),
      { type: 'hold', min: 450, max: 600, duration: 20, text: 'Palier : tiens ton altitude entre 450 et 600 m pendant 20 s (le trim est ton ami)' },
      land('alpha', { text: 'Atterrissage complet à Base Alpha. Monique prend des notes…' }),
    ],
  },
  {
    id: 'centre-ecole-examen', title: 'Examen : la piste courte', category: 'defi', airport: 'alpha',
    requires: 'centre-ecole-tour-de-piste',
    desc: 'Le jour de l\'examen ! Toucher-décoller sur l\'herbe de Lac Miroir, palier entre 600 et 750 m pendant 30 s, '
      + 'passage bas à moins de 50 m du sol près de la piste pendant 8 s, puis pose-toi là-bas.',
    reward: 600,
    steps: [
      touch('lac', { text: 'Toucher-décoller sur la piste en herbe de Lac Miroir (950 m seulement !)' }),
      { type: 'hold', min: 600, max: 750, duration: 30, text: 'Palier : entre 600 et 750 m pendant 30 s. L\'examinateur chronomètre.' },
      {
        type: 'low', maxAgl: 50, duration: 8, x: A('lac').x, z: A('lac').z, radius: 700,
        text: 'Passage bas le long de la piste de Lac Miroir : moins de 50 m du sol pendant 8 s',
      },
      land('lac', { text: 'Atterrissage de précision sur la piste courte de Lac Miroir. Diplôme en vue !' }),
    ],
  },

  // ===================== La tournée de Gaston (chaîne de 3 quêtes, suite de « Courrier pour la Capitale ») =====================
  {
    id: 'centre-facteur-tournee', title: 'La tournée de Gaston', category: 'livraison', airport: 'alpha',
    requires: 'courrier',
    desc: 'Gaston le facteur est guéri mais il a le vertige. Largue (X) le courrier sur la ferme des Durand puis au '
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
      + 'puis file te poser à Capitale International. Gaston a promis : 11 minutes, pas une de plus.',
    reward: 750, timeLimit: 660,
    steps: [
      drop(alphaVille, 200, 'Mairie d\'Alpha-Ville', { maxAgl: 150, spawn: 'flag' }),
      land('capitale', { text: 'Pose-toi à Capitale International avant la fin du chrono' }),
    ],
  },
  {
    id: 'centre-facteur-fantome', title: 'Une lettre pour le fantôme', category: 'exploration', airport: 'capitale',
    requires: 'centre-facteur-recommande', minRank: 1,
    desc: 'Une lettre « au Fantôme, Château des Brumes » ! Prends Gaston à Base Alpha, survole le château (< 300 m du sol), '
      + 'reste 40 s à moins de 800 m de la montgolfière qui s\'enfuit, largue la lettre sur le manoir (< 150 m) et rentre.',
    reward: 1500,
    steps: [
      land('alpha', { text: 'Passe prendre Gaston à Base Alpha (et fais le plein avec K, ça va grimper !)' }),
      reach(L('chateau'), 250, 'Château des Brumes (2 520 m)', {
        maxAgl: 300, spawn: 'flag', text: 'Monte au Château des Brumes, perché à 2 520 m, et survole-le à moins de 300 m du sol. Il y a quelqu\'un ?',
      }),
      {
        type: 'follow', balloon: 1, distance: 800, duration: 40, label: 'le « fantôme » en montgolfière',
        text: 'Un drap blanc s\'enfuit… en montgolfière, à l\'est vers 1 000 m ! Vole vers 1 200 m (le relief monte au sud) et reste à moins de 800 m de lui pendant 40 s',
      },
      drop(MANOIR, 150, 'Manoir du comte Aldebert', {
        maxAgl: 150, spawn: 'flag',
        text: 'Le « fantôme », c\'est le vieux comte Aldebert ! Largue la lettre (X) sur son manoir, au centre du cercle de son ballon, à moins de 150 m du sol',
      }),
      land('alpha', { text: 'Ramène Gaston à Base Alpha : il n\'a jamais eu une tournée pareille !' }),
    ],
  },

  // ===================== Capitale =====================
  {
    id: 'centre-bapteme', title: 'Le baptême de Mamie Josette', category: 'tourisme', airport: 'capitale',
    desc: 'Mamie Josette fête ses 90 ans avec son premier vol ! Palier tout en douceur entre 500 et 650 m pendant 20 s, '
      + 'tour de la Capitale par les 6 anneaux, survol des gratte-ciel, puis retour à l\'aéroport.',
    reward: 450,
    steps: [
      { type: 'hold', min: 500, max: 650, duration: 20, text: 'Tout en douceur : tiens-toi entre 500 et 650 m pendant 20 s' },
      ...ringsAround(capitale.x, capitale.z, 1500, 6, 220, Math.PI),
      ring(capitale, 380, { size: 40, text: 'Survol des gratte-ciel (ils montent jusqu\'à 270 m !)' }),
      land('capitale', { text: 'Pose-toi en douceur à Capitale International. Mamie applaudit !' }),
    ],
  },
  {
    id: 'centre-ils', title: 'Calibrage de l\'ILS', category: 'defi', airport: 'capitale', minRank: 1,
    desc: 'Mme Bertillon, de l\'aviation civile, calibre l\'ILS : suis la pente de 3° par les 4 anneaux jusqu\'à la piste 16, '
      + 'toucher-décoller, puis même chose face à la piste 34 et pose-toi. Les anneaux ne pardonnent pas !',
    reward: 900,
    steps: [
      ringAlt(seuil(CAP, -1, 6000), pente3(CAP, 6000), {
        text: 'Début de l\'approche, à 6 km au nord-nord-ouest de la piste : passe l\'anneau en te dirigeant vers la piste',
      }),
      ringAlt(seuil(CAP, -1, 4500), pente3(CAP, 4500), { text: 'Pente de 3° : anneau à 4,5 km du seuil, reste bien dans l\'axe' }),
      ringAlt(seuil(CAP, -1, 3000), pente3(CAP, 3000), { text: 'Anneau à 3 km du seuil : réduis un peu les gaz, sors le train (G)' }),
      ringAlt(seuil(CAP, -1, 1500), pente3(CAP, 1500), { text: 'Dernier anneau à 1,5 km : stabilisé, train sorti ?' }),
      touch('capitale', { text: 'Toucher-décoller sur la piste 16 de la Capitale' }),
      ringAlt(seuil(CAP, 1, 6000, 2000), 700, {
        text: 'Remise des gaz : continue vers le sud-sud-est et passe l\'anneau à 700 m, à l\'écart de l\'axe',
      }),
      ringAlt(seuil(CAP, 1, 4500), pente3(CAP, 4500), { text: 'Fais demi-tour et intercepte l\'axe de la piste 34 : anneau à 4,5 km du seuil' }),
      ringAlt(seuil(CAP, 1, 3000), pente3(CAP, 3000), { text: 'Pente de 3° : anneau à 3 km du seuil' }),
      ringAlt(seuil(CAP, 1, 1500), pente3(CAP, 1500), { text: 'Dernier anneau à 1,5 km : train sorti, volets si besoin' }),
      land('capitale', { text: 'Pose-toi sur la piste 34 : Mme Bertillon signe le certificat !' }),
    ],
  },
  {
    id: 'centre-banderole', title: 'Les crêpes d\'Yvonne', category: 'tourisme', airport: 'alpha',
    desc: '« Mangez des crêpes chez Yvonne ! » Promène sa banderole à moins de 150 m du sol au-dessus d\'Alpha-Ville (20 s), '
      + 'puis au-dessus du pré de la fête des montgolfières (15 s), et reviens te poser à Base Alpha.',
    reward: 400,
    steps: [
      {
        type: 'low', maxAgl: 150, duration: 20, x: alphaVille.x, z: alphaVille.z, radius: 1000, label: 'au-dessus d\'Alpha-Ville',
        text: 'Promène la banderole au-dessus d\'Alpha-Ville : moins de 150 m du sol pendant 20 s',
      },
      {
        type: 'low', maxAgl: 150, duration: 15, x: CHAMP_BALLONS.x, z: CHAMP_BALLONS.z, radius: 700, label: 'au-dessus du pré d\'envol',
        text: 'Toute la foule de la fête des montgolfières est au pré d\'envol, à l\'est : moins de 150 m du sol pendant 15 s',
      },
      land('alpha', { text: 'Pose-toi à Base Alpha : Yvonne t\'offre une crêpe au caramel beurre salé' }),
    ],
  },
  {
    id: 'centre-pizza', title: 'Pizza express', category: 'livraison', airport: 'alpha',
    desc: 'Luigi d\'Alpha-Ville livre par avion ! Largue les pizzas aux techniciens de la Tour Radio puis aux ouvriers '
      + 'du parc éolien (moins de 150 m du sol), et pose-toi à la Capitale. Elles doivent arriver chaudes : 8 min !',
    reward: 600, timeLimit: 480, bonusTime: 360, bonusReward: 150,
    steps: [
      drop(TECHNICIENS, 150, 'Techniciens de la Tour Radio', {
        maxAgl: 150, spawn: 'crate', text: 'Largue les pizzas (X) à la cabane des techniciens, au pied de la colline de la Tour Radio (moins de 150 m du sol)',
      }),
      drop(CHANTIER, 150, 'Chantier du parc éolien', {
        maxAgl: 150, spawn: 'crate', text: 'Largue les pizzas (X) aux ouvriers du chantier, au bout de la rangée d\'éoliennes (moins de 150 m du sol)',
      }),
      land('capitale', { text: 'Pose-toi à Capitale International : la dernière pizza est pour la tour de contrôle' }),
    ],
  },
  {
    id: 'centre-coeur', title: 'Un cœur dans le ciel', category: 'voltige', airport: 'alpha', minRank: 1,
    desc: 'Théo, le mécano, veut demander Juliette en mariage ! Dessine un cœur de 10 anneaux à 600 m au-dessus de sa ferme, '
      + 'largue la bague (X, à moins de 120 m du sol), fête le « oui » 5 s sur le dos et pose-toi à Base Alpha.',
    reward: 750,
    steps: [
      ...coeur(TOURNESOLS, 80, 10, 600).map((r, i) => ({
        ...r,
        text: i === 0 ? 'Le cœur commence en haut, au creux des deux lobes : passe l\'anneau (600 m) puis enchaîne vers l\'est'
          : i === 5 ? 'La pointe du cœur ! Vire serré pour remonter de l\'autre côté'
            : i === 10 ? 'Referme le cœur : dernier anneau' : 'Dessine le cœur : passe l\'anneau',
      })),
      drop(P(TOURNESOLS.x, TOURNESOLS.z + 320), 120, 'Juliette, à la ferme des Tournesols', {
        maxAgl: 120, spawn: 'flag', text: 'Juliette regarde le ciel : largue la bague (X) avec son petit parachute, à moins de 120 m du sol',
      }),
      { type: 'inverted', duration: 5, text: 'Elle a dit OUI ! Fête ça : 5 s sur le dos' },
      land('alpha', { text: 'Ramène Théo à Base Alpha, il a un mariage à préparer' }),
    ],
  },

  // ===================== Quêtes trouvées sur le terrain =====================
  {
    id: 'centre-montgolfieres', title: 'La fête des montgolfières', category: 'tourisme', giver: CHAMP_BALLONS,
    desc: 'Léon organise la fête des montgolfières ! Escorte son ballon 40 s (à moins de 700 m), puis 40 s le baron égaré '
      + 'vers 2 000 m parmi les sommets (à moins de 600 m), et largue le champagne (X) sur le pré, à moins de 150 m du sol.',
    reward: 700,
    steps: [
      {
        type: 'follow', balloon: 2, distance: 700, duration: 40, label: 'la montgolfière de Léon',
        text: 'Escorte Léon : reste à moins de 700 m de sa montgolfière (vers 850 m) pendant 40 s',
      },
      {
        type: 'follow', balloon: 5, distance: 600, duration: 40, label: 'la montgolfière du baron',
        text: 'Le baron s\'est égaré au sud, vers 2 050 m, entre des sommets de 2 100 m ! Vole vers 2 300 m et reste à moins de 600 m de lui pendant 40 s',
      },
      drop(CHAMP_BALLONS, 150, 'pré d\'envol', {
        maxAgl: 150, spawn: 'tent', text: 'Tout le monde est rentré : largue le champagne (X) sur le pré d\'envol, à moins de 150 m du sol. Santé !',
      }),
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
        text: 'Révérence : passe à moins de 60 m du sol près du Colosse pendant 8 s (plutôt à l\'est, le relief monte au nord-ouest)',
      },
    ],
  },
  {
    id: 'centre-randonneur', title: 'Perdu dans le Val Perdu', category: 'sauvetage', giver: REFUGE, minRank: 1,
    desc: 'Le gardien du refuge s\'inquiète : un randonneur est coincé dans le haut vallon (1 550 m). Repère sa fumée '
      + '(moins de 400 m du sol), largue-lui la trousse de secours (moins de 250 m du sol) et préviens Base Alpha.',
    reward: 750,
    steps: [
      reach(VAL_PERDU, 400, 'fumée dans le Val Perdu', {
        maxAgl: 400, spawn: 'smoke',
        text: 'Grimpe vers 1 900 m, puis entre dans le vallon par l\'est et repère la fumée (moins de 400 m du sol)',
      }),
      drop(VAL_PERDU, 200, 'le randonneur', {
        maxAgl: 250, spawn: 'hiker',
        text: 'Largue la trousse (X) près du randonneur, à moins de 250 m du sol, puis vire aussitôt vers le sud-est : le vallon est bouché à l\'ouest !',
      }),
      land('alpha', { text: 'Pose-toi à Base Alpha pour prévenir les secours en montagne' }),
    ],
  },
];
