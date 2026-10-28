---
title: "Filters and Views"
weight: 3
---

# Filters and Views

Master the complexity of your data with **filters** and save your configurations with **views**.

## Filters

The **Filters** panel allows you to show or hide elements based on various criteria.


### Filter Types

| Filter | Description |
|--------|-------------|
| **Text search** | Filter by label or notes |
| **Tags** | Include/exclude by tags |
| **Tabs** | In **All**: keep only the elements of the ticked tabs |
| **Confidence** | Minimum confidence threshold (ZeroNeurone model) |
| **Grading** | Accepted source and information codes (Europol and Admiralty models) |
| **Properties** | Elements having a specific property |
| **Hidden elements** | Manage manually hidden elements |
| **Isolated** | Elements without connections |

### Quick Filters

Each quick filter names a set of elements of the view (the open tab, or the whole dossier in **All**): **Isolated**, **No tags**, **No geo**, **No date**, **Low confidence** (or **Reliable sources** with a grading), unresolved **Comments**. Each chip shows its element count.

The three icons right of the title choose what a click does:

| Mode | Effect |
|------|--------|
| **Hide** | Hides these elements |
| **Only these** | Hides all the others |
| **Select** | Selects these elements (to move, tag or merge them…) |

A second click undoes what the chip did, and only that: elements hidden by hand stay hidden.

### Date Properties

The **Date properties** section lists the dossier's date and date-time property keys, with how many elements fill each one. These dates place the elements on the timeline, on the map and in the canvas time cursor.

- **By default**: every date property is checked and counts.
- **Uncheck a chip** (struck through): its dates no longer place the elements on the timeline and the map (for instance the birth date). A second click checks it again. A date property imported later is checked from the start.

A **Dates n/total** badge then appears in the active filters; its cross brings all dates back.

#### Periods

Under the chips, **+ Period** reads two date properties as one period: pick the start and the end ("Start of facts → End of facts"), then confirm. An element that fills both shows as a bar on the timeline and stays active over the whole period on the map and the canvas. If it fills only one, or the end comes before the start, both dates stay points.

Periods are a setting: **Clear all** keeps them.

{{< hint info >}}
An element's **collection date** (when the information was added) dates it in no view and no filter: only its period, its dated events and its date properties count.
{{< /hint >}}

### Combine Filters

Filters are cumulative (logical AND): an element must satisfy **all** active criteria to be displayed.

### Filters and Query

A query applied on the canvas (**Query** panel) narrows the views on top of the filters: an element is shown when both keep it. The Filters panel header counts these shown elements; when both are active, a line gives each one's share ("Filters 598 · Query 44"). The query appears as a **Query** badge in the active filters; its cross takes the query off the views without clearing it.

**Clear all** takes the filters and the query off the views (the query stays in its panel).

**Select / Deselect** selects the shown elements, or removes them from the selection when they are all selected already. The Query panel button does the same and stays in sync.

### Dim or Hide

By default, elements outside the filters are **dimmed**. The **Hide** button of the "Active filters" box removes them from every view (canvas, timeline, map, matrix), links included. This choice is not kept from one session to the next, unless saved in a view.

### Hide Manually

Right-click on an element → **Hide** to temporarily remove it from the canvas without deleting it.


Find hidden elements in **Filters** → **Hidden elements**.

---

## Saved Views

A **view** captures the current state of your workspace:

- Active filters, including the date properties kept and the periods
- The dim / hide choice
- The query applied (Query panel)
- Viewport position (zoom, pan)
- Hidden elements
- (Optional) Element positions

A view saved before ZeroNeurone 2.71 changes neither the dim / hide choice nor the current query.

### Save a View

1. Configure your filters and viewport
2. **Views** panel → **Save view**
3. Give the view a name


### Save Options

| Option | Description |
|--------|-------------|
| **Include positions** | Also saves each element's position |

### Load a View

Click on a saved view to load it instantly.


### Use Cases

- **"Main actors" view**: Filter on people, confidence > 70%
- **"Q1 Timeline" view**: Elements from January to March
- **"Presentation" view**: Positions arranged for a meeting

---

## Focus Mode

Right-click an element ▸ **Focus mode**, then the depth, to isolate the element and its neighborhood:

| Level | Display |
|-------|---------|
| **Direct neighbors** | Element + linked elements |
| **2-link neighbors** | + neighbors of neighbors |
| **3-link neighbors** | Extended neighborhood |

Focus writes and runs the matching [ZNQuery query]({{< relref "queries" >}}), for instance `WITHIN 2 HOPS OF label = "John Smith"`, and opens its panel: you can edit it, save it or keep it in a view. The element is designated by its label, or by its id (`_id = "…"`) when another element bears the same label. In a tab, only its members are kept.

To leave focus, clear the query in the ZNQuery panel.

---

## Canvas Display

The **Views** panel also controls general display:

### Display Options

| Option | Description |
|--------|-------------|
| **Link labels** | Show/hide labels |
| **Confidence / grading indicator** | Badge with the confidence (`70%`) or the grading (`B2`) depending on the [evaluation model]({{< relref "evaluation" >}}) |
| **Tags** | Tag display mode |
| **Property badges** | Properties displayed on nodes |
| **Element size by number of links** | Highly linked elements are drawn larger (see [Graph analysis]({{< relref "graph-analysis" >}})) |


### Link Style

| Option | Values |
|--------|--------|
| **Anchor** | Auto, center, edges |
| **Curve** | Straight, curved, orthogonal |


---

**See also**: [Graph analysis]({{< relref "graph-analysis" >}})
