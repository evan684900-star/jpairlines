// Chat multijoueur : nettoyage des messages côté serveur (le client ne fait jamais confiance au texte reçu,
// il l'affiche toujours comme du texte brut).
const MAX = 140;

// mots grossiers courants (FR/EN) masqués par des étoiles ; la recherche ignore accents et majuscules
const BAD = [
  'connard', 'connasse', 'salope', 'salaud', 'encule', 'enculer', 'pute', 'putain', 'batard', 'merde', 'nique', 'niquer',
  'ntm', 'fdp', 'pd', 'tg', 'ta gueule', 'bite', 'couille', 'chier', 'abruti', 'debile', 'gogol', 'negre', 'bougnoule',
  'fuck', 'fucking', 'shit', 'bitch', 'asshole', 'dick', 'cunt', 'nigger', 'nigga', 'fag', 'faggot', 'whore', 'slut',
];
const fold = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const BAD_RE = new RegExp(`(^|[^\\p{L}\\p{N}])(${BAD.map((w) => w.replace(/ /g, '\\s+')).join('|')})(?=$|[^\\p{L}\\p{N}])`, 'gu');

export function cleanChat(raw) {
  if (typeof raw !== 'string') return '';
  // caractères de contrôle et espaces multiples retirés, longueur limitée
  let text = raw.replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX);
  if (!text) return '';
  // masquage : on travaille sur la version sans accents, de même longueur que l'original caractère par caractère
  const chars = [...text];
  const folded = chars.map((c) => fold(c).slice(0, 1) || c).join('');
  let m;
  const mask = new Array(chars.length).fill(false);
  const idx = []; // position (en caractères) de chaque unité UTF-16 de folded
  [...folded].forEach((c, i) => { for (let k = 0; k < c.length; k++) idx.push(i); });
  BAD_RE.lastIndex = 0;
  while ((m = BAD_RE.exec(folded))) {
    const start = m.index + m[1].length, end = m.index + m[0].length;
    for (let u = start; u < end; u++) mask[idx[u]] = true;
  }
  text = chars.map((c, i) => (mask[i] && c !== ' ' ? '*' : c)).join('');
  // pas de messages faits uniquement d'étoiles ou de ponctuation
  return /[\p{L}\p{N}]/u.test(text) ? text : '';
}
