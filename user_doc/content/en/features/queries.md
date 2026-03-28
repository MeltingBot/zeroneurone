---
title: "Advanced Queries"
weight: 4
---

# Advanced Queries (ZNQuery)

The **Queries** panel lets you filter your data with a structured language. Two modes are available: a **visual builder** (point and click) and a **text editor** (ZNQuery syntax).

## Accessing the panel

- **Queries** tab in the side panel
- From quick search (Ctrl+K), type `?` followed by your query

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

---

## Available fields

### System fields

| Field | Type | Description |
|-------|------|-------------|
| `label` | text | Element or link name |
| `notes` | text | Associated notes |
| `tag` | text | Tags (matches if at least one tag matches) |
| `confidence` | number | Confidence level (0-100) |
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

Any user-defined property name can be used as a field. If the name contains spaces or special characters, wrap it in double quotes:

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
| `MATCHES` | Regular expression |

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

Mode buttons are at the bottom of the queries panel, next to the results counter.

---

## Saved queries

Save frequently used queries for reuse:

1. Build your query
2. Click **Save** in the "Saved queries" section
3. Name the query

Saved queries are linked to the current dossier.

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
