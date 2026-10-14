// Quêtes de la région : sud (Oasis des Dunes, Île Corail, Archipel des Palmes, Pyramides, Phare du Sud)
import {
  L, land, touch, reach, drop, ring,
} from './kit.js';

// ----- utilitaires locaux -----
const P = (x, z) => ({ x, z });

// Départ du rallye : au-dessus de la mer, puis sur les dunes au sud de l'Oasis
const DEPART = P(-10950, 14300); // en mer, à 1,9 km au sud-ouest de l'Oasis
const DUNES_SUD = P(-10330, 13940); // dunes au sud de la piste (~55 m)

const PYR = L('pyramides'); // (-8000, 13750) — la Grande Pyramide fait 130 m de haut

// Lieux inventés pour les histoires
const TENTE_SABLON = P(-8400, 13600); // tente de la professeure Sablon, à l'ouest des pyramides
const VALLEE_ROIS = P(-8250, 13150); // fond de la Vallée des Rois, au nord des pyramides (~200 m)
// camp de fouilles au pied de la vallée (~120 m) : assez au sud pour pouvoir virer après le largage
// (la vallée monte à 290 m 500 m plus au nord)
const CAMP_FOUILLES = P(-8150, 13500);
const RUINES_PALMES = P(-3950, 27650); // ruines au sommet de l'Archipel des Palmes (735 m)
// plage de la Crique des Contrebandiers (~25 m) ; la falaise derrière monte à 500 m en moins d'1 km
const CRIQUE = P(-3400, 15700);
const ANSE_CORAIL = P(7100, 19400); // plage de l'anse de Corail, 2,5 km à l'ouest de la piste
const PLAGE_CHEVRES = P(-3200, 20200); // plage nord de l'Île aux Chèvres (colline de 500 m juste au sud)
const ILOT = P(-50, 23500); // îlot de la montgolfière 12, au large de la côte
const PLAGE_PALMES = P(-5000, 30000); // plage sud de l'Archipel des Palmes
const NAUFRAGE = P(-10300, 30600); // en mer, à l'ouest des Palmes
const GARDIEN = P(3250, 20050); // maison du gardien du Phare du Sud

