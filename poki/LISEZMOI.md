# JP Airlines — version Poki

Copie du jeu adaptée à Poki (le site principal, dossier `public/`, n'est pas modifié) :

- **solo** : pas de comptes ni de multijoueur, aucune requête vers l'extérieur (sauf le SDK Poki) ;
- **graphismes allégés** : 3 niveaux de qualité, moins d'arbres, chargement plus rapide ; qualité basse d'office sur mobile ;
- **tutoriel du premier vol**, puis première mission lancée automatiquement ; mode facile par défaut, temps clair ;
- **français et anglais** (langue du navigateur, boutons FR/EN dans le menu, choix dans les paramètres) ;
- **commandes tactiles** : manche virtuel, manette des gaz, boutons ; écran « tourne ton appareil » en portrait ;
- **SDK Poki** (`js/poki-sdk.js`) : `gameLoadingFinished`, `gameplayStart/Stop` (pause, menus),
  `commercialBreak` après un crash (avant de repartir) et après une mission réussie au sol,
  `rewardedBreak` volontaire : « Essayer cet avion le temps d'un vol » au hangar pour un avion encore verrouillé.
  Sans SDK (test local, bloqueur de pubs), le jeu marche normalement, sans pub.

## Construire l'archive à envoyer

    node scripts/build-poki.js      →  dist/jpairlines-poki.zip

## Tester en local

    node scripts/build-poki.js
    cd poki && python3 -m http.server 3124      →  http://localhost:3124/

Paramètres d'URL utiles : `?nopoki` (sans SDK), `?pokidebug` (mode test du SDK Poki).
