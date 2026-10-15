// Traduction de la page HTML (version anglaise) : chaque morceau de texte français est remplacé
// par son équivalent, en gardant la mise en forme (touches <kbd>, icônes, gras).
import { lang } from './i18n.js';

const EN = {
  '(maintenir)': '(hold)',
  ') et les volets (': ') and the flaps (',
  ') pour lever la roue avant, l\'avion décolle tout seul. Monter vers 130 km/h, puis rentrer le train (': ') to lift the nose wheel, the plane takes off by itself. Climb at about 130 km/h, then raise the gear (',
  ') règle la vitesse à laquelle il vole « tout seul ».': ') sets the speed at which it flies "by itself".',
  '), plein gaz, garder l\'axe au palonnier ; vers 100 km/h tirer doucement (': '), full throttle, keep it straight with the rudder; at about 100 km/h gently pull (',
  'Abandonner la quête en cours': 'Abandon the current quest',
  'Appuie sur': 'Press',
  'Astuce :': 'Tip:',
  'Atterrissage :': 'Landing:',
  'Aéroports': 'Airports',
  'Cabrer (monter) · piquer (descendre)': 'Pitch up (climb) · pitch down (descend)',
  'Caméra (poursuite, cockpit, orbite libre, spectateur) · zoom · tourner autour de l\'avion': 'Camera (chase, cockpit, free orbit, spectator) · zoom · look around the plane',
  'Carte (M)': 'Map (M)',
  'Changer de caméra (C)': 'Change camera (C)',
  Commandes: 'Controls',
  'Couper / remettre le son': 'Mute / unmute',
  'Crash !': 'Crash!',
  'Décollage :': 'Takeoff:',
  Décoller: 'Play',
  'Démarrer / couper le moteur': 'Start / stop the engine',
  'Effacer ma progression': 'Erase my progress',
  Entrée: 'Enter',
  Espace: 'Space',
  FEUX: 'LIGHTS',
  FREINS: 'BRAKES',
  'Faire le plein : arrêté dans un aéroport, moteur coupé (1 ₣ le litre)': 'Refuel: stopped at an airport, engine off (1 ₣ per litre)',
  Fermer: 'Close',
  'Feux de navigation': 'Navigation lights',
  'Frein de parking': 'Parking brake',
  'Freins (maintenir)': 'Brakes (hold)',
  'Génération du monde…': 'Generating the world…',
  'Hangar : choisir son avion': 'Hangar: choose your plane',
  Jeu: 'Game',
  'Journal de quêtes': 'Quest log',
  'Journal de quêtes (J)': 'Quest log (J)',
  'Journal de quêtes · grande carte': 'Quest log · big map',
  'Larguer un colis (missions de largage)': 'Drop a package (drop missions)',
  MOTEUR: 'ENGINE',
  'Molette : zoom · Glisser : déplacer ·': 'Wheel: zoom · Drag: move ·',
  'Nom de pilote': 'Pilot name',
  Paramètres: 'Settings',
  Passer: 'Skip',
  'Pause et paramètres': 'Pause and settings',
  'Pause et paramètres (Échap)': 'Pause and settings (Esc)',
  'Physique :': 'Physics:',
  Pilotage: 'Flying',
  Pilote: 'Pilot',
  'Plus / moins de gaz': 'More / less throttle',
  Poursuite: 'Chase',
  Reprendre: 'Resume',
  'Revoir le tutoriel': 'Replay the tutorial',
  'Réapparais dans un aéroport où tu t\'es déjà posé.': 'Respawn at an airport where you have already landed.',
  'Réapparaître au dernier aéroport': 'Respawn at the last airport',
  'S\'incliner (ailerons)': 'Bank (ailerons)',
  'Sortir / rentrer le train d\'atterrissage': 'Lower / raise the landing gear',
  'Sortir / rentrer les volets (crans selon l\'avion)': 'Lower / raise the flaps (steps depend on the plane)',
  Systèmes: 'Systems',
  TRAIN: 'GEAR',
  'Ta flotte. Les nouveaux avions se débloquent en réussissant certaines quêtes. Changer d\'avion arrêté dans un aéroport garde ta quête en cours ; ailleurs, il t\'attend à ton dernier aéroport.':
    'Your fleet. New planes are unlocked by completing certain quests. Switching planes while stopped at an airport keeps your current quest; elsewhere, the plane waits at your last airport.',
  'Tableau des missions': 'Mission board',
  'Tableau des missions (près d\'une balise « ! » ou arrêté dans un aéroport)': 'Mission board (near a "!" marker or stopped at an airport)',
  'Trim nez haut · nez bas': 'Trim nose up · nose down',
  'Un monde de 80 × 80 km à explorer, des missions et 6 avions à débloquer.': 'An 80 × 80 km world to explore, missions and 6 planes to unlock.',
  VOLETS: 'FLAPS',
  'Va aux balises jaunes': 'Go to the yellow markers',
  'change de caméra (poursuite, cockpit, orbite, spectateur) ·': 'changes camera (chase, cockpit, orbit, spectator) ·',
  'desserrer le frein, volets 10° (': 'release the brake, flaps 10° (',
  fermer: 'close',
  'l\'avion vole vraiment (portance, traînée, inertie) : il tourne en s\'inclinant, décroche vers 90 km/h (75 km/h volets sortis), monte moins bien en altitude, et accélère en piqué. Le trim (':
    'the plane really flies (lift, drag, inertia): it turns by banking, stalls at about 90 km/h (75 km/h with flaps), climbs less well at altitude and speeds up in a dive. The trim (',
  'moteur,': 'engine,',
  'ou arrête-toi dans un aéroport, puis appuie sur': 'or stop at an airport, then press',
  'paramètres et qualité graphique': 'settings and graphics quality',
  'pour ouvrir le tableau des missions.': 'to open the mission board.',
  'pour repartir du dernier aéroport.': 'to restart from the last airport.',
  'réduire les gaz, train sorti sous 210 km/h, volets sous 165 km/h, approche à ~120 km/h en descendant de 3 à 4 m/s, ailes à plat. Juste au-dessus de la piste, cabrer un peu (arrondi) pour toucher doucement (moins de 4 m/s en normal), puis freiner.':
    'reduce throttle, gear down below 210 km/h, flaps below 165 km/h, approach at ~120 km/h descending at 3 to 4 m/s, wings level. Just above the runway, pull up a little (flare) to touch down gently (less than 4 m/s in normal mode), then brake.',
  '· molette · clic-glisser': '· wheel · click-drag',
  Échap: 'Esc',
};

function walk(root) {
  const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (it.nextNode()) nodes.push(it.currentNode);
  for (const n of nodes) {
    const t = n.nodeValue.trim();
    if (EN[t]) n.nodeValue = n.nodeValue.replace(t, EN[t]);
  }
  for (const el of root.querySelectorAll('[title], [placeholder]')) {
    for (const a of ['title', 'placeholder']) { const v = el.getAttribute(a); if (v && EN[v]) el.setAttribute(a, EN[v]); }
  }
  for (const tpl of root.querySelectorAll('template')) walk(tpl.content);
}

// à appeler avant l'affichage des icônes et la construction des menus
export function translateDOM() {
  document.documentElement.lang = lang;
  if (lang === 'en') walk(document.body);
}
