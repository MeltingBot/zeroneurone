---
title: "Éléments et liens"
weight: 1
---

# Éléments et liens

Les **éléments** et **liens** sont les briques fondamentales de votre analyse dans ZeroNeurone.

## Éléments

Un élément représente n'importe quel concept : personne, lieu, organisation, objet, événement, document...

### Créer un élément

**Double-clic** sur le canvas pour créer un nouvel élément à cet emplacement.


### Propriétés d'un élément

| Propriété | Description |
|-----------|-------------|
| **Label** | Nom affiché sur le canvas |
| **Notes** | Description libre, texte long |
| **Tags** | Étiquettes pour catégoriser |
| **Confiance** | Niveau de certitude (0-100%) |
| **Source** | Origine de l'information |
| **Date** | Date associée (pour la timeline) |
| **Géolocalisation** | Coordonnées (pour la carte) |
| **Propriétés** | Champs personnalisés (clé/valeur) |

### Apparence visuelle

Personnalisez l'apparence de chaque élément :

| Option | Valeurs |
|--------|---------|
| **Couleur** | Palette de 12 couleurs |
| **Forme** | Cercle, carré, losange, hexagone |
| **Taille** | Petit, moyen, grand |


---

## Liens

Un lien représente une relation entre deux éléments. Les liens sont des **citoyens de première classe** : ils ont leurs propres métadonnées, pas seulement un trait entre deux points.

### Créer un lien

1. **Glisser** depuis un élément vers un autre élément
2. Le lien est créé avec un label par défaut


### Créer un élément lié

**Glisser** depuis un élément vers le vide pour créer simultanément un nouvel élément et le lien qui les relie.


### Propriétés d'un lien

| Propriété | Description |
|-----------|-------------|
| **Label** | Type de relation (ex: "connaît", "travaille pour") |
| **Notes** | Description détaillée |
| **Confiance** | Niveau de certitude |
| **Source** | Origine de l'information |
| **Période** | Date de début et fin (pour la timeline) |
| **Dirigé** | Flèche indiquant le sens |
| **Propriétés** | Champs personnalisés |

### Apparence des liens

| Option | Valeurs |
|--------|---------|
| **Couleur** | Palette de couleurs |
| **Style** | Continu, pointillé, tirets |
| **Épaisseur** | Fine, normale, épaisse |


---

## Sélection multiple

### Rectangle de sélection

Cliquez-glissez sur le fond du canvas pour dessiner un rectangle de sélection.

### Ajouter à la sélection

**Ctrl+clic** pour ajouter ou retirer un élément de la sélection.

### Opérations groupées

Avec plusieurs éléments sélectionnés :

- Appliquer des tags à tous
- Modifier la couleur/forme de tous
- Supprimer tous
- Déplacer en groupe


---

## Groupes

Organisez vos éléments en **groupes** visuels.

### Créer un groupe

1. Sélectionnez plusieurs éléments
2. Clic-droit → **Grouper**

Le groupe apparaît comme un cadre englobant ses membres.


### Manipuler un groupe

- **Clic sur le groupe** : sélectionne le groupe entier
- **Double-clic** : entre dans le groupe pour éditer les membres
- **Glisser un élément** dans/hors du groupe pour modifier l'appartenance

---

**Voir aussi** : [Tags et propriétés]({{< relref "tags-properties" >}})
