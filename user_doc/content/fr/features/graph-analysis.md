---
title: "Analyse de graphe"
weight: 4
---

# Analyse de graphe

ZeroNeurone utilise des algorithmes de théorie des graphes pour révéler des patterns cachés dans vos données.


## Panneau Insights

Accédez aux analyses via le panneau **Insights** (icône graphique à gauche).

### Actualiser l'analyse

Cliquez sur **Actualiser** pour recalculer les métriques après des modifications.

---

## Clusters (Communautés)

L'algorithme de Louvain détecte automatiquement les **communautés** : groupes d'éléments plus connectés entre eux qu'avec le reste du graphe.


### Utilisation

| Action | Résultat |
|--------|----------|
| **Voir** | Liste des clusters avec leurs membres |
| **Clic** | Sélectionne tous les membres du cluster |
| **Colorer** | Applique une couleur distincte à chaque cluster |

### Interprétation

- Un cluster peut représenter une organisation, un réseau, un groupe d'intérêt
- Les éléments **entre** clusters sont souvent des **ponts** importants

---

## Centralité

La **centralité** mesure l'importance relative de chaque élément dans le réseau.

### Centralité de degré

Nombre de connexions d'un élément.

| Degré | Interprétation |
|-------|----------------|
| Élevé | Hub, connecteur principal |
| Faible | Périphérique, peu connecté |


### Centralité d'intermédiarité (Betweenness)

Fréquence de passage sur les plus courts chemins.

| Betweenness | Interprétation |
|-------------|----------------|
| Élevé | Intermédiaire critique, gatekeeper |
| Faible | Pas sur les chemins principaux |


### Affichage

- **Liste triée** des éléments par centralité
- **Clic** pour sélectionner et centrer sur l'élément
- **Dimensionnement** : option pour ajuster la taille selon la centralité

---

## Ponts (Bridges)

Les **ponts** sont les éléments qui connectent des clusters autrement séparés.


### Importance

Supprimer un pont fragmenterait le réseau. Ces éléments sont souvent :

- Intermédiaires clés
- Points de vulnérabilité
- Personnes multi-casquettes

---

## Éléments isolés

Liste des éléments **sans aucune connexion**.


### Actions

- Identifier des données manquantes (liens à créer)
- Nettoyer des éléments orphelins
- Filtrer pour se concentrer sur le réseau connecté

---

## Chemins

Trouvez le **plus court chemin** entre deux éléments.


### Utilisation

1. Sélectionnez deux éléments (Ctrl+clic)
2. **Insights** → **Chemin**
3. Le chemin est surligné sur le canvas

### Interprétation

- **Chemin court** : éléments proches dans le réseau
- **Chemin long** : éléments éloignés, peu de liens directs
- **Pas de chemin** : éléments dans des composantes séparées

---

## Métriques globales

| Métrique | Description |
|----------|-------------|
| **Nœuds** | Nombre total d'éléments |
| **Liens** | Nombre total de connexions |
| **Densité** | Ratio liens existants / liens possibles |
| **Composantes** | Nombre de sous-graphes déconnectés |
| **Diamètre** | Plus long des plus courts chemins |


---

## Layouts automatiques

Réarrangez automatiquement les éléments selon différents algorithmes via le bouton **Arranger** dans la barre d'outils.

### Types de layout

| Layout | Description | Utilisation |
|--------|-------------|-------------|
| **Force (clusters)** | Algorithme physique qui regroupe les éléments connectés | Visualiser les communautés |
| **Hiérarchie** | Organisation par niveaux (arbres, organigrammes) | Structures hiérarchiques |
| **Circulaire** | Disposition en cercle | Vue d'ensemble équilibrée |
| **Grille** | Alignement régulier | Organisation ordonnée |
| **Dispersion** | Répartition aléatoire | Redistribuer les éléments |

### Conseils

- Utilisez **Ctrl+Z** pour annuler un layout
- Le layout **Hiérarchie** détecte automatiquement les racines (éléments sans liens entrants)
- Le layout **Force** s'adapte à la taille du graphe (optimisé pour les grands réseaux)

---

**Voir aussi** : [Vue carte]({{< relref "map-view" >}})
