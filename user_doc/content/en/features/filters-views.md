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
| **Confidence** | Minimum confidence threshold |
| **Properties** | Elements having a specific property |
| **Hidden elements** | Manage manually hidden elements |
| **Isolated** | Elements without connections |

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
| **Confidence indicator** | Colored border based on confidence |
| **Tags** | Tag display mode |
| **Property badges** | Properties displayed on nodes |


### Link Style

| Option | Values |
|--------|--------|
| **Anchor** | Auto, center, edges |
| **Curve** | Straight, curved, orthogonal |


---

**See also**: [Graph analysis]({{< relref "graph-analysis" >}})
