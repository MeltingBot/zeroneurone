---
title: "Résultats et intégrations"
weight: 3
---

# Résultats et intégrations

Une requête ne sert pas qu'à regarder : son résultat se montre, se sélectionne, se groupe, se garde, et se retrouve dans les autres fonctions de ZeroNeurone.

{{< screenshot "znquery-table.webp" "Mode table : les résultats avec les champs testés par la requête" >}}

## Modes de restitution

Après exécution, deux modes d'affichage sont disponibles (cumulables) :

| Mode | Icône | Description |
|------|-------|-------------|
| **Filtre canvas** | Entonnoir | Atténue les éléments non-matchés sur le canvas, la carte, la timeline et la matrice |
| **Table** | Tableau | Affiche les résultats dans un tableau triable : le libellé, puis les champs testés par la requête. L'export CSV ajoute les autres propriétés |

Les boutons de mode se trouvent en haut du panneau requêtes, à côté du compteur de résultats.

Quand des filtres du panneau **Filtres** sont aussi actifs, les vues n'affichent que les éléments gardés par les deux : le compteur l'indique (« 18 éléments, 0 liens → 12 affiché(s) »). Pour cacher les éléments hors filtre au lieu de les atténuer, utilisez **Masquer** dans le panneau Filtres (voir [Filtres et vues]({{< relref "filters-views" >}})).

Quand ce panneau est vide, les filtres y écrivent leur propre requête (`type = "element" AND tag = "Personne"`) : modifiez-la pour aller plus loin, elle reprend alors les filtres qu'elle disait (voir [Filtres et requête]({{< relref "filters-views" >}})).

Quand la requête trouve des liens, le filtre canvas garde en évidence les éléments situés aux deux extrémités des liens trouvés et atténue le reste.

### Actions sur les résultats

- **Afficher les résultats** (icône cible) : cadre la vue sur ce que la requête a trouvé, extrémités des liens comprises (canvas ; carte pour les éléments géolocalisés ; la timeline se place sur le premier)
- **Sélectionner / Désélectionner** (bascule) : sélectionne les résultats, ou les retire de la sélection quand ils sont déjà tous sélectionnés. Quand la requête filtre le canvas, elle porte sur les éléments affichés (filtres compris), comme le bouton du panneau Filtres, avec lequel elle reste synchronisée
- **Inverser la sélection** : sélectionne ce que la requête n'a pas trouvé, du même type que ses résultats (les autres éléments, ou les autres liens) ; les éléments masqués sont exclus. Un second clic resélectionne les résultats ; le bouton reste en évidence tant que l'inverse est sélectionné
- **Grouper les résultats** : place les éléments trouvés dans un nouveau groupe sur le canvas, là où ils sont, nommé d'après la requête (renommable). Les éléments déjà dans un groupe et les groupes eux-mêmes ne sont pas repris ; il en faut au moins deux. Un seul **Ctrl+Z** annule. Pour resserrer un groupe dispersé : clic-droit sur le groupe → **Rapprocher les membres** (voir [Groupes]({{< relref "elements-links#groupes" >}}))
- **Sauvegarder comme vue** : crée une vue sauvegardée qui garde la requête, les filtres et le choix atténuer / masquer
- **Clic sur une ligne** (mode table) : sélectionne l'élément et le montre dans la vue active (canvas, carte ou timeline) ; un lien est montré avec ses deux extrémités

### Grouper les résultats

En mode table, la liste **Grouper par** regroupe les résultats selon un champ : `tag`, `in_group` (groupe du canvas), `country` ou une propriété présente dans les résultats. La table affiche alors une ligne par valeur avec le nombre de résultats, les plus nombreuses d'abord ; les résultats sans valeur sont regroupés en dernière ligne.

- Un résultat qui porte plusieurs valeurs (plusieurs tags, groupes imbriqués) est compté sur chacune de ses lignes, comme dans une requête : un membre d'« Équipe A », elle-même dans « Réseau », compte dans les deux lignes.
- **Clic sur une ligne** : sélectionne les résultats de cette valeur et les cadre dans la vue.
- **Exporter CSV** exporte alors les valeurs et leur nombre.

{{< screenshot "znquery-table-grouped.webp" "Grouper par tag : une ligne par valeur, avec le nombre de résultats" >}}

### Actualisation automatique

La requête se ré-exécute automatiquement lorsque les données du dossier changent (ajout, modification ou suppression d'éléments/liens).

---

## Historique des requêtes

Les 5 dernières requêtes exécutées sont mémorisées pendant la session. Cliquez sur l'icône horloge pour afficher l'historique et réappliquer une requête précédente.

---

## Requêtes sauvegardées

Sauvegardez vos requêtes fréquentes pour les réutiliser :

1. Construisez votre requête
2. Cliquez sur **Sauvegarder** dans la section "Requêtes sauvegardées"
3. Donnez un nom à la requête

Les requêtes sauvegardées sont liées au dossier courant. À leur chargement, le texte est reconstruit depuis leur structure, groupes entre parenthèses compris.

Une **vue sauvegardée** garde en plus l'état du canvas : filtres, requête, choix atténuer ou masquer (voir [Filtres et vues]({{< relref "filters-views" >}})).

---

## Dans le reste de ZeroNeurone

| Où | Ce que fait la requête |
|----|------------------------|
| **Canvas, carte, timeline, matrice** | Atténue ce qui ne correspond pas (ou le masque, depuis le panneau Filtres) |
| **Recherche rapide** (Ctrl+K) | `?` suivi d'une requête l'applique sans ouvrir le panneau |
| **Filtres** | Cocher un tag ou une plage de confiance écrit la requête équivalente dans le panneau quand il est vide |
| **Matrice** | Les filtres de colonnes (`colonne = "valeur"`) se transforment en requête avec **Toutes les vues**, pour s'appliquer partout |
| **Suggestions de liens** | Une requête appliquée en filtre restreint l'analyse à ses résultats |
| **Synthèse** | Sélectionnez les résultats, puis ouvrez la synthèse : elle s'ouvre sur la sélection en cours |
| **Groupes** | **Grouper les résultats** crée un groupe nommé d'après la requête |

Détails : [Filtres et vues]({{< relref "filters-views" >}}), [Vue matrice]({{< relref "matrix-view" >}}), [Suggestions de liens]({{< relref "link-suggestions" >}}), [Synthèse]({{< relref "synthesis" >}}).

---

**Voir aussi** : [Prise en main]({{< relref "_index" >}}) | [Référence]({{< relref "reference" >}}) | [Recettes]({{< relref "recipes" >}})
