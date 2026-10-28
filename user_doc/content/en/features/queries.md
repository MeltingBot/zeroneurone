---
title: "Advanced Queries"
weight: 4
---

# Advanced Queries (ZNQuery)

The **Queries** panel lets you filter your data with a structured language. Two modes are available: a **visual builder** (point and click) and a **text editor** (ZNQuery syntax).

## Accessing the panel

- **Queries** tab in the side panel
- From quick search (Ctrl+K), type `?` followed by your query
- Right-click an element → **Analyze** → **Find similar**: query on a close label (`LIKE`) or the same tags, e.g. `label LIKE "Jean Martin" OR tag = "Person"`

---

## Visual mode

The visual builder lets you construct queries without knowing the syntax.

### Adding a condition

1. Click **Add condition**
2. Choose a **field** (label, tag, date, confidence, etc.)
3. Choose an **operator** (=, !=, CONTAINS, EXISTS, etc.)
4. Enter a **value** — the input adapts to the field type:

| Field type | Input |
|------------|-------|
| Text (label, notes, source) | Free text field |
| Date (date, created, event.date) | Date picker |
| Number (confidence, geo.lat) | Numeric input |
| Boolean (has_geo, group, directed) | True/false selector |
| Tag (tag, from.tag, to.tag) | Dropdown of existing tags |
| Geo (has_geo, event.geo) + NEAR | Latitude, longitude, radius, unit |

### Combining conditions

When multiple conditions are present, an **AND/OR** button lets you toggle between:
- **AND**: all conditions must be satisfied
- **OR**: at least one condition must be satisfied

### Nested groups

Click **Add group** to create a sub-group with the opposite combinator (AND inside an OR group, and vice versa). Maximum nesting depth is 2 levels.

In text mode, each group shows in parentheses, even where AND's precedence over OR would make them optional: `tag = "A" OR (tag = "B" AND tag = "C")`.

### Negation (NOT)

Each condition or group has a **NOT** button to negate its result. When active, the condition is bordered in orange on the left.

Visual mode automatically executes the query on every change.

---

## Text mode

Text mode offers more power, especially for nested queries.

### Basic syntax

```
field operator value
```

String values go in double quotes. Dates use ISO format (YYYY-MM-DD).

### Examples

```
tag = "person"
label CONTAINS "bank"
label LIKE "jean martn"
confidence > 70
date >= 2024-01-01
tag = "company" AND country = "FR"
(tag = "person" OR tag = "company") AND confidence > 50
NOT (tag = "archived")
```

### Logical operators

| Operator | Description |
|----------|-------------|
| **AND** | Both conditions must be true |
| **OR** | At least one condition must be true |
| **NOT** | Negates the condition |
| **( )** | Grouping to control precedence |

### Graph predicate: `WITHIN n HOPS OF`

Selects every element within **at most `n` links** of an element matching a **target sub-query**. Useful for neighborhood exploration: "everything within 2 hops of a suspect".

```
WITHIN 2 HOPS OF tag = "suspect"
```

- The target is a parenthesized query for compound conditions: `WITHIN 1 HOPS OF (tag = "suspect" AND city = "Paris")`.
- `WITHIN 0 HOPS OF …` matches exactly the target set.
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

## Display modes

After execution, two display modes are available (can be combined):

| Mode | Icon | Description |
|------|------|-------------|
| **Canvas filter** | Funnel | Dims non-matching elements on the canvas, map, timeline and matrix |
| **Table** | Grid | Shows results in a sortable table with CSV export |

Mode buttons are at the top of the queries panel, next to the results counter.

When filters of the **Filters** panel are active too, the views show only the elements both keep: the counter says so ("18 elements, 0 links → 12 shown"). To hide the elements outside the filter instead of dimming them, use **Hide** in the Filters panel (see [Filters and Views]({{< relref "filters-views" >}})).

When the query finds links, the canvas filter keeps the elements at both ends of the found links highlighted and dims the rest.

### Result actions

- **Show results** (target icon): frames the view on what the query found, link ends included (canvas; map for geolocated elements; the timeline goes to the first one)
- **Select / Deselect** (toggle): selects the results, or removes them from the selection when they are all selected already. When the query filters the canvas, it acts on the elements shown (filters included), like the Filters panel button, with which it stays in sync
- **Invert selection**: selects what the query did not find, of the same kind as its results (the other elements, or the other links); hidden elements are left out. Clicking again selects the results again; the button stays highlighted while the inverse is selected
- **Save as view**: creates a saved view that keeps the query, the filters and the dim / hide choice
- **Click a row** (table mode): selects the element and centers the viewport on it

### Automatic refresh

The query automatically re-executes when dossier data changes (element/link additions, modifications, or deletions).

---

## Query history

The last 5 executed queries are remembered during the session. Click the clock icon to show the history and reapply a previous query.

---

## Saved queries

Save frequently used queries for reuse:

1. Build your query
2. Click **Save** in the "Saved queries" section
3. Name the query

Saved queries are linked to the current dossier. When one is loaded, its text is rebuilt from its structure, groups in parentheses included.

---

## Practical examples

### Find people in France

```
tag = "person" AND country = "FR"
```

### Recent events near Marseille

```
event.date >= 2024-01-01 AND event.geo NEAR 43.3,5.4 50km
```

### Links between suspicious companies

```
type = "link" AND from.tag = "company" AND confidence < 40
```

### Elements of multiple types

```
tag IN ("person", "company") AND confidence > 50
```

### Elements without a source

```
source NOT EXISTS
```

### Regex search on an identifier

```
"SIREN Number" MATCHES /^[0-9]{9}$/
```

---

**See also**: [Filters and Views]({{< relref "filters-views" >}}) | [Search]({{< relref "search" >}})
