---
title: "Import"
weight: 2
---

# Import Data

Integrate external data or restore a saved dossier.


## Open Import

Menu **⋯** → **Import**

---

## Supported Formats

### ZIP (ZeroNeurone)

**Complete import** of an exported dossier.

| Action | Result |
|--------|--------|
| **Create new dossier** | Creates an independent copy |
| **Merge** | Adds elements to current dossier |


### Expected Content

```
dossier.zip
├── dossier.json          # Required
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
    "name": "Dossier name",
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

### JSON via mapping (paste)

For **arbitrary JSON** (an API export, another tool's output…) that doesn't follow the native schema, a **mapping** assistant connects its fields to ZeroNeurone elements.

**Open it:** import → *Map a custom JSON*, or **paste (Ctrl+V) raw JSON directly onto the canvas**. A recognized format (ZeroNeurone, GeoJSON, STIX 2.1, Excalidraw, OSINT Industries, Gephi, PredicaGraph) is imported normally; generic JSON opens the mapper.

**Auto-detection:**
- the **record source** (an array of objects like `records`, or the whole object = 1 element);
- a **label template** (e.g. `{first_name} {last_name}`);
- **date**, **country**, **latitude/longitude** (geo point) and **identifier** fields;
- a single combined **`lat, lng`** field → geo point;
- **URLs** → **link**-typed property;
- **references**: a field holding the ids of other records creates the matching **links** (directed; reciprocal → bidirectional);
- **pivot nodes**: a field can be turned into a **shared node** — each distinct value becomes a single node linking every record that has it (e.g. a shared email/phone reveals connections), deduplicated within the batch;
- **zones (polygons)**: an array of coordinates becomes a geo zone (lat/lng order adjustable).

**Settings:**
- **enable / disable** each field (noisy fields — id, hash, score… — are off by default);
- a **tag** applied to all elements + an *ignore empty values* option;
- **Media (attachment)** target: a media URL is **downloaded and attached** to the element (subject to what the remote server allows — some sources block downloads; failures are reported);
- **linked sub-elements**: a nested array of objects (e.g. contacts, addresses, observations) becomes **child elements** linked to the parent, each with their own **tag**, label and link label (with a *toggle all* checkbox);
- the imported graph's **layout** (force, clusters, hierarchy…) before you **click to position** it on the canvas.

**Filter / limit the import:** you can keep only records matching one or **several conditions** (field *contains / equals / is non-empty*), combined with **AND** or **OR**, and set a **cap** (default 2000; `0` = unlimited). Useful for very large datasets: import a usable subset instead of tens of thousands of nodes.

**Large JSON files** are handled: content isn't rendered in the text area beyond ~1 MB, detection uses a sample (the first 2000 records) while the retained records are all imported.

**Reusable templates:** a mapping can be **saved** as a named template (reusable across all dossiers), then **reloaded** or managed (rename / delete). When you paste JSON whose fields match a saved template, a banner offers to **apply it automatically**. Templates can also be **exported / imported** as a `.json` file to **share** them between machines or users.

The import happens as a single **undoable** batch (Ctrl+Z).

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

### GEXF (Gephi)

**Native Gephi format** for graphs (.gexf).

#### Imported Data

| GEXF Data | ZeroNeurone Property |
|-----------|---------------------|
| Node label | Element label |
| Attributes (all) | Typed properties (text, number, date, boolean) |
| viz:position (x, y) | Canvas position |
| viz:color (r, g, b) | Element color |
| viz:size | Proportional size (small/medium/large) |
| Edge attributes | Link properties |
| viz:color on edge | Link color |
| viz:thickness | Link thickness |
| edgedefault | Direction (directed/undirected) |

#### Color Palettes

Gephi partition attribute colors are automatically imported as visual palette.

---

### Gephi Lite JSON

**JSON format** exported from Gephi Lite.

Expected structure: object with `nodes` and `edges`, having `attributes` and `viz` (position, color, size).

---

### ANX (i2 Analyst's Notebook)

**XML format** exported from i2 Analyst's Notebook (.anx).

#### Imported Data (Entities)

| ANX Data | ZeroNeurone Property |
|----------|---------------------|
| Label / Identity | Element label |
| Description | Notes |
| Position (X, Y) | Canvas position |
| EntityType.Name | Tag (+ ancestors via type hierarchy) |
| EntityType.Colour (COLORREF) | Color |
| IconStyle.Enlargement | Size (small/medium/large) |
| EntityType.IconFile | Lucide icon |
| DatabaseProperty[] | Typed properties |
| Attribute[] | Typed properties |
| GradeOneIndex (1-5) | Confidence (20-100) |
| Card.DateTime | Date + Event |
| Card.SourceType + SourceReference | Source |
| Card.Text | Notes (appended) |
| Multiple Cards | Events |

#### Imported Data (Links)

| ANX Data | ZeroNeurone Property |
|----------|---------------------|
| Label | Link label |
| ArrowStyle | Direction (forward/backward/both/none) |
| LineWidth | Thickness |
| LineColour / LinkType.Colour | Color |
| Strength → DotStyle | Style (solid/dashed/dotted) |
| LinkType.Name | Tag |
| Strength.Name | Tag |
| DatabaseProperty[] | Properties |
| Card.DateTime | Date |

#### Type Hierarchy

The `lcx:LibraryCatalogue` hierarchy is parsed: non-abstract ancestor types are added as additional tags (e.g. Person → Legal Entity).

#### Auto-detection

`.xml` files containing ANX format are detected automatically.

---

### ANB (i2 Analyst's Notebook - binary)

**Proprietary binary format** from i2 Analyst's Notebook (.anb).

#### Imported Data (Entities)

| ANB Data | ZeroNeurone Property |
|----------|---------------------|
| Label / Identity | Element label |
| Description | Notes |
| X/Y position (binary) | Canvas position |
| EntityType.Name | Tag |
| EntityType.Colour (COLORREF) | Color |
| IconStyle.Enlargement | Size (small/medium/large) |
| EntityType.IconFile | Lucide icon |
| DatabaseProperty[] | Typed properties |
| Attribute[] | Typed properties |
| GradeOneIndex (1-5) | Confidence (20-100) |
| Card.DateTime | Date + Event |
| Card.Text | Notes (appended) |
| Multiple Cards | Events |

#### Imported Data (Links)

| ANB Data | ZeroNeurone Property |
|----------|---------------------|
| Label | Link label |
| ArrowStyle | Direction |
| LineWidth | Thickness |
| LineColour / LinkType.Colour | Color |
| Strength → DotStyle | Style (solid/dashed/dotted) |
| LinkType.Name | Tag |

#### Limitations

{{< hint warning >}}
ANB import is based on reverse-engineering of i2's proprietary binary format. The following limitations apply:

- **Version compatibility**: tested on ANB exports from i2 AN 8.x — earlier or later versions may have structural differences.
- **Intelligence cards (Cards)**: 0x818D records are imported as separate elements linked to their parent entity; parent matching is based on spatial proximity of X coordinates.
- **Images**: images embedded in ANB entities are not imported.
- **Groups**: i2 visual groups are not imported.
- **Custom icons**: only standard i2 icons are mapped to Lucide React; custom icons are ignored.
{{< /hint >}}

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
- Dossier metadata

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

## Import into Current Dossier

From an open dossier, the **Import** button in the toolbar lets you add data directly into the current dossier.

**All formats** listed above are accepted (ZIP, CSV, JSON, GraphML, GEXF, ANX, Excalidraw, OSINT Industries, OSINTracker, STIX, GEDCOM, GeneWeb).

### Placement Mode

After selecting a file, a **placement mode** activates:

1. A dashed rectangle follows the cursor, showing the estimated import area with element count
2. **Click on the canvas** to choose where imported elements are placed
3. Press **Escape** to cancel

Elements are positioned with the top-left corner at the click location.

{{< hint info >}}
Placement mode is especially useful when the dossier already contains elements, to avoid overlapping.
{{< /hint >}}

---

## Import Options

### Import Mode

| Mode | Behavior |
|------|----------|
| **New dossier** | Creates a separate dossier |
| **Merge** | Adds to current dossier with positioning |

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
