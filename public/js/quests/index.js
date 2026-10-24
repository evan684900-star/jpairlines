// Toutes les quêtes du jeu, regroupées par région
import base from './base.js';
import centre from './centre.js';
import ouest from './ouest.js';
import nord from './nord.js';
import sud from './sud.js';
import est from './est.js';
import defis from './defis.js';
import chrono from './chrono.js';
import terres from './terres.js';
import terres2 from './terres2.js';

export const QUEST_FILES = { base, centre, ouest, nord, sud, est, defis, chrono, terres, terres2 };
export const QUESTS = Object.values(QUEST_FILES).flat();
