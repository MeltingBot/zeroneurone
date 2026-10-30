---
title: "Importer"
weight: 2
---

# Importer des données

Intégrez des données externes ou restaurez un dossier sauvegardé.


## Ouvrir l'import

Menu **⋯** → **Importer**

---

## Formats supportés

### ZIP (ZeroNeurone)

**Import complet** d'un dossier exporté.

| Action | Résultat |
|--------|----------|
| **Créer un nouveau dossier** | Crée une copie indépendante |
| **Fusionner** | Ajoute les éléments au dossier actuel |

Après une fusion (ZIP ou autre format placé sur le canvas), les éléments importés sont sélectionnés et **Ctrl+Z** annule l'import en une fois : éléments, liens et onglets créés. Les pièces jointes, familles de tags et sections de rapport apportées restent ; les éléments existants modifiés par l'import (événements CSV) gardent leurs modifications.

#### Choisir les onglets

Quand l'archive a des onglets, la fusion propose de choisir lesquels importer (tous cochés, avec leur nombre d'éléments) :

- **Hors onglet** : les éléments rangés dans aucun onglet de l'archive.
- **Éléments reliés** (coché par défaut) : ajoute les éléments liés directement aux éléments retenus, même rangés dans un onglet non choisi (une victime, un objet). Ils restent hors onglet et apparaissent en fantôme dans l'onglet recréé.
- **Recréer les onglets** (par défaut) : chaque onglet choisi rejoint l'onglet **du même nom** du dossier, ou en crée un nouveau (10 onglets au plus ; au-delà, ses éléments vont dans l'onglet ouvert). Les éléments hors onglet vont dans l'onglet ouvert.
- **Tout dans l'onglet ouvert** : les onglets de l'archive servent seulement à choisir ; tout ce qui est importé va dans l'onglet ouvert.
- Seuls les liens entre éléments importés et les pièces jointes de ces éléments sont repris.
- **Rapport** (coché par défaut, affiché si l'archive en a un) : ajoute ses sections ; décochez-le pour un import partiel, ses références vers des éléments non importés ne mèneraient nulle part.


### Contenu attendu

```
enquete.zip
├── dossier.json          # Requis
└── assets/               # Optionnel
    └── ...
```

---

### JSON

**Import de métadonnées** sans fichiers joints.

| Format | Description |
|--------|-------------|
| ZeroNeurone JSON | Export JSON de ZeroNeurone |
| Format personnalisé | JSON respectant le schéma |

#### Schéma JSON

```json
{
  "investigation": {
    "name": "Nom du dossier",
    "description": "Description optionnelle"
  },
  "elements": [
    {
      "id": "uuid-optionnel",
      "label": "Élément 1",
      "notes": "Notes...",
      "tags": ["tag1", "tag2"],
      "position": { "x": 100, "y": 200 },
      "visual": { "color": "#fef3c7", "shape": "circle" }
    }
  ],
  "links": [
    {
      "fromId": "id-element-source",
      "toId": "id-element-cible",
      "label": "Relation",
      "directed": true
    }
  ]
}
```

---

### JSON ou CSV par mapping

Pour du **JSON quelconque** (export d'API, sortie d'un autre outil…) ou un **CSV quelconque** qui ne suit pas le schéma natif, un assistant de **mapping** permet de relier ses champs aux éléments ZeroNeurone.

**Ouvrir :** import → *Mapper un JSON ou un CSV* (coller le texte ou choisir un fichier `.json`, `.csv` ou `.tsv`) — depuis un dossier, ou depuis la page d'accueil, où l'entrée crée un nouveau dossier (ou ouvre celui choisi dans *Importer dans*) et y affiche l'assistant — ou **coller (Ctrl+V) du JSON brut directement sur le canvas**. Un format reconnu (ZeroNeurone, GeoJSON, STIX 2.1, Excalidraw, OSINT Industries, Gephi, PredicaGraph) est importé normalement ; un JSON générique ouvre le mapping.

Un CSV importé sans les colonnes du format natif (voir [CSV](#csv)) ouvre aussi le mapping, y compris depuis la page d'accueil : le dossier est créé puis s'ouvre sur l'assistant. Si l'import est abandonné (assistant fermé ou placement annulé) alors que ce nouveau dossier est encore vide, il est supprimé et l'on revient à l'accueil ; un dossier existant n'est jamais touché. Le CSV devient un tableau nommé d'après le fichier : chaque ligne est un enregistrement, chaque colonne un champ. Le séparateur (`,`, `;` ou tabulation) est détecté ; toutes les valeurs sont lues comme du texte.

**Détection automatique :**
- la **source d'enregistrements** (un tableau d'objets comme `records`, ou l'objet entier = 1 élément) ;
- un **modèle de libellé** (ex. `{first_name} {last_name}`) ;
- les champs **date**, **pays**, **latitude/longitude** (point géo, y compris des noms composés comme `borne_lat`, `cellLng`), et les **identifiants** ;
- les colonnes **numériques** → propriété de type **nombre** (voir ci-dessous) ;
- un champ unique **`lat, lng`** combiné → point géo ;
- les **URL** → propriété de type **lien** ;
- les **références** : un champ contenant les id d'autres enregistrements crée les **liens** correspondants (orientés ; réciproques → bidirectionnels) ;
- les **nœuds pivots** : un champ peut être transformé en **nœud partagé** — chaque valeur distincte devient un nœud unique auquel sont reliés tous les enregistrements qui la portent (ex. un email/téléphone partagé révèle les connexions), dédupliqué au sein du lot ;
- les **zones (polygones)** : un tableau de coordonnées devient une zone géo (ordre lat/lng ajustable).

**Réglages :**
- **activer / désactiver** chaque champ (les champs bruités — id, hash, score… — sont décochés par défaut) ;
- **tag** appliqué à tous les éléments + option *ignorer les valeurs vides* ; le champ tag (comme celui des sous-éléments) liste au clic les tags existants du dossier (familles de tags et tags), se filtre à la frappe ; un nouveau nom s'affiche avec **+** et est créé à l'import ;
- cible **Notes** : le champ va dans les notes de l'élément. Plusieurs champs vers **Notes** sont réunis en paragraphes, chacun commençant par le nom du champ en gras (la case **Clé propriété** permet de renommer ce titre). Un seul champ : texte brut ;
- cible **Média (pièce jointe)** : une URL de média est **téléchargée et attachée** comme pièce jointe à l'élément (selon ce que le serveur distant autorise — certaines sources bloquent le téléchargement ; les échecs sont rapportés) ;
- **sous-éléments liés** : un tableau d'objets imbriqués (ex. contacts, adresses, observations) devient des **éléments enfants** reliés au parent, avec leur propre **tag**, libellé et libellé de lien (case *tout activer/désactiver*) ;
- **disposition** du graphe importé (force, clusters, hiérarchie…) avant de **cliquer pour le positionner** sur le canvas.

**Filtrer / limiter l'import :** on peut ne garder que les enregistrements satisfaisant une ou **plusieurs conditions** (champ *contient / égale / est non vide*), combinées en **ET** ou **OU**, et fixer un **plafond** (par défaut 2000 ; `0` = illimité). Utile pour les très gros jeux : on importe un sous-ensemble exploitable plutôt que des dizaines de milliers de nœuds.

**Plusieurs tableaux :** quand le JSON contient plusieurs tableaux d'objets (ex. `sinistres`, `assures`, `declarations`), chacun apparaît en onglet avec son nombre d'enregistrements.

- **Cocher** les tableaux à importer ; chacun garde son propre mapping (libellé, champs, tag, filtres) ; les tableaux ajoutés reçoivent par défaut un tag à leur nom.
- Les **références entre tableaux** sont détectées : un champ `assure_id` dont les valeurs se retrouvent parmi les `id` du tableau `assures` crée les liens vers ses enregistrements. Le tableau visé se change sur la ligne du champ.
- Les identifiants issus d'un CSV sont rapprochés (`12`, `"12"`, `12.0` désignent le même enregistrement) ; un champ qui recopie l'`id` est ignoré.
- **Identifiant commun** : si les `id` de plusieurs tableaux reprennent ceux d'un tableau principal (un numéro de procédure présent partout), chaque tableau est relié à ce tableau principal.
- **Fusionner dans** (à côté du tag) : pour un tableau dont un champ référence un autre tableau coché (ex. son `id` est le numéro de procédure de `crpj_Procédure`), choisissez ce tableau. Le tableau ne crée alors aucun élément par enregistrement : les champs de chaque enregistrement deviennent des propriétés (ou des notes) de l'élément référencé, ses listes de sous-éléments deviennent des sous-éléments reliés directement à lui, et ses pivots et liens partent de lui. Un enregistrement dont la référence ne correspond à rien reste un élément à part. Par défaut : **— (un élément par ligne)**.
- Une référence vers un tableau **non coché** est conservée en propriété.

Dès que deux tableaux sont cochés, un **schéma** montre les tableaux et leurs liens, avec la part des valeurs retrouvées dans le tableau visé :

- **tirer** le point d'un champ vers un tableau pour le relier ;
- **cliquer** une flèche pour retirer la référence ;
- **+ champ** pour transformer un autre champ en référence ;
- cliquer le nom d'un tableau ouvre son mapping ;
- **pas d'identifiant** sur un tableau signifie que son champ `id` référence un autre tableau (il n'a pas d'identifiant propre) : c'est normal pour les tableaux indexés par le numéro de procédure.

Les **gros fichiers JSON** sont gérés : le contenu n'est pas affiché dans la zone de texte au-delà de ~1 Mo, la détection s'appuie sur un échantillon (les 2000 premiers enregistrements) tandis que les enregistrements retenus sont tous importés.

**Source :** le champ **Source** (à côté du tag) donne la source de ce que l'import crée : éléments, événements et liens. Il reprend le nom du fichier, et se remplace par un texte libre (« Réponse opérateur du 12/09 »). Il ne s'applique qu'à ce qui n'a pas de source : une colonne mappée en *Source* garde la priorité, ligne par ligne. Il n'est pas enregistré dans les modèles.

**Éléments existants :**
- **Ajouter aux éléments existants** (décoché par défaut) : un élément porteur ou pivot dont le nom correspond à un élément du dossier n'est pas recréé ; ses événements et ses liens vont sur l'élément existant, sans doubler un lien qui existe déjà. Un seul **Ctrl+Z** retire les éléments créés et les événements ajoutés. Les valeurs sont comparées telles quelles : `06 39 98 33 17` et `0639983317` donnent deux éléments. **Analyses → Doublons potentiels** les rapproche (un même numéro quelle que soit son écriture) et propose de les fusionner.

**Lignes en événements :** le réglage **Chaque ligne crée** passe d'*un élément* à *un événement*. Chaque ligne devient alors un événement daté (visible sur la timeline et, s'il a un lieu, sur la carte) :
- **Élément** : la colonne qui désigne l'élément porteur. Un élément est créé par valeur distincte ; si la colonne fait référence à une autre table importée, l'événement va sur l'élément de cette table ;
- **Date** et **Fin** (facultative) : les colonnes de début et de fin. Les dates partielles (`2020`, `2020-03`) gardent leur précision ; les lignes sans date valide sont ignorées et comptées dans un message ;
- le **modèle de libellé** donne le libellé de l'événement. Au passage en mode événement, il propose une colonne de catégorie (peu de valeurs différentes, comme un type : « Appel entrant ») ; vide, l'événement prend le tag, sinon la valeur de l'élément ; les champs **notes**, **source**, **latitude/longitude** et les **propriétés** vont sur l'événement ;
- les champs **pivot** créent et relient d'autres éléments, un seul lien par paire quel que soit le nombre de lignes. Dans une même table, une valeur donne un seul élément, qu'elle soit porteuse ou pivot. Avec **Événement aussi sur les éléments pivots** (coché par défaut), l'événement est aussi posé sur chaque pivot ;
- les identifiants, références et médias ne s'appliquent pas aux lignes-événements ;
- le plafond d'import ne s'applique pas : toutes les lignes (filtrées) deviennent des événements, puisqu'elles n'ajoutent pas d'élément au canvas.

Exemple, une fadette (`appelant;appele;date;duree;lat;lng`) : *Élément* = `appelant`, *Date* = `date`, `appele` en **pivot**, `lat`/`lng` en coordonnées. Chaque numéro devient un élément, chaque paire de numéros un lien, et chaque appel un événement sur la frise des deux numéros, placé sur la carte à la borne.

Les événements vont sur des éléments créés par l'import. Pour ajouter des événements à un élément déjà présent dans le dossier, utilisez le [CSV natif](#csv) avec `type` = `event` (la colonne `de` donne le libellé de l'élément), ou importez puis **fusionnez** l'élément créé avec l'existant.

En JSON, un tableau d'objets d'un enregistrement (`appels: [...]`) peut devenir des **événements de l'élément** au lieu de sous-éléments liés : cochez *En événements de l'élément* sur ce tableau. Chaque objet est daté par son premier champ nommé comme une date (`date`, `timestamp`…), sinon par le premier qui en contient une.

**Modèles réutilisables :** un mapping peut être **enregistré** comme modèle nommé (réutilisable entre tous les dossiers), puis **rechargé** ou géré (renommer / supprimer). Lorsqu'un JSON dont les champs correspondent à un modèle enregistré est collé, une bannière propose de **l'appliquer automatiquement**. Les modèles peuvent aussi être **exportés / importés** en fichier `.json` pour les **partager** entre postes ou utilisateurs. Un modèle CSV s'applique à tout fichier aux mêmes colonnes, quel que soit son nom (la fadette du mois suivant, par exemple). Un modèle enregistré sur un CSV n'est proposé que pour un CSV, un modèle enregistré sur du JSON que pour du JSON ; un modèle créé avant cette distinction compte comme un modèle JSON, et n'est proposé pour un CSV que si ses champs correspondent aux colonnes du fichier ; l'enregistrer à nouveau sur un CSV en fait un modèle CSV.

Un modèle enregistre chaque tableau coché (mapping, modèle de libellé, tag, sous-éléments, filtres, plafond) et la liste des tableaux cochés ; le charger les restaure. Avec un modèle sélectionné, **Enregistrer** le met à jour ; sans modèle sélectionné, un nom est demandé et un nouveau modèle est créé. Les anciens modèles à un seul tableau s'appliquent toujours au tableau ouvert.

L'import se fait en un seul lot **annulable** (Ctrl+Z).

---

### CSV

**Import tabulaire** d'éléments et liens.

Un CSV est importé directement s'il suit le format natif : une colonne `type` qui ne contient que `element`, `lien`/`link` ou `event`, ou, sans colonne `type`, une colonne `label` (ou `nom`, `name`), ou les deux colonnes d'un lien (`de`/`vers`, `from`/`to`). Tout autre CSV, par exemple l'export d'un autre outil, ouvre l'assistant de [mapping](#json-ou-csv-par-mapping), où l'on choisit le libellé et le rôle de chaque colonne ; le mapping peut être enregistré comme modèle et se repropose pour un CSV aux mêmes colonnes.

**Nombres :** une colonne dont toutes les valeurs sont des nombres donne des propriétés de type **nombre** (triables et comparables comme des nombres) ; la virgule décimale est acceptée (`12,5`). Restent du texte les valeurs qui ressemblent seulement à des nombres : zéro en tête (téléphones, codes postaux, identifiants), espaces (`06 39 98 33 17`), plus de 12 chiffres (IMEI, IMSI, numéros de compte). Une colonne dont les virgules peuvent séparer des milliers (`1,234`, `25,000`, ou des virgules à côté de points décimaux) reste aussi du texte, plutôt que de donner des nombres faux. Dans le mapping, la cible **Propriété (nombre)** peut être choisie à la main.


#### Colonnes requises

| Colonne | Obligatoire | Description |
|---------|-------------|-------------|
| type | ✅ | "element", "lien" ou "event" |
| label | ✅ | Nom de l'élément/lien (libellé de l'événement pour "event") |
| de | Pour liens et events | Liens : label de l'élément source. Events : label de l'élément parent |
| vers | Pour liens | Label de l'élément cible |

