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
| **Onglets** | Dans **Tous** : ne garder que les éléments des onglets cochés |
| **Confiance** | Seuil minimum de confiance (modèle ZeroNeurone) |
| **Cotation** | Codes source et information acceptés (modèles Europol et Amirauté) |
| **Propriétés** | Éléments ayant une propriété spécifique |
| **Éléments masqués** | Gérer les éléments cachés manuellement |
| **Isolés** | Éléments sans connexion |

### Filtres rapides

Chaque filtre rapide désigne un ensemble d'éléments de la vue (l'onglet ouvert, ou tout le dossier dans **Tous**) : **Isolés**, **Sans tags**, **Sans geo**, **Sans date**, **Confiance faible** (ou **Sources fiables** avec une cotation), **Commentaires** non résolus. Le nombre d'éléments s'affiche sur chaque puce.

Les trois icônes à droite du titre choisissent ce que fait un clic :

| Mode | Effet |
|------|-------|
| **Masquer** | Masque ces éléments |
| **Seulement ceux-ci** | Masque tous les autres |
| **Sélectionner** | Sélectionne ces éléments (pour les déplacer, les étiqueter, les fusionner…) |

Un second clic défait ce que la puce a fait, et seulement cela : les éléments masqués à la main le restent.

### Propriétés date

La section **Propriétés date** liste les propriétés de type date et date-heure du dossier, avec le nombre d'éléments qui renseignent chacune. Ces dates placent les éléments sur la timeline, sur la carte et dans le curseur temporel du canvas.

- **Par défaut** : toutes les propriétés date sont cochées et comptent.
- **Décocher une puce** (barrée) : ses dates ne placent plus les éléments sur la timeline et la carte (par exemple la date de naissance). Un second clic la recoche. Une propriété date importée plus tard est cochée d'office.

Un badge **Dates n/total** apparaît alors dans les filtres actifs ; sa croix rétablit toutes les dates.

#### Périodes

Sous les puces, **+ Période** lit deux propriétés date comme une seule période : choisissez le début et la fin (« Début des faits → Fin des faits »), puis validez. Un élément qui renseigne les deux s'affiche comme une barre sur la timeline et reste actif pendant toute la période sur la carte et le canvas. S'il n'en renseigne qu'une, ou si la fin précède le début, les deux dates restent des points.

Les périodes sont un réglage : **Tout effacer** les conserve.

{{< hint info >}}
La **date de collecte** d'un élément (date d'ajout de l'information) ne le date dans aucune vue ni aucun filtre : seuls comptent sa période, ses événements datés et ses propriétés date.
{{< /hint >}}

### Combiner les filtres

Les filtres se cumulent (ET logique) : un élément doit satisfaire **tous** les critères actifs pour être affiché.

### Filtres et requête

Une requête appliquée sur le canvas (panneau **Requête**) restreint les vues en plus des filtres : un élément est affiché s'il est gardé par les deux. L'en-tête du panneau Filtres compte ces éléments affichés ; quand les deux sont actifs, une ligne indique la part de chacun (« Filtres 598 · Requête 44 »). La requête apparaît comme un badge **Requête** dans les filtres actifs ; sa croix retire la requête des vues sans l'effacer.

**Tout effacer** retire les filtres et la requête des vues (la requête reste dans son panneau).

**Sélectionner / Désélectionner** sélectionne les éléments affichés, ou les retire de la sélection quand ils sont déjà tous sélectionnés. Le bouton du panneau Requête fait de même et reste synchronisé.

### Atténuer ou masquer

Par défaut, les éléments hors filtre sont **atténués**. Le bouton **Masquer** de l'encadré « Filtres actifs » les fait disparaître de toutes les vues (canvas, timeline, carte, matrice), liens compris. Ce choix n'est pas conservé d'une session à l'autre, sauf s'il est enregistré dans une vue.

### Masquer manuellement

Clic-droit sur un élément → **Masquer** pour le retirer temporairement du canvas sans le supprimer.

Clic-droit → **Afficher uniquement la sélection** (ou **Afficher uniquement** sur le fond du canvas) masque tout le reste. Les groupes qui contiennent la sélection restent visibles, ainsi que les membres d'un groupe sélectionné.

Les éléments masqués sont listés en haut du panneau **Filtres**, sous le compteur : un clic sur l'œil d'une ligne en réaffiche un, **Tout afficher** les réaffiche tous. Le clic droit sur le fond du canvas propose aussi **Afficher les masqués (N)**.

---

## Vues sauvegardées

Une **vue** capture l'état actuel de votre espace de travail :

- Filtres actifs, dont les propriétés date retenues et les périodes
- Le choix atténuer / masquer
- La requête appliquée (panneau Requête)
- Position du viewport (zoom, pan)
- Éléments masqués
- (Optionnel) Positions des éléments

Une vue sauvegardée avant ZeroNeurone 2.71 ne change ni le choix atténuer / masquer ni la requête en cours.

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

Clic droit sur un élément ▸ **Mode focus**, puis la profondeur, pour isoler l'élément et son voisinage :

| Niveau | Affichage |
|--------|-----------|
| **Voisins directs** | Élément + éléments reliés |
| **Voisins à 2 liens** | + voisins des voisins |
| **Voisins à 3 liens** | Voisinage étendu |

Le focus écrit et lance la [requête ZNQuery]({{< relref "queries" >}}) correspondante, par exemple `WITHIN 2 HOPS OF label = "Jean Dupont"`, et ouvre son panneau : on peut la modifier, la sauvegarder ou la garder dans une vue. L'élément est désigné par son libellé, ou par son identifiant (`_id = "…"`) quand un autre élément porte le même libellé. Dans un onglet, seuls ses membres sont gardés.

Pour sortir du focus, effacez la requête dans le panneau ZNQuery.

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
| **Taille des éléments selon le nombre de liens** | Les éléments très reliés sont dessinés plus grands (voir [Analyse de graphe]({{< relref "graph-analysis" >}})) |


### Style des liens

| Option | Valeurs |
|--------|---------|
| **Ancrage** | Auto, centre, bords |
| **Courbure** | Droit, courbe, orthogonal |


---

**Voir aussi** : [Analyse de graphe]({{< relref "graph-analysis" >}})
