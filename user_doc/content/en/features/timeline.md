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

Elements' date properties show too. In the **Filters** panel → **Date properties**, uncheck the ones that should not count (the birth date, for instance), and declare two properties as a **period** ("Start of facts → End of facts"): the element then shows as a bar from one to the other. See [Filters and Views]({{< relref "filters-views" >}}).


### Links with Period

Links having a **period** (start/end date) appear as **bars**:

- Length = duration
- Position = covered period

### Labels

When a bar is too short, its thumbnail and label are shown right after it. Point events have their label on the right.

On hover, a tooltip shows the dates. A time entered in another zone is followed by the original time: `02:12 (03:12 Beirut)`. See [Dates and Time Zones]({{< relref "dates-timezones" >}}).


---

## Display Modes

The timeline offers two modes via the toggle in the toolbar:

### Scatter Mode (default)

Each element occupies its own row. Suited for an overview of the chronology.

| Control | Function |
|---------|----------|
| **Old/Recent** | Reverse vertical order |
| **Activity** | Breakdown histogram by hour, weekday or month (see [Activity histogram](#activity-histogram)) |
| **Causality** | Marks events closely preceded or followed by an event of a linked element (counter); click an event to show its potential causes and consequences, Esc to go back |

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
| **Click** | Selects element/link and opens its details in the panel |
| **Ctrl+click** | Adds to selection |

Selection is synchronized with the canvas: selecting on the timeline selects on the canvas, and vice versa.

If the selection changed in another view, the timeline scrolls to the selected element's date and row when you come back. An unchanged selection keeps your position.

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

## Activity Histogram

The **Activity** button shows, above the timeline, how events are spread by **hour** of the day, **day** of the week or **month** of the year. It brings out habits: call hours, connection days, seasonality.

- Counts cover the displayed events (temporal filter included), in local time.
- A date too vague for the breakdown is not counted: a date without a time in **Hour** mode, a month-only date in **Day** mode. Their number is shown under the selector.
- **Click** a bar to highlight the matching events; the others are dimmed. Click again to clear.

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

## Export

The export icon in the toolbar offers three formats:

| Choice | Result |
|--------|--------|
| **Export to CSV** | The timeline events, one per row (dates, type, label, colour) |
| **SVG — visible range** | The timeline drawn as on screen, over the period shown |
| **SVG — whole period** | The timeline from the first to the last event, at least 1,600 px wide |

The temporal filter is respected: only visible events are exported. The SVG keeps the mode shown (scatter or swimlanes), the lane order and the collapsed lanes, and every row and lane (not only those on screen). It is a vector drawing, sharp in print and editable in Inkscape or Illustrator. Thumbnails are drawn as their shape and initial, without images. In anonymous mode, no label, initial nor lane name is written (on screen either).

An event without an end date runs until today: it shows in any range after its start.

---

**See also**: [Temporal Mode]({{< relref "temporal-mode" >}}) | [Map View]({{< relref "map-view" >}}) | [Attachments]({{< relref "attachments" >}})
