---
title: "Tags et propriétés"
weight: 2
---

# Tags et propriétés

Enrichissez vos éléments et liens avec des **tags** pour la catégorisation et des **propriétés** pour les données structurées.

## Tags

Les tags sont des étiquettes libres pour catégoriser vos éléments et liens.

### Ajouter des tags

1. Sélectionnez un élément ou lien
2. Dans le panneau de détail, section **Tags**
3. Tapez un nouveau tag ou sélectionnez un existant


### Tags suggérés

ZeroNeurone suggère les tags déjà utilisés dans l'enquête pour maintenir la cohérence.

### Filtrer par tags

Utilisez le panneau **Filtres** pour afficher uniquement les éléments avec certains tags.


### Affichage des tags sur le canvas

Dans le panneau **Vues**, configurez l'affichage des tags :

| Option | Description |
|--------|-------------|
| **Aucun** | Tags masqués |
| **Premier** | Affiche seulement le premier tag |
| **Tous** | Affiche tous les tags |

---

## Propriétés personnalisées

Les propriétés permettent d'ajouter des données structurées à vos éléments et liens.

### Types de propriétés

| Type | Utilisation |
|------|-------------|
| **Texte** | Chaîne libre |
| **Nombre** | Valeur numérique |
| **Date** | Date avec sélecteur |
| **Booléen** | Oui/Non |
| **URL** | Lien cliquable |
| **Email** | Adresse email |
| **Téléphone** | Numéro de téléphone |

### Ajouter une propriété

1. Sélectionnez un élément
2. Section **Propriétés** dans le panneau de détail
3. Cliquez **+ Ajouter une propriété**
4. Choisissez le type et entrez la valeur


### Propriétés prédéfinies

Créez des modèles de propriétés pour accélérer la saisie :

1. Menu **⋯** → **Paramètres** → **Propriétés**
2. Définissez vos propriétés avec nom, type et valeurs par défaut


### Afficher les propriétés sur le canvas

1. Panneau **Vues** → **Affichage des propriétés**
2. Cochez les propriétés à afficher comme badges


### Extraire une propriete en element

Transformez une propriete en un element autonome sur le canvas :

1. Survolez la propriete dans le panneau de detail
2. Cliquez sur l'icone **↗** (Extraire en element)
3. Un nouvel element est cree avec le nom de la propriete, relie a l'element source

L'operation est reversible avec **Ctrl+Z**.

---

## Confiance et source

### Niveau de confiance

Chaque élément et lien peut avoir un niveau de confiance (0-100%).


| Niveau | Signification suggérée |
|--------|------------------------|
| 0-25% | Rumeur, non vérifié |
| 25-50% | Source unique, à confirmer |
| 50-75% | Sources multiples |
| 75-100% | Vérifié, documenté |

### Indicateur visuel

Activez l'indicateur de confiance dans **Vues** pour voir le niveau directement sur le canvas (bordure colorée).


### Source

Documentez l'origine de chaque information :

- Document de référence
- Témoignage
- Base de données
- Observation directe

---

## Dates et périodes

### Date simple

Pour les éléments : une date unique (événement ponctuel).

### Période (liens)

Pour les liens : date de début et date de fin optionnelle.


Ces dates sont utilisées par la **Timeline** pour la visualisation chronologique.

---

**Voir aussi** : [Filtres et vues]({{< relref "filters-views" >}})
