// Quêtes des nouvelles terres, deuxième série : plusieurs missions par aéroport (Grand Nord, Orient, Savane,
// Grand Lagon, Mangrove, Ponant) et de grands voyages d'un continent à l'autre.
// Elles se débloquent avec la route balisée de leur région (voir terres.js).
import {
  A, city, stage, land, touch, reach, drop, ring, ringsAround, ringsSpiral, ringsPath, slalom, terrainFollow,
  findPeak, findFlat, findCoast, findSea, offset,
} from './kit.js';
import { OUTER_LIM, TOWNS } from '../world.js';

const P = (x, z) => ({ x, z });
const mid = (a, b, t = 0.5) => P(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t);
const town = (name) => TOWNS.find((t) => t.name === name);
// route aérienne : un anneau tous les ~5 km, qui suit le relief
const route = (from, to, agl = 300) => {
  const n = Math.max(2, Math.round(Math.hypot(to.x - from.x, to.z - from.z) / 5000) - 1);
  return terrainFollow(Array.from({ length: n }, (_, i) => ring(mid(from, to, (i + 1) / (n + 1)), agl)), agl, 0.1);
};
const flat = (p, R = 5000, minH = 15) => findFlat(p.x, p.z, R, minH, OUTER_LIM);
const peak = (p, R = 5000) => findPeak(p.x, p.z, R, OUTER_LIM);
const coast = (p, R = 7000) => findCoast(p.x, p.z, R, OUTER_LIM);
const sea = (p, depth = 20, R = 8000) => findSea(p.x, p.z, depth, R, OUTER_LIM);

const R_BOREAL = 'terres-route-boreal', R_ORIENT = 'terres-route-orient', R_PONANT = 'terres-route-ponant', R_LAGON = 'terres-route-lagon';
const BOREAL = A('boreal'), TAIGA = A('taiga'), FJORD = A('fjord'), ORIENT = A('orient');
const SAVANE = A('savane'), LAGON = A('tropiques'), MANGROVE = A('mangrove'), PONANT = A('ponant');
const BOREALIS = city('Boréalis'), ORIENTIA = city('Orientia'), PONANTV = city('Ponant-la-Grande'), LAGONV = city('Lagon-City');
const PINS = town('Taïga-les-Pins'), OURS = town('Ours-sur-Fjord'), PALETUVIERS = town('Palétuviers');

// ----- lieux des missions -----
const BANQUISE = sea(offset(BOREAL, 9000, 0), 15);
const STATION_METEO = flat(offset(BOREAL, 11000, 250), 5000, 40);
const FEU_TAIGA = flat(offset(TAIGA, 8000, 160), 5000, 30);
const BUCHERON = flat(offset(TAIGA, 8000, 110), 5000, 40);
const FORET_TAIGA = flat(offset(TAIGA, 6000, 60), 4000, 20);
const PECHEURS = coast(offset(FJORD, 7000, 80));
const SOMMETS_FJORD = [peak(offset(FJORD, 7000, 200), 3500), peak(offset(FJORD, 9000, 290), 3500), peak(offset(FJORD, 8000, 20), 3500)];
const PHOQUES = sea(offset(FJORD, 6000, 120), 10);
const CANYON_A = offset(FJORD, 2500, 250), CANYON_B = offset(FJORD, 11000, 250);
const JUNGLE = [flat(offset(ORIENT, 9000, 170), 4000, 150), flat(offset(ORIENT, 14000, 200), 4000, 150)];
const DISPENSAIRE = flat(offset(SAVANE, 10000, 300), 5000, 20);
const GIRAFES = flat(offset(SAVANE, 7000, 120), 5000, 20);
const RADEAU = sea(offset(LAGON, 9000, 120), 15);
const ILE_TRESOR = coast(offset(LAGON, 12000, 240), 8000);
const MEDECIN = coast(offset(MANGROVE, 9000, 30), 7000);
const CROCOS = coast(offset(MANGROVE, 5000, 200), 6000);
const LABY_A = offset(MANGROVE, 2500, 120), LABY_B = offset(MANGROVE, 10000, 120);
const PHARE_PONANT = coast(offset(PONANT, 9000, 270), 8000);
const FALAISES_A = coast(offset(PONANT, 6000, 200), 6000), FALAISES_B = coast(offset(PONANT, 12000, 220), 6000);
const POLE = P(-2000, -93000), GRAND_SUD = P(3000, 93000);

