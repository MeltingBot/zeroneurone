---
title: "Exporter"
weight: 1
---

# Exporter un dossier

Sauvegardez et partagez vos dossiers dans différents formats.


## Ouvrir l'export

Menu **⋯** → **Exporter**

---

## Formats disponibles

### ZIP (Recommandé)

**Format complet** incluant métadonnées et fichiers joints.

| Propriété | Valeur |
|-----------|--------|
| Extension | `.zip` |
| Contenu | JSON + fichiers |
| Fichiers joints | ✅ Inclus |
| Usage | Sauvegarde, transfert complet |

Structure de l'archive :

```
enquete_2024-01-15.zip
├── dossier.json          # Métadonnées complètes
└── assets/               # Fichiers joints
    ├── a1b2c3.pdf
    ├── d4e5f6.png
    └── ...
```

{{< hint info >}}
**Recommandé** pour la sauvegarde et le transfert entre machines.
{{< /hint >}}

---

### JSON

**Métadonnées uniquement** sans les fichiers.

| Propriété | Valeur |
|-----------|--------|
| Extension | `.json` |
| Contenu | Métadonnées structurées |
| Fichiers joints | ❌ Non inclus |
| Usage | Intégration, backup léger |

Contenu :

```json
{
  "version": "1.5",
  "exportedAt": "2024-01-15T10:30:00Z",
  "investigation": { ... },
  "elements": [ ... ],
  "links": [ ... ]
}
```

---

### CSV

**Tableur** avec éléments, liens et événements dans un format tabulaire.

| Propriété | Valeur |
|-----------|--------|
| Extension | `.csv` |
| Contenu | Tableau unifié |
| Fichiers joints | ❌ Non inclus |
| Usage | Excel, LibreOffice, analyse externe |

Colonnes :

| Colonne | Description |
|---------|-------------|
| type | "element", "lien" ou "event" |
| label | Nom (libellé de l'événement pour "event") |
| de / vers | Source/cible (liens) ; pour "event", `de` = élément parent |
| notes | Notes / description |
| tags | Tags séparés par ; |
| confiance | 0-100 |
| cotation_echelle / cotation_source / cotation_info | Cotation Europol ou Amirauté (voir [évaluation]({{< relref "features/evaluation" >}})) |
| date / date_fin | Date de l'événement et fin éventuelle (événements) |
| date_debut / date_fin | Période (liens) |
| fuseau | Fuseau de la source ; les heures de la ligne sont écrites dans ce fuseau |
| ... | Propriétés personnalisées |

Formats de date : voir [Dates et fuseaux horaires]({{< relref "features/dates-timezones" >}}).

Les **événements** rattachés aux éléments sont exportés en lignes `type=event` : un aller-retour export → import reconstruit la chronologie à l'identique.


---

### GraphML

**Format graphe** pour outils d'analyse de réseaux.

| Propriété | Valeur |
|-----------|--------|
| Extension | `.graphml` |
| Contenu | XML graphe |
| Fichiers joints | ❌ Non inclus |
| Usage | Gephi, yEd, Cytoscape |


---

### GEXF

**Format natif Gephi** avec attributs visuels (positions, couleurs, tailles).

| Propriété | Valeur |
|-----------|--------|
| Extension | `.gexf` |
| Contenu | XML graphe (GEXF 1.3, namespace `viz`) |
| Fichiers joints | ❌ Non inclus |
| Usage | Gephi |

Le graphe s'ouvre dans Gephi avec la même disposition et les mêmes couleurs que sur le canvas. Positions préservées (axe Y adapté pour un rendu à l'endroit), couleurs converties en RGB, notes et tags en attributs de nœud, confiance en attribut d'arête. La direction des liens est conservée (`forward`/`backward`/bidirectionnel).

---

### ANX (i2 Analyst's Notebook)

**Format d'échange i2** pour transmettre un graphe à un analyste travaillant sous Analyst's Notebook.

| Propriété | Valeur |
|-----------|--------|
| Extension | `.anx` |
| Contenu | XML i2 (entités, liens, types, attributs) |
| Fichiers joints | ❌ Non inclus |
| Usage | i2 Analyst's Notebook |

Le fichier s'ouvre directement dans Analyst's Notebook, sans spécification d'import. Les positions du canvas, les couleurs, la direction et l'épaisseur des liens sont conservées. Le premier tag de chaque élément devient son type d'entité i2, les tags suivants deviennent des attributs, et les propriétés sont transmises avec leur type lorsque i2 possède un équivalent : les nombres, les dates et les booléens sont préservés, les autres types sont transmis en texte.

Certaines notions de ZeroNeurone n'ont pas d'équivalent dans i2 et ne sont pas transmises. Les groupes et les annotations ne sont pas exportés ; les éléments contenus dans un groupe sont placés à leur position réelle et conservent le nom du groupe dans un attribut. Une zone géographique est réduite à son point central, une plage de dates à deux attributs, et les formes, les médias joints et les tailles personnalisées sont perdus. Un lien dont une extrémité n'est pas exportée est omis, pour ne pas produire de référence sans cible.

Le niveau de confiance est transmis dans le grade 1 d'i2 (1 à 5). Dans un dossier en [modèle Europol ou Amirauté]({{< relref "features/evaluation" >}}), la fiabilité de la source est transmise dans le grade 1 et l'exactitude de l'information dans le grade 2, par position dans la grille (A = 1).

