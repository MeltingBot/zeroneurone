---
title: "Vue matrice"
weight: 8
---

# Vue matrice

Affichez tous les elements de l'enquete dans un tableau triable et filtrable.

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
| **Confiance** | Niveau de confiance (0-100%) |
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
- Nom du fichier : `nom-enquete_matrice_jjMMaaaHHmmss.csv`
- Encodage UTF-8 avec BOM pour compatibilite Excel

---

## Barre d'outils

| Controle | Fonction |
|----------|----------|
| Compteur d'elements | Affiche elements filtres / total et nombre de proprietes |
| Colonnes | Basculer la visibilite des colonnes (tout / rien) |
| Export | Telecharger le CSV |
| Reset | Restaurer tri, colonnes et filtres par defaut |
| Annuler/Retablir | Annuler/retablir la derniere action |
| Mode anonyme | Caviarder les noms et valeurs |

---

## Raccourcis clavier

| Raccourci | Action |
|-----------|--------|
| **Ctrl+Z** | Annuler |
| **Ctrl+Shift+Z** / **Ctrl+Y** | Retablir |
| **Ctrl+C** | Copier les lignes selectionnees |

---

**Voir aussi** : [Elements et liens]({{< relref "elements-links" >}}) | [Filtres et vues]({{< relref "filters-views" >}})
