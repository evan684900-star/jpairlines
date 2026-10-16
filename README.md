# ✈ JP Airlines

Simulateur de vol 3D dans le navigateur, avec **une seule grande carte partagée** par tous les joueurs (monde de 80 × 80 km) et des **quêtes** réparties sur toute la carte.

## Lancer le jeu en local

```bash
npm install
npm start          # http://localhost:3000
```

`PORT=8080 npm start` pour changer le port, `MAX_PLAYERS=50` pour limiter le nombre de joueurs (100 par défaut).

## Héberger

### Option 1 — tout sur ton serveur (le plus simple)
`npm install && npm start` sur le VPS. Le serveur sert le jeu **et** le multijoueur. 1 CPU / 4 Go suffit largement : il ne fait que relayer les positions (10 fois/s), toute la 3D tourne chez les joueurs.

### Option 2 — jeu sur Vercel + multijoueur sur ton serveur
Vercel héberge très bien les fichiers du jeu, mais **ne peut pas garder un serveur WebSocket ouvert** (fonctions serverless). Il faut donc :

1. Importer le dépôt dans Vercel : `vercel.json` est déjà configuré (build = copie de three.js, dossier publié = `public`).
2. Lancer `npm start` sur ton VPS (derrière un nom de domaine en **HTTPS**, par ex. avec Caddy, car une page Vercel en `https` ne peut se connecter qu'en `wss://`).
3. Mettre l'adresse dans `public/js/config.js` :
   ```js
   export const MULTIPLAYER_URL = 'wss://jeu.mondomaine.fr/ws';
   ```

Sans serveur multijoueur, le jeu fonctionne quand même en solo.

### Comptes joueurs (e-mail + mot de passe, ou Google)

Le menu propose un compte **facultatif** : on peut toujours jouer sans. Connecté, la progression (argent, quêtes,
aéroports, avions débloqués) est sauvegardée sur le serveur et retrouvée sur n'importe quel appareil ; à la connexion,
elle est fusionnée avec celle du navigateur (aucune quête réussie n'est perdue).

- Les comptes sont gérés par le serveur Node (`accounts.js`), dans `data/accounts.json` (non versionné, à sauvegarder).
  Mots de passe hachés avec scrypt, jetons de session aléatoires (60 jours), tentatives limitées par adresse IP.
- L'API est sur le même serveur que le multijoueur (`https://…/api/…`). Si un proxy (Caddy, Nginx) est devant Node,
  il doit transmettre `/api/` en plus de `/ws` (le plus simple : tout transmettre, `reverse_proxy localhost:3000`).
- **Connexion Google** : créer un « ID client OAuth » de type *Application Web* dans la
  [console Google Cloud](https://console.cloud.google.com/apis/credentials), ajouter l'adresse du jeu
  (ex. `https://jpairlines.vercel.app`, et `http://localhost:3000` pour les tests) dans « Origines JavaScript autorisées »,
  puis lancer le serveur avec `GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com npm start`. Le bouton Google apparaît
  alors tout seul dans le menu ; sans cette variable, seule la connexion par e-mail est proposée.
- Variables facultatives : `DATA_DIR` (dossier des comptes), `ALLOWED_ORIGINS` (liste d'adresses autorisées à appeler l'API,
  séparées par des virgules ; vide = toutes, sans risque car l'API n'utilise pas de cookies).
- Pas encore de réinitialisation du mot de passe par e-mail (il faudrait un service d'envoi de mails).

## Commandes

| Touche | Action |
|---|---|
| `Z`/`W` · `S` | Plus / moins de gaz |
| `↓` · `↑` | Cabrer (monter) · piquer (descendre) |
| `←` `→` | S'incliner (ailerons) |
| `Q`/`A` · `D` | Palonnier / direction au sol |
| `T` · `B` | Trim nez haut · nez bas |
| `E` | Démarrer / couper le moteur |
| `F` · `V` | Sortir / rentrer les volets (0°/10°/20°/30°) |
| `G` | Train d'atterrissage |
| `Espace` | Freins · `P` frein de parking |
| `L` | Feux de navigation |
| `K` (maintenir) | Faire le plein : arrêté dans un aéroport, moteur coupé |
| `Entrée` | Tableau des missions (près d'une balise « ! » ou arrêté dans un aéroport) |
| `X` | Larguer un colis (missions de largage) |
| `J` · `M` | Journal de quêtes · grande carte (molette = zoom) |
| `C` · molette · clic-glisser | Caméra · zoom · tourner autour de l'avion |
| `R` | Réapparaître au dernier aéroport |
| `Échap` | Pause : paramètres, voyage vers un aéroport connu, aide |
| `H` | Aide |

**Décollage :** `E` (moteur), `P` (desserrer le frein), volets 10°, plein gaz, garder l'axe au palonnier ; vers 100 km/h tirer doucement pour lever la roue avant (≈ 285 m de roulage), monter vers 130 km/h, puis rentrer le train et les volets.
**Atterrissage :** train sorti sous 210 km/h, volets sous 165 km/h, approche vers 120 km/h en descendant de 3 à 4 m/s, ailes à plat ; arrondi juste au-dessus de la piste pour toucher à moins de 4 m/s (3 m/s en réaliste), puis freiner.

## Rendu graphique

Tout est généré par le code (aucune image ni modèle à télécharger) avec **three.js 0.160** :

- **Ciel** : diffusion atmosphérique (Rayleigh/Mie), soleil et lune qui suivent l'heure, étoiles, cycle jour/nuit sur 24 h ;
  brume en hauteur plus dense dans les vallées, plus chaude face au soleil.
- **Nuages** : cumulus éclairés comme des volumes (le côté soleil est clair, les bords s'illuminent à contre-jour),
  qui dérivent avec le vent, couche de stratus que l'on peut survoler, voile de cirrus ; leurs **ombres** défilent sur le sol.
- **Terrain** : herbe et terre avec cartes de normales, roche triplanaire sur les pentes, neige calculée au pixel,
  variations de couleur à plusieurs échelles, vallées assombries, sol mouillé sous la pluie.
- **Eau** : matériau PBR (reflets du ciel et du soleil), vagues de Gerstner, turquoise près des côtes, transparence, écume sur les plages.
- **Végétation** : arbres générés par [EZ-Tree](https://github.com/dgreenheck/ez-tree) (MIT) — pins, chênes, frênes,
  bouleaux, buissons avec écorce PBR (textures CC0 de Poly Haven et TextureCan) et feuillage détouré. Vrais arbres 3D
  autour de la caméra, « imposteurs » (photos des mêmes arbres prises au chargement) au loin : des forêts denses
  et continues, jusqu'à 9 000 arbres/km² en Ultra. Rochers photogrammétriques (glTF de la démo d'EZ-Tree).
- **Bâtiments** : maisons de six types (pavillon, maison à étage, longère, maison en L, grange, villa) avec toits en
  tuiles ou ardoise, crépi, fenêtres encadrées, volets, portes et cheminées ; en ville, tours de verre, bureaux en béton
  et immeubles de brique, toits en gravier avec acrotère et climatiseurs, sol urbain.
- **Nuit** : balisage des pistes, phares tournants des aéroports, lampadaires et fenêtres allumées, phare d'atterrissage de l'avion.
- **Post-traitement** : occlusion ambiante (SSAO), halo (bloom), rayons du soleil, reflets d'objectif, aberration chromatique,
  distorsion de vitesse, gouttes sur la verrière, vignette, tone mapping ACES, anticrénelage MSAA ou SMAA.
- **Avion** : peinture vernie, chrome, vitres transparentes, habitacle avec planche de bord animée, pilote, gouvernes, train,
  volets, hélice, feux avec halos. Caméras **poursuite, cockpit, orbite libre, spectateur** (`C`) avec transitions fluides.
- **Effets** : fumée et flamme au démarrage, échappement, poussière au roulage, fumée de pneus au toucher, crash,
  tourbillons de condensation en bout d'aile, tremblements de caméra.
- **Météo** (visuelle, ne change pas le vol) : grand beau, nuageux, couvert, pluie, orage avec éclairs et tonnerre, brouillard ;
  en mode « changeante », elle change toutes les 20 min et elle est la même pour tous les joueurs.
- **HUD « glass cockpit »** : horizon artificiel, bandes de vitesse et d'altitude, variomètre, cap, moteur et carburant ;
  polices B612 (celles des cockpits Airbus), icônes Lucide.
- **Sons** synthétisés en direct (Web Audio) : moteur, démarreur, vent, pluie, tonnerre, train, volets, décrochage.

### Réglages (`Échap` → Paramètres)

| Réglage | Effet |
|---|---|
| Qualité Bas / Moyen / Élevé / Ultra | résolution, ombres, nuages, eau, particules, MSAA, densité des forêts et nombre d'arbres 3D |
| Résolution adaptative | baisse la résolution si le jeu passe sous 60 images/s, la remonte ensuite |
| Effets visuels | ombres, post-traitement, bloom, SSAO, rayons et reflets du soleil, aberration chromatique, tremblements, particules |
| Heure | fixe, cycle jour/nuit de 24 min (le même pour tous) ou heure de l'ordinateur |
| Météo | changeante ou fixe |
| Touches | toutes modifiables (Pause → Touches), plusieurs touches par action |
| Compteur FPS, volume général, couper le son | aussi le bouton haut-parleur du HUD |
| Volume par catégorie (0–150 %) | moteur, vent, pluie, tonnerre, train/volets, alarmes, impacts, bips |

Le système « réduire les animations » coupe automatiquement les tremblements, la distorsion et les animations de l'interface.
Le post-traitement n'est chargé que s'il est activé.

## La flotte : 6 avions

On commence avec le **Cub-1** ; les cinq autres se débloquent en réussissant certaines quêtes, puis se choisissent
au **hangar** (bouton avion de la barre d'outils, ou `Échap` → Hangar). Changer d'avion arrêté dans un aéroport garde
la quête en cours ; ailleurs, le nouvel avion attend au dernier aéroport. Les autres joueurs voient l'avion que tu pilotes.

| Avion | Type (inspiré de) | Débloqué par | Max | Décrochage | Roulage | Particularités |
|---|---|---|---|---|---|---|
| Cub-1 | avion-école (Cessna 172) | — | 224 km/h | 79 km/h | 316 m | stable et indulgent, train rentrant |
| Moustique | ULM (Ikarus C42) | « Courrier pour la Capitale » | 171 km/h | 59 km/h | 128 m | très léger, décolle et se pose court, train fixe |
| Faucon | voltige (Extra 300) | « Un cœur dans le ciel » | 325 km/h | 109 km/h | 351 m | 256°/s en roulis, profil symétrique, encaisse ±10 g, sans volets |
| Mistral | bimoteur (Beechcraft Baron) | « La grande traversée » | 333 km/h | 111 km/h | 477 m | 6 places, 1 650 km d'autonomie, son de deux moteurs |
| Albatros | hydravion amphibie (Cessna 206 sur flotteurs) | « Un homme à la mer ! » | 222 km/h | 95 km/h | 419 m | se pose sur l'eau train **rentré**, sur piste train sorti |
| Éclair | biréacteur (Eclipse 500) | « Coupe : la Grande Finale » | 594 km/h | 141 km/h | 832 m | réacteurs lents à monter en régime (N1 %), empennage en T |

Chaque avion a sa masse, sa voilure, son moteur, son centre de gravité, ses roues et ses points de contact (`public/js/aircraft.js`),
son modèle 3D (construit à partir de la même description dans `planeModel.js`), ses sons et ses limites (VNE, train, volets).
Les chiffres ci-dessus sont **mesurés** par le banc d'essai (`node scripts/flight-test.mjs normal all`), qui vérifie
pour chaque avion décollage, montée, vitesse max, décrochage, virage, plané, atterrissage, vol sur le dos, piqué
et taux de roulis — plus amerrissage, déjaugeage et capotage train sorti pour l'hydravion.
Sur l'eau, l'Albatros flotte sur ses flotteurs ; s'y poser roues sorties le fait capoter (sauf en facile).

## Physique de vol

Chaque avion est simulé en corps rigide à 6 degrés de liberté (l'avion de base est réglé comme un Cessna 172) :
portance et traînée selon l'incidence (avec décrochage), hélice limitée en puissance ou réacteur, air moins dense en altitude,
stabilité et amortissement aérodynamiques, effet de sol, roues à amortisseurs avec frottement et freins.
Les virages viennent de l'inclinaison, le trim règle la vitesse à laquelle l'avion vole « tout seul ».
Comme sur un vrai avion, l'effort au manche augmente avec la vitesse : au clavier, une touche de profondeur tenue
demande environ ±1,6 g en croisière (et non le braquage maximal), mais garde tout son effet à basse vitesse
(rotation, arrondi). La « sensibilité du manche » des paramètres règle cette force.

| Mesure (banc d'essai) | Le jeu | Cessna 172 |
|---|---|---|
| Roulage au décollage | 285 m | ~290 m |
| Vitesse max en palier | 225 km/h | 225 km/h |
| Décrochage lisse / volets 30° | 89 / 79 km/h | 89 / 76 km/h |
| Finesse moteur coupé | ~10 | ~9 |
| Virage à 30° | 5,4°/s | 5,6°/s |

Le plafond (~6 km) est volontairement un peu plus haut qu'un vrai Cessna pour garder la quête « record d'altitude » faisable.
Selon la difficulté : **facile** (stabilisateur de roulis, coordination automatique, crash rare), **normale** (aides légères),
**réaliste** (aucune aide, chute d'aile au décrochage, casse au-delà de 6 g ou de la vitesse limite).
En virage, la portance penche avec l'avion : un vrai pilote tire un peu sur le manche pour ne pas descendre.
En facile et en normale, cette petite traction est ajoutée automatiquement ; en réaliste, c'est à toi de la doser.

## Carburant

Réservoir de 160 L pour le Cub-1 (de 80 L pour l'ULM à 900 L de kérosène pour le jet). Pour faire le plein : s'arrêter dans n'importe quel aéroport, **couper le moteur (`E`)**, maintenir **`K`**
(1 ₣ le litre ; sans argent, l'aéroport offre du carburant de secours jusqu'à 40 L). La consommation est accélérée ×4 par défaut
(≈ 50 min plein gaz, ≈ 200 km en croisière) ; on peut la passer en réaliste ou la désactiver dans les paramètres.

## Quêtes et progression

- **Tableau des missions** dans chaque aéroport (`Entrée` à l'arrêt) et balises jaunes « ! » pour les quêtes trouvées sur le terrain.
- **11 types d'objectifs** : anneaux, atterrissage, toucher-décoller, survol, largage de colis (`X`, jugé au point d'impact),
  altitude, vitesse, rase-mottes, palier, vol sur le dos, escorte de bateau ou de montgolfière ; chronos avec bonus ;
  objets de mission (radeau, randonneur, caisse…).
- **Missions de transport du jour** : 3 par aéroport, renouvelées chaque jour, identiques pour tous les joueurs.
- **Rangs de pilote** (Élève pilote → As du ciel) selon l'expérience gagnée ; certaines quêtes demandent un rang minimum.

## Contenu

- **Monde 80 × 80 km** généré à partir d'une graine fixe (identique pour tous) : grand continent, chaîne de montagnes enneigées, désert au sud-ouest, toundra au nord, île volcanique, archipels. Le terrain est chargé par morceaux autour de l'avion avec plusieurs niveaux de détail.
- **14 aéroports** de 3 tailles (international avec terminal et avions de ligne, régional, piste en herbe), avec balisage, tour, hangars et pompe à essence.
- **Villes et villages**, champs cultivés, forêts (sapins, feuillus, palmiers, cactus), éoliennes, bateaux qui naviguent, montgolfières, nuages.
- **14 lieux** : volcan fumant, Toit du Monde, phares, tour radio, arche marine, épave, plateforme pétrolière, château, pyramides, observatoire, stade, colosse.
- **Les avions** (6, voir la flotte) : moteur à démarrer, régime, carburant, volets à crans, train rentrant ou fixe, freins et frein de parking, trim, feux, gouvernes animées. Alarmes : décrochage, train, vitesse volets/train, carburant, terrain. Dégâts en survitesse (volets rentrés de force, train arraché).
- **72 quêtes** réparties sur toute la carte, avec des histoires en plusieurs épisodes.
- **Paramètres** : qualité, distance de vue, densité de végétation, champ de vision, nuages, difficulté (facile / normale / réaliste), carburant, accélération du temps, sensibilité, unités (km/h·m ou nœuds·pieds), volume…
- **Multijoueur** : on voit les autres avions (leur modèle, train, volets, feux, hélice) et leurs noms.

## Structure

```
server.js             serveur HTTP + WebSocket (/ws)
accounts.js           comptes joueurs et sauvegarde en ligne (/api/…)
vercel.json           config d'hébergement statique
public/index.html     page, HUD, menus
public/js/config.js   adresse du serveur multijoueur (et des comptes)
public/js/account.js  compte joueur côté jeu : connexion, Google, synchronisation de la sauvegarde
public/js/world.js    relief, aéroports, lieux, bateaux, montgolfières (déterministe)
public/js/terrain.js  terrain par morceaux (niveaux de détail)
public/js/decor.js    arbres et villages autour du joueur
public/js/objects.js  aéroports, villes, monuments, bateaux, éoliennes
public/js/aircraft.js la flotte : caractéristiques, géométrie, sons et déblocage de chaque avion
public/js/plane.js    physique de vol (6 degrés de liberté), commune à tous les avions
public/js/planeModel.js modèles 3D des avions, construits depuis aircraft.js (matériaux PBR, habitacle)
public/js/render/     rendu : config (qualité), renderer (orchestration), sky, clouds, weather,
                      materials (terrain, bâtiments), water, post (post-traitement), effects, cameras,
                      shared (brume, ombres des nuages), textures, heightmap
public/js/ui/         instruments (PFD, planche de bord), audio (sons), icons (Lucide)
public/js/quests/     quêtes par région (kit.js = format, engine.js = moteur)
public/js/settings.js paramètres
public/js/main.js     boucle de jeu, caméra, HUD, carburant, réseau
scripts/flight-test.mjs     banc d'essai en vol automatique (node scripts/flight-test.mjs [easy|normal|realistic] [avion|all])
scripts/validate-quests.mjs vérifie toutes les quêtes (format, relief, chronos)
scripts/quest-reference.mjs données de la carte pour écrire des quêtes
```
