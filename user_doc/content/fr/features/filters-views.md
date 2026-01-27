---
title: "Filtres et vues"
weight: 3
---

# Filtres et vues

Maîtrisez la complexité de vos données avec les **filtres** et sauvegardez vos configurations avec les **vues**.

## Filtres

Le panneau **Filtres** permet d'afficher ou masquer des éléments selon différents critères.


### Types de filtres

| Filtre | Description |
|--------|-------------|
| **Recherche texte** | Filtre par label ou notes |
| **Tags** | Inclure/exclure par tags |
| **Confiance** | Seuil minimum de confiance |
| **Propriétés** | Éléments ayant une propriété spécifique |
| **Éléments masqués** | Gérer les éléments cachés manuellement |
| **Isolés** | Éléments sans connexion |

### Combiner les filtres

Les filtres se cumulent (ET logique) : un élément doit satisfaire **tous** les critères actifs pour être affiché.

### Masquer manuellement

Clic-droit sur un élément → **Masquer** pour le retirer temporairement du canvas sans le supprimer.


Retrouvez les éléments masqués dans **Filtres** → **Éléments masqués**.

---

## Vues sauvegardées

Une **vue** capture l'état actuel de votre espace de travail :

- Filtres actifs
- Position du viewport (zoom, pan)
- Éléments masqués
- (Optionnel) Positions des éléments

### Sauvegarder une vue

1. Configurez vos filtres et viewport
2. Panneau **Vues** → **Sauvegarder la vue**
3. Donnez un nom à la vue


### Options de sauvegarde

| Option | Description |
|--------|-------------|
| **Inclure les positions** | Sauvegarde aussi la position de chaque élément |

### Charger une vue

Cliquez sur une vue sauvegardée pour la charger instantanément.


### Cas d'usage

- **Vue "Acteurs principaux"** : Filtre sur les personnes, confiance > 70%
- **Vue "Timeline Q1"** : Éléments de janvier à mars
- **Vue "Présentation"** : Positions arrangées pour une réunion

---

## Mode Focus

Le mode **Focus** (touche **F**) isole un élément et son voisinage direct.


### Niveaux de voisinage

Configurez la profondeur du focus :

| Niveau | Affichage |
|--------|-----------|
| **1** | Élément + voisins directs |
| **2** | + voisins des voisins |
| **3** | Voisinage étendu |

### Sortir du mode Focus

- Touche **Échap**
- Clic sur **Sortir du focus** dans la barre d'outils

---

## Affichage du canvas

Le panneau **Vues** contrôle aussi l'affichage général :

### Options d'affichage

| Option | Description |
|--------|-------------|
| **Labels des liens** | Afficher/masquer les labels |
| **Indicateur confiance** | Bordure colorée selon confiance |
| **Tags** | Mode d'affichage des tags |
| **Propriétés badges** | Propriétés affichées sur les nœuds |


### Style des liens

| Option | Valeurs |
|--------|---------|
| **Ancrage** | Auto, centre, bords |
| **Courbure** | Droit, courbe, orthogonal |


---

**Voir aussi** : [Analyse de graphe]({{< relref "graph-analysis" >}})
