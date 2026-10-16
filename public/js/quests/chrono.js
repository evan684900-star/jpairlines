// Contre-la-montre : courses courtes, rejouables, avec classement en ligne (meilleur temps de chaque pilote).
// Toutes les quêtes avec timeLimit ou bonusTime ont aussi un classement ; celles-ci sont faites pour ça.
import { A, city, land, ringsAround, ringsLine, terrainFollow, stage } from './kit.js';

const ALPHA = A('alpha'), LAC = A('lac');
const capitale = city('Capitale');

const circuitAlpha = terrainFollow(ringsAround(ALPHA.x, ALPHA.z, 2200, 8, 150, Math.PI / 2), 140);
const sprintLac = terrainFollow(ringsLine(ALPHA.x, ALPHA.z - 1200, LAC.x - 300, LAC.z + 1800, 6, 120), 110);
const tourCapitale = terrainFollow(ringsAround(capitale.x, capitale.z, 2800, 8, 300, 0), 250);

export default [
  {
    id: 'chrono-alpha', title: 'Contre-la-montre : Circuit d\'Alpha', category: 'course', airport: 'alpha', ranked: true,
    desc: 'Le chrono part dès que tu acceptes ! Boucle le circuit de 8 anneaux autour de Base Alpha puis pose-toi le plus vite possible. Rejouable : bats ton record.',
    reward: 300,
    steps: [
      ...stage('Premier virage', circuitAlpha.slice(0, 3)),
      ...stage('Fin du circuit', circuitAlpha.slice(3)),
      ...stage('Arrivée à Base Alpha', land('alpha', { text: 'Pose-toi et arrête-toi : le chrono s\'arrête à l\'arrêt complet !' })),
    ],
  },
  {
    id: 'chrono-lac', title: 'Contre-la-montre : Sprint du Lac', category: 'course', airport: 'alpha', ranked: true,
    desc: 'Sprint en rase-mottes de Base Alpha au Lac Miroir : 6 anneaux bas, un passage au ras des prés, puis atterrissage sur la piste en herbe. Rejouable.',
    reward: 400,
    steps: [
      ...stage('Sprint vers le nord', sprintLac),
      ...stage('Au ras des prés', { type: 'low', maxAgl: 40, duration: 5, x: LAC.x, z: LAC.z + 1200, radius: 1600, label: 'prés de Lac Miroir', text: 'Rase les prés au sud de Lac Miroir : moins de 40 m du sol pendant 5 s' }),
      ...stage('Arrivée à Lac Miroir', land('lac', { text: 'Pose-toi sur la piste en herbe de Lac Miroir : le chrono s\'arrête à l\'arrêt complet !' })),
    ],
  },
  {
    id: 'chrono-capitale', title: 'Contre-la-montre : Tour de la Capitale', category: 'course', airport: 'capitale', ranked: true,
    desc: 'Le grand tour de la Capitale par 8 anneaux au-dessus des toits, puis retour à Capitale International. Rejouable : vise le podium !',
    reward: 450,
    steps: [
      ...stage('Moitié est', tourCapitale.slice(0, 4)),
      ...stage('Moitié ouest', tourCapitale.slice(4)),
      ...stage('Arrivée à la Capitale', land('capitale', { text: 'Pose-toi à Capitale International : le chrono s\'arrête à l\'arrêt complet !' })),
    ],
  },
];
