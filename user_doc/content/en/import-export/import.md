---
title: "Import"
weight: 2
---

# Import Data

Integrate external data or restore a saved investigation.


## Open Import

Menu **⋯** → **Import**

---

## Supported Formats

### ZIP (ZeroNeurone)

**Complete import** of an exported investigation.

| Action | Result |
|--------|--------|
| **Create new investigation** | Creates an independent copy |
| **Merge** | Adds elements to current investigation |


### Expected Content

```
investigation.zip
├── investigation.json    # Required
└── assets/               # Optional
    └── ...
```

---

### JSON

**Metadata import** without attached files.

| Format | Description |
|--------|-------------|
| ZeroNeurone JSON | JSON export from ZeroNeurone |
| Custom format | JSON following the schema |

#### JSON Schema

```json
{
  "investigation": {
    "name": "Investigation name",
    "description": "Optional description"
  },
  "elements": [
    {
      "id": "optional-uuid",
      "label": "Element 1",
      "notes": "Notes...",
      "tags": ["tag1", "tag2"],
      "position": { "x": 100, "y": 200 },
      "visual": { "color": "#fef3c7", "shape": "circle" }
    }
  ],
  "links": [
    {
      "fromId": "source-element-id",
      "toId": "target-element-id",
      "label": "Relationship",
      "directed": true
    }
  ]
}
```

---

### CSV

**Tabular import** of elements and links.


#### Required Columns

| Column | Required | Description |
|--------|----------|-------------|
| type | ✅ | "element" or "link" |
| label | ✅ | Element/link name |
| from | For links | Source element label |
| to | For links | Target element label |

#### Optional Columns

