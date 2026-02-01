---
title: "Importer"
weight: 2
---

# Importer des données

Intégrez des données externes ou restaurez une enquête sauvegardée.


## Ouvrir l'import

Menu **⋯** → **Importer**

---

## Formats supportés

### ZIP (ZeroNeurone)

**Import complet** d'une enquête exportée.

| Action | Résultat |
|--------|----------|
| **Créer une nouvelle enquête** | Crée une copie indépendante |
| **Fusionner** | Ajoute les éléments à l'enquête actuelle |


### Contenu attendu

```
enquete.zip
├── investigation.json    # Requis
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
    "name": "Nom de l'enquête",
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

### CSV

**Import tabulaire** d'éléments et liens.


#### Colonnes requises

| Colonne | Obligatoire | Description |
|---------|-------------|-------------|
| type | ✅ | "element" ou "lien" |
| label | ✅ | Nom de l'élément/lien |
| de | Pour liens | Label de l'élément source |
| vers | Pour liens | Label de l'élément cible |

#### Colonnes optionnelles

| Colonne | Description |
|---------|-------------|
| notes | Notes texte |
| tags | Tags séparés par ; |
| confiance | 0-100 |
| source | Source de l'information |
| date | Date (YYYY-MM-DD) |
| date_debut | Début de période (liens) |
| date_fin | Fin de période (liens) |
| latitude | Coordonnée lat |
| longitude | Coordonnée lng |
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

Structure attendue : objet avec `nodes` contenant des types `textNode`, `moduleNode`, `imageNode`.

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

---

### OSINTracker

**Format propriétaire** OSINTracker (.osintracker).

L'import préserve :
- Éléments avec positions et propriétés
- Liens entre éléments
- Images intégrées (base64 → fichiers joints)
- Métadonnées de l'enquête

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

---

## Options d'import

### Mode d'import

| Mode | Comportement |
|------|--------------|
| **Nouvelle enquête** | Crée une enquête séparée |
| **Fusionner** | Ajoute à l'enquête courante |

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
