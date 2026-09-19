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
| date / date_fin | Date de l'événement et fin éventuelle |
| ... | Propriétés personnalisées |

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

Le format binaire natif `.anb` n'est pas proposé à l'export : sa structure n'est pas documentée publiquement, et ZeroNeurone ne sait le lire que partiellement, par reconnaissance de motifs.

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

## Automatisation

### Export en ligne de commande

Non disponible actuellement (application web uniquement).

### API

Non disponible actuellement.

---

**Voir aussi** : [Importer]({{< relref "import" >}})
