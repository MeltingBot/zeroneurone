---
title: "Advanced Queries"
weight: 4
---

# Advanced Queries (ZNQuery)

A filter answers "show me the people". A query answers "show me the credible people, within two links of a suspect, located near Marseille". **ZNQuery** is ZeroNeurone's query language: one short sentence, evaluated live on **every element and every link** of the dossier.

{{< screenshot "query-panel.webp" "Query panel: matching elements are highlighted" >}}

- **Two ways to write it**: a visual builder (point and click) and a text editor (typing, with autocompletion). Both describe the same query, and you can switch between them at any time.
- **No "Run" button**: the query applies as soon as it is valid, and updates when the dossier changes.
- **The result shows everywhere**: non-matching elements fade on the canvas, map, timeline and matrix, or you get a results table.

| Page | What it is for |
|------|----------------|
| **Getting started** (this page) | Write your first query in a few minutes |
| [Language reference]({{< relref "reference" >}}) | Syntax, fields, operators, behaviours to know |
| [Recipes]({{< relref "recipes" >}}) | Ready-made queries, by need |
| [Results and integrations]({{< relref "results" >}}) | Table, groups, saved views, links with other features |

## Accessing the panel

- **Queries** tab in the side panel
- From quick search (Ctrl+K), type `?` followed by your query
- Right-click an element → **Analyze** → **Find similar**: query on a close label (`LIKE`) or the same tags, for example `label LIKE "Jean Martin" OR tag = "Personne"`

---

## Getting started

The examples below use a small fictional dossier, **the Delmas case**: four people, three companies, three accounts, transfers and dated events. [Download it](/downloads/affaire-delmas.zip), then **Import** from the home page (the dossier takes the file's name). Its data is in French: tags `Personne`, `Société`, `Compte`, property `Rôle`.

### 1. A first condition, by clicking

1. Open the dossier, **Queries** tab, **Visual** mode.
2. **Add condition**: field `tag`, operator `=`, value `Personne`. The four people light up on the canvas, everything else fades.
3. **Add condition**: field `confidence`, operator `>=`, value `70`.

Three elements remain: Hélène Roche (90%), Marc Delmas (80%) and Claire Lefort (70%). The **AND** button between conditions means "all at once"; it toggles to **OR** ("either one").

{{< screenshot "znquery-visual.webp" "Visual builder: two conditions combined with AND" >}}

### 2. The same query, as text

Switch to **Text** mode: the query has already been written for you.

```
tag = "Personne" AND confidence >= 70
```

A condition always reads `field operator value`. Keywords (`AND`, `OR`, `NOT`…) can be written in upper or lower case; text values go in double quotes.

### 3. Writing by hand, with autocompletion

Clear the field and type `tag = `: the editor suggests the dossier's tags. It also suggests fields, operators and existing values depending on where you are.

- **↑ / ↓** to browse suggestions
- **Enter** or **Tab** to accept
- **Esc** to close

{{< screenshot "znquery-autocomplete.webp" "Autocompletion: the dossier's tags after tag =" >}}

Try `Rôle = "Suspect"`: two elements. Properties you created work as fields like any other; if their name contains spaces, put it in quotes (`"Date de naissance" EXISTS`).

### 4. When the query is invalid

Type `tag = Personne` (no quotes). The error message appears under the editor, and the previous result stops applying until this query is valid.

{{< screenshot "znquery-error.webp" "Error message under the editor" >}}

Parser messages are in English: "Expected value, got IDENTIFIER 'Personne'" means a value was expected. Most of the time a quote is missing or a parenthesis is not closed.

### 5. Querying links

A query applies to elements **and** links. `type` tells them apart:

```
type = "link" AND date >= 2024-03-01
```

Result: one link, the €85,000 transfer of 19 March. Dates are written `YYYY-MM-DD`, without quotes.

### 6. Searching the neighbourhood

`WITHIN n HOPS OF` selects everything at most `n` links away from an element matching the condition:

```
WITHIN 1 HOPS OF Rôle = "Suspect"
```

Eight elements and eleven links: the two suspects and everything directly connected to them.

{{< screenshot "znquery-within.webp" "WITHIN 1 HOPS: the suspects and their direct neighbourhood" >}}

### 7. Keeping or using the result

The buttons at the top of the panel act on the result: frame it in the view, select it, group it on the canvas, show it as a **table**, save it as a view. Details in [Results and integrations]({{< relref "results" >}}).

{{< hint info >}}
**Three habits to keep**

1. **Links count too.** `NOT tag = "Document"` returns every link, since links do not have that tag. Add `type = "element"` when you only want elements.
2. **Case is ignored**, except for regular expressions (`MATCHES`).
3. **A missing field matches nothing**, except with `!=`: `Rôle != "Suspect"` also returns every element that has no role. The [reference]({{< relref "reference#behaviours-to-know" >}}) details these cases.
{{< /hint >}}

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

**Next**: [Language reference]({{< relref "reference" >}}) | [Recipes]({{< relref "recipes" >}}) | [Results and integrations]({{< relref "results" >}}) | [Filters and views]({{< relref "filters-views" >}})
