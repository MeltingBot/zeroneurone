---
title: "Requêtes avancées"
weight: 4
---

# Requêtes avancées (ZNQuery)

Un filtre répond à « montre-moi les personnes ». Une requête répond à « montre-moi les personnes crédibles, à moins de deux liens d'un suspect, géolocalisées près de Marseille ». **ZNQuery** est le langage de requêtes de ZeroNeurone : une phrase courte, évaluée en direct sur **tous les éléments et tous les liens** du dossier.

{{< screenshot "query-panel.webp" "Panneau Requête : les éléments correspondants sont mis en évidence" >}}

- **Deux façons de l'écrire** : un constructeur visuel (on clique) et un éditeur texte (on tape, avec autocomplétion). Les deux décrivent la même requête, on passe de l'un à l'autre quand on veut.
- **Pas de bouton « Exécuter »** : la requête s'applique dès qu'elle est valide, et se met à jour quand le dossier change.
- **Le résultat se voit partout** : éléments atténués sur le canvas, la carte, la timeline et la matrice, ou tableau de résultats.

| Page | Pour quoi faire |
|------|-----------------|
| **Prise en main** (cette page) | Écrire sa première requête en quelques minutes |
| [Référence du langage]({{< relref "reference" >}}) | Syntaxe, champs, opérateurs, comportements à connaître |
| [Recettes]({{< relref "recipes" >}}) | Des requêtes toutes prêtes, par type de besoin |
| [Résultats et intégrations]({{< relref "results" >}}) | Table, groupes, vues sauvegardées, lien avec les autres fonctions |

## Accéder au panneau

- Onglet **Requêtes** dans le panneau latéral
- Depuis la recherche rapide (Ctrl+K), tapez `?` suivi de votre requête
- Clic droit sur un élément → **Analyser** → **Chercher les similaires** : requête sur un libellé proche (`LIKE`) ou les mêmes tags, par exemple `label LIKE "Jean Martin" OR tag = "Personne"`

---

## Prise en main

Les exemples suivants utilisent un petit dossier fictif, **l'affaire Delmas** : quatre personnes, trois sociétés, trois comptes, des virements, des événements datés. [Téléchargez-le](/downloads/affaire-delmas.zip), puis **Importer** depuis la page d'accueil (le dossier prend le nom du fichier). Ses données sont en français : tags `Personne`, `Société`, `Compte`, propriété `Rôle`.

### 1. Une première condition, au clic

1. Ouvrez le dossier, onglet **Requêtes**, mode **Visuel**.
2. **Ajouter une condition** : champ `tag`, opérateur `=`, valeur `Personne`. Les quatre personnes s'allument sur le canvas, le reste s'estompe.
3. **Ajouter une condition** : champ `confidence`, opérateur `>=`, valeur `70`.

Trois éléments restent : Hélène Roche (90 %), Marc Delmas (80 %) et Claire Lefort (70 %). Le bouton **AND** entre les conditions veut dire « toutes à la fois » ; il bascule en **OR** (« l'une ou l'autre »).

{{< screenshot "znquery-visual.webp" "Constructeur visuel : deux conditions combinées par AND" >}}

### 2. La même requête, en texte

Passez en mode **Texte** : la requête s'y est écrite toute seule.

```
tag = "Personne" AND confidence >= 70
```

Une condition se lit toujours `champ opérateur valeur`. Les mots-clés (`AND`, `OR`, `NOT`…) s'écrivent comme vous voulez, en majuscules ou non ; les valeurs texte vont entre guillemets.

### 3. Écrire à la main, avec l'autocomplétion

Effacez et tapez `tag = ` : l'éditeur propose les tags du dossier. Il propose aussi les champs, les opérateurs et les valeurs existantes selon l'endroit où vous êtes.

- **↑ / ↓** pour parcourir les suggestions
- **Entrée** ou **Tab** pour accepter
- **Échap** pour fermer

{{< screenshot "znquery-autocomplete.webp" "Autocomplétion : les tags du dossier après « tag = »" >}}

Essayez `Rôle = "Suspect"` : deux éléments. Les propriétés que vous avez créées s'utilisent comme n'importe quel champ ; si leur nom contient des espaces, mettez-le entre guillemets (`"Date de naissance" EXISTS`).

### 4. Quand la requête est incorrecte

Tapez `tag = Personne` (sans guillemets). Le message d'erreur s'affiche sous l'éditeur, et la requête précédente cesse de s'appliquer tant que celle-ci n'est pas valide.

{{< screenshot "znquery-error.webp" "Message d'erreur sous l'éditeur" >}}

Les messages du parseur sont en anglais : « Expected value, got IDENTIFIER 'Personne' » veut dire « une valeur était attendue ». Le plus souvent, un guillemet manque ou une parenthèse n'est pas fermée.

### 5. Interroger les liens

Une requête s'applique aux éléments **et** aux liens. `type` fait la différence :

```
type = "link" AND date >= 2024-03-01
```

Résultat : un lien, le virement de 85 000 € du 19 mars. Les dates s'écrivent `AAAA-MM-JJ`, sans guillemets.

### 6. Chercher dans le voisinage

`WITHIN n HOPS OF` sélectionne tout ce qui est à `n` liens au plus d'un élément qui correspond à la condition :

```
WITHIN 1 HOPS OF Rôle = "Suspect"
```

Huit éléments et onze liens : les deux suspects et tout ce qui leur est directement relié.

{{< screenshot "znquery-within.webp" "WITHIN 1 HOPS : les suspects et leur voisinage direct" >}}

### 7. Garder ou exploiter le résultat

Les boutons en haut du panneau agissent sur le résultat : le cadrer dans la vue, le sélectionner, le grouper sur le canvas, l'afficher en **table**, l'enregistrer comme vue. Le détail est dans [Résultats et intégrations]({{< relref "results" >}}).

{{< hint info >}}
**Trois réflexes à garder**

1. **Les liens comptent aussi.** `NOT tag = "Document"` ramène tous les liens, qui n'ont pas ce tag. Ajoutez `type = "element"` quand vous ne voulez que des éléments.
2. **La casse est ignorée**, sauf pour les expressions régulières (`MATCHES`).
3. **Un champ absent ne correspond à rien**, sauf avec `!=` : `Rôle != "Suspect"` ramène aussi tous les éléments qui n'ont pas de rôle. La [référence]({{< relref "reference#comportements-à-connaître" >}}) détaille ces cas.
{{< /hint >}}

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

En mode texte, chaque groupe apparaît entre parenthèses, même là où la priorité de AND sur OR les rendrait facultatives : `tag = "A" OR (tag = "B" AND tag = "C")`.

### Négation (NOT)

Chaque condition ou groupe dispose d'un bouton **NOT** pour inverser son résultat. Quand actif, la condition est bordée d'orange à gauche.

Le mode visuel exécute automatiquement la requête à chaque modification.

---

**Suite** : [Référence du langage]({{< relref "reference" >}}) | [Recettes]({{< relref "recipes" >}}) | [Résultats et intégrations]({{< relref "results" >}}) | [Filtres et vues]({{< relref "filters-views" >}})
