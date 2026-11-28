---
title: "ZNQuery Recipes"
weight: 2
---

# ZNQuery recipes

Queries ready to paste into the text editor, grouped by need. Adapt tag and property names to your dossier. Results shown are those of the sample dossier from [Getting started]({{< relref "_index#getting-started" >}}), **All** tab.

{{< hint info >}}
Add `type = "element"` (or `type = "link"`) up front when you only want one of the two categories: a query applies to elements **and** links. See the [reference]({{< relref "reference#elements-and-links" >}}).
{{< /hint >}}

---

## Information quality

### Which are the least reliable?

```
type = "element" AND confidence < 60
```

Elements with a low confidence (3 elements). With a Europol or Admiralty grading, query the codes instead: `evaluation.source = "A"` or `evaluation = "B2"`. See [Information evaluation]({{< relref "evaluation" >}}).

### Which people or companies need cross-checking?

```
tag IN ("Personne", "Société") AND confidence < 60
```

2 elements: Samir Benali and Atlas Trading.

### What has no source?

```
type = "element" AND source NOT EXISTS
```

16 elements out of 20. Switch to **EXISTS** for those that do have one (4).

### What has not been tagged yet?

```
type = "element" AND tag NOT EXISTS
```

1 element (an annotation). Handy to spot what you forgot to classify.

### Which roles are filled in, apart from suspects?

```
Rôle EXISTS AND Rôle != "Suspect"
```

2 elements (a witness, a victim). Without `Rôle EXISTS`, the `!=` would also return every element with no role: see [Missing field]({{< relref "reference#missing-field" >}}).

---

## Dates and chronology

### Which transfers after 1 March?

```
type = "link" AND date >= 2024-03-01
```

1 link: the €85,000 transfer.

### Which links date from February?

```
type = "link" AND date >= 2024-02-01 AND date <= 2024-02-29
```

2 links. Bounds are inclusive; `date = 2024-02-12` only compares the day.

### Which events after 1 April?

```
event.date >= 2024-04-01
```

2 elements: the 8 April complaint and the 14 May search. `event.*` fields look at each element's events.

### Which events in March?

```
type = "element" AND event.date >= 2024-03-01 AND event.date <= 2024-03-31
```

2 elements. The two bounds may come from two different events of the same element: see [Events]({{< relref "reference#events" >}}).

---

## Geography

### What is around Marseille?

```
geo NEAR 43.3,5.4 50km
```

5 elements. The radius is written in `km` or `m`; coordinates are latitude then longitude, separated by a comma, no space.

### Where did a meeting near Luxembourg take place?

```
event.geo NEAR 49.6,6.1 10km
```

1 element: the Luxembourg meeting. `event.geo` looks at geolocated events, not the element's own position.

### Which reliable people live near Marseille?

```
tag = "Personne" AND confidence >= 70 AND geo NEAR 43.3,5.4 100km
```

1 element: Marc Delmas.

---

## Graph

### Who revolves around the suspects?

```
WITHIN 1 HOPS OF Rôle = "Suspect"
```

8 elements and 11 links. Switch to `2` to widen; the set grows fast on a dense dossier.

### Who is not in their close circle?

```
type = "element" AND NOT WITHIN 1 HOPS OF Rôle = "Suspect"
```

12 elements. `NOT WITHIN` inverts the neighbourhood: everything more than one link away from a suspect.

### What do the unreliable accounts touch?

```
WITHIN 2 HOPS OF (tag = "Compte" AND confidence < 50)
```

9 elements and 10 links. The parentheses isolate the target: without them, `AND` would be read outside the `WITHIN`.

### Which reliable people are close to a suspect?

```
tag = "Personne" AND confidence >= 70 AND WITHIN 2 HOPS OF Rôle = "Suspect"
```

3 elements. Add `AND geo NEAR 43.3,5.4 100km` to keep only those around Marseille: only one remains (Marc Delmas).

---

## Links

### Which links arrive on an account?

```
type = "link" AND to.tag = "Compte"
```

8 links. `from.tag` and `to.tag` test the tags of both ends.

### Which companies hold an account?

```
type = "link" AND from.tag = "Société" AND to.tag = "Compte"
```

3 links: the three "titulaire". Combining `from.*` and `to.*` amounts to describing a relationship pattern.

### Which links have no arrow?

```
type = "link" AND directed = false
```

3 links: the "titulaire" ones, created without an arrow.

### Which amounts are filled in?

```
type = "link" AND label MATCHES /^[0-9]+ [0-9]+ €$/
```

3 links, those whose label is an amount ("120 000 €"). `MATCHES` takes a regular expression; it is case-sensitive.

---

## Text and duplicates

### An approximate name

```
type = "element" AND label LIKE "samir benali"
```

`LIKE` ignores case and accents, and tolerates about one typo per five letters. `label LIKE "Delmas Negoce"` finds "Delmas Négoce".

### All accounts, whatever the case

```
label CONTAINS "compte"
```

3 elements (`CONTAINS` ignores case).

### An identifier in the right format

```
SIREN MATCHES /^[0-9]{3} [0-9]{3} [0-9]{3}$/
```

1 element. To spot badly typed identifiers, look for those that exist but break the format: `SIREN EXISTS AND NOT SIREN MATCHES /^[0-9]{3} [0-9]{3} [0-9]{3}$/`. Without `EXISTS`, the `NOT` would also return every element that has no SIREN.

---

## Combining: reasoning in layers

A complex query is built in layers, checking the counter at each addition:

1. `tag = "Personne"`: 4 elements;
2. `tag = "Personne" AND confidence >= 70`: 3;
3. `tag = "Personne" AND confidence >= 70 AND WITHIN 2 HOPS OF Rôle = "Suspect"`: 3;
4. `… AND geo NEAR 43.3,5.4 100km`: 1.

Each condition added with `AND` can only **narrow** the result (or widen it with `OR`). If the counter drops to zero, remove the last condition to find which one blocks.

---

**See also**: [Getting started]({{< relref "_index" >}}) | [Reference]({{< relref "reference" >}}) | [Results and integrations]({{< relref "results" >}})
