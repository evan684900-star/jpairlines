// Défis transverses sur toute la carte : la Coupe des Quatre Vents (championnat en 4 manches),
// records (altitude, traversée ouest-est, tour des phares), course des ballons, grand sauvetage en mer,
// rase-vagues, marathon de toucher-décoller et « 8 » de voltige autour du volcan.
// Faisabilité vérifiée avec le modèle de vol type Cessna 172 (plane.js) : montée ≈ 4,5 m/s en bas,
// 1,5 m/s vers 4 500 m (meilleur taux vers 110 km/h) ; croisière ≈ 53 m/s, plein gaz ≈ 62 m/s ;
// un piqué de 1 500 m à 310 km/h ne coûte qu'environ 300 m ; autonomie ≈ 200 km.
import {
  A, L, VOLCANO, stage, land, touch, reach, drop, ring, ringAlt, ringsAround, slalom,
} from './kit.js';

// ----- utilitaires locaux -----
const P = (x, z) => ({ x, z });
const hold = (min, max, duration, text) => ({ type: 'hold', min, max, duration, text });
const low = (maxAgl, duration, text, zone = {}) => ({ type: 'low', maxAgl, duration, text, ...zone });

// « 8 » couché sur la carte : deux boucles tangentes au point X (au nord de `c`), parcourues cap à l'est en X.
// Boucle A autour de c dans le sens des aiguilles d'une montre, boucle B (au nord) dans l'autre sens.
// `per` anneaux par boucle (X compris), à l'altitude absolue `alt`. Le point X est franchi trois fois.
function huit(c, radius, per, alt) {
  const out = [];
  const at = (cx, cz, deg) => {
    const t = (deg * Math.PI) / 180;
    return ringAlt(P(Math.round(cx + Math.cos(t) * radius), Math.round(cz + Math.sin(t) * radius)), alt);
  };
  const step = 360 / per;
  for (let k = 0; k < per; k++) out.push(at(c.x, c.z, -90 + k * step)); // X puis boucle A (angle croissant)
  for (let k = 0; k < per; k++) out.push(at(c.x, c.z - 2 * radius, 90 - k * step)); // X puis boucle B (angle décroissant)
  out.push(at(c.x, c.z, -90)); // retour en X
  return out;
}

// Arc d'anneaux autour d'un point c, de a0 à a1 degrés (0 = est, 90 = sud, 180 = ouest, 270 = nord)
function arc(c, radius, a0, a1, count, agl, extra = {}) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const t = ((a0 + ((a1 - a0) * i) / (count - 1)) * Math.PI) / 180;
    out.push(ring(P(c.x + Math.cos(t) * radius, c.z + Math.sin(t) * radius), agl, extra));
  }
  return out;
}

// ----- lieux -----
const PHARE_O = L('phare'), PHARE_N = L('phare-nord'), PHARE_S = L('phare-sud');
const PLAGE_FALAISES = P(-16600, -1100); // plage au nord de la piste des Falaises (~10 m), butte de 135 m à 400 m au sud
const BOUEE_FALAISES = P(-17900, -3300); // en mer, au large du bout de piste ouest
const CAMP_VOLCANO = P(24500, 10500); // camp des volcanologues, flanc nord de l'île (~260 m)
const PRE_BALLONS = P(22300, -2300); // pré d'envol des montgolfières, sur les hauteurs à l'ouest de Port-Levant (~270 m)
// Balises de la course des ballons : elles font contourner les reliefs (2 300 m entre Mirabelle et Cassis,
// colline de 1 000 m entre Cassis et Pistache) par la mer
const BALISE_1 = P(22500, -6500); // sur la côte, à l'ouest de Port-Levant (~85 m) ; collines de 850 m au sud-ouest de Mirabelle
const BALISE_2 = P(19500, -12000); // sur la côte (~105 m)
const BALISE_3 = P(10000, -15500); // au bord de la mer, au sud de la colline (~55 m)

// Grand sauvetage en mer du Nord-Est
const NAUFRAGE = P(28000, -19000); // dernière position connue du voilier Goéland
const ZONE_RECHERCHE = P(29500, -23000);
const RADEAU_1 = P(31000, -26500);
const RADEAU_2 = P(33000, -33500);

