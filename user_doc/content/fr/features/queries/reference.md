---
title: "Référence ZNQuery"
weight: 1
---

# Référence du langage ZNQuery

Cette page décrit le langage en détail. Pour l'apprendre pas à pas, commencez par la [prise en main]({{< relref "_index" >}}) ; pour des exemples tout faits, voir les [recettes]({{< relref "recipes" >}}).

## Anatomie d'une requête

```
champ opérateur valeur
```

Une requête est une condition, ou plusieurs conditions combinées par `AND`, `OR`, `NOT` et des parenthèses. Elle est évaluée **séparément sur chaque élément et chaque lien** du dossier : ceux pour lesquels elle est vraie forment le résultat.

```
tag = "Personne" AND (confidence >= 70 OR source EXISTS)
```

### Écriture

| Sujet | Règle |
|-------|-------|
| Mots-clés | `AND`, `OR`, `NOT`, `IN`, `EXISTS`, `WITHIN`… en majuscules ou minuscules |
| Noms de champs | Insensibles à la casse : `Label`, `label` et `LABEL` désignent le même champ |
| Champ sans guillemets | Lettres (accents compris), chiffres, `_` et `.` : `Identité`, `from.tag`, `event.date` |
| Champ entre guillemets | Obligatoire dès qu'il y a un espace, un tiret ou un autre caractère : `"Numéro SIREN"`, `"Date de naissance"` |
| Espaces et retours à la ligne | Libres : une longue requête peut s'écrire sur plusieurs lignes |
| Commentaires | `--` jusqu'à la fin de la ligne |

```
-- sociétés peu fiables
tag = "Société"
  AND confidence < 60   -- seuil à ajuster
```

### Valeurs

| Type | Écriture | Exemples |
|------|----------|----------|
| Texte | Entre guillemets doubles. `\"` pour un guillemet, `\\` pour une barre oblique inverse | `"Jean Dupont"` |
| Nombre | Entier ou décimal, négatif possible | `70`, `3.14`, `-7` |
| Date | `AAAA-MM-JJ`, sans guillemets | `2024-03-01` |
| Booléen | `true` ou `false` | `has_geo = true` |
| Expression régulière | Entre barres obliques, avec `MATCHES` | `/^[0-9]{9}$/` |
| Liste | Entre parenthèses, séparée par des virgules, avec `IN` | `("FR", "DE")` |

Une valeur texte sans guillemets est une erreur : `tag = Personne` ne fonctionne pas, `tag = "Personne"` oui.

### Exemples

```
tag = "personne"
label CONTAINS "bank"
label LIKE "jean martn"
confidence > 70
date >= 2024-01-01
tag = "entreprise" AND country = "FR"
(tag = "personne" OR tag = "entreprise") AND confidence > 50
NOT (tag = "archivé")
in_group = "Équipe A"
in_group NOT EXISTS
```

## Combiner les conditions

| Opérateur | Sens |
|-----------|------|
| `AND` | Les deux côtés doivent être vrais |
| `OR` | Au moins un côté doit être vrai |
| `NOT` | Inverse la condition ou le groupe qui suit |
| `( )` | Regroupe pour imposer l'ordre d'évaluation |

**Priorité : `NOT`, puis `AND`, puis `OR`.** Sans parenthèses, `AND` « colle » plus fort que `OR`, ce qui surprend souvent :

```
tag = "Personne" OR tag = "Société" AND confidence > 80
```

se lit `tag = "Personne"` **OU** (`tag = "Société"` ET `confidence > 80`) : toutes les personnes, plus les sociétés fiables. Pour garder les personnes **et** sociétés fiables, parenthésez :

```
(tag = "Personne" OR tag = "Société") AND confidence > 80
```

Dans le doute, mettez des parenthèses : elles ne coûtent rien.

### Prédicat de graphe : `WITHIN n HOPS OF`

Sélectionne tous les éléments situés à **au plus `n` liens** d'un élément correspondant à une **sous-requête cible**. Utile pour explorer le voisinage : « tout ce qui est à 2 sauts d'un suspect ».

```
WITHIN 2 HOPS OF tag = "suspect"
```

