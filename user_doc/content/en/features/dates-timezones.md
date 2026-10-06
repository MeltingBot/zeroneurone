---
title: "Dates and Time Zones"
weight: 6
---

# Dates and Time Zones

---

## Display Time Zone

All times are shown in the system time zone (computer setting). It is shown in the dossier panel, **Dates** section.

A date entered without a time means the whole day.

---

## Time Zone of an Event or a Period

For times recorded in another zone (phone extraction, server log, foreign source):

1. Click the city shown to the right of the time ("Paris" by default)
2. Pick the source's time zone (search by city)
3. Type the time as it appears in the source

Elsewhere, the time is shown in your zone, followed by the original time:

```
20 Apr 2024, 02:12 (03:12 Beirut)
```

Available on events and on a link's period. **System** returns to the normal zone.

---

## Dates Imported at UTC Midnight

Older imports (CSV in `YYYY-MM-DD` format, ANB) saved some dates at UTC midnight: they show at 01:00, 02:00 or on the previous day.

Dossier panel, **Dates** section: **Check**, then **Fix**. Nothing changes without confirmation.

---

## Partial Dates

Genealogy import (GEDCOM, GeneWeb) keeps dates known only to the year or month, and approximate dates:

| Source | Display |
|--------|---------|
| `1890` | 1890 |
| `MAR 1890` | March 1890 |
| `ABT 1890` | ~1890 |

On the timeline and the time bar, these dates cover the whole period. Editing the date by hand makes it a full date.

---

## CSV Formats

| Format | Meaning |
|--------|---------|
| `2019` | Year |
| `2019-03` | Month |
| `2019-03-12` | Day |
| `2019-03-12 14:30` | Day and time |
| `~2019` | Approximate date |

The `fuseau` column (or `timezone` on import, e.g. `Asia/Beirut`) gives the zone of the row's times. See [Import]({{< relref "import-export/import" >}}) and [Export]({{< relref "import-export/export" >}}).

---

## Other Formats

| Format | Source time zone |
|--------|------------------|
| ZIP / JSON | Kept |
| CSV | `fuseau` column |
| Obsidian | Original time after the date: `2024-04-20T02:12 (03:12 Asia/Beirut)` |
| GeoJSON | `timeZone` property on links |
| i2 (ANX) | Not transmitted: times in your zone |
| Reports | Original time in parentheses |
| JSON import | Timestamps with a zone (`Z`, `+02:00`) read exactly |

---

**See also**: [Temporal Mode]({{< relref "temporal-mode" >}}) | [Timeline]({{< relref "timeline" >}})
