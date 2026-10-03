---
title: "Évaluation de l'information"
weight: 2
---

# Évaluation de l'information

Chaque élément et chaque lien peut porter une évaluation de l'information qu'il représente. ZeroNeurone propose trois modèles d'évaluation, au choix pour chaque dossier.

| Modèle | Principe |
|--------|----------|
| **ZeroNeurone** (par défaut) | Un niveau de confiance unique, de 0 à 100 % par pas de 10 |
| **Europol (4x4)** | Fiabilité de la source (A, B, C, X) et exactitude de l'information (1 à 4) |
| **Amirauté / OTAN (6x6)** | Fiabilité de la source (A à F) et crédibilité de l'information (1 à 6) |

Les deux grilles normalisées évaluent séparément **la source** et **l'information**. Une cotation s'écrit avec deux caractères : **B2** signifie « source le plus souvent fiable, information connue personnellement de la source ».

---

## Choisir le modèle d'un dossier

1. Ouvrez un dossier
2. Dans le panneau de détail du dossier, ouvrez la section **Évaluation de l'information**
3. Choisissez le modèle dans la liste

Le modèle est **commun à tous les participants** d'une session collaborative : un changement fait par l'un s'applique à tous.

---

## Grille Europol

Grille définie par l'article 29 du [règlement (UE) 2016/794](https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX:32016R0794).

| Source | Définition |
|--------|------------|
| **A** | Aucun doute quant à l'authenticité, à la fiabilité et à la compétence de la source, ou source qui s'est révélée fiable dans tous les cas |
| **B** | Source qui s'est révélée fiable dans la plupart des cas |
| **C** | Source qui s'est révélée non fiable dans la plupart des cas |
| **X** | La fiabilité de la source ne peut être évaluée |

| Information | Définition |
|-------------|------------|
| **1** | Informations dont l'exactitude ne fait aucun doute |
| **2** | Informations connues personnellement de la source, mais pas personnellement du fonctionnaire qui les transmet |
| **3** | Informations non connues personnellement de la source, mais corroborées par d'autres informations déjà enregistrées |
| **4** | Informations non connues personnellement de la source et qui ne peuvent être corroborées |

## Grille de l'Amirauté

| Source | | Information | |
|--------|---|-------------|---|
| **A** | Totalement fiable | **1** | Confirmée par d'autres sources |
| **B** | Habituellement fiable | **2** | Probablement vraie |
| **C** | Assez fiable | **3** | Possiblement vraie |
| **D** | Pas toujours fiable | **4** | Douteuse |
| **E** | Non fiable | **5** | Improbable |
| **F** | Fiabilité non évaluable | **6** | Véracité non évaluable |

---

## Coter un élément ou un lien

Dans le panneau de détail, section **Métadonnées** :

- en modèle ZeroNeurone, le curseur de confiance. Le bouton **Effacer** remet la confiance à « non défini » ;
- en modèle Europol ou Amirauté, deux listes : fiabilité de la source et exactitude de l'information. La définition complète du code choisi s'affiche au survol de la liste.

En sélection multiple, la section **Cotation** applique la même cotation à tous les éléments et liens sélectionnés ; en modèle ZeroNeurone, la section **Confiance** permet aussi d'effacer la confiance de toute la sélection. Dans la [vue matrice]({{< relref "matrix-view" >}}), la colonne de cotation se modifie en saisissant directement le code (ex. `B2`).

---

## Changer de modèle

Changer de modèle **ne convertit jamais** les cotations existantes : il n'existe pas de correspondance officielle entre les grilles.

- Les niveaux de confiance restent enregistrés et réapparaissent si vous revenez au modèle ZeroNeurone.
- Une cotation faite dans une autre grille est conservée et affichée **en grisé**, avec la mention de son échelle. Elle est remplacée dès que vous cotez l'élément dans la grille active.

Si des cotations sont concernées, ZeroNeurone indique leur nombre et demande une confirmation avant de changer de modèle.

---

## Affichage, filtres et requêtes

| Fonction | En modèle Europol / Amirauté |
|----------|------------------------------|
| **Indicateur sur le canvas** | Badge avec la cotation (ex. `B2`), activé dans [Vues]({{< relref "filters-views" >}}) |
| **Filtres** | Codes source et information à cocher ; filtre rapide **Sources fiables** (A-B en Europol, A-C en Amirauté) |
| **Requêtes** | Champs `evaluation`, `evaluation.source`, `evaluation.info`, `evaluation.scale` (voir [requêtes]({{< relref "queries" >}})) |
| **Synthèse et rapports** | Colonne et tri par cotation |
| **Fusion d'éléments** | La cotation de l'élément conservé est gardée, sinon celle de l'autre élément |

---

## Import et export

| Format | Cotation |
|--------|----------|
| **ZIP / JSON ZeroNeurone** | Modèle du dossier et cotations conservés. Un dossier vide créé pour l'import reprend le modèle du fichier ; un dossier existant garde le sien. |
| **CSV** | Colonnes `cotation_echelle`, `cotation_source`, `cotation_info` (aussi lues sous les noms `evaluation_scale`, `evaluation_source`, `evaluation_info`) |
| **GEXF, GeoJSON** | Attributs `evaluation` et `evaluation_scale` |
| **ANX (i2 Analyst's Notebook)** | Source dans `GradeOneIndex`, information dans `GradeTwoIndex` (position du code dans la grille, A = 1) |

{{< hint info >}}
L'export ANX n'écrit pas les libellés de grades : i2 affiche les positions avec ses propres libellés. À l'import d'un fichier ANX, les grades restent lus comme aujourd'hui (grade 1 en confiance, grade 2 en propriété).
{{< /hint >}}
