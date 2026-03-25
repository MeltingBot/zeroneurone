---
title: "Timeline"
weight: 6
---

# Timeline

Visualisez la dimension temporelle de vos données avec la vue chronologique.


## Activer la timeline

| Méthode | Action |
|---------|--------|
| Touche **4** | Mode timeline |
| Bouton vue | Clic sur l'icône timeline |

---

## Éléments sur la timeline

### Éléments avec date

Les éléments ayant une **date** apparaissent sur la timeline :

- **Point** : date unique
- Position horizontale = moment dans le temps


### Liens avec période

Les liens ayant une **période** (date début/fin) apparaissent comme des **barres** :

- Longueur = durée
- Position = période couverte


---

## Modes d'affichage

La timeline propose deux modes via le toggle dans la barre d'outils :

### Mode Dispersion (par défaut)

Chaque élément occupe sa propre ligne. Adapté pour une vue d'ensemble de la chronologie.

| Contrôle | Fonction |
|----------|----------|
| **Ancien/Récent** | Inverser l'ordre vertical |
| **Causalité** | Afficher les liens de proximité temporelle |

### Mode Couloirs (swimlanes)

Les éléments sont regroupés en **bandes horizontales** par critère. Permet une lecture analytique "qui fait quoi quand" et la comparaison entre catégories.

#### Critères de groupement

| Critère | Description |
|---------|-------------|
| **Tag** | Un couloir par tag (un élément avec plusieurs tags apparaît dans chaque couloir correspondant) |
| **Source** | Un couloir par source |
| **Propriété** | Un couloir par valeur distincte d'une propriété |

Seuls les critères ayant au moins 2 valeurs distinctes sont proposés.

#### Filtrage des tags

En groupement par tag, un sélecteur permet de choisir quels tags afficher :

- **Tous** : tous les tags visibles (par défaut)
- **Sélection** : cocher/décocher les tags individuellement
- **Aucun** : décocher "Tous" pour tout masquer

#### Réorganiser les couloirs

Chaque couloir a une **poignée de glissement** (icône ⠿) à gauche du label, visible au survol. Glissez-déposez pour réordonner les couloirs.

L'ordre personnalisé est conservé tant que vous ne changez pas de critère de groupement.

#### Replier les couloirs

Cliquez sur le **chevron** (▶/▼) à gauche du label pour replier/déplier un couloir. Un couloir replié affiche une barre fine avec le nom et le nombre d'éléments.

---

## Navigation

### Zoom temporel

| Action | Résultat |
|--------|----------|
| **Molette** | Zoom sur l'échelle de temps |
| **Ctrl+molette** | Zoom fin |

### Échelles de temps

Le zoom ajuste automatiquement l'échelle :

| Niveau | Affichage |
|--------|-----------|
| Années | Décennies, années |
| Mois | Années, mois |
| Semaines | Mois, semaines |
| Jours | Semaines, jours |


### Défilement

| Action | Résultat |
|--------|----------|
| **Glisser** | Déplacer dans le temps |
| **Clic axe** | Centrer sur cette date |

### Raccourcis de zoom

| Bouton | Résultat |
|--------|----------|
| **Auj.** | Centrer sur la date du jour |
| **Tout** | Ajuster le zoom pour voir tous les éléments |
| **Préréglages** | Siècle, Décennie, Année, Mois, Semaine, Jour, Heure |

---

## Interactions

### Sélection

| Action | Résultat |
|--------|----------|
| **Clic** | Sélectionne l'élément/lien |
| **Ctrl+clic** | Ajoute à la sélection |

La sélection est synchronisée avec le canvas : sélectionner sur la timeline sélectionne sur le canvas, et inversement.

---

## Barre de densité

Une barre heatmap sous l'axe temporel montre la concentration des événements d'un coup d'oeil.

### Affichage

Cliquez sur le bouton **Densité** dans la barre d'outils pour afficher ou masquer la barre.

### Lecture

| Visuel | Signification |
|--------|---------------|
| **Cellule foncée** | Forte concentration d'événements |
| **Cellule claire** | Peu d'événements |
| **Cellule vide** | Aucun événement sur cette période |

La taille des intervalles s'adapte automatiquement au niveau de zoom (7 jours, 14 jours, 1 mois, 3 mois ou 1 an).

### Interaction

**Cliquez** sur une cellule pour activer le filtre temporel sur cette période.

---

## Filtre temporel

Le filtre temporel permet de restreindre l'affichage à une période spécifique.

### Activer le filtre

Cliquez sur le bouton **Filtre** dans la barre d'outils pour afficher le slider de dates.

### Contrôles du filtre

| Élément | Fonction |
|---------|----------|
| **Curseurs** | Glissez pour définir début/fin de période |
| **Zone centrale** | Glissez pour déplacer toute la fenêtre |
| **Champs date** | Saisissez des dates précises |
| **Play/Pause** | Animation automatique dans le temps |
| **Avance/Recul** | Décalage manuel de 30 jours |
| **X** | Effacer le filtre |

### Animation temporelle

Le bouton **Play** anime la fenêtre de filtre à travers le temps :
- Conserve la durée de la fenêtre sélectionnée
- Avance d'un jour toutes les 100ms
- S'arrête automatiquement en fin de timeline

### Indicateur

Quand un filtre est actif, le compteur affiche "X / Y événements" pour indiquer combien d'éléments sont visibles sur le total.


---

## Cas d'usage

| Scénario | Utilisation |
|----------|-------------|
| **Chronologie du dossier** | Visualiser la séquence des événements |
| **Durée des relations** | Voir quand des liens existent |
| **Patterns temporels** | Identifier des périodes d'activité |
| **Analyse par acteur** | Couloirs par tag pour comparer l'activité de chaque catégorie |
| **Comparaison de sources** | Couloirs par source pour évaluer la couverture temporelle |
| **Présentation** | Raconter une histoire dans le temps |

---

## Export CSV

Cliquez sur l'icône de téléchargement dans la barre d'outils pour exporter les événements de la timeline en CSV. Le filtre temporel est respecté : seuls les événements visibles sont exportés.

---

**Voir aussi** : [Vue carte]({{< relref "map-view" >}}) | [Fichiers joints]({{< relref "attachments" >}})
