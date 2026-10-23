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

### Date Properties

The **Date properties** section lists the dossier's date and date-time property keys, with how many elements fill each one. These dates place the elements on the timeline, on the map and in the canvas time cursor.

- **No chip selected**: every date property counts.
- **Select chips**: only those count (for instance "Start of facts" and "End of facts", without the birth date). A date property imported later does not count until you select it.

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

**Focus** mode (key **F**) isolates an element and its direct neighborhood.


### Neighborhood Levels

Configure the focus depth:

| Level | Display |
|-------|---------|
| **1** | Element + direct neighbors |
| **2** | + neighbors of neighbors |
| **3** | Extended neighborhood |

### Exit Focus Mode

- **Escape** key
- Click **Exit focus** in the toolbar

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


### Link Style

| Option | Values |
|--------|--------|
| **Anchor** | Auto, center, edges |
| **Curve** | Straight, curved, orthogonal |


---

**See also**: [Graph analysis]({{< relref "graph-analysis" >}})
