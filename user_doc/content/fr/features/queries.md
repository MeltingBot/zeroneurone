---
title: "Requêtes avancées"
weight: 4
---

# Requêtes avancées (ZNQuery)

Le panneau **Requêtes** permet de filtrer vos données avec un langage structuré. Deux modes sont disponibles : un **builder visuel** (clic) et un **éditeur texte** (syntaxe ZNQuery).

## Accéder au panneau

- Onglet **Requêtes** dans le panneau latéral
- Depuis la recherche rapide (Ctrl+K), tapez `?` suivi de votre requête

---

## Mode visuel

Le builder visuel permet de construire des requêtes sans connaître la syntaxe.

### Ajouter une condition

1. Cliquez sur **Ajouter une condition**
2. Choisissez un **champ** (label, tag, date, confiance, etc.)
3. Choisissez un **opérateur** (=, !=, CONTAINS, EXISTS, etc.)
4. Saisissez une **valeur** — l'input s'adapte au type du champ :

| Type de champ | Input |
|---------------|-------|
| Texte (label, notes, source) | Champ texte libre |
| Date (date, created, event.date) | Sélecteur de date |
| Nombre (confidence, geo.lat) | Input numérique |
| Booléen (has_geo, group, directed) | Sélecteur true/false |
| Tag (tag, from.tag, to.tag) | Liste déroulante des tags existants |
| Géo (has_geo, event.geo) + NEAR | Latitude, longitude, rayon, unité |

### Combiner les conditions

Quand plusieurs conditions sont présentes, un bouton **AND/OR** permet de basculer entre :
- **AND** : toutes les conditions doivent être satisfaites
- **OR** : au moins une condition doit être satisfaite

### Groupes imbriqués

Cliquez sur **Ajouter un groupe** pour créer un sous-groupe avec le combinateur opposé (AND dans un groupe OR, et inversement). La profondeur maximale est de 2 niveaux.

### Négation (NOT)

Chaque condition ou groupe dispose d'un bouton **NOT** pour inverser son résultat. Quand actif, la condition est bordée d'orange à gauche.

Le mode visuel exécute automatiquement la requête à chaque modification.

---

## Mode texte

Le mode texte offre plus de puissance, notamment pour les requêtes imbriquées.

### Syntaxe de base

```
champ opérateur valeur
```

Les chaînes de caractères se mettent entre guillemets. Les dates s'écrivent au format ISO (YYYY-MM-DD).

### Exemples

```
tag = "personne"
label CONTAINS "bank"
confidence > 70
date >= 2024-01-01
tag = "entreprise" AND country = "FR"
(tag = "personne" OR tag = "entreprise") AND confidence > 50
NOT (tag = "archivé")
```

### Opérateurs logiques

| Opérateur | Description |
|-----------|-------------|
| **AND** | Les deux conditions doivent être vraies |
| **OR** | Au moins une condition doit être vraie |
| **NOT** | Inverse la condition |
| **( )** | Groupement pour contrôler la priorité |

---

## Champs disponibles

### Champs système

| Champ | Type | Description |
|-------|------|-------------|
| `label` | texte | Nom de l'élément ou du lien |
| `notes` | texte | Notes associées |
| `tag` | texte | Tags (correspond si au moins un tag match) |
| `confidence` | nombre | Niveau de confiance (0-100) |
| `source` | texte | Source de l'information |
| `date` | date | Date de l'élément |
| `date.start` | date | Début de la plage de dates |
| `date.end` | date | Fin de la plage de dates |
| `created` | date | Date de création |
| `updated` | date | Date de dernière modification |
| `type` | texte | "element" ou "link" |
| `has_geo` | booléen | Possède des coordonnées géo |
| `group` | booléen | Est un groupe |
| `country` | texte | Pays (propriétés de type country) |

### Champs des liens

| Champ | Type | Description |
|-------|------|-------------|
| `from.label` | texte | Label de l'élément source |
| `from.tag` | texte | Tags de l'élément source |
| `to.label` | texte | Label de l'élément cible |
| `to.tag` | texte | Tags de l'élément cible |
| `directed` | booléen | Lien dirigé |

### Champs des événements

Les éléments peuvent contenir des **événements**. Les champs `event.*` utilisent une sémantique **ANY** : un élément correspond si au moins un de ses événements satisfait la condition.

