// Quêtes de la région : centre (Base Alpha, Capitale, Lac Miroir, Tour Radio, Grand Stade, Colosse, Château)
import {
  A, L, city, nextTo, stage, land, touch, reach, drop, ring, ringAlt, ringsAround, windTurbines, AIRPORTS, CITIES, BALLOONS, dist,
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
// manoir du comte, au centre du cercle que décrit la montgolfière n°1 (≈ -7037, -6003 ; ~225 m)
const MANOIR = P(Math.round(BALLOONS[1].x), Math.round(BALLOONS[1].z));
const TOURNESOLS = P(2800, -5800); // ferme des Tournesols, entre Alpha et le Lac (~275 m)

export default [
  // ===================== École de pilotage (petite chaîne) =====================
  {
    id: 'centre-ecole-tour-de-piste', title: 'Leçon 1 : le tour de piste', category: 'defi', airport: 'alpha',
    desc: 'Monique, ta monitrice, te fait faire ton premier tour de piste : monte par l\'anneau, boucle le circuit '
      + 'jusqu\'au toucher-décoller, tiens un palier entre 450 et 600 m pendant 20 s, puis atterris à Base Alpha.',
    reward: 350,
    // Circuit côté nord (la seule éolienne visible du parc voisin est dans l'axe, au-delà du seuil est) :
    // montée vers l'anneau 1 au nord-est, vent arrière vers l'ouest, étape de base, finale face à l'est.
    // L'anneau 1 est à 2 km de la piste : on l'atteint en montant, qu'on ait décollé vers l'est ou vers l'ouest.
    steps: [
      ...stage('Décoller et monter',
        ring(nextTo(A('alpha'), 900, 2000), 250, {
          text: 'Montée : grimpe à 250 m au-dessus du sol et passe l\'anneau, au nord-est de la piste (si tu as décollé vers l\'ouest, fais demi-tour par la droite)',
        })),
      ...stage('Boucler le tour de piste',
        ring(nextTo(A('alpha'), 700, -2300), 150, {
          text: 'Vent arrière vers l\'ouest, côté nord de la piste, puis étape de base : passe l\'anneau, vire à gauche face à l\'est et vérifie que le train est sorti (G)',
        }),
        touch('alpha', { text: 'Toucher-décoller à Base Alpha : les roues touchent, plein gaz, on repart !' })),
      ...stage('Tenir le palier',
        { type: 'hold', min: 450, max: 600, duration: 20, text: 'Monique veut voir un palier : tiens ton altitude entre 450 et 600 m pendant 20 s (le trim est ton ami)' }),
      ...stage('Atterrir à Base Alpha',
        land('alpha', { text: 'Atterrissage complet à Base Alpha. Monique prend des notes…' })),
    ],
  },
  {
    id: 'centre-ecole-examen', title: 'Examen : la piste courte', category: 'defi', airport: 'alpha',
    requires: 'centre-ecole-tour-de-piste',
    desc: 'Le jour de l\'examen ! L\'examinateur t\'attend à Lac Miroir : toucher-décoller sur sa piste en herbe, palier '
      + 'entre 600 et 750 m (30 s), passage bas le long de la piste (< 50 m, 8 s), puis atterrissage de précision.',
    reward: 600,
    steps: [
      ...stage('Toucher la piste de Lac Miroir',
        touch('lac', { text: 'Rejoins Lac Miroir, au nord, et fais un toucher-décoller sur sa piste en herbe (950 m seulement !)' })),
      ...stage('Tenir le palier d\'examen',
        { type: 'hold', min: 600, max: 750, duration: 30, text: 'Palier : entre 600 et 750 m pendant 30 s. L\'examinateur chronomètre.' }),
      ...stage('Passage bas devant le jury',
        {
          type: 'low', maxAgl: 50, duration: 8, x: A('lac').x, z: A('lac').z, radius: 700,
          text: 'Le jury est au bord de la piste : passe le long de la piste de Lac Miroir à moins de 50 m du sol pendant 8 s',
        }),
      ...stage('Se poser sur la piste courte',
        land('lac', { text: 'Atterrissage de précision sur la piste courte de Lac Miroir. Diplôme en vue !' })),
    ],
  },

  // ===================== La tournée de Gaston (chaîne de 3 quêtes, suite de « Courrier pour la Capitale ») =====================
  {
    id: 'centre-facteur-tournee', title: 'La tournée de Gaston', category: 'livraison', airport: 'alpha',
    requires: 'courrier',
    desc: 'Gaston le facteur est guéri mais il a le vertige : fais sa tournée par les airs ! Largue (X) le courrier sur la '
      + 'ferme des Durand, puis au camping des Pins (sous 150 m du sol), et rejoins Gaston à la poste de Lac Miroir.',
    reward: 480,
    steps: [
      ...stage('Livrer la ferme des Durand',
        drop(FERME, 150, 'Ferme des Durand', {
          maxAgl: 150, spawn: 'flag', text: 'Premier arrêt, au nord de Base Alpha : largue le courrier (X) sur la ferme des Durand, à moins de 150 m du sol',
        })),
      ...stage('Livrer le camping des Pins',
        drop(CAMPING, 150, 'Camping des Pins', {
          maxAgl: 150, spawn: 'tent', text: 'Les vacanciers attendent leurs cartes postales : largue le sac (X) sur le camping des Pins, près du Lac Miroir',
        })),
      ...stage('Rejoindre la poste du Lac',
        land('lac', { text: 'Pose-toi à Lac Miroir : Gaston t\'attend au bureau de poste' })),
    ],
  },
  {
    id: 'centre-facteur-recommande', title: 'Recommandé express', category: 'livraison', airport: 'lac',
    requires: 'centre-facteur-tournee',
    desc: 'Un recommandé urgent pour le maire d\'Alpha-Ville ! Fonce vers le sud par les anneaux, largue-le sur la mairie '
      + '(sous 150 m du sol), puis porte l\'accusé de réception à Capitale International. 11 minutes, pas une de plus.',
    reward: 800, timeLimit: 660,
    steps: [
      ...stage('Foncer vers Alpha-Ville',
        ring(P(1500, -9000), 150, { text: 'Gaston a tracé la route la plus courte : cap au sud, passe l\'anneau' }),
        ring(P(700, -6000), 150, { text: 'Continue tout droit vers Alpha-Ville, la mairie est au centre-ville' })),
      ...stage('Remettre le recommandé au maire',
        drop(alphaVille, 200, 'Mairie d\'Alpha-Ville', {
          maxAgl: 150, spawn: 'flag', text: 'Largue le recommandé (X) sur la mairie d\'Alpha-Ville, à moins de 150 m du sol : le maire signe l\'accusé',
        })),
      ...stage('Porter l\'accusé à la Capitale',
        land('capitale', { text: 'L\'accusé de réception part à la Capitale : pose-toi à Capitale International avant la fin du chrono' })),
    ],
  },
  {
    id: 'centre-facteur-fantome', title: 'Une lettre pour le fantôme', category: 'exploration', airport: 'capitale',
    requires: 'centre-facteur-recommande', minRank: 1,
    desc: 'Une lettre « au Fantôme, Château des Brumes » ! Prends Gaston à Base Alpha, cherche le fantôme au château, '
      + 'suis la montgolfière qui s\'enfuit, largue la lettre sur le manoir de son pilote et ramène Gaston.',
    reward: 1500,
    steps: [
      ...stage('Embarquer Gaston à Base Alpha',
        land('alpha', {
          text: 'Passe prendre Gaston à Base Alpha : il a le vertige, mais la curiosité est plus forte ! (Coupe le moteur et fais le plein avec K : ça va grimper.)',
        })),
      ...stage('Chercher le fantôme au château',
        reach(L('chateau'), 250, 'Château des Brumes (2 520 m)', {
          maxAgl: 300, spawn: 'flag',
          text: 'Grimpe en spirale au-dessus de la plaine jusqu\'à 2 700 m avant de filer vers l\'ouest (gros relief dès 4 km), '
            + 'puis survole le Château des Brumes (2 520 m) à moins de 300 m du sol. Il y a quelqu\'un ?',
        })),
      ...stage('Remettre la lettre au fantôme',
        {
          type: 'follow', balloon: 1, distance: 800, duration: 40, label: 'le « fantôme » en montgolfière',
          text: 'Un drap blanc s\'enfuit… en montgolfière, à l\'est vers 1 000 m ! Reste au-dessus de lui, vers 1 200 m (le relief monte au sud), à moins de 800 m pendant 40 s',
        },
        drop(MANOIR, 150, 'Manoir du comte Aldebert', {
          maxAgl: 150, spawn: 'flag',
          text: 'Le « fantôme », c\'est le vieux comte Aldebert ! Largue la lettre (X) sur son manoir, au centre du cercle de son ballon, à moins de 150 m du sol',
        })),
      ...stage('Ramener Gaston à Base Alpha',
        land('alpha', { text: 'Ramène Gaston à Base Alpha (remonte un peu : collines de 500 m sur la route). Il n\'a jamais eu une tournée pareille !' })),
    ],
  },

  // ===================== Capitale =====================
  {
    id: 'centre-bapteme', title: 'Le baptême de Mamie Josette', category: 'tourisme', airport: 'capitale',
    desc: 'Mamie Josette fête ses 90 ans avec son premier vol ! Rassure-la par un palier tout doux (500-650 m, 20 s), '
      + 'fais-lui le tour de la Capitale par les 6 anneaux, montre-lui les gratte-ciel, puis pose-toi en douceur.',
    reward: 450,
    steps: [
      ...stage('Rassurer Mamie Josette',
        { type: 'hold', min: 500, max: 650, duration: 20, text: 'Mamie serre ton bras : tiens-toi tout en douceur entre 500 et 650 m pendant 20 s' }),
      // anneaux à 280 m du sol (≈ 520-550 m) : à 1 500 m du centre, les immeubles ne dépassent pas 15 m,
      // et il ne reste qu'une centaine de mètres à monter vers l'anneau des gratte-ciel (≈ 650 m)
      ...stage('Faire le tour de la Capitale',
        ringsAround(capitale.x, capitale.z, 1500, 6, 280, Math.PI).map((r) => ({ ...r, text: 'Tour de la Capitale : passe l\'anneau, Mamie cherche sa maison' }))),
      ...stage('Survoler les gratte-ciel',
        ring(capitale, 380, { size: 40, text: 'Survol des gratte-ciel (ils montent jusqu\'à 270 m !) : remonte doucement vers 650 m' })),
      ...stage('Se poser en douceur',
        land('capitale', { text: 'Pose-toi en douceur à Capitale International. Mamie applaudit !' })),
    ],
  },
  {
    id: 'centre-ils', title: 'Calibrage de l\'ILS', category: 'defi', airport: 'capitale', minRank: 1,
    desc: 'Mme Bertillon, de l\'aviation civile, calibre l\'ILS : suis la pente de 3° par les anneaux jusqu\'à la piste 16, '
      + 'toucher-décoller, remise des gaz au sud-est, puis même approche face à la piste 34 et pose-toi.',
    reward: 1000,
    steps: [
      ...stage('Approche ILS de la piste 16',
        ringAlt(seuil(CAP, -1, 6000), pente3(CAP, 6000), {
          text: 'Début de l\'approche, à 6 km au nord-nord-ouest de la piste : passe l\'anneau en te dirigeant vers la piste',
        }),
        ringAlt(seuil(CAP, -1, 4500), pente3(CAP, 4500), { text: 'Pente de 3° : anneau à 4,5 km du seuil, reste bien dans l\'axe' }),
        ringAlt(seuil(CAP, -1, 3000), pente3(CAP, 3000), { text: 'Anneau à 3 km du seuil : réduis un peu les gaz, sors le train (G)' }),
        ringAlt(seuil(CAP, -1, 1500), pente3(CAP, 1500), { text: 'Dernier anneau à 1,5 km : stabilisé, train sorti ?' }),
        touch('capitale', { text: 'Toucher-décoller sur la piste 16 de la Capitale : Mme Bertillon note la mesure' })),
      ...stage('Remettre les gaz',
        ringAlt(seuil(CAP, 1, 6000, 2000), 700, {
          text: 'Remise des gaz : continue vers le sud-est en montant et passe l\'anneau à 700 m, à l\'écart de l\'axe',
        })),
      ...stage('Approche ILS de la piste 34',
        ringAlt(seuil(CAP, 1, 4500), pente3(CAP, 4500), { text: 'Fais demi-tour et intercepte l\'axe de la piste 34 : anneau à 4,5 km du seuil' }),
        ringAlt(seuil(CAP, 1, 3000), pente3(CAP, 3000), { text: 'Pente de 3° : anneau à 3 km du seuil' }),
        ringAlt(seuil(CAP, 1, 1500), pente3(CAP, 1500), { text: 'Dernier anneau à 1,5 km : train sorti, volets si besoin' })),
      ...stage('Se poser sur la piste 34',
        land('capitale', { text: 'Pose-toi sur la piste 34 : Mme Bertillon signe le certificat !' })),
    ],
  },
  {
    id: 'centre-banderole', title: 'Les crêpes d\'Yvonne', category: 'tourisme', airport: 'alpha',
    desc: '« Mangez des crêpes chez Yvonne ! » Promène sa banderole à moins de 150 m du sol au-dessus d\'Alpha-Ville (20 s), '
      + 'puis au-dessus de la foule du pré des montgolfières (15 s), et rapporte-la à Base Alpha.',
    reward: 400,
    steps: [
      ...stage('Survoler Alpha-Ville',
        {
          type: 'low', maxAgl: 150, duration: 20, x: alphaVille.x, z: alphaVille.z, radius: 1000, label: 'au-dessus d\'Alpha-Ville',
          text: 'Promène la banderole au-dessus d\'Alpha-Ville, juste au sud de la piste : moins de 150 m du sol pendant 20 s',
        }),
      ...stage('Survoler la fête des ballons',
        {
          type: 'low', maxAgl: 150, duration: 15, x: CHAMP_BALLONS.x, z: CHAMP_BALLONS.z, radius: 700, label: 'au-dessus du pré d\'envol',
          text: 'Toute la foule de la fête des montgolfières est au pré d\'envol, à l\'est de Base Alpha : moins de 150 m du sol pendant 15 s',
        }),
      ...stage('Rapporter la banderole',
        land('alpha', { text: 'Pose-toi à Base Alpha : Yvonne t\'offre une crêpe au caramel beurre salé' })),
    ],
  },
  {
    id: 'centre-pizza', title: 'Pizza express', category: 'livraison', airport: 'alpha',
    desc: 'Luigi d\'Alpha-Ville livre par avion ! Largue les pizzas aux techniciens de la Tour Radio, puis aux ouvriers '
      + 'du parc éolien (sous 150 m du sol), et porte la dernière à la Capitale. Elles doivent arriver chaudes : 8 min !',
    reward: 600, timeLimit: 480, bonusTime: 360, bonusReward: 150,
    steps: [
      ...stage('Livrer la Tour Radio',
        drop(TECHNICIENS, 150, 'Techniciens de la Tour Radio', {
          maxAgl: 150, spawn: 'crate', text: 'Largue les pizzas (X) à la cabane des techniciens, au pied de la colline de la Tour Radio (moins de 150 m du sol)',
        })),
      ...stage('Livrer le chantier éolien',
        drop(CHANTIER, 150, 'Chantier du parc éolien', {
          maxAgl: 150, spawn: 'crate', text: 'Largue les pizzas (X) aux ouvriers du chantier, au bout de la rangée d\'éoliennes (moins de 150 m du sol)',
        })),
      ...stage('Dernière pizza à la Capitale',
        land('capitale', { text: 'Pose-toi à Capitale International : la dernière pizza est pour la tour de contrôle' })),
    ],
  },
  {
    id: 'centre-coeur', title: 'Un cœur dans le ciel', category: 'voltige', airport: 'alpha', minRank: 1,
    desc: 'Théo, le mécano, veut demander Juliette en mariage ! Dessine un cœur de 11 anneaux à 600 m au-dessus '
      + 'de sa ferme, largue la bague (X, sous 120 m du sol), fête le « oui » 5 s sur le dos et ramène Théo à Base Alpha.',
    reward: 850,
    steps: [
      // cœur de 3,8 km de large : la pointe (virage de 116°) se prend sur un cercle de ~430 m de rayon,
      // soit 45° d'inclinaison plein gaz (≈ 220 km/h) ; les lobes ne demandent que 30-35°
      ...stage('Dessiner le cœur',
        coeur(TOURNESOLS, 120, 10, 600).map((r, i) => ({
          ...r,
          text: i === 0 ? 'Juliette habite la ferme des Tournesols, au nord : le cœur commence en haut, au creux des deux lobes (600 m), puis enchaîne vers l\'est'
            : i === 5 ? 'La pointe du cœur ! Vire serré pour remonter de l\'autre côté'
              : i === 10 ? 'Referme le cœur : dernier anneau' : 'Dessine le cœur : passe l\'anneau',
        }))),
      ...stage('Larguer la bague à Juliette',
        drop(P(TOURNESOLS.x, TOURNESOLS.z + 320), 120, 'Juliette, à la ferme des Tournesols', {
          maxAgl: 120, spawn: 'flag', text: 'Juliette regarde le ciel : largue la bague (X) avec son petit parachute, à moins de 120 m du sol',
        })),
      ...stage('Fêter le « oui »',
        { type: 'inverted', duration: 5, text: 'Elle a dit OUI ! Remonte à 300 m du sol puis fête ça : 5 s sur le dos (une fois retourné, pousse sur le manche)' }),
      ...stage('Ramener Théo à Base Alpha',
        land('alpha', { text: 'Ramène Théo à Base Alpha, il a un mariage à préparer' })),
    ],
  },

  // ===================== Quêtes trouvées sur le terrain =====================
  {
    id: 'centre-montgolfieres', title: 'La fête des montgolfières', category: 'tourisme', giver: CHAMP_BALLONS,
    desc: 'Léon organise la fête des montgolfières ! Escorte son ballon 40 s, puis va chercher le baron égaré vers 2 000 m '
      + 'parmi les sommets (40 s près de lui), et quand tout le monde est rentré, largue le champagne (X) sur le pré.',
    reward: 700,
    steps: [
      ...stage('Escorter le ballon de Léon',
        {
          type: 'follow', balloon: 2, distance: 700, duration: 40, label: 'la montgolfière de Léon',
          text: 'Escorte Léon : reste à moins de 700 m de sa montgolfière (vers 850 m) pendant 40 s',
        }),
      ...stage('Retrouver le baron égaré',
        {
          type: 'follow', balloon: 5, distance: 600, duration: 40, label: 'la montgolfière du baron',
          text: 'Le baron s\'est égaré au sud, vers 2 050 m, entre des sommets de 2 100 m ! Monte à 2 300 m et reste au-dessus de lui, à moins de 600 m, pendant 40 s pour le guider',
        }),
      ...stage('Trinquer au pré d\'envol',
        drop(CHAMP_BALLONS, 150, 'pré d\'envol', {
          maxAgl: 150, spawn: 'tent', text: 'Tout le monde est rentré : largue le champagne (X) sur le pré d\'envol, à moins de 150 m du sol. Santé !',
        })),
    ],
  },
  {
    id: 'centre-colosse-salut', title: 'Le salut au Colosse', category: 'voltige',
    giver: P(-6700, 6750), minRank: 1,
    desc: 'Le gardien du Colosse exige du respect : fais d\'abord le tour de la statue par les 5 anneaux, salue-la 6 s '
      + 'sur le dos, puis tire ta révérence en passant à moins de 60 m du sol près d\'elle pendant 8 s.',
    reward: 500,
    steps: [
      ...stage('Faire le tour du Colosse',
        ringsAround(L('colosse').x, L('colosse').z, 450, 5, 120, Math.PI / 2).map((r) => ({ ...r, text: 'Tour d\'honneur autour du Colosse : passe l\'anneau' }))),
      ...stage('Saluer sur le dos',
        { type: 'inverted', duration: 6, text: 'Salue le Colosse : prends d\'abord de la hauteur, puis vole 6 s sur le dos (pousse sur le manche pour tenir)' }),
      ...stage('Tirer ta révérence',
        {
          type: 'low', maxAgl: 60, duration: 8, x: L('colosse').x, z: L('colosse').z, radius: 700,
          text: 'Révérence : passe à moins de 60 m du sol près du Colosse pendant 8 s (plutôt à l\'est, le relief monte au nord-ouest)',
        }),
    ],
  },
  {
    id: 'centre-randonneur', title: 'Perdu dans le Val Perdu', category: 'sauvetage', giver: REFUGE, minRank: 1,
    desc: 'Le gardien du refuge s\'inquiète : un randonneur est coincé dans le haut vallon (1 550 m). Repère sa fumée '
      + '(sous 400 m du sol), largue-lui la trousse de secours (sous 250 m du sol), puis va prévenir Base Alpha.',
    reward: 750,
    steps: [
      ...stage('Repérer le randonneur',
        reach(VAL_PERDU, 400, 'fumée dans le Val Perdu', {
          maxAgl: 400, spawn: 'smoke',
          text: 'Grimpe vers 1 800 m en tournant au-dessus de la plaine, puis entre dans le vallon par l\'est et repère la fumée (moins de 400 m du sol)',
        })),
      ...stage('Larguer la trousse de secours',
        drop(VAL_PERDU, 200, 'le randonneur', {
          maxAgl: 250, spawn: 'hiker',
          text: 'Largue la trousse (X) près du randonneur, à moins de 250 m du sol (vers 1 750 m), puis vire aussitôt vers le sud-est : le vallon est bouché à l\'ouest !',
        })),
      ...stage('Prévenir Base Alpha',
        land('alpha', {
          text: 'Ressors du vallon par l\'est avant de mettre le cap sur Base Alpha (une crête de 2 250 m barre la route directe), et pose-toi pour prévenir les secours',
        })),
    ],
  },
];
