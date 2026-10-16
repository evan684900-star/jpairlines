// Chat multijoueur : nettoyage des messages côté serveur (le client ne fait jamais confiance au texte reçu,
// il l'affiche toujours comme du texte brut).
const MAX = 140;

// mots grossiers masqués par des étoiles. À écrire en minuscules et sans accents : la recherche ignore
// les majuscules, les accents, les lettres répétées (« puuuute »), les séparateurs (« p.u.t.e », « c o n »)
// et les chiffres/symboles déguisés (« c0n », « pu7e », « $alope »).
const BAD = [
  'connard', 'ptn', 'con', 'encule', 'nga', 'nega', 'connasse', 'salope', 'salaud', 'enculer', 'pute', 'putain', 'batard', 'merde', 'nique', 'niquer',
  'ntm', 'fdp', 'pd', 'tg', 'ta gueule', 'bite', 'couille', 'chier', 'abruti', 'debile', 'gogol', 'negre', 'bougnoule',
  'fuck', 'fucking', 'shit', 'bitch', 'asshole', 'dick', 'cunt', 'nigger', 'nigga', 'fag', 'faggot', 'whore', 'slut',
];

// chiffres et symboles utilisés à la place des lettres
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's', '€': 'e', '!': 'i', '|': 'i' };
// un caractère → une lettre « normalisée » (minuscule, sans accent, sans déguisement)
const fold = (c) => {
  const f = c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().slice(0, 1) || c;
  return LEET[f] || f;
};
const isLetter = (c) => /[\p{L}\p{N}]/u.test(c);

// motif d'un mot : chaque lettre peut être répétée et séparée de la suivante par des espaces ou de la ponctuation
const SEP = '[^\\p{L}\\p{N}]*';
const wordPattern = (w) => [...w.replace(/ /g, '')].map((c) => `${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}+`).join(SEP);
// le mot doit être entier : pas de lettre juste avant ni juste après (« con » ne masque pas « content »)
const BAD_RE = new RegExp(`(?<![\\p{L}\\p{N}])(?:${BAD.map(wordPattern).join('|')})(?![\\p{L}\\p{N}])`, 'gu');

// positions (en caractères) des gros mots trouvés dans un texte
function badRanges(chars) {
  const folded = chars.map(fold);
  const idx = []; // caractère d'origine de chaque unité UTF-16 de la version normalisée
  folded.forEach((c, i) => { for (let k = 0; k < c.length; k++) idx.push(i); });
  const text = folded.join('');
  const out = [];
  BAD_RE.lastIndex = 0;
  let m;
  while ((m = BAD_RE.exec(text))) {
    if (!m[0].length) { BAD_RE.lastIndex++; continue; }
    out.push([idx[m.index], idx[m.index + m[0].length - 1]]);
  }
  return out;
}

// recent : textes des derniers messages du même joueur (pour repérer un mot envoyé lettre par lettre)
export function cleanChat(raw, recent = []) {
  if (typeof raw !== 'string') return '';
  // caractères de contrôle et espaces multiples retirés, longueur limitée
  let text = raw.replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX);
  if (!text) return '';
  const chars = [...text];
  for (const [a, b] of badRanges(chars)) for (let i = a; i <= b; i++) if (isLetter(chars[i])) chars[i] = '*';
  text = chars.join('');
  // mot coupé en plusieurs petits messages (« pu » puis « te ») : on bloque le message qui le complète
  if (text.length <= 4 && recent.length) {
    const pieces = [...recent.filter((r) => r.length <= 4).slice(-4), text];
    for (let k = 2; k <= pieces.length; k++) {
      if (badRanges([...pieces.slice(-k).join('')]).length) return '';
    }
  }
  // pas de messages faits uniquement d'étoiles ou de ponctuation
  return /[\p{L}\p{N}]/u.test(text) ? text : '';
}