- La cible est une requête entre parenthèses pour les conditions composées : `WITHIN 1 HOPS OF (tag = "suspect" AND ville = "Paris")`.
- `n` est un entier positif ou nul. `HOP` au singulier est accepté. `WITHIN 0 HOPS OF …` correspond exactement à l'ensemble cible.
- Le parcours est **non orienté** (le sens des liens est ignoré). Un lien est retenu quand ses deux extrémités sont dans le rayon.
- Se combine avec les autres opérateurs : `type = "element" AND WITHIN 2 HOPS OF tag = "suspect"`, ou `NOT WITHIN 1 HOPS OF tag = "suspect"`.
- S'écrit en **mode texte** (le constructeur visuel l'affiche en lecture seule).

---

## Champs disponibles

### Champs système

| Champ | Type | Description |
|-------|------|-------------|
| `label` | texte | Nom de l'élément ou du lien |
| `_id` | texte | Identifiant interne de l'élément ou du lien, affiché au pied du panneau Détail (un clic le copie) ; une propriété nommée « id » reste interrogeable par `id` |
| `notes` | texte | Notes associées |
| `tag` | texte | Tags (correspond si au moins un tag match) |
| `confidence` | nombre | Niveau de confiance (0-100) |
| `evaluation` | texte | Cotation complète (ex. `"B2"`) |
| `evaluation.source` | texte | Code de fiabilité de la source (ex. `"B"`) |
| `evaluation.info` | texte | Code d'exactitude de l'information (ex. `"2"`) |
| `evaluation.scale` | texte | Grille de la cotation (`"europol"` ou `"admiralty"`) |
| `source` | texte | Source de l'information |
| `date` | date | Date de l'élément |
| `date.start` | date | Début de la plage de dates |
| `date.end` | date | Fin de la plage de dates |
| `created` | date | Date de création |
| `updated` | date | Date de dernière modification |
| `type` | texte | "element" ou "link" |
| `has_geo` | booléen | Possède des coordonnées géo |
| `group` | booléen | Est un groupe |
| `in_group` | texte | Nom du groupe qui contient l'élément, et des groupes qui contiennent celui-ci |
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

Tout nom de propriété défini par l'utilisateur peut être utilisé comme champ, accents compris (`Identité = "SFR"`). Si le nom contient des espaces ou caractères spéciaux, entourez-le de guillemets :

```
"Numéro SIREN" MATCHES /^[0-9]{9}$/
ville = "Paris"
```

Un élément peut porter plusieurs fois la même propriété (après une fusion, par exemple trois « Identité ») : la condition est vraie si **une** des valeurs la remplit, et `!=` est vrai si **aucune** n'est égale. `Identité != "SFR"` écarte donc un élément qui a « SFR » parmi ses valeurs. Il en va de même pour les tags.

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
| `LIKE` | Approché : casse et accents ignorés, chaque mot doit ressembler à un mot du champ (environ 1 faute pour 5 lettres, mots de 3 lettres ou moins exacts) |
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

## Comportements à connaître

Les cas qui surprennent le plus souvent, avec ce qui se passe réellement. Tous les exemples ont été vérifiés sur le dossier d'exemple de la [prise en main]({{< relref "_index" >}}).

### Portée : l'onglet courant

Dans un onglet, la requête porte sur **les éléments de cet onglet** et les liens entre eux ; elle est relancée quand on change d'onglet. Sur le dossier d'exemple, `created >= 2020-01-01` ramène 20 éléments et 23 liens dans **Tous**, mais 8 éléments et 8 liens dans l'onglet « Flux financiers ». Les filtres actifs jouent de la même façon. Voir [Onglets du canvas]({{< relref "canvas-tabs#requetes-filtres-et-disposition-dans-un-onglet" >}}).

### Éléments et liens

La requête s'applique aux deux. Un lien a un libellé, des notes, une confiance, une source, des dates, des tags et des propriétés, comme un élément ; il n'a ni géolocalisation ni événements.

| Requête | Résultat sur le dossier d'exemple |
|---------|-----------------------------------|
| `confidence >= 70` | 5 éléments **et** 5 liens |
| `type = "element" AND confidence >= 70` | 5 éléments |
| `type = "link" AND confidence >= 70` | 5 liens |

### Champ absent

Quand le champ n'existe pas sur l'élément (pas de propriété `Rôle`, pas de coordonnées, pas de date), **toute condition est fausse**, sauf deux :

- `champ NOT EXISTS` est vrai ;
- `champ != valeur` est vrai.

D'où ce piège classique : `Rôle != "Suspect"` ne veut pas dire « qui a un rôle différent de suspect » mais « qui n'est pas suspect », y compris tout ce qui n'a pas de rôle. Sur le dossier d'exemple, il ramène 18 éléments et 23 liens. Pour « un rôle renseigné, autre que suspect » :

