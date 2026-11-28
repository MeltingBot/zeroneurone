---
title: "Recettes ZNQuery"
weight: 2
---

# Recettes ZNQuery

Des requêtes prêtes à copier dans l'éditeur texte, classées par besoin. Adaptez les noms de tags et de propriétés à votre dossier. Les résultats indiqués sont ceux du dossier d'exemple de la [prise en main]({{< relref "_index#prise-en-main" >}}), onglet **Tous**.

{{< hint info >}}
Ajoutez `type = "element"` (ou `type = "link"`) en tête quand vous ne voulez qu'une seule des deux catégories : une requête s'applique aux éléments **et** aux liens. Voir la [référence]({{< relref "reference#éléments-et-liens" >}}).
{{< /hint >}}

---

## Qualité de l'information

### Qui est le moins fiable ?

```
type = "element" AND confidence < 60
```

Les éléments dont la confiance est faible (3 éléments). Avec une cotation Europol ou Amirauté, interrogez plutôt les codes : `evaluation.source = "A"` ou `evaluation = "B2"`. Voir [Évaluation de l'information]({{< relref "evaluation" >}}).

### Quelles personnes ou sociétés faut-il recouper ?

```
tag IN ("Personne", "Société") AND confidence < 60
```

2 éléments : Samir Benali et Atlas Trading.

### Qu'est-ce qui n'a pas de source ?

```
type = "element" AND source NOT EXISTS
```

16 éléments sur 20. Passez en **EXISTS** pour la liste de ceux qui en ont une (4).

### Qui n'a pas encore reçu de tag ?

```
type = "element" AND tag NOT EXISTS
```

1 élément (une annotation). Pratique pour repérer ce qu'on a oublié de classer.

### Quels rôles sont renseignés, hors suspects ?

```
Rôle EXISTS AND Rôle != "Suspect"
```

2 éléments (un témoin, une victime). Sans `Rôle EXISTS`, le `!=` ramènerait aussi tous les éléments sans rôle : voir [Champ absent]({{< relref "reference#champ-absent" >}}).

---

## Dates et chronologie

### Quels virements après le 1er mars ?

```
type = "link" AND date >= 2024-03-01
```

1 lien : le virement de 85 000 €.

### Quels liens datent de février ?

```
type = "link" AND date >= 2024-02-01 AND date <= 2024-02-29
```

2 liens. Les bornes sont incluses ; `date = 2024-02-12` ne compare que le jour.

### Quels événements après le 1er avril ?

```
event.date >= 2024-04-01
```

2 éléments : la plainte du 8 avril et la perquisition du 14 mai. Les champs `event.*` regardent les événements de chaque élément.

### Quels événements en mars ?

```
type = "element" AND event.date >= 2024-03-01 AND event.date <= 2024-03-31
```

2 éléments. Les deux bornes peuvent venir de deux événements différents d'un même élément : voir [Événements]({{< relref "reference#événements" >}}).

---

## Géographie

### Qu'y a-t-il autour de Marseille ?

```
geo NEAR 43.3,5.4 50km
```

5 éléments. Le rayon s'écrit en `km` ou en `m` ; les coordonnées sont latitude puis longitude, séparées par une virgule, sans espace.

### Où a eu lieu une rencontre près de Luxembourg ?

```
event.geo NEAR 49.6,6.1 10km
```

1 élément : la réunion à Luxembourg. `event.geo` regarde les événements géolocalisés, pas la position de l'élément.

### Quelles personnes fiables vivent près de Marseille ?

```
tag = "Personne" AND confidence >= 70 AND geo NEAR 43.3,5.4 100km
```

1 élément : Marc Delmas.

---

## Graphe

### Qui gravite autour des suspects ?

```
WITHIN 1 HOPS OF Rôle = "Suspect"
```

8 éléments et 11 liens. Passez à `2` pour élargir ; l'ensemble grossit vite sur un dossier dense.

### Qui n'est pas dans leur entourage proche ?

```
type = "element" AND NOT WITHIN 1 HOPS OF Rôle = "Suspect"
```

12 éléments. `NOT WITHIN` inverse le voisinage : tout ce qui est à plus d'un lien d'un suspect.

### Que touchent les comptes peu fiables ?

```
WITHIN 2 HOPS OF (tag = "Compte" AND confidence < 50)
```

9 éléments et 10 liens. Les parenthèses isolent la cible : sans elles, `AND` serait lu en dehors du `WITHIN`.

### Quelles personnes fiables, proches d'un suspect ?

```
tag = "Personne" AND confidence >= 70 AND WITHIN 2 HOPS OF Rôle = "Suspect"
```

3 éléments. Ajoutez `AND geo NEAR 43.3,5.4 100km` pour ne garder que celles qui sont autour de Marseille : il n'en reste qu'une (Marc Delmas).

---

## Liens

### Quels liens arrivent sur un compte ?

```
type = "link" AND to.tag = "Compte"
```

8 liens. `from.tag` et `to.tag` testent les tags des deux extrémités.

### Quelles sociétés possèdent un compte ?

```
type = "link" AND from.tag = "Société" AND to.tag = "Compte"
```

3 liens : les trois « titulaire ». Combiner `from.*` et `to.*` revient à décrire un motif de relation.

### Quels liens sont sans flèche ?

```
type = "link" AND directed = false
```

3 liens : les « titulaire », créés sans flèche.

### Quels montants sont renseignés ?

```
type = "link" AND label MATCHES /^[0-9]+ [0-9]+ €$/
```

3 liens, ceux dont le libellé est un montant (« 120 000 € »). `MATCHES` accepte une expression régulière ; elle est sensible à la casse.

---

## Texte et doublons

### Un nom approché

```
type = "element" AND label LIKE "samir benali"
```

`LIKE` ignore la casse et les accents, et tolère environ une faute de frappe pour cinq lettres. `label LIKE "Delmas Negoce"` retrouve « Delmas Négoce ».

### Tous les comptes, quelle que soit la casse

```
label CONTAINS "compte"
```

3 éléments (`CONTAINS` ne tient pas compte de la casse).

### Un identifiant au bon format

```
SIREN MATCHES /^[0-9]{3} [0-9]{3} [0-9]{3}$/
```

1 élément. Pour repérer les identifiants mal saisis, cherchez ceux qui existent mais ne respectent pas le format : `SIREN EXISTS AND NOT SIREN MATCHES /^[0-9]{3} [0-9]{3} [0-9]{3}$/`. Sans `EXISTS`, le `NOT` ramènerait aussi tous les éléments qui n'ont pas de SIREN.

---

## Combiner : un raisonnement en trois temps

Une requête complexe se construit par couches, en vérifiant le compteur à chaque ajout :

1. `tag = "Personne"` : 4 éléments ;
2. `tag = "Personne" AND confidence >= 70` : 3 ;
3. `tag = "Personne" AND confidence >= 70 AND WITHIN 2 HOPS OF Rôle = "Suspect"` : 3 ;
4. `… AND geo NEAR 43.3,5.4 100km` : 1.

Chaque condition ajoutée ne peut que **réduire** le résultat avec `AND` (ou l'élargir avec `OR`). Si le compteur tombe à zéro, retirez la dernière condition pour trouver laquelle bloque.

---

**Voir aussi** : [Prise en main]({{< relref "_index" >}}) | [Référence]({{< relref "reference" >}}) | [Résultats et intégrations]({{< relref "results" >}})
