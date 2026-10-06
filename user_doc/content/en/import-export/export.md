---
title: "Export"
weight: 1
---

# Export a Dossier

Save and share your dossiers in various formats.


## Open Export

Menu **⋯** → **Export**

---

## Available Formats

### ZIP (Recommended)

**Complete format** including metadata and attached files.

| Property | Value |
|----------|-------|
| Extension | `.zip` |
| Content | JSON + files |
| Attached files | ✅ Included |
| Usage | Backup, complete transfer |

Archive structure:

```
dossier_2024-01-15.zip
├── dossier.json          # Complete metadata
└── assets/               # Attached files
    ├── a1b2c3.pdf
    ├── d4e5f6.png
    └── ...
```

{{< hint info >}}
**Recommended** for backup and transfer between machines.
{{< /hint >}}

---

### JSON

**Metadata only** without files.

| Property | Value |
|----------|-------|
| Extension | `.json` |
| Content | Structured metadata |
| Attached files | ❌ Not included |
| Usage | Integration, lightweight backup |

Content:

```json
{
  "version": "1.5",
  "exportedAt": "2024-01-15T10:30:00Z",
  "investigation": { ... },
  "elements": [ ... ],
  "links": [ ... ]
}
```

---

### CSV

**Spreadsheet** with elements, links and events in tabular format.

| Property | Value |
|----------|-------|
| Extension | `.csv` |
| Content | Unified table |
| Attached files | ❌ Not included |
| Usage | Excel, LibreOffice, external analysis |

Columns:

| Column | Description |
|--------|-------------|
| type | "element", "link" or "event" |
| label | Name (event label for "event") |
| from / to | Source/target (links); for "event", `from` = parent element |
| notes | Notes / description |
| tags | Tags separated by ; |
| confidence | 0-100 |
| cotation_echelle / cotation_source / cotation_info | Europol or Admiralty grading (see [evaluation]({{< relref "features/evaluation" >}})) |
| date / end_date | Event date and optional end (events) |
| start_date / end_date | Period (links) |
| fuseau | Source time zone; the row's times are written in this zone |
| ... | Custom properties |

Date formats: see [Dates and Time Zones]({{< relref "features/dates-timezones" >}}).

**Events** attached to elements are exported as `type=event` rows: an export → import round-trip rebuilds the timeline identically.


---

### GraphML

**Graph format** for network analysis tools.

| Property | Value |
|----------|-------|
| Extension | `.graphml` |
| Content | XML graph |
| Attached files | ❌ Not included |
| Usage | Gephi, yEd, Cytoscape |


---

### GEXF

**Native Gephi format** with visual attributes (positions, colors, sizes).

| Property | Value |
|----------|-------|
| Extension | `.gexf` |
| Content | XML graph (GEXF 1.3, `viz` namespace) |
| Attached files | ❌ Not included |
| Usage | Gephi |

The graph opens in Gephi with the same layout and colors as on the canvas. Positions preserved (Y axis adjusted for an upright rendering), colors converted to RGB, notes and tags as node attributes, confidence as an edge attribute. Link direction is preserved (`forward`/`backward`/bidirectional).

---

### ANX (i2 Analyst's Notebook)

**i2 exchange format**, to hand a chart over to an analyst working in Analyst's Notebook.

| Property | Value |
|----------|-------|
| Extension | `.anx` |
| Content | i2 XML (entities, links, types, attributes) |
| Attached files | ❌ Not included |
| Use | i2 Analyst's Notebook |

The file opens directly in Analyst's Notebook, with no import specification. Canvas positions, colours, link direction and line width are preserved. Each element's first tag becomes its i2 entity type, further tags become attributes, and properties carry their type wherever i2 has an equivalent: numbers, dates and booleans survive, other types are sent as text.

Some ZeroNeurone notions have no i2 counterpart and are not carried over. Groups and annotations are not exported; elements inside a group are placed at their actual position and keep the group name in an attribute. A geographic area is reduced to its centre point, a date range to two attributes, and shapes, attached media and custom sizes are lost. A link with an endpoint that is not exported is dropped, so that no reference points at nothing.

The confidence level is sent as i2 grade 1 (1 to 5). In a dossier using the [Europol or Admiralty model]({{< relref "features/evaluation" >}}), source reliability is sent as grade 1 and information accuracy as grade 2, by position in the grid (A = 1).

