---
title: "Timeline"
weight: 6
---

# Timeline

Visualize the temporal dimension of your data with the chronological view.


## Activate Timeline

| Method | Action |
|--------|--------|
| Key **3** | Timeline mode |
| View button | Click on the timeline icon |

---

## Elements on Timeline

### Elements with Date

Elements having a **date** appear on the timeline:

- **Point**: single date
- Horizontal position = moment in time


### Links with Period

Links having a **period** (start/end date) appear as **bars**:

- Length = duration
- Position = covered period


---

## Navigation

### Temporal Zoom

| Action | Result |
|--------|--------|
| **Wheel** | Zoom on time scale |
| **Ctrl+wheel** | Fine zoom |

### Time Scales

Zoom automatically adjusts the scale:

| Level | Display |
|-------|---------|
| Years | Decades, years |
| Months | Years, months |
| Weeks | Months, weeks |
| Days | Weeks, days |


### Scrolling

| Action | Result |
|--------|--------|
| **Drag** | Move through time |
| **Click axis** | Center on that date |

---

## Vertical Organization

### Lanes (swimlanes)

Elements are organized in **lanes** to avoid overlaps.


### Grouping

Option to group by:

| Grouping | Organization |
|----------|--------------|
| **Auto** | Minimizes overlaps |
| **By tag** | One lane per main tag |
| **By color** | One lane per color |

---

## Interactions

### Selection

| Action | Result |
|--------|--------|
| **Click** | Selects element/link |
| **Ctrl+click** | Adds to selection |
| **Double-click** | Opens editing |

### Date Modification

**Drag** an element horizontally to change its date.

**Drag** the ends of a link to modify the period.


---

## Synchronization

In timeline mode, selection stays synchronized with the canvas:

- Select on timeline → selected on canvas
- Filters also apply to timeline


---

## Temporal Filter

The temporal filter allows you to restrict the display to a specific period.

### Activate the Filter

Click the **Filter** button in the toolbar to show the date range slider.

### Filter Controls

| Element | Function |
|---------|----------|
| **Handles** | Drag to set start/end of period |
| **Center area** | Drag to move the entire window |
| **Date fields** | Enter precise dates |
| **Play/Pause** | Automatic animation through time |
| **Forward/Back** | Manual shift by 30 days |
| **X** | Clear the filter |

### Time Animation

The **Play** button animates the filter window through time:
- Preserves the duration of the selected window
- Advances by one day every 100ms
- Automatically stops at end of timeline

### Indicator

When a filter is active, the counter displays "X / Y events" to indicate how many elements are visible out of the total.


---

## Use Cases

| Scenario | Usage |
|----------|-------|
| **Investigation timeline** | Visualize the sequence of events |
| **Relationship duration** | See when links exist |
| **Temporal patterns** | Identify activity periods |
| **Presentation** | Tell a story through time |

---

**See also**: [Attachments]({{< relref "attachments" >}})