export default [
  // ===================== Boréal =====================
  {
    id: 'terres2-boreal-spirale', title: 'Les aurores de Boréalis', category: 'tourisme', airport: 'boreal', requires: R_BOREAL,
    desc: 'Un photographe veut voir Boréalis d\'en haut, comme sous les aurores. Monte en spirale au-dessus de la ville. '
      + 'Il fait très froid là-haut : allume le chauffage (touches 1 2 3).',
    reward: 1400,
    steps: [
      ...stage('Spirale au-dessus de Boréalis', terrainFollow(ringsSpiral(BOREALIS.x, BOREALIS.z, 1500, 6, 500, 1300), 250, 0.3)),
      ...stage('Grimper dans le froid', { type: 'altitude', min: 1700, text: 'Monte au-dessus de 1 700 m (chauffage conseillé !)' }),
      ...stage('Se poser à Boréal International', land('boreal')),
    ],
  },
  {
    id: 'terres2-boreal-banquise', title: 'La station sur la banquise', category: 'livraison', airport: 'boreal', requires: R_BOREAL,
    desc: 'Des scientifiques campent sur la banquise, au nord de Boréal. Largue-leur des vivres, puis survole la '
      + 'mer gelée en rase-mottes pour mesurer la glace.',
    reward: 1600,
    steps: [
      ...stage('Vivres pour la station', drop(BANQUISE, 180, 'station de la banquise', { maxAgl: 180, spawn: 'tent', text: 'Largue les vivres (X) sur la station de la banquise, à moins de 180 m' })),
      ...stage('Mesurer la glace', { type: 'low', maxAgl: 60, duration: 20, x: BANQUISE.x, z: BANQUISE.z, radius: 3000, label: 'la banquise', text: 'Vole à moins de 60 m au-dessus de la banquise pendant 20 s' }),
      ...stage('Se poser à Boréal International', land('boreal')),
    ],
  },
  {
    id: 'terres2-boreal-meteo', title: 'La station météo des glaces', category: 'exploration', airport: 'boreal', requires: R_BOREAL,
    desc: 'La station météo automatique ne répond plus. Va voir sur place, largue les pièces de rechange, puis '
      + 'rentre en tenant l\'altitude pour que les capteurs de l\'avion enregistrent le froid.',
    reward: 1500,
    steps: [
      ...stage('Trouver la station', reach(STATION_METEO, 500, 'station météo', { spawn: 'flag' })),
      ...stage('Larguer les pièces', drop(STATION_METEO, 180, 'station météo', { maxAgl: 200 })),
      ...stage('Relevés en altitude', { type: 'hold', min: 900, max: 1200, duration: 30, text: 'Tiens l\'altitude entre 900 et 1 200 m pendant 30 s' }),
      ...stage('Se poser à Boréal International', land('boreal')),
    ],
  },
  {
    id: 'terres2-boreal-slalom', title: 'Le slalom des glaces', category: 'course', airport: 'boreal', requires: R_BOREAL,
    desc: 'Le club de Boréal organise un slalom au-dessus de la ville. Passe toutes les portes le plus vite possible, '
      + 'puis pose-toi.',
    reward: 1300, timeLimit: 650, bonusTime: 460, bonusReward: 500,
    steps: [
      ...stage('Décoller de Boréal', touch('boreal')),
      ...stage('Le slalom', terrainFollow(slalom(BOREALIS.x - 3000, BOREALIS.z + 2500, BOREALIS.x + 3500, BOREALIS.z - 2500, 7, 250, 150), 130, 0.25)),
      ...stage('Se poser à Boréal International', land('boreal')),
    ],
  },
  {
    id: 'terres2-boreal-taiga-fioul', title: 'Du fioul pour Taïga-les-Pins', category: 'livraison', airport: 'boreal', requires: R_BOREAL,
    desc: 'Le village de Taïga-les-Pins n\'a plus de fioul pour se chauffer. Apporte des bidons à Taïga, survole le '
      + 'village pour prévenir les habitants, puis rentre à Boréal.',
    reward: 1700,
    steps: [
      ...stage('Livrer le fioul à Taïga', land('taiga')),
      ...stage('Prévenir le village', reach(PINS, 600, 'Taïga-les-Pins', { maxAgl: 250, text: 'Survole Taïga-les-Pins à moins de 250 m pour prévenir les habitants' })),
      ...stage('Rentrer à Boréal', land('boreal')),
    ],
  },

  // ===================== Taïga =====================
  {
    id: 'terres2-taiga-incendie', title: 'Feu dans la taïga', category: 'sauvetage', airport: 'taiga', requires: R_BOREAL,
    desc: 'Un feu de forêt s\'est déclaré au sud-est de Taïga. Repère la fumée, largue de l\'eau dessus, puis '
      + 'reviens te poser pour recharger.',
    reward: 1800,
    steps: [
      ...stage('Repérer la fumée', reach(FEU_TAIGA, 700, 'feu de forêt', { spawn: 'smoke' })),
      ...stage('Larguer l\'eau', drop(FEU_TAIGA, 200, 'feu de forêt', { maxAgl: 150, spawn: 'smoke', text: 'Largue l\'eau (X) sur le feu, à moins de 150 m du sol' })),
      ...stage('Recharger à Taïga', land('taiga')),
    ],
  },
  {
    id: 'terres2-taiga-bucheron', title: 'Le bûcheron blessé', category: 'sauvetage', airport: 'taiga', requires: R_BOREAL,
    desc: 'Un bûcheron s\'est blessé loin dans la forêt. Trouve-le, largue-lui une trousse de secours, puis file à '
      + 'Boréal prévenir l\'hôpital.',
    reward: 1900,
    steps: [
      ...stage('Trouver le bûcheron', reach(BUCHERON, 600, 'bûcheron blessé', { spawn: 'hiker' })),
      ...stage('Larguer la trousse', drop(BUCHERON, 180, 'bûcheron blessé', { maxAgl: 180 })),
      ...stage('Prévenir l\'hôpital de Boréal', land('boreal')),
    ],
  },
  {
    id: 'terres2-taiga-cimes', title: 'Au ras des sapins', category: 'voltige', airport: 'taiga', requires: R_BOREAL,
    desc: 'Les pilotes de la taïga se vantent de frôler la cime des sapins. Vole à moins de 50 m au-dessus de la '
      + 'forêt pendant 30 s, puis pose-toi.',
    reward: 1200,
    steps: [
      ...stage('Rejoindre la forêt', reach(FORET_TAIGA, 900, 'la forêt')),
      ...stage('Raser les sapins', { type: 'low', maxAgl: 50, duration: 30, x: FORET_TAIGA.x, z: FORET_TAIGA.z, radius: 3000, label: 'la forêt', text: 'Vole à moins de 50 m au-dessus de la forêt pendant 30 s' }),
      ...stage('Se poser à Taïga', land('taiga')),
    ],
  },
  {
    id: 'terres2-taiga-fjord', title: 'La traversée du Grand Nord', category: 'exploration', airport: 'taiga', requires: R_BOREAL,
    desc: 'Relie les deux bouts du Grand Nord : de Taïga à Fjord-aux-Ours, plus de 100 km dans le froid. Fais le '
      + 'plein, garde le chauffage allumé et passe par Boréal.',
    reward: 3200, minRank: 2,
    steps: [
      ...stage('Escale à Boréal', touch('boreal')),
      ...stage('Cap à l\'est', route(BOREAL, FJORD, 350)),
      ...stage('Se poser à Fjord-aux-Ours', land('fjord')),
    ],
  },

  // ===================== Fjord =====================
  {
    id: 'terres2-fjord-pecheurs', title: 'Les pêcheurs du fjord', category: 'livraison', airport: 'fjord', requires: R_BOREAL,
    desc: 'Les pêcheurs du fjord attendent des filets neufs. Largue-les sur leur cabane au bord de l\'eau, puis '
      + 'survole Ours-sur-Fjord avant de rentrer.',
    reward: 1400,
    steps: [
      ...stage('Larguer les filets', drop(PECHEURS, 160, 'cabane des pêcheurs', { maxAgl: 150, spawn: 'crate' })),
      ...stage('Passer sur Ours-sur-Fjord', reach(OURS, 600, 'Ours-sur-Fjord')),
      ...stage('Rentrer à Fjord-aux-Ours', land('fjord')),
    ],
  },
  {
    id: 'terres2-fjord-sommets', title: 'Les trois sommets', category: 'exploration', airport: 'fjord', requires: R_BOREAL,
    desc: 'Les cartographes ont besoin de photos des trois plus hauts sommets autour du fjord. Survole-les tous, '
      + 'puis reviens. Là-haut, le givre guette.',
    reward: 1800,
    steps: [
      ...stage('Premier sommet', reach(SOMMETS_FJORD[0], 600, 'premier sommet', { spawn: 'flag' })),
      ...stage('Deuxième sommet', reach(SOMMETS_FJORD[1], 600, 'deuxième sommet', { spawn: 'flag' })),
      ...stage('Troisième sommet', reach(SOMMETS_FJORD[2], 600, 'troisième sommet', { spawn: 'flag' })),
      ...stage('Rentrer à Fjord-aux-Ours', land('fjord')),
    ],
  },
  {
    id: 'terres2-fjord-phoques', title: 'Les phoques du fjord', category: 'tourisme', airport: 'fjord', requires: R_BOREAL,
    desc: 'Des touristes veulent voir la colonie de phoques. Survole la mer au ras de l\'eau pendant 20 s sans les '
      + 'effrayer, puis ramène tout le monde.',
    reward: 1100,
    steps: [
      ...stage('Rejoindre la colonie', reach(PHOQUES, 800, 'colonie de phoques')),
      ...stage('Survoler les phoques', { type: 'low', maxAgl: 70, duration: 20, x: PHOQUES.x, z: PHOQUES.z, radius: 2500, label: 'la colonie', text: 'Vole à moins de 70 m au-dessus de la mer pendant 20 s' }),
      ...stage('Rentrer à Fjord-aux-Ours', land('fjord')),
    ],
  },
  {
    id: 'terres2-fjord-canyon', title: 'Le couloir du fjord', category: 'defi', airport: 'fjord', requires: R_BOREAL, minRank: 1,
    desc: 'Un couloir d\'anneaux suit le fjord vers l\'ouest, entre les montagnes. Passe-les tous sans toucher le '
      + 'relief, puis reviens te poser.',
    reward: 2000,
    steps: [
      ...stage('Décoller de Fjord-aux-Ours', touch('fjord')),
      ...stage('Le couloir', terrainFollow(slalom(CANYON_A.x, CANYON_A.z, CANYON_B.x, CANYON_B.z, 8, 300, 150), 130, 0.25)),
      ...stage('Rentrer à Fjord-aux-Ours', land('fjord')),
    ],
  },

  // ===================== Orient =====================
  {
    id: 'terres2-orient-tours', title: 'Entre les tours d\'Orientia', category: 'voltige', airport: 'orient', requires: R_ORIENT,
    desc: 'Le festival d\'Orientia veut un spectacle : passe dans les anneaux autour des tours de la ville, vole 4 s '
      + 'sur le dos, puis pose-toi.',
    reward: 1500,
    steps: [
      ...stage('Les anneaux de la ville', terrainFollow(ringsAround(ORIENTIA.x, ORIENTIA.z, ORIENTIA.radius + 500, 7, 200, 0.4), 180, 0.25)),
      ...stage('Vol sur le dos', { type: 'inverted', duration: 4, text: 'Retourne l\'avion et vole sur le dos pendant 4 s (garde de la hauteur !)' }),
      ...stage('Retour à Porte d\'Orient', land('orient')),
    ],
  },
  {
    id: 'terres2-orient-vitesse', title: 'Le record de l\'Orient', category: 'defi', airport: 'orient', requires: R_ORIENT,
    desc: 'Le journal d\'Orientia cherche le pilote le plus rapide. Dépasse 280 km/h, tiens ensuite ton altitude '
      + 'pendant 30 s, puis reviens te poser.',
    reward: 1300,
    steps: [
      ...stage('Pointe de vitesse', { type: 'speed', min: 280, text: 'Dépasse 280 km/h (en piqué si besoin)' }),
      ...stage('Vol stabilisé', { type: 'hold', min: 600, max: 900, duration: 30, text: 'Tiens l\'altitude entre 600 et 900 m pendant 30 s' }),
      ...stage('Retour à Porte d\'Orient', land('orient')),
    ],
  },
  {
    id: 'terres2-orient-jungle', title: 'Les temples de la jungle', category: 'exploration', airport: 'orient', requires: R_ORIENT,
    desc: 'Des archéologues pensent avoir trouvé deux temples sur les collines au sud. Survole-les, plante un '
      + 'drapeau sur le second, puis reviens.',
    reward: 1700,
    steps: [
      ...stage('Premier temple', reach(JUNGLE[0], 600, 'premier temple', { spawn: 'flag' })),
      ...stage('Second temple', drop(JUNGLE[1], 200, 'second temple', { maxAgl: 200, spawn: 'flag', text: 'Largue le drapeau (X) sur le second temple, à moins de 200 m' })),
      ...stage('Retour à Porte d\'Orient', land('orient')),
    ],
  },
  {
    id: 'terres2-orient-navette', title: 'La navette de la Savane', category: 'livraison', airport: 'orient', requires: R_ORIENT,
    desc: 'Assure la navette du matin : courrier à Savane Dorée (toucher-décoller), puis retour à Porte d\'Orient '
      + 'avant midi.',
    reward: 1600, timeLimit: 2500, bonusTime: 1800, bonusReward: 500,
    steps: [
      ...stage('Décoller de Porte d\'Orient', touch('orient')),
      ...stage('Toucher à Savane Dorée', touch('savane')),
      ...stage('Retour à Porte d\'Orient', land('orient')),
    ],
  },

  // ===================== Savane =====================
  {
    id: 'terres2-savane-vaccins', title: 'Les vaccins de la brousse', category: 'livraison', airport: 'savane', requires: R_ORIENT,
    desc: 'Un dispensaire de brousse attend des vaccins au frais. Largue la caisse isotherme juste à côté, puis '
      + 'rentre vite : il fait plus de 30 °C.',
    reward: 1500,
    steps: [
      ...stage('Rejoindre le dispensaire', reach(DISPENSAIRE, 800, 'dispensaire')),
      ...stage('Larguer les vaccins', drop(DISPENSAIRE, 170, 'dispensaire', { maxAgl: 160, spawn: 'tent' })),
      ...stage('Rentrer à Savane Dorée', land('savane')),
    ],
  },
  {
    id: 'terres2-savane-girafes', title: 'Le recensement des girafes', category: 'exploration', airport: 'savane', requires: R_ORIENT,
    desc: 'Les gardes du parc comptent les girafes. Survole la plaine à moins de 60 m pendant 30 s, puis rapporte '
      + 'les photos.',
    reward: 1200,
    steps: [
      ...stage('Rejoindre la plaine', reach(GIRAFES, 800, 'plaine aux girafes')),
      ...stage('Compter les girafes', { type: 'low', maxAgl: 60, duration: 30, x: GIRAFES.x, z: GIRAFES.z, radius: 3000, label: 'la plaine', text: 'Vole à moins de 60 m au-dessus de la plaine pendant 30 s' }),
      ...stage('Rentrer à Savane Dorée', land('savane')),
    ],
  },
  {
    id: 'terres2-savane-pluie', title: 'Le faiseur de pluie', category: 'defi', airport: 'savane', requires: R_ORIENT,
    desc: 'La savane a soif. Monte au-dessus de 1 500 m pour ensemencer les nuages, tiens-toi dans la couche '
      + 'pendant 40 s, puis redescends te poser.',
    reward: 1400,
    steps: [
      ...stage('Monter aux nuages', { type: 'altitude', min: 1500 }),
      ...stage('Ensemencer les nuages', { type: 'hold', min: 1400, max: 1800, duration: 40, text: 'Reste entre 1 400 et 1 800 m pendant 40 s' }),
      ...stage('Rentrer à Savane Dorée', land('savane')),
    ],
  },
  {
    id: 'terres2-savane-rallye', title: 'Le rallye Savane-Orient', category: 'course', airport: 'savane', requires: R_ORIENT,
    desc: 'Course balisée de Savane Dorée à Porte d\'Orient : suis les anneaux et pose-toi le plus vite possible.',
    reward: 1800, timeLimit: 1800, bonusTime: 1300, bonusReward: 700,
    steps: [
      ...stage('Décoller de Savane Dorée', touch('savane')),
      ...stage('La route du rallye', route(SAVANE, ORIENT, 250)),
      ...stage('Arrivée à Porte d\'Orient', land('orient')),
    ],
  },

  // ===================== Grand Lagon =====================
  {
    id: 'terres2-lagon-radeau', title: 'Le radeau à la dérive', category: 'sauvetage', airport: 'tropiques', requires: R_LAGON,
    desc: 'Un kayakiste dérive au large du lagon. Repère son radeau, largue-lui une bouée, puis préviens les '
      + 'secours en te posant.',
    reward: 1700,
    steps: [
      ...stage('Repérer le radeau', reach(RADEAU, 700, 'radeau', { spawn: 'raft' })),
      ...stage('Larguer la bouée', drop(RADEAU, 160, 'radeau', { maxAgl: 150, spawn: 'raft' })),
      ...stage('Prévenir les secours', land('tropiques')),
    ],
  },
  {
    id: 'terres2-lagon-carte-postale', title: 'Carte postale de Lagon-City', category: 'tourisme', airport: 'tropiques', requires: R_LAGON,
    desc: 'L\'office du tourisme veut une photo de Lagon-City vue du ciel. Fais le tour de la ville par les '
      + 'anneaux, puis pose-toi.',
    reward: 1000,
    steps: [
      ...stage('Décoller du Grand Lagon', touch('tropiques')),
      ...stage('Tour de Lagon-City', terrainFollow(ringsAround(LAGONV.x, LAGONV.z, LAGONV.radius + 700, 6, 200), 180, 0.25)),
      ...stage('Se poser au Grand Lagon', land('tropiques')),
    ],
  },
  {
    id: 'terres2-lagon-tresor', title: 'L\'île au trésor', category: 'exploration', airport: 'tropiques', requires: R_LAGON,
    desc: 'Une vieille carte indique un trésor sur une île à l\'ouest du lagon. Trouve l\'île, largue un drapeau '
      + 'pour la marquer, puis reviens.',
    reward: 1600,
    steps: [
      ...stage('Trouver l\'île', reach(ILE_TRESOR, 700, 'île au trésor')),
      ...stage('Marquer le trésor', drop(ILE_TRESOR, 180, 'île au trésor', { maxAgl: 180, spawn: 'flag' })),
      ...stage('Se poser au Grand Lagon', land('tropiques')),
    ],
  },
  {
    id: 'terres2-lagon-vagues', title: 'Rase-vagues', category: 'voltige', airport: 'tropiques', requires: R_LAGON,
    desc: 'Les surfeurs du lagon te mettent au défi : vole à moins de 30 m au-dessus de l\'eau pendant 20 s, au '
      + 'large de la plage, puis pose-toi.',
    reward: 1300,
    steps: [
      ...stage('Rejoindre le large', reach(RADEAU, 1500, 'le large')),
      ...stage('Raser les vagues', { type: 'low', maxAgl: 30, duration: 20, x: RADEAU.x, z: RADEAU.z, radius: 3000, label: 'le large', text: 'Vole à moins de 30 m au-dessus de l\'eau pendant 20 s' }),
      ...stage('Se poser au Grand Lagon', land('tropiques')),
    ],
  },

  // ===================== Mangrove =====================
  {
    id: 'terres2-mangrove-medecin', title: 'Le médecin volant', category: 'sauvetage', airport: 'mangrove', requires: R_PONANT,
    desc: 'Un village isolé de la mangrove a besoin de médicaments. Largue la trousse sur la côte, survole '
      + 'Palétuviers pour rassurer les familles, puis rentre.',
    reward: 1600,
    steps: [
      ...stage('Larguer les médicaments', drop(MEDECIN, 170, 'village isolé', { maxAgl: 160, spawn: 'tent' })),
      ...stage('Survoler Palétuviers', reach(PALETUVIERS, 600, 'Palétuviers')),
      ...stage('Rentrer à Mangrove', land('mangrove')),
    ],
  },
  {
    id: 'terres2-mangrove-crocos', title: 'Les crocodiles', category: 'tourisme', airport: 'mangrove', requires: R_PONANT,
    desc: 'Les touristes veulent voir les crocodiles de la mangrove. Vole bas au-dessus de la côte pendant 25 s, '
      + 'puis ramène-les sains et saufs.',
    reward: 1100,
    steps: [
      ...stage('Rejoindre les marais', reach(CROCOS, 800, 'les marais')),
      ...stage('Survoler les crocodiles', { type: 'low', maxAgl: 60, duration: 25, x: CROCOS.x, z: CROCOS.z, radius: 2500, label: 'les marais', text: 'Vole à moins de 60 m au-dessus des marais pendant 25 s' }),
      ...stage('Rentrer à Mangrove', land('mangrove')),
    ],
  },
  {
    id: 'terres2-mangrove-labyrinthe', title: 'Le labyrinthe de la mangrove', category: 'course', airport: 'mangrove', requires: R_PONANT,
    desc: 'Un slalom au ras des palétuviers, au sud-est de Mangrove. Passe toutes les portes le plus vite '
      + 'possible et reviens te poser.',
    reward: 1400, timeLimit: 750, bonusTime: 510, bonusReward: 500,
    steps: [
      ...stage('Décoller de Mangrove', touch('mangrove')),
      ...stage('Le labyrinthe', terrainFollow(slalom(LABY_A.x, LABY_A.z, LABY_B.x, LABY_B.z, 8, 250, 100), 90, 0.25)),
      ...stage('Rentrer à Mangrove', land('mangrove')),
    ],
  },

  // ===================== Ponant =====================
  {
    id: 'terres2-ponant-couchant', title: 'Le soleil couchant', category: 'tourisme', airport: 'ponant', requires: R_PONANT,
    desc: 'Des jeunes mariés veulent voir le soleil se coucher sur Ponant-la-Grande. Fais le tour de la ville, '
      + 'monte à 1 200 m pour la vue, puis pose-toi en douceur.',
    reward: 1200,
    steps: [
      ...stage('Tour de Ponant-la-Grande', terrainFollow(ringsAround(PONANTV.x, PONANTV.z, PONANTV.radius + 700, 6, 220), 200, 0.25)),
      ...stage('Monter pour la vue', { type: 'altitude', min: 1200 }),
      ...stage('Se poser à Ponant', land('ponant')),
    ],
  },
  {
    id: 'terres2-ponant-phare', title: 'Le phare du bout du monde', category: 'livraison', airport: 'ponant', requires: R_PONANT,
    desc: 'Le gardien du phare, tout à l\'ouest, attend son ravitaillement. Largue la caisse près du phare, puis '
      + 'reviens à Ponant.',
    reward: 1400,
    steps: [
      ...stage('Rejoindre le phare', reach(PHARE_PONANT, 700, 'phare de l\'ouest')),
      ...stage('Ravitailler le gardien', drop(PHARE_PONANT, 160, 'phare de l\'ouest', { maxAgl: 150, spawn: 'crate' })),
      ...stage('Se poser à Ponant', land('ponant')),
    ],
  },
  {
    id: 'terres2-ponant-cotes', title: 'La route des côtes', category: 'defi', airport: 'ponant', requires: R_PONANT,
    desc: 'Longe la côte sauvage au sud de Ponant à basse altitude, par les anneaux, puis reviens te poser.',
    reward: 1500,
    steps: [
      ...stage('Décoller de Ponant', touch('ponant')),
      ...stage('La côte sauvage', terrainFollow(ringsPath([PONANT, FALAISES_A, FALAISES_B], 2500, 150), 130, 0.25)),
      ...stage('Se poser à Ponant', land('ponant')),
    ],
  },
  {
    id: 'terres2-ponant-mangrove', title: 'La navette de la Mangrove', category: 'livraison', airport: 'ponant', requires: R_PONANT,
    desc: 'Le courrier de Ponant part pour Mangrove, loin au sud. Suis la route balisée, pose-toi, puis rentre.',
    reward: 2200,
    steps: [
      ...stage('Cap au sud', route(PONANT, MANGROVE)),
      ...stage('Livrer à Mangrove', land('mangrove')),
      ...stage('Rentrer à Ponant', land('ponant')),
    ],
  },

  // ===================== Grands voyages =====================
  {
    id: 'terres2-pole-nord', title: 'Au pôle Nord', category: 'defi', airport: 'boreal', requires: R_BOREAL, minRank: 2,
    desc: 'Va toucher le bout du monde, tout au nord, au-dessus de la mer gelée. Il fait −40 °C : chauffage à '
      + 'fond (touche 3), et surveille le carburant !',
    reward: 2600,
    steps: [
      ...stage('Cap au nord', reach(mid(BOREAL, POLE), 1500, 'le Grand Nord')),
      ...stage('Le pôle Nord', reach(POLE, 2000, 'pôle Nord', { spawn: 'flag' })),
      ...stage('Rentrer à Boréal', land('boreal')),
    ],
  },
  {
    id: 'terres2-grand-sud', title: 'Le Grand Sud', category: 'exploration', airport: 'tropiques', requires: R_LAGON, minRank: 1,
    desc: 'Au sud du Grand Lagon, il n\'y a plus que l\'océan jusqu\'au bout du monde. Va le voir, puis reviens '
      + 'te poser au lagon.',
    reward: 1800,
    steps: [
      ...stage('Cap au sud', reach(mid(LAGON, GRAND_SUD), 1500, 'l\'océan du sud')),
      ...stage('Le bout du monde', reach(GRAND_SUD, 2000, 'bout du monde', { spawn: 'flag' })),
      ...stage('Se poser au Grand Lagon', land('tropiques')),
    ],
  },
  {
    id: 'terres2-nord-orient', title: 'Du Grand Nord à l\'Orient', category: 'livraison', airport: 'fjord', requires: [R_BOREAL, R_ORIENT], minRank: 2,
    desc: 'Du poisson fumé de Fjord-aux-Ours pour les marchés d\'Orientia : une longue route du froid au chaud, '
      + 'au-dessus de l\'océan.',
    reward: 3000,
    steps: [
      ...stage('Décoller de Fjord-aux-Ours', touch('fjord')),
      ...stage('Vers le sud', route(FJORD, ORIENT, 350)),
      ...stage('Livrer à Porte d\'Orient', land('orient')),
    ],
  },
  {
    id: 'terres2-tour-du-monde', title: 'Le tour du monde', category: 'exploration', airport: 'alpha', requires: [R_BOREAL, R_ORIENT, R_PONANT, R_LAGON], minRank: 3,
    desc: 'Le défi ultime : un toucher-décoller sur chaque aéroport des nouvelles terres, puis retour à Alpha. '
      + 'Fais le plein à chaque escale !',
    reward: 6000,
    steps: [
      ...stage('Le Nord', touch('boreal'), touch('taiga'), touch('fjord')),
      ...stage('L\'Orient', touch('orient'), touch('savane')),
      ...stage('Le Sud et l\'Ouest', touch('tropiques'), touch('mangrove'), touch('ponant')),
      ...stage('Retour à Alpha', land('alpha')),
    ],
  },
];
