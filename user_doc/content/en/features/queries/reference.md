---
title: "ZNQuery Reference"
weight: 1
---

# ZNQuery language reference

This page describes the language in detail. To learn it step by step, start with [Getting started]({{< relref "_index" >}}); for ready-made examples, see the [recipes]({{< relref "recipes" >}}).

## Anatomy of a query

```
field operator value
```

A query is a condition, or several conditions combined with `AND`, `OR`, `NOT` and parentheses. It is evaluated **separately on each element and each link** of the dossier: those for which it is true form the result.

```
tag = "Personne" AND (confidence >= 70 OR source EXISTS)
```

### Writing rules

| Topic | Rule |
|-------|------|
| Keywords | `AND`, `OR`, `NOT`, `IN`, `EXISTS`, `WITHIN`… in upper or lower case |
| Field names | Case-insensitive: `Label`, `label` and `LABEL` are the same field |
| Unquoted field | Letters (accents included), digits, `_` and `.`: `Identité`, `from.tag`, `event.date` |
| Quoted field | Required as soon as there is a space, a hyphen or any other character: `"Numéro SIREN"`, `"Date de naissance"` |
| Spaces and line breaks | Free: a long query can span several lines |
| Comments | `--` until the end of the line |

```
-- unreliable companies
tag = "Société"
  AND confidence < 60   -- adjust the threshold
```

### Values

| Type | Writing | Examples |
|------|---------|----------|
| Text | In double quotes. `\"` for a quote, `\\` for a backslash | `"Jean Dupont"` |
| Number | Integer or decimal, may be negative | `70`, `3.14`, `-7` |
| Date | `YYYY-MM-DD`, no quotes | `2024-03-01` |
| Boolean | `true` or `false` | `has_geo = true` |
| Regular expression | Between slashes, with `MATCHES` | `/^[0-9]{9}$/` |
| List | In parentheses, comma-separated, with `IN` | `("FR", "DE")` |

An unquoted text value is an error: `tag = Personne` fails, `tag = "Personne"` works.

### Examples

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

## Combining conditions

| Operator | Meaning |
|----------|---------|
| `AND` | Both sides must be true |
| `OR` | At least one side must be true |
| `NOT` | Negates the condition or group that follows |
| `( )` | Groups to force the order of evaluation |

**Precedence: `NOT`, then `AND`, then `OR`.** Without parentheses, `AND` binds tighter than `OR`, which often surprises:

```
tag = "Personne" OR tag = "Société" AND confidence > 80
```

reads `tag = "Personne"` **OR** (`tag = "Société"` AND `confidence > 80`): all people, plus reliable companies. To keep reliable people **and** companies, add parentheses:

```
(tag = "Personne" OR tag = "Société") AND confidence > 80
```

When in doubt, use parentheses: they cost nothing.

### Graph predicate: `WITHIN n HOPS OF`

Selects every element within **at most `n` links** of an element matching a **target sub-query**. Useful for neighbourhood exploration: "everything within 2 hops of a suspect".

```
WITHIN 2 HOPS OF tag = "suspect"
```

- The target is a parenthesized query for compound conditions: `WITHIN 1 HOPS OF (tag = "suspect" AND city = "Paris")`.
- `n` is a non-negative integer. Singular `HOP` is accepted. `WITHIN 0 HOPS OF …` matches exactly the target set.
- Traversal is **undirected** (link direction is ignored). A link is kept when both of its endpoints are in range.
- Combines with other operators: `type = "element" AND WITHIN 2 HOPS OF tag = "suspect"`, or `NOT WITHIN 1 HOPS OF tag = "suspect"`.
- Authored in **text mode** (the visual builder shows it read-only).

---

## Available fields

### System fields

