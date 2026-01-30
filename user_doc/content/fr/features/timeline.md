---
title: "Timeline"
weight: 6
---

# Timeline

Visualisez la dimension temporelle de vos données avec la vue chronologique.


## Activer la timeline

| Méthode | Action |
|---------|--------|
| Touche **3** | Mode timeline |
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

---

## Organisation verticale

### Lignes (swimlanes)

Les éléments sont organisés en **lignes** pour éviter les chevauchements.


### Groupement

Option de grouper par :

| Groupement | Organisation |
|------------|--------------|
| **Auto** | Minimise les chevauchements |
| **Par tag** | Une ligne par tag principal |
| **Par couleur** | Une ligne par couleur |

---

## Interactions

### Sélection

| Action | Résultat |
|--------|----------|
| **Clic** | Sélectionne l'élément/lien |
| **Ctrl+clic** | Ajoute à la sélection |
| **Double-clic** | Ouvre l'édition |

### Modification de dates

**Glisser** un élément horizontalement pour modifier sa date.

**Glisser** les extrémités d'un lien pour modifier la période.


---

## Synchronisation

En mode timeline, la sélection reste synchronisée avec le canvas :

- Sélectionner sur la timeline → sélectionné sur le canvas
- Les filtres s'appliquent aussi à la timeline


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
| **Chronologie d'enquête** | Visualiser la séquence des événements |
| **Durée des relations** | Voir quand des liens existent |
| **Patterns temporels** | Identifier des périodes d'activité |
| **Présentation** | Raconter une histoire dans le temps |

---

**Voir aussi** : [Fichiers joints]({{< relref "attachments" >}})
