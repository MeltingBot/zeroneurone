---
title: "Temporal Mode"
weight: 6
---

# Temporal Mode

The canvas and the map share the same time bar: set a date or a period, and what happens there stands out.

---

## Enable

Click **Temporal** in the canvas or map toolbar. The button only appears when the dossier contains dates: events, element or link periods, date properties kept in the **Filters** panel (a pair declared as a period, "Start of facts → End of facts", counts for its whole span). An element's collection date does not count. See [Filters and Views]({{< relref "filters-views" >}}).

---

## Time Bar

| Control | Function |
|---------|----------|
| **⏮ / ⏭** | Previous / next date |
| **▶** | Automatic playback |
| **Period** (calendar) | Switch between a single date and a period |
| **Slider** | Pick the date (two handles in period mode) |
| **Date fields** | Type an exact date and time |
| **n/N** | Position among the dossier's dates |

Steps follow the dossier's dates. In period mode, ⏮, ⏭ and ▶ slide the period and keep its width.

---

## On the Canvas

| Object | Rendering |
|--------|-----------|
| Element with an event at the date (or in the period) | Glow, event shown under the element |
| Element with a date property at the date (or in the period) | Glow |
| Link whose period covers the date | Glow |
| Element connected by an active link | Normal |
| Dated element or link, outside the date | Dimmed |
| Undated element or link | Greyed, or hidden with the bar's **eye** |

Positions do not change. An ongoing event (end date later) is active.

### Event Under the Element

| Case | Action |
|------|--------|
| A single event | Click: opens the event in the detail panel |
| Several events (`+N`) | Hover: dated list; click an event: opens it in the panel |

---

## On the Map

| Mode | Display |
|------|---------|
| **Single date** | Each element at its last known position at that date, from the start of its first event to the end of its last; an event with no end date lasts |
| **Period** | Only elements active in the period, at their last position in the period |

Map-only buttons:

| Button | Function |
|--------|----------|
| **Follow** | The camera follows events during playback |
| **Trace** | Shows previous positions (limited to the period in period mode), one dot per place, larger when it comes back often. An element whose activity is over leaves its positions there, without a marker |

The event is shown under the marker, with the same list as on the canvas.

---

## Time Zone

Times are shown in the system time zone, displayed at the end of the bar (large screens) or when hovering the date fields. See [Dates and Time Zones]({{< relref "dates-timezones" >}}).

---

**See also**: [Map View]({{< relref "map-view" >}}) | [Timeline]({{< relref "timeline" >}})
