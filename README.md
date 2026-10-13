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
| `←` `→` | S'incliner |
| `Q`/`A` · `D` | Palonnier / direction au sol |
| `T` · `B` | Trim nez haut · nez bas |
| `E` | Démarrer / couper le moteur |
| `F` · `V` | Sortir / rentrer les volets (0°/10°/20°/30°) |
| `G` | Train d'atterrissage |
| `Espace` | Freins · `P` frein de parking |
| `L` | Feux de navigation |
| `K` (maintenir) | Faire le plein, arrêté dans un aéroport |
| `Entrée` | Accepter une quête (balise jaune « ! ») |
| `J` · `M` | Journal de quêtes · grande carte (molette = zoom) |
| `C` · molette · clic-glisser | Caméra · zoom · tourner autour de l'avion |
| `R` | Réapparaître au dernier aéroport |
| `Échap` | Pause : paramètres, voyage vers un aéroport connu, aide |
| `H` | Aide |

**Décollage :** `E` (moteur), `P` (desserrer le frein), volets 10°, plein gaz, tirer doucement vers 95 km/h, puis rentrer le train et les volets.
**Atterrissage :** train sorti sous 210 km/h, volets sous 165 km/h, descente douce (< 7 m/s en difficulté normale), ailes à plat, freins.

## Contenu

- **Monde 80 × 80 km** généré à partir d'une graine fixe (identique pour tous) : grand continent, chaîne de montagnes enneigées, désert au sud-ouest, toundra au nord, île volcanique, archipels. Le terrain est chargé par morceaux autour de l'avion avec plusieurs niveaux de détail.
- **14 aéroports** de 3 tailles (international avec terminal et avions de ligne, régional, piste en herbe), avec balisage, tour, hangars et pompe à essence.
- **Villes et villages**, champs cultivés, forêts (sapins, feuillus, palmiers, cactus), éoliennes, bateaux qui naviguent, montgolfières, nuages.
- **14 lieux** : volcan fumant, Toit du Monde, phares, tour radio, arche marine, épave, plateforme pétrolière, château, pyramides, observatoire, stade, colosse.
- **L'avion (Cub-1)** : moteur à démarrer, régime, carburant, volets à 4 crans, train rentrant, freins et frein de parking, trim, feux, gouvernes animées. Alarmes : décrochage, train, vitesse volets/train, carburant, terrain. Dégâts en survitesse (volets rentrés de force, train arraché).
- **19 quêtes** : anneaux, livraisons, exploration, altitude, survols à basse altitude.
- **Paramètres** : qualité, distance de vue, densité de végétation, champ de vision, nuages, difficulté (facile / normale / réaliste), carburant, accélération du temps, sensibilité, unités (km/h·m ou nœuds·pieds), volume…
- **Multijoueur** : on voit les autres avions (train, volets, feux, hélice) et leurs noms.

## Structure

```
server.js             serveur HTTP + WebSocket (/ws)
vercel.json           config d'hébergement statique
public/index.html     page, HUD, menus
public/js/config.js   adresse du serveur multijoueur
public/js/world.js    relief, aéroports, lieux, quêtes (déterministe)
public/js/terrain.js  terrain par morceaux (niveaux de détail)
public/js/decor.js    arbres et villages autour du joueur
public/js/objects.js  aéroports, villes, monuments, bateaux, nuages
public/js/plane.js    modèle 3D et physique de l'avion
public/js/settings.js paramètres
public/js/main.js     boucle de jeu, caméra, quêtes, HUD, réseau
```
