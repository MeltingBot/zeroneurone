---
title: "Timeline"
weight: 6
---

# Timeline

Visualize the temporal dimension of your data with the chronological view.


## Activate Timeline

| Method | Action |
|--------|--------|
| Key **4** | Timeline mode |
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

## Display Modes

The timeline offers two modes via the toggle in the toolbar:

### Scatter Mode (default)

Each element occupies its own row. Suited for an overview of the chronology.

| Control | Function |
|---------|----------|
| **Old/Recent** | Reverse vertical order |
| **Causality** | Show temporal proximity links |

### Swimlane Mode

Elements are grouped into **horizontal bands** by criterion. Enables analytical reading of "who does what when" and comparison between categories.

#### Grouping Criteria

| Criterion | Description |
|-----------|-------------|
| **Tag** | One lane per tag (an element with multiple tags appears in each matching lane) |
| **Source** | One lane per source |
| **Property** | One lane per distinct value of a property |

Only criteria with at least 2 distinct values are available.

#### Tag Filtering

When grouping by tag, a selector lets you choose which tags to display:

- **All**: all tags visible (default)
- **Selection**: check/uncheck individual tags
- **None**: uncheck "All" to hide everything

#### Reorder Lanes

Each lane has a **drag handle** (⠿ icon) to the left of the label, visible on hover. Drag and drop to reorder lanes.

The custom order is preserved as long as you don't change the grouping criterion.

#### Collapse Lanes

Click the **chevron** (▶/▼) to the left of the label to collapse/expand a lane. A collapsed lane displays a thin bar with the name and item count.

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

### Zoom Shortcuts

| Button | Result |
|--------|--------|
| **Today** | Center on today's date |
| **Fit all** | Adjust zoom to show all elements |
| **Presets** | Century, Decade, Year, Month, Week, Day, Hour |

---

## Interactions

### Selection

| Action | Result |
|--------|--------|
| **Click** | Selects element/link |
| **Ctrl+click** | Adds to selection |

Selection is synchronized with the canvas: selecting on the timeline selects on the canvas, and vice versa.

---

## Density Bar

A heatmap bar below the time axis shows event concentration at a glance.

### Toggle

Click the **Density** button in the toolbar to show or hide the bar.

### Reading

| Visual | Meaning |
|--------|---------|
| **Dark cell** | High concentration of events |
| **Light cell** | Few events |
| **Empty cell** | No events in that period |

Bucket size adapts automatically to the zoom level (7 days, 14 days, 1 month, 3 months, or 1 year).

### Interaction

**Click** a density cell to activate the temporal filter on that period.

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
| **Dossier timeline** | Visualize the sequence of events |
| **Relationship duration** | See when links exist |
| **Temporal patterns** | Identify activity periods |
| **Analysis by actor** | Swimlanes by tag to compare activity of each category |
| **Source comparison** | Swimlanes by source to evaluate temporal coverage |
| **Presentation** | Tell a story through time |

---

## CSV Export

Click the download icon in the toolbar to export timeline events as CSV. The temporal filter is respected: only visible events are exported.

---

**See also**: [Map View]({{< relref "map-view" >}}) | [Attachments]({{< relref "attachments" >}})