| Field | Type | Description |
|-------|------|-------------|
| `label` | text | Element or link name |
| `_id` | text | Internal id of the element or link, shown at the foot of the Detail panel (a click copies it); a property named "id" stays queryable as `id` |
| `notes` | text | Associated notes |
| `tag` | text | Tags (matches if at least one tag matches) |
| `confidence` | number | Confidence level (0-100) |
| `evaluation` | text | Full grading (e.g. `"B2"`) |
| `evaluation.source` | text | Source reliability code (e.g. `"B"`) |
| `evaluation.info` | text | Information accuracy code (e.g. `"2"`) |
| `evaluation.scale` | text | Grid of the grading (`"europol"` or `"admiralty"`) |
| `source` | text | Information source |
| `date` | date | Element date |
| `date.start` | date | Date range start |
| `date.end` | date | Date range end |
| `created` | date | Creation date |
| `updated` | date | Last modification date |
| `type` | text | "element" or "link" |
| `has_geo` | boolean | Has geo coordinates |
| `group` | boolean | Is a group |
| `in_group` | text | Name of the group holding the element, and of the groups around that one |
| `country` | text | Country (properties of type country) |

### Link fields

| Field | Type | Description |
|-------|------|-------------|
| `from.label` | text | Source element label |
| `from.tag` | text | Source element tags |
| `to.label` | text | Target element label |
| `to.tag` | text | Target element tags |
| `directed` | boolean | Directed link |

### Event fields

Elements can contain **events**. The `event.*` fields use **ANY** semantics: an element matches if at least one of its events satisfies the condition.

| Field | Type | Description |
|-------|------|-------------|
| `event.date` | date | Event date |
| `event.date.end` | date | Event end date |
| `event.label` | text | Event label |
| `event.description` | text | Description |
| `event.source` | text | Event source |
| `event.geo` | boolean / geo | Geolocated event |

### Geographic fields

| Field | Type | Description |
|-------|------|-------------|
| `geo.lat` | number | Latitude |
| `geo.lng` | number | Longitude |
| `event.geo.lat` | number | Event latitude |
| `event.geo.lng` | number | Event longitude |

### Custom properties

Any user-defined property name can be used as a field, accents included (`Identité = "SFR"`). An element may carry the same property several times (after a merge, say three "Identité"): a condition holds when **one** of the values meets it, and `!=` holds when **none** is equal, so `Identité != "SFR"` leaves out an element holding "SFR" among its values. The same goes for tags.

If the name contains spaces or special characters, wrap it in double quotes:

```
"SIREN Number" MATCHES /^[0-9]{9}$/
city = "Paris"
```

---

## Operators

### Comparison

| Operator | Description | Types |
|----------|-------------|-------|
| `=` | Equal (case-insensitive for text) | all |
| `!=` | Not equal | all |
| `>` | Greater than | number, date |
| `<` | Less than | number, date |
| `>=` | Greater than or equal | number, date |
| `<=` | Less than or equal | number, date |

### Text

| Operator | Description |
|----------|-------------|
| `CONTAINS` | Contains the substring |
| `STARTS` | Starts with |
| `ENDS` | Ends with |
| `LIKE` | Approximate: case and accents ignored, each word must resemble a word of the field (about 1 typo per 5 letters, words of 3 letters or less exact) |
| `MATCHES` | Regular expression |

### Set membership

| Operator | Syntax | Description |
|----------|--------|-------------|
| `IN` | `field IN ("a", "b", "c")` | Field matches one of the listed values |

```
tag IN ("person", "company", "organization")
country IN ("FR", "DE", "ES")
```

### Existence

| Operator | Description |
|----------|-------------|
| `EXISTS` | Field exists and is not empty |
| `NOT EXISTS` | Field does not exist or is empty |

### Geographic

| Operator | Syntax | Description |
|----------|--------|-------------|
| `NEAR` | `geo NEAR lat,lng radius` | Proximity (Haversine distance) |

The radius is expressed in **km** or **m**:

```
geo NEAR 43.3,5.4 200km
geo NEAR 48.85,2.35 500m
event.geo NEAR 43.3,5.4 50km
```

---

## Behaviours to know

The cases that surprise most often, with what actually happens. All examples were checked on the sample dossier from [Getting started]({{< relref "_index" >}}).

### Scope: the current tab

In a tab, the query covers **the elements of that tab** and the links between them; it runs again when you switch tabs. On the sample dossier, `created >= 2020-01-01` returns 20 elements and 23 links in **All**, but 8 elements and 8 links in the "Flux financiers" tab. Active filters work the same way. See [Canvas tabs]({{< relref "canvas-tabs" >}}).

### Elements and links