export default [
  // =====================================================================
  // La Coupe des Quatre Vents : championnat en 4 manches de difficulté croissante
  // =====================================================================
  {
    id: 'defi-champ-qualif', title: 'Coupe des Quatre Vents : qualifs', category: 'course', airport: 'nord',
    desc: 'Gégé, le commentateur, t\'a inscrit à la Coupe ! Pour te qualifier : slalom de 6 anneaux à 100 m du sol, '
      + 'toucher-décoller à Station Glacier, palier entre 400 et 550 m pendant 20 s, puis retour à Cap Nord.',
    // ~30 km : ~12 min à 190 km/h avec le toucher et l'atterrissage, ~11 min plein gaz
    reward: 850, bonusTime: 760, bonusReward: 150,
    steps: [
      ...stage('Slalom de qualification',
        slalom(7500, -22500, -500, -24500, 6, 250, 100).map((r, i) => (i === 0
          ? { ...r, text: 'Départ ! Slalom vers l\'ouest au-dessus de la plaine : anneaux à 100 m du sol, alternés à gauche et à droite' }
          : r))),
      ...stage('Toucher à Station Glacier',
        touch('glacier', { text: 'Toucher-décoller sur l\'herbe de Station Glacier : les roues touchent, plein gaz !' })),
      ...stage('Palier chronométré',
        hold(400, 550, 20, 'Palier de qualification : entre 400 et 550 m pendant 20 s. Gégé chronomètre…')),
      ...stage('Arrivée à Cap Nord',
        land('nord', { text: 'Retour à Cap Nord : pose-toi, les résultats tombent à l\'arrivée' })),
    ],
  },
  {
    id: 'defi-champ-precision', title: 'Coupe : l\'épreuve de précision', category: 'defi', airport: 'falaises',
    requires: 'defi-champ-qualif', minRank: 1,
    desc: 'Manche 2, la précision : palier entre 300 et 400 m (30 s), sacs de farine sur le fanion de la plage puis sur '
      + 'la bouée, figures devant la tribune (8 s sur le dos, passage à < 30 m sur la piste) et atterrissage.',
    reward: 700,
    steps: [
      ...stage('Palier au cordeau',
        hold(300, 400, 30, 'Palier au cordeau au-dessus de la mer : entre 300 et 400 m pendant 30 s, les juges ont des jumelles')),
      ...stage('Largages de précision',
        drop(PLAGE_FALAISES, 100, 'le fanion de la plage', {
          maxAgl: 100, spawn: 'flag',
          text: 'Largue le sac de farine (X) sur le fanion de la plage, à moins de 100 m du sol. Arrive en longeant la plage : une butte de 135 m se dresse juste au sud !',
        }),
        drop(BOUEE_FALAISES, 80, 'la bouée fumigène', {
          maxAgl: 80, spawn: 'smoke', text: 'Deuxième sac (X) sur la bouée fumigène au large : moins de 80 m au-dessus de l\'eau, et la cible est petite !',
        })),
      ...stage('Figures devant la tribune',
        { type: 'inverted', duration: 8, text: 'Figure imposée : remonte vers 300 m, puis 8 s sur le dos devant la tribune (pousse sur le manche)' },
        low(30, 8, 'Passage bas : moins de 30 m au-dessus de la piste des Falaises pendant 8 s', {
          x: A('falaises').x, z: A('falaises').z, radius: 900,
        })),
      ...stage('Atterrir aux Falaises',
        land('falaises', { text: 'Atterrissage de précision aux Falaises : la piste en herbe ne fait que 950 m' })),
    ],
  },
  {
    id: 'defi-champ-volcan', title: 'Coupe : Grand Prix du Volcan', category: 'course', airport: 'volcan',
    requires: 'defi-champ-precision', minRank: 2,
    timeLimit: 1000, bonusTime: 760, bonusReward: 300,
    desc: 'Manche 3, contre Hector, le triple champion : fais le tour de l\'île du Volcan par 10 anneaux à 55 m au-dessus '
      + 'des vagues, sprinte 20 s à moins de 30 m de l\'eau, puis pose-toi à Base du Volcan. 16 min 40 maximum !',
    reward: 1500,
    steps: [
      ...stage('Tour de l\'île du Volcan',
        ringsAround(VOLCANO.x, VOLCANO.z, 5500, 10, 55, (200 * Math.PI) / 180, { size: 35 }).map((r, i) => (i === 0
          ? { ...r, text: 'Départ ! Premier anneau au nord du détroit, puis tour de l\'île dans le sens des aiguilles d\'une montre' }
          : r))),
      ...stage('Sprint au ras des vagues',
        low(30, 20, 'Hector te talonne : moins de 30 m au-dessus de l\'eau pendant 20 s')),
      ...stage('Arrivée à Base du Volcan',
        land('volcan', { text: 'Pose-toi à Base du Volcan avant Hector !' })),
    ],
  },
  {
    id: 'defi-champ-finale', title: 'Coupe : la Grande Finale', category: 'defi', airport: 'capitale',
    requires: 'defi-champ-volcan', minRank: 3,
    timeLimit: 1740, bonusTime: 1300, bonusReward: 600,
    desc: 'Finale ! Parcours de vitesse (Tour Radio, slalom, toucher à Lac Miroir), programme de voltige (1 500 m, dos, '
      + 'piqué à 310 km/h, palier), ballon du match largué sur le Grand Stade, passage d\'honneur et posé. 29 min !',
    reward: 3200,
    // ~42 km : ~20 min pour un vol propre (dont ~4 min de montée à 1 500 m), d'où le bonus à 21 min 40
    steps: [
      ...stage('Parcours de vitesse',
        ringAlt(L('tour'), 1000, {
          size: 40,
          text: 'Ouverture : passe l\'anneau à 1 000 m au-dessus de la Tour Radio (750 m à monter : fais un tour au-dessus de l\'aéroport en grimpant)',
        }),
        slalom(4000, -1000, 4500, -9500, 7, 250, 70).map((r, i) => (i === 0
          ? { ...r, text: 'Redescends vers le nord : slalom de 7 anneaux à 70 m du sol jusqu\'à Lac Miroir' }
          : r)),
        touch('lac', { text: 'Toucher-décoller sur la piste en herbe de Lac Miroir' })),
      ...stage('Programme de voltige',
        { type: 'altitude', min: 1500, text: 'Remonte au-dessus de 1 500 m pour le programme de voltige (plein gaz vers 110-120 km/h : 4 à 5 min de montée)' },
        { type: 'inverted', duration: 12, text: 'Passage dos : 12 s sur le dos (pousse sur le manche), le public retient son souffle' },
        { type: 'speed', min: 310, text: 'Piqué ! Atteins 310 km/h (train rentré, G, sinon il sera arraché), puis ressource en douceur' },
        hold(700, 800, 20, 'Rétablis : palier entre 700 et 800 m pendant 20 s')),
      ...stage('Ballon du match au Grand Stade',
        drop(L('stade'), 120, 'le Grand Stade', {
          maxAgl: 150, spawn: 'flag', text: 'Le match de gala attend son ballon : largue-le (X) sur le Grand Stade, à moins de 150 m du sol',
        })),
      ...stage('Passage d\'honneur et posé',
        low(30, 10, 'Passage d\'honneur : moins de 30 m au-dessus de la piste de la Capitale pendant 10 s', {
          x: A('capitale').x, z: A('capitale').z, radius: 1400,
        }),
        land('capitale', { text: 'Pose-toi à Capitale International : l\'Hélice d\'Or est à toi, Hector te tire son chapeau !' })),
    ],
  },

  // =====================================================================
  // Records
  // =====================================================================
  {
    id: 'defi-record-altitude', title: 'Record d\'altitude', category: 'defi', airport: 'lac',
    minRank: 1,
    desc: 'Le record du club est de 4 500 m : bats-le ! Monte au-dessus de 4 600 m, tiens 4 200-4 400 m pendant 45 s '
      + 'pour l\'homologation, puis redescends par l\'anneau à 3 000 m au-dessus de la piste et pose-toi à Lac Miroir.',
    // montée de 204 à 4 600 m : ~20 min plein gaz au meilleur taux (110 km/h), ~24 min à 150 km/h ; puis ~6 min de descente
    reward: 1000,
    steps: [
      ...stage('Monter au-dessus de 4 600 m',
        {
          type: 'altitude', min: 4600,
          text: 'Monte au-dessus de 4 600 m en tournant au-dessus de la plaine : plein gaz, nez haut vers 110-120 km/h. Compte une vingtaine de minutes (5 m/s en bas, à peine 1,5 m/s là-haut) : pars le plein fait !',
        }),
      ...stage('Homologuer le record',
        hold(4200, 4400, 45, 'Homologation : redescends un peu et reste entre 4 200 et 4 400 m pendant 45 s')),
      ...stage('Redescendre sur Lac Miroir',
        ringAlt(A('lac'), 3000, { size: 60, text: 'Redescends vers Lac Miroir et passe l\'anneau à 3 000 m d\'altitude, à la verticale de la piste' }),
        land('lac', { text: 'Pose-toi à Lac Miroir : le record est homologué !' })),
    ],
  },
  {
    id: 'defi-traversee', title: 'La grande traversée', category: 'defi', airport: 'verte',
    // 85 km : ~31 min à 190 km/h escale comprise, ~27 min plein gaz sans traîner à l'escale
    minRank: 2, timeLimit: 2200, bonusTime: 1700, bonusReward: 500,
    desc: 'Traverse la carte d\'ouest en est : borne Ouest en mer et côte nord, escale obligatoire à Station Glacier '
      + '(arrête-toi sur la piste), Phare du Nord et borne Est, puis Port-Levant. 85 km en 36 min 40 maximum !',
    reward: 2300,
    steps: [
      ...stage('Borne Ouest et côte nord',
        ring(P(-27000, -24000), 80, { size: 50, text: 'Cap au nord-ouest, au-dessus de la mer : rejoins la borne Ouest, au large de la côte nord-ouest' }),
        ring(P(-20500, -24800), 80, { size: 40, text: 'Demi-tour vers l\'est : longe la côte nord' }),
        ring(P(-13000, -25500), 150, { size: 40, text: 'Passe l\'anneau au-dessus de la côte' })),
      ...stage('Escale à Station Glacier',
        land('glacier', { text: 'Escale technique à Station Glacier : arrête-toi sur la piste (un petit plein avec K, moteur coupé, ne fait pas de mal)' })),
      ...stage('Phare du Nord et borne Est',
        ring(P(4000, -28000), 150, { size: 40, text: 'Repars vers l\'est le long de la côte nord' }),
        ring(PHARE_N, 200, { size: 40, text: 'Salue le gardien : anneau au-dessus du Phare du Nord' }),
        ring(P(19000, -26000), 100, { size: 40, text: 'Toujours plein est, au-dessus de la mer' }),
        ring(P(26000, -25000), 80, { size: 50, text: 'Borne Est : tu as traversé la carte !' })),
      ...stage('Arrivée à Port-Levant',
        land('levant', { text: 'Pose-toi à Port-Levant pour arrêter le chrono' })),
    ],
  },
  {
    id: 'defi-tour-phares', title: 'Le tour des phares', category: 'defi', airport: 'corail',
    // 92 à 102 km selon la route (détour par la côte sud, puis col de Mont Givre ou montée à 2 700 m) :
    // ~35 min à 190 km/h, ~31 min plein gaz ; bonus à 32 min 30
    minRank: 1, bonusTime: 1950, bonusReward: 400,
    desc: 'Contourne les trois phares côté mer par 5 anneaux à 120 m : Phare du Sud, Phare de l\'Ouest, escale à Port '
      + 'Azur (arrête-toi sur la piste), Phare du Nord, puis pose-toi à Cap Nord. Près de 100 km : pars le plein fait !',
    reward: 2500,
    steps: [
      ...stage('Contourner le Phare du Sud',
        arc(PHARE_S, 600, 0, 180, 5, 120).map((r, i) => (i === 0
          ? { ...r, text: 'Phare du Sud : contourne-le côté mer par les 5 anneaux (la falaise monte juste derrière lui)' }
          : r))),
      ...stage('Contourner le Phare de l\'Ouest',
        reach(PHARE_O, 1500, 'Phare de l\'Ouest', {
          text: 'Cap au nord-ouest : rejoins le Phare de l\'Ouest en longeant la côte par l\'Oasis des Dunes (la route directe franchit des sommets de 2 500 m)',
        }),
        // arrivée par le sud-est : on enchaîne sud → ouest → nord du phare (45° par anneau, sans virage brutal)
        arc(PHARE_O, 600, 90, 270, 5, 120)),
      ...stage('Escale à Port Azur',
        land('azur', { text: 'Escale à Port Azur : arrête-toi sur la piste (refais le plein avec K, moteur coupé, si besoin)' })),
      ...stage('Phare du Nord et arrivée',
        arc(PHARE_N, 600, 225, 405, 5, 120).map((r, i) => (i === 0
          ? { ...r, text: 'Le Phare du Nord est à 44 km au nord-est, derrière un massif de 2 500 m : remonte la côte jusqu\'aux Falaises, passe le col de Mont Givre (900 m) et file par Lac Miroir, ou grimpe au-dessus de 2 700 m. Puis contourne le phare côté mer' }
          : r)),
        land('nord', { text: 'Pose-toi à Cap Nord : les trois gardiens te saluent !' })),
    ],
  },

  // =====================================================================
  // Escortes, sauvetage, rase-mottes, marathon
  // =====================================================================
  {
    id: 'defi-ballons', title: 'La course des ballons', category: 'tourisme', giver: PRE_BALLONS,
    // Ballons 10 et 3 : ce sont aussi la montgolfière de Paulette (est-eoliennes) et celle du guetteur des douanes
    // (est-contrebande) : les textes restent cohérents avec ces histoires.
    // ~35 km balises comprises : ~14 min à 190 km/h avec les trois escortes ; bonus à 16 min
    desc: 'Commissaire volant de la course des ballons : contrôle Mirabelle (40 s près d\'elle), vérifie les balises qui '
      + 'font contourner les reliefs en contrôlant Cassis puis Pistache, et fais ton rapport à Lac Miroir.',
    reward: 1000, bonusTime: 960, bonusReward: 200,
    steps: [
      ...stage('Contrôler Mirabelle',
        {
          type: 'follow', balloon: 10, distance: 500, duration: 40, label: 'la montgolfière Mirabelle',
          text: 'Mirabelle, le ballon de Paulette la météorologue, ouvre la course vers 750 m : reste à moins de 500 m d\'elle pendant 40 s',
        }),
      ...stage('Contrôler Cassis',
        ringAlt(BALISE_1, 900, {
          text: 'Les ballons contournent le massif (2 300 m) par la mer : vérifie la balise n° 1 à 900 m, à l\'ouest de Port-Levant (passe à l\'est des collines de 850 m)',
        }),
        ringAlt(BALISE_2, 700, { text: 'Longe la côte vers le nord-ouest : balise n° 2 à 700 m' }),
        {
          type: 'follow', balloon: 3, distance: 500, duration: 40, label: 'la montgolfière Cassis',
          text: 'Cassis, c\'est le guetteur des douanes : il fait la course en service ! Reste à moins de 500 m de lui (vers 850 m) pendant 40 s',
        }),
      ...stage('Contrôler Pistache',
        ringAlt(BALISE_3, 600, {
          text: 'Cap à l\'ouest par la mer : balise n° 3 à 600 m, au sud d\'une colline de 1 000 m (ne coupe pas au-dessus !)',
        }),
        {
          type: 'follow', balloon: 6, distance: 500, duration: 40, label: 'la montgolfière Pistache',
          text: 'Dernière concurrente, juste derrière la colline : reste à moins de 500 m de Pistache (vers 550 m) pendant 40 s',
        }),
      ...stage('Rapport à Lac Miroir',
        land('lac', { text: 'Pose-toi à Lac Miroir et rends ton rapport : personne n\'a triché !' })),
    ],
  },
  {
    id: 'defi-sauvetage-mer', title: 'Tempête sur la mer du Nord-Est', category: 'sauvetage', airport: 'levant',
    minRank: 1,
    desc: 'Le voilier Goéland a sombré ! Ratisse la zone du naufrage, largue un canot (X) au premier radeau, guide le '
      + 'cargo dérouté vers les naufragés (40 s), puis retrouve le skipper plus loin et pose-toi à Cap Nord.',
    reward: 1800,
    steps: [
      ...stage('Ratisser la zone du naufrage',
        reach(NAUFRAGE, 400, 'dernière position du Goéland', { spawn: 'smoke', text: 'Rejoins la dernière position connue du Goéland, au nord-est en mer' }),
        low(100, 45, 'Ratisse la zone de recherche : moins de 100 m au-dessus des vagues pendant 45 s', {
          x: ZONE_RECHERCHE.x, z: ZONE_RECHERCHE.z, radius: 3000,
        })),
      ...stage('Secourir le premier radeau',
        reach(RADEAU_1, 300, 'radeau de survie', { maxAgl: 150, spawn: 'raft', text: 'Un radeau orange ! Passe au-dessus à moins de 150 m' }),
        drop(RADEAU_1, 120, 'les naufragés', { maxAgl: 100, spawn: 'raft', text: 'Largue le canot pneumatique (X) près du radeau, à moins de 100 m de l\'eau' })),
      ...stage('Guider le cargo dérouté',
        {
          // bateau 11 : c'est aussi le « cargo suspect » d'est-contrebande, d'où un cargo sans nom ici
          type: 'follow', ship: 11, distance: 800, duration: 40, label: 'le cargo dérouté',
          text: 'Le seul cargo du secteur s\'est dérouté pour aider : guide-le vers les naufragés en restant à moins de 800 m de lui (et sous 500 m d\'altitude) pendant 40 s',
        }),
      ...stage('Sauver le skipper',
        reach(RADEAU_2, 300, 'second radeau', { maxAgl: 150, spawn: 'raft', text: 'Il manque le skipper ! Fouille plus au nord-est et survole son radeau à moins de 150 m' }),
        drop(RADEAU_2, 120, 'le skipper', { maxAgl: 100, spawn: 'raft', text: 'Largue le dernier canot (X) au skipper, à moins de 100 m de l\'eau' }),
        land('nord', { text: 'Pose-toi à Cap Nord : le cargo y débarque tout l\'équipage, sain et sauf !' })),
    ],
  },
  {
    // titre distinct de « Au ras des Falaises » (ouest-rase-falaises) ; ~32 km : ~12 min, bonus à 14 min
    id: 'defi-rase-vagues', title: 'Le rase-vagues des Palmes', category: 'course', airport: 'palmes',
    minRank: 1, // 90 s sous 30 m au-dessus de l'eau : pas pour un élève pilote
    desc: 'Marius, le pêcheur de l\'Île Corail, te défie : salue le cargo Saint-Christophe (30 s), file vers l\'est au ras '
      + 'de l\'eau (90 s sous 30 m) puis par le slalom, passe 30 s sous 40 m devant le Phare du Sud et rejoins-le à Corail.',
    reward: 1200, bonusTime: 840, bonusReward: 200,
    steps: [
      ...stage('Saluer le Saint-Christophe',
        { type: 'follow', ship: 3, distance: 500, duration: 30, label: 'le cargo Saint-Christophe', text: 'Le cousin de Marius est à bord du Saint-Christophe, au nord-ouest des Palmes : reste à moins de 500 m du cargo (et sous 500 m d\'altitude) pendant 30 s' }),
      ...stage('Rase-vagues et slalom',
        low(30, 90, 'Rase-vagues : moins de 30 m au-dessus de l\'eau pendant 90 s d\'affilée, sans remonter ! Profites-en pour filer vers l\'est'),
        slalom(-1500, 25500, 5500, 21000, 6, 200, 45).map((r, i) => (i === 0
          ? { ...r, text: 'Slalom au large de la côte sud : 6 anneaux à 45 m au-dessus de l\'eau, vers le Phare du Sud' }
          : r))),
      ...stage('Passer devant le Phare du Sud',
        low(40, 30, 'Passe devant le Phare du Sud côté mer (la falaise monte juste derrière lui) : moins de 40 m au-dessus de l\'eau pendant 30 s', { x: PHARE_S.x, z: PHARE_S.z, radius: 1500 })),
      ...stage('Se poser à Île Corail',
        land('corail', { text: 'Pose-toi à Île Corail : Marius, beau joueur, t\'offre la sardinade' })),
    ],
  },
  {
    id: 'defi-marathon', title: 'Le marathon des pistes', category: 'defi', airport: 'dunes',
    // ~54 km par la côte et le col de Mont Givre, 4 alignements de piste : ~22 min à 190 km/h, ~20 min plein gaz
    minRank: 1, bonusTime: 1320, bonusReward: 300,
    desc: 'Cinq aéroports, aucune pause : remonte la côte ouest en touchant Port Azur, les Falaises et Vallée Verte, '
      + 'grimpe toucher la piste perchée de Mont Givre, puis pose-toi à Lac Miroir. Bonus en moins de 22 min.',
    reward: 1300,
    steps: [
      ...stage('Les pistes de la côte ouest',
        touch('azur', { text: 'Premier toucher-décoller à Port Azur, juste au nord-ouest des Dunes : le chrono tourne !' }),
        touch('falaises', { text: 'Toucher-décoller aux Falaises : longe la côte (la route directe passe sur des collines de 900 m), la piste en herbe ne fait que 950 m' }),
        touch('verte', { text: 'Toucher-décoller à Vallée Verte, plus au nord le long de la côte' })),
      ...stage('La piste perchée de Mont Givre',
        touch('givre', { text: 'Toucher-décoller à Mont Givre, piste perchée à 555 m : grimpe vers 1 000 m en longeant la côte, puis passe le col à l\'ouest de la piste (850 m)' })),
      ...stage('Arrivée à Lac Miroir',
        land('lac', { text: 'Dernière ligne droite : redescends vers la plaine et pose-toi à Lac Miroir' })),
    ],
  },

  // =====================================================================
  // Voltige trouvée sur le terrain
  // =====================================================================
  // Pas de spirale ici : la quête de base « volcan » tourne déjà autour du cratère et les quêtes est-volcan-* y montent aussi.
  // Le dragon dessine un « 8 » : boucle autour du cône (2 km du cratère, relief ≤ 1 060 m sous la trajectoire)
  // puis boucle au-dessus de la baie nord, tout à 1 400 m ; virages doux (60° tous les 2 km).
  {
    id: 'defi-voltige-volcan', title: 'Le dragon du Volcan', category: 'voltige', giver: CAMP_VOLCANO,
    minRank: 2,
    desc: 'Les volcanologues filment un « dragon » : c\'est toi ! Dessine un 8 de 13 anneaux à 1 400 m autour du cône puis '
      + 'de la baie, plonge (15 s sur le dos, piqué à 320 km/h), salue leur camp en rase-mottes et pose-toi à la base.',
    // ~45 km dont 24 km de « 8 » et ~4 min de montée : ~17 min
    reward: 1400,
    steps: [
      ...stage('Dessiner le 8 du dragon',
        huit(VOLCANO, 2000, 6, 1400).map((r, i) => {
          if (i === 0) return { ...r, text: 'Prends d\'abord de la hauteur au-dessus de la mer, puis passe l\'anneau au nord du cône (1 400 m) cap à l\'est : le dragon fait le tour du volcan dans le sens des aiguilles d\'une montre' };
          if (i === 6) return { ...r, text: 'Croisement du 8 : traverse l\'anneau et enchaîne la boucle au-dessus de la baie, dans l\'autre sens' };
          if (i === 12) return { ...r, text: 'Referme le 8 : dernier anneau, au nord du cône' };
          return r;
        })),
      ...stage('Le plongeon du dragon',
        { type: 'inverted', duration: 15, text: 'Le dragon se retourne : 15 s sur le dos (pousse sur le manche)' },
        { type: 'speed', min: 320, text: 'Le dragon plonge vers la mer : piqué à 320 km/h (train rentré, G !), puis ressource en douceur' }),
      ...stage('Saluer le camp',
        reach(CAMP_VOLCANO, 300, 'camp des volcanologues', {
          maxAgl: 150, spawn: 'tent',
          text: 'Le dragon salue les volcanologues : survole leur camp à moins de 150 m du sol, en longeant la côte nord (la pente monte vite vers le sud !)',
        })),
      ...stage('Se poser à Base du Volcan',
        land('volcan', { text: 'Pose-toi à Base du Volcan en contournant l\'île par l\'ouest, au-dessus de la mer : les volcanologues ont tout filmé' })),
    ],
  },
];
