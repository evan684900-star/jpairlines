# ✈ JP Airlines

Simulateur de vol 3D simple, dans le navigateur, avec **une seule grande carte partagée** par tous les joueurs (île de 20 × 20 km) et des **quêtes** réparties autour de la carte.

## Lancer le jeu

```bash
npm install
npm start          # http://localhost:3000
```

Le port se change avec `PORT=8080 npm start`. Le nombre de joueurs max avec `MAX_PLAYERS` (100 par défaut).

Le serveur ne fait que servir les fichiers et relayer les positions des joueurs (10 fois par seconde) : un petit VPS (1 CPU / 4 Go) suffit largement. Toute la 3D tourne dans le navigateur des joueurs.

## Commandes

| Touche | Action |
|---|---|
| `Z` / `W` · `S` | Plus / moins de gaz |
| `↓` · `↑` | Cabrer (monter) · piquer (descendre) |
| `←` `→` | S'incliner (virer) |
| `Q`/`A` · `D` | Palonnier / direction au sol |
| `Espace` | Freins |
| `F` | Accepter une quête (près d'une balise jaune « ! ») |
| `J` | Journal de quêtes |
| `M` | Grande carte |
| `C` | Caméra extérieure / cockpit |
| `R` | Réapparaître au dernier aéroport |
| `I` | Inverser la profondeur |

Décollage : plein gaz, attendre ~90 km/h, tirer légèrement. Atterrissage : réduire les gaz, descendre doucement (moins de 7 m/s), ailes à plat, puis freiner jusqu'à l'arrêt sur la piste.

## Contenu

- **Carte** : île générée à partir d'une graine fixe (`public/js/world.js`), identique pour tout le monde — montagnes, forêts, villes, lacs, 5 aéroports et des lieux (phare, tour radio, arche, épave, sommet).
- **Avion** : un seul avion de base (Cub-1) pour l'instant.
- **Quêtes** (9) : anneaux à traverser, livraisons d'un aéroport à l'autre, exploration, altitude. Elles rapportent de l'argent (₣). La progression est sauvegardée dans le navigateur.
- **Multijoueur** : on voit les autres pilotes en temps réel (nom au-dessus de l'avion, points roses sur la carte).

## Structure

```
server.js            serveur HTTP + WebSocket (/ws)
public/index.html    page et HUD
public/style.css
public/js/world.js   carte, aéroports, quêtes (déterministe)
public/js/plane.js   modèle 3D et physique de l'avion
public/js/main.js    rendu three.js, quêtes, HUD, réseau
```