```
Rôle EXISTS AND Rôle != "Suspect"
```

### Champs à plusieurs valeurs

Les tags, `in_group`, `country` et les propriétés qui apparaissent plusieurs fois (après une fusion, par exemple) portent plusieurs valeurs. Une condition est vraie quand **l'une** d'elles la remplit. Pour `!=`, c'est l'inverse : vrai quand **aucune** n'est égale.

### Casse, accents et approximation

| Opérateur | Casse | Accents |
|-----------|-------|---------|
| `=`, `!=`, `IN` | Ignorée | Comptent : `"Societe"` ne trouve pas `Société` |
| `CONTAINS`, `STARTS`, `ENDS` | Ignorée | Comptent |
| `LIKE` | Ignorée | Ignorés, avec tolérance aux fautes de frappe |
| `MATCHES` | **Respectée** | Comptent |

`MATCHES` utilise les expressions régulières de JavaScript, sans option : pas de `/i`. Pour ignorer la casse, écrivez les variantes (`/[Dd]elmas/`). Pour mettre une barre oblique dans le motif, faites-la précéder d'une barre inverse : `/a\/b/`. Une expression invalide ne trouve rien et n'affiche pas d'erreur.

### Dates

- `date = 2024-03-19` compare le **jour** seul, heure ignorée.
- `>`, `<`, `>=`, `<=` comparent l'instant ; une date sans heure vaut minuit, heure locale.
- Pour un élément ou un lien, `date` est sa date, ou à défaut le **début** de sa période (`date.start`). Un élément sans date ni période n'a pas de `date`.
- `created` et `updated` sont les dates de création et de dernière modification.
- Une propriété de type date se compare de la même façon.

### Événements

Les champs `event.*` testent les événements d'un élément avec une logique **« au moins un »** : `event.date >= 2024-04-01 AND event.label = "Dépôt"` est vrai si l'élément a un événement qui remplit les deux conditions **ou** deux événements différents dont chacun en remplit une. Il n'existe pas de moyen de lier deux conditions au **même** événement.

{{< hint warning >}}
Les liens n'ont pas d'événements : toute condition `event.*` est fausse sur un lien.
{{< /hint >}}

### Géographie

`geo NEAR lat,lng rayon` compare au point de l'élément (le centre pour une zone). `event.geo NEAR …` compare aux événements géolocalisés. Un élément sans coordonnées n'est jamais « près » de rien. Le rayon est en `km` ou en `m` ; sans unité, c'est en kilomètres.

## Erreurs

Quand la requête est invalide, le panneau affiche un message en anglais sous l'éditeur et **n'applique pas la requête** : l'ancien résultat disparaît tant que le texte n'est pas correct.

| Message | Cause habituelle |
|---------|------------------|
| `Expected value, got IDENTIFIER 'x'` | Valeur texte sans guillemets |
| `Expected value, got EOF` | Requête arrêtée après l'opérateur |
| `Expected operator after field 'x'` | Nom de champ inconnu ou opérateur oublié |
| `Unexpected character: '['` | `IN [...]` : les listes s'écrivent avec des parenthèses |
| `Unterminated string` | Guillemet fermant manquant |
| `Unexpected token ')'` | Parenthèse en trop ou mal placée |
| `Expected 'HOPS' after the hop count` | `WITHIN 2 OF …` : il manque `HOPS` |

Un champ qui n'existe nulle part n'est pas une erreur : la requête est valide, elle ne trouve simplement rien. Une faute de frappe sur un nom de propriété donne donc zéro résultat sans message. L'autocomplétion évite l'écueil.

## Ce que ZNQuery ne fait pas

ZNQuery sélectionne, il ne calcule pas :

- **pas de tri ni de comptage** : « les éléments qui ont plus de cinq liens » relève des [Insights]({{< relref "graph-analysis" >}}) ;
- **pas de comparaison entre deux champs** : `date.end > date.start` n'existe pas, une valeur est toujours une constante ;
- **pas d'expression régulière insensible à la casse** (voir plus haut) ;
- **un seul niveau de graphe** : `WITHIN` suit les liens sans condition sur leur nature. Pour restreindre aux liens d'un certain libellé, utilisez un [onglet]({{< relref "canvas-tabs" >}}) ou les filtres.

---

**Voir aussi** : [Prise en main]({{< relref "_index" >}}) | [Recettes]({{< relref "recipes" >}}) | [Résultats et intégrations]({{< relref "results" >}})
