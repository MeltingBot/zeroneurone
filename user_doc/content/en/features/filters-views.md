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
| **Confidence** | Minimum confidence threshold (ZeroNeurone model) |
| **Grading** | Accepted source and information codes (Europol and Admiralty models) |
| **Properties** | Elements having a specific property |
| **Hidden elements** | Manage manually hidden elements |
| **Isolated** | Elements without connections |

### Date Properties on the Timeline

When the timeline is shown, the **Date properties on the timeline** section lists the dossier's date and date-time property keys, with how many elements fill each one. Uncheck one (a birth date, for instance) to take it off the timeline. Elements stay visible in the other views; event dates and link periods are not affected.

A **\<key\> off the timeline** badge appears in the active filters; **Clear all** brings it back.

### Combine Filters

Filters are cumulative (logical AND): an element must satisfy **all** active criteria to be displayed.

### Hide Manually

Right-click on an element → **Hide** to temporarily remove it from the canvas without deleting it.


Find hidden elements in **Filters** → **Hidden elements**.

---

## Saved Views

A **view** captures the current state of your workspace:

- Active filters
- Viewport position (zoom, pan)
- Hidden elements
- Date properties taken off the timeline
- (Optional) Element positions

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