| Champ | Type | Description |
|-------|------|-------------|
| `event.date` | date | Date de l'événement |
| `event.date.end` | date | Date de fin de l'événement |
| `event.label` | texte | Label de l'événement |
| `event.description` | texte | Description |
| `event.source` | texte | Source de l'événement |
| `event.geo` | booléen / géo | Événement géolocalisé |

### Champs géographiques

| Champ | Type | Description |
|-------|------|-------------|
| `geo.lat` | nombre | Latitude |
| `geo.lng` | nombre | Longitude |
| `event.geo.lat` | nombre | Latitude de l'événement |
| `event.geo.lng` | nombre | Longitude de l'événement |

### Propriétés libres

Tout nom de propriété défini par l'utilisateur peut être utilisé comme champ. Si le nom contient des espaces ou caractères spéciaux, entourez-le de guillemets :

```
"Numéro SIREN" MATCHES /^[0-9]{9}$/
ville = "Paris"
```

---

## Opérateurs

### Comparaison

| Opérateur | Description | Types |
|-----------|-------------|-------|
| `=` | Égal (insensible à la casse pour le texte) | tous |
| `!=` | Différent | tous |
| `>` | Supérieur | nombre, date |
| `<` | Inférieur | nombre, date |
| `>=` | Supérieur ou égal | nombre, date |
| `<=` | Inférieur ou égal | nombre, date |

### Texte

| Opérateur | Description |
|-----------|-------------|
| `CONTAINS` | Contient la sous-chaîne |
| `STARTS` | Commence par |
| `ENDS` | Termine par |
| `MATCHES` | Expression régulière |

### Ensemble

| Opérateur | Syntaxe | Description |
|-----------|---------|-------------|
| `IN` | `champ IN ("a", "b", "c")` | Le champ correspond à l'une des valeurs listées |

```
tag IN ("personne", "entreprise", "organisation")
country IN ("FR", "DE", "ES")
```

### Existence

| Opérateur | Description |
|-----------|-------------|
| `EXISTS` | Le champ existe et n'est pas vide |
| `NOT EXISTS` | Le champ n'existe pas ou est vide |

### Géographique

| Opérateur | Syntaxe | Description |
|-----------|---------|-------------|
| `NEAR` | `geo NEAR lat,lng rayon` | Proximité (distance de Haversine) |

Le rayon s'exprime en **km** ou **m** :

```
geo NEAR 43.3,5.4 200km
geo NEAR 48.85,2.35 500m
event.geo NEAR 43.3,5.4 50km
```

---

## Modes de restitution

Après exécution, deux modes d'affichage sont disponibles (cumulables) :

| Mode | Icône | Description |
|------|-------|-------------|
| **Filtre canvas** | Entonnoir | Atténue les éléments non-matchés sur le canvas, la carte, la timeline et la matrice |
| **Table** | Tableau | Affiche les résultats dans un tableau triable avec export CSV |

Les boutons de mode se trouvent en bas du panneau requêtes, à côté du compteur de résultats.

### Actions sur les résultats

- **Tout sélectionner** : sélectionne tous les éléments et liens correspondants sur le canvas
- **Sauvegarder comme vue** : crée une vue sauvegardée à partir des résultats de la requête
- **Clic sur une ligne** (mode table) : sélectionne l'élément et centre la vue dessus

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

Les requêtes sauvegardées sont liées au dossier courant.

---

## Exemples pratiques

### Trouver des personnes en France

```
tag = "personne" AND country = "FR"
```

### Événements récents à Marseille

```
event.date >= 2024-01-01 AND event.geo NEAR 43.3,5.4 50km
```

### Liens entre entreprises suspectes

```
type = "link" AND from.tag = "entreprise" AND confidence < 40
```

### Éléments de plusieurs types

```
tag IN ("personne", "entreprise") AND confidence > 50
```

### Éléments sans source

```
source NOT EXISTS
```

### Recherche par regex sur un identifiant

```
"Numéro SIREN" MATCHES /^[0-9]{9}$/
```

---

**Voir aussi** : [Filtres et vues]({{< relref "filters-views" >}}) | [Recherche]({{< relref "search" >}})
