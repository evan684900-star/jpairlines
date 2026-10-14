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

## Physique de vol

L'avion est simulé comme un vrai avion léger (type Cessna 172), en corps rigide à 6 degrés de liberté :
portance et traînée selon l'incidence (avec décrochage), hélice limitée en puissance, air moins dense en altitude,
stabilité et amortissement aérodynamiques, effet de sol, roues à amortisseurs avec frottement et freins.
Les virages viennent de l'inclinaison, le trim règle la vitesse à laquelle l'avion vole « tout seul ».

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

## Carburant

Réservoir de 160 L. Pour faire le plein : s'arrêter dans n'importe quel aéroport, **couper le moteur (`E`)**, maintenir **`K`**
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
- **L'avion (Cub-1)** : moteur à démarrer, régime, carburant, volets à 4 crans, train rentrant, freins et frein de parking, trim, feux, gouvernes animées. Alarmes : décrochage, train, vitesse volets/train, carburant, terrain. Dégâts en survitesse (volets rentrés de force, train arraché).
- **72 quêtes** réparties sur toute la carte, avec des histoires en plusieurs épisodes.
- **Paramètres** : qualité, distance de vue, densité de végétation, champ de vision, nuages, difficulté (facile / normale / réaliste), carburant, accélération du temps, sensibilité, unités (km/h·m ou nœuds·pieds), volume…
- **Multijoueur** : on voit les autres avions (train, volets, feux, hélice) et leurs noms.

## Structure

```
server.js             serveur HTTP + WebSocket (/ws)
vercel.json           config d'hébergement statique
public/index.html     page, HUD, menus
public/js/config.js   adresse du serveur multijoueur
public/js/world.js    relief, aéroports, lieux, bateaux, montgolfières (déterministe)
public/js/terrain.js  terrain par morceaux (niveaux de détail)
public/js/decor.js    arbres et villages autour du joueur
public/js/objects.js  aéroports, villes, monuments, bateaux, nuages
public/js/plane.js    physique de vol (6 degrés de liberté)
public/js/planeModel.js modèle 3D de l'avion
public/js/graphics.js ciel, eau, nuages, textures procédurales
public/js/quests/     quêtes par région (kit.js = format, engine.js = moteur)
public/js/settings.js paramètres
public/js/main.js     boucle de jeu, caméra, HUD, carburant, réseau
scripts/flight-test.mjs     banc d'essai en vol automatique (node scripts/flight-test.mjs [easy|normal|realistic])
scripts/validate-quests.mjs vérifie toutes les quêtes (format, relief, chronos)
scripts/quest-reference.mjs données de la carte pour écrire des quêtes
```