| Column | Description |
|--------|-------------|
| notes | Text notes |
| tags | Tags separated by ; |
| confidence | 0-100 |
| source | Information source |
| date | Date (YYYY-MM-DD) |
| start_date | Period start (links) |
| end_date | Period end (links) |
| latitude | Lat coordinate |
| longitude | Lng coordinate |
| color | Color code (#hex) |
| shape | circle, square, diamond, hexagon |
| directed | yes/no (links) |
| * | Custom columns = properties |

#### CSV Example

```csv
type,label,from,to,notes,tags,confidence
element,John Smith,,,Main suspect,person;suspect,80
element,Mary Johnson,,,Witness,person;witness,60
link,Knows,John Smith,Mary Johnson,Work colleagues,,90
```

#### Download Template

Menu **⋯** → **Import** → **Download CSV template**


---

### GraphML

**Standard format** for graph exchange, compatible with Gephi, yEd, Cytoscape.

#### Expected Structure

```xml
<?xml version="1.0" encoding="UTF-8"?>
<graphml xmlns="http://graphml.graphdrawing.org/xmlns">
  <key id="label" for="node" attr.name="label" attr.type="string"/>
  <key id="x" for="node" attr.name="x" attr.type="double"/>
  <key id="y" for="node" attr.name="y" attr.type="double"/>
  <graph edgedefault="undirected">
    <node id="n1">
      <data key="label">Element 1</data>
      <data key="x">100</data>
      <data key="y">200</data>
    </node>
    <edge source="n1" target="n2">
      <data key="label">Relationship</data>
    </edge>
  </graph>
</graphml>
```

#### Recognized Node Attributes

| Attribute | Description |
|-----------|-------------|
| label, name, titre | Element name |
| notes, description | Notes |
| x, y | Canvas position |
| lat, latitude | Latitude coordinate |
| lng, lon, longitude | Longitude coordinate |
| color, colour | Color (#hex) |
| tags | Tags separated by ; |

#### Recognized Edge Attributes

| Attribute | Description |
|-----------|-------------|
| label, relation, type | Link name |
| confidence, weight, poids | Confidence (0-1 → converted to 0-100) |
| date, datetime | Link date |
| color, edgecolor | Color (#hex) |

---

### Excalidraw

**Drawing format** Excalidraw (.excalidraw or JSON).

Excalidraw elements are converted to ZeroNeurone elements:
- Rectangles, ellipses, diamonds → Elements with matching shape
- Arrows → Links between elements
- Text → Label of nearest element

#### Example

```json
{
  "type": "excalidraw",
  "version": 2,
  "elements": [
    {
      "type": "rectangle",
      "x": 100,
      "y": 100,
      "width": 200,
      "height": 100
    }
  ]
}
```

---

### OSINT Industries

**JSON format** exported from OSINT Industries.

Expected structure: array of objects with `module`, `query`, `status`.

```json
[
  {
    "module": "email",
    "query": "john@example.com",
    "status": "found",
    "data": { ... }
  }
]
```

---

### Graph Palette (OI)

**JSON format** exported from Graph Palette / OSINT Industries Palette.

Expected structure: object with `nodes` containing types `textNode`, `moduleNode`, `imageNode`.

```json
{
  "nodes": [
    {
      "type": "textNode",
      "data": { "label": "John Doe" },
      "position": { "x": 100, "y": 200 }
    }
  ]
}
```

---

### PredicaGraph

**JSON format** exported from PredicaGraph.

Expected structure: object with `nodes` and `edges`, where nodes have `data.type` (person, location, social-*, etc.).

```json
{
  "nodes": [
    {
      "id": "1",
      "data": { "type": "person", "label": "John Doe" },
      "position": { "x": 100, "y": 200 }
    }
  ],
  "edges": [
    { "source": "1", "target": "2", "label": "knows" }
  ]
}
```

---

### OSINTracker

**Proprietary format** OSINTracker (.osintracker).

Import preserves:
- Elements with positions and properties
- Links between elements
- Embedded images (base64 → attachments)
- Investigation metadata

---

### STIX 2.1

**Standard cyber threat intelligence** format.


#### Supported Objects

| STIX Type | ZeroNeurone Element |
|-----------|---------------------|
| identity | Element (person, org) |
| threat-actor | Element |
| malware | Element |
| tool | Element |
| indicator | Element |
| attack-pattern | Element |
| campaign | Element |
| intrusion-set | Element |
| relationship | Link |

#### STIX Example

```json
{
  "type": "bundle",
  "id": "bundle--...",
  "objects": [
    {
      "type": "threat-actor",
      "id": "threat-actor--...",
      "name": "APT28",
      "description": "..."
    }
  ]
}
```

---

### GEDCOM (Genealogy)

**Standard format** for genealogical data exchange.

Supported versions: **GEDCOM 5.5.1** and **GEDCOM 7.0** (.ged)

#### Converted Elements

| GEDCOM Record | ZeroNeurone Element |
|---------------|---------------------|
| INDI (Individual) | Element with "Person" tag |
| FAM (Family) | Links between people |

#### Imported Data

| GEDCOM Data | ZeroNeurone Property |
|-------------|---------------------|
| NAME | Element label |
| BIRT (birth) | Event with date and place |
| DEAT (death) | Event with date and place |
| RESI (residence) | Event with date and place |
| OCCU (occupation) | "Occupation" property |
| NICK (nickname) | "Nickname" property |
| TITL (title) | "Title" property |
| SEX | "Sex" property |
| NOTE | Element notes |

#### Family Links

| Relationship | Link Type |
|--------------|-----------|
| Marriage (MARR) | "Marriage" link between spouses |
| Parent-Child (CHIL) | "Father" and "Mother" links |

#### Geolocation

GPS coordinates (MAP tag in places) are imported into events, enabling map display.

#### Layout

After import, elements are automatically arranged in a family tree with generations organized vertically.

---

### GeneWeb

**Text format** used by GeneWeb software (.gw).

#### File Structure

```
fam Smith John + Johnson Mary
  beg
    - h Smith Peter
    - f Smith Marie
  end
```

#### Imported Data

| GeneWeb Tag | ZeroNeurone Property |
|-------------|---------------------|
| FirstName LastName | Element label |
| Dates (birth/death) | Events |
| Occupation | "Occupation" property |
| Notes | Element notes |

#### Family Links

- Couples identified by `+`
- Children listed between `beg` and `end`
- Prefix `h` = male, `f` = female

---

## Import into Current Investigation

From an open investigation, the **Import** button in the toolbar lets you add data directly into the current investigation.

**All formats** listed above are accepted (ZIP, CSV, JSON, GraphML, Excalidraw, OSINT Industries, OSINTracker, STIX, GEDCOM, GeneWeb).

### Placement Mode

After selecting a file, a **placement mode** activates:

1. A dashed rectangle follows the cursor, showing the estimated import area with element count
2. **Click on the canvas** to choose where imported elements are placed
3. Press **Escape** to cancel

Elements are positioned with the top-left corner at the click location.

{{< hint info >}}
Placement mode is especially useful when the investigation already contains elements, to avoid overlapping.
{{< /hint >}}

---

## Import Options

### Import Mode

| Mode | Behavior |
|------|----------|
| **New investigation** | Creates a separate investigation |
| **Merge** | Adds to current investigation with positioning |

### Duplicate Handling

| Option | Behavior |
|--------|----------|
| **Ignore** | Don't import if already exists |
| **Replace** | Overwrite existing |
| **Duplicate** | Create a new element |


---

## Link Resolution

For CSV/JSON imports, links reference elements by:

1. **ID** (if provided): Exact match
2. **Label**: Search by name (first found)

{{< hint warning >}}
If the source/target label is not found, the link is not created.
{{< /hint >}}

---

## Validation

Before import, ZeroNeurone validates:

- ✅ File format
- ✅ Required columns/fields
- ✅ Data types
- ✅ Link references

Errors are displayed with their line/field.


---

**See also**: [Export]({{< relref "export" >}})