export default [
  // ===================== Rallye =====================
  {
    id: 'sud-rallye-dunes', title: 'Rallye des Dunes', category: 'course', airport: 'dunes',
    desc: 'Spéciale du désert : anneaux au ras des dunes, saut au-dessus de la Grande Pyramide, contrôle en '
      + 'toucher-décoller à l\'Oasis, rase-mottes sur la plage (< 40 m, 15 s) et arrivée à l\'Oasis des Dunes.',
    reward: 550, bonusTime: 510, bonusReward: 200,
    steps: [
      ring(DEPART, 50, { text: 'Départ ! Passe l\'anneau au-dessus de la mer, au sud-ouest de l\'Oasis' }),
      ring(DUNES_SUD, 50, { text: 'Cap à l\'est : rase les dunes au sud de la piste' }),
      ring(P(-9650, 14200), 50, { text: 'Longe la plage vers l\'est, au ras des dunes' }),
      ring(PYR, 200, { size: 40, text: 'Saute-mouton au-dessus de la Grande Pyramide (elle fait 135 m !) : plein gaz et tire sur le manche' }),
      ring(P(-7300, 14800), 60, { text: 'Virage des chameliers, au sud-est des pyramides : vire tout de suite vers la mer, les collines montent à l\'est' }),
      touch('dunes', { text: 'Contrôle de passage : reviens par la mer, toucher-décoller à l\'Oasis face au nord, puis vire à gauche vers la mer (ça monte au nord de la piste !)' }),
      {
        type: 'low', maxAgl: 40, duration: 15, x: -9500, z: 14200, radius: 1100, label: 'plage de l\'Oasis',
        text: 'Spéciale plage : vole à moins de 40 m du sol (ou de l\'eau) pendant 15 s près de la plage',
      },
      land('dunes', { text: 'Arrivée ! Pose-toi et arrête-toi à l\'Oasis des Dunes' }),
    ],
  },

  // ===================== L'expédition Sablon (chaîne de 3 quêtes) =====================
  {
    id: 'sud-sablon-releves', title: 'Les relevés de la Pr Sablon', category: 'exploration', giver: TENTE_SABLON,
    desc: 'La professeure Sablon cartographie la nécropole : palier entre 400 et 550 m pendant 20 s pour les photos, '
      + 'anneau au-dessus de la Grande Pyramide, fanion de la Vallée des Rois à moins de 200 m du sol, retour aux Dunes.',
    reward: 350,
    steps: [
      { type: 'hold', min: 400, max: 550, duration: 20, text: 'Vue d\'ensemble : tiens ton altitude entre 400 et 550 m pendant 20 s (au-dessus des pyramides ou de la mer : au nord, la montagne dépasse 1 000 m)' },
      ring(PYR, 260, { size: 40, text: 'Photo zénithale : passe l\'anneau au-dessus de la Grande Pyramide' }),
      reach(VALLEE_ROIS, 300, 'fanion de la Vallée des Rois', {
        maxAgl: 200, spawn: 'flag',
        text: 'Une forme étrange dans la Vallée des Rois ! Approche le fanion par le sud à moins de 200 m du sol, puis fais demi-tour aussitôt : la vallée se referme au nord',
      }),
      land('dunes', { text: 'Rapporte les photos à l\'Oasis des Dunes en longeant la plage (la montagne entre les pyramides et l\'Oasis dépasse 1 000 m)' }),
    ],
  },
  {
    id: 'sud-sablon-ravitaillement', title: 'Les deux chantiers', category: 'livraison', airport: 'dunes',
    requires: 'sud-sablon-releves',
    desc: 'La fouille commence ! Largue l\'eau au camp de la Vallée des Rois, puis les vivres aux ruines au sommet des '
      + 'Palmes (735 m), toujours à moins de 150 m du sol, et pose-toi à l\'Archipel des Palmes.',
    reward: 700,
    steps: [
      drop(CAMP_FOUILLES, 150, 'camp de la Vallée des Rois', {
        maxAgl: 150, spawn: 'tent',
        text: 'Longe la plage vers l\'est, puis largue l\'eau et les pelles (X) sur le camp au pied de la vallée, à moins de 150 m du sol (vire aussitôt : ça monte au nord)',
      }),
      drop(RUINES_PALMES, 150, 'ruines des Palmes', {
        maxAgl: 150, spawn: 'flag', text: 'Cap au sud-sud-est vers l\'Archipel des Palmes : largue les vivres sur les ruines du sommet (735 m), à moins de 150 m du sol',
      }),
      land('palmes', { text: 'L\'équipe a déterré une amphore ! Pose-toi à l\'Archipel des Palmes' }),
    ],
  },
  {
    id: 'sud-sablon-tempete', title: 'Tempête de sable !', category: 'sauvetage', airport: 'palmes',
    requires: 'sud-sablon-ravitaillement', minRank: 1, timeLimit: 1140,
    desc: 'La tempête a chassé l\'équipe vers la côte ! Repère sa fumée à la crique (< 300 m du sol), largue la trousse '
      + '(< 120 m), guide 30 s le cargo Saint-Christophe (sous 500 m) et pose-toi aux Dunes. 19 min !',
    reward: 1300,
    steps: [
      reach(CRIQUE, 400, 'fumée à la Crique des Contrebandiers', {
        maxAgl: 300, spawn: 'smoke', text: 'Cap au nord : repère la fumée sur la plage de la Crique des Contrebandiers, à moins de 300 m du sol',
      }),
      drop(CRIQUE, 150, 'l\'équipe de la professeure', {
        maxAgl: 120, spawn: 'hiker',
        text: 'Largue la trousse de secours (X) près de l\'équipe, à moins de 120 m du sol : arrive par la mer et vire aussitôt, la falaise monte à 500 m juste derrière',
      }),
      {
        type: 'follow', ship: 3, distance: 800, duration: 30, label: 'le cargo Saint-Christophe',
        text: 'Le cargo Saint-Christophe va les récupérer : reste à moins de 800 m de lui (et sous 500 m) pendant 30 s pour le guider',
      },
      land('dunes', { text: 'Pose-toi à l\'Oasis des Dunes : la professeure Sablon t\'offre le thé à la menthe' }),
    ],
  },

  // ===================== Plages et îles =====================
  {
    id: 'sud-plages', title: 'La tournée des plages', category: 'tourisme', airport: 'corail',
    desc: 'Banderole « Coco-Soleil » : 12 s à moins de 80 m au-dessus de l\'anse de Corail, 5 s sur le dos, '
      + 'puis 12 s sous 80 m aux plages des Chèvres et des Palmes, et pose-toi à l\'Archipel des Palmes.',
    reward: 900,
    steps: [
      {
        type: 'low', maxAgl: 80, duration: 12, ...ANSE_CORAIL, radius: 800, label: 'anse de Corail',
        text: 'Promène la banderole à moins de 80 m au-dessus de l\'anse de Corail, juste à l\'ouest de la piste, pendant 12 s',
      },
      { type: 'inverted', duration: 5, text: 'Les vacanciers t\'applaudissent : passe sur le dos pendant 5 s (avec de la hauteur !)' },
      {
        type: 'low', maxAgl: 80, duration: 12, ...PLAGE_CHEVRES, radius: 800, label: 'plage de l\'Île aux Chèvres',
        text: 'Plage nord de l\'Île aux Chèvres : moins de 80 m pendant 12 s (reste au-dessus de l\'eau, la colline au sud monte à 500 m)',
      },
      {
        type: 'low', maxAgl: 80, duration: 12, ...PLAGE_PALMES, radius: 800, label: 'plage des Palmes',
        text: 'Plage sud de l\'Archipel des Palmes : moins de 80 m pendant 12 s',
      },
      land('palmes', { text: 'Pose-toi à l\'Archipel des Palmes : glace à la noix de coco offerte !' }),
    ],
  },
  {
    id: 'sud-noces', title: 'Les noces du gardien', category: 'tourisme', giver: GARDIEN,
    desc: 'Firmin, le gardien du Phare du Sud, marie sa fille en montgolfière ! Reste 40 s à moins de 600 m de la mariée, '
      + 'puis du marié, largue le bouquet sur l\'îlot (< 150 m du sol) et pose-toi à l\'Île Corail.',
    reward: 900,
    steps: [
      {
        type: 'follow', balloon: 0, distance: 600, duration: 40, label: 'la montgolfière de Rose, la mariée',
        text: 'Rose, la mariée, vole vers 950 m au nord-est de l\'Île Corail : reste à moins de 600 m d\'elle (et à moins de 500 m de son altitude) pendant 40 s',
      },
      {
        type: 'follow', balloon: 12, distance: 600, duration: 40, label: 'la montgolfière de Basile, le marié',
        text: 'Basile, le marié, tourne vers 820 m au-dessus de l\'îlot du large : reste à moins de 600 m de lui (et de 500 m de son altitude) pendant 40 s',
      },
      drop(ILOT, 150, 'plage de l\'îlot', {
        maxAgl: 150, spawn: 'flag', text: 'Largue le bouquet (X) sur la plage de l\'îlot, à moins de 150 m du sol : la cérémonie peut commencer',
      }),
      land('corail', { text: 'Pose-toi à l\'Île Corail pour le banquet de noces' }),
    ],
  },
  {
    id: 'sud-naufrage', title: 'Chavirage au large des Palmes', category: 'sauvetage', airport: 'palmes',
    minRank: 1, timeLimit: 840,
    desc: 'Un équipier de La Mouette est tombé à l\'eau ! Suis le voilier 20 s (sous 500 m), repère le naufragé (< 150 m), '
      + 'largue le canot (< 60 m), tourne 20 s sous 100 m autour de lui et rentre aux Palmes. 14 min !',
    reward: 1000,
    steps: [
      {
        type: 'follow', ship: 9, distance: 700, duration: 20, label: 'le voilier La Mouette',
        text: 'Rejoins le voilier La Mouette à l\'ouest des Palmes : reste à moins de 700 m (et sous 500 m) pendant 20 s, le skipper te guide',
      },
      reach(NAUFRAGE, 300, 'le naufragé', {
        maxAgl: 150, spawn: 'raft', text: 'Repère le gilet orange du naufragé, à moins de 150 m au-dessus de l\'eau',
      }),
      drop(NAUFRAGE, 120, 'le naufragé', {
        maxAgl: 60, spawn: 'raft', text: 'Largue le canot de survie (X) tout près de lui, à moins de 60 m au-dessus de l\'eau',
      }),
      {
        type: 'low', maxAgl: 100, duration: 20, ...NAUFRAGE, radius: 800, label: 'au-dessus du naufragé', spawn: 'raft',
        text: 'Tourne au-dessus du naufragé à moins de 100 m pendant 20 s : la vedette des Palmes te repère',
      },
      land('palmes', { text: 'La vedette l\'a récupéré ! Pose-toi à l\'Archipel des Palmes' }),
    ],
  },
];
