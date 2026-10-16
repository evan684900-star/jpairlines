// Quêtes de la région : sud (Oasis des Dunes, Île Corail, Archipel des Palmes, Pyramides, Phare du Sud)
import {
  L, stage, land, touch, reach, drop, ring, ringAlt,
} from './kit.js';

// ----- utilitaires locaux -----
const P = (x, z) => ({ x, z });

// Départ du rallye : au-dessus de la mer, puis sur les dunes au sud de l'Oasis
const DEPART = P(-10950, 14300); // en mer, à 1,9 km au sud-ouest de l'Oasis
const DUNES_SUD = P(-10330, 13940); // dunes au sud de la piste (~55 m)

const PYR = L('pyramides'); // (-8000, 13750) — la Grande Pyramide fait 135 m de haut
const PHARE_SUD = L('phare-sud'); // (3400, 20200) — tour de 80 m

// Lieux inventés pour les histoires
const TENTE_SABLON = P(-8400, 13600); // tente de la professeure Sablon, à l'ouest des pyramides
const VALLEE_ROIS = P(-8250, 13150); // fond de la Vallée des Rois, au nord des pyramides (~200 m)
// camp de fouilles au pied de la vallée (~120 m) : assez au sud pour pouvoir virer après le largage
// (la vallée monte à 290 m 500 m plus au nord)
const CAMP_FOUILLES = P(-8150, 13500);
const MESSAGE_SABLE = P(-9100, 14000); // dunes plates (~80 m) entre les pyramides et la plage
const RUINES_PALMES = P(-3950, 27650); // ruines au sommet de l'Archipel des Palmes (735 m)
// plage de la Crique des Contrebandiers (~25 m) ; la falaise derrière monte à 500 m en moins d'1 km
const CRIQUE = P(-3400, 15700);
const ANSE_CORAIL = P(7100, 19400); // plage de l'anse de Corail, 2,5 km à l'ouest de la piste
const CHEVRES_SOMMET = P(-2800, 20950); // sommet de l'Île aux Chèvres (~540 m)
const ILOT = P(-50, 23500); // îlot au large de la côte (~40 m)
const PLAGE_PALMES = P(-5000, 30000); // plage sud de l'Archipel des Palmes
const PIC_PALMES = RUINES_PALMES; // le Pic des Palmes et ses vieilles ruines (734 m)
const BAIE_OUEST = P(-7000, 30100); // baie à l'ouest de l'Archipel des Palmes (mer)
const ILOT_CRANE = P(-9100, 32200); // îlot de 600 m de long (~30 m), à l'ouest-sud-ouest des Palmes
const GARDIEN = P(3250, 20050); // maison du gardien du Phare du Sud

