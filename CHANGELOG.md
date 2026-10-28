# Changelog

## 2.84.0

### Plugins

- **Plugin obligatoire** — `required: true` dans le manifeste des plugins :
  le plugin est toujours actif, sans interrupteur dans la liste des
  extensions (mention « Obligatoire »). S'il ne peut pas être chargé
  (fichier absent, empreinte invalide, erreur à l'enregistrement),
  l'application ne démarre pas et affiche « Extension obligatoire
  indisponible ».
- **Verrou d'écriture** — `api.writeLock.set(raison)` / `.clear()` /
  `.current()` (permission `writeLock`) : un plugin suspend toutes les
  écritures (tous les dossiers, création, suppression, imports) jusqu'à ce
  qu'il lève son verrou. Un bandeau « Modifications suspendues : … »
  s'affiche et toute écriture est refusée avec ce message.

## 2.83.0

### Plugins

- **Événements complets** — le bus d'événements couvre maintenant les
  modifications en lot, collages, fusions, dissolutions de groupe,
  commentaires, renommages de tag, modifications du rapport (regroupées par
  section), requêtes lancées par l'utilisateur, imports (dossier ouvert,
  nouveau dossier, imports par plugin), exports (fichiers, impression,
  sauvegarde complète, copies Mermaid/DOT), partage et entrée dans une
  session partagée.
- `dossier:updated` indique les champs modifiés, avec l'ancienne et la
  nouvelle valeur pour la rétention et la clôture.
- Chaque événement porte `origin` : `local`, ou `undo` quand il est rejoué
  par annuler / rétablir.
- `api.events.onAny(cb)` reçoit tous les événements, ceux des plugins
  compris ; `api.events.emit('<pluginId>:<nom>', dossierId, meta)` émet un
  événement du plugin (tout autre préfixe est refusé).
- Volontairement non émis : déplacements d'éléments, ordre des pièces,
  réglages d'affichage, sélection, filtres, et modifications reçues d'un
  collaborateur (émises sur son poste).

### Corrections

- L'import d'un fichier par un plugin respecte la clôture du dossier cible.

## 2.82.0

### Nouveautés

- **Clôture d'un dossier** — panneau Détail ▸ Dates ▸ Clôture ▸ Clôturer
  (avec confirmation). Un dossier clôturé est en lecture seule jusqu'à sa
  réouverture : éléments, liens, pièces jointes, commentaires, tags, rapport,
  onglets, vues et requêtes sauvegardées ne se modifient plus, et aucun import
  n'y entre. Un bandeau « Clôturé le … — lecture seule » s'affiche sous
  l'en-tête, la carte d'accueil porte la mention « Clôturé ». Chaque clôture
  passée reste listée avec sa date de réouverture. Synchronisé en
  collaboration.
- **Rétention comptée depuis la clôture** — section Rétention ▸ Compter
  depuis : la création ou la clôture. Depuis la clôture, le délai part de la
  première clôture : rouvrir puis reclôturer ne repousse pas l'échéance.

### Améliorations

- Une modification refusée dans un dossier en lecture seule (clôturé, ou
  rétention expirée en mode « Lecture seule ») affiche un message, au lieu
  d'échouer sans rien dire.

### Plugins

- Nouveaux événements `dossier:caseClosed` et `dossier:caseReopened`.

## 2.81.4

### Corrections

- **Suppression complète d'un dossier** — supprimer un dossier encore ouvert
  (politique de conservation « supprimer ») ferme d'abord sa base locale de
  synchronisation, qui pouvait sinon rester sur le disque. La suppression
  efface aussi la position de la vue, les suggestions écartées et l'ancien
  dossier de fichiers. Un avertissement s'affiche si une donnée n'a pas pu
  être effacée.
- **Tout purger** efface aussi les requêtes sauvegardées et les commentaires.

### Plugins

- Nouvel événement `dossier:purged`, émis après la suppression d'un dossier :
  `meta.receipt` liste chaque stockage vérifié et ce qui y reste.
- Le type `PluginEvent` déclare `meta` et les événements
  `element:tagAdded` / `element:tagRemoved`.

## 2.81.3

### Corrections

- **Requêtes ZNQuery propres à chaque dossier** — la requête en cours, son
  filtre et l'historique des requêtes récentes ne suivent plus d'un dossier à
  l'autre. Avant, une requête tapée dans un dossier restait appliquée à
  l'ouverture d'un autre, figurait dans son historique et partait dans ses
  exports. Chaque dossier retrouve son historique quand on le rouvre pendant
  la session ; un historique importé va dans le dossier importé.

## 2.81.2

### Améliorations

- **Requête depuis une cellule de la matrice** — clic droit sur une cellule ▸
  Requête sur cette valeur : écrit et lance la requête ZNQuery
  `colonne = "valeur"` (valeur exacte, casse ignorée), appliquée à toutes les
  vues. Absente sur les colonnes sans requête équivalente (confiance, dates,
  oui/non) et sur une cellule vide.

## 2.81.1

### Corrections

- **Matrice** — un filtre de colonne qui ne garde aucune ligne laisse les
  en-têtes et la ligne de filtres affichés (avec « Aucun résultat »), pour
  pouvoir le corriger, au lieu de faire disparaître le tableau.

## 2.81.0

### Nouveautés

- **Mode focus en ZNQuery** — clic droit ▸ Mode focus écrit et lance la
  requête correspondante (`WITHIN 2 HOPS OF label = "…"`) et ouvre son
  panneau : on peut la modifier, la sauvegarder ou la garder dans une vue.
  Pour sortir du focus, on efface la requête. L'ancien mode focus séparé et
  son bandeau disparaissent.
- **Champ `_id` dans ZNQuery** — désigne un élément ou un lien par son
  identifiant. Le focus l'emploie quand un autre élément porte le même
  libellé. Une propriété nommée « id » reste interrogeable par `id`.
- **Identifiant dans le panneau Détail** — affiché discrètement sous les
  dates de création et de modification ; un clic le copie.

### Documentation

- Le raccourci **F** du mode focus, qui n'existait pas, est retiré de la doc.

## 2.80.0

### Nouveautés

- **Retour à la ligne des libellés de liens** — nouvelle option du dossier :
  les libellés longs passent à la ligne au-delà d'un nombre de caractères
  réglable (20 par défaut, de 5 à 200), coupés aux espaces. S'applique à tous
  les liens, sur le canvas et dans les exports SVG, PNG et le rapport
  interactif ; partagée en session collaborative et reprise à l'import.

### Corrections

- **Panneau Analyse** — changer de panneau puis revenir ne relance plus
  l'analyse quand le graphe n'a pas changé.

## 2.79.1

### Corrections

- **Canvas recalculé en continu** — depuis la 2.76.3, en zoom rapproché, le
  canvas se recalculait à chaque image (environ 60 fois par seconde) même sans
  aucune action, ce qui occupait le processeur en permanence.
- **Déplacement de la vue** — le canvas, la page du dossier et plusieurs
  panneaux ne se recalculent plus à chaque image d'un déplacement ou d'un
  zoom (312 rendus du canvas ramenés à 6 sur 3 000 éléments).
- **Onglets** — un Ctrl+Z pouvait être défait par une resynchronisation
  arrivée juste après ; un onglet tout juste créé pouvait rester vide. Les
  écritures des onglets sont maintenant immédiates et gardent leur ordre.

## 2.79.0

### Nouveautés

- **Import et export DOT (Graphviz)** — fichiers `.dot` / `.gv`, ou texte DOT
  collé sur le canvas. À l'import : libellés, formes, couleurs (noms X11, hex,
  HSV), clusters en groupes, graphes `strict`, attributs en propriétés ; les
  positions `pos` d'un rendu Graphviz sont reprises, sinon le graphe est
  disposé selon `rankdir`. L'export écrit positions, tailles, couleurs, sens
  de chaque lien et propriétés (`neato -n` garde la disposition).
- **Copier en ▸ Mermaid / DOT (Graphviz)** — le clic droit sur une sélection
  regroupe les copies au format texte dans un sous-menu.
- **Cycles animés** — les liens d'un cycle trouvé brillent et portent des
  pointillés qui avancent dans le sens du cycle (aller-retour en graphe non
  orienté ou quand deux cycles se contredisent). Un clic sur un élément de la
  liste le met en évidence sur le canvas.
- **Modale d'export par catégories** — Sauvegarde, Graphe, Données, Notes,
  Image ; options du format choisi sous la liste, un seul bouton Exporter.
- **Options CSV** — contenu (tout, éléments, liens), séparateur (virgule,
  point-virgule, tabulation) et « Compatible Excel » (accents et séparateur
  attendus par Excel).
- **PNG à fond transparent** — en option ; sinon fond blanc.

### Améliorations

- **Tous les liens visibles sur un graphe dense** — au-delà des 800 liens que
  dessine React Flow, les autres sont dessinés sur un canvas sous les
  éléments, avec leurs flèches ; ils se sélectionnent d'un clic (un clic sur
  un enchevêtrement de traits désélectionne) et gardent la lueur des
  résultats d'analyse.
- **Flèches sur les liens simplifiés** (au-delà de 200 liens à l'écran).
- **Import GEXF / Gephi Lite** — `defaultedgetype` lu ; une relation écrite
  dans les deux sens d'un graphe non orienté devient un seul lien ; un layout
  Gephi trop serré est agrandi pour que les éléments ne se chevauchent pas.
- **Export PNG** — sans grille ni minimap ; les liens dessinés en canvas sont
  nets aux résolutions 2x à 4x.

### Corrections

- Les liens ne clignotent plus quand on clique un élément d'un graphe dense.
- La vue d'ensemble dessinait en noir les liens à couleur par défaut.
- Textes du ZIP chiffré traduits (ils restaient en français).

## 2.78.0

### Nouveautés

- **Import et export GML** — format texte de Gephi, yEd, Cytoscape, NetworkX
  et igraph. À l'import : libellés (y compris `LabelGraphics` de yEd),
  positions, tailles, formes, couleurs, notes, tags, confiance, propriétés et
  direction des liens ; les nœuds sans position sont disposés en grille.
  L'export écrit les mêmes données en ASCII (accents encodés, comme l'exige
  NetworkX), les flèches de chaque arête et des identifiants numériques.
- **Taille des éléments selon le nombre de liens** — nouveau réglage de
  l'onglet Vues (section Affichage sur le canvas) : un élément grossit avec son
  nombre de liens (×1,25 à 4 liens, jusqu'à ×3 à partir de 81), autour de son
  centre. Affichage seul, retenu pour ce dossier sur cet appareil ; la mise en
  page automatique, l'alignement et l'export SVG en tiennent compte.

## 2.77.0

### Nouveautés

- **Médias floutés à l'ouverture** — nouvelle option du dossier (section
  Options) : les médias sont floutés à chaque ouverture du dossier, et dès que
  l'option est activée, y compris par un collaborateur en session partagée. Le
  bouton « flouter les médias » les rend visibles le temps de la session.

### Améliorations

- **Grille du canvas au dézoom** — le pas de la grille double tant qu'il
  serait illisible à l'écran (les lignes restent sur la grille d'aimantation),
  et les points gardent une taille visible.
- **Layout circulaire** — indisponible au-delà de 1 000 éléments : un seul
  cercle serait plus large que l'écran, même au zoom minimum. Il reste
  utilisable sur une sélection ou dans un onglet. À l'import JSON, la grille
  le remplace au-delà de cette taille.

## 2.76.5

### Améliorations

- **Options du dossier** — nouvelle section du panneau du dossier, entre
  Rétention et Propriétés. Première option : **flèche par défaut sur les
  relations**, pour les liens tracés à la main (glisser, élément lié) ; les
  suggestions acceptées, les imports et les plugins n'en tiennent pas compte.
  Partagée en session collaborative et reprise à l'import.

### Corrections

- **Onglet du panneau latéral** — l'onglet ouvert est conservé après un
  rechargement de la page, au lieu de revenir sur Détail.
- **Minimap** — le cadre de la vue reste visible quand on zoome (contour et
  taille minimale), au lieu de se réduire à rien.

## 2.76.4

### Améliorations

- **Déplacer en vue d'ensemble** — un élément, ou la sélection quand il en
  fait partie, se déplace par glisser : aperçu en direct, Échap pour annuler,
  aimantation à la grille si active, annulable (Ctrl+Z). Les éléments
  verrouillés et fantômes restent en place, un groupe emmène ses enfants.
  Pour ne rien bouger par mégarde sur une vue dense, il faut saisir l'élément
  exactement : à côté, le glisser déplace la vue (un élément déjà sélectionné
  garde une marge de 4 px).
- **Documentation** — FAQ mise à jour (gros dossiers).

## 2.76.3

### Améliorations

- **Vue d'ensemble seulement quand elle sert** — elle prend le relais quand
  plus de 1 500 éléments sont à l'écran (zoom sous 35 %), et rend la main en
  dessous de 1 000. Sur une vue dézoomée peu dense, on peut de nouveau déplacer
  et relier les éléments.
- **Menu contextuel en vue d'ensemble** — clic droit sur un élément : son menu,
  multi-sélection comprise (« A ↔ B », « N sélectionnés »). « Sélectionner les
  liens » prend tous les liens dessinés.
- **Minimap à tous les zooms** — dessinée sur un canvas : elle ne coûte plus
  un composant par élément (clic et glisser pour déplacer la vue, molette pour
  zoomer).
- **Import d'un gros dossier plus rapide** — 10 000 éléments : 26 → 17 s. Les
  éléments jamais affichés ne sont plus tous montés pour être mesurés.

### Corrections

- **Blocage et écran vide au changement de zoom** — en dézoomant, React Flow
  montait des milliers d'éléments pendant une image avant de basculer ; en
  zoomant, il montait tous ceux qu'il n'avait jamais mesurés. À 10 000
  éléments, pire image à l'entrée 2,4–4,6 s → 0,4 s, à la sortie 1,05 →
  0,3–0,45 s.
- **Image vide au retour en vue normale** — le canvas reste affiché jusqu'à ce
  que les éléments soient rendus.
- **Réglage de la vue d'ensemble** — il n'est plus enregistré dans le
  navigateur : la valeur stockée par la 2.76.2 est ignorée.

## 2.76.2

### Améliorations

- **Vue d'ensemble fluide sur les gros dossiers** — tout dézoomé (sous 35 %,
  à partir de 400 éléments), le graphe entier est dessiné sur un seul canvas
  au lieu d'un nœud par élément. À 10 000 éléments et 15 000 liens : image
  médiane du déplacement 69 → 20 ms, du zoom 145 → 17 ms, et les 15 000 liens
  s'affichent (800 auparavant). Clic, Maj+clic, sélection au cadre et
  double-clic (zoom sur le point) restent disponibles ; l'édition reprend en
  zoomant.
- **Documentation** — limite opérationnelle d'environ 12 000 éléments par
  onglet, et conseil de segmenter un gros dossier en onglets (FAQ, onglets).

### Corrections

- **Bench de rendu** — `e2e/render-perf.spec.ts` envoyait des événements
  souris simulés que le canvas ignore : ses mesures de déplacement portaient
  sur une vue immobile. Il utilise désormais de vrais gestes et vérifie que la
  vue a bougé.

## 2.76.1

### Améliorations

- **Couleur libre pour une famille de tags** — en plus de la palette, la case
  « + » ouvre le sélecteur de couleur du navigateur.

### Corrections

- **Zoom après une recherche dans un autre onglet** — le cadrage de l'onglet
  d'arrivée n'écrase plus le centrage sur le résultat (aussi depuis Suggestions
  et Analyses) : la dernière demande de vue l'emporte.
- **Suppression enregistrée deux fois** — la touche Suppr, canvas actif, était
  traitée deux fois ; un Ctrl+Z pouvait alors remettre les éléments dans le
  dossier sans leurs onglets.

## 2.76.0

### Fusion

- **Fusionner N éléments** — avec 2 éléments sélectionnés ou plus (par exemple
  ceux de « Chercher les similaires »), clic droit → Fusionner. L'élément gardé
  se choisit dans la liste (le plus relié par défaut). La fenêtre signale les
  notes mises bout à bout et le nombre de propriétés, dont les clés à plusieurs
  valeurs. Un seul Ctrl+Z annule toute la fusion.
- **Onglets conservés** — l'élément gardé rejoint les onglets des éléments
  absorbés ; l'annulation les remet à leur place.

### Import et export

- **Choisir les onglets d'une archive** — à l'import d'un ZIP dans un dossier :
  onglets à importer, éléments hors onglet, éléments reliés, rapport. Onglets
  recréés (fusionnés avec un onglet du même nom) ou tout dans l'onglet ouvert.
- **Import annulable** — un import placé sur le canvas s'annule par Ctrl+Z
  (éléments, liens, onglets créés) ; les éléments importés restent sélectionnés.
- **Progression de l'export** — une fenêtre suit la construction de l'archive
  (fichiers joints, données, compression, chiffrement), depuis le dossier ou la
  liste des dossiers.

### Onglets

- **Zoom et cadrage par onglet** — chaque onglet retrouve sa vue ; un onglet
  jamais ouvert se cadre sur ses éléments ; « Tous » retient aussi la sienne.
- **Déplacer dans cet onglet** — ramène un élément fantôme dans l'onglet ouvert.

### Filtres et requêtes

- **Filtres rapides en trois modes** — masquer, seulement ceux-ci,
  sélectionner ; le nombre d'éléments s'affiche, le second clic défait
  seulement ce que le filtre a fait.
- **Comptes de l'onglet** — tags et propriétés comptés sur l'onglet ouvert ;
  filtres actifs en haut du panneau ; éléments masqués sur la ligne du compteur.
- **Résultats lumineux** — vus de loin, les résultats brillent de la couleur de
  leur élément.
- **ZNQuery** — accents acceptés dans les noms de champs (`Identité = "…"`) ;
  toutes les valeurs d'une propriété lues ; `!=` vrai seulement si aucune ne
  l'est.

### Tags

- **Pastille de couleur** devant chaque tag (filtres, détail).
- **Appliquer une famille de tags** — apparence et propriétés manquantes
  appliquées aux éléments du dossier, avec une barre de progression et Ctrl+Z.
- **Contour des images** — un élément à image prend la couleur de son tag
  principal en contour.

### Disposition et analyses

- **Force lisible autour d'un élément très relié** — feuilles rangées en
  anneaux, niveau par niveau ; mesuré : environ dix fois moins de croisements.
- **Centrer depuis Analyses** — un clic sur un élément ou un cluster le cadre.

### Corrections

- **Propriétés en double** — supprimer ou modifier une « Identité » parmi
  plusieurs ne touche plus que la ligne voulue.
- **Export en arrière-plan** — l'export continue quand l'onglet du navigateur
  est caché.

## 2.75.6

### Suggestions de liens

- **Rencontres datées par les propriétés** — les propriétés de date retenues
  dans les filtres datent l'élément à sa position, comme sur la carte et la
  timeline : un dossier importé avec ses dates en propriétés trouve ses
  rencontres sans événements.
- **Rayon et fenêtre libres** — distance et période se saisissent avec leur
  unité (1 m à 100 km, 1 min à 365 jours) au lieu de listes fixes.
- **Entre tags** — un seul tag compare ses éléments entre eux (« même tag ») ;
  seuls les tags de l'onglet ouvert sont proposés. Les rencontres y gardent
  aussi les foules, comme les lieux.
- **Éléments ignorés signalés** — le panneau indique combien d'éléments ont été
  écartés pour trop de voisins, et comment les garder.
- **Aperçu du lien** — au survol ou à la coche d'une suggestion, le lien proposé
  s'affiche en pointillés animés sur le canvas ; cocher cadre la vue sur ses
  éléments. L'aperçu reste en passant sur un autre onglet du panneau.

### Onglets

- **Combiner des onglets** — Ctrl+clic sur un onglet l'affiche avec l'onglet
  ouvert ; les nouveaux éléments vont toujours dans l'onglet ouvert.
- **Entre deux onglets** — avec deux onglets affichés, le panneau Analyses
  montre ce qui les relie : éléments communs, liens directs, relais.

### Performances

- **Barre d'activité** — un fin trait sous la barre de vue suit les calculs
  longs (analyses, disposition, suggestions, changement de vue).
- **Dispositions compactes** — force et clusters disposent chaque groupe
  séparément puis les rassemblent, isolés en grille, au lieu de les disperser.
- **Calculs en arrière-plan** — une nouvelle analyse remplace celle en attente
  sans bloquer une disposition ou une recherche de chemin.

## 2.75.5

### Améliorations

- **ZNQuery : opérateur `LIKE`** — recherche approchée sur un texte : casse et
  accents ignorés, chaque mot doit ressembler à un mot du champ (environ une
  faute pour cinq lettres). `label LIKE "jean martn"` trouve « Jean Martin ».
- **Chercher les similaires** — compare aussi le libellé (`LIKE`), plus
  seulement les tags : fonctionne sur un élément sans tag.

## 2.75.4

### Corrections

- **Recherche dans les commentaires** — la recherche (Ctrl+K) ignorait les
  commentaires. Leur texte, résolus compris, est indexé avec l'élément ou le
  lien commenté, et le résultat montre l'extrait avec son auteur.

## 2.75.3

### Améliorations

- **Analyses limitées à l'onglet** — dans un onglet, clusters, centralité,
  ponts, isolés, doublons, chemins et cycles du panneau Analyses portent sur
  ses éléments et les liens entre eux. Relancées au changement d'onglet.
- **Ordre des onglets du panneau** — glisser une icône (Détails, Analyses,
  Filtres...) sur une autre change l'ordre, mémorisé.

### Corrections

- **Minimap cachée par le panneau** — elle s'accroche au coin le plus proche
  et garde sa distance au bord quand on élargit le panneau ou la fenêtre.

## 2.75.2

### Recherche