The query applies to both. A link has a label, notes, a confidence, a source, dates, tags and properties, like an element; it has no geolocation and no events.

| Query | Result on the sample dossier |
|-------|------------------------------|
| `confidence >= 70` | 5 elements **and** 5 links |
| `type = "element" AND confidence >= 70` | 5 elements |
| `type = "link" AND confidence >= 70` | 5 links |

### Missing field

When the field does not exist on the element (no `Rôle` property, no coordinates, no date), **every condition is false**, except two:

- `field NOT EXISTS` is true;
- `field != value` is true.

Hence this classic trap: `Rôle != "Suspect"` does not mean "has a role other than suspect" but "is not a suspect", including everything with no role. On the sample dossier it returns 18 elements and 23 links. For "a role is set, other than suspect":

```
Rôle EXISTS AND Rôle != "Suspect"
```

### Multi-valued fields

Tags, `in_group`, `country` and properties that appear several times (after a merge, for instance) carry several values. A condition is true when **any** of them satisfies it. For `!=` it is the opposite: true when **none** is equal.

### Case, accents and approximation

| Operator | Case | Accents |
|----------|------|---------|
| `=`, `!=`, `IN` | Ignored | Count: `"Societe"` does not find `Société` |
| `CONTAINS`, `STARTS`, `ENDS` | Ignored | Count |
| `LIKE` | Ignored | Ignored, with typo tolerance |
| `MATCHES` | **Respected** | Count |

`MATCHES` uses JavaScript regular expressions, with no flags: no `/i`. To ignore case, write the variants (`/[Dd]elmas/`). To put a slash in the pattern, escape it with a backslash: `/a\/b/`. An invalid expression matches nothing and shows no error.

### Dates

- `date = 2024-03-19` compares the **day** only, time ignored.
- `>`, `<`, `>=`, `<=` compare the instant; a date without a time is midnight, local time.
- For an element or a link, `date` is its date, or failing that the **start** of its period (`date.start`). An element with neither date nor period has no `date`.
- `created` and `updated` are the creation and last modification dates.
- A date-type property compares the same way.

### Events

`event.*` fields test an element's events with **"at least one"** logic: `event.date >= 2024-04-01 AND event.label = "Dépôt"` is true if the element has one event meeting both conditions **or** two different events each meeting one. There is no way to bind two conditions to the **same** event.

{{< hint warning >}}
Links have no events: every `event.*` condition is false on a link.
{{< /hint >}}

### Geography

`geo NEAR lat,lng radius` compares with the element's point (the centre for an area). `event.geo NEAR …` compares with geolocated events. An element with no coordinates is never "near" anything. The radius is in `km` or `m`; without a unit it is in kilometres.

## Errors

When the query is invalid, the panel shows a message under the editor and **does not apply the query**: the old result disappears until the text is correct.

| Message | Usual cause |
|---------|-------------|
| `Expected value, got IDENTIFIER 'x'` | Text value without quotes |
| `Expected value, got EOF` | Query stopped after the operator |
| `Expected operator after field 'x'` | Unknown field name or forgotten operator |
| `Unexpected character: '['` | `IN [...]`: lists are written with parentheses |
| `Unterminated string` | Closing quote missing |
| `Unexpected token ')'` | Extra or misplaced parenthesis |
| `Expected 'HOPS' after the hop count` | `WITHIN 2 OF …`: `HOPS` is missing |

A field that exists nowhere is not an error: the query is valid, it just finds nothing. A typo in a property name therefore gives zero results with no message. Autocompletion avoids the pitfall.

## What ZNQuery does not do

ZNQuery selects, it does not compute:

- **no sorting or counting**: "elements that have more than five links" is a job for [Insights]({{< relref "graph-analysis" >}});
- **no comparison between two fields**: `date.end > date.start` does not exist, a value is always a constant;
- **no case-insensitive regular expression** (see above);
- **a single kind of graph walk**: `WITHIN` follows links without any condition on their nature. To restrict to links with a given label, use a [tab]({{< relref "canvas-tabs" >}}) or filters.

---

**See also**: [Getting started]({{< relref "_index" >}}) | [Recipes]({{< relref "recipes" >}}) | [Results and integrations]({{< relref "results" >}})
