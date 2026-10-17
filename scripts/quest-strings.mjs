// Liste les textes affichés des quêtes (titres, descriptions, noms d'étapes, textes, lieux) sans traduction
// anglaise (public/js/lang/en-quests*.js). Usage : node scripts/quest-strings.mjs [fichier…]  (ex : base centre)
import { QUEST_FILES } from '../public/js/quests/index.js';
import EN1 from '../public/js/lang/en-quests.js';
import EN2 from '../public/js/lang/en-quests2.js';
const EN = { ...EN1, ...EN2 };
const files = process.argv.slice(2);
const out = new Set();
for (const [f, list] of Object.entries(QUEST_FILES)) {
  if (files.length && !files.includes(f)) continue;
  for (const q of list) {
    out.add(q.title); out.add(q.desc);
    for (const st of q.steps) for (const k of ['text', 'stage', 'label']) if (st[k]) out.add(st[k]);
  }
}
const missing = [...out].filter((s) => !(s in EN));
console.log(JSON.stringify(missing, null, 1));
console.error(`${out.size} textes, ${missing.length} sans traduction`);