#### Colonnes optionnelles

| Colonne | Description |
|---------|-------------|
| notes | Notes texte |
| tags | Tags séparés par ; |
| confiance | 0-100 |
| cotation_echelle (ou evaluation_scale) | `europol` ou `admiralty` (format unifié) |
| cotation_source / cotation_info | Codes de la cotation, ex. `B` et `2` |
| source | Source de l'information |
| date | Date : `2019`, `2019-03`, `2019-03-12` ou `2019-03-12 14:30` ; `~` en tête si approximative |
| date_debut | Début de période (liens, events) |
| date_fin | Fin de période (liens, events) |
| fuseau | Fuseau des heures de la ligne, ex. `Asia/Beirut` (vide = fuseau du système) |
| latitude | Coordonnée lat (éléments, events — pas les liens) |
| longitude | Coordonnée lng (éléments, events — pas les liens) |
| couleur | Code couleur (#hex) |
| forme | circle, square, diamond, hexagon |
| dirige | oui/non (liens) |
| * | Colonnes personnalisées = propriétés |

#### Exemple CSV

```csv
type,label,de,vers,notes,tags,confiance
element,Jean Dupont,,,Suspect principal,personne;suspect,80
element,Marie Martin,,,Témoin,personne;temoin,60
lien,Connaît,Jean Dupont,Marie Martin,Collègues de travail,,90
```

#### Événements (type=event)

Une ligne `type=event` attache un **événement daté** à un élément existant (visible dans son panneau détail, sur la **chronologie** et, s'il est géolocalisé, sur la **carte**). Un même élément peut recevoir plusieurs événements.

L'événement réutilise les colonnes du format unifié :

| Colonne | Rôle pour l'événement |
|---------|-----------------------|
| de | Label de l'élément parent (**obligatoire**) |
| date | Date de l'événement (**obligatoire**) |
| date_fin | Fin optionnelle (événement avec durée) |
| fuseau | Fuseau des heures, ex. `Asia/Beirut` (optionnel) |
| label | Libellé de l'événement |
| notes | Description |
| latitude / longitude | Géolocalisation (apparaît sur la carte) |
| source | Source de l'information |
| * | Colonnes personnalisées = propriétés de l'événement |

```csv
type,label,de,date,date_fin,latitude,longitude,source
element,Jean Dupont,,2024-01-10,,,,Enquête
event,Escale Marseille,Jean Dupont,2024-01-20,2024-01-21,43.2965,5.3698,Filature
event,Changement de véhicule,Jean Dupont,2024-02-03,,,,Enquête
```

Une ligne `event` sans date valide ou sans élément parent est ignorée (un avertissement est remonté).

#### Télécharger le modèle

Menu **⋯** → **Importer** → **Télécharger le modèle CSV**


---

### GraphML

**Format standard** pour l'échange de graphes, compatible avec Gephi, yEd, Cytoscape.

#### Structure attendue

```xml
<?xml version="1.0" encoding="UTF-8"?>
<graphml xmlns="http://graphml.graphdrawing.org/xmlns">
  <key id="label" for="node" attr.name="label" attr.type="string"/>
  <key id="x" for="node" attr.name="x" attr.type="double"/>
  <key id="y" for="node" attr.name="y" attr.type="double"/>
  <graph edgedefault="undirected">
    <node id="n1">
      <data key="label">Élément 1</data>
      <data key="x">100</data>
      <data key="y">200</data>
    </node>
    <edge source="n1" target="n2">
      <data key="label">Relation</data>
    </edge>
  </graph>
</graphml>
```

#### Attributs reconnus (noeuds)

| Attribut | Description |
|----------|-------------|
| label, name, titre | Nom de l'élément |
| notes, description | Notes |
| x, y | Position sur le canvas |
| lat, latitude | Coordonnée latitude |
| lng, lon, longitude | Coordonnée longitude |
| color, colour | Couleur (#hex) |
| tags | Tags séparés par ; |

#### Attributs reconnus (liens)

| Attribut | Description |
|----------|-------------|
| label, relation, type | Nom du lien |
| confidence, weight, poids | Indice de confiance (0-1 → converti en 0-100) |
| date, datetime | Date du lien |
| color, edgecolor | Couleur (#hex) |

---

### GEXF (Gephi)

**Format natif Gephi** pour les graphes (.gexf).

#### Données importées

| Donnée GEXF | Propriété ZeroNeurone |
|--------------|----------------------|
| Label du noeud | Label de l'élément |
| Attributs (tous) | Propriétés typées (text, number, date, boolean) |
| viz:position (x, y) | Position sur le canvas |
| viz:color (r, g, b) | Couleur de l'élément |
| viz:size | Taille proportionnelle (small/medium/large) |
| Attributs d'arête | Propriétés du lien |
| viz:color sur arête | Couleur du lien |
| viz:thickness | Épaisseur du lien |
| defaultedgetype | Direction (directed/undirected) |

Dans un graphe non orienté, une relation écrite dans les deux sens (A → B et B → A, comme le font rgexf ou NetworkX) devient un seul lien. L'import signale le nombre de liens ainsi fusionnés. Deux arêtes de libellés différents restent distinctes.

Les positions Gephi sont dans ses propres unités, souvent serrées par rapport à la taille des éléments. Le layout est agrandi (jamais réduit) pour que les éléments voisins ne se chevauchent pas ; ses proportions sont conservées. Même règle pour Gephi Lite.

#### Palettes de couleurs

Les couleurs des attributs de partition Gephi sont importées automatiquement comme palette visuelle.

---

### Gephi Lite JSON

**Format JSON** exporté depuis Gephi Lite.

Structure attendue : objet avec `nodes` et `edges`, possédant des `attributes` et `viz` (position, couleur, taille).

---

### GML

**Format texte** (.gml) écrit par Gephi, yEd, Cytoscape, NetworkX et igraph.

#### Données importées

| Donnée GML | Propriété ZeroNeurone |
|------------|----------------------|
| `label` (ou `LabelGraphics` › `text` pour yEd) | Label de l'élément |
| `graphics` › `x`, `y` | Position (centre du nœud) |
| `graphics` › `w`, `h` | Taille proportionnelle |
| `graphics` › `fill`, `outline` | Couleur et bordure |
| `graphics` › `type` | Forme (ellipse, rectangle, losange, hexagone) |
| `notes`, `tags` (séparés par ;), `confidence` | Notes, tags, confiance |
| Autres clés simples (`weight`, `age`…) | Propriétés |
| `source`, `target` | Extrémités du lien |
| `graphics` › `fill`, `width` sur arête | Couleur et épaisseur du lien |
| `targetArrow`, `sourceArrow` | Direction du lien |
| `directed` | Direction par défaut, si l'arête n'indique pas ses flèches |

Les nœuds sans position sont disposés en grille. L'identifiant GML de chaque nœud est conservé dans la propriété `gml_id`. Pour un fichier exporté par Gephi (`Creator "Gephi"`), l'axe Y est inversé comme pour le GEXF.

---

### DOT (Graphviz)

**Format texte** de Graphviz (`.dot`, `.gv`), aussi écrit par NetworkX, Gephi, `terraform graph` et de nombreux outils d'analyse.

Trois façons d'importer :
- **Coller sur le canvas** (Ctrl+V) : un texte commençant par `graph`, `digraph` ou `strict digraph` suivi d'une accolade est reconnu automatiquement
- **Clic droit sur le canvas → Coller**
- **Importer** → fichier `.dot` ou `.gv` (nouveau dossier, ou dossier ouvert avec placement sur le canvas)

#### Données importées

| Donnée DOT | Propriété ZeroNeurone |
|------------|----------------------|
| `label` (sinon l'identifiant du nœud) | Label de l'élément |
| Libellé HTML `<...>` ou `record` | Texte seul, sans la mise en forme |
| `shape` | Forme (ellipse → cercle, box → rectangle, diamond → losange, hexagon/octagon → hexagone, square → carré) |
| `fillcolor`, `color` (noms X11, `#rrggbb`, HSV) | Couleur et bordure |
| `style=dashed` / `dotted` | Bordure en tirets ou en pointillés |
| `tooltip` (ou `notes`), `tags` (séparés par ;), `confidence`, `source` | Notes, tags, confiance, source |
| Sous-graphe `cluster…` | Tag : son `label`, sinon son nom sans `cluster_` |
| `pos` (sortie d'un rendu Graphviz) | Position, si tous les nœuds en ont une |
| Autres attributs (`weight`, `path`…) | Propriétés, valeurs telles qu'écrites |
| `label`, `color`, `penwidth`, `style` sur un lien | Libellé, couleur, épaisseur, tirets ou pointillés |
| `dir`, `arrowhead`, `arrowtail` | Direction du lien (`digraph` : flèche par défaut) |

Les valeurs par défaut `node [...]` et `edge [...]` s'appliquent comme dans Graphviz, y compris dans les sous-graphes. Une chaîne `a -> b -> c` donne deux liens, `a -> {b c}` un lien vers chacun. Dans un graphe `strict`, les liens en double sont fusionnés.

Sans positions, le graphe est disposé automatiquement dans le sens de `rankdir` (de haut en bas par défaut). L'identifiant DOT de chaque nœud est conservé dans la propriété `dot_id`.

Ne sont pas importés : les ports (`a:nord`, le lien part de l'élément), les liens invisibles (`style=invis`, aides de mise en page) et les liens d'un élément vers lui-même ; l'import signale combien de liens ont été ignorés. Seuls les libellés et les notes interprètent les codes Graphviz (`\n` pour un retour à la ligne) : un chemin comme `C:\Users\...` garde ses antislashs dans les propriétés.

---

### ANX (i2 Analyst's Notebook)

**Format XML** exporté depuis i2 Analyst's Notebook (.anx).

#### Données importées (Entités)

| Donnée ANX | Propriété ZeroNeurone |
|------------|----------------------|
| Label / Identity | Label de l'élément |
| Description | Notes |
| Position (X, Y) | Position sur le canvas |
| EntityType.Name | Tag (+ ancêtres via hiérarchie de types) |
| EntityType.Colour (COLORREF) | Couleur |
| IconStyle.Enlargement | Taille (small/medium/large) |
| EntityType.IconFile | Icone Lucide |
| DatabaseProperty[] | Propriétés typées |
| Attribute[] | Propriétés typées |
| GradeOneIndex (1-5) | Confiance (20-100) |
| Card.DateTime | Date + Événement |
| Card.SourceType + SourceReference | Source |
| Card.Text | Notes (complément) |
| Cards multiples | Événements |

#### Données importées (Liens)

| Donnée ANX | Propriété ZeroNeurone |
|------------|----------------------|
| Label | Label du lien |
| ArrowStyle | Direction (forward/backward/both/none) |
| LineWidth | Épaisseur |
| LineColour / LinkType.Colour | Couleur |
| Strength → DotStyle | Style (solid/dashed/dotted) |
| LinkType.Name | Tag |
| Strength.Name | Tag |
| DatabaseProperty[] | Propriétés |
| Card.DateTime | Date |

#### Hiérarchie de types

La hiérarchie `lcx:LibraryCatalogue` est analysée : les types ancêtres non-abstraits sont ajoutés comme tags supplémentaires (ex. Person → Legal Entity).

#### Auto-détection

Les fichiers `.xml` contenant du format ANX sont détectés automatiquement.

---

### ANB (i2 Analyst's Notebook - binaire)

**Format binaire propriétaire** i2 Analyst's Notebook (.anb), lu directement : inutile d'exporter en ANX depuis i2.

#### Données importées (Éléments)

| Donnée ANB | Propriété ZeroNeurone |
|------------|----------------------|
| Libellé | Label de l'élément (le texte affiché dans i2) |
| Identité | Propriété `i2_identity`, quand elle diffère du libellé (identité générée par i2, par exemple) |
| Description | Notes |
| Type de source, source | Source |
| Position | Position sur le canvas (échelle uniforme) |
| Type de la palette | Tag ; « Anonyme », type par défaut d'i2, devient « Générique » |
| Icône du type | Icône |
| Attributs | Propriétés (dates et dates-heures typées) |
| Date et heure | Événement sur la timeline : ponctuel, ou période si un attribut date-heure donne le début et un autre la fin |
| Bloc de texte | Annotation |

Icônes, cadres, cercles, événements et lignes de thème deviennent des éléments. La date d'une ligne de thème n'est pas reprise.

Les heures saisies dans i2 sont enregistrées en UTC et s'affichent dans le fuseau de l'ordinateur ; une date sans heure reste un jour calendaire.

#### Données importées (Liens)

| Donnée ANB | Propriété ZeroNeurone |
|------------|----------------------|
| Extrémités | Éléments reliés |
| Flèches | Direction |
| Libellé | Label du lien (vide pour un rattachement à une ligne de thème) |
| Date et heure | Période ponctuelle sur la timeline (fin = début) |
| Type de source, source | Source |
| Couleur de trait | Couleur (le noir, couleur par défaut d'i2, garde celle de ZN) |

#### Réserves

{{< hint warning >}}
L'import ANB repose sur une analyse du format binaire i2 (rétro-ingénierie). Testé sur des graphiques à palette personnalisée et sur un graphique récent utilisant la palette i2 complète.

- **Cartes** : les cartes de renseignement associées aux éléments ne sont pas importées.
- **Images** : les images incorporées ne sont pas importées.
- **Icônes** : seules les icônes i2 courantes ont un équivalent ; les autres prennent l'icône par défaut.
- Si la structure du fichier diffère de celle attendue, l'import le signale par un avertissement plutôt que de produire des liens faux.
{{< /hint >}}

---

### Excalidraw

**Format de dessin** Excalidraw (.excalidraw ou JSON).

Les éléments Excalidraw sont convertis en éléments ZeroNeurone :
- Rectangles, ellipses, diamants → Éléments avec forme correspondante
- Flèches → Liens entre éléments
- Texte → Label de l'élément le plus proche

#### Exemple

```json
{
  "type": "excalidraw",
  "version": 2,
  "elements": [
    {
      "type": "rectangle",
      "x": 100,
      "y": 100,
      "width": 200,
      "height": 100
    }
  ]
}
```

---

### draw.io (diagrams.net)

**Diagrammes draw.io** : fichier `.drawio`, ou `.xml` exporté par draw.io (compressé ou non). Toutes les pages sont importées, placées les unes sous les autres.

- Formes → éléments (ellipse → cercle, losange, hexagone, sinon rectangle), avec position, taille et couleurs
- Connecteurs reliés à deux formes → liens, avec libellé, couleur, épaisseur et pointillés ; sans pointe de flèche → lien non orienté
- Données personnalisées (*Modifier les données*) → propriétés ; le lien de la forme → propriété `url`
- Images intégrées → pièces jointes
- Texte libre → élément sans fond ni bordure

Les connecteurs non reliés et les groupes vides sont ignorés.

{{< hint info >}}
**Visio** : ouvrez le fichier `.vsdx` dans draw.io, enregistrez-le en `.drawio`, puis importez-le.
{{< /hint >}}

---

### Mermaid

**Diagrammes Mermaid** de type `flowchart` ou `graph`, dans n'importe quel sens (`TD`, `LR`…) : texte collé, fichier `.mmd` / `.mermaid`, ou fichier Markdown `.md` contenant un bloc ` ```mermaid `.

Pratique pour structurer des notes avec un assistant IA : demandez-lui « un graphe Mermaid des personnes, sociétés et relations de ce texte », puis collez le résultat dans ZeroNeurone.

Trois façons d'importer :
- **Coller sur le canvas** (Ctrl+V) : le texte Mermaid est reconnu automatiquement, y compris entouré d'un bloc ` ```mermaid ` et de texte explicatif
- **Clic droit sur le canvas → Coller**
- **Importer** → fichier `.mmd`, `.mermaid` ou `.md` (dans un Markdown, le premier bloc ` ```mermaid ` de type flowchart est utilisé)

Le diagramme est ensuite positionné en **mode placement**, sans toucher au contenu existant. La mise en page suit le sens du diagramme (`TD`, `LR`…).

| Mermaid | ZeroNeurone |
|---------|-------------|
| `A[texte]`, `A(texte)`, `A([texte])`, `A[[texte]]` | Élément rectangle |
| `A((texte))` | Élément cercle |
| `A{texte}` | Élément losange |
| `A{{texte}}` | Élément hexagone |
| `A --> B`, `A ==> B` (épais) | Lien orienté |
| `A --- B` | Lien non orienté |
| `A -.-> B` | Lien en pointillés |
| `A <--> B` | Lien bidirectionnel |
| `A -->\|libellé\| B`, `A -- libellé --> B` | Libellé du lien |
| `subgraph Titre … end` | Tag « Titre » sur les éléments du sous-graphe |
| `classDef`, `class`, `:::`, `style` (`fill`, `stroke`) | Couleur de fond et de bordure |

#### Exemple

```
flowchart LR
  A((Alice Martin)) -->|dirige| B[Société Alpha]
  B -.->|soupçonnée| C{Paris}
  subgraph Famille
    A --- D((Bob Martin))
  end
```

{{< hint info >}}
**Limites** : seuls `flowchart` et `graph` sont pris en charge (pas `sequenceDiagram`, `erDiagram`, `mindmap`…). Les lignes non reconnues sont ignorées et comptées dans un avertissement. Les positions ne sont pas lues : Mermaid n'en contient pas.
{{< /hint >}}

{{< hint info >}}
**Dans l'autre sens** : sélectionnez plusieurs éléments, puis clic droit → **Copier en → Mermaid** pour obtenir un bloc à coller dans un wiki, Obsidian, GitHub ou un rapport Markdown.
{{< /hint >}}

---

### GeoJSON

Fichier `.geojson` (ou `.json`) de type `FeatureCollection`, par exemple exporté de QGIS ou d'un portail de données publiques. Chaque entité devient un élément placé sur la [carte]({{< relref "map-view" >}}).

#### Géométries

| Géométrie | Import |
|-----------|--------|
| `Point` | Élément avec position |
| `MultiPoint` | Premier point conservé |
| `Polygon` | Élément avec zone (contour extérieur, trous ignorés) |
| `MultiPolygon` | Plus grande partie conservée (un avertissement récapitulatif l'indique) |
| `LineString` | Ignorée |

#### Libellé et propriétés

Avant l'import, depuis l'accueil comme depuis le dossier, une étape d'options permet de :

- choisir la **propriété qui sert de libellé** (seules les propriétés renseignées sont proposées, avec un exemple de valeur) ;
- cocher les **propriétés à importer** (**Tout** / **Aucune**) : une propriété décochée est ignorée ;
- choisir un **Tag** : un tag existant ou un nouveau nom. Une famille de tags existante donne son apparence (couleur, forme, icône), sauf si le fichier fixe une couleur ou une forme ; un nouveau nom crée la famille de tags. Vide : aucun tag.

Une entité sans valeur pour le libellé choisi prend un nom usuel (`name`, `nom`…), sinon « Feature N » selon sa position dans le fichier.

#### Projections

Le GeoJSON standard est en **WGS 84** (longitude/latitude en degrés).

- Un fichier en **Lambert 93** (`EPSG:2154`, fréquent dans les données publiques françaises) qui déclare sa projection dans `crs` est **converti automatiquement**.
- Les autres projections sont refusées avec un message : reprojetez d'abord le fichier en `EPSG:4326`, par exemple avec QGIS (*Exporter* → SCR EPSG:4326) ou `ogr2ogr -t_srs EPSG:4326 sortie.geojson entree.geojson`.
- Une entité aux coordonnées hors limites est ignorée, avec un avertissement.

---

### OSINT Industries

**Format JSON** exporté depuis OSINT Industries.

Structure attendue : tableau d'objets avec `module`, `query`, `status`.

```json
[
  {
    "module": "email",
    "query": "john@example.com",
    "status": "found",
    "data": { ... }
  }
]
```

---

### Graph Palette (OI)

**Format JSON** exporté depuis Graph Palette / OSINT Industries Palette.

Deux structures sont reconnues :

- **Format actuel** (`schemaVersion: 2`) : `nodes` portant chacun une `entity` typée, et `edges`. Les recherches de départ et les résultats deviennent des éléments à leur position, les champs des résultats des propriétés typées, les dates OI (création de compte, avis Google Maps…) des événements datés et géolocalisés, les images intégrées des pièces jointes.
- **Ancien format** : `nodes` contenant des types `textNode`, `moduleNode`, `imageNode`.

```json
{
  "nodes": [
    {
      "type": "textNode",
      "data": { "label": "John Doe" },
      "position": { "x": 100, "y": 200 }
    }
  ]
}
```

---

### PredicaGraph

**Format JSON** exporté depuis PredicaGraph.

Structure attendue : objet avec `nodes` et `edges`, où les noeuds ont un `data.type` (person, location, social-*, etc.).

```json
{
  "nodes": [
    {
      "id": "1",
      "data": { "type": "person", "label": "John Doe" },
      "position": { "x": 100, "y": 200 }
    }
  ],
  "edges": [
    { "source": "1", "target": "2", "label": "knows" }
  ]
}
```

Les photos de profil distantes (`pfp_image`) ne sont pas téléchargées : leur adresse est conservée dans la propriété lien `image_url`.

---

### OSINTracker

**Format propriétaire** OSINTracker (.osintracker).

L'import préserve :
- Éléments avec positions et propriétés
- Liens entre éléments
- Images intégrées (base64 → fichiers joints)
- Métadonnées du dossier

---

### STIX 2.1

**Format cyber threat intelligence** standard.


#### Objets supportés

| Type STIX | Élément ZeroNeurone |
|-----------|---------------------|
| identity | Élément (personne, org) |
| threat-actor | Élément |
| malware | Élément |
| tool | Élément |
| indicator | Élément |
| attack-pattern | Élément |
| campaign | Élément |
| intrusion-set | Élément |
| relationship | Lien |

#### Exemple STIX

```json
{
  "type": "bundle",
  "id": "bundle--...",
  "objects": [
    {
      "type": "threat-actor",
      "id": "threat-actor--...",
      "name": "APT28",
      "description": "..."
    }
  ]
}
```

---

### GEDCOM (Généalogie)

**Format standard** pour l'échange de données généalogiques.

Versions supportées : **GEDCOM 5.5.1** et **GEDCOM 7.0** (.ged)

#### Éléments convertis

| Enregistrement GEDCOM | Élément ZeroNeurone |
|-----------------------|---------------------|
| INDI (Individu) | Élément avec tag "Personne" |
| FAM (Famille) | Liens entre personnes |

#### Données importées

| Donnée GEDCOM | Propriété ZeroNeurone |
|---------------|----------------------|
| NAME | Label de l'élément |
| BIRT (naissance) | Événement avec date et lieu |
| DEAT (décès) | Événement avec date et lieu |
| RESI (résidence) | Événement avec date et lieu |
| OCCU (profession) | Propriété "Profession" |
| NICK (surnom) | Propriété "Surnom" |
| TITL (titre) | Propriété "Titre" |
| SEX | Propriété "Sexe" |
| NOTE | Notes de l'élément |

#### Liens familiaux

| Relation | Type de lien |
|----------|--------------|
| Mariage (MARR) | Lien "Mariage" entre époux |
| Parent-Enfant (CHIL) | Liens "Père" et "Mère" |

#### Géolocalisation

Les coordonnées GPS (tag MAP dans les lieux) sont importées dans les événements, permettant l'affichage sur la carte.

#### Disposition

Après import, les éléments sont automatiquement disposés en arbre généalogique avec les générations organisées verticalement.

---

### GeneWeb

**Format texte** utilisé par le logiciel GeneWeb (.gw).

#### Structure du fichier

```
fam Dupont Jean + Martin Marie
  beg
    - h Dupont Pierre
    - f Dupont Marie
  end
```

#### Données importées

| Tag GeneWeb | Propriété ZeroNeurone |
|-------------|----------------------|
| Prénom Nom | Label de l'élément |
| Dates (naissance/décès) | Événements |
| Profession | Propriété "Profession" |
| Notes | Notes de l'élément |

#### Liens familiaux

- Couples identifiés par `+`
- Enfants listés entre `beg` et `end`
- Préfixe `h` = homme, `f` = femme

### FEC (Fichier des Écritures Comptables)

**Format normalisé DGFiP** (art. A47 A-1 du LPF) produit par tout logiciel comptable français. Fichier `.txt` ou `.fec`, colonnes séparées par pipe ou tabulation, détecté par son en-tête `JournalCode`.

L'import ne reproduit pas la comptabilité : il construit un **graphe de flux agrégé orienté enquête** (due diligence, analyse financière) — qui est payé, par où passe l'argent, sur quelle période.

#### Modèle produit

| Donnée FEC | Résultat dans ZeroNeurone |
|------------|---------------------------|
| Comptes auxiliaires (CompAuxNum) | Un élément par tiers, taggé **Client** (41x), **Fournisseur** (40x) ou **Tiers** |
| Comptes généraux sans auxiliaire | Un élément par racine PCG à 3 chiffres, taggé **Banque** (51x), **Charge** (classe 6), **Produit** (classe 7)… |
| Écritures équilibrées | Des **liens de flux** agrégés par paire de comptes : montant cumulé, nombre d'écritures, journaux, période (visible en chronologie) |

Les montants sont répartis au prorata au sein de chaque écriture. **Convention de sens : les flux vont du compte crédité vers le compte débité** (le sens de la valeur : Banque → Fournisseur = paiement). L'épaisseur du lien reflète le montant cumulé (échelle logarithmique).

#### Écran d'options

Avant l'import, un écran présente le résumé du fichier (lignes, écritures, tiers, période) et permet d'ajuster avec un **aperçu instantané** du nombre d'éléments et de liens :

- **Plafond de tiers (top N)** — garde les N tiers aux plus gros flux cumulés (défaut 200)
- **Montant minimal par lien** — pré-calculé automatiquement depuis la distribution des montants pour viser un graphe d'environ 300 liens
- **Familles à inclure** — clients, fournisseurs, banques, charges, produits…
- **Période** — bornes de dates pré-remplies
- **Flux entre comptes généraux** — décochés par défaut (TVA, OD, paie… maillent le graphe sans nommer personne)

Chaque élément porte ses totaux débit/crédit, ses comptes de rattachement et ses modes de règlement en propriétés — exploitables ensuite dans les filtres, requêtes et la matrice.

---

## Importer dans le dossier courant

Depuis un dossier ouvert, le bouton **Importer** dans la barre d'outils permet d'ajouter des données directement dans le dossier en cours.

**Tous les formats** listés ci-dessus sont acceptés (ZIP, CSV, JSON, GraphML, GEXF, GML, ANX, Excalidraw, Mermaid, OSINT Industries, OSINTracker, STIX, GEDCOM, GeneWeb, FEC).

Depuis la page d'accueil, importer un fichier dans un **dossier existant** ouvre ce dossier et y lance l'import : étape d'options (GeoJSON, FEC), puis placement sur le canvas.

Les commentaires du dossier sont conservés lors d'un import dans ce dossier.

Pendant l'import, la fenêtre d'import affiche **Éléments : N · liens : M**, quel que soit le format.

### Mode placement

Après sélection du fichier, un **mode placement** s'active :

1. Un rectangle en pointillés suit le curseur, montrant la zone estimée d'import avec le nombre d'éléments
2. **Cliquez sur le canvas** pour choisir l'emplacement des éléments importés
3. Appuyez sur **Echap** pour annuler

Les éléments sont positionnés avec le coin supérieur gauche à l'endroit du clic. Pendant l'écriture, la barre du haut affiche **Import en cours…** avec le décompte.

{{< hint info >}}
Le mode placement est particulièrement utile quand le dossier contient déjà des éléments, pour éviter les superpositions.
{{< /hint >}}

---

## Options d'import

### Mode d'import

| Mode | Comportement |
|------|--------------|
| **Nouveau dossier** | Crée un dossier séparé |
| **Fusionner** | Ajoute au dossier courant avec positionnement |

### Gestion des doublons

| Option | Comportement |
|--------|--------------|
| **Ignorer** | Ne pas importer si existe déjà |
| **Remplacer** | Écraser l'existant |
| **Dupliquer** | Créer un nouvel élément |


---

## Résolution des liens

Pour les imports CSV/JSON, les liens référencent les éléments par :

1. **ID** (si fourni) : Correspondance exacte
2. **Label** : Recherche par nom (premier trouvé)

{{< hint warning >}}
Si le label source/cible n'est pas trouvé, le lien n'est pas créé.
{{< /hint >}}

---

## Validation

Avant import, ZeroNeurone valide :

- ✅ Format du fichier
- ✅ Colonnes/champs requis
- ✅ Types de données
- ✅ Références des liens

Les erreurs sont affichées avec leur ligne/champ.


---

**Voir aussi** : [Exporter]({{< relref "export" >}})