The native binary `.anb` format is not offered for export: its structure is not publicly documented, and ZeroNeurone only reads it partially, by pattern recognition.

---

### Obsidian (vault)

**Obsidian vault**: one Markdown note per element, to carry the analysis on in Obsidian.

| Property | Value |
|----------|-------|
| Extension | `.zip` |
| Content | `.md` notes, `.canvas` files, report |
| Attached files | ✅ Included |
| Use | Obsidian (graph, backlinks, Dataview, Bases) |

Archive structure:

```
case_2024-01-15_obsidian.zip
├── Case.md               # Index: description, canvases, report, notes
├── Elements/             # One note per element (and per group)
├── Canvas/               # One .canvas file per tab
├── Report/               # The report, references turned into links
└── attachments/          # Attached files
```

Unzip the archive, then in Obsidian choose **Open folder as vault**.

Each note carries as properties (frontmatter) the element's tags, confidence, grading, source, dates, location (`location`, compatible with the Map View plugin), parent group and properties. The element's notes form the body, followed by its events and attached files.

Obsidian has no typed links, so relations are written three ways:

- a **Relations** section in each note, with the label, direction (→, ←, ↔), dates, confidence, source and notes of the link. Relations show up in the graph view and in backlinks;
- one property per relation label in the originating note (`employed by: [[ACME]]`), queryable with Dataview or Bases. An undirected relation is written on both sides;
- one **Canvas** file per tab, reproducing the canvas layout with link labels, colours and direction. Groups become Canvas groups, annotations become text cards.

{{< hint warning >}}
`.canvas` files point to notes by their path from the vault root. If you copy the export into a sub-folder of an existing vault, notes and their links still work, but the canvases no longer find their notes.
{{< /hint >}}

---

### GeoJSON

**Geographic format** for GIS tools.

| Property | Value |
|----------|-------|
| Extension | `.geojson` |
| Content | FeatureCollection |
| Attached files | ❌ Not included |
| Usage | QGIS, ArcGIS, Leaflet, Mapbox |

Content:

- **Geolocated elements** → Point
- **Links between geolocated elements** → LineString

{{< hint warning >}}
Only elements with coordinates are exported.
{{< /hint >}}


---

### PNG (Image)

**Visual capture** of the canvas.

| Property | Value |
|----------|-------|
| Extension | `.png` |
| Content | Bitmap image |
| Resolutions | 1x, 2x, 3x, 4x |
| Usage | Report, presentation |


---

### SVG (Vector)

**Editable vector image**.

| Property | Value |
|----------|-------|
| Extension | `.svg` |
| Content | Vector graphic |
| Usage | Inkscape, Illustrator, printing |

{{< hint info >}}
Ideal format for high-quality printing and graphic editing.
{{< /hint >}}

---

### HTML (Interactive Report)

**Self-contained interactive report** with embedded graph.

| Property | Value |
|----------|-------|
| Extension | `.html` |
| Content | Report + SVG graph + JavaScript |
| Attached files | ❌ Not included (thumbnails only) |
| Usage | Sharing, presentation, offline viewing |

Features:
- **Bidirectional navigation**: Click element references in report to zoom on graph, click nodes to scroll to references
- **Table of contents**: Collapsible summary for long reports
- **Info modal**: Dossier metadata and statistics (elements, links, groups count)
- **Theme toggle**: Light/dark mode
- **Markdown export**: Download report as `.md` file (without internal links)
- **Pan & zoom**: Navigate the graph with mouse wheel and drag
- **Search** (Ctrl+K): Search by label and tags with keyboard navigation (arrows + Enter)
- **Tag filtering**: Header popover to show/hide nodes and links by tag
- **Embedded images**: Attached file thumbnails displayed in SVG graph shapes
- **Layout toggle**: Swap report and graph left-right (saved in localStorage)
- **Resizable columns**: Drag handle between report panel and graph (15%-85%)

{{< hint info >}}
Access from the Report panel via the globe icon.
{{< /hint >}}

---

## File Naming

Exported files follow the format:

```
{dossier_name}_{date}_{time}.{extension}
```

Example: `Smith_Case_2024-01-15_10-30-00.zip`



---

**See also**: [Import]({{< relref "import" >}})
