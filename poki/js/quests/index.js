// Toutes les quêtes du jeu, regroupées par région
import base from './base.js';
import centre from './centre.js';
import ouest from './ouest.js';
import nord from './nord.js';
import sud from './sud.js';
import est from './est.js';
import defis from './defis.js';

export const QUEST_FILES = { base, centre, ouest, nord, sud, est, defis };
export const QUESTS = Object.values(QUEST_FILES).flat();

// version anglaise : on remplace titres, descriptions, consignes et libellés
import { lang } from '../i18n.js';
import EN from './en.js';
if (lang === 'en') {
  for (const q of QUESTS) {
    const e = EN[q.id];
    if (!e) continue;
    if (e.title) q.title = e.title;
    if (e.desc) q.desc = e.desc;
    for (const [i, text] of Object.entries(e.steps || {})) if (q.steps[i]) q.steps[i].text = text;
    for (const [i, label] of Object.entries(e.labels || {})) if (q.steps[i]) q.steps[i].label = label;
  }
}
