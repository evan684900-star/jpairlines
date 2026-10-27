# ✈ JP Airlines

Simulateur de vol 3D dans le navigateur, avec **une seule grande carte partagée** par tous les joueurs (monde de 200 × 200 km) et des **quêtes** réparties sur toute la carte.

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
  ajouter l'adresse `https://ton-serveur/api/google-redirect` dans « URI de redirection autorisés »
  (la connexion se fait par redirection, sans fenêtre surgissante bloquée par les navigateurs),
  puis lancer le serveur avec `GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com npm start`
  (et `GAME_URL=https://ton-jeu/` si le jeu n'est pas sur https://jpairlines.vercel.app). Le bouton Google apparaît
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

### Manette Xbox / PlayStation

Branche la manette (USB ou Bluetooth) puis appuie sur un bouton : le jeu la détecte et les messages affichent ses boutons.

| Manette (Xbox · PlayStation) | Action |
|---|---|
| Stick gauche | Manche : tirer pour monter, incliner pour tourner |
| RT · LT (R2 · L2) | Plus / moins de gaz (analogique) |
| Stick droit | Regarder autour de l'avion |
| LB · RB (L1 · R1) | Palonnier gauche / droit |
| A (✕) | Freins (maintenir) · « Continuer » dans le tutoriel · repartir après un crash |
| B (○) · X (□) · Y (△) | Train · moteur · caméra |
| Croix ↑ ↓ · ← → | Volets rentrer / sortir · trim |
| L3 · R3 | Frein de parking · fumigène |
| Menu (Options) | Pause |
| Vue (Create) | Grande carte ; **maintenue** + A missions, + B réapparaître, + X plein, + Y journal, + LB feux, + RB largage, + ↑ HUD, + ↓ aide |

Dans les menus (pause, hangar, carte, tableau des missions) : stick ou croix pour choisir, A (✕) pour valider,
B (○) pour revenir, LB / RB pour changer d'onglet. Tous les boutons sont modifiables dans Pause → Touches (« + 🎮 »).
Vibrations au toucher des roues et en cas de crash (si la manette et le navigateur le permettent).

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

### Carte détaillée et repères

La grande carte (`M`, molette pour zoomer) calcule des tuiles de plus en plus fines en zoomant (jusqu'à 2,4 m par pixel),
avec relief ombré, courbes de niveau tous les 50 m et rivages ; la mini-carte en profite aussi. **Clic gauche** (sans
glisser) : pose un repère 📍 avec sa distance ; clic sur un repère : le retire ; « Effacer les repères » les retire tous
(30 maximum, sauvegardés avec la progression). Le dernier repère posé est relié à l'avion par un trait rouge
pointillé (comme une quête) ; arrivé à moins de 250 m, il disparaît et le précédent prend le relais.

### Pluie, orage et vent

- Son de pluie (`public/sounds/pluie.mp3`) en boucle : fort dehors, étouffé dans le cockpit.
- Éclairs et tonnerre visibles aussi quand il pleut (plus rarement qu'en orage).
- La pluie et l'orage renforcent le vent (14 et 22 m/s) avec des rafales : arbres, vagues et sifflement suivent, et en vol
  l'avion est secoué (rafales verticales, roulis, tangage ; ×0,4 en facile, ×0,8 en normal, ×1,2 en réaliste).
- En vue cockpit, la pluie est **sur le pare-brise** (`public/js/render/windshield.js`) : l'eau est simulée dans une
  petite image propre à la vitre (512 × 256, 30 fois par seconde). Les gouttes tombent une par une (plus vite quand il
  pleut fort ou en vol), se rejoignent, glissent (vers le bas à l'arrêt, vers le haut et les côtés en vol) et sèchent.
  Pour chaque pixel, le jeu calcule le point de la vitre traversé par le regard : les gouttes restent collées au
  pare-brise quand on tourne la tête. Option : Paramètres → Effets visuels → « Gouttes de pluie sur le pare-brise ».
- **Essuie-glaces** (`I`, manette : Vue + ✚←) : deux bras en 3D fixés au pare-brise. Seule la raclette en caoutchouc
  essuie (pas le bras ni le pied) ; en changeant de sens, elle lâche un fin cordon de gouttelettes, comme une vraie.
  La pluie revient ensuite au rythme normal. Coupés, ils finissent leur balayage et se garent.

### Sons des moteurs

Chaque moteur est synthétisé en direct (AudioWorklet, `public/js/ui/engine-worklet.js`) : les cylindres explosent
à tour de rôle (plus fort et plus irrégulier quand on met les gaz, petits ratés au ralenti), le son résonne dans le pot
d'échappement, et l'hélice ajoute son souffle rythmé par les pales. Cub-1 : 4 cylindres à plat ; Moustique : Rotax
qui tourne vite avec réducteur ; Faucon : 6 cylindres de voltige, le plus fort ; Mistral : deux 6 cylindres
désaccordés (battement des bimoteurs, en stéréo) ; Albatros : moteur en étoile à 9 cylindres ; Éclair : turbine
(fan, compresseur, souffle). Plus sourd dans le cockpit et au loin.

### Monde de 200 km

Le monde fait 200 × 200 km. Les 80 km d'origine sont au centre, strictement identiques (relief, aéroports, villes,
quêtes) ; autour, de nouvelles terres : un grand continent froid au nord (Boréal International, Taïga, Fjord-aux-Ours),
des terres à l'est (Porte d'Orient, Savane Dorée), au sud (Grand Lagon), au sud-ouest (Mangrove) et à l'ouest
(Ponant), avec quatre villes (Boréalis, Orientia, Ponant-la-Grande, Lagon-City) et des villages. Le climat continue :
plus froid au nord, tropical au sud. Le bord du monde redevient océan.

**Quêtes des nouvelles terres** (`quests/terres.js`) : quatre routes balisées pour y aller (Port-Levant → Porte
d'Orient, Cap Nord → Boréal, Les Falaises → Ponant, l'archipel → Grand Lagon), puis six missions sur place
(vivres pour la taïga, sauvetage au-dessus du fjord, tournée d'Orientia, safari, récif du lagon, facteur de la mangrove).
Deuxième série (`quests/terres2.js`, 36 quêtes) : quatre à six missions par aéroport des nouvelles terres
(spirale au-dessus de Boréalis, station sur la banquise, feu de forêt dans la taïga, trois sommets du fjord, temples
de la jungle, rallye Savane-Orient, radeau à la dérive, île au trésor, labyrinthe de la mangrove, phare du bout du
monde…) et de grands voyages : pôle Nord, Grand Sud, du Grand Nord à l'Orient et le tour du monde (rang 3).

La température de l'air (selon le climat, l'altitude et la nuit) est affichée dans la pastille météo.

### Vie au sol des aéroports

Chaque aéroport a ses véhicules (modèles 3D « Car Kit » de Kenney, licence CC0, dans `public/models/vehicules/`) :
camion-citerne près de la pompe, camion de pompiers et ambulance, tracteur de piste et plots près des avions garés,
camionnette, caisses, voitures sur le parking de la tour, et pour les grands aéroports des camions de service et des
tracteurs près des avions de ligne. Un véhicule de service fait le tour du parking. Tous les véhicules immobiles
d'un aéroport ne forment qu'un seul objet, affiché seulement à moins de 6 km (`airportLife.js`).

Textures photo (ambientCG, licence CC0, `public/textures/`, réduites en 512 px) : béton des parkings, grain du
bitume des pistes (relief et brillance sous les marquages) et tôle ondulée des hangars.

Son : en plus du moteur synthétisé, une vraie hélice enregistrée (« Airplane Prop Loop » de jakobthiesen, mis en
boucle par AntumDeluge, licence CC-BY 3.0, https://opengameart.org/content/airplane-prop-loop, voir
`public/sounds/CREDITS.txt`) est jouée plus ou moins vite pour suivre le régime de chaque avion à hélice (deux
sources désaccordées, gauche et droite, pour le bimoteur).

### Vie des villes

Les immeubles des villes sont posés sur le point le plus bas de leur emprise (plus d'immeuble enfoncé dans une
pente), un seul par îlot. Quand on s'approche d'une ville, ses rues apparaissent (asphalte qui suit le relief, autour
des îlots) et des voitures y circulent (`cityLife.js`) : chacune fait le tour d'un pâté de maisons, sur la voie de
droite. La ville est préparée par petits morceaux (quelques millisecondes par image) pour ne pas saccader.

### Hangar : caisses et raretés

Chaque élément du hangar a une rareté : **Commun, Rare, Épique, Légendaire, Exotique** (couleur et tri dans les
listes). Les nouveautés ne s'achètent pas : elles se gagnent dans les **caisses** (onglet 🎁 Caisses) :
standard (1 500 ₣), de pilote (4 000 ₣) et de l'As (9 000 ₣), chacune avec ses chances par rareté. L'ouverture fait
défiler une bande d'éléments qui ralentit jusqu'au gain ; un doublon rembourse une partie de la caisse (20 % pour un
commun, jusqu'à 100 % pour un exotique). Les éléments gagnés servent sur tous les avions.

Nouveautés (57, dans les caisses) : 14 motifs (bandes du Débarquement, rayons de soleil façon voltige, filet de ligne
aérienne, rétro années 50, chasseur 1944, zèbre, léopard, nid d'abeille, écossais, éclaboussures, ciel étoilé, pixels,
fibre de carbone, grande diagonale), 6 décors d'ailes, 6 finitions (caméléon, aluminium brossé, miroir, velours, givré,
perle), 9 emblèmes, 12 autocollants, 3 effets de fumigène (deux couleurs, arc-en-ciel, bleu-blanc-rouge, visibles par
les autres joueurs) et la couleur de l'immatriculation.

**Tenues du pilote** (onglet Pilote, `pilotOutfit.js`) : 13 vraies tenues, visibles dans l'avion, au hangar et dans la
cinématique. Chacune recolore entièrement les vêtements (en gardant les plis du modèle), avec parfois un motif
(fleurs, camouflage, carreaux, bandes), cache la casquette et la cravate quand il le faut et ajoute des accessoires
attachés à la tête ou au cou : casque à visière (voltige, escadrille, course), serre-tête en cuir et lunettes
(années 30), casque radio (vol de nuit), chapeau de paille et lunettes de soleil (tropiques), chapeau de cow-boy,
casque de pompier, bandana et bandeau de pirate, bonnet de Noël, bulle de cosmonaute, écharpes. Les six nouvelles
(course, pompier, cow-boy, pirate, Père Noël, cosmonaute) se gagnent dans les caisses.

### Qualité « Personnalisé »

Paramètres → Graphismes → Qualité → « Personnalisé » : on choisit soi-même chaque effet, la résolution de l'image, la
finesse des ombres, l'anticrénelage et le détail du décor. Cocher ou décocher un effet sur un préréglage (Bas, Moyen…)
passe automatiquement en « Personnalisé » en gardant le reste ; cocher un effet du post-traitement (lignes « · »)
active aussi le post-traitement, dont ils dépendent.

### Performances des menus

Quand un menu est ouvert (pause, aide, carte, journal, missions), la 3D est figée sur la dernière image au lieu
d'être recalculée derrière le panneau flouté. En vol, le HUD n'utilise plus de flou en direct. Les shaders de
l'habitacle et des essuie-glaces sont préparés au chargement (plus d'à-coup à la première vue cockpit).

### Vue cockpit

Chaque avion a un habitacle fait pour être vu depuis le siège du pilote : montants de pare-brise fins, casquette,
rebords de fenêtre, panneaux de porte, plafond et compas (verrière dégagée sur le Faucon). La carrosserie extérieure est
cachée : on voit devant soi et sur les côtés. Le regard est légèrement plongeant, la piste et l'horizon au centre.

### Cinématique de début de partie

Après « Décoller », une cinématique (pilote en 3D : `public/models/pilote.glb`, son squelette suit l'animation
de la cinématique, la main va sur la poignée) d'environ 15 s, filmée comme au cinéma (bandes noires, vignettage, fondu
d'ouverture, focales réelles, coupes franches, léger bougé de caméra). Le pilote, sacoche à la main, marche vers
l'avion : un plan large fixe, puis une caméra épaule qui le suit. Gros plan sur sa main qui ouvre la porte. Il monte
(escabeau ou aile), se baisse, entre, pose sa sacoche et s'assoit ; il referme la porte, qui claque. La caméra rejoint
ensuite la vue de poursuite en contournant l'avion. Elle ne traverse jamais l'avion : elle se décale si une aile ou une
nacelle cache la vue. Une touche, un clic ou un bouton de manette la passe ; elle se désactive dans Paramètres → Interface.

## Quêtes et progression

- **Tableau des missions** dans chaque aéroport (`Entrée` à l'arrêt) et balises jaunes « ! » pour les quêtes trouvées sur le terrain.
- **11 types d'objectifs** : anneaux, atterrissage, toucher-décoller, survol, largage de colis (`X`, jugé au point d'impact),
  altitude, vitesse, rase-mottes, palier, vol sur le dos, escorte de bateau ou de montgolfière ; chronos avec bonus ;
  objets de mission (radeau, randonneur, caisse…).
- **Missions de transport du jour** : 3 par aéroport, renouvelées chaque jour, identiques pour tous les joueurs.
- **Note de fin de mission** (S, A, B, C, D) : atterrissage (vitesse verticale au toucher), pilotage (décrochage,
  survitesse, facteur de charge), temps (missions avec un temps de référence) et avion intact. Bonus de 5 à 20 % de la
  récompense pour B, A et S ; la meilleure note est gardée et affichée au tableau et au journal. Toute quête terminée
  peut être rejouée (↻ Rejouer, 10 % de la récompense) pour améliorer sa note.
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
- **Cub-1 en modèle 3D détaillé** (`public/models/cub.glb`, chargé au démarrage ; modèle simplifié si le fichier manque) : cockpit complet, gouvernes et hélice animées, peintures/motifs/zones/autocollants appliqués sur le modèle, train escamotable (les jambes du modèle se replient ; points de contact de la physique recalés sur ses roues).
- **Hangar 3D** (bouton avion de la barre d'outils) : fondu au noir, le monde est déchargé (logo de chargement en bas à droite), puis l'avion est au centre d'un vrai hangar. Personnalisation par avion : 3 couleurs + bouts d'hélice, 8 motifs (bande, bicolore, éclair, flammes, damier…), ailes, finition (brillant, mat, métallisé, chromé, nacré), dents de requin, immatriculation, emblème sur la dérive, couleur du fumigène (touche **N** en vol). Les autres joueurs voient ta peinture. Aussi : **18 motifs** (dont camouflage, tigre, arc-en-ciel, dégradé, pois, bandes de course), **8 finitions**, **11 zones peintes à part** (dos, ventre, nez, dérive, stabilisateur, ailes, bouts d'ailes, gouvernes, cône d'hélice, carénages, moteurs), **27 autocollants** à coller où l'on veut en cliquant sur l'avion (taille, rotation, des deux côtés, texte personnalisé filtré comme le chat), 32 couleurs, fumigène visible par tous. **Tout s'achète** avec l'argent du jeu (une fois, puis valable sur tous les avions) : couleurs 150 ₣ (blanc, noir, jaune offerts), couleurs sur mesure 2 000 ₣, motifs 200–900 ₣, ailes 150–600 ₣, finitions 400–2 500 ₣, emblèmes 300–700 ₣, immatriculation 500 ₣, dents de requin 1 000 ₣, fumigène 1 500 ₣. On peut essayer avant d'acheter (aperçu sur l'avion). Prix dans `public/js/livery.js`.
- **Contre-la-montre et classements** : 3 courses « Contre-la-montre » + toutes les quêtes chronométrées sont classées. Rejouables (10 % de la récompense) ; record perso enregistré, et meilleur temps envoyé au classement en ligne pour les joueurs connectés (`/api/times`, top 10 dans le tableau des missions et l'onglet Classements de la pause).
- **Statistiques** : page `/stats.html` (joueurs en ligne, connexions, pic de joueurs, temps de jeu, quêtes les plus jouées, 60 jours, enregistrés dans `data/stats.json` du serveur) + Vercel Web Analytics pour les visites du site (à activer dans Vercel → projet → Analytics).
- **Français / anglais / espagnol** : drapeaux au menu ; langue du navigateur détectée (espagnol si `es`, anglais pour les autres langues, français si `fr`). Clavier AZERTY ou QWERTY détecté (API Keyboard, sinon d'après la langue) : gaz sur Z ou W, palonnier gauche sur Q ou A ; choix manuel dans l'onglet Touches.
- **Tutoriel du premier vol** : bulles et flèches animées vers les voyants, instruments, mini-carte et boutons ; chaque étape se valide toute seule ; « Passer », et « Revoir le tutoriel » dans les paramètres. Le texte français sert de clé (`t('…')`, `public/js/i18n.js`), traductions dans `public/js/lang/`. Pour une nouvelle quête : `node scripts/quest-strings.mjs` liste les textes à traduire.
- **Chat** : touche **Y** (modifiable) ou bouton bulle — messages à tous les pilotes en ligne, 140 caractères max, anti-spam (1 message/s, 5 par 10 s) et gros mots masqués côté serveur (`chat.js`). Les nouveaux arrivants voient les 30 derniers messages.

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
