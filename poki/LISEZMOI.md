# JP Airlines — version Poki

Copie du jeu adaptée à Poki : solo (sans comptes ni multijoueur), aucune requête vers l'extérieur,
graphismes allégés, chargement plus rapide. Le site principal (dossier `public/`) n'est pas modifié.

- Construire l'archive à envoyer : `node scripts/build-poki.js` → `dist/jpairlines-poki.zip`
- Tester en local : `cd poki && python3 -m http.server 3124` puis http://localhost:3124/
  (après au moins un `node scripts/build-poki.js`, qui copie les bibliothèques dans `poki/vendor`)