Le format binaire natif `.anb` n'est pas proposé à l'export : sa structure n'est pas documentée publiquement, et ZeroNeurone ne sait le lire que partiellement, par reconnaissance de motifs.

---

### Obsidian (coffre)

**Coffre Obsidian** : une fiche Markdown par élément, pour prolonger l'analyse dans Obsidian.

| Propriété | Valeur |
|-----------|--------|
| Extension | `.zip` |
| Contenu | Fiches `.md`, fichiers `.canvas`, rapport |
| Fichiers joints | ✅ Inclus |
| Usage | Obsidian (graphe, rétroliens, Dataview, Bases) |

Structure de l'archive :

```
enquete_2024-01-15_obsidian.zip
├── Enquête.md            # Index : description, canvas, rapport, fiches
├── Éléments/             # Une fiche par élément (et par groupe)
├── Canvas/               # Un fichier .canvas par onglet
├── Rapport/              # Le rapport, références converties en liens
└── attachments/          # Fichiers joints
```

Décompressez l'archive puis, dans Obsidian, choisissez **Ouvrir un dossier comme coffre**.

Chaque fiche porte en propriétés (frontmatter) les tags, la confiance, l'évaluation, la source, les dates, la position géographique (`location`, compatible avec le plugin Map View), le groupe parent et les propriétés de l'élément. Les notes de l'élément forment le corps de la fiche, suivies de ses événements et de ses fichiers joints.

Obsidian ne connaît pas les liens typés. Les relations sont donc écrites de trois façons :

- une section **Relations** dans chaque fiche, avec le libellé, le sens (→, ←, ↔), les dates, la confiance, la source et les notes du lien. Les relations apparaissent dans la vue graphe et dans les rétroliens ;
- une propriété par libellé de relation dans la fiche d'origine (`employé de: [[ACME]]`), interrogeable avec Dataview ou Bases. Une relation sans sens est écrite des deux côtés ;
- un fichier **Canvas** par onglet, qui reproduit la disposition du canvas avec les libellés, les couleurs et le sens des liens. Les groupes deviennent des groupes Canvas, les annotations des cartes de texte.

{{< hint warning >}}
Les fichiers `.canvas` désignent les fiches par leur chemin depuis la racine du coffre. Si vous copiez l'export dans un sous-dossier d'un coffre existant, les fiches et leurs liens fonctionnent, mais les canvas ne trouvent plus leurs fiches.
{{< /hint >}}

---

### GeoJSON

**Format géographique** pour outils SIG.

| Propriété | Valeur |
|-----------|--------|
| Extension | `.geojson` |
| Contenu | FeatureCollection |
| Fichiers joints | ❌ Non inclus |
| Usage | QGIS, ArcGIS, Leaflet, Mapbox |

Contenu :

- **Éléments géolocalisés** → Point
- **Liens entre éléments géolocalisés** → LineString

{{< hint warning >}}
Seuls les éléments avec coordonnées sont exportés.
{{< /hint >}}


---

### PNG (Image)

**Capture visuelle** du canvas.

| Propriété | Valeur |
|-----------|--------|
| Extension | `.png` |
| Contenu | Image bitmap |
| Résolutions | 1x, 2x, 3x, 4x |
| Usage | Rapport, présentation |


---

### SVG (Vectoriel)

**Image vectorielle** éditable.

| Propriété | Valeur |
|-----------|--------|
| Extension | `.svg` |
| Contenu | Graphique vectoriel |
| Usage | Inkscape, Illustrator, impression |

{{< hint info >}}
Format idéal pour l'impression haute qualité et l'édition graphique.
{{< /hint >}}

---

### HTML (Rapport interactif)

**Rapport interactif autonome** avec graphe embarqué.

| Propriété | Valeur |
|-----------|--------|
| Extension | `.html` |
| Contenu | Rapport + graphe SVG + JavaScript |
| Fichiers joints | ❌ Non inclus (miniatures uniquement) |
| Usage | Partage, présentation, consultation hors-ligne |

Fonctionnalités :
- **Navigation bidirectionnelle** : Cliquez sur les références dans le rapport pour zoomer sur le graphe, cliquez sur les nœuds pour défiler vers les références
- **Table des matières** : Sommaire repliable pour les longs rapports
- **Modale infos** : Métadonnées du dossier et statistiques (nombre d'éléments, liens, groupes)
- **Thème clair/sombre** : Basculer entre les modes
- **Export Markdown** : Télécharger le rapport en `.md` (sans liens internes)
- **Pan & zoom** : Naviguer dans le graphe avec la molette et le glisser
- **Recherche** (Ctrl+K) : Recherche par label et tags avec navigation clavier (flèches + Entrée)
- **Filtrage par tags** : Popover dans l'en-tête pour afficher/masquer les nœuds et liens par tag
- **Images embarquées** : Miniatures des fichiers joints affichées dans les formes SVG du graphe
- **Inversion du layout** : Permuter rapport et graphe gauche-droite (mémorisé dans localStorage)
- **Colonnes redimensionnables** : Poignée de glisser entre le panneau rapport et le graphe (15%-85%)

{{< hint info >}}
Accessible depuis le panneau Rapport via l'icône globe.
{{< /hint >}}

---

## Nommage des fichiers

Les fichiers exportés suivent le format :

```
{nom_dossier}_{date}_{heure}.{extension}
```

Exemple : `Affaire_Dupont_2024-01-15_10-30-00.zip`

---


**Voir aussi** : [Importer]({{< relref "import" >}})
