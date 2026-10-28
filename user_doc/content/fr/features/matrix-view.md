---
title: "Vue matrice"
weight: 8
---

# Vue matrice

Affichez tous les elements du dossier dans un tableau triable et filtrable.

---

## Acces

Basculez en vue matrice via le **selecteur de vue** dans la barre d'outils (icone tableau) ou appuyez sur **4**.

---

## Fonctions du tableau

### Colonnes

| Colonne | Contenu |
|---------|---------|
| **Label** | Nom de l'element (fixe, toujours visible) |
| **Type** | Premier tag |
| **Confiance** | Niveau de confiance (0-100%), ou cotation (`B2`) en [modèle Europol / Amirauté]({{< relref "evaluation" >}}) |
| **Source** | Attribution de la source |
| *Proprietes* | Une colonne par propriete personnalisee utilisee |

### Gestion des colonnes

- **Tri** : Cliquez sur un en-tete de colonne pour trier (croissant/decroissant)
- **Redimensionner** : Glissez le bord droit d'un en-tete
- **Reordonner** : Glissez l'icone grip sur un en-tete
- **Afficher/masquer** : Utilisez le bouton colonnes dans la barre d'outils
- **Filtrer** : Tapez dans la ligne de filtres sous les en-tetes

---

## Edition en ligne

**Double-cliquez** sur une cellule pour modifier sa valeur directement dans le tableau.

| Touche | Action |
|--------|--------|
| **Entree** | Sauvegarder et quitter l'edition |
| **Echap** | Annuler l'edition |
| **Tab** | Sauvegarder et passer a la colonne suivante |
| **Shift+Tab** | Sauvegarder et revenir a la colonne precedente |
| **Fleche Haut/Bas** | Sauvegarder et passer a la ligne adjacente |

Les liens de la colonne **Source** (page web, document joint, extension) s'ouvrent d'un clic. Elle s'edite dans une zone de plusieurs lignes, une source par ligne : **Entree** ajoute une ligne, **Ctrl+Entree** sauvegarde.

Les dates s'editent au format `AAAA-MM-JJ HH:mm`, dans le fuseau de la source.

Toutes les modifications supportent **annuler/retablir** (Ctrl+Z / Ctrl+Shift+Z).

{{< hint info >}}
L'edition en ligne est desactivee en mode anonyme.
{{< /hint >}}

---

## Selection de lignes

| Action | Resultat |
|--------|----------|
| **Clic** | Selectionner une seule ligne |
| **Ctrl+clic** | Ajouter/retirer de la selection |
| **Shift+clic** | Selectionner la plage depuis le dernier clic |

Les lignes selectionnees sont surlignees. Utilisez **Ctrl+C** pour copier les lignes selectionnees en texte tabule (en-tetes inclus).

---

## Export CSV

Cliquez sur l'**icone de telechargement** dans la barre d'outils pour exporter la vue courante en CSV.

- Respecte la visibilite des colonnes, le tri et les filtres actifs
- Nom du fichier : `nom-dossier_matrice_jjMMaaaHHmmss.csv`
- Encodage UTF-8 avec BOM pour compatibilite Excel

---

## Barre d'outils

| Controle | Fonction |
|----------|----------|
| Compteur d'elements | Affiche elements filtres / total et nombre de proprietes |
| Colonnes | Basculer la visibilite des colonnes (tout / rien) |
| Export | Telecharger le CSV |
| Toutes les vues | Appliquer les filtres de colonnes aux autres vues (voir ci-dessous) |
| Reset | Restaurer tri, colonnes et filtres par defaut |
| Annuler/Retablir | Annuler/retablir la derniere action |
| Mode anonyme | Caviarder les noms et valeurs |

### Requête depuis une cellule

Clic droit sur une cellule ▸ **Requête sur cette valeur** : écrit et lance la [requête ZNQuery]({{< relref "queries" >}}) `colonne = "valeur"` (valeur exacte, sans tenir compte de la casse), appliquée à toutes les vues, et ouvre son panneau. L'entrée n'apparaît pas sur les colonnes sans requête équivalente (voir ci-dessous) ni sur une cellule vide.

### Appliquer les filtres aux autres vues

Les filtres de colonnes ne valent que pour la matrice. Le bouton **Toutes les vues**, affiché dès qu'un filtre est rempli, les transforme en [requête ZNQuery]({{< relref "queries" >}}) appliquée en filtre : le canvas, la carte, la timeline et les [suggestions de liens]({{< relref "link-suggestions" >}}) gardent alors les mêmes éléments.

- Un filtre « flagra » sur la colonne *Type d'enquête* devient `"Type d'enquête" CONTAINS "flagra"`, sans tenir compte de la casse.
- Si une requête filtre déjà les vues, les filtres de colonnes s'y ajoutent (`AND`).
- Les filtres de colonnes restent en place ; le bouton est grisé tant que la requête les contient.
- Une colonne sans requête équivalente bloque le bouton (son infobulle la nomme) : confiance ou cotation, propriété date ou oui/non, filtre sur « — », propriété portant le nom d'un champ réservé (`source`, `date`…).
- Sur la colonne *Type*, la requête cherche dans tous les tags de l'élément, pas seulement le premier.

Pour garder aussi ce qui est relié aux éléments trouvés, modifiez ensuite la requête : `WITHIN 2 HOPS OF ("Type d'enquête" CONTAINS "flagra")`.

---

## Raccourcis clavier

| Raccourci | Action |
|-----------|--------|
| **Ctrl+Z** | Annuler |
| **Ctrl+Shift+Z** / **Ctrl+Y** | Retablir |
| **Ctrl+C** | Copier les lignes selectionnees |

---

**Voir aussi** : [Elements et liens]({{< relref "elements-links" >}}) | [Filtres et vues]({{< relref "filters-views" >}})
