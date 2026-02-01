---
title: "Export"
weight: 1
---

# Export an Investigation

Save and share your investigations in various formats.


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
investigation_2024-01-15.zip
├── investigation.json    # Complete metadata
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
  "version": "1.3.6",
  "exportedAt": "2024-01-15T10:30:00Z",
  "investigation": { ... },
  "elements": [ ... ],
  "links": [ ... ]
}
```

---

### CSV

**Spreadsheet** with elements and links in tabular format.

| Property | Value |
|----------|-------|
| Extension | `.csv` |
| Content | Unified table |
| Attached files | ❌ Not included |
| Usage | Excel, LibreOffice, external analysis |

Columns:

| Column | Description |
|--------|-------------|
| type | "element" or "link" |
| label | Name |
| from / to | Source/target (links) |
| notes | Notes |
| tags | Tags separated by ; |
| confidence | 0-100 |
| ... | Custom properties |


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

## File Naming

Exported files follow the format:

```
{investigation_name}_{date}_{time}.{extension}
```

Example: `Smith_Case_2024-01-15_10-30-00.zip`

---

## Automation

### Command Line Export

Not currently available (web application only).

### API

Not currently available.

---

**See also**: [Import]({{< relref "import" >}})