- **Large ou Strict** — deux boutons dans la recherche (Ctrl+K) pour limiter
  les résultats trop larges. **Large** (comportement d'avant) tolère les
  fautes et se contente d'un mot ; **Strict** exige tous les mots, sans faute,
  le dernier pouvant être un début de mot pendant la frappe. Le choix est
  mémorisé.

## 2.75.1

### Corrections

- **Halo des résultats en dézoom** — les anneaux qui se chevauchaient
  dessinaient des boucles façon crayon. Les éléments retenus par un filtre ou
  une requête sont désormais posés sur un disque plein de la couleur
  d'accent, sans contour : les voisins se fondent en une seule tache.

## 2.75.0

### Onglets : des zones de travail distinctes

- **Requêtes et filtres limités à l'onglet** — dans un onglet, résultats,
  compteurs, « Sélectionner » et « Inverser » ne portent plus que sur ses
  éléments, au lieu de tout le dossier (une sélection par requête prenait des
  éléments invisibles). La requête est relancée au changement d'onglet.
- **Arranger dans un onglet** — seuls les éléments de l'onglet bougent, autour
  de leur position, et le résultat est placé sans chevaucher le reste du
  dossier : la vue « Tous » reste lisible. Le menu signale les éléments aussi
  présents dans d'autres onglets, qui suivent l'arrangement. Une sélection
  ne déplace que ses éléments de l'onglet.
- **Filtre « Onglets »** — dans « Tous », le panneau Filtres permet de ne
  garder que les éléments d'un ou plusieurs onglets, sur toutes les vues.
- **Réordonner les onglets** par glisser-déposer dans la barre.
- **Compteurs** — dans un onglet, la barre du canvas et le panneau Filtres
  comptent ses éléments, plus ceux du dossier.
- **Extensions** — dans un onglet, `filterOutcome()` renvoie ses éléments
  (OneNeurone limite son contexte à l'onglet ouvert).

### Lisibilité

- **Résultats visibles en dézoom** — en vue d'ensemble, les éléments retenus
  par un filtre ou une requête sont entourés d'un anneau de taille constante à
  l'écran, et les autres plus estompés.
- **Menu d'une sélection** — un clic droit sur un élément d'une sélection
  multiple affiche « N sélectionnés » en en-tête, et non le nom d'un seul
  élément.

## 2.74.1

### Corrections

- **Fenêtres d'export et d'import sur un petit écran** — sur un écran de
  portable, la fenêtre d'export dépassait en haut et en bas, sans défilement :
  il fallait dézoomer la page pour atteindre l'export PNG. Les fenêtres
  d'export, d'import, d'import dans le dossier ouvert et des tags du dossier
  tiennent dans la hauteur de l'écran et leur contenu défile.

## 2.74.0

### Collaboration : mettre à jour tous les participants

Avant de compter sur cette version dans un dossier partagé, faites-la installer
par **tous** les participants :

- un participant resté en 2.73 ou avant range encore d'office, à l'ouverture
  du dossier, les éléments hors onglet dans le premier onglet, et ce rangement
  s'applique chez tout le monde ;
- la protection contre les modifications bloquées (voir Corrections) ne joue
  que si le participant déjà connecté est à jour.

### Nouveautés

- **Onglets depuis la sélection** — clic droit sur un élément ou une sélection,
  sous-menu Onglets : « Nouvel onglet avec la sélection », « Déplacer vers
  l'onglet… » (la sélection quitte l'onglet ouvert), « Ajouter à l'onglet… » et
  « Retirer de l'onglet », aussi dans le menu de la sélection. Toutes ces
  actions s'annulent avec Ctrl+Z.
- **Un élément peut n'appartenir à aucun onglet** — un élément créé dans
  « Tous », ou retiré de son dernier onglet, reste dans le dossier et visible
  dans « Tous ». Il n'est plus rangé d'office dans le premier onglet à
  l'ouverture suivante, ni à la suppression d'un onglet.
- **Suggestions : indicateur d'analyse** — le bouton « Analyser le dossier »
  affiche « Analyse… » pendant le calcul.

### Performances (mesurées à 10 000 éléments et 15 000 liens)

- **Créer et supprimer** — un ajout ou une suppression ne relit et ne réécrit
  plus tout le dossier. Créer un élément rend la main en 0,1 s au lieu de 4 s ;
  supprimer un élément fige l'écran 0,07 s au lieu de 0,4 s.
- **Vue d'ensemble** — un seul point d'accroche par nœud dézoomé au lieu de
  huit, et un rendu sans abonnement aux données : déplacer un nœud fige l'écran
  0,4 s au lieu de 9,7 s, le zoom à la molette reste fluide.
- **Changement d'onglet** — vers un petit onglet : 0,2 s au lieu de 0,9 s ;
  vers un onglet de 10 000 éléments en vue d'ensemble : 1,0 s au lieu de 1,5 s.

### Corrections

- **Annuler une suppression** — les éléments et liens reviennent d'un coup,
  dans leur onglet (ils revenaient un par un : près de deux minutes pour 500
  éléments, et hors de l'onglet).
- **Liens d'un onglet** — dans un gros dossier, un onglet pouvait n'afficher
  qu'une partie de ses liens (16 sur 307) : les liens entre éléments hors onglet
  prenaient leur place sous le plafond d'affichage.
- **Collaboration : modifications bloquées** — ce qu'un participant écrivait
  avant de se connecter (hors ligne, pendant un rechargement) n'arrivait jamais
  chez les autres, et ses modifications suivantes y restaient bloquées : un
  onglet pouvait se vider chez un collègue. Chaque participant demande
  maintenant au nouvel arrivant ce qui lui manque.
- **Collaboration : copie locale** — chez celui qui rejoint un dossier partagé,
  la copie locale (accueil, export depuis l'accueil, sauvegarde, plugins) est
  complétée à l'ouverture.
- **Métadonnées PDF** — auteur, titre, sujet et mots-clés sont lus (dictionnaire
  du document, ou métadonnées XMP). Pour un fichier déjà joint : bouton
  « Extraire les métadonnées » du fichier.

## 2.73.0

### Nouveautés

- **Suggestions : choix des propriétés comparées** — un bouton à côté de la
  règle « Propriétés » déplie la liste des propriétés texte du dossier (avec le
  nombre d'éléments qui portent chacune) : on ne garde que les identifiants
  (téléphone, IBAN, numéro de procédure…) et on écarte descriptions et
  catégories. Choix retenu par dossier dans le navigateur ; une propriété
  nouvelle est cochée par défaut ; décocher ne supprime aucun refus.
- **Matrice : appliquer les filtres à toutes les vues** — le bouton « Toutes
  les vues » transforme les filtres de colonnes en requête ZNQuery appliquée en
  filtre (`"Type d'enquête" CONTAINS "flagra"`), ajoutée à la requête déjà
  active. Canvas, carte, timeline et suggestions suivent alors les mêmes
  éléments. Une colonne sans requête équivalente (confiance, date, oui/non)
  bloque le bouton plutôt que de garder d'autres lignes.
- **Enregistrer les propriétés dans un tag** — depuis le détail d'un élément,
  ses propriétés (nom et type, jamais la valeur) deviennent des propriétés
  suggérées d'un de ses tags dans les jeux de tags ; le tag est créé s'il
  n'existe pas.

### Améliorations

- **Suggestions : membres d'un pivot** — « Créer et relier N éléments » déplie
  la liste des éléments concernés, chacun cliquable (sélection, recentrage,
  fiche résumée).

### Corrections

- **Suggestions : paires déjà connectées** — deux éléments déjà reliés au même
  élément ne sont plus proposés. Un élément relié à plus de 50 autres (unité,
  catégorie) ne compte pas comme élément commun.
- **Import ANB : libellé affiché** — quand i2 génère une identité
  (`nhJ1j2j-8wS1…`), l'élément prend le libellé affiché dans i2 ; l'identité
  est conservée dans la propriété `i2_identity`.

## 2.72.0

### Nouveautés

- **Éléments sans position sur la carte** — un élément géolocalisé lié à des
  éléments sans position affiche une pastille `+N` sous son étiquette. Un clic
  la déploie : ces éléments apparaissent en étiquettes autour du marqueur,
  reliés par des traits pointillés, et un clic sur l'un d'eux ouvre son
  détail. Seuls les voisins directs comptent, en respectant filtres, masquage,
  onglet et, en mode temporel, les liens actifs.
- **Centrer sur l'élément** — un bouton à côté du nom, dans le panneau de
  détail, centre la vue sur l'élément (canvas, carte ou timeline).

### Améliorations

- **Sections du panneau mémorisées** — les sections ouvertes ou fermées du
  détail restent dans le même état en passant d'un élément à un autre (de même
  pour les liens), pour comparer les valeurs rapidement.
- **Disposition par clusters plus rapide** — le placement de centaines de
  clusters prend une fraction de seconde au lieu de plusieurs.

## 2.71.1

### Corrections

- **Éléments verrouillés respectés par les dispositions** — un élément dont
  la position est verrouillée ne bouge plus lors d'une disposition
  automatique (ni le groupe qui le contient) : le reste est placé autour, sans
  le recouvrir, puis la vue cadre le résultat avec les éléments verrouillés.
- **Verrouiller une sélection** — le menu contextuel de la sélection propose
  « Verrouiller la position » (ou « Déverrouiller » si tous les éléments
  sélectionnés le sont déjà).
- **Disposition par clusters plus compacte** — des centaines de petits
  clusters forment un nuage rond au lieu de s'étaler en ligne.
- **Tags sur une grande sélection** — ajouter ou retirer un tag sur des
  centaines d'éléments est nettement plus rapide ; la puce du tag indique
  l'opération en cours.
- **Compteurs des cartes dossier** — le nombre d'éléments et de liens se met
  à jour au retour sur la liste et après un import dans un dossier existant.
- **Zoom arrière** — le canvas descend plus bas pour embrasser les très
  grands dossiers.

## 2.71.0

### Nouveautés

- **Densité sur la carte** — le bouton « Densité » remplace marqueurs et
  regroupements par une carte de chaleur, alimentée par les éléments affichés
  ou par leurs événements géolocalisés. Elle suit les filtres, la requête et
  le navigateur temporel (en mode instant, la densité des événements se
  cumule pendant la lecture). Une légende donne l'échelle et un réglage
  d'intensité ; en mode Événements, « Pondérer par élément » évite qu'un
  élément très actif domine la carte. Les liens restent en traits fins.
- **Propriétés date partout** — les propriétés date datent les éléments sur
  la carte et dans le curseur temporel du canvas, comme sur la timeline : un
  dossier daté seulement par ses propriétés a désormais un mode temporel sur
  la carte. La section « Propriétés date » du panneau Filtres est toujours
  visible et fonctionne comme les tags : aucune puce sélectionnée, toutes les
  dates comptent ; en sélectionner limite aux dates choisies (une date
  importée plus tard ne compte pas d'office).
- **Périodes de dates** — deux propriétés date peuvent être lues comme une
  période (« Début des faits → Fin des faits ») : barre sur la timeline,
  période entière sur la carte, le canvas et les filtres.
- **Masquer au lieu d'atténuer** — le bouton « Masquer » des filtres actifs
  fait disparaître les éléments hors filtre ou hors requête de toutes les
  vues (canvas, timeline, carte, matrice).
- **Filtres et requête cohérents** — les panneaux Filtres et Requête comptent
  les mêmes éléments affichés (filtres et requête), avec la part de chacun ;
  la requête apparaît comme un badge « Requête » dans les filtres actifs, et
  « Tout effacer » la retire aussi des vues. Sélectionner / Désélectionner
  devient une bascule unique, synchronisée entre les deux panneaux.
- **Vues enregistrées** — elles gardent aussi le choix atténuer / masquer et
  la requête appliquée.
- **Requête** — commandes en haut du panneau ; dans le texte, chaque groupe
  de conditions apparaît entre parenthèses (y compris pour les requêtes
  sauvegardées).
- **API plugin** — `filterOutcome()` donne aux plugins les éléments affichés
  (filtres et requête), comptés comme dans les panneaux.

### Corrections

- **Sélection tronquée par le canvas** — une sélection faite depuis les
  filtres ou la requête perdait les éléments et liens non rendus à l'écran
  (gros dossiers, fort zoom).
- **Filtre de la requête réactivé à vide** — repasser une requête de « table
  seule » à « filtre canvas » n'activait aucun filtre.
- **« Sans date » et filtre de période** — ils lisent les mêmes dates que les
  vues (période, événements, propriétés date retenues) ; la date de collecte
  ne date plus les éléments, carte comprise.
- **Compteur des filtres** — il reprend exactement les critères des vues
  (recherche texte sur les tags et propriétés, filtres de dates et de
  géolocalisation compris).

## 2.70.1

### Corrections

- **Requête active lisible par les plugins** — l'API plugin expose le store
  de requête en lecture (`stores.useQueryStore` : `isFilterActive`,
  `matchingElementIds`, `matchingLinkIds`, permission `stores:query:read`).
  OneNeurone peut ainsi limiter le contexte envoyé à l'IA à la requête
  appliquée sur le canvas ; il envoyait jusqu'ici tout le dossier.

## 2.70.0

### Performances

Mesures sur un dossier de 5 100 éléments et 4 570 liens.

- **Carte** — les liens sont dessinés par une seule source et quelques calques
  fixes au lieu d'une source et de deux calques par lien (et de flèches en
  éléments HTML) : basculer vers la carte passe de 10–13 s à environ 3 s, sans
  gel de plusieurs secondes, et chaque déplacement de la carte ne reconstruit
  plus un millier de calques. Les flèches sont dessinées dans la carte et
  s'atténuent avec leur lien.
- **Arrangements** — la résolution des chevauchements ne compare plus toutes
  les paires d'éléments (grille spatiale) ; au-delà de 1 500 éléments, la
  hiérarchie utilise un classement plus rapide. Hiérarchie : 59 s → 8 s ;
  Force : 22 s → 16 s ; Clusters : 8 s → 6 s.
- **Recherche** — l'index n'est plus reconstruit en entier à chaque
  modification (un déplacement, un arrangement) : seuls les éléments dont le
  texte a changé sont réindexés.
- **Positions** — un arrangement écrit toutes les positions en une seule
  opération au lieu d'une par élément.
- **Import JSON et ZIP** — éléments et liens écrits par lots au lieu d'une
  transaction par ligne.

## 2.69.0

### Nouveautés

- **Import JSON personnalisé**
  - **Cible « Notes »** — un champ peut remplir les notes de l'élément ;
    plusieurs champs s'y ajoutent en paragraphes, chacun précédé du nom de son
    champ (renommable).
  - **Fusionner dans** — une table dont un champ renvoie à une autre table
    (un `id` qui est le numéro de procédure) peut être versée dans l'élément
    qu'elle désigne : ses champs deviennent des propriétés, ses sous-listes
    des sous-éléments liés directement, sans élément intermédiaire. Une ligne
    sans correspondance reste un élément.
  - **Modèles multi-tables** — un modèle enregistre toutes les tables cochées
    (mapping, libellé, tag, sous-éléments, filtres) et les recoche au
    chargement ; « Enregistrer » met à jour le modèle sélectionné.
  - **Choix du tag** — le tag d'une table ou des sous-éléments se choisit parmi
    les tags existants ou se crée.
- **Tag à l'import GeoJSON** — l'étape d'options propose un tag ; une famille
  existante donne son apparence, un nouveau nom la crée.
- **Progression de l'import** — les éléments et liens écrits s'affichent
  pendant l'import, pour tous les formats, y compris en mode placement.
- **Suggestions de liens**
  - **Entre deux tags** — ne garder que les suggestions reliant un élément
    d'un tag à un élément d'un autre (infractions proches de sites GeoJSON) ;
    la proximité compare alors tous les éléments des deux tags, sans plafond
    de voisins, et mesure la distance jusqu'au bord d'une zone.
  - **Rayon jusqu'à 50 km** pour la règle « Lieux » (les rencontres restent
    à 5 km au plus).
  - **Noms cliquables** — un clic centre la vue sur l'élément et affiche sa
    fiche résumée sous la ligne ; un élément par ligne, libellés longs lisibles.
  - **Tri par distance** et liste complète au-delà de 200 suggestions.
- **Requêtes** — « Afficher les résultats » cadre la vue sur ce que la requête
  a trouvé ; « Inverser la sélection » sélectionne ce qui ne correspond pas, et
  revient aux résultats au second clic. Une requête sur des liens met en
  évidence leurs extrémités en mode filtre.
- **Timeline : exclure des propriétés date** — dans le panneau Filtres, sur la
  timeline, chaque propriété date ou date-heure (une date de naissance) se
  retire de la frise ; enregistré avec les vues.
- **Retour sur une vue** — une sélection faite sur la carte ou la timeline est
  centrée en revenant sur le canvas, et la timeline défile jusqu'à l'élément
  choisi ailleurs.

### Corrections

- **Import depuis l'accueil dans une enquête existante** — rien n'apparaissait
  (les éléments restaient en base sans s'afficher). L'enquête s'ouvre
  maintenant et l'import passe par ses options puis par le placement.
- **Options GeoJSON depuis l'enquête** — l'étape de choix du libellé et des
  propriétés manquait, et les choix faits étaient perdus au placement.
- **Commentaires conservés à l'import** — un import avec placement effaçait
  les commentaires de l'enquête ; les éléments importés sont maintenant
  ajoutés sans reconstruire le document, y compris en session partagée.
- **Import ANB dans l'enquête ouverte** — les éléments n'apparaissaient pas.
- **Événements CSV sur un élément existant** — ajoutés sans écraser les
  autres champs modifiés entre-temps (session partagée).
- **Build** — `version.json` s'écrivait aussi à la fermeture du serveur de
  tests, dans un dossier parasite du dépôt ; il ne s'écrit plus qu'au build.

## 2.68.0

### Nouveautés

- **Import JSON multi-tableaux** — un JSON qui contient plusieurs tableaux
  d'objets n'importe plus seulement le premier : chaque tableau se coche et
  garde son propre mapping (libellé, champs, tag, filtres). Les tableaux
  ajoutés reçoivent un tag à leur nom.
  - **Références entre tableaux** — un champ dont les valeurs se retrouvent
    parmi les `id` d'un autre tableau crée les liens vers ses enregistrements ;
    le tableau visé se change sur la ligne du champ. Noms préfixés reconnus
    (`crpj_procedure`), champ qui recopie l'`id` ignoré.
  - **Identifiants issus d'un CSV** — `12`, `"12"`, `12.0` désignent le même
    enregistrement.
  - **Identifiant commun** — quand les `id` de plusieurs tableaux reprennent
    ceux d'un tableau principal (un numéro de procédure présent partout),
    chaque tableau est relié à ce tableau principal.
  - Une référence vers un tableau non coché est conservée en propriété.
  - **Schéma des tableaux** — les tableaux cochés et leurs liens, avec la part
    des valeurs retrouvées ; tirer un champ vers un tableau pour le relier,
    cliquer une flèche pour la retirer, « + champ » pour en ajouter. Disposé en
    colonnes pour que les flèches ne traversent pas les tableaux.

### Améliorations

- **Documentation** — import JSON multi-tableaux (FR, EN).

## 2.67.1

### Corrections

- **Coordonnées GPS des photos** — importées par le bouton « Extraire les
  métadonnées » de la section Fichiers, elles n'apparaissaient pas dans la
  localisation : le panneau de détail, déjà ouvert, gardait l'ancienne
  position. Il reprend maintenant toute position modifiée ailleurs (import de
  métadonnées, carte, annulation, collaborateur), sauf pendant une saisie.
- **Précision des coordonnées EXIF** — arrondies à 7 décimales (environ 1 cm)
  au lieu d'afficher le bruit de conversion (`-0.21000000000000002`).

## 2.67.0

### Nouveautés

- **Suggestions de liens** — un nouvel onglet du panneau latéral (ampoule)
  repère les liens que les données laissent supposer ; ZN propose, l'analyste
  accepte ou écarte, rien n'est créé sans son accord. L'analyse se lance à la
  demande (bouton, ou clic droit → Analyser → Suggérer des liens sur une
  sélection) et porte sur les éléments affichés : filtres, éléments masqués,
  onglet et requête ZNQuery en mode filtre s'appliquent.
  - **Propriétés** — même valeur pour la même propriété, écritures comparées
    après normalisation (téléphones, emails, IBAN, plaques ; noms de propriété
    sans casse ni accents). Le texte libre partagé par la majorité est écarté
    comme bruit ; un identifiant ne l'est jamais.
  - **Sources** — même pièce jointe (même empreinte) ou même page web citée.
  - **Zones** — point ou petite zone à l'intérieur d'une zone plus grande.
  - **Lieux à moins de** — positions proches, sans les dates (rayon réglable).
  - **Rencontres à moins de** — mêmes lieu et moment à partir des événements
    datés et géolocalisés : rayon, fenêtre (±15 min à ±7 jours) et durée
    maximale des séjours (un domicile daté sur des années n'est pas un lieu de
    rendez-vous). Heure et distance confirmées sur les points réels, foules
    ignorées ; tient des dizaines de milliers de positions.
  - Partagée par 3 éléments ou plus, une valeur donne un **pivot** : un élément
    pour la valeur relié à tous, ou l'élément existant qui la porte déjà.
  - Un lien accepté **garde la preuve** : notes avec toutes les raisons, valeurs
    en propriétés, source partagée, date ou période de la rencontre (visible
    sur la timeline).
  - Survol pour mettre en évidence, recherche dans la liste, acceptation ou
    refus groupés, tout annulable en un Ctrl+Z.
  - **Suggestions écartées** — elles ne reviennent pas, se revoient et se
    rétablissent ; un refus porte sur une raison, pas sur la paire. Les refus
    sont partagés en collaboration, conservés à l'export ZIP, ne contiennent
    aucune valeur en clair et se nettoient seuls quand les données disparaissent.

### Améliorations

- **Annuler la création d'un élément** — un élément créé avec E, une
  annotation créée avec N ou par le clic droit s'annulent avec Ctrl+Z.
- **Documentation** — pages suggestions de liens, sélection et édition en masse
  des liens, import GeoJSON (FR, EN).

### Corrections

- **Refaire un collage ou une duplication** — Ctrl+Shift+Z recrée aussi les
  liens collés ou dupliqués (seuls les éléments revenaient).

## 2.66.3

### Améliorations

- **Import GeoJSON** — les `MultiPolygon` sont importés (plus grande partie
  conservée, un seul avertissement récapitulatif). Les fichiers en Lambert 93
  (`EPSG:2154`, fréquent dans les données publiques françaises) sont convertis
  en WGS 84 à l'import ; les autres projections sont refusées avec un message
  demandant de reprojeter en EPSG:4326.
- **Import GeoJSON : libellé et propriétés** — une étape avant l'import fait
  choisir la propriété qui sert de libellé et cocher les propriétés à importer.
- **Liens depuis une sélection** — tirer un lien depuis un élément d'une
  sélection multiple relie tous les éléments sélectionnés à la cible.
- **Sélection de liens** — Maj/Ctrl+clic ajoute ou retire un lien de la
  sélection ; Ctrl+Shift+A sélectionne tous les liens affichés ; le menu du
  canvas propose « Sélectionner leurs liens » (ou « tous les liens »).
- **Édition en masse** — le libellé des liens se modifie pour toute la
  sélection, et chaque modification en masse s'annule en un Ctrl+Z.

### Corrections

- **Carte** — une coordonnée hors limites (fichier projeté importé tel quel)
  ne fait plus planter la vue Carte ; l'élément est ignoré.
- **Import GeoJSON** — les entités sans nom sont numérotées selon leur position
  dans le fichier (« Feature 1 » était répété).
- **Annuler sur le canvas** — la création d'un lien, la fusion d'éléments et
  l'ajout d'une pièce jointe s'annulent à nouveau avec Ctrl+Z (l'action
  disparaissait de l'historique sans effet).
- **Fenêtre d'import** — les options CSV sont masquées pendant les étapes
  d'options GeoJSON et FEC.

## 2.66.2

### Améliorations

- **Déploiement en sous-répertoire** — l'application peut être servie sous
  un chemin (`https://serveur.exemple/Zeroneurone/`) en fixant `VITE_BASE`
  au build. Routeur, manifeste PWA, service worker, worker pdf.js, plugins
  externes et liens de partage suivent ce chemin. Sans `VITE_BASE`, rien ne
  change (racine du domaine).
- **API plugin** — `api.basePath` donne le chemin de base de l'application,
  à préfixer aux URL de ses propres fichiers (`plugins/`…).
- **Documentation** — guide de déploiement sur Apache (LAMP), y compris en
  sous-répertoire, avec un `.htaccess` d'exemple (`docs/deploiement-apache-fr.md`).

## 2.66.1

### Améliorations

- **Nom en doublon** — dans le panneau de détail, un avertissement signale
  qu'un autre élément porte déjà le même nom (sans tenir compte de la casse
  ni des espaces). « Voir » centre la vue sur lui sans changer la
  sélection ; des clics successifs passent d'un doublon à l'autre.
- **Position du panneau** — le choix (droite, bas, gauche, détaché) se fait
  par un menu dans l'en-tête du panneau, au lieu d'un bouton à cycle dans
  l'en-tête du dossier. En mode détaché, le menu permet de réancrer le
  panneau depuis la fenêtre séparée. L'icône « Réduire » suit la position.

### Corrections

- **Fuseau des dates anciennes** — le décalage horaire affiché dans la
  navigation temporelle n'est plus tronqué pour les dates antérieures à
  l'heure légale (Paris avant 1911 : `UTC+0:09:21` au lieu de `UTC+0:9.35`).

## 2.66.0

### Nouveautés

- **Histogramme d'activité** — le bouton « Activité » de la timeline affiche
  la répartition des événements par heure de la journée, jour de la semaine
  ou mois de l'année (horaires d'appels, jours de connexion, saisonnalité).
  Un clic sur une barre met en évidence les événements correspondants ; les
  dates trop imprécises pour le découpage sont comptées à part.
- **Causalités à la demande** — au repos, un compteur signale les événements
  précédés ou suivis de près par un événement d'un élément lié ; un clic sur
  un événement affiche ses causes et conséquences potentielles et estompe
  le reste (Échap pour revenir). Une seule cause par élément lié : la plus
  proche.

### Corrections

- **Axe de la timeline** — les dates ne se chevauchent plus : mois abrégés,
  année en repère, écart adapté à la longueur des libellés.
- **Dossier exemple** — dates en heure locale.

## 2.65.10

### Corrections

- **Import ANB : durée des événements** — un événement dont les attributs
  donnent un début et une fin (par exemple « Date et heure de fin de
  l'événement ») devient une période sur la timeline, quels que soient les
  noms de ces attributs dans la palette.

## 2.65.9

### Corrections

- **Export SVG** — les liens sont tracés comme à l'écran : liens qui
  partagent un élément répartis le long de son côté, liens parallèles
  distincts avec chacun leur flèche, couloirs et déplacements à angle droit.
- **Rapport interactif** — le graphe reprend la disposition et les tracés
  du canevas : éléments à leur place exacte, liens selon le mode de tracé
  du dossier (droit, courbe, angle droit), épaisseur et flèches conservées.
- **Poignées des liens à l'export** — sans réglage dans le dossier, l'export
  SVG et le rapport utilisent les mêmes poignées que le canevas.

## 2.65.8

### Corrections

- **Import ANB (i2 Analyst's Notebook)** — l'import lit maintenant la
  structure du fichier au lieu de deviner : les liens relient les bons
  éléments (plus de liens manquants ni décalés), chaque élément prend le
  type de la palette en tag (« Anonyme », type par défaut d'i2, devient
  « Générique ») et ses attributs gardent leur nom.
- **Import ANB : dates, flèches, couleurs** — les événements et les liens
  datés apparaissent sur la timeline, à l'heure affichée par Analyst's
  Notebook ; flèches, couleurs de trait et sources sont repris ; les blocs
  de texte deviennent des annotations. Un avertissement signale un fichier
  dont la structure n'est pas celle attendue.
- **Import et export ANX** — les dates des liens apparaissent sur la
  timeline, comme un instant et non une période en cours ; les dates de
  lien saisies dans ZeroNeurone sont exportées.

## 2.65.7

### Corrections

- **Liens qui partagent un élément** — chaque lien part de son propre point
  sur le côté de l'élément, dans l'ordre de l'élément à l'autre bout : plus
  de départs ni de pointes superposés, en ligne droite, en courbe et en angle
  droit.
- **Liens parallèles** — plusieurs liens entre deux mêmes éléments restent
  distincts et attachés aux éléments, chacun avec sa flèche et son libellé,
  y compris quand ils vont en sens opposés.
- **Angle droit** — les couloirs ne se croisent plus, la pointe tient entière
  avant le coude, et le tracé se resserre quand les éléments sont proches
  (libellés en quinconce).
- **Déplacer un lien à angle droit** — la poignée du lien sélectionné déplace
  son segment central et ses couloirs ; ce réglage est distinct de celui des
  courbes. Menu du lien : « Réinitialiser le tracé ».

## 2.65.6

### Corrections

- **Export Obsidian** — l'archive contient un dossier racine (le coffre, au
  nom du dossier ZN) à ouvrir directement dans Obsidian. Choix du classement
  des fiches à l'export : un sous-dossier par tag principal (type
  d'entité), ou dossier à plat. Les chemins des canvas suivent le
  classement.

## 2.65.5

### Corrections

- **Ordre des tags** — les tags d'un élément, d'un lien ou d'un dossier se
  réordonnent par glisser-déposer dans le panneau de détail. Le premier tag
  (tag principal, utilisé par l'affichage « Premier » et certains exports)
  est encadré.
- **Propriétés suggérées sur le dossier** — ajouter au dossier un tag issu
  d'un jeu de tags propose ses propriétés suggérées, comme sur les éléments
  et les liens.
- **Gestion des tags depuis un dossier** — bouton dans la barre du haut,
  sans repasser par l'accueil.
- **Saisie des tags** — le champ se referme après l'ajout d'un tag ; bouton
  d'ajout réduit à l'icône (libellé en info-bulle) ; mention « Aucun tag »
  retirée.

## 2.65.4

### Corrections

- **Export i2 (ANX)** — les entités de taille par défaut s'ouvrent en taille
  normale dans Analyst's Notebook, libellé sous l'icône (elles étaient
  doublées et le libellé recouvrait l'icône). Les tailles numériques sont
  lues en pixels. À l'import ANX, la taille normale i2 devient la taille par
  défaut ZN.

## 2.65.3

### Corrections

- **Suppression d'un tag** — confirmation dans une modale ZN, empilée sur la
  gestion des tags, au lieu de la boîte de dialogue du navigateur. Même
  correction pour la suppression d'une clé de sécurité (confirmation dans la
  ligne).
- **Gestion des tags** — champ de recherche par nom ; la modale garde une
  hauteur fixe pendant le filtrage.
- **Modales empilées** — seule la modale du dessus réagit à Échap et à Tab.

## 2.65.2

### Corrections

- **Import CSV** — un élément tagué reprend la forme, la couleur et l'icône
  de son premier tag quand la colonne `forme`/`couleur` du CSV est vide ou
  invalide (même règle qu'à la création manuelle) ; une valeur explicite du
  CSV reste prioritaire. Les formes saisies avec une majuscule
  (`Rectangle`) sont normalisées.
- **Taille des carrés** — la forme carrée s'agrandit selon la longueur du
  nom (60 à 150 px), comme le cercle, au lieu d'une taille fixe qui coupait
  le libellé.
- **Disposition force** — l'anti-chevauchement va jusqu'à convergence
  (200 passes au plus, arrêt dès qu'il n'y a plus de recouvrement) : les
  nuages denses d'éléments peu reliés ne se superposent plus.

## 2.65.1

### Corrections

- **Import Graph Palette (OSINT Industries)** — les exports au nouveau
  format Palette (`schemaVersion: 2`) sont reconnus. Sélecteurs recherchés
  (email, pseudo, téléphone, photo) et résultats → éléments à leur position,
  étiquetés par catégorie ; champs imbriqués → propriétés typées (lien,
  nombre, oui/non, date-heure) ; dates OI (création de compte, avis et photos
  Google Maps) → événements datés et géolocalisés ; images intégrées →
  pièces jointes. L'ancien format reste pris en charge.

## 2.65.0

### Nouveautés

- **Import draw.io** — les diagrammes draw.io (diagrams.net), en `.drawio`
  ou `.xml`, compressés ou non, s'importent en nouveau dossier ou dans le
  dossier courant. Formes → éléments (forme, taille, couleurs, position, y
  compris dans les groupes), connecteurs → liens (libellé, couleur,
  épaisseur, pointillés, sens de la flèche), données personnalisées →
  propriétés, images intégrées → pièces jointes. Les pages multiples sont
  empilées. Pour Visio : ouvrir le `.vsdx` dans draw.io puis enregistrer en
  `.drawio`.

## 2.64.2

### Corrections

- **Aperçu PDF en erreur** — sur certains navigateurs, l'aperçu d'un PDF
  échouait avec « getOrInsertComputed is not a function » : la version
  moderne de pdf.js utilise des fonctions JavaScript très récentes sans les
  fournir. ZeroNeurone charge désormais la version compatible de pdf.js
  (aperçu, miniatures, métadonnées) ; MarkNeurone et OneNeurone sont
  corrigés de la même façon.

## 2.64.1

### Corrections

- **Boutons du haut du dossier masqués par une extension** — avec
  MarkNeurone, OneNeurone ou une autre extension compilée, les boutons du
  haut du dossier (thème, côté du panneau, etc.) pouvaient disparaître :
  les classes de mise en forme embarquées par l'extension passaient avant
  celles de ZeroNeurone. Le guide des extensions place désormais ces
  classes dans une sous-couche (`layer(utilities.plugin)`), où celles de
  ZeroNeurone l'emportent toujours ; les extensions de la gamme sont
  corrigées.
- **MarkNeurone** ajouté aux extensions livrées avec ZeroNeurone.

## 2.64.0

### Nouveautés

- **Extensions : services entre extensions** — une extension peut offrir un
  service aux autres (`api.pluginServices.provide`) et utiliser celui d'une
  autre lorsqu'elle est installée et activée (`get`, ou `use` dans un
  composant). ZeroNeurone tient seulement le registre. Sert par exemple à
  OneNeurone et MarkNeurone pour lancer une extraction depuis le lecteur et
  citer le passage d'origine en source. Disponible si
  `features.pluginServices` ; permission `pluginServices` pour une extension
  communautaire. Voir le guide des extensions.
- **Extensions communautaires** — elles reçoivent désormais `api.version` et
  `api.features`, pour tester les capacités de ZeroNeurone.

## 2.63.0

### Nouveautés

- **Extensions : données partagées en collaboration** — une extension peut
  déclarer certaines de ses données comme partagées
  (`api.pluginData.shareKeys`). Dans un dossier partagé, elles sont alors
  transmises aux autres membres, chiffrées comme le reste du dossier ; les
  autres données restent sur le poste. Les modifications faites dossier
  fermé sont reportées à l'ouverture suivante. Nouvelles méthodes
  `pluginData.list` et `pluginData.onRemoteChange`, capacité
  `features.sharedPluginData`. Voir le guide des extensions.

## 2.62.4

### Nouveautés

- **Fuseau d'une propriété date/heure** — comme sur les événements, la
  ville à droite de l'heure choisit le fuseau de la source, dès l'ajout de
  la propriété. L'heure est saisie telle qu'elle figure dans la source ;
  ailleurs elle s'affiche dans votre fuseau suivie de l'heure d'origine
  (`20 avr. 2024, 02:12 (03:12 Beirut)`) : canvas, rapports, timeline,
  matrice, export Obsidian. Conservé en collaboration, en sélection
  multiple et à l'export ZIP/JSON.
- **Matrice : sources sur plusieurs lignes** — un double-clic ouvre une
  zone d'édition, une source par ligne (Entrée ajoute une ligne,
  Ctrl+Entrée enregistre), au lieu du renvoi vers le panneau. Les liens
  de la colonne Source s'ouvrent d'un clic (page web, document joint,
  extension).

### Corrections

- **Timeline** — les propriétés date/heure n'y apparaissaient pas ; les
  propriétés date importées en texte tombaient la veille à l'ouest de
  UTC ; les dates des propriétés d'un événement s'affichaient en texte
  brut du navigateur.
- **Matrice** — valider une cellule date sans la changer remplaçait la
  date par son texte (heure et fuseau perdus), un nombre devenait du
  texte ; une saisie illisible est maintenant ignorée. Les dates/heures
  affichent l'heure et sont triées dans l'ordre chronologique.

### Documentation

- Dates et fuseaux horaires : fuseau des propriétés date/heure.
- Vue matrice : sources, liens et dates.

## 2.62.3

### Corrections

- **Arranger avec des groupes** — les éléments d'un groupe se
  séparaient de leur cadre, quel que soit l'arrangement (Circulaire,
  Grille, Dispersion, Hiérarchie, mais aussi Force et Clusters). Un
  groupe est maintenant arrangé d'un bloc avec ses éléments, à la taille
  de son cadre ; ses liens vers l'extérieur comptent pour le groupe.
  Sélectionner seulement des éléments d'un même groupe les arrange à
  l'intérieur du groupe. Les éléments sont placés par leur centre, ce qui
  évite les chevauchements des grands éléments.
- **Propriétés date/heure importées** — depuis la 2.61.0, une valeur
  importée à minuit UTC (`2024-03-12T00:00:00Z`) s'affichait à 02:00 à
  Paris. Minuit UTC reste minuit dans le fuseau du poste ; les autres
  heures avec fuseau sont lues exactement. L'import d'une archive ZIP ou
  JSON convertit ces valeurs en dates.
- **Heure des propriétés date/heure** — affichée sur le canvas (badge,
  propriétés affichées) et dans les rapports, même à 00:00.

### Documentation

- Analyse de graphe : layouts et groupes.
- Dates et fuseaux horaires : propriétés date/heure des anciennes archives.

## 2.62.2

### Corrections

- **Champ Source avec plusieurs adresses web** — le bouton d'ouverture
  collait les adresses (`https://www.google.comhttps//www.yandex.com`).
  Une adresse `https://…` écrite seule est maintenant un lien, une par
  ligne ; le menu **Liens** les propose toutes. Un champ réduit à une seule
  adresse garde son bouton d'ouverture.

### Documentation

- Éléments et liens, guide des extensions : adresses écrites seules.

## 2.62.1

### Corrections

- **Champ Source : une source par ligne** — le retour à la ligne sépare les
  sources (Entrée en édition) ; un `;` n'a plus de rôle et « PV 12; annexe »
  reste entier. La fusion d'éléments place les sources l'une sous l'autre.
- **Champ Source avec beaucoup de sources** — en lecture, une par ligne,
  les trois premières puis **+N autres** pour déplier ; en édition, le texte
  passe à la ligne et le champ s'agrandit.
- **Sorties sur une ligne** — matrice, timeline et lignes Obsidian séparent
  les sources par « · », tableaux Markdown par `<br>`, rapport HTML par un
  saut de ligne. Dans la matrice, une source de plusieurs lignes se modifie
  dans le panneau de détail.

### Documentation

- Éléments et liens, guide des extensions : une source par ligne.

## 2.62.0

### Features

- **Liens dans le champ Source** — `[libellé](https://…)` ouvre la page,
  `[libellé](asset:3fa1c2d9)` ouvre l'aperçu du fichier joint dont
  l'empreinte SHA-256 commence ainsi (8 caractères minimum, stable à
  l'export/import). Hors édition, seuls les libellés s'affichent ; un clic à
  côté repasse en texte brut. Fichier absent : libellé grisé. Toute autre
  cible reste du texte. Élément, lien et événement ; la matrice et la
  timeline affichent les libellés ; le menu « Liens » propose chaque lien web
  du champ.
- **Rapports et exports** — liens de source réduits au libellé (ANX), liens
  web conservés (rapports HTML et Markdown, Obsidian). CSV et JSON
  inchangés.
- **Métadonnées de plusieurs fichiers** — case **Appliquer aux fichiers
  suivants** : le choix (clés cochées, GPS, ou ignorer) vaut pour tout
  l'ajout, y compris les fichiers encore en chargement.
- **Extensions** — slot `source:scheme` : une extension rend cliquables ses
  propres liens `[libellé](schéma:valeur)`. `api.version` et `api.features`
  (`sourceLinks`, `sourceSchemes`) pour tester une fonction avant de s'en
  servir.

### Corrections

- **Losanges** — le texte était coupé par les coins ; il tient dans la
  forme, avec « … » au-delà.
- **Clic-droit après une sélection au lasso** — le menu du navigateur
  s'ouvrait sur le cadre de sélection ; c'est maintenant le menu ZN
  (Grouper, Copier…).
- **Grouper la sélection** — le cadre ne couvrait pas toujours les
  éléments (losanges, cercles, images) ; un groupe sélectionné était
  imbriqué et un élément déjà groupé faussait le cadre. Seuls les éléments
  libres sont repris, et **Grouper** n'apparaît que s'il y en a au moins
  deux. Même correction de taille pour **Grouper le cluster** (Insights).
- **Aperçu de fichier depuis le canvas** — même aperçu que le panneau
  Fichiers (texte, e-mail, docx en plus des images et PDF).
- **Fenêtre des métadonnées** — traduite dans les 11 langues.

### Documentation

- Éléments et liens : liens dans la source, groupement après un lasso.
- Fichiers joints : métadonnées de plusieurs fichiers.
- Guide des extensions : `api.version`, `api.features`, slot
  `source:scheme`.

## 2.61.1

### Corrections

- **Import JSON (correspondance de champs)** — un horodatage avec fuseau
  (`…Z`, `+02:00`) était lu comme une heure locale ; il est maintenant lu
  exactement. Une date sans heure devient la journée entière (et non midi).
  Même correction pour une date collée dans un champ date.
- **Métadonnées PDF** — une date sans fuseau est lue en heure locale ; seul
  un `Z` explicite signifie UTC.
- **Rapports HTML, Markdown, PDF et rapport interactif** — les propriétés de
  type date s'affichaient en texte brut du navigateur
  (`Tue Mar 12 2024 00:00:00 GMT+0100…`) ; elles s'affichent maintenant
  `12 mars 2024`, dans la langue du rapport. Les événements gardent leur
  précision, leur durée et l'heure d'origine (`02:12 (03:12 Beirut)`).
- **Export Obsidian et GeoJSON** — le fuseau de la source est conservé
  (heure d'origine après la date, propriété `timeZone`).

### Documentation

- **Dates et fuseaux horaires** : tableau du devenir du fuseau de la source
  selon le format (ZIP, CSV, Obsidian, GeoJSON, i2, rapports, import JSON).

## 2.61.0

### Features

- **Mode temporel du canvas** — bouton **Temporel** : même barre que la
  carte (pas à pas, lecture, champ date). Les éléments ayant un événement à
  la date et les liens actifs ont un halo, le reste daté est atténué, les
  non datés sont grisés ou masqués (œil). Les positions ne bougent pas.
- **Sélection d'une période** — sur le canvas et la carte, bouton
  **Période** : curseur à deux poignées, lecture qui fait glisser la
  période. Sur la carte, seuls les éléments actifs dans la période
  apparaissent, la trace se limite à la période.
- **Événements sous les éléments et les marqueurs** — en mode temporel,
  l'événement s'affiche sous l'élément (`+N` s'il y en a plusieurs) ; la
  liste datée s'ouvre au survol, un clic ouvre l'événement dans le panneau.
- **Fuseau d'un événement ou d'une période de lien** — bouton ville à côté
  de l'heure : l'heure se saisit dans le fuseau de la source et s'affiche
  ailleurs avec l'heure d'origine, ex. `02:12 (03:12 Beirut)`. Conservé en
  collaboration et à l'export CSV (colonne `fuseau`).
- **Dossier, section Dates** — fuseau d'affichage, et correction sur
  demande des dates importées à minuit UTC par d'anciens imports.
- **Dates incomplètes en généalogie** — GEDCOM / GeneWeb : `1890`,
  `mars 1890`, `~1890` au lieu d'un faux 1er janvier ; la date couvre toute
  la période sur la timeline et la barre temporelle.
- **Timeline** — libellé des barres courtes et des événements ponctuels
  affiché après la barre ; infobulle limitée aux dates.

### Corrections

- **Dates décalées d'un jour ou d'une heure selon le fuseau** :
  - export CSV (dossier et timeline) : la veille pour les dates sans heure ;
  - aller-retour i2 (ANX) et import ANB : 1 à 2 h de décalage ;
  - import CSV, GeoJSON, GraphML : `AAAA-MM-JJ` lu à minuit UTC (01:00 à
    Paris, la veille en Amérique) ;
  - générateur de requêtes, curseur de période de la timeline, export
    Obsidian, éditeur de propriétés : jour ou heure UTC affichés ;
  - journées de 23 h / 25 h aux changements d'heure.
- **Collaboration** — les propriétés de type date d'un événement arrivaient
  vides chez les autres participants.
- **Format des dates dans 9 langues** — les dates s'affichaient au format
  américain hors français et anglais.
- **Barre d'outils** — sur écran étroit, le bloc de droite ne passe plus en
  entier à la ligne (décalage dans la timeline).

### Documentation

- Nouvelles pages **Mode temporel** et **Dates et fuseaux horaires**.
- Timeline, carte, éléments et liens, import / export CSV mis à jour
  (formats de date, colonne `fuseau`).

## 2.60.2

### Corrections

- **Fenêtre d'export dans l'ordre de la documentation** — ZIP en tête, puis
  JSON, CSV, GraphML, GEXF, ANX, Obsidian, GeoJSON, et les images (PNG, SVG)
  en dernier.
- **Liste des formats d'import complétée** — ANB, Mermaid, FEC, STIX 2.1 et
  GeoJSON s'importaient déjà mais n'étaient pas annoncés ; liste remise dans
  l'ordre de la documentation, sans doublons (11 langues).

### Documentation

- Nouvelle page **Stockage et maintenance** : fenêtre Stockage, sauvegarde
  complète, purge de l'historique Y.js et bilan.
- **Collaboration** : aucun serveur n'est configuré d'office, contrairement à
  ce qu'indiquait la page ; adresse du serveur public
  `wss://sync.zeroneurone.com` et marche à suivre.
- **FAQ** revue : tutoriel guidé, ZNQuery, ontologie et tags, métadonnées et
  EXIF, analyse de graphe, rapport et synthèse, recherche, filtres et vues,
  commentaires, aperçu PDF, place occupée, formats d'échange, serveur de
  collaboration, fichiers partagés, mode sombre, langues, raccourcis.

## 2.60.1

### Aperçu PDF

- **Défilement continu** — toutes les pages se suivent ; seules celles proches
  de l'écran sont dessinées. Le compteur suit la page en cours, les flèches
  sautent d'une page à l'autre et le zoom garde l'endroit lu à l'écran.
- **Recherche dans le texte** — loupe à côté de la pagination ou Ctrl+F.
  Insensible à la casse, aux accents et aux ligatures ; résultats surlignés,
  Entrée / Maj+Entrée pour naviguer, Échap pour fermer.
- **Largeur de la page / Page entière** — deux modes d'ajustement, conservés
  quand le panneau change de taille.
- **Sélection de texte** — relâcher la souris dans une zone vide ne
  sélectionne plus le paragraphe précédent (Firefox) ou les suivants
  (Chromium) ; un double-clic dans le vide ne sélectionne plus rien.

### Stockage

- **Purge de l'historique Y.js** (Stockage → Maintenance), en remplacement du
  compactage, qui ne libérait rien : il regroupait le journal en un instantané
  qui gardait toutes les traces des modifications. Le dossier est reconstruit
  à partir de son contenu, vérifié à l'identique puis écrit en une seule
  transaction ; rien n'est écrit en cas d'écart ou de données illisibles.
  Les dossiers partagés et le dossier ouvert ne sont pas concernés.
- **Fichiers joints : plus de double stockage pour les dossiers locaux.**
  Chaque fichier était aussi copié en binaire dans le document Y.js, même
  sans partage. Il n'y est plus copié qu'au partage du dossier (puis à chaque
  ouverture tant qu'il est partagé). La purge retire les copies existantes des
  dossiers non partagés, pour les fichiers présents en local et dont
  l'empreinte SHA-256 correspond.

## 2.60.0

### Features

- **Export Obsidian** — nouveau format dans la fenêtre d'export : un coffre
  Obsidian (ZIP à ouvrir comme coffre) avec une fiche Markdown par élément.
  Les tags, la confiance, l'évaluation, la source, les dates, la position
  (`location`, compatible Map View) et les propriétés passent en propriétés
  Obsidian ; les notes, événements et fichiers joints forment le corps.
  Les relations sont écrites dans une section Relations (sens, dates,
  confiance, notes du lien), visibles dans la vue graphe et les rétroliens,
  et en propriétés par libellé (`employé de: [[ACME]]`) interrogeables avec
  Dataview ou Bases. Chaque onglet devient un fichier Canvas qui reprend la
  disposition du graphe, les libellés, couleurs et sens des liens, les
  groupes et les annotations. Le rapport est exporté avec ses références
  converties en liens vers les fiches.

## 2.59.1

### Fixes

- **Export i2 (.anx) refusé par Analyst's Notebook** — i2 rejetait le fichier
  dès qu'un élément ou un lien portait des propriétés (« ChartItem a un élément
  enfant non valide 'AttributeCollection' »). Les propriétés sont maintenant
  écrites après l'élément ou le lien, et les dates et événements à l'intérieur
  de celui-ci, dans l'ordre qu'utilise i2. Les dates exportées sont aussi
  relues lors d'un réimport dans ZeroNeurone. Les noms de propriétés
  sont nettoyés des espaces et retours chariot résiduels.
- **Import CSV : cellules sur plusieurs lignes** — une cellule entre
  guillemets contenant un retour à la ligne (Alt+Entrée dans Excel) coupait la
  ligne en deux et créait un élément de trop. Elle est désormais lue d'un seul
  tenant, notes multi-lignes comprises. Concerne l'import CSV d'éléments, de
  liens, le format unifié et l'import de TagSets.
- **Import CSV de TagSets : fins de ligne Windows** — la dernière colonne
  d'un fichier enregistré par Excel gardait un retour chariot final.

## 2.59.0

### Features

- **Modèle d'évaluation de l'information** — chaque dossier choisit, dans ses
  détails, comment évaluer l'information de ses éléments et liens : la
  confiance ZeroNeurone (0-100 %), la grille Europol 4x4 (article 29 du
  règlement (UE) 2016/794 : fiabilité de la source A/B/C/X, exactitude de
  l'information 1 à 4) ou le code de l'Amirauté / OTAN 6x6. Le modèle est
  commun à tous les participants d'une session collaborative.

  Changer de modèle ne convertit rien : aucune correspondance officielle
  n'existe entre les grilles. Les confiances restent enregistrées et
  réapparaissent au retour au modèle ZeroNeurone ; une cotation faite dans une
  autre grille reste affichée en grisé, et le changement demande une
  confirmation qui indique combien de cotations sont concernées.

  La cotation (ex. `B2`) se saisit dans la fiche, en multi-sélection ou
  directement dans la matrice ; elle s'affiche en badge sur le canvas, se
  filtre (codes à cocher, filtre rapide « Sources fiables »), s'interroge en
  ZNQuery (`evaluation`, `evaluation.source`, `evaluation.info`,
  `evaluation.scale`), apparaît dans les rapports et la synthèse, et voyage
  dans les exports ZIP/JSON (format 1.2.0), CSV, GEXF, GeoJSON et ANX (grades
  i2 1 et 2).
- **Confiance réinitialisable** — un bouton « Effacer » remet la confiance
  d'un élément ou d'un lien à « non définie », aussi en multi-sélection.

### Fixes

- **Confiance d'un collaborateur** — la fiche d'un élément ouverte pendant
  qu'un collaborateur modifiait sa confiance continuait d'afficher l'ancienne
  valeur.
- L'indicateur de confiance du canvas utilise une icône à la place d'un emoji,
  et son infobulle est traduite.

### Docs

- Nouvelle page « Évaluation de l'information » ; README mis à jour.

## 2.58.5

### Fixes

- **Export et sauvegarde : clé de session partagée retirée** — l'export
  ZIP/JSON d'une enquête et la sauvegarde globale contenaient la clé de
  chiffrement de la dernière session partagée (`lastSharedKey`) : quiconque
  recevait le fichier pouvait rejoindre cette session. Cette clé et les autres
  champs propres à l'appareil (`lastSharedAsync`, `origin`) ne sont plus
  écrits dans les fichiers exportés.

## 2.58.4

### Fixes

- **Aperçu PDF : texte sélectionnable** — un calque de texte pdf.js est
  superposé au rendu de la page : le texte peut être sélectionné et copié
  (hors PDF scannés sans OCR). Le Ctrl+C / Ctrl+X du canvas ne remplace plus
  le presse-papier quand du texte est sélectionné dans un aperçu (PDF ou
  fichier texte).

## 2.58.3

### Fixes

- **Plugins : sélecteur de carte de ZN** — les plugins peuvent ouvrir le
  sélecteur de position de ZN via `api.ui.openGeoPicker(initial, { query })`
  (nouvelle permission `ui`, accordée par défaut). La carte et la recherche
  d'adresse restent des appels réseau de ZN ; le texte transmis pré-remplit
  le champ de recherche, qui attend l'action de l'utilisateur. La promesse
  renvoie le point choisi, ou `null` en cas d'annulation.

## 2.58.2

### Fixes

- **Carte : erreur « t.bitmap is undefined »** — le service worker gardait
  indéfiniment en cache le worker de MapLibre (`maplibre-gl-worker.mjs`,
  `maplibre-gl-shared.mjs`), dont le nom ne change pas d'une version à
  l'autre. Depuis le passage à MapLibre 6.11 (v2.58.0), un navigateur qui
  avait déjà ouvert la carte combinait l'ancien worker avec la nouvelle
  bibliothèque, et l'affichage des libellés échouait. Ces fichiers sont
  désormais mis à jour selon leur contenu.

## 2.58.1

### Fixes

- **Aperçu PDF en production** — sur zeroneurone.com, l'aperçu d'un PDF joint
  échouait (« Impossible d'afficher ce PDF ») : pdf.js lisait le fichier via
  une URL `blob:`, requête que la Content-Security-Policy du serveur
  (`connect-src` sans `blob:`) bloquait. Le PDF est désormais transmis
  directement à pdf.js, quelle que soit la politique du serveur.
- **CSP** — `blob:` est ajouté à `connect-src` dans `security-headers.conf`.
  Une URL `blob:` ne désigne qu'un objet créé par la page elle-même ; cela
  évite qu'un export PNG du canvas perde silencieusement les images affichées
  en haute définition.

## 2.58.0

### Features

- **Import Mermaid** — un diagramme Mermaid de type `flowchart` ou `graph`
  devient un graphe ZeroNeurone. Le cas d'usage visé : demander à un assistant
  IA de structurer des notes en graphe Mermaid, puis coller sa réponse. Le
  diagramme se colle avec Ctrl+V sur le canvas (y compris entouré du bloc
  ` ```mermaid ` et de texte explicatif) ou via « Coller » du clic droit, et
  s'importe aussi depuis un fichier `.mmd`, `.mermaid` ou `.md` (le premier
  bloc flowchart du Markdown est utilisé). Il est ensuite placé d'un clic, sans
  toucher au contenu existant, et s'annule comme toute création.

  Formes, libellés, flèches (orientées, bidirectionnelles, pointillées,
  épaisses), couleurs `classDef` / `style` sont repris ; chaque `subgraph`
  devient un tag. Mermaid ne contenant aucune position, la disposition est
  recalculée selon le sens du diagramme (`TD`, `LR`…). Les lignes non comprises
  sont ignorées et comptées dans un avertissement plutôt que de faire échouer
  l'import ; les autres types de diagrammes (séquence, entités, mindmap…) sont
  refusés avec un message explicite.
- **Copier en Mermaid** — une sélection de plusieurs éléments se copie en bloc
  Mermaid, à coller dans un wiki, Obsidian, GitHub ou un rapport Markdown. Les
  groupes deviennent des `subgraph`. Les positions, propriétés et dates ne sont
  pas transmises.
- **Menu clic droit réorganisé** — le menu d'un élément passe d'une longue
  liste à une dizaine de lignes : les actions moins fréquentes sont rangées
  dans des sous-menus Focus, Analyser, Organiser et Onglets (un sous-menu qui
  n'aurait qu'une entrée s'affiche à plat). Les sous-menus s'ouvrent au survol
  ou au clic, et le menu se parcourt au clavier (flèches, Entrée, Échap).
  « Coller » quitte le menu d'un élément et reste dans celui du canvas.
- **Extensions dans le menu** — une extension qui ajoute plusieurs entrées les
  range dans un sous-menu à son nom ; une extension à entrée unique reste au
  premier niveau.

### Fixes

- **Sous-menus des extensions** — les choix proposés par une extension (par
  exemple plusieurs tags suggérés) n'étaient affichés que sur les liens : sur
  un élément ou le canvas, le clic ne faisait rien. Ils s'affichent désormais
  partout.
- **Entrées d'extension affichées à tort** — une extension qui décide de façon
  différée si elle s'applique à un élément était toujours affichée. Sa réponse
  est maintenant attendue : moins d'entrées apparaissent, mais seulement celles
  qui ont un sens pour l'élément cliqué.

## 2.57.0

### Features

- **Export vers i2 Analyst's Notebook** — un nouveau format `.anx` rejoint la
  liste d'export. Le fichier s'ouvre directement dans Analyst's Notebook, sans
  configuration préalable chez le destinataire. La disposition du canvas, les
  couleurs, la direction et l'épaisseur des liens sont conservées. Le premier
  tag de chaque élément devient son type d'entité i2, les tags suivants et les
  propriétés deviennent des attributs, en gardant leur nature lorsque i2 a un
  équivalent : nombres, dates et booléens sont préservés, le reste passe en
  texte. Dates et événements deviennent des fiches i2.

  Certaines notions n'ont pas d'équivalent et ne sont pas transmises. Les
  groupes et les annotations ne sont pas exportés : leurs éléments sont placés à
  leur position réelle et gardent le nom du groupe en attribut. Une zone
  géographique est réduite à son point central, une plage de dates à deux
  attributs, et les formes, les médias joints et les tailles personnalisées sont
  perdus.

  Le format binaire `.anb` n'est pas proposé à l'export. Sa structure n'est pas
  documentée publiquement, et ZeroNeurone ne sait le lire que partiellement, par
  reconnaissance de motifs : de quoi ouvrir un fichier, pas d'en écrire un.

## 2.56.2

### Fixes

- **Erreurs de console sur la carte** — deux fichiers internes de la carte
  réclamaient un fichier de débogage que l'application ne distribue pas, ce qui
  produisait des erreurs visibles dans la console du navigateur. La référence
  est retirée, plutôt que d'alourdir l'application de 2,5 Mo pour un fichier
  utile aux seuls développeurs de la bibliothèque.
- **Rechargement inutile du fond de carte** — la carte rechargeait son fond une
  fois à l'ouverture, alors qu'elle venait d'être créée avec ce même fond. Ce
  rechargement redessinait au passage tous les liens et laissait un
  avertissement en console. Il est supprimé.

## 2.56.1

### Fixes

- **Construction de l'image Docker** — la v2.56.0 ne se construisait pas : un
  script de préparation avait été renommé sans que le Dockerfile suive. Au-delà
  de l'échec, l'image n'aurait de toute façon pas embarqué le correctif de la
  carte livré en 2.56.0, la construction Docker n'appelant pas le même
  enchaînement que la construction locale. L'image combinée était dans le même
  cas, et n'embarquait déjà pas le moteur de lecture des PDF. Si vous avez
  déployé une image 2.56.0, remplacez-la.

## 2.56.0

### Fixes

- **La carte n'affichait plus aucune couche vectorielle** — depuis la v2.52.1 et
  le passage à MapLibre v6, les lignes entre éléments, les zones et les
  bâtiments avaient disparu de la carte, sans le moindre message dans la
  console. MapLibre v6 charge son moteur de traitement depuis un fichier séparé
  que la construction du projet n'embarquait pas : la requête tombait sur la
  page d'accueil, le navigateur refusait le fichier, et la carte se retrouvait
  privée de tout ce qu'elle doit calculer elle-même. Les fichiers concernés sont
  désormais copiés à la construction comme à l'exécution en développement.
- **Changer de fond de carte faisait disparaître les liens** — et
  définitivement : ils ne revenaient qu'en rouvrant le dossier. Leur
  reconstruction attendait un signal que MapLibre n'émet pas lorsqu'il passe
  d'un fond à un autre sans tout recharger.
- **Le bouton Bâtiments restait sans effet sur certains fonds** — les fonds
  vectoriels apportent leurs propres volumes de bâtiments, que le bouton ne
  pilotait pas. Il agit maintenant sur les deux.

### Fonds de carte

- **CartoDB retiré** — le fournisseur exige désormais une clé d'accès. Si vous
  l'aviez sélectionné, votre choix bascule automatiquement vers OpenFreeMap.
- **OpenFreeMap ajouté, et devient le fond par défaut** — carte vectorielle
  libre, sans compte ni clé, dont le rendu reste net à tous les niveaux de zoom.
  Le bouton porte un chevron ouvrant cinq variantes : automatique, qui suit le
  thème clair ou sombre de l'application, clair, détaillé, sombre et contrasté.
- **Sélecteur simplifié** — trois fonds au lieu de quatre : OpenFreeMap,
  OpenStreetMap et Satellite. L'entrée OSM FR/DE disparaît, OpenFreeMap rendant
  les mêmes noms de lieux plus lisiblement ; les préférences qui la nommaient
  basculent vers OpenStreetMap. Celui-ci est conservé comme second fournisseur,
  de sorte qu'une interruption d'OpenFreeMap ne laisse pas sans carte.

## 2.55.2

### Fixes

- **Politique de sécurité de contenu trop restrictive** — la v2.55.1 a rendu
  effective, pour la première fois, la politique de sécurité de contenu
  déclarée dans la configuration nginx : un défaut d'héritage faisait qu'elle
  n'était auparavant émise sur aucune réponse. Écrite pour une application sans
  extensions, elle bloquait les appels réseau des plugins — API Mistral, OpenAI
  ou Anthropic et modèles HuggingFace pour OneNeurone, proxy RPUC pour
  SpotNeurone, serveur GoNeurone, stockage S3 ou WebDAV pour VaultNeurone — ces
  adresses étant choisies par l'utilisateur, aucune liste fermée ne peut les
  énumérer. Elle bloquait aussi WebAssembly, dont dépendent ForeNeurone pour
  lire les bases SQLite et OneNeurone pour les modèles locaux, ainsi que la
  lecture des vidéos jointes.

  Les destinations réseau, les images et les médias sont désormais ouverts. Ce
  qui protège réellement est conservé et vérifié : les scripts en ligne et les
  scripts d'origine externe sont refusés, `eval` reste interdit, et
  `object-src`, `base-uri`, `form-action` et `frame-ancestors` sont verrouillés.
  Restreindre les destinations n'apportait ici qu'une assurance de façade, un
  plugin s'exécutant dans le même contexte que l'application avec un accès
  réseau libre.

  Après mise à jour, le service worker peut encore servir l'ancienne politique
  depuis son cache : un rechargement forcé, ou la fermeture puis réouverture de
  l'onglet, suffit à la remplacer.

## 2.55.1

### Sécurité

Audit statique de la base, suivi de la correction des constats vérifiés. Sept
défauts, dont deux critiques. Chaque correction est couverte par un test de
non-régression, validé en rétablissant le code d'origine pour vérifier qu'il
échouait alors.

- **Injection HTML via la vignette d'un asset partagé** — la vignette d'un
  fichier joint était insérée sans échappement dans un `url()` non quoté du
  marqueur de carte, puis posée par `innerHTML`. Cette vignette arrive telle
  quelle d'un pair de collaboration, et le contrôle d'intégrité SHA-256 ne
  portait que sur le fichier lui-même, jamais sur cette chaîne : un pair
  malveillant pouvait donc faire exécuter du code dans l'application de ses
  correspondants, avec accès à leurs dossiers. Les vignettes sont désormais
  validées à la réception comme à l'affichage. Même correction dans le rapport
  HTML, qui reçoit au passage une politique de sécurité de contenu.
- **Perte de données à la désactivation du chiffrement** — si un dossier
  échouait au déchiffrement, l'erreur n'apparaissait qu'en console et la
  procédure supprimait malgré tout la clé, seule copie existante : le dossier
  restait chiffré et devenait définitivement illisible. La désactivation
  s'interrompt maintenant avant toute suppression et signale les dossiers
  concernés, la base restant entièrement récupérable avec le mot de passe. Une
  base illisible est comptée comme un risque de perte et non plus comme une
  absence de perte. À l'activation, un chiffrement partiel est signalé au lieu
  d'être présenté comme complet.
- **Exports SVG** — les couleurs n'étaient pas filtrées avant d'être écrites
  dans le fichier, contrairement au rapport interactif. Un fichier `.svg`
  exporté pouvait exécuter du code à l'ouverture, y compris chez un
  destinataire tiers.
- **Validation des fichiers joints** — un fichier était accepté dès que son
  type déclaré *ou* son extension convenait, alors qu'une archive importée
  contrôle les deux. L'extension fait désormais foi, et un type déclaré doit
  être reconnu. Les orthographes acceptées jusqu'ici par leur type (`.jfif`,
  `.markdown`, `.m4v`, `.oga`, `.ogv`, `.tif`…) restent acceptées.
- **En-têtes de sécurité** — la configuration nginx déclarait bien une
  politique de sécurité de contenu, HSTS et les autres en-têtes, mais nginx
  n'en émettait aucun : un bloc `location` qui définit un en-tête n'hérite
  d'aucun en-tête du niveau supérieur. Vérifié sur conteneur avant et après.
- **Plugins** — une entrée de manifeste sans empreinte désactivait
  silencieusement la vérification d'intégrité ; elle est maintenant refusée.
  Le filtrage de permissions est documenté pour ce qu'il est : un plugin
  s'exécute dans le même contexte que l'application, le filtrage façonne
  l'interface qui lui est remise mais ne le confine pas. Un plugin installé
  doit être considéré comme du code de confiance.
- **Relais de collaboration** — l'en-tête `X-Forwarded-For` était accepté sans
  condition, ce qui permettait de contourner la limite de connexions par
  adresse. Il n'est désormais pris en compte que derrière un proxy déclaré,
  via la variable `TRUST_PROXY`.

### Fixes

- Le chargement des plugins recevait l'instance i18n en paramètre depuis
  l'ajout de `skipIds`, ce qui empêchait la compilation.

## 2.55.0

### Features
- **Icônes personnalisées (SVG)** — le sélecteur d'icônes accepte désormais vos propres fichiers SVG (section « Mes icônes »), par exemple des logos de services téléchargés depuis Simple Icons — ZeroNeurone n'embarque volontairement aucun logo de marque (droit des marques, raison pour laquelle Lucide a déprécié les siens). Le SVG est sanitisé à l'import (DOMPurify durci : scripts, `foreignObject`, références externes supprimés ; 64 Ko max) et normalisé en `currentColor` pour suivre le thème et se recolorer comme une icône Lucide. Les icônes sont globales, dédupliquées par contenu, stockées dans une nouvelle table Dexie (v15), et rendues partout où les icônes de tags apparaissent (canvas, groupes, panneau de détail, gestionnaire de jeux de tags).
  - **Portabilité** : l'export d'un dossier (ZIP et JSON) embarque désormais les jeux de tags utilisés par les éléments **avec leurs SVG inline** — ce qui corrige au passage une lacune : les jeux de tags ne voyageaient pas du tout. À l'import, les icônes sont re-sanitisées (défense en profondeur), les jeux absents recréés, les références remappées ; l'existant local n'est jamais écrasé. L'export/import JSON dédié du gestionnaire de jeux de tags passe en v2 avec les mêmes garanties (v1 toujours acceptée).
- **Renommage de tags** — un tag peut être renommé depuis le panneau de détail (crayon au survol ou double-clic sur le chip). Le renommage réécrit le tag sur tous les éléments **et liens du dossier courant** (synchronisé Y.js), met à jour la liste de suggestions, et duplique le jeu de tags sous le nouveau nom pour que l'icône et les visuels suivent — sans toucher au jeu d'origine ni aux autres dossiers.

### Fixes
- **Dropdowns coupés au bord de l'écran** — `DropdownPortal` ancrait toujours le menu au bord gauche de son déclencheur sans vérifier le viewport : ouvert depuis un chip de tag dans le panneau latéral droit, le sélecteur d'icônes débordait de la fenêtre (grille tronquée). La position est désormais bornée au viewport, avec ouverture vers le haut quand la place manque en bas — tous les dropdowns en profitent.
- **Doublons dans la recherche d'icônes** — les alias `Lucide*` exportés par lucide-react polluaient la liste (3816 entrées au lieu de ~1900) : chaque icône apparaissait deux fois dans les résultats.

## 2.54.0

### Features
- **Import FEC** — un Fichier des Écritures Comptables (format normalisé DGFiP, `.txt`/`.fec`, détecté par son en-tête) se transforme en graphe de flux financiers orienté enquête et due diligence, plutôt qu'en 90 000 lignes tabulaires. Les tiers auxiliaires deviennent des éléments taggés (Client, Fournisseur, Tiers), les comptes généraux sont agrégés par racine PCG (Banque, Charge, Produit…), et les écritures équilibrées produisent des liens de flux agrégés — montant cumulé en label, épaisseur logarithmique, nombre d'écritures, journaux et période en propriétés, dates visibles en chronologie. Convention de sens : du compte crédité vers le compte débité (le sens de la valeur). Un écran d'options avec aperçu instantané contrôle le volume : plafond top-N tiers, **seuil de montant pré-calculé depuis la distribution réelle des flux** (un seuil fixe n'a aucun sens d'un FEC à l'autre), familles à inclure, période, et exclusion par défaut des flux techniques entre comptes généraux (TVA, OD, paie) qui maillent le graphe sans nommer personne. Sur un FEC réel de 94 000 lignes : analyse en ~350 ms, graphe par défaut d'environ 85 éléments et 140 liens, disposés en colonnes par famille dans le sens de la valeur. Disponible dans les deux chemins d'import (nouveau dossier, dossier courant avec placement au clic). Prorata n×m au sein des écritures, contrôle d'équilibre, 16 tests unitaires.

## 2.53.0

### Features
- **Support des emails EML** — un fichier `.eml` (RFC 822) déposé sur le canvas ou joint à un élément est maintenant accepté, prévisualisé et analysé. Parser MIME intégré sans dépendance : en-têtes dépliés et encoded-words RFC 2047, multipart imbriqué, quoted-printable/base64, jeux de caractères, messages transférés.
  - **Analyse** : la modale de proposition de métadonnées remonte expéditeur, destinataires, sujet, date d'envoi (utilisable en chronologie), Message-ID, client de messagerie, **IP d'origine** (dernier relais public de la chaîne Received, ou X-Originating-IP), chemin de retour et Répondre-à quand ils diffèrent de l'expéditeur (indice d'usurpation), pièces jointes, **liens du corps** et **images distantes** (pixels de tracking) en propriétés de type lien — plafonnés pour ne pas noyer la modale.
  - **Prévisualisation** : l'aperçu affiche les en-têtes lisibles et le corps (repli sur le HTML débalisé), avec un bouton pour basculer sur la **source brute** intégrale (tous les en-têtes Received, DKIM…).
  - **Recherche** : le texte des emails (en-têtes + corps) est indexé, comme les PDF et DOCX.

### Fixes
- **Nom de hash dans la modale de métadonnées** — relancer l'extraction affichait le nom de stockage interne du fichier (hash SHA-256) au lieu de son nom d'origine ; `getAssetFile` restitue désormais toujours le vrai nom et le type MIME de la pièce jointe.
- **Image Docker : worker PDF désynchronisé** — le build de l'image lançait `npx vite build` sans le hook `prebuild`, embarquant le `pdf.worker.min.mjs` committé même quand `npm ci` installait un pdfjs-dist plus récent (erreur « The API version … does not match the Worker version … » à l'ouverture d'un PDF). Le Dockerfile synchronise maintenant le worker avant le build.

## 2.52.2

### Fixes
- **Flèches décollées des losanges** — le losange est dessiné en tournant le corps du nœud de 45° : ses pointes débordent de la boîte React Flow d'environ 20 %, alors que les points d'ancrage des liens restaient aux milieux des côtés de la boîte, à l'intérieur du dessin. Selon l'angle d'arrivée, la flèche finissait enterrée dans la forme ou flottante à côté du biseau. Les ancrages sont désormais placés sur les pointes visibles (calcul exact, valable aussi pour les dimensions héritées non carrées).
- **Redimensionnement du losange** — étirer un losange produisait une barre rectangulaire inclinée à 45°, plus un losange : la forme étant obtenue par rotation, un corps non carré ne donne pas un rhombe. Le redimensionnement conserve désormais les proportions (comme avec Alt), et un losange déjà enregistré avec des dimensions non carrées est affiché carré (moyenne des deux côtés).

## 2.52.1

### Security
- **maplibre-gl 5.24 → 6.9** — corrige le contournement du sanitizer XSS de `DOM.sanitize()` (GHSA-jrc7-96c5-q579, critique). Seule adaptation : la v6 supprime l'export par défaut, les imports passent en namespace. Dépendances d'outillage également corrigées via audit (vitest/mocker, browserslist, postcss, js-yaml, nanoid, fast-uri, brace-expansion).

### Features
- **Navigateur temporel de la carte exposé aux plugins** — l'instant sélectionné par le curseur temporel de la vue Carte (`mapTemporal { active, dateMs }`) est publié dans `useViewStore`, avec écriture dédupliquée et remise à zéro en quittant la vue ou le dossier. Les autres vues et les plugins (ex. ForeNeurone) peuvent s'y abonner pour caler leurs propres filtres de période sur la position de l'appareil au fil du balayage.

## 2.52.0

### Features
- **Tutoriel guidé interactif** — un parcours de prise en main pour le primo-utilisateur : des bulles ancrées sur l'endroit exact où cliquer ou saisir guident la création d'un dossier, de deux éléments nommés, d'une relation qualifiée, puis l'ajout d'un tag, d'une propriété, d'un événement daté et d'une géolocalisation (via « Choisir sur la carte »), avant un passage commenté dans les vues Carte, Chronologie et Matrice. Chaque étape se valide quand l'action est réellement faite — pas de « Suivant » à cliquer pour avancer, sauf sur les vues où un temps d'exploration est laissé. Le tutoriel est opt-in (proposé dans le bandeau d'accueil, relançable par une icône discrète sur la landing et la liste des dossiers), quittable à tout moment, et se déroule dans un dossier jetable au nom aléatoire dont la suppression est proposée à la fin. La progression survit à un rechargement de page ; si l'utilisateur s'écarte du parcours, une carte propose de continuer ou de quitter. Les bulles sont déplaçables à la souris quand elles gênent. Traduit dans les 11 langues.

### Fixes
- **Nœuds décalés de leur boîte de collision en production** — le corps d'un nœud était dessiné 64 px sous la boîte que React Flow lui attribuait. Le libellé paraissait rentré dans la forme et illisible, les poignées de redimensionnement flottaient au-dessus du nœud, et les blocs de propriétés recouvraient les cercles. En cause, `.handle-hitbox { position: relative }` dans la feuille de style de l'application, en conflit de même spécificité avec `.react-flow__handle { position: absolute }` de React Flow, les deux hors `@layer` : seul l'ordre des feuilles départageait. Le découpage du bundle introduit en 2.50.0 a sorti le CSS de React Flow dans un chunk distinct, émis avant celui de l'application, et la déclaration `relative` s'est mise à l'emporter — les huit poignées de connexion retombaient alors dans le flux normal et empilaient leur hauteur au-dessus du corps du nœud. La déclaration était inutile : cette classe n'est posée que sur des poignées, déjà positionnées en absolu et donc déjà bloc conteneur pour leur zone cliquable. Le défaut n'apparaissait qu'en production, le serveur de développement injectant les feuilles dans l'ordre d'évaluation des modules.
- **Affichage dégradé au dézoom sur les petits tableaux** — le rendu simplifié (formes pleines sans image, libellé ni étiquette) ne dépendait que du niveau de zoom. Un dossier de quelques dizaines d'éléments perdait donc toute lisibilité au dézoom alors qu'il n'y avait aucun temps de rendu à y gagner. Il ne se déclenche plus qu'à partir de 400 éléments, seuil au-delà duquel il change réellement quelque chose.

### Tests
- Les tests de bout en bout tournent désormais sur Firefox en plus de Chromium, et sur le **build de production** en plus du serveur de développement — les deux angles morts qui ont laissé passer le défaut ci-dessus, invisible en développement par construction.
- Nouvelle couverture de la mise en page d'un nœud : le conteneur React Flow, la racine du composant et la forme doivent partager la même boîte, et les poignées de redimensionnement encadrer la forme.

## 2.51.0

### Features
- **Relancer l'extraction des métadonnées** — l'extraction n'avait lieu qu'au moment où le fichier était attaché. Cliquer « Ignorer » sur la proposition, ou vouloir simplement y revenir plus tard, obligeait à détacher puis rattacher le fichier. Un bouton sur la ligne du fichier relance l'analyse à tout moment. Il est disponible sur **tous** les types de fichiers, images comprises — c'est justement là qu'il sert le plus, une photo portant ses coordonnées GPS. Quand un fichier ne contient aucune métadonnée, un message le dit : une action déclenchée par l'utilisateur ne doit pas rester sans réponse.
- **Zoom sur l'aperçu d'image** — une image s'affichait dans une simple balise dimensionnée par la fenêtre, sans moyen de l'agrandir. Elle dispose désormais des mêmes contrôles que l'aperçu PDF : de 40 % à 300 %, par pas de 25 %, avec ajustement initial à la largeur et défilement autour de l'image agrandie. Utile pour lire un document scanné ou examiner un détail sur une photo de scène. Les contrôles sont partagés entre les deux aperçus, qui se comportent donc à l'identique.

### Fixes
- Les libellés de zoom de l'aperçu PDF étaient codés en dur en français ; ils passent par les traductions.

## 2.50.3

### Fixes
- **Aperçu PDF vide** — régression introduite en 2.50.1. La tâche de chargement pdf.js était mémorisée dans une référence partagée entre les exécutions de l'effet React. En mode strict, l'effet se joue deux fois : la promesse de la première passe se résolvait après le nettoyage et détruisait alors la tâche de la **seconde**, laissant un document dont le worker était déjà démonté. Le premier appel à `getPage()` échouait sur un transport nul et l'aperçu restait vide. La tâche est désormais locale à chaque exécution.

### Interne
- Test de bout en bout sur l'aperçu PDF : attacher un document, l'ouvrir, vérifier qu'une page est réellement dessinée et qu'aucune erreur de transport n'est émise. Ce composant a cassé deux fois en deux versions sans qu'aucun test ne le couvre.

## 2.50.2

### Fixes
- **Aperçu PDF : annulation de rendu signalée comme une erreur** — changer de page ou de zoom relançait le rendu sans annuler le précédent. pdf.js interrompait alors lui-même le rendu obsolète, et l'exception correspondante était journalisée comme une panne. La tâche de rendu est désormais conservée et annulée à la sortie, et une annulation n'est plus traitée comme une erreur : c'est le mécanisme normal de changement de page.
- **Hooks conditionnels dans l'éditeur GeoJSON** — l'éditeur de coordonnées d'une zone polygonale appelait `useState` après un retour anticipé. React voyait un nombre de hooks variable selon la géométrie de l'élément, ce qui pouvait faire échouer le rendu du panneau. Défaut présent depuis l'ajout des zones géographiques.

## 2.50.1

### Fixes
- **Exécution de code à l'ouverture d'un PDF piégé** (CVE via `pdfjs-dist`, sévérité haute) — la version embarquée de pdf.js permettait l'exécution de JavaScript arbitraire à l'ouverture d'un document PDF malveillant. Dans un outil d'enquête, où l'on ouvre par nature des documents d'origine non maîtrisée, c'est exactement le scénario à écarter. Montée en version 6.2.108. L'aperçu PDF a été adapté : `PDFDocumentProxy.destroy()` n'existe plus, la libération du worker passe désormais par la tâche de chargement.
- **dompurify** (modéré) et **react-router** (haute) montés vers leurs versions corrigées. Le lockfile publié les contenait déjà — seuls les arbres de développement installés avant cette release étaient concernés.
- **Avertissement de moteur Node à la construction Docker** — `jsdom` 30 exige Node ≥ 22.22.2 alors que l'image de construction fournit 22.21. Redescendu en 29, qui accepte la même plage que le reste du projet. Dépendance de développement uniquement.

L'audit des dépendances de production ne remonte plus aucune vulnérabilité.

## 2.50.0

### Sécurité
- **Deux XSS dans les rapports HTML exportés** — un rapport interactif est fait pour être partagé : c'était le seul vecteur inter-utilisateurs d'une application locale. Le contenu des sections était injecté dans le `<script>` embarqué via `JSON.stringify`, qui n'échappe pas `</script>` : une note piégée s'exécutait chez le destinataire. Les URL des liens markdown étaient filtrées en minuscules mais insérées brutes dans `href`, sans échapper les guillemets, et le garde-fou aval n'inspectait que les noms de balises — un lien porteur d'un gestionnaire d'événement passait intact. Le sanitiseur maison est remplacé par DOMPurify.
- **Couleurs non validées** — `visual.color`, qui provient d'un import ou d'un pair, arrivait brut dans de l'`innerHTML` et des attributs SVG (carte, rapports, export). Validé au point de passage unique de chaque chemin.
- **Impression du rapport** — `document.write`, déprécié, remplacé par un chargement de document. L'attente porte sur l'événement `load` au lieu d'un délai fixe qui pouvait tomber sur une page vide.
- Les six `dangerouslySetInnerHTML` sur clés de traduction passent par un composant assaini.

### Intégrité des données
- **Suppression de dossier incomplète** — les requêtes ZNQuery sauvegardées et les commentaires n'étaient pas supprimés : ils restaient orphelins définitivement. Une migration nettoie les bases existantes.
- **Échecs d'écriture invisibles** — la persistance derrière le Y.Doc était en « lance et oublie » : 25 écritures pouvaient échouer en silence, une base non inscriptible ressemblait exactement à une sauvegarde réussie. Elles signalent désormais l'erreur, avec un message dédié à la saturation du stockage.
- **Désactivation du chiffrement** — les données non déchiffrables étaient effacées sans prévenir. L'opération les compte d'abord en lecture seule et demande une confirmation explicite indiquant combien seraient perdues.
- **Restauration de sauvegarde** — la version de l'archive était ignorée ; une sauvegarde issue d'une version plus récente était acceptée telle quelle.
- L'historique d'annulation est vidé au changement de dossier : un Ctrl+Z pouvait rejouer une action de l'enquête précédente.

### Performances
- **Analyse de graphe jusqu'à 290× plus rapide** — la détection des points d'articulation copiait le graphe entier pour chacun des N nœuds. Sur 5 000 éléments elle passe de 52 s à 4 ms, la détection de doublons de 17 s à 33 ms, et l'analyse complète de 72 s à 250 ms. À 10 000 éléments, six minutes deviennent moins d'une seconde.
- **Recalculs inutiles supprimés** — l'analyse se relançait à chaque déplacement de nœud, alors qu'elle ne dépend pas des positions. Les calculs concurrents ne s'empilent plus sans jamais se résoudre.
- **Canvas dézoomé fluide** — en vue d'ensemble d'un gros dossier, chaque nœud rendait son libellé, ses tags et ses badges, invisibles à ce zoom. Ils ne rendent plus que leur forme : la pire image passe de 181 ms à 17–33 ms sur 5 000 éléments, et le zoom est deux fois plus rapide.
- **Démarrage allégé de 41 %** — 4 853 Ko à 2 843 Ko. La carte et le lecteur PDF ne sont plus chargés d'emblée, et seule la langue active est téléchargée au lieu des onze.

### Accessibilité
- **Les 21 modales piègent le focus** — douze réimplémentaient leur coque à la main : tabuler en sortait vers la page derrière, Échap ne fermait pas, et le focus ne revenait pas à son point de départ à la fermeture.
- Les boutons à icône exigent désormais un nom accessible ; onze n'en avaient aucun. Les bascules de la barre d'outils exposent leur état, et la matrice est annoncée comme un tableau, avec le sens du tri.

### Fixes
- **Création et recâblage de liens annulables** — créer un lien par glisser puis faire Ctrl+Z ne produisait rien. Une action non gérée quittait la pile sans effet, si bien que le Ctrl+Z suivant annulait une action plus ancienne et sans rapport.
- **Fusion d'éléments annulable** — l'opération la plus destructrice du canvas était la seule sans retour arrière.
- Le repli de traduction passe du français à l'anglais : un utilisateur allemand voyait les libellés manquants en français.

### Retiré
- **Mode police manuscrite** — sans intérêt, et contraire aux règles de design du projet qui prescrivent la police système. Sa suppression retire aussi un appel réseau vers Google Fonts à chaque chargement.

### Interne
- Intégration continue : typecheck, tests et build en portes dures, avec un cliquet empêchant la dette de lint d'augmenter. Lockfile versionné.
- Couverture de tests portée de 226 à 335, dont les premiers tests sur les stores, les repositories et les migrations de schéma.
- Bancs d'essai reproductibles pour le calcul (`npm run bench`) et le rendu (`playwright test render-perf`).
- Documentation alignée sur le code : l'export PDF, le raccourci de mode focus et la conformité WCAG AA annoncés n'existaient pas.

## 2.49.1

### Fixes
- **Aperçu PDF vide** — l'aperçu d'un fichier PDF (panneau Fichiers et depuis le nœud sur le canvas) restait vide. Chrome refuse d'exécuter son lecteur PDF interne dans une iframe portant l'attribut `sandbox` (ajouté en v2.38.6 pour le durcissement sécurité), quels que soient les flags. L'aperçu passe désormais par `pdfjs-dist` (déjà utilisé pour l'extraction de texte), rendu sur un `<canvas>` avec pagination et zoom — plus robuste, cohérent entre navigateurs, et sans dépendre ni du lecteur PDF natif ni de l'attribut `sandbox`.

## 2.49.0

### Features
- **Ancrage d'un lien par extrémité** — le point d'attache d'un lien se déplace en glissant son extrémité sur le côté voulu de l'élément (haut, bas, gauche, droite). Le lien concerné passe alors en ancrage manuel et conserve le côté choisi, même si le dossier est en ancrage automatique : l'arbitrage ne se fait plus globalement, lien par lien. Rebrancher une extrémité vers un **autre** élément reste un recâblage et laisse le placement automatique reprendre la main. Le bouton **Ancrage → Automatique** du panneau Vues libère tous les liens épinglés. L'ancrage retenu est respecté à l'export SVG et synchronisé en collaboration.
- **Extrémités visibles à la sélection** — sélectionner un lien fait apparaître une pastille à chacune de ses extrémités, pour signaler qu'elles sont saisissables.

### Fixes
- **Déplacement de la queue d'un lien sans effet** — glisser l'extrémité de départ ne produisait rien, alors que l'extrémité d'arrivée fonctionnait. React Flow rapporte le type de l'extrémité **restée ancrée** (et non celle que l'on saisit) : l'interprétation inverse faisait converger départ et arrivée sur le même élément, et la mise à jour était abandonnée en silence. L'extrémité déplacée est désormais identifiée par élimination, sans jamais inverser le sens du lien.
- **Élément sans nom affiché comme supprimé** — dans le panneau de détail d'un lien, une extrémité dont le libellé était vide s'affichait « Élément supprimé ». Un élément existant mais sans nom affiche désormais « Sans nom » ; la mention « supprimé » est réservée aux éléments réellement absents. i18n 11 langues.

## 2.48.11

### Fixes
- **Sens des liens à la création** — tracer une relation d'un élément A vers un élément B créait le lien **B→A** (inversé) selon le point de départ du drag. En cause : chaque côté d'un élément expose des points de connexion source et cible superposés, et React Flow normalisait la connexion sans refléter l'origine réelle du glisser. Le sens est désormais capturé à l'origine du drag (`onConnectStart`) : A→B crée bien **A→B** (le sens reste modifiable ensuite via les directions).

### Features
- **Ouvrir/copier l'URL de la source** — le menu contextuel d'un élément propose désormais d'ouvrir ou copier l'URL présente dans le champ **Source** des métadonnées (en plus des propriétés), lorsque celle-ci est bien une URL. Complète l'ouverture d'URL introduite en v2.48.7.

## 2.48.10

### Features
- **Appliquer l'apparence d'un tag en multi-sélection** — en complément des propriétés suggérées (v2.48.9), le popup d'ajout de tag en multi-sélection propose une case **« Appliquer l'apparence du tag (forme, couleur, icône) »** (cochée par défaut). Cochée, l'apparence du TagSet (`defaultVisual`) est appliquée à tous les éléments sélectionnés — comble l'écart avec le mono-sélection où le premier tag applique déjà l'apparence. Le popup s'affiche désormais même pour un tag sans propriété suggérée mais avec une apparence. i18n 11 langues.

## 2.48.9

### Features
- **Propriétés suggérées d'un tag en multi-sélection** — appliquer un tag à plusieurs éléments/liens à la fois propose désormais, comme sur un élément seul, le popup des **propriétés suggérées** du TagSet (ex. le tag « Site web » suggère la propriété URL). Les propriétés choisies sont ajoutées à **tous** les objets sélectionnés (en sautant ceux qui ont déjà une propriété du même nom). Le popup indique **sur combien d'éléments** l'ajout va s'appliquer (compte, sans les nommer). i18n 11 langues.

## 2.48.8

### Fixes
- **Fond blanc impossible en thème sombre** — l'adaptation automatique des couleurs claires au thème sombre (qui assombrit les couleurs très claires pour qu'elles restent visibles) attrapait aussi le **blanc choisi explicitement**, empêchant de mettre un fond blanc sur un élément en thème sombre. Le blanc pur (`#ffffff`) est désormais respecté tel quel ; la couleur par défaut et les autres couleurs claires restent adaptées comme avant.

## 2.48.7

### Features
- **Ouvrir / copier une URL depuis le menu contextuel** — clic droit sur un élément portant une propriété URL (type `link` ou toute valeur ressemblant à une URL — `http(s)://`, `www.`) propose **Ouvrir l'URL** (nouvel onglet) et **Copier l'URL** (presse-papier). Pratique en enquête. Fonctionne même si la propriété est en type texte. Plusieurs liens → sous-menu **« Liens (N) »** au survol, chaque lien étiqueté par sa propriété, avec bascule à gauche près du bord de l'écran. i18n 11 langues.

## 2.48.6

### Fixes
- **Commentaires absents de l'export** — les commentaires (annotations sur éléments/liens) ne figuraient pas dans l'export par dossier. Ils sont désormais exportés (JSON, ZIP, ZIP chiffré) et **restaurés à l'import** avec remap de la cible (`targetId` élément/lien ; un commentaire dont la cible n'a pas survécu à l'import est ignoré). Techniquement : les commentaires étant stockés dans le Y.Doc, une table Dexie `comments` (chiffrée au repos) sert de staging à l'import, migrée vers le Y.Doc au premier chargement (comme les onglets). Corrige aussi un point pré-existant : les commentaires n'étaient pas lus dans l'état à l'ouverture d'un dossier (ils n'apparaissaient qu'après une interaction).

## 2.48.5

### Fixes
- **Requêtes ZNQuery absentes de l'export** — l'export d'un dossier (JSON, ZIP, ZIP chiffré) n'incluait pas les **requêtes sauvegardées** ni l'**historique récent** ZNQuery. Ajout des champs `queries` (requêtes sauvegardées) et `queryHistory` (5 dernières) à la structure d'export, et **restauration à l'import** : requêtes recréées en base (nouvel id, pas de remap d'éléments car basées sur champ/tag/valeur), historique fusionné dans la liste récente (dédupliqué, plafonné à 5). Import JSON et ZIP couverts, nouveau dossier uniquement.

## 2.48.4

### Fixes
- **Vues sauvegardées absentes de l'export** — l'export d'un dossier (JSON, ZIP, ZIP chiffré) n'incluait pas les **vues sauvegardées** (filtres, éléments masqués, disposition mémorisée) : le champ `views` manquait à la structure d'export. Elles sont désormais exportées et **restaurées à l'import** avec remap des identifiants d'éléments (`hiddenElementIds`, positions sauvegardées), viewport réinitialisé et `activeTabId` remis à zéro (les onglets étant ré-générés à l'import). Import JSON et ZIP couverts. Le backup complet (toutes enquêtes) gérait déjà les vues ; le trou concernait l'export par dossier.

## 2.48.3

### Fixes
- **Médias en collaboration — anciens assets illisibles** : les dossiers portant des médias au format antérieur à la v2.40 (binaire en base64 monolithique dans le Y.Doc, sans chunks) restaient bloqués en chargement infini côté pair, car le refactor de sync par chunks avait retiré ce chemin de lecture. La rétro-compatibilité est restaurée (décodage base64 → sauvegarde OPFS).
- **Fenêtre pré-observer à la sync** : les onglets et les assets qui arrivaient dans le Y.Doc entre la lecture initiale et l'attachement de l'observer (ou après un timeout de sync) n'étaient jamais appliqués — d'où onglets vides / médias bloqués jusqu'à un F5. Les re-syncs de sécurité forcent désormais la réconciliation des onglets et le retraitement des assets.
- **Avancement de chargement des médias** : les nœuds en cours de réception affichent le **pourcentage** reçu (et « Erreur » en cas d'échec) au lieu d'un spinner opaque.
- **Stockage local indisponible (navigation privée)** : détection de l'inscriptibilité de l'OPFS (probe d'écriture réel) et **toast d'avertissement** si un dossier contient des médias mais que le stockage est bloqué — au lieu d'images bloquées sans explication. i18n 11 langues.

### Internals
- Transfert des médias : chunks de 512 Ko (au lieu de 256) et throttle entre chunks, pour rester sous la limite de débit du relais (au-delà, le relais jette silencieusement les updates Y.js). Défaut `RATE_LIMIT` du relais relevé de 500 à 1500 (surchargeable par variable d'environnement).

## 2.48.2

### Fixes
- **Toasts enfin affichés** — `uiStore.showToast` écrivait dans un store que le `ToastContainer` rendu ne lisait pas (il lit `toastStore`), si bien que **tous** les toasts déclenchés via `showToast` étaient invisibles : notifications internes de l'app (dont l'avertissement d'expiration de rétention) **et** les toasts des plugins (`pluginAPI.toast.*`). `uiStore.showToast` / `dismissToast` / `clearToasts` délèguent désormais à `toastStore` (le store réellement rendu), en préservant le contrat `showToast → id → dismissToast(id)`. Les plugins récupèrent leurs toasts sans changement de code.

## 2.48.1 — Glow Edition

### Fixes
- **Glow étendu aux résultats de requête et de filtres** — la mise en évidence par halo (glow) ne se limite plus aux analyses Insights : les correspondances d'une **requête ZNQuery** et les éléments passant les **filtres** du panneau reçoivent désormais le même glow (nœuds et liens), en plus de l'atténuation des autres. Unifié via un ensemble « résultat » (éléments non atténués tant qu'un filtrage est actif) ; le mode focus seul reste sans glow (navigation). Rétro-compatible avec l'emphase Insights.

## 2.48.0

### Features
- **ZNQuery — opérateur `WITHIN n HOPS OF`** : nouveau prédicat de graphe qui sélectionne tous les éléments situés à **au plus n liens** d'un élément correspondant à une **sous-requête cible**. Exemple : `WITHIN 2 HOPS OF tag = "suspect"` → tout ce qui est à 2 sauts d'un suspect. La cible peut être composée (`WITHIN 1 HOPS OF (tag = "suspect" AND ville = "Paris")`), le parcours est non orienté (un lien est retenu si ses deux extrémités sont dans le rayon), `0 HOPS` = ensemble cible exact, et l'opérateur se combine avec AND/OR/NOT. Évalué via un pré-calcul BFS avant la boucle par-item (les autres prédicats restent par-item). Supporté en **mode texte** (parser, sérialiseur, autocomplétion) ; le builder visuel l'affiche en lecture seule. 21 tests (parser/évaluateur/sérialiseur), doc FR/EN, i18n 11 langues.

## 2.47.1

### Fixes
- **Mise en évidence des chemins et cycles plus lisible** — les éléments *et* les liens correspondant à une recherche de chemin/cycle (et plus largement à toute mise en évidence Insights : clusters, ponts…) reçoivent désormais un **glow** (halo accent), en plus de l'atténuation des autres éléments. Un lien est mis en avant quand ses deux extrémités le sont.
- **Recherche de chemins depuis le menu contextuel** — le clic droit sur deux éléments (« Chemins » / « Tous les chemins ») construit désormais le graphe d'analyse à la volée (il n'était bâti que si l'onglet Analyse avait été ouvert), **ouvre l'onglet Analyse** et y **affiche la liste des résultats**. Auparavant, hors de l'onglet Analyse, la recherche restait sans effet et les résultats n'apparaissaient pas dans le panneau.

## 2.47.0

### Features
- **Cycles orientés (circuits dirigés)** — la détection de cycles gagne une option **Respecter le sens des liens**. Décochée (défaut), comportement inchangé (boucles non orientées). Cochée, seuls les **circuits dirigés** sont retenus : chaque lien doit être franchi dans son sens (`forward` source→cible, `backward` cible→source), tandis que les liens sans direction ou bidirectionnels restent franchissables dans les deux sens (un lien neutre ne bloque pas un circuit). Mode pertinent pour les circuits financiers/flux. La direction des liens est désormais stockée sur le graphe d'analyse. Doc FR/EN + i18n 11 langues.

## 2.46.0

### Features
- **Détection de cycles** — nouvelle analyse dans le panneau Insights qui énumère les **cycles** (boucles fermées de relations, sans élément répété) du réseau, utile pour repérer des circuits (transactions circulaires, participations croisées). Recherche non orientée bornée par une **longueur maximale** réglable (3 à 10) et un plafond de résultats. Chaque cycle est dédupliqué (rotations et sens de parcours équivalents fusionnés) et listé du plus court au plus long ; l'union est surlignée sur le canvas, un clic sur un cycle met en évidence celui-ci seul. Doc FR/EN + i18n 11 langues.

## 2.45.0

### Features
- **Tous les chemins entre deux éléments (borné)** — en complément du plus-court-chemin, un mode **Tous les chemins** énumère toutes les routes simples (sans nœud répété) entre deux éléments, borné par une **profondeur maximale** réglable (1 à 8 liens) et un plafond de résultats pour éviter l'explosion combinatoire. Les chemins sont listés du plus court au plus long ; l'union est surlignée sur le canvas, un clic sur un chemin met en évidence celui-ci seul. Accessible depuis le panneau Insights (case « Tous les chemins » + profondeur) et via clic droit sur deux éléments → « Tous les chemins ». DFS borné sur le thread principal (graphe non orienté). i18n : 11 langues.

## 2.44.3

### Features
- **Export GEXF** (Gephi natif) — nouveau format d'export aux côtés de GraphML/GeoJSON. Génère du GEXF 1.3 avec le namespace `viz` : positions des nœuds (préservées, axe Y inversé pour un rendu à l'endroit dans Gephi), couleurs (converties en RGB), tailles, plus les notes/tags en attributs de nœud et la confiance en attribut d'arête. La direction des liens est mappée (`none`→undirected, `both`→mutual, `backward`→inversion source/cible). Symétrie avec l'import Gephi existant. i18n : 11 langues.

## 2.44.2

### Sécurité / Maintenance
- **Mises à jour de sécurité des dépendances** : correction de 14 vulnérabilités (6 hautes) — `dompurify` 3.4.11 (bypass XSS), `react-router-dom` 7.18.1 (RCE/CSRF/DoS), `ws` 8.21.0 (fuite mémoire/DoS), `vite` 7.3.6, `postcss` 8.5.16, et divers transitifs. `npm audit` : 0 vulnérabilité.
- **React Flow** (`@xyflow/react`) mis à jour en 12.11.2.

## 2.44.1

### Features
- **Export CSV — événements** : l'export CSV inclut désormais les **événements** attachés aux éléments (lignes `type=event`, parent via `de`, `date`/`date_fin`, description, géo, source, propriétés). L'aller-retour **export → import** reconstruit la chronologie à l'identique (symétrie avec l'import `type=event` de 2.44.0).

### Docs
- Précision : les coordonnées `latitude`/`longitude` en CSV s'appliquent aux **éléments et événements**, pas aux liens (les liens n'ont pas de géo).

## 2.44.0

### Features
- **Import CSV — événements (`type=event`)** : une ligne `type=event` attache un **événement daté** à un élément existant (référencé par la colonne `de`), visible dans son panneau détail, sur la **chronologie** et — s'il est géolocalisé — sur la **carte**. Réutilise les colonnes existantes (`date`, `date_fin`, `label`, `notes`, `latitude`/`longitude`, `source`, colonnes personnalisées → propriétés). Un même élément peut recevoir plusieurs événements.
- **Copier/coller inter-enquêtes** : les éléments (et les liens qui les relient) copiés dans un dossier peuvent être collés dans un **autre dossier**. Le presse-papiers est conservé en mémoire uniquement (rien sur disque, effacé au rechargement). Les pièces jointes ne sont pas recopiées lors d'un collage inter-enquêtes.
- **Masquer le média sur un élément** : dans le panneau **Fichiers**, une option par élément affiche le **label** à la place de l'image sur le canvas (le fichier reste attaché). Distinct du bouton global « flouter les médias ».

### Fixes
- **Copier/coller après sélection multiple** : le collage (Ctrl+V) ne fonctionnait plus après une sélection multiple, l'overlay de sélection de React Flow captant le focus et bloquant l'événement de collage natif. Corrigé via `disableKeyboardA11y` (les raccourcis clavier restent gérés par l'application).

## 2.43.1

### Fixes
- **Insights** — un clic sur le canvas vide réinitialise désormais la mise en évidence (ponts, clusters, centralité, isolés, chemins), en plus de la sélection. Corrige l'affichage figé après avoir sélectionné un pont.

## 2.43.0

### Features
- **Onboarding** pour les nouveaux utilisateurs, sans alourdir l'application :
  - **Bandeau de bienvenue** sur l'accueil (affiché une fois, masquable), avec lien vers la documentation.
  - **Enquête-exemple** en un clic : graphe réaliste (personnes, société, compte, lieux) qui peuple le canvas, la **carte** (Paris, Lyon, Marseille, Luxembourg, Genève), la **chronologie** (événements datés avec durées) et les **analyses**. Crée un dossier supprimable, jamais dupliqué (réouvre l'exemple existant).
  - **États vides explicites** : lien « Découvrir avec un exemple » sur la liste vide, et indice discret sur le canvas vide (double-clic, glisser pour lier, Ctrl+K, ?).
- **Cadrage automatique à l'ouverture** — un dossier ouvert pour la première fois (sans position mémorisée) est cadré sur son contenu au lieu de s'ouvrir sur l'origine ; les réouvertures restaurent la position sauvegardée.

## 2.42.6

### Features
- **Redimensionnement à proportions conservées** — maintenir **Alt (⌥)** pendant le glissement d'une poignée de redimensionnement d'un élément conserve son ratio largeur/hauteur. (Ctrl/⌘ et Maj sont réservés par le canvas à la multi-sélection.)

## 2.42.5

### Features
- **Import JSON par mapping — filtre multi-conditions** : le filtre d'import accepte désormais **plusieurs conditions** (champ *contient / égale / non vide*), combinées en **ET** ou **OU**, en plus du plafond.

## 2.42.4

### Features
- **Import JSON par mapping — nœuds pivots & filtre d'import** :
  - cible **Nœud pivot (valeur partagée)** : un champ devient un nœud unique par valeur distincte, relié à tous les enregistrements qui la portent (dédup au sein du lot) — un sélecteur partagé (email, téléphone…) devient un point de pivot révélant les connexions ;
  - **filtre d'import** (champ *contient / égale / non vide*) et **plafond** (défaut 2000) appliqués avant la construction, pour garder les très gros jeux exploitables sur le canvas.

## 2.42.3

### Features
- **Import JSON par mapping — améliorations** :
  - cible **Lien (URL)** (propriété de type lien) et **Point (lat, lng)** pour un champ unique contenant les deux coordonnées (détection automatique des deux) ;
  - cible **Média (pièce jointe)** : télécharge une URL de média et l'attache comme pièce jointe à l'élément (selon les autorisations CORS du serveur distant ; échecs rapportés) ;
  - case **tout activer / désactiver** pour les sous-éléments liés ;
  - **gestion des gros fichiers JSON** : contenu non rendu dans la zone de texte au-delà de ~1 Mo, détection sur un échantillon (2000 premiers enregistrements) avec import de la totalité, et layout automatique désactivé au-delà de 3000 éléments.

## 2.42.2

### Features
- **Partage des modèles de mapping JSON** — les modèles d'import JSON peuvent être **exportés** (un seul ou tous) et **importés** sous forme de fichier `.json`, depuis l'écran de gestion des modèles, afin de les partager entre postes ou utilisateurs.

## 2.42.1

### Features
- **Modèles de mapping JSON réutilisables** — un mapping configuré dans l'assistant d'import JSON peut être **enregistré** comme modèle nommé, réutilisable entre tous les dossiers. Rechargement depuis une liste, **suggestion automatique** quand la signature des champs d'un JSON collé correspond à un modèle enregistré (bannière Appliquer/Ignorer), et écran de **gestion** (renommer / supprimer).

## 2.42.0

### Features
- **Import JSON par mapping** — un assistant permet d'importer du JSON quelconque (export d'API, sortie d'un autre outil…) en reliant ses champs aux éléments ZeroNeurone. Accessible via l'import (*Mapper un JSON custom*) ou en **collant (Ctrl+V) du JSON brut sur le canvas** (un format reconnu — ZeroNeurone, GeoJSON, STIX 2.1, Excalidraw, OSINT Industries, Gephi, PredicaGraph — est importé directement ; un JSON générique ouvre le mapper).
  - **Détection automatique** : source d'enregistrements (tableau d'objets ou objet entier), modèle de libellé, champs date / pays / latitude-longitude (point géo) / identifiant.
  - **Liens par référence** : un champ contenant les id d'autres enregistrements crée les liens correspondants (orientés ; paires réciproques → bidirectionnel).
  - **Zones (polygones)** : un tableau de coordonnées devient une zone géo (ordre lat/lng deviné et ajustable).
  - **Sous-éléments liés** : un tableau d'objets imbriqués (contacts, adresses, observations…) devient des éléments enfants reliés au parent, avec leur propre tag, libellé et libellé de lien.
  - **Réglages** : activer/désactiver chaque champ (bruit décoché par défaut), tag global, ignorer les valeurs vides, et **disposition** du graphe importé (force, clusters, hiérarchie…) avant de cliquer pour le **positionner** sur le canvas. Import en un lot **annulable**.

## 2.41.11

### Features
- **Copier / coller des dates** — les champs date acceptent désormais le collage d'une date en texte (`18/04/2000`, `2000-04-18`, `18.04.2000`, avec heure optionnelle), avec désambiguïsation jour/mois et rejet des dates impossibles. Un bouton de copie placé à côté de chaque date renseignée copie la valeur au format `JJ/MM/AAAA` (ou `JJ/MM/AAAA HH:MM`), directement re-collable. Disponible sur les propriétés (date et datetime), les dates de début/fin d'événement et la date de référence de l'élément.

## 2.41.10

### Features
- **Copier / coller les coordonnées GPS** — un bouton de copie placé à côté de « Coordonnées GPS » (panneau Localisation et coordonnées de chaque événement) copie la position au format `latitude, longitude`, directement collable dans Google Maps. À l'inverse, coller une paire `latitude, longitude` dans l'un des deux champs remplit automatiquement les deux (séparateurs virgule/point-virgule/espace et points cardinaux reconnus).

### Fixes
- **Annulation des médias ajoutés à un élément** — coller (Ctrl+V), glisser-déposer ou ajouter un fichier à un élément existant n'était pas pris en compte par l'historique : un Ctrl+Z laissait l'image en place. L'ajout d'un média est désormais annulable (Ctrl+Z le retire, Ctrl+Y le rétablit), y compris lors d'un dépôt directement sur un élément du canvas. Le dépôt d'un fichier sur le canvas vide (qui crée un nouvel élément) est lui aussi annulable.

## 2.41.9

### Fixes
- **Carte : positionnement des marqueurs au zoom** — l'écartement des marqueurs superposés (spiderfy, typiquement des événements à la même position) était calculé en degrés à partir du zoom courant et n'était recalculé qu'au `zoomend` : pendant le zoom, les marqueurs co-localisés dérivaient de leur vraie position puis se recalaient brutalement (avec en prime une distorsion liée à la latitude et une corruption de la position sauvegardée en cas de drag). L'écartement est désormais un offset en **pixels** appliqué via l'option `offset` du marqueur MapLibre — constant à tous les niveaux de zoom, sans distorsion.
- **Carte : clustering des éléments positionnés sur un événement** — le clustering excluait tout marqueur dont la position venait d'un événement, ce qui empêchait quasiment tout regroupement (la position « dernier point connu » d'un élément daté étant elle-même un événement). Seuls les marqueurs **secondaires** (breadcrumbs de trace, événements co-temporels) sont désormais exclus ; le marqueur principal de chaque élément se regroupe normalement.
- **Carte : éclatement des clusters co-localisés** — un cluster de marqueurs à la même coordonnée ne pouvait jamais être séparé par le zoom (il fallait atteindre le zoom max pour les voir empilés). Le clic sur un cluster zoome désormais s'il est séparable, sinon il **étale les marqueurs sur place** (spiderfy) ; clic sur le fond ou zoom referme l'éclatement.

## 2.41.8

### Fixes
- **Lisibilité du nom sous les éléments avec média** — pour les formes cercle / hexagone / losange portant une vignette, le nom est affiché à l'extérieur du node (sous la forme). Lorsque des propriétés étaient également affichées, elles se positionnaient au même niveau et recouvraient le nom, le rendant illisible. Les propriétés réservent désormais la hauteur du label externe (avec prise en compte du débord de la pointe inférieure pour le losange) et s'empilent **sous** le nom.

## 2.41.7

### Fixes
- **Ré-arrangement : fin des chevauchements de formes** — les algorithmes de layout (force, clusters, hiérarchie, circulaire, grille, dispersion) prennent désormais en compte la **taille réelle** de chaque élément (forme, taille, dimensions personnalisées, vignette image) au lieu d'une estimation basée sur la longueur du label avec une hauteur fixe de 40px. Nouvelle source unique de vérité (`utils/elementDimensions.ts`) partagée entre le rendu (`ElementNode`) et le moteur de layout (`graphWorker` + `layoutService`), avec transmission des propriétés visuelles au worker. Les layouts circulaire, grille et dispersion gagnent un espacement / anti-collision basé sur la taille (ils n'en avaient aucun).

## 2.41.6

### Fixes
- **ZNQuery : désélection des résultats + effacer l'historique** — le bouton "Sélectionner tous les résultats" du panneau Query passe en mode additif (`addToSelection: true`), cohérent avec les filtres v2.41.5. Nouveau bouton "Désélectionner" (`SquareDashed`) à côté qui retire uniquement les éléments/liens résultats de la sélection courante. Bouton "Effacer l'historique" (`Trash2`) dans le header de la liste des requêtes récentes — l'historique reste in-session (max 5). i18n : 11 langues.

## 2.41.5

### Fixes
- **Sélectionner/désélectionner le résultat d'un filtre** — deux nouveaux boutons dans le header du panneau Filtres (à côté de "Tout effacer") permettent d'ajouter à la sélection courante tous les éléments correspondant aux filtres actifs, ou de les en retirer. Les boutons n'apparaissent que quand au moins un élément correspond. Mode additif (`addToSelection: true`) pour rester composable avec une sélection manuelle existante. i18n : 11 langues.

## 2.41.4

### Fixes
- **Backfill `dossier.origin = 'joined'` lors d'un re-join d'un dossier legacy** — un joiner qui avait rejoint un dossier avant v2.41.3 a `origin === undefined` ; sa description a été écrasée à la première sync, donc le fallback prefix dans `loadDossier` ne le détecte plus. Au re-clic du lien `/join/...`, [JoinPage](src/pages/JoinPage.tsx) backfille désormais `origin = 'joined'` sur le dossier existant (uniquement si `origin` est encore `undefined`, pour ne pas écraser un `'created'` légitime d'un originator cliquant son propre lien). Sans ce fix, l'auto-resume de v2.41.3 ramenait bien le joiner en shared mode, mais le check `isJoiner` retombait à `false` et autorisait une migration Dexie→Y.Doc en cas de timeout de sync — exactement le scénario que v2.41.2 cherchait à bloquer.

## 2.41.3

### Fixes
- **Régression collab v2.41.2 : peers distants voyaient un projet vide** — la garde anti-race était trop large : v2.41.2 bloquait la migration Dexie→Y.Doc pour **tout le monde** en mode shared, alors qu'il fallait seulement la bloquer pour les *joiners*. Un originator qui partage un dossier dont le Y.Doc local est vide (premier partage, nouveau device, IndexedDB nettoyée) ne pouvait plus pousser sa Dexie. Le contrôle d'identité « joiner » repose désormais sur un champ stable `dossier.origin: 'created' | 'joined'`, défini explicitement par `JoinPage` à la création du dossier local — i18n-proof et edit-proof (l'ancien check string-based via préfixe `Session partagée rejointe` est conservé en fallback uniquement pour les dossiers créés avant ce champ, et déclenche un backfill du flag persistant pour s'auto-réparer).
- **Ouvrir directement `/dossier/{uuid}` reprenait la session en mode local au lieu de rejoindre la collab partagée** — quand un dossier a déjà été partagé (originator) ou rejoint (joiner), la clé E2E et le flag async sont désormais persistés **localement** sur le dossier (Dexie, chiffré au repos via la DEK existante — **jamais** broadcastés dans le Y.Doc). À l'ouverture, `loadDossier` re-déclenche automatiquement `syncService.openShared()` avec ces credentials, déduisant le roomId via `deriveRoomId(dossierId, key)`. En cas d'échec d'auto-resume (clé tournée par l'originator, serveur indisponible…), fallback transparent en mode local avec un `console.warn`. Les credentials sont effacés à l'`unshare`.

## 2.41.2

### Fixes
- **TagSet `defaultVisual` désormais appliqué au premier tag** — quand un élément passe de "aucun tag" à "au moins un tag", il hérite désormais des `color` / `shape` / `icon` stockés dans le TagSet du **premier** tag ajouté. Les ajouts de tags suivants n'altèrent plus l'apparence (comportement demandé). Les fields visuels édités simultanément par l'utilisateur restent prioritaires sur l'héritage. Couvre les deux chemins de création : `updateElement` (ajout de tag via le panneau de détail) et `createElement` (élément créé directement avec des tags initiaux, ex: paste/import sémantique).
- **Race de synchro collaborative qui empilait les éléments à (0, 0)** — la migration Dexie→Y.Doc dans `loadDossier` n'est plus déclenchée en mode partagé (le Y.Doc est la source de vérité après `waitForSync`), et un flag `_dexieMigrated` dans `metaMap` empêche la migration de se rejouer même si la Dexie locale change après coup. `yMapToElement` lève désormais `MissingPositionError` au lieu de retomber silencieusement sur `{x:0, y:0}` quand `positionX/Y` sont absents — une fenêtre de sync partielle ne peut plus écraser une position correcte. `updateElementYMap` valide les coordonnées avant écriture (refus NaN/undefined). `_syncFromYDoc` conserve l'élément Zustand existant en cas d'échec de parse, plutôt que de le faire disparaître du canvas. Tests vitest sur `elementMapper` (round-trip, position manquante, partiel, fallback legacy, refus NaN).

## 2.41.1

### Fixes
- **Label illisible sur un losange avec image** — le corps du losange utilise `rotate-45`, donc sa pointe basse dépasse le bounding box du wrapper de `height × (√2-1)/2 ≈ 0.207 × height`. Le label externe était positionné à `top: 100% + 2px` du wrapper, donc il tombait pile sur la pointe inférieure du losange (texte par-dessus l'image). `ElementNode.tsx` décale désormais le label uniquement pour la forme `diamond` de cet overshoot calculé à partir de `height`, pour qu'il atterrisse sous la pointe réelle. Circle/hexagon inchangés.

## 2.41.0

### Features
- **Nouvel arrangement « Clusters (îlots) »** — disponible en tête du menu Layout. Approche compound : Louvain détecte les communautés, chaque cluster est layouté indépendamment avec ForceAtlas2 sur son sous-graphe induit (mode `strongGravityMode` + `adjustSizes: true` pour que la simulation tienne compte de la taille des nœuds), puis les disques englobants des clusters sont packés via une spirale d'Archimède avec marge proportionnelle. Garantit la séparation visuelle inter-cluster indépendamment de la convergence du solver. Les nœuds isolés (singletons) sont regroupés en grille latérale calibrée sur le label le plus large.
- **Anti-overlap renforcé pour le mode Clusters** — diamètre cible du sous-layout calculé sur l'aire totale des rectangles (`sqrt(totalArea/π) × 2 × 1.4`) au lieu du nombre de nœuds, anti-overlap intra-cluster sur 60 passes (avec jitter pour les nœuds parfaitement superposés), rayon de cluster calculé sur les coins des nœuds (et non leur centre).
- **Layout scopé à la sélection** — si ≥2 éléments sont sélectionnés au moment de l'application d'un arrangement, le layout n'opère que sur le sous-graphe induit (liens intra-sélection uniquement) et se recentre sur le centroïde de la sélection. Sinon, comportement inchangé : tout le dossier est réarrangé. Un indicateur visuel dans le dropdown rappelle la portée active. L'undo ne touche que les éléments réellement déplacés.

## 2.40.5

### Fixes
- **Import CSV robuste aux formats Excel** — `importFromCSV` / `importElementsFromCSV` / `importLinksFromCSV` détectent maintenant automatiquement le délimiteur (`,`, `;` ou tab) à partir de la première ligne hors guillemets, et normalisent le contenu en amont : BOM UTF-8 retiré et fins de ligne CRLF/CR converties en `\n` (sinon le `\r` traînant polluait silencieusement le dernier champ de chaque ligne sur les fichiers Windows). La gestion des champs entre `"..."` (avec `""` échappé) existait déjà dans `parseCSVLine` et fonctionne désormais avec n'importe quel délimiteur détecté.
- **Modèle CSV téléchargeable au format Excel-FR** — `generateCSVTemplate` (téléchargé depuis l'`ImportModal`) produit maintenant un CSV de style export Excel : délimiteur `;`, tous les champs entre `"..."`, fins de ligne CRLF. L'exemple inclut une note avec `;` et `"` internes pour exercer l'échappement.

## 2.40.4

### Fixes
- **Création d'une propriété `date/heure` (datetime) avec valeur vide** — deux bugs cumulés dans `PropertiesEditor.handleAddProperty` :
  1. **Absence de case `datetime`** : la valeur tombait dans le `else` final qui faisait `String(newValue)`. Un `Date` était converti en `"Fri May 22 2026 14:30:00 GMT+0200…"` (toString non-ISO), stocké comme string. Au re-render, `String(value).split('T')[0]` ne donnait pas un format exploitable par l'input → champ affiché vide.
  2. **Closure stale sur `newValue`** : même avec un `onChange` synchrone du champ datetime, React batche le `setNewValue` et le `click` sur « Ajouter » lisait l'ancienne closure (`newValue === ''`).
- Fix : `newValueRef` synchronisé dans le même tick que `setNewValue`, lu directement par `handleAddProperty` ; case unifié `'date' | 'datetime'` qui préserve l'objet `Date` (plus de round-trip via string).

## 2.40.3

### Fixes
- **Saisie d'une valeur date/heure perdue à la première utilisation** — dans `PropertiesEditor`, le champ `date` ne propageait la valeur au parent qu'au `onBlur`. Quand l'utilisateur cliquait sur « Ajouter » juste après avoir choisi une date, la séquence `mousedown → blur → click` exécutait `handleAddProperty` avec la closure stale (`newValue === ''`), et la propriété était créée avec `value: null`. Idem à l'édition d'une propriété date existante si le `blur` ne se déclenchait pas proprement. La propagation se fait maintenant directement dans `onChange`, comme le faisait déjà le champ `date` du type `datetime` et `ElementDetail.tsx`.

## 2.40.2

### Internals
- Suppression des `console.warn` bruyants ajoutés en v2.40 dans les chemins de synchronisation d'assets. Les erreurs restent reflétées via `syncStore.markMediaAssetFailed` (état dans le badge) et les toasts utilisateur ; la console reste propre en production.

## 2.40.1

### Fixes
- **Suppression en collab qui revient au refresh** — quand un client distant recevait une suppression d'élément/lien via Y.js, la mise à jour Dexie passait par `bulkUpsert(elements)` qui ne supprime rien : l'élément restait dans Dexie. Si l'utilisateur rafraîchissait, deux cas se présentaient : (a) Y.Doc.elementsMap se retrouvait vide (suppression du dernier élément), la migration Dexie → Y.Doc se déclenchait et ressuscitait toutes les suppressions reçues en collab ; (b) plus généralement, Dexie restait désynchronisée du Y.Doc, créant un risque de migration parasite ou de divergence ultérieure. `_syncFromYDoc` calcule maintenant les IDs disparus via `elIdsChanged \ newIds` et appelle `deleteMany` avant le `bulkUpsert`. Idem pour les liens.
- **Auto-clear du badge de synchro média qui efface des transferts en cours** — quand un asset se finalisait sur un client distant, un timer de 1,5 s effaçait `mediaAssets`. Si un autre asset arrivait dans cet intervalle (rare mais possible avec des uploads en rafale), il était wipé. Le timer est maintenant annulé à chaque `registerMediaAsset` et revérifie l'état avant d'effacer.

## 2.40.0

### Features
- **Synchronisation des médias par chunks (256 Ko)** — les assets transitent désormais en binaire natif (`Uint8Array`) découpés en chunks via `Y.Array`, au lieu d'un base64 monolithique dans un champ unique. Sur lien bas débit, un fichier de 10 Mo ne bloque plus le pair pendant 100 s d'un seul tenant : les chunks arrivent un par un (un message WebSocket par chunk), le pair les assemble à la volée, et une microcoupure ne reprovoque plus la retransmission complète. Gain ~33 % de payload (plus d'encodage base64), conversion `btoa/atob` éliminée des hot paths.
- **Suivi d'avancement des synchros média cohérent** — la progression est maintenant pilotée au niveau byte (`receivedSize / totalSize`) au lieu du compte d'assets, et chaque asset a son propre état (`pending | transferring | done | failed`) dans le `syncStore`. Le badge affiche un pourcentage qui progresse en continu pendant le transfert d'un gros fichier, plus le saut 0 → 100 % à la complétion. Le badge reste visible tant que des chunks arrivent — le statut "synchronisé" de la connexion ne ment plus quand les médias ne sont pas encore tous reçus.
- **Cap dur de 50 Mo en mode partagé** — au-delà, le fichier est conservé localement mais n'est pas broadcasté aux pairs (warning utilisateur). Évite de saturer une connexion lente pendant 20 minutes avec un asset unique. Warning conservé à partir de 10 Mo (synchro lente mais possible).

### Fixes
- **Miniatures qui n'apparaissaient pas après synchro média** — le cache `nodeStructureCacheRef` de `Canvas.tsx` ne se réactualisait que sur changement de référence d'élément ou de compte de commentaires. Quand un asset arrivait après le rendu initial (via chunks tardifs), l'élément qui le référençait gardait sa miniature "loading" tant qu'on ne le touchait pas. La comparaison de cache inclut maintenant `thumbnail` et `isLoadingAsset`, donc le re-render se déclenche dès que `onLateSave` pousse l'asset dans `state.assets`.

### Internals
- Nouveau module `src/services/assetSync.ts` : centralise la logique de chunked transfer (taille de chunk, helpers `pushAssetChunked` / `readAssetMeta` / `assembleChunks` / `getReceivedBytes` / `isAssetComplete`).
- `fileService.saveAssetFromBase64` → `saveAssetFromBinary` (prend une `Uint8Array`, vérifie le hash SHA-256, écrit en OPFS).
- `syncStore.mediaAssets: Record<id, MediaAssetState>` comme source de vérité par asset ; `mediaSyncProgress` est désormais un agrégat dérivé (incluant `receivedSize` et `inFlight`).
- Registry `assetChunkObservers` au niveau module dans `dossierStore` : pour chaque asset en cours, un observateur `Y.Array.observe` met à jour le progress et déclenche la sauvegarde OPFS dès que toutes les chunks sont là. Cleanup au `unloadDossier` et au début de chaque `loadDossier`.

## 2.39.13

### Fixes
- **nginx — fix `.mjs` MIME without breaking everything else** — v2.39.12 used a `types {}` block at server scope, which (contrary to expectation) **replaces** the inherited mapping instead of merging it; every non-`.mjs` asset was served as `application/octet-stream` and downloaded instead of rendered. Reverted, and instead patch `/etc/nginx/mime.types` directly in the Dockerfile to add `mjs` to the existing `application/javascript` mapping.

## 2.39.12

### Fixes
- **nginx — `.mjs` MIME type** — nginx's default mime.types doesn't map `.mjs`, so the new unhashed `/pdf.worker.min.mjs` was served as `application/octet-stream` and blocked by the browser (CSP `nosniff`). Added `application/javascript mjs;` to the server's `types` block.

## 2.39.11

### Fixes
- **PDF worker — stable URL across deploys** — `pdf.worker.min.mjs` is now served from `/pdf.worker.min.mjs` (stable, unhashed) instead of `/assets/pdf.worker.min-<hash>.mjs`. Stale service workers from a previous deploy were intercepting requests for the new hashed file, failing, and forcing pdf.js to fall back to its inline (slower) fake worker. The unhashed URL survives SW cache mismatches across deploys. New `prebuild`/`predev` hook (`sync:pdf-worker`) keeps the file in sync with `pdfjs-dist` automatically.

## 2.39.10

### Fixes
- **Query tab icon** — the Query side panel tab now uses the `Code2` icon (`</>`) instead of the magnifying glass, making it visually distinct from the global search (Ctrl+K) and the adjacent Filters tab.

## 2.39.9

### Fixes
- **Timeline — theme-aware event borders** — events in light mode now render with a darkened border (`color-mix` with black) instead of the raw element color. Dense lanes with pastel-colored elements (e.g. 5k GPS events on a white background) used to blend into near-invisibility unless the owning element was selected; they're now visible at rest. Dark mode is untouched.

## 2.39.8

### Features
- **Timeline — focus event on click** — clicking an event item in the timeline (scatter or swimlane mode) now selects the parent element and auto-expands + scrolls to the exact underlying event in the side panel, mirroring the map marker behaviour. `TimelineItem` now carries `eventId` for event-type items

### Fixes
- **Map marker thumbnail** — card markers now render their image thumbnail as a 48×48 square (was 48×36), reducing the aggressive top/bottom crop on square and portrait-oriented medias

## 2.39.7

### Features
- **Map — focus event on marker click** — clicking a marker on the map now selects the parent element and auto-expands + scrolls to the exact underlying event in the side panel. Works across static and temporal mode (new `focusedEventId` on the selection store)
- **Map — co-temporal event markers** — when multiple events share the same minute but carry different coordinates (e.g. GSM multi-cell pings at the same second), each becomes its own marker instead of collapsing into the "active" one. Event markers use a composite `elementId::eventId` key internally and are never clustered, so a vehicle's trajectory no longer disappears into a single cluster
- **Map — temporal trace toggle** — new `Route` button next to follow-camera: when enabled, every past event with geo stays visible as a lightweight breadcrumb, drawing the movement path up to the slider's current time. Off by default (snapshot mode)

### Fixes
- **Static map — latest point event wins** — when an element has both a base geo and more recent point events, the marker now sits on the latest event (movement-tracking semantics) instead of being stuck on an outdated base position. Polygon event overrides for zones are preserved (marker on base, shape from the latest polygon event)

## 2.39.6

### Fixes
- **Side panel perf — thousands of events/properties** — `EventsEditor` and `PropertiesEditor` now virtualize their rows via `@tanstack/react-virtual`. Only visible rows are mounted, so opening the detail panel of an element carrying 6k+ events/properties is now instant instead of freezing for several seconds. Dynamic row measurement preserves the expand/collapse UX for events. Sort is memoized; suggestion lookup in `PropertiesEditor` switched from O(n²) `find` to a `Map`.

## 2.39.5

### Fixes
- **Map temporal — last known position** — elements with events now stay visible at their last known position once their first event is reached, instead of disappearing after their own last event. This matches GPS-breadcrumb semantics for movement tracking when several elements have different event end dates on the same timeline
- **Minute-precision comparisons** — all visibility comparisons (element position, link activity, link-pulled visibility) now round to the minute, so the slider reliably reaches every event even when original dates include seconds or milliseconds

## 2.39.4

### Fixes
- **Map temporal precision** — the temporal slider and position filters now work at minute precision instead of snapping to the day. Events with time-of-day (e.g. 14:30 vs 14:45) are correctly distinguished, enabling minute-by-minute movement tracking from geolocated events. Dates saved without a time still represent a full day for backward compatibility. The manual date input in the temporal slider is now `datetime-local`.

## 2.39.3

### Fixes
- **Timeline "Added" mode** — new toggle in timeline toolbar to display elements and links by their creation date (createdAt) instead of investigation dates, showing how the inquiry was built over time; causality controls are hidden in this mode since they don't apply to system timestamps
- **Tab ghost visual stuck** — switching back to "Tous" tab no longer leaves elements with ghost appearance (dashed border, hatch overlay); the incremental node cache now detects activeTabId changes and forces a full rebuild

## 2.39.2

### Fixes
- **Import/Export icons** — swapped `Upload` / `Download` icons so Import uses the downward arrow (incoming data) and Export uses the upward arrow (outgoing data); applied across DossierPage header, HomePage, LandingSection, DossierCard, TagSetManagerModal, StorageModal backup tab, Import/Export modals, AssetsPanel dropzone, MapView/TimelineView/MatrixView CSV export, ReportPanel, QueryResultsTable
- **ViewToolbar wrapping** — toolbar buttons now wrap cleanly onto multiple lines when the view is resized narrow (via side panel), instead of overflowing horizontally; applies to Canvas, Map, Matrix and Timeline views

## 2.39.1

### Fixes
- **Trusted badge** — verified shield icon on trusted plugin cards (home:card), injected by the loader after plugin registration
- **Manifest plugin IDs** — aligned `oneneurone` / `vaultneurone` IDs with actual plugin card IDs (was `one-neurone` / `vault-neurone`)

## 2.39.0

### Features
- **Plugin security** — integrity verification (SHA-256) and permission sandbox for external plugins
  - **Manifest v2** — new format with `trust` levels (`trusted` / `community`) and `permissions` declaration
  - **Integrity check** — SHA-256 hash verification of plugin files before loading (extracted from inline to `pluginIntegrity.ts`)
  - **Permission sandbox** — community plugins receive a filtered API based on declared permissions; undeclared API members are absent
  - **Read-only store proxy** — Zustand stores exposed in read-only mode preserve selector optimization and referential stability
  - **Slot filtering** — community plugins can only register into slots their permissions allow
  - **Legacy aliases** — `useInvestigationStore` and `investigationRepository` propagated through the sandbox
  - **Default permissions** — community plugins without declared permissions get a safe minimal set (read graph, UI slots, plugin data, events, toast)
  - **Backward compatible** — manifest v1 (no `manifestVersion` field) works as before with full permissions granted
- **Plugin build tooling** — `npm run dev:plugins` / `build:plugins` / `rehash:plugins` to build YPSI plugins, copy to `public/plugins/`, and generate manifest v2 with integrity hashes
- **CLI hash tool** — `scripts/plugin-hash.mjs` for standalone hash generation

## 2.38.13

### Fixes
- **Side panel tabs** — icon-only for inactive tabs (label shown only on active tab) to prevent hidden horizontal scroll with many plugins
- **Plugin docs** — updated FR + EN: async `action`/`visible`, `ContextMenuChild` interface, `children()` submenu, all 3 context menu slots documented

## 2.38.12

### Fixes
- **Element context menu** — `contextMenu:element` plugin extensions now rendered in element right-click menu (same pattern as CanvasContextMenu), with dynamic icon resolution and visibility filtering

## 2.38.11

### Fixes
- **Link direction bug** — fix inverted fromId/toId when dragging from a target-type handle in ConnectionMode.Loose (React Flow normalizes source/target by handle type, not drag origin); also fixes reconnect

## 2.38.10

### Fixes
- **Landing footer** — icon-only for secondary items (theme toggle, about, documentation, GitHub, Ko-fi, language) to reduce clutter; functional items (encryption, storage) keep labels

## 2.38.9

### Fixes
- **Link context menu** — right-click on links: edit label, delete with undo/redo, plugin extensions support (`contextMenu:link` slot)
- **Undo/redo link deletion** — `delete-link` action with full restore on undo (Canvas + historyStore)
- **Undo/redo link label edit** — label changes are now recorded in the history stack
- **Y.js compaction fix** — open dossiers compact via active provider to avoid IndexedDB lock conflicts (no more `deleteDatabase blocked` warnings)
- **encryptedIndexeddbPersistence** — fix missing `return` in compact promise chain
- **Plugin API** — `ContextMenuChild` interface, async `visible()` and `children()` on `ContextMenuExtension` for dynamic submenus
- **GoNeurone** added to plugins manifest
- **i18n** — link context menu translations (11 languages)

## 2.38.8

### Fixes
- **Plugin API**: `api.services.importJSON(jsonString, dossierId)` — direct JSON import for plugins (auto-detects ZN native, OSINT Industries, PredicaGraph, Excalidraw, STIX2, Gephi Lite formats)
- **Plugin API**: `element:tagAdded` / `element:tagRemoved` events on `api.events.on()` — granular tag change notifications with `meta.tagName` payload

## 2.38.7

### Fixes
- **Plugin API**: `api.encryption.getRecoveryMeta()` — exposes encryption metadata (salt, encryptedDEK, dekIV, version) as base64 strings for offline backup recovery tools (read-only, no security reduction)

## 2.38.6

### Fixes
- **Security: XSS interactive report** — sanitiseHtml() whitelist strips unauthorized HTML tags after markdown conversion, protocol validation on links (https/mailto/# only), meta CSP in exported HTML
- **Security: CSP nginx** — Content-Security-Policy header added to nginx.conf (script-src, img-src, connect-src, worker-src, frame-ancestors, base-uri)
- **Security: PDF iframe sandbox** — `sandbox="allow-same-origin"` on PDF preview iframes (Canvas, AssetsPanel)
- **Security: WebAuthn logs** — removed debug console.log/debug from webauthnService (PRF material no longer exposed)
- **Security: sync asset hash** — SHA-256 re-verification on assets received via sync
- **Security: URL validation** — toUrl() / isUrl() guard against dangerous protocols (ElementDetail, LinkDetail)
- **Security: element references** — quote/angle bracket escaping in parseElementReferences (interactive report)
- **Security: Vite config** — removed allowedHosts tunnel domain
- **Plugin API**: scoped pluginData methods (getForDossier/setForDossier/removeForDossier), plugin manifest integrity field, updated plugin-api.d.ts typings
- **Plugin docs**: updated FR + EN guides with scoped pluginData and integrity verification

## 2.38.5

### Fixes
- **Plugin API evolutions**: event bus (`api.events.on()`), services (`exportDossier`, `importDossier`, `navigateTo`), toast notifications (`api.toast.*`), global pluginData (`getGlobal`/`setGlobal`/`removeGlobal`), encryption utilities (`encrypt`/`decrypt`/`isUnlocked`), 3 new stores (`useTagSetStore`, `useTabStore`, `useUIStore`)
- **pluginData cleanup**: automatic cleanup of `pluginData` and `canvasTabs` when a dossier is deleted
- **Plugin docs**: updated FR + EN plugin development guides with all new APIs

## 2.38.4

### Fixes
- **NEAR map picker**: interactive map modal for the NEAR operator — click to place center, live circle preview with adjustable radius, Nominatim geocoding search, pre-populated from existing values
- **i18n**: 4 new keys for the map picker across 11 languages

## 2.38.3

### Fixes
- **Visual builder NOT support**: NOT toggle per condition/group with border-left indicator, no layout overflow
- **Visual builder nested groups**: recursive AND/OR sub-groups (max depth 2), combinator toggle
- **Visual builder NEAR layout**: NEAR inputs (lat, lng, radius, unit) on dedicated row to prevent overflow
- **IN operator**: parser, serializer, evaluator support for `field IN ("a", "b", "c")`
- **Query history**: last 5 queries tracked in-session, reapply from history section
- **Select all results**: button to select all matching elements/links on canvas
- **Save as View**: create a saved view from current query results
- **Zero results feedback**: visual indicator when query matches nothing
- **Auto re-execute**: query re-runs automatically when dossier data changes
- **Viewport navigation**: click table row to navigate canvas to element position
- **Find Similar feedback**: toast warning when element has no tags
- **i18n syntax examples**: hardcoded French examples replaced with i18n keys (11 languages)
- **Search modal query hint**: `?` prefix hint in Ctrl+K footer

## 2.38.2

### Fixes
- **Docker build speed**: add BuildKit cache mount for `npm ci` — reuses npm download cache across builds even when package.json changes
- **Query auto-execution**: remove redundant Execute button in text mode (queries auto-execute on valid parse); fix regression where removing the button broke canvas filter activation
- **Autocomplete operator preservation**: fix token walk-back regex so applying a tag/value suggestion no longer eats the preceding operator (`=`, `>`, etc.)

## 2.38.1

### Fixes
- **Query context menu**: "Find similar" and "Query from selection" actions now appear in the element context menu (right-click on a node), not only in the canvas-level context menu

## 2.38.0

### Features
- **ZNQuery structured query system**: mini-language textuel + builder visuel with shared AST, autocompletion, saved queries, and two result modes (canvas filter + table)
- **Query text mode**: recursive descent parser supporting AND/OR/NOT/parentheses, all operators (=, !=, >, <, >=, <=, CONTAINS, STARTS_WITH, ENDS_WITH, MATCHES, EXISTS, NOT EXISTS, IN, NEAR), reserved fields (label, notes, tag, confidence, source, date, type, group, country, has_geo, geo.lat, geo.lng, from.*, to.*, event.*, directed), free-form properties, date literals, regex literals
- **Query visual mode**: chainable condition rows with typed inputs (date picker, boolean select, number input, tag dropdown, NEAR lat/lng/radius/unit), AND/OR combinator, auto-execution on change
- **Query results**: canvas filter mode (dim non-matching elements), table mode with dynamic columns, sorting, CSV export, click-to-select
- **Saved queries**: persist, load, rename, delete queries per dossier (IndexedDB v11)
- **Query filtering across all views**: Canvas, Map (with cluster dimming and active count), Timeline, and Matrix views all support query-based dimming
- **Link dimming exception**: links matching the query stay visible even when their endpoints are dimmed
- **Context menu integration**: "Find similar" (single selection) and "Query from selection" (multi) in canvas right-click menu
- **Search integration**: `?` prefix in Ctrl+K search opens the query panel with pre-filled text
- **Autocompletion**: context-aware suggestions for fields, operators, values, and keywords at cursor position
- **User documentation**: complete query system documentation (FR + EN)

## 2.37.2

### Fixes
- **Swimlane link display**: zoom-based adaptive height (detailed above 0.5 px/day, compact below); label stays visible when item starts off-screen left; deduplicate links in lanes when both parent elements share the same grouping key

## 2.37.1

### Fixes
- **Swimlane link rendering**: links toggle (off by default) in toolbar; adaptive display — thin 8px bars when zoomed in, full-height chips with label when wide enough (>150px visible); viewport-clipped collision stacking prevents massive lane heights at high zoom; visual distinction (dashed border, lighter background) from element items

## 2.37.0

### Features
- **Timeline swimlane mode**: new display mode grouping elements into horizontal lanes by criterion (tag, source, property); multi-tag grouping (elements appear in all matching lanes); tag filter dropdown with select/deselect all; drag & drop lane reordering with persistent custom order; collapsible lanes with item count; dated links appear in parent element lanes; state persisted across view switches (canvas/map/timeline)
- **Timeline fit-all on first load**: timeline auto-fits all items on first visit in both scatter and swimlane modes
- **User documentation**: timeline page rewritten with swimlane mode documentation (FR + EN)

## 2.36.2

### Fixes
- **Import modal (ImportExportModal)**: add missing .anb file type to accept filter and processing branch

## 2.36.1

### Fixes
- **ANB import**: fix relational link type name extraction — scan before SIG pattern (offsets +192–224) instead of after (was picking up description text, causing misattributed link labels)

## 2.36.0

### Features
- **i2 Analyst's Notebook binary import** (.anb): reverse-engineered OLE2/CFB binary format; entities with labels, positions (from binary coordinates), typed properties (DatabaseProperty, Attribute), COLORREF colors, icon mapping, confidence grades (1-5 → 20-100), intelligence cards (0x818D records) imported as linked events; links with direction, thickness, style (solid/dashed/dotted); real i2 spatial coordinates preserved via unified coordinate normalization across all record types
- **User documentation**: ANB binary import section added (FR + EN) with limitations and reverse-engineering caveats

## 2.35.0

### Features
- **i2 Analyst's Notebook import** (.anx): entities with labels, positions, typed properties (DatabaseProperty, Attribute), type hierarchy tags, COLORREF colors, icon mapping, confidence grades (1-5 → 20-100), intelligence cards as events, source attribution; links with direction, thickness, style (solid/dashed/dotted via Strength), colors; auto-detection of ANX content in .xml files; XML sanitization for malformed i2 exports
- **User documentation**: GEXF, Gephi Lite JSON and ANX import sections added (FR + EN)

## 2.34.0

### Features
- **Native Gephi import** (GEXF + Gephi Lite JSON): nodes with positions, colors, sizes (proportional scaling), shapes; edges with colors, thickness (ranking), direction; node/edge properties with auto type inference; appearance palettes (partition/fixed); metadata into dossier description
- **STIX 2.1 import expanded**: full SCO support (IPv4/IPv6, domain, URL, email, file, network-traffic, MAC, user-account, process, software, directory, registry key, autonomous-system, x509-certificate, artifact), additional SDO fields (observed-data, opinion, first/last observed), object marking refs
- **i18n `importData` namespace** (11 languages): all import services (STIX2, Gephi, GEDCOM) now use localized strings for labels, errors, and property names

## 2.33.4

### Fixes
- Timeline: century and decade zoom levels (presets "Siècle" / "10 ans", axis labels every 100/10 years)
- Timeline: negative years (BC) displayed correctly on year/decade/century scales
- Timeline: tooltip close button no longer hidden behind title text
- Map: disable world wrapping in 2D mode (`renderWorldCopies: false`)

## 2.33.3

### Fixes
- Production relay (Docker): port all v3 improvements — token hashing, TRUST_PROXY, backpressure, native Redis Buffer, partial buffer flush, JSON metrics health endpoint, orphaned room cleanup, improved graceful shutdown

## 2.33.2

### Fixes
- Dev relay server v3: graceful shutdown (SIGTERM/SIGINT) for clean Docker restarts
- Dev relay server: orphaned room cleanup after 24h inactivity (fixes memory leak on tokens/asyncRooms)
- Dev relay server: health endpoint returns JSON metrics (rooms, clients, uptime, buffer stats)
- Dev relay server: backpressure on relay — skip clients with >4MB send buffer
- Dev relay server: X-Forwarded-For only trusted with `TRUST_PROXY=1` env var
- Dev relay server: room tokens stored as SHA-256 hashes instead of plain text
- Dev relay server: Redis buffer uses native Buffer instead of base64 (+33% overhead removed)
- Dev relay server: partial buffer flush preserves unsent messages on client disconnect

## 2.33.1

### Fixes
- WebSocket: graceful disconnect on page unload (prevents "connection interrupted" browser errors)
- WebSocket: proactive reconnection on tab visibility change instead of waiting for backoff timer
- WebSocket: 5-second grace period on initial connection suppresses transient error flashes
- WebSocket: `isClosing` guard prevents event handlers from firing during teardown

## 2.33.0

### Features
- Map temporal follow camera: Crosshair toggle button during temporal playback that follows events with cinematic flyTo animations (adaptive speed, dezoom arc, moveend-chained advancement)
- Hierarchy layout powered by dagre (Sugiyama algorithm): minimized edge crossings, greedy cycle breaking, adaptive node/rank spacing

### Fixes
- Hierarchy/force layout: `estimateNodeWidth` now matches ElementNode rendering dimensions, improved AABB overlap removal (15 passes, early exit, gap=24)
- Map clustering: clusters properly break at high zoom (Supercluster maxZoom 20, follow camera zooms to 22 for co-located elements)
- Map temporal follow camera: moveend-based chaining prevents animation interruption, timestamp guard ignores spurious moveend from interrupted previous flyTo

## 2.32.1

### Fixes
- Matrix: right-click context menu with copy cell, copy row, copy selection
- Matrix: pin/unpin toggle to freeze/unfreeze first column
- Matrix: columns dropdown no longer clipped by toolbar overflow (fixed positioning)
- Map: 3D buildings toggle always visible, buildings preserved when disabling 3D terrain
- Collaboration info (avatars, sync, share) moved from view toolbars to main header bar
- Archive toggle no longer changes dossier modification date

## 2.32.0

### Features
- Dossier archiving: archive/unarchive dossiers from the card dropdown menu, archived dossiers hidden by default with toggle button to show them
- Collaboration info (sync status, presence avatars, share button) now visible on all views (canvas, map, timeline, matrix), not just canvas
- Tab delete confirmation: modal confirmation before deleting a tab, tooltip on long tab names
- Compact header: DossierPage header reduced to h-10, view switcher shows text+icon labels, overflow menu on small screens
- HomePage header restructured: New Dossier + Import centered, utilities on right

### Fixes
- Dropdown menus on dossier cards no longer hidden behind cards below (z-index via CSS `:has()`)
- Archived dossier card opacity no longer affects dropdown menu
- Detached panel: fix React scheduler conflict ("Should not already be working") by deferring `window.open()` to next tick
- ImportModal: fix scoping error for `dossierId`/`createdNewDossier` in catch block
- ViewToolbar: fix left content overflow on narrow screens

## 2.31.7

### Fixes
- Canvas: diamond shapes with media — label no longer clipped, displayed below the shape (same fix as circle/hexagon)
- Map: auto-zoom to selected element when switching from canvas to map view
- Map: search (Ctrl+K) now zooms to element on map
- Map: "View on map" button added to element location panel (next to "Pick on map")
- Map: polygon "View on map" button now works when switching from canvas (delayed event dispatch)
- Map: default base layer changed to OSM (standard), OSM FR/DE available as option
- Timeline: search (Ctrl+K) now scrolls to element on timeline

## 2.31.6

### Fixes
- Canvas: circle/hexagon shapes with media — label no longer clipped, displayed below the shape
- Map: localized tiles adapt to app language (FR → OSM France, DE → OSM Deutschland, other → default OSM)
- Map: "OSM Latin" renamed to "OSM Localized" with automatic language-based tile resolution

## 2.31.5

### Fixes
- Canvas: context menu i18n — all labels were hardcoded in French, now use existing translation keys

## 2.31.4

### Fixes
- Synthesis: i18n for interactive HTML report (11 languages) — all UI strings were hardcoded in French
- Synthesis: fix report content translations not resolving (wrong i18n namespace `report.content` → `synthesis.content`)
- Synthesis: "Synthèse générée le..." instead of "Rapport généré le..." in all languages

## 2.31.3

### Fixes
- Canvas: alignment now works for elements inside groups (absolute/relative position conversion)
- Canvas: distribute uses measured node dimensions for proper spacing
- Canvas: align dropdown closes reliably (capture phase + selection change listener)
- Canvas: toolbar dropdown menus no longer clipped by overflow

## 2.31.2

### Fixes
- Map: fix "Rendered more hooks" error (useEffect after early return)
- Map: fix blank map when switching tabs (early return removed map container from DOM)
- Map toolbar: fix controls wrapping to second line (overflow-x-auto instead of flex-wrap)

## 2.31.1

### Fixes
- Canvas: hexagon shape no longer reverts to square on selection (removed erroneous Yjs migration)
- Canvas: diamond shape connection handles now accessible (z-index fix)
- Canvas: hexagon shape sizing in getDefaultDimensions

### Documentation
- Import JSON format: updated GeoData type documentation (FR + EN)

## 2.31.0

### Features
- Map: geographic zones with three shapes (polygon, circle, square)
- Map: zone editing (vertex drag for polygons, radius resize for circles)
- Map: zone movement by dragging the central marker
- Map: GeoJSON text editor for events (copy/paste from QGIS, geojson.io)
- Map: real-time preview during zone drawing (area, radius display)
- Map: zone shape selector dropdown on the Zone toolbar button
- Export: GeoJSON export includes zones as Polygon features

### Improvements
- Map: full element name displayed when selected (no truncation)
- Map: "Fit" button uses icon instead of text label
- Map: zone properties (area, radius) stored on elements
- Types: GeoPolygon supports shapeOrigin, radius, altitude, extrude fields
- Yjs: sync preserves all GeoPolygon fields across collaboration

### Documentation
- Map view: added Geographic Zones section (FR + EN)
- Tags & properties: added Tag Sets Manager section and 5 missing property types (FR + EN)
- Attachments: added DOCX/ODT text extraction support (FR + EN)
- Search: updated indexed content to include DOCX/ODT (FR + EN)
- Elements & links: clarified event geolocation supports zones (FR + EN)

## 2.30.1

### Fixes
- Map: persist base layer, 3D and buildings preferences across views
- Map: 3D mode disabled by default
- Map: disabling 3D now also hides buildings
- Map: buildings opacity increased (0.7 → 0.85)
- Map: links no longer hidden behind buildings on base layer switch
- Map: fix "Style is not done loading" error on init
- Docker: sync package-lock.json with new dependencies

## 2.30.0

### Features
- Map: migrate from Leaflet to MapLibre GL JS (WebGL rendering)
- Map: globe projection with automatic mercator transition on zoom
- Map: 3D terrain with real elevation data (Terrarium tiles)
- Map: 3D buildings extrusion from OpenFreeMap vector tiles (zoom 14+)
- Map: Nominatim place search with temporary marker and flyTo
- Map: CartoDB tiles auto-switch between light/dark based on app theme
- Map: toggle 3D mode on/off (globe + pitch + terrain)
- Map: toggle 3D buildings on/off
- Map: pitch control via right-click drag, compass visualization
- Map: client-side clustering via Supercluster (replaces leaflet.markercluster)
- Timeline: CSV export
- Map: CSV export

### Improvements
- Map: OSM Latin as default base layer
- Map: 4 base layers (OSM, OSM Latin, CartoDB, Satellite)
- Canvas: ViewToolbar responsive flex-wrap
- Canvas: annotation resize handle sizing
- Canvas: AlignDropdown scrollable for >5 elements

## 2.23.0

### Features
- Search: extracted text snippets shown in results with highlighted match and centered window
- Search: notes highlight with centered window on long text
- Assets: text file preview (txt, md, json, xml, csv, yaml, log, etc.)
- Assets: DOCX and ODT text extraction via JSZip XML parsing
- Assets: DOCX and ODT preview (extracted text view)

### Fixes
- Import: support OSINTracker v2 format (investigation table + investigationId)

## 2.22.2

### Fixes
- Import: support OSINTracker v2 format (investigation table + investigationId)

## 2.22.1

### Fixes
- Timeline: restore vertical scroll (missing min-h-0 on flex container)

## 2.22.0

### Features
- Canvas: alignment tools (left, center, right, top, middle, bottom) with key object reference picker
- Canvas: distribute horizontally/vertically for 3+ selected elements
- Multi-selection: bulk property editing with full PropertiesEditor (intersection of common properties)

### Improvements
- Collaboration: sequential asset sync with linear progress feedback
- Collaboration: media sync badge shows current filename, error count, visible in all connection states
- Collaboration: toast notification on asset sync failure
- Report: unsaved changes modal when leaving write mode without validating
- Events: date editing no longer causes immediate re-sorting (blur-based sync)

## 2.21.4

### Fixes
- Report: fix link rendering on write→read toggle (force DOM node recreation via React keys)
- Report: preprocess `[[Label|uuid]]` to anchor format before Markdown rendering (GFM pipe conflict)

## 2.21.3

### Fixes
- Report: edited links now render immediately on validation (no tab switch needed)

## 2.21.2

### Improvements
- Relay: all configuration values exposed as environment variables (RATE_WINDOW_MS, MAX_ROOM_ID_LENGTH, PONG_TIMEOUT_MS)
- Relay: startup banner displays all active limits

## 2.21.1

### Fixes
- Report: CRDT-safe collaborative sync — sections stored as Y.Map per section instead of plain array (no more data loss on concurrent edits)
- Relay: increase default MAX_CONNECTIONS_PER_IP from 10 to 50 (fixes disconnections behind NAT/corporate networks)
- Map: add OSM Latin and CartoDB Light base layer options

## 2.21.0

### Features
- Panel docking: cycle between right, bottom, left and detached window (DevTools-style)
- Detached panel opens in a separate browser window with full styling and theme sync
- Bottom dock with vertical resize handle

### Fixes
- Map: reduce link arrow z-index from 500 to 50 (was overlapping modals)
- Map: isolate Leaflet stacking context so map z-indexes never cover modals/overlays
- SynthesisModal: fix capture overlay z-index (100 → 1000) to stay above map

## 2.20.8

### Improvements
- Splash screen with logo and version on app startup (eliminates white flash)
- Version injected automatically via Vite `transformIndexHtml` plugin
- StorageModal: refresh button no longer hides content (spinner only on initial load)

## 2.20.7

### Fixes
- StorageModal: fix OPFS cleanup on "Purge all dossiers" (was targeting wrong directory `assets/` instead of `dossiers/`)
- StorageModal: clean orphaned OPFS directories on startup (legacy `investigations/`, `media/`)
- StorageModal: fix recovery migration crash when `investigations` table doesn't exist
- Remove `compactAllYjsDatabases()` from startup (caused Firefox crash)

### Improvements
- StorageModal: per-dossier Y.js compact buttons + "Compact all" in Maintenance tab
- Y.js compaction on dossier close (replaces all updates with single snapshot)
- Unified Y.js persistence layer (`EncryptedIndexeddbPersistence` for both encrypted and plain)
- Reduced `PREFERRED_TRIM_SIZE` for more frequent auto-compaction

## 2.20.6

### Fixes
- PDF thumbnails: add `.mjs` to service worker precache patterns, fixing pdf.js worker loading in production

## 2.20.5

### Fixes
- Backup restore: remap element/link ID references in report sections (`[[Label|old-id]]` → `[[Label|new-id]]`)
- Backup restore: remap `elementIds` in report sections, `hiddenElementIds` and `elementPositions` in views
- Backup restore: track link ID mapping (`linkIdMap`) for complete reference remapping

## 2.20.4

### Fixes
- StorageModal: refresh dossier list after backup import (`onDataChanged` callback)

### Improvements
- Landing page: add Storage and Encryption buttons in footer (remove fixed bottom-right button)
- StorageModal: add "Purge all dossiers" with CSS-based double confirmation and app reload
- i18n: add `encryption` label for all 11 languages

## 2.20.3

### Fixes
- Backup import: fix `tagSets.where('name')` crash (`name` not indexed since v7), use `toArray()` + filter
- Backup import: handle legacy backups with `investigationId` instead of `dossierId` in all tables
- Y.Doc mappers: defensive `Array.isArray` guards on `properties`, `tags`, `events`, `assetIds`, `childIds` to prevent `.map` crash on corrupted data
- ElementDetail/LinkDetail: guard `properties.map` in SuggestedPropertiesPopup

## 2.20.2

### Fixes
- Encryption: fix double-encryption of dossier data during v8 migration (recursive `decryptObject` unwraps all layers)

## 2.20.1

### Fixes
- DossierCard: defensive `Array.isArray` guard on tags to prevent crash when stale cached JS reads migrated DB

## 2.20.0

### Features
- Renamed core concept "Investigation/Enquête" → "Dossier" across entire application
- Dexie DB migration v8/v9: automatic data migration from `investigations` to `dossiers` table
- Legacy backward compatibility: import of old ZIP files (`investigation.json`), URL redirect (`/investigation/:id`)
- i18n: all 11 languages updated with localized term (FR: dossier, DE: Akte, IT: fascicolo, ES: expediente, PT: dossiê, PL: teczka, UA: справа, NL: dossier, CA/EU: expedient)

## 2.19.1

### Fixes
- Canvas: ghost elements (group children) appearing at top-left on other tabs (relative position without parent)
- Canvas: element positions incorrect after group dissolve/ungroup (Zustand update delay via rAF)
- Canvas: removeFromGroup stale childIds when removing multiple children in loop
- Assets: added confirmation modal before deleting attachments
- Docs: encryption warning (never refresh during operations), WebAuthn/auto-lock sections in EN

## 2.19.0

### Features
- Interactive HTML report: search overlay (Ctrl+K) with keyboard navigation
- Interactive HTML report: tag filtering via popover dropdown
- Interactive HTML report: thumbnail images embedded in SVG node shapes
- Interactive HTML report: layout toggle (report left/right) with persistence
- Interactive HTML report: resizable columns between report and graph panels
- Interactive HTML report: ultracompact code generation (86% size reduction)
- Side panel: toggle panel position (left/right) with persistent preference

## 2.18.3

### Fixes
- Canvas: displayed properties not updating on toggle (incremental cache invalidation)
- Canvas: auto-set reference date on paste/drop of images and files
- Dates: split datetime-local into date + time inputs (date-only input now works, defaults to 00:00)
- Handles: enlarged invisible hitbox (24px) for easier link creation without visual change
- Canvas: increased connectionRadius to 40px for easier target snapping

## 2.18.2

### Fixes
- Relay: keepalive ping/pong (30s) to prevent zombie connections and NAT timeout
- Relay: solo echo to keep y-websocket alive (prevents 30s reconnection loop for solo clients)
- Relay: throttled join/leave logs (solo reconnections summarized every 5 min)
- Relay: all limits configurable via environment variables (13 env vars documented)
- Relay: buffer retention changed to 48h / 100K messages (from 7d / 10K)

## 2.18.1

### Fixes
- Relay: throttle "Quota exceeded" log to one message per room (avoids log spam when buffer is full)
- Relay: flush buffered messages only when a 2nd client joins the room (prevents echo loop when a solo client reconnects and re-receives its own messages)

## 2.18.0

### Features
- WebAuthn PRF (FIDO2 Level 3): unlock with a hardware security key (YubiKey) as an alternative to the passphrase. Register, list, and delete credentials from the encryption settings.
- Investigation retention: configurable retention period per investigation (days). Four expiration policies: warning, read-only, proposed deletion, permanent redaction.
- Read-only enforcement: `assertWritable` guards on all 22 mutation actions in investigationStore. Expiration with read-only or redact policy locks the investigation.
- Permanent redaction: irreversibly replaces all text content (labels, notes, properties, tags) with masking characters while preserving graph structure.
- Auto-lock on inactivity: configurable idle timeout (5/15/30/60 min) with activity detection (mouse, keyboard, touch, scroll) and visibility change handling. Setting persisted in `_encryptionMeta`.
- Retention collaboration sync: retentionDays and retentionPolicy synchronized via Y.Doc in collaborative sessions.
- Import expiration warning: ZIP import shows a warning if the source document's retention period has expired.
- SECURITY.md: updated with WebAuthn PRF, PBKDF2 600k iterations, 4 retention policies.
- RGPD.md: GDPR applicability analysis for ZeroNeurone usage.
- User documentation: encryption page updated (auto-lock, WebAuthn), new retention page.
- i18n: all new features translated into 11 languages.

## 2.17.0

### Features
- At-rest encryption: all IndexedDB data and OPFS attached files can be encrypted with a password (AES-256-GCM / XSalsa20-Poly1305 via tweetnacl). DEK/KEK architecture with PBKDF2-SHA256 (600k iterations). Activation, deactivation, and password change via the lock icon on the home page.
- Session lock (Alt+L): lock the session without closing the browser. Data becomes unreadable until the next password entry.
- Encrypted ZIP export: optional password protection for exported archives (.znzip).
- Plugin encryption API: `api.encryption.applyToDatabase()`, `onReady()`, `onLock()`, `onBeforeDisable()`, `isEnabled()` — external plugins can encrypt their own Dexie instances using the same key.
- i18n: EncryptionModal and PasswordModal fully translated into 11 languages, including structured risk warnings on activation.

## 2.16.2

### Fixes
- Increase font size for plugin card footer lines (license, documentation, settings, about)
- Fix deselection toggle for similar pairs in Insights duplicate detection panel

## 2.16.1

### Fixes
- Enable merge button in Insights panel duplicate detection — similar pairs can now be merged directly from the analysis view

## 2.16.0

### Features
- Merge two elements: select 2 elements → right-click → Merge. Choose which label to keep; properties, events, tags, assets and links are merged. Duplicate links (same target) are combined, self-links are removed.

## 2.15.9

### Fixes
- Expose `unregisterPlugin` in the external plugin API — plugins can now dynamically remove/update their registrations (e.g. refresh `home:card` on license or language change)

## 2.15.8

### Fixes
- Fix duplicate plugin cards on license change: `unregisterPlugin` now removes all matching entries, not just the first one

## 2.15.7

### Fixes
- Fix stale chunk crash after deploy: lazy-loaded views (Canvas, Map, Timeline, Matrix) now auto-reload the page once on chunk load failure instead of showing an error screen

## 2.15.6

### Fixes
- Fix Dexie version conflict: plugins now use ZN's Dexie instance via Blob URL shim (same pattern as React) — no more "Two different versions of Dexie loaded" error
- Add `preview:plugins` npm script for local plugin testing with `npm run preview:plugins`

## 2.15.5

### Fixes
- Docker: support baking plugins into the image via `plugins/` directory — copy `.js` + `manifest.json` before `docker build`
- Added gitignored `plugins/` directory for Docker plugin integration

## 2.15.4

### Fixes
- `home:actions` slot: components now receive `{ context: 'landing' | 'investigations' }` prop — plugins can adapt rendering without querying the DB
- New `app:global` slot: always mounted at the app root, independent of current page — plugins can mount global overlays/modals without duplicating across `header:right` and `home:banner`
- `home:card` actions: cards now support an `actions` array (`{ label, icon, onClick }[]`) alongside `onConfigure` for multiple entry points
- Plugins disabled by default (opt-in via localStorage whitelist)
- Auto-rewrite bare React/ReactDOM/JSX-runtime imports to Blob URL shims in plugin loader
- Auto-register `home:card` for plugins that don't provide one
- Add `process.env` shim for plugins referencing `NODE_ENV`
- Await async plugin `register()` to prevent race conditions
- Replace Eye/EyeOff toggle with proper switch component for plugin enable/disable

## 2.15.2

### Fixes
- Expose `React` and `ReactDOM` as globals (`globalThis.React`, `globalThis.ReactDOM`) before loading external plugins — pre-compiled plugins can now resolve bare `import { useState } from 'react'` via Blob URL loading
- Plugin docs (EN + FR): updated pre-built plugins section with `global-externals` Rollup plugin config, removed manual `(window as any).React = api.React` workaround

## 2.15.1

### Fixes
- Extended plugin API: expose Zustand stores, repositories, db, fileService, generateUUID, i18n to external plugins
- Added `plugin-api.d.ts` type definitions for external plugin developers
- Plugin docs (EN + FR): expanded API surface table, createPortal pattern for plugin modals

## 2.15.0

### Features
- External plugin loading: standalone JS plugins in `dist/plugins/` loaded dynamically at startup via manifest — no recompilation needed
- Plugin API (`pluginAPI`): exposes `registerPlugin`, `React`, `icons`, and `pluginData` persistence helpers to external plugins
- Plugin loader: fetch manifest + Blob URL dynamic import, works in both Vite dev and production
- Service worker exclusion: plugins always fetched fresh (not precached by PWA)

### Docs
- Plugin development guides (FR + EN): new "External Plugins" section with manifest format, API surface, React without JSX, pre-built plugins, deployment, security

## 2.14.0

### Features
- Plugin system: `home:card` slot for structured plugin metadata cards on the home page (name, description, icon, version, license, features, configure callback)
- Plugin disable/enable: toggle plugins on/off from the home page; disabled plugins are filtered from all slots app-wide (context menus, panels, shortcuts, export/import hooks)
- Plugin ID tracking: `pluginId` field on all slot interfaces + 3rd argument on `registerPlugin()` for cross-slot association
- Accordion UI: collapsible Extensions section on home page with count badge, state persisted to localStorage

### Fixes
- MinResolutionGuard: lowered minimum resolution from 1280x720 to 1024x600, now dismissible per session (sessionStorage), fully localized across 11 languages
- Plugin registry: fix infinite re-render loop caused by `useSyncExternalStore` receiving new array references on every `getPlugins()` call — added version-based filtered cache

### i18n
- New keys `enablePlugin`, `disablePlugin` translated across all 11 locales
- New keys `resolution.title`, `resolution.message`, `resolution.dismiss`, `resolution.current`, `resolution.minimum` translated across all 11 locales

### Docs
- Plugin development guides (FR + EN): documented `home:card`, `home:banner` slots, plugin disable/enable system, `pluginId` mechanisms

## 2.13.2

### Features
- Plugin system: new `home:banner` slot for full-width content above home page (landing hero and investigation list)
- PDF text extraction: increase page limit from 10 to 100 pages

## 2.13.1

### Fixes
- Canvas: prevent unintentional element creation from rapid double-clicks (500ms cooldown + drag/viewport guards)
- Context menu: annotations now show a notes excerpt instead of "Sans nom" when label is empty
- SidePanel: persist width to localStorage so it survives page reloads

## 2.13.0

### Features
- PDF/text file content extraction: text from PDF (up to 10 pages) and text files (TXT, MD, CSV) is automatically extracted and indexed for full-text search (Ctrl+K)
- Extracted text preview in asset panel: character count indicator, expandable text preview
- On-demand text extraction: ScanText button to extract or re-extract text at any time
- Clear extracted text: FileX2 button to remove indexed text from an asset

### Fixes
- Fix PDF text extraction: `generatePdfThumbnail()` was detaching the ArrayBuffer (transferred to pdf.js worker), causing `extractPdfText()` to silently fail. Fixed by copying the buffer before thumbnail generation.
- Connect extracted text to MiniSearch index: `searchService.elementToDocument()` now includes concatenated `extractedText` from linked assets (was hardcoded to empty string)

### i18n
- New keys `extractText`, `reExtractText`, `toggleText` translated across all 11 locales

## 2.12.3

### Features
- Plugin registry: `unregisterPlugin(slot, predicate)` to dynamically remove registered plugins
- Plugin registry: immutable slot updates — `registerPlugin`/`registerPlugins` now create new array references (fixes `useSyncExternalStore` reactivity for dynamic add/remove)
- SidePanel: auto-switch to "detail" tab when active plugin tab is unregistered

## 2.12.2

### Features
- Plugin system: new `home:actions` slot for extending the home page (landing and list views)
  - Rendered in the landing footer (before theme toggle) and in the list view toolbar
  - Accepts `ComponentType[]` — same pattern as `header:right`

## 2.12.1

### Fixes
- MarkdownEditor: textarea auto-resizes to fit content (no more manual drag to see full text)

## 2.12.0

### Features
- Plugin system: slot-based extension architecture with 10 named slots
  - `header:right` — inject components in the investigation header
  - `panel:right` — add custom side panel tabs (dynamic icon, label, component)
  - `contextMenu:element` / `contextMenu:link` / `contextMenu:canvas` — context menu entries with dynamic Lucide icons and visibility conditions
  - `report:toolbar` / `report:sectionActions` — report panel extensions
  - `keyboard:shortcuts` — additional keyboard shortcuts (native shortcuts always take priority)
  - `export:hooks` / `import:hooks` — ZIP export/import lifecycle hooks
- Plugin registry (`registerPlugin`, `registerPlugins`, `getPlugins`, `clearAllPlugins`)
- React hook `usePlugins()` using `useSyncExternalStore` for reactive slot consumption
- Generic `pluginData` Dexie table for plugin persistence (`[pluginId+investigationId+key]` compound index)
- Plugin errors never crash the app (all hooks wrapped in try/catch with console.warn)
- Zero runtime impact when no plugins registered (empty arrays iterated, nothing rendered)

### Documentation
- Plugin developer guide in English (`docs/plugin-development-en.md`)
- Plugin developer guide in French (`docs/plugin-development-fr.md`)

## 2.11.0

### Features
- Insights: betweenness centrality computed (graphology-metrics) and displayed as percentage next to degree in the centrality ranking
- Timeline: density heatmap bar below the time axis — adaptive bucket sizing (7/14/30/90/365 days based on zoom), click to set temporal filter, toggleable via toolbar button

### i18n
- Density bar labels translated across all 11 locales (fr, en, de, es, it, pt, nl, pl, ca, eu, ua)
- Betweenness centrality label translated across all 11 locales

## 2.10.2

### Fixes
- Canvas: paste now targets mouse cursor position instead of viewport center (fallback to center if cursor outside canvas)
- Canvas: duplicate (Ctrl+D) preserves parent group membership when the group is also selected
- Canvas: Escape key deselects all elements and links
- Canvas: arrow keys move selected elements (1px, Shift+arrow = 10px) with undo/redo support

## 2.10.1

### Fixes
- Report editor: fix empty content when entering write mode (contentEditable was never populated on initial edit)

## 2.10.0

### Features
- Matrix view: new tabular display mode for investigating data in a spreadsheet-like format
  - Virtual scroll for large datasets (3000+ elements)
  - Column sort, resize, reorder (drag & drop), and visibility toggle
  - Per-column text filter
  - Inline cell editing (double-click) with undo/redo support
  - Keyboard navigation between cells (Tab, Shift+Tab, Arrow keys)
  - Multi-row selection (Ctrl+click, Shift+click)
  - CSV export with investigation-named file
  - Copy selected rows as TSV (Ctrl+C)
  - Anonymous mode, focus mode, and insights highlighting supported
  - Respects canvas tabs membership
- ViewToolbar: added `showMediaToggle` and `showCommentBadgesToggle` props for view-specific toolbar customization

### i18n
- Matrix view labels translated across all 11 locales (fr, en, de, es, it, pt, nl, pl, ca, eu, ua)

## 2.9.1

### Fixes
- SVG export now embeds media thumbnails (images clipped to element shape with proper sizing)
- Canvas: media elements now respect their shape (circle, diamond) instead of always rendering as rectangles

## 2.9.0

### Features
- Comprehensive undo/redo: all destructive actions are now undoable (Ctrl+Z / Ctrl+Shift+Z)
  - Element/link metadata: label, notes, source, confidence, dates, geolocation, visual properties
  - Properties and events: add, edit, delete on elements and links
  - Groups: create group, dissolve group, remove from group
  - Canvas tabs: delete tab
  - Saved views: delete view
  - Report sections: delete section
  - Filters: clear all filters
  - Layout fallback: undo layout when no prior positions exist
- Extract property to element: promote a property to its own element on the canvas, linked to the source
- Extract event to element: promote an event to its own element, with temporal data (date, period) carried by the link

### Fixes
- Event extraction: dates now placed on the link (relationship) instead of the extracted element, matching the semantic model

## 2.8.0

### Features
- Canvas tabs: organize investigations into thematic workspaces (e.g., per hypothesis, per actor type, per time period)
- Tab bar with "All" global view, named tabs, and "+" creation button (max 10 per investigation)
- Ghost elements: elements from other tabs connected to the current tab appear semi-transparent with a badge
- Right-click context menu: add/remove elements from tabs, navigate to ghost element's source tab
- Tabs synchronized via Y.js in collaborative mode (names, members, order — viewport remains local per user)
- Tabs included in ZIP/JSON export and restored on import
- Search (Ctrl+K) auto-switches to the correct tab when selecting a result
- Saved views remember and restore the active tab
- Undo/redo tracks tab membership changes (add/remove elements from tabs)

## 2.7.3

### Fixes
- Collab media sync: serialized encrypted send queue (Promise chain) prevents out-of-order messages and data loss for large payloads
- Collab unshare: `flush()` awaits all pending encrypted messages before disconnect (replaces unreliable 200ms timeout)
- Base64 encoding: chunked `arrayBufferToBase64()` utility (32KB chunks) replaces O(n) string concatenation
- Version check: detect stale cached code on tab focus via `/version.json` polling with cache-busting, persistent toast notification

## 2.7.2

### Fixes
- Collab sync status: "Sync..." indicator no longer stays active when only one user remains (ignore sync events when no peers)

## 2.7.1

### Fixes
- Collab sync: visual property changes (fontSize, shape, color, etc.) no longer overwrite other visual properties on remote peers (partial visual merge instead of full spread)
- Minimap dark mode: background, mask, and node colors adapt to dark theme
- Remove deprecated `apple-mobile-web-app-capable` meta tag (replaced with `mobile-web-app-capable`)
- Remove noisy `[_syncFromYDoc] SLOW` diagnostic logs from console

## 2.7.0

### Features
- Per-element/link font size: XS (8px), S (12px), M (14px), L (18px), XL (22px) presets in Appearance panel
- Font size applies to elements, annotations, groups, links, and multi-selection
- Element resize from all corners now preserves position (not just bottom-right)

### Fixes
- Map temporal mode: day-level comparison for accurate element visibility (no time-of-day drift)
- GeoPicker centers on event's existing coordinates when editing event location
- Asset upload: deferred base64 encoding for faster UI response

## 2.6.0

### Features
- Import all supported formats into current investigation (CSV, JSON, GraphML, GEDCOM, GeneWeb, OSINTracker, Excalidraw, STIX 2.1) — not just ZIP
- All imports enter placement mode: click on the canvas to choose where imported elements are positioned
- Estimated bounding box preview follows cursor with element count badge

### Performance
- Batch undo/redo for multi-select delete: single Y.Doc transaction via `pasteElements` instead of sequential createElement/createLink calls

### Fixes
- Restore collaboration session (WebSocket) after import placement (save/restore shared mode state)

## 2.5.6

### Fixes
- Fix map temporal mode hooks crash: move early return after all hooks to respect React rules
- Fix map temporal mode UX: keep map and timeline visible when temporal filter empties geolocated elements
- Improve map cluster spiderfy spacing with `spiderfyDistanceMultiplier: 2`
- Prevent map link click events from bubbling to map container (`bubblingMouseEvents: false`)

## 2.5.5

### Fixes
- Improve hide media blur: pixelated rendering + stronger blur (16px) + grayscale for better content anonymization

## 2.5.4

### Fixes
- Fix initial sync race condition: joiner could display stale positions/labels from IndexedDB cache when WebSocket sync hadn't completed yet
- Add `waitForSync()` to await WebSocket Y.js sync before reading Y.Doc on shared session join
- Add state-change listener to trigger safety re-sync when WebSocket connection/sync completes after initial load

## 2.5.3

### Fixes
- Fix minimap not showing nodes: persist React Flow dimension measurements on user nodes so `nodeHasDimensions()` check passes in controlled mode
- Eliminate edge flicker during zoom on small graphs (cullingViewport ref + referential stability)
- Fix HD image race condition on first open after refresh (shared inflight promises)

### i18n
- Localize loading screen phases across 11 languages

## 2.5.2

### Performance
- Fix edge cache invalidation: auto anchor handles, link visual properties, and global settings (curveMode, anchorMode, confidence) now correctly bust the cache
- Skip edge computation at first render when node positions are uninitialized (eliminates startup freeze with 1000+ elements)

### UI
- Improved loading screen: phase label + detail counter (element/link counts, file download progress)
- Event loop yield between loading phases ensures counters are painted before heavy sync

## 2.5.1

### Features
- HD image Level of Detail: full-resolution images load automatically from OPFS when a node is large enough on screen (node size × zoom > 250px), with LRU cache (max 30 blob URLs) and automatic eviction

## 2.5.0

### Performance
- Incremental Y.js sync with requestAnimationFrame batching (replaces setTimeout 50ms)
- Double-render elimination: conditional displayNodes (local during drag, store otherwise)
- Edge version debouncing at 300ms (prevents full edges rebuild on every remote position update)
- Blocking crypto warmup before processing real messages (fixes Firefox 3s cold start)
- SimpleEdge component for dense graphs (lighter rendering)
- Adaptive edge hiding threshold: edges hidden during pan/zoom only above 500 elements
- Drag-end timing fix: isDraggingRef set to false after store update (prevents position flash)
- Progressive rendering for large collaborative sync
- Edge capping for stress test scenarios
- Incremental nodeStructures and nodes assembly

### Fixes
- Fix selection loop causing infinite re-renders
- Fix search zoom to center viewport on found element
- Fix delete optimization for large selections
- Fix undo support for collaborative operations
- Fix localOpPending flag to prevent echo from local Y.js operations
- Fix 6 cascading re-sync timers reduced to 1
- Fix joiner logic bug in collaborative sync

### Documentation
- Updated user documentation with app performance limits
- Added large investigation FAQ section (FR + EN)

## 2.0.0

### Features
- Asynchronous collaboration: work with collaborators at different times, changes buffered on server for 7 days
- Auto anchor mode for connectors enabled by default on new investigations

### Fixes
- Sync status no longer stuck on "sync..." when becoming alone in room
- Sync status no longer stuck on "sync..." when starting to share with no peers connected
- Removed debug logs from production build

### Documentation
- Added async collaboration section with link preservation warning
- Updated URL format documentation for v1.7 security changes

## 1.7.0

### Security
- URL hardening: investigation name moved to URL fragment (never sent to server)
- URL hardening: room ID is now SHA-256 hash of UUID + encryption key (server cannot correlate sessions)
- Backwards compatible with pre-1.7 share URLs

### Fixes
- Relay server: increased max message size to 50 MB for large Y.Doc sync

## 1.6.3

### Fixes
- Relay server: allow dots in room IDs, extract last URL segment (handles proxy paths)
- Documentation: clarify WebSocket server URL format (must include wss:// or ws://)

## 1.6.2

### Features
- Mobile-friendly interactive HTML export: tabs (Report/Graph) instead of split, touch pan/pinch-to-zoom, bottom sheet tooltip

## 1.6.1

### Fixes
- Named links (relations) referenced in reports now render correctly in ZIP export (were showing as strikethrough)

## 1.6.0

### Features
- Investigation tags: add tags to investigations for organization (Cyber, Client-X, Archive...)
- Search and filter on home page: search by name/description, filter by tags
- Favorites: star button to pin important investigations at the top
- Sort options: by modification date, creation date, or name
- Modal for editing investigation tags with suggestions from existing tags

## 1.5.3

### Features
- Auto fit-to-view after import: graph automatically fits to show all elements

### Fixes
- Group elements now display correctly (full rectangle instead of line at top)
- Report export in ZIP now properly includes all sections from Y.Doc storage
- Element and link references in reports preserved during import (ID remapping)

## 1.5.2

### Features
- Position lock for elements: prevent accidental moves via context menu or detail panel
- Lock/unlock applies to all selected elements in multi-selection
- Locked elements stay in place when dragging multi-selection
- No canvas panning when attempting to drag locked elements

## 1.5.1

### Fixes
- Group navigation in interactive HTML export now works (zoom to group center)

## 1.5.0

### Features
- Interactive HTML report export with embedded graph visualization
- Bidirectional navigation between report and graph (click element refs to zoom, click nodes to scroll)
- Report info modal with investigation metadata and statistics
- Collapsible table of contents for long reports
- Export markdown (without element links) from HTML report
- Dark/light theme toggle in exported HTML
- Tags included in SVG node data attributes
- Click on link reference now selects the link and both connected elements

### Fixes
- Link selection in report panel now correctly highlights the link (not just target element)

## 1.4.2

### Features
- Hierarchy layout available in layout menu (for any investigation, not just genealogy)
- GEDCOM import: NICK (nickname) and TITL (title) fields now imported as properties

## 1.4.1

### Fixes
- Marriage links now end at first spouse's death (no longer infinite on timeline)

## 1.4.0

### Features
- GEDCOM 5.5.1 and 7.0 genealogy file import (.ged)
- GeneWeb genealogy file import (.gw)
- Automatic family tree layout after import (generations organized vertically)
- GPS coordinates from places imported into events for map display
- Support for birth, death, residence events with dates and locations
- Marriage and parent-child relationship links

### Fixes
- Historical dates (before year 1000) now display correctly
- Timeline events no longer appear as infinite ranges

## 1.3.6

### Fixes
- Fix flash/flicker when typing in InvestigationDetail fields (name, description, creator, date)
- Add EditableField component with lock/edit pattern (click to edit, blur to save)
- Change Y.Doc observer from throttle to pure debounce to prevent sync race conditions

## 1.3.5

### Features
- Collaborative locking with remote user indicator in Report sections
- Copy elements with Markdown link format [[Label|id]]
- Paste from canvas now works correctly without duplicates

### Fixes
- Optimize typing performance (defer serialization to validation)
- Fix flash/flicker on content sync between local and remote
- Add stopPropagation on paste to prevent canvas interference

## 1.3.0

### Features
- Report panel: new side panel tab for writing investigation reports
- Markdown editor with sections (add, reorder, delete)
- Element/link references with [[Label|uuid]] syntax
- Autocomplete dropdown triggered by [[ for quick insertion
- Clickable links in preview mode (navigates to element on canvas)
- Report persistence with Yjs collaborative sync
- Rename "Report" modal to "Synthesis" for clarity

## 1.2.0

### Features
- Import into current investigation: merge elements from a ZIP file into the active canvas
- Click-to-place import with visual preview (bounding box follows cursor)
- Zoom and pan during import placement mode
- Escape key to cancel import placement
- Proper handling of grouped elements (preserve relative positions)

## 1.1.0

### Features
- Timeline temporal filter with range slider for date-based filtering
- Animation controls (play/pause) to animate through time periods
- Step forward/backward buttons for manual navigation
- Draggable range to shift the entire filter window
- Date input fields for precise date selection

## 1.0.12

### Fixes
- Fix date input reset issue when manually typing dates (especially in Brave browser)
- Use local state for date/datetime inputs to prevent reset during field navigation

## 1.0.11

### Features
- Add sticky note icon indicator on annotations

### Fixes
- Improve note text contrast based on background color (auto dark/light)

## 1.0.10

### Fixes
- Apply redaction (anonymous mode) to group labels
- Apply redaction to annotation/note content
- Hide displayed properties on groups in anonymous mode

## 1.0.9

### Features
- Map view: add satellite imagery layer (ArcGIS World Imagery)
- Layer control to switch between OpenStreetMap and Satellite views

### Fixes
- Limit satellite layer zoom to 18 (no imagery beyond this level)
- Auto-adjust zoom when switching to satellite if currently above 18

## 1.0.8

### Features
- Map view: add satellite imagery layer (ArcGIS World Imagery)
- Layer control to switch between OpenStreetMap and Satellite views

## 1.0.7

### Improvements
- Complete i18n for collaboration UI (status indicator, user avatar, presence)
- All 11 locales updated with collaboration strings

### Changes
- License updated with full author name
- README roadmap updated (STIX2 marked complete)

## 1.0.6

### Fixes
- Fix collaborative sync for element resize (customWidth/customHeight)
- Fix collaborative sync for all visual properties (border, icon, image)
- Fix collaborative sync for link visual properties (style, thickness, curveOffset, direction, handles)
- Fix collaborative sync for element/link dates and source fields

## 1.0.5

### Fixes
- Fix map geo position not persisting after view change (add geo to Y.Doc differential sync comparison)
- Fix map drag prioritizing element.geo over event.geo for manually positioned markers

## 1.0.4

### Fixes
- Fix map cluster closing immediately after spiderfy (use ref instead of state for isSpiderfied flag to avoid triggering effect re-runs)

## 1.0.3

### Fixes
- Events now support hours/minutes (datetime-local input instead of date-only)
- Events dates stacked vertically for better visibility in narrow panels
- SidePanel collapse button always visible (was hidden at default width)
- Map cluster no longer closes when clicking on spiderfied element
- Map drag now saves position correctly (dragged positions override event-based positions)
- Fix PropertiesEditor dropdown isOpen type error

## 1.0.2

### Fixes
- Fix timeline tooltip cut off at bottom of screen (now displays above element when needed)

## 1.0.1

### Fixes
- Fix geo coordinates reverting after save (use flushSync + read from Y.Doc)
- Fix map picker not centering on existing coordinates when reopening
- Fix choice-type properties not showing dropdown list from TagSets
- Add free text input for choice properties (can enter value not in list)
- Fix modal focus stealing when typing in input fields

## 1.0.0

### Features
- GeoJSON export for map data
- STIX 2.1 import support for cyber threat intelligence

### Fixes
- Enable Ctrl+wheel zoom on timeline
- All TypeScript errors resolved

## 0.9.8

### Features
- Storage management modal with detailed breakdown (IndexedDB, OPFS, Y.js history)
- Persistent storage protection (`navigator.storage.persist()`) to prevent browser eviction
- Full backup export/import (all investigations, elements, links, files, tags in one ZIP)
- Y.js history purge option to free up storage space

### Fixes
- Version display in About modal now reads from package.json (was stuck at 0.5.0)

## 0.9.7

### Performance
- Progressive list rendering in panels (ProgressiveList component) — clusters, bridges, isolated, tags, hidden elements load incrementally instead of all-at-once DOM rendering

### Fixes
- Clear selection and insights when switching between investigations
- Show loading phases ("Ouverture...", "Synchronisation...", "Fichiers...", "Elements...") instead of static "Chargement..." text
- Scrollable properties/events lists with add button at top (avoids losing access to other accordion sections)
- Timeline vertical virtualization for 10,000+ items
- Undo/redo support for map marker drag (geo position changes)

## 0.9.5

### Performance
- Web Worker for graph computations (insights, layout) — UI stays responsive during heavy analysis
- Tarjan O(V+E) bridge detection replacing brute-force O(n²*(n+m))
- Sorted + sliding window for similar labels replacing O(n²) pairwise comparison
- Incremental Y.js sync with structural sharing (only changed elements trigger re-render)
- Incremental search index (MiniSearch syncs diffs instead of full rebuild)
- Optimized Zustand store subscriptions (individual selectors, no bulk destructuring)
- Remote user presence lifted to Canvas level (1 subscription instead of n+m)

## 0.9.1

### Features
- Toggle actions for clusters in Insights panel (select/deselect, hide/show, group/dissolve)

### Performance
- Batch paste/duplicate operations in single Y.js transaction (instant paste of 300+ elements)
- Freeze edge computation during drag for smooth node movement
- Instant group/dissolve with batched Y.js transactions

### Fixes
- Remove insights overlay popups from canvas (cleaner UI)
- Stabilize cluster detection (consistent results between runs)
- Paste now centers elements at viewport/cursor position instead of original location

## 0.9.0

### Features
- Native SVG export (editable in Inkscape/Illustrator)
- Annotations (sticky notes with markdown support)
- Visual groups (frame containers for organizing elements)
- Alignment guides (snap to grid, align selected elements)
- Draggable minimap
- Element duplication (Ctrl+D)
- New keyboard shortcuts (G for group, A for annotation)

### Performance
- Canvas rendering optimization (stable callbacks, split memo components)
- Edge culling (skip rendering off-screen edges)

### Fixes
- Absolute position resolution for grouped elements in edge culling
- Accept any file extension in import picker with JSON auto-detection

## 0.8.17

### Features
- Excalidraw import with shape, arrow, and image mapping

## 0.8.16

### Features
- Multi-format JSON import with auto-detection

## 0.8.15

### Features
- Collaborative session leave warning dialog

### Fixes
- Improved drag smoothness and immediate visual updates

## 0.8.14

### Changes
- Remove hexagon shape
- Improved border controls UI

## 0.8.13

### Features
- Border width and style controls for elements

## 0.8.11

### Features
- Orthogonal (right-angle) link routing mode

## 0.8.10

### Features
- Link curve mode toggle (straight/curved)

## 0.8.9

### Features
- Link anchor mode with handle-based curves

## 0.8.8

### Features
- Enhanced search with properties display and zoom-to-element

## 0.8.6

### Features
- Bulk editing and improved multi-selection
- PNG export with zoom/scale selection

### Fixes
- Dark mode improvements and viewport persistence per investigation
- Reliable PNG export using html-to-image

## 0.8.5

### Features
- Canvas display settings in Views panel (confidence, tags, properties)
- Tag icons in TagSet manager

## 0.8.0

### Features
- TagSet CSV import/export
- Custom property types (link, country, geo, choice)
- Real-time collaboration improvements (auto-reconnect, asset sync)
- Comments system for elements and links
- Landing page with product presentation
- Layout algorithms (force-directed, circular, hierarchical)
- Property badges on canvas elements
- Docker deployment with security hardening
- Report generation
- Tag sets with suggested properties
- Graph insights (clusters, centrality, bridges)

### Fixes
- Collaboration position sync reliability
- Large file sync improvements
- Deletion persistence

## 0.1.0

### Initial release
- Infinite canvas with React Flow
- Elements (circle, square, rectangle, diamond) with visual customization
- Links with direction, labels, and visual styles
- IndexedDB storage via Dexie.js
- OPFS file attachments with SHA-256 deduplication
- MiniSearch full-text search
- Map view (Leaflet)
- Timeline view
- Import/Export (JSON, CSV, GraphML, ZIP)
- Views and filters system
- Undo/Redo
