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
| **Confiance** | Seuil minimum de confiance (modèle ZeroNeurone) |
| **Cotation** | Codes source et information acceptés (modèles Europol et Amirauté) |
| **Propriétés** | Éléments ayant une propriété spécifique |
| **Éléments masqués** | Gérer les éléments cachés manuellement |
| **Isolés** | Éléments sans connexion |

### Propriétés date sur la timeline

Quand la timeline est affichée, la section **Propriétés date sur la timeline** liste les propriétés de type date et date-heure du dossier, avec le nombre d'éléments qui renseignent chacune. Décochez-en une (une date de naissance, par exemple) pour la retirer de la timeline. Les éléments restent visibles dans les autres vues ; les dates des événements et les périodes des liens ne sont pas concernées.

Un badge **\<clé\> hors timeline** apparaît dans les filtres actifs ; **Tout effacer** la rétablit.

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
- Propriétés date retirées de la timeline
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
| **Indicateur confiance / cotation** | Badge avec la confiance (`70%`) ou la cotation (`B2`) selon le [modèle d'évaluation]({{< relref "evaluation" >}}) |
| **Tags** | Mode d'affichage des tags |
| **Propriétés badges** | Propriétés affichées sur les nœuds |


### Style des liens

| Option | Valeurs |
|--------|---------|
| **Ancrage** | Auto, centre, bords |
| **Courbure** | Droit, courbe, orthogonal |


---

**Voir aussi** : [Analyse de graphe]({{< relref "graph-analysis" >}})