export default [
  // ===================== Rallye =====================
  {
    id: 'sud-rallye-dunes', title: 'Rallye des Dunes', category: 'course', airport: 'dunes',
    desc: 'Spéciale du désert : file au ras des dunes par les anneaux, saute la Grande Pyramide, reviens pointer au '
      + 'contrôle de l\'Oasis (toucher-décoller), puis rase la plage 15 s sous 40 m avant l\'arrivée à l\'Oasis des Dunes.',
    reward: 550, bonusTime: 510, bonusReward: 200,
    steps: [
      ...stage('Spéciale des dunes',
        ring(DEPART, 50, { text: 'Départ ! Passe l\'anneau au-dessus de la mer, au sud-ouest de l\'Oasis, cap à l\'est-nord-est pour bien enchaîner' }),
        ring(DUNES_SUD, 50, { text: 'Cap à l\'est : rase les dunes au sud de la piste' }),
        ring(P(-9650, 14200), 50, { text: 'Longe la plage vers l\'est, au ras des dunes' })),
      ...stage('Sauter la Grande Pyramide',
        ring(PYR, 200, { size: 40, text: 'Saute-mouton au-dessus de la Grande Pyramide (elle fait 135 m !) : plein gaz et tire sur le manche' }),
        ring(P(-7300, 14800), 60, { text: 'Virage des chameliers, au sud-est des pyramides : vire tout de suite vers la mer, les collines montent à l\'est' })),
      ...stage('Pointer au contrôle de l\'Oasis',
        touch('dunes', { text: 'Contrôle de passage : reviens par la mer, toucher-décoller à l\'Oasis face au nord, puis vire à gauche vers la mer (ça monte au nord de la piste !)' })),
      ...stage('Spéciale plage et arrivée',
        {
          type: 'low', maxAgl: 40, duration: 15, x: -9500, z: 14200, radius: 1100, label: 'plage de l\'Oasis',
          text: 'Spéciale plage : vole à moins de 40 m du sol (ou de l\'eau) pendant 15 s près de la plage',
        },
        land('dunes', { text: 'Arrivée ! Pose-toi et arrête-toi à l\'Oasis des Dunes' })),
    ],
  },

  // ===================== L'expédition Sablon (chaîne de 3 quêtes) =====================
  {
    id: 'sud-sablon-releves', title: 'Les relevés de la Pr Sablon', category: 'exploration', giver: TENTE_SABLON,
    desc: 'La professeure Sablon cartographie la nécropole : photographie-la d\'en haut (palier 400-550 m, puis anneau sur '
      + 'la Grande Pyramide), va voir la forme étrange de la Vallée des Rois et rapporte les photos à l\'Oasis des Dunes.',
    reward: 350,
    steps: [
      ...stage('Photographier la nécropole',
        { type: 'hold', min: 400, max: 550, duration: 20, text: 'Vue d\'ensemble : tiens ton altitude entre 400 et 550 m pendant 20 s (au-dessus des pyramides ou de la mer : au nord, la montagne dépasse 1 000 m)' },
        ring(PYR, 260, { size: 40, text: 'Photo zénithale : passe l\'anneau au-dessus de la Grande Pyramide' })),
      ...stage('Repérer la forme étrange',
        reach(VALLEE_ROIS, 300, 'fanion de la Vallée des Rois', {
          maxAgl: 200, spawn: 'flag',
          text: 'Sur les photos, une forme étrange dans la Vallée des Rois ! Approche le fanion par le sud à moins de 200 m du sol, puis fais demi-tour aussitôt : la vallée se referme au nord',
        })),
      ...stage('Rapporter les photos aux Dunes',
        land('dunes', { text: 'Rapporte les photos à l\'Oasis des Dunes en longeant la plage (la montagne entre les pyramides et l\'Oasis dépasse 1 000 m)' })),
    ],
  },
  {
    id: 'sud-sablon-ravitaillement', title: 'Les deux chantiers', category: 'livraison', airport: 'dunes',
    requires: 'sud-sablon-releves',
    desc: 'La fouille commence ! Largue l\'eau au camp de la Vallée des Rois, lis le message que l\'équipe a tracé dans le '
      + 'sable (10 s sous 60 m) : il réclame des vivres aux ruines des Palmes. Largue-les, puis pose-toi aux Palmes.',
    reward: 750,
    steps: [
      ...stage('Ravitailler le camp de fouilles',
        drop(CAMP_FOUILLES, 150, 'camp de la Vallée des Rois', {
          maxAgl: 150, spawn: 'tent',
          text: 'Longe la plage vers l\'est, puis largue l\'eau et les pelles (X) sur le camp au pied de la vallée, à moins de 150 m du sol (vire aussitôt : ça monte au nord)',
        })),
      ...stage('Lire le message dans le sable',
        {
          type: 'low', maxAgl: 60, duration: 10, ...MESSAGE_SABLE, radius: 500, label: 'message dans le sable',
          text: 'L\'équipe a tracé un message dans le sable, à l\'ouest des pyramides : survole-le à moins de 60 m du sol pendant 10 s pour le lire',
        }),
      ...stage('Ravitailler les ruines des Palmes',
        drop(RUINES_PALMES, 150, 'ruines des Palmes', {
          maxAgl: 150, spawn: 'flag', text: '« Vivres aux Palmes ! » Cap au sud-sud-est : largue les vivres sur les ruines du sommet (735 m), à moins de 150 m du sol',
        })),
      ...stage('Se poser aux Palmes',
        land('palmes', { text: 'L\'équipe a déterré une amphore ! Pose-toi à l\'Archipel des Palmes' })),
    ],
  },
  {
    id: 'sud-sablon-tempete', title: 'Tempête de sable !', category: 'sauvetage', airport: 'palmes',
    requires: 'sud-sablon-ravitaillement', minRank: 1, timeLimit: 1200,
    desc: 'La tempête a chassé l\'équipe vers la côte ! Repère sa fumée à la crique (< 300 m du sol), largue la trousse '
      + '(< 120 m), guide 30 s le cargo qui vient la chercher (sous 500 m) et pose-toi aux Dunes. 20 min !',
    reward: 1300,
    steps: [
      ...stage('Retrouver l\'équipe à la crique',
        reach(CRIQUE, 400, 'fumée à la Crique des Contrebandiers', {
          maxAgl: 300, spawn: 'smoke', text: 'Cap au nord : repère la fumée sur la plage de la Crique des Contrebandiers, à moins de 300 m du sol',
        })),
      ...stage('Larguer la trousse de secours',
        drop(CRIQUE, 150, 'l\'équipe de la professeure', {
          maxAgl: 120, spawn: 'hiker',
          text: 'Largue la trousse de secours (X) près de l\'équipe, à moins de 120 m du sol : arrive par la mer et vire aussitôt, la falaise monte à 500 m juste derrière',
        })),
      ...stage('Guider le cargo de secours',
        {
          type: 'follow', ship: 3, distance: 800, duration: 30, label: 'le cargo Saint-Christophe',
          text: 'Le cargo Saint-Christophe va les récupérer : reste à moins de 800 m de lui (et sous 500 m) pendant 30 s pour le guider',
        }),
      ...stage('Rentrer aux Dunes',
        land('dunes', { text: 'Pose-toi à l\'Oasis des Dunes : la professeure Sablon t\'offre le thé à la menthe' })),
    ],
  },

  // ===================== Plages et îles =====================
  {
    id: 'sud-plages', title: 'Le guide des plages', category: 'tourisme', airport: 'corail',
    desc: 'Lucie écrit le guide des plages du Sud : photographie l\'anse de Corail (12 s sous 80 m), fais la couverture '
      + 'au-dessus de l\'Île aux Chèvres (anneau, puis 5 s sur le dos), la plage des Palmes (12 s sous 80 m) et pose-toi.',
    reward: 900,
    steps: [
      ...stage('Photographier l\'anse de Corail',
        {
          type: 'low', maxAgl: 80, duration: 12, ...ANSE_CORAIL, radius: 800, label: 'anse de Corail',
          text: 'Lucie photographie l\'anse de Corail, juste à l\'ouest de la piste : vole à moins de 80 m au-dessus pendant 12 s',
        }),
      ...stage('Photo de couverture',
        ringAlt(CHEVRES_SOMMET, 660, { size: 40, text: 'Vue plongeante : passe l\'anneau au-dessus de la colline de l\'Île aux Chèvres (540 m)' }),
        { type: 'inverted', duration: 5, text: 'La photo de couverture… à l\'envers, avec l\'île dans le cadre ! Vole sur le dos pendant 5 s (garde de la hauteur !)' }),
      ...stage('Photographier la plage des Palmes',
        {
          type: 'low', maxAgl: 80, duration: 12, ...PLAGE_PALMES, radius: 800, label: 'plage des Palmes',
          text: 'Dernière page du guide : plage sud de l\'Archipel des Palmes, vole à moins de 80 m au-dessus pendant 12 s',
        }),
      ...stage('Se poser aux Palmes',
        land('palmes', { text: 'Pose-toi à l\'Archipel des Palmes : glace à la noix de coco offerte !' })),
    ],
  },
  {
    id: 'sud-noces', title: 'Les noces de Rose', category: 'tourisme', giver: GARDIEN,
    desc: 'Rose, la fille du gardien du Phare du Sud, se marie ! Escorte sa montgolfière 40 s, salue son père en passant '
      + 'l\'anneau d\'honneur du phare, lance le bouquet (X) au marié sur l\'îlot et rejoins le banquet à l\'Île Corail.',
    reward: 850,
    steps: [
      ...stage('Escorter la mariée',
        {
          type: 'follow', balloon: 0, distance: 600, duration: 40, label: 'la montgolfière de Rose, la mariée',
          text: 'Rose arrive en montgolfière, vers 950 m au nord-est de l\'Île Corail : reste à moins de 600 m d\'elle (et de 500 m de son altitude) pendant 40 s',
        }),
      ...stage('Saluer le père au phare',
        ring(PHARE_SUD, 160, { size: 40, text: 'Salut d\'honneur à Firmin, le père de la mariée : passe l\'anneau au-dessus de son phare' })),
      ...stage('Lancer le bouquet au marié',
        drop(ILOT, 150, 'plage de l\'îlot', {
          maxAgl: 150, spawn: 'flag', text: 'Basile, le marié, attend sur l\'îlot du large : largue le bouquet (X) sur la plage, à moins de 150 m du sol',
        })),
      ...stage('Rejoindre le banquet',
        land('corail', { text: 'Pose-toi à l\'Île Corail pour le banquet de noces' })),
    ],
  },
  {
    id: 'sud-tresor', title: 'Le trésor de Barbe-Grise', category: 'exploration', airport: 'palmes',
    desc: 'Le skipper de La Mouette a repêché une carte au trésor ! Suis son voilier 20 s pour qu\'il te la lise, suis les '
      + 'indices (Pic des Palmes, baie de l\'Ouest), balise le trésor (X) sur l\'Îlot du Crâne et rentre aux Palmes.',
    reward: 950, bonusTime: 840, bonusReward: 200,
    steps: [
      ...stage('Lire la carte avec le skipper',
        {
          type: 'follow', ship: 9, distance: 700, duration: 20, label: 'le voilier La Mouette',
          text: 'Rejoins La Mouette à l\'ouest des Palmes : reste à moins de 700 m du voilier (et sous 500 m) pendant 20 s, le skipper te lit la carte',
        }),
      ...stage('Suivre les indices',
        ringAlt(PIC_PALMES, 860, {
          size: 40, text: 'Indice n° 1 : « Monte là où l\'aigle a son nid. » Passe l\'anneau au-dessus du Pic des Palmes et de ses ruines (734 m)',
        }),
        {
          type: 'low', maxAgl: 40, duration: 10, ...BAIE_OUEST, radius: 600, label: 'baie de l\'Ouest',
          text: 'Indice n° 2 : « Fais frémir l\'eau de la baie de l\'Ouest. » Rase la baie à moins de 40 m pendant 10 s',
        }),
      ...stage('Baliser le trésor',
        drop(ILOT_CRANE, 120, 'l\'Îlot du Crâne', {
          maxAgl: 100, spawn: 'flag', text: 'Indice n° 3 : « Le trésor dort sous le Crâne. » Largue la balise (X) sur le petit îlot à l\'ouest-sud-ouest, à moins de 100 m du sol',
        })),
      ...stage('Rentrer aux Palmes',
        land('palmes', { text: 'Pose-toi aux Palmes : le skipper t\'offre ta part du butin, un doublon tout rouillé !' })),
    ],
  },
];
