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
