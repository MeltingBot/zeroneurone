---
title: "Exporter"
weight: 1
---

# Exporter une enquête

Sauvegardez et partagez vos enquêtes dans différents formats.


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
├── investigation.json    # Métadonnées complètes
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

**Tableur** avec éléments et liens dans un format tabulaire.

| Propriété | Valeur |
|-----------|--------|
| Extension | `.csv` |
| Contenu | Tableau unifié |
| Fichiers joints | ❌ Non inclus |
| Usage | Excel, LibreOffice, analyse externe |

Colonnes :

| Colonne | Description |
|---------|-------------|
| type | "element" ou "lien" |
| label | Nom |
| de / vers | Source/cible (liens) |
| notes | Notes |
| tags | Tags séparés par ; |
| confiance | 0-100 |
| ... | Propriétés personnalisées |


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
- **Modale infos** : Métadonnées de l'enquête et statistiques (nombre d'éléments, liens, groupes)
- **Thème clair/sombre** : Basculer entre les modes
- **Export Markdown** : Télécharger le rapport en `.md` (sans liens internes)
- **Pan & zoom** : Naviguer dans le graphe avec la molette et le glisser

{{< hint info >}}
Accessible depuis le panneau Rapport via l'icône globe.
{{< /hint >}}

---

## Nommage des fichiers

Les fichiers exportés suivent le format :

```
{nom_enquête}_{date}_{heure}.{extension}
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
