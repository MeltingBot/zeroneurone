---
title: "Results and integrations"
weight: 3
---

# Results and integrations

A query is not only for looking: its result can be shown, selected, grouped, kept, and found again in other ZeroNeurone features.

{{< screenshot "znquery-table.webp" "Table mode: results with the fields tested by the query" >}}

## Display modes

After execution, two display modes are available (can be combined):

| Mode | Icon | Description |
|------|------|-------------|
| **Canvas filter** | Funnel | Dims non-matching elements on the canvas, map, timeline and matrix |
| **Table** | Grid | Shows results in a sortable table: the label, then the fields the query tests. The CSV export adds the other properties |

Mode buttons are at the top of the queries panel, next to the results counter.

When filters of the **Filters** panel are active too, the views show only the elements both keep: the counter says so ("18 elements, 0 links → 12 shown"). To hide the elements outside the filter instead of dimming them, use **Hide** in the Filters panel (see [Filters and Views]({{< relref "filters-views" >}})).

When this panel is empty, the filters write their own query in it (`type = "element" AND tag = "Person"`): edit it to go further, it then takes over the filters it said (see [Filters and Views]({{< relref "filters-views" >}})).

When the query finds links, the canvas filter keeps the elements at both ends of the found links highlighted and dims the rest.

### Result actions

- **Show results** (target icon): frames the view on what the query found, link ends included (canvas; map for geolocated elements; the timeline goes to the first one)
- **Select / Deselect** (toggle): selects the results, or removes them from the selection when they are all selected already. When the query filters the canvas, it acts on the elements shown (filters included), like the Filters panel button, with which it stays in sync
- **Invert selection**: selects what the query did not find, of the same kind as its results (the other elements, or the other links); hidden elements are left out. Clicking again selects the results again; the button stays highlighted while the inverse is selected
- **Group the results**: puts the elements found in a new group on the canvas, where they stand, named after the query (can be renamed). Elements already in a group and groups themselves are left out; at least two are needed. A single **Ctrl+Z** undoes it. To tighten a scattered group: right-click the group → **Gather members** (see [Groups]({{< relref "elements-links#groups" >}}))
- **Save as view**: creates a saved view that keeps the query, the filters and the dim / hide choice
- **Click a row** (table mode): selects the element and shows it in the active view (canvas, map or timeline); a link is shown with its two ends

### Grouping results

In table mode, the **Group by** list groups the results by a field: `tag`, `in_group` (canvas group), `country` or a property found in the results. The table then shows one row per value with the number of results, largest first; results without a value are grouped in the last row.

- A result holding several values (several tags, nested groups) counts in each of its rows, as in a query: a member of "Team A", itself inside "Network", counts in both rows.
- **Click a row**: selects the results with that value and frames them in the view.
- **Export CSV** then exports the values and their counts.

{{< screenshot "znquery-table-grouped.webp" "Group by tag: one row per value, with the result count" >}}

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

A **saved view** also keeps the canvas state: filters, query, fade or hide choice (see [Filters and views]({{< relref "filters-views" >}})).

---

## In the rest of ZeroNeurone

| Where | What the query does |
|-------|---------------------|
| **Canvas, map, timeline, matrix** | Fades what does not match (or hides it, from the Filters panel) |
| **Quick search** (Ctrl+K) | `?` followed by a query applies it without opening the panel |
| **Filters** | Ticking a tag or a confidence range writes the equivalent query in the panel when it is empty |
| **Matrix** | Column filters (`column = "value"`) become a query with **All views**, to apply everywhere |
| **Link suggestions** | A query applied as a filter restricts the analysis to its results |
| **Synthesis** | Select the results, then open the synthesis: it opens on the current selection |
| **Groups** | **Group results** creates a group named after the query |

Details: [Filters and views]({{< relref "filters-views" >}}), [Matrix view]({{< relref "matrix-view" >}}), [Link suggestions]({{< relref "link-suggestions" >}}), [Synthesis]({{< relref "synthesis" >}}).

---

**See also**: [Getting started]({{< relref "_index" >}}) | [Reference]({{< relref "reference" >}}) | [Recipes]({{< relref "recipes" >}})
