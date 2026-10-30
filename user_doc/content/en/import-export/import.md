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

After a merge (ZIP or another format placed on the canvas), the imported elements are selected and **Ctrl+Z** undoes the import at once: elements, links and created tabs. Attachments, tag families and report sections brought in stay; existing elements changed by the import (CSV events) keep their changes.

#### Choosing the tabs

When the archive has tabs, merging lets you choose which ones to import (all ticked, with their element count):

- **In no tab**: the elements filed in no tab of the archive.
- **Linked elements** (ticked by default): adds the elements linked directly to the kept ones, even when filed in a tab left out (a victim, an item). They stay in no tab and show as ghosts in the recreated tab.
- **Recreate the tabs** (default): each chosen tab joins the dossier's tab **with the same name**, or creates a new one. Elements in no tab go to the open tab.
- **All in the open tab**: the archive tabs only serve to choose; everything imported goes to the open tab.
- Only the links between imported elements and the attachments of these elements are brought in.
- **Report** (ticked by default, shown when the archive has one): adds its sections; untick it for a partial import, its references to elements left out would lead nowhere.


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

### JSON or CSV via mapping

For **arbitrary JSON** (an API export, another tool's output…) or **any CSV** that doesn't follow the native schema, a **mapping** assistant connects its fields to ZeroNeurone elements.

**Open it:** import → *Map a JSON or CSV* (paste the text or pick a `.json`, `.csv` or `.tsv` file) — from a dossier, or from the home page, where the entry creates a new dossier (or opens the one picked in *Import into*) and shows the assistant there — or **paste (Ctrl+V) raw JSON directly onto the canvas**. A recognized format (ZeroNeurone, GeoJSON, STIX 2.1, Excalidraw, OSINT Industries, Gephi, PredicaGraph) is imported normally; generic JSON opens the mapper.

A CSV imported without the native format's columns (see [CSV](#csv)) opens the mapper too, from the home page as well: the dossier is created, then opens on the assistant. If the import is given up (assistant closed or placement cancelled) while this new dossier is still empty, it is deleted and you are back on the home page; an existing dossier is never touched. The CSV becomes a table named after the file: each row is a record, each column a field. The delimiter (`,`, `;` or tab) is detected; every value is read as text.

**Auto-detection:**
- the **record source** (an array of objects like `records`, or the whole object = 1 element);
- a **label template** (e.g. `{first_name} {last_name}`);
- **date**, **country**, **latitude/longitude** (geo point, compound names such as `borne_lat`, `cellLng` included) and **identifier** fields;
- **numeric** columns → **number** property (see below);
- a single combined **`lat, lng`** field → geo point;
- **URLs** → **link**-typed property;
- **references**: a field holding the ids of other records creates the matching **links** (directed; reciprocal → bidirectional);
- **pivot nodes**: a field can be turned into a **shared node** — each distinct value becomes a single node linking every record that has it (e.g. a shared email/phone reveals connections), deduplicated within the batch;
- **zones (polygons)**: an array of coordinates becomes a geo zone (lat/lng order adjustable).

**Settings:**
- **enable / disable** each field (noisy fields — id, hash, score… — are off by default);
- a **tag** applied to all elements + an *ignore empty values* option; the tag field (like the sub-elements one) lists the dossier's existing tags (tag families and tags) on click and filters as you type; a new name shows with **+** and is created at import;
- **Notes** target: the field goes to the element's notes. Several fields sent to **Notes** are joined as paragraphs, each starting with the field name in bold (the **Property key** box lets you rename that heading). A single field: plain text;
- **Media (attachment)** target: a media URL is **downloaded and attached** to the element (subject to what the remote server allows — some sources block downloads; failures are reported);
- **linked sub-elements**: a nested array of objects (e.g. contacts, addresses, observations) becomes **child elements** linked to the parent, each with their own **tag**, label and link label (with a *toggle all* checkbox);
- the imported graph's **layout** (force, clusters, hierarchy…) before you **click to position** it on the canvas.

**Several arrays:** when the JSON holds several arrays of objects (e.g. `claims`, `insured`, `statements`), each one shows as a tab with its record count.

- **Tick** the arrays to import; each keeps its own mapping (label, fields, tag, filters); added arrays get a tag named after them by default.
- **References between arrays** are detected: an `insured_id` field whose values are found among the `id`s of the `insured` array creates links to its records. The target array can be changed on the field's row.
- Ids coming from a CSV are matched (`12`, `"12"`, `12.0` point to the same record); a field copying the `id` is ignored.
- **Shared id**: when the `id`s of several arrays repeat those of a main array (a case number found everywhere), each array is linked to that main array.
- **Merge into** (next to the tag): for an array whose field references another ticked array (e.g. its `id` is the case number of `crpj_Procédure`), choose that array. The array then creates no element per record: each record's fields become properties (or notes) of the referenced element, its sub-element lists become sub-elements linked directly to it, and its pivots and links start from it. A record whose reference matches nothing stays an element of its own. Default: **— (one element per record)**.
- A reference to an **unticked** array is kept as a property.

As soon as two arrays are ticked, a **diagram** shows the arrays and their links, with the share of values found in the target array:

- **drag** a field's dot onto an array to link it;
- **click** an arrow to remove the reference;
- **+ field** turns another field into a reference;
- clicking an array's name opens its mapping;
- **no identifier** on an array means its `id` field references another array (it has no identifier of its own): this is normal for arrays keyed by the case number.

**Filter / limit the import:** you can keep only records matching one or **several conditions** (field *contains / equals / is non-empty*), combined with **AND** or **OR**, and set a **cap** (default 2000; `0` = unlimited). Useful for very large datasets: import a usable subset instead of tens of thousands of nodes.

**Large JSON files** are handled: content isn't rendered in the text area beyond ~1 MB, detection uses a sample (the first 2000 records) while the retained records are all imported.

**Source:** the **Source** field (next to the tag) gives the source of what the import creates: elements, events and links. It takes the file name, and can be replaced by free text ("Operator reply of 12/09"). It only applies to what has no source: a column mapped to *Source* wins, row by row. It is not saved in templates.

**Existing elements:**
- **Add to existing elements** (unticked by default): an element holding events or a pivot named like an element of the dossier is not created again; its events and links go on the existing element, without doubling a link that already exists. A single **Ctrl+Z** removes the created elements and the added events. Values are compared as written: `06 39 98 33 17` and `0639983317` make two elements. **Insights → Potential duplicates** pairs them (one number whatever its writing) and offers to merge them.

**Rows as events:** the **Each row creates** setting switches from *an element* to *an event*. Each row then becomes a dated event (shown on the timeline and, when it has a place, on the map):
- **Element**: the column naming the element that holds the event. One element is created per distinct value; when the column refers to another imported table, the event goes on that table's element;
- **Date** and **End** (optional): the start and end columns. Partial dates (`2020`, `2020-03`) keep their precision; rows without a valid date are skipped and counted in a message;
- the **label template** gives the event's label. On switching to events, it offers a category column (few distinct values, like a type: "Incoming call"); left empty, the event takes the tag, else the element's value; **notes**, **source**, **latitude/longitude** and **properties** fields go on the event;
- **pivot** fields create and link other elements, one link per pair however many rows share it. Within a table, a value makes one element, whether it holds the event or is a pivot. With **Event on the pivot elements too** (ticked by default), the event also goes on each pivot;
- ids, references and media do not apply to event rows;
- the import cap does not apply: every (filtered) row becomes an event, since events add no element to the canvas.

Example, a phone bill (`caller;called;date;duration;lat;lng`): *Element* = `caller`, *Date* = `date`, `called` as **pivot**, `lat`/`lng` as coordinates. Each number becomes an element, each pair of numbers a link, and each call an event on both numbers' timelines, placed on the map at the cell tower.

Events go on elements the import creates. To add events to an element already in the dossier, use the [native CSV](#csv) with `type` = `event` (the `de` column gives the element's label), or import, then **merge** the created element with the existing one.

In JSON, an array of objects of a record (`calls: [...]`) can become **events of the element** instead of linked sub-elements: tick *As events of the element* on that array. Each object is dated by its first field named like a date (`date`, `timestamp`…), else by the first one holding one.

**Reusable templates:** a mapping can be **saved** as a named template (reusable across all dossiers), then **reloaded** or managed (rename / delete). When you paste JSON whose fields match a saved template, a banner offers to **apply it automatically**. Templates can also be **exported / imported** as a `.json` file to **share** them between machines or users. A CSV template applies to any file with the same columns, whatever its name (next month's phone bill, say). A template saved on a CSV is offered for CSV only, one saved on JSON for JSON only; a template made before this distinction counts as a JSON one, offered for a CSV only when its fields match the file's columns; saving it again on a CSV makes it a CSV template.

A template saves every ticked array (mapping, label template, tag, sub-elements, filters, cap) and the list of ticked arrays; loading it restores them. With a template selected, **Save** updates it; with none selected, you are asked for a name and a new template is created. Older single-array templates still apply to the open array.

The import happens as a single **undoable** batch (Ctrl+Z).

---

### CSV

**Tabular import** of elements and links.

A CSV is imported directly when it follows the native format: a `type` column holding only `element`, `lien`/`link` or `event`, or, without a `type` column, a `label` column (or `nom`, `name`), or both columns of a link (`de`/`vers`, `from`/`to`). Any other CSV, another tool's export for instance, opens the [mapping](#json-or-csv-via-mapping) assistant, where you pick the label and the role of each column; the mapping can be saved as a template and is offered again for a CSV with the same columns.

**Numbers:** a column whose every value is a number gives **number** properties (sorted and compared as numbers); a decimal comma is accepted (`12,5`). Values that only look like numbers stay text: a leading zero (phone numbers, postcodes, ids), spaces (`06 39 98 33 17`), more than 12 digits (IMEI, IMSI, account numbers). A column whose commas may separate thousands (`1,234`, `25,000`, or commas next to decimal points) also stays text rather than giving wrong numbers. In the mapping, the **Property (number)** target can be picked by hand.


#### Required Columns

| Column | Required | Description |
|--------|----------|-------------|
| type | ✅ | "element", "link" or "event" |
| label | ✅ | Element/link name (event label for "event") |
| from | For links and events | Links: source element label. Events: parent element label |
| to | For links | Target element label |

#### Optional Columns

| Column | Description |
|--------|-------------|
| notes | Text notes |
| tags | Tags separated by ; |
| confidence | 0-100 |
| cotation_echelle (or evaluation_scale) | `europol` or `admiralty` (unified format) |
| cotation_source / cotation_info | Grading codes, e.g. `B` and `2` |
| source | Information source |
| date | Date: `2019`, `2019-03`, `2019-03-12` or `2019-03-12 14:30`; leading `~` if approximate |
| start_date | Period start (links, events) |
| end_date | Period end (links, events) |
| fuseau (or timezone) | Time zone of the row's times, e.g. `Asia/Beirut` (empty = system zone) |
| latitude | Lat coordinate (elements, events — not links) |
| longitude | Lng coordinate (elements, events — not links) |
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

#### Events (type=event)

An `type=event` row attaches a **dated event** to an existing element (shown in its detail panel, on the **timeline**, and — if geolocated — on the **map**). A single element can hold several events.

The event reuses the unified-format columns:

| Column | Role for the event |
|--------|--------------------|
| from | Parent element label (**required**) |
| date | Event date (**required**) |
| end_date | Optional end (event with duration) |
| fuseau (or timezone) | Time zone of the times, e.g. `Asia/Beirut` (optional) |
| label | Event label |
| notes | Description |
| latitude / longitude | Geolocation (shows on the map) |
| source | Information source |
| * | Custom columns = event properties |

```csv
type,label,from,date,end_date,latitude,longitude,source
element,John Smith,,2024-01-10,,,,Case
event,Marseille stopover,John Smith,2024-01-20,2024-01-21,43.2965,5.3698,Surveillance
event,Vehicle change,John Smith,2024-02-03,,,,Case
```

An `event` row with no valid date or no parent element is skipped (a warning is reported).

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
| defaultedgetype | Direction (directed/undirected) |

In an undirected graph, a relation written both ways (A → B and B → A, as rgexf or NetworkX do) becomes a single link. The import reports how many links were merged this way. Two edges with different labels stay separate.

Gephi positions are in its own units, often tight compared with the element size. The layout is enlarged (never shrunk) so neighbouring elements do not overlap; its proportions are kept. Same rule for Gephi Lite.

#### Color Palettes

Gephi partition attribute colors are automatically imported as visual palette.

---

### Gephi Lite JSON

**JSON format** exported from Gephi Lite.

Expected structure: object with `nodes` and `edges`, having `attributes` and `viz` (position, color, size).

---

### GML

**Text format** (.gml) written by Gephi, yEd, Cytoscape, NetworkX and igraph.

#### Imported data

| GML data | ZeroNeurone property |
|----------|---------------------|
| `label` (or `LabelGraphics` › `text` for yEd) | Element label |
| `graphics` › `x`, `y` | Position (node center) |
| `graphics` › `w`, `h` | Proportional size |
| `graphics` › `fill`, `outline` | Color and border |
| `graphics` › `type` | Shape (ellipse, rectangle, diamond, hexagon) |
| `notes`, `tags` (separated by ;), `confidence` | Notes, tags, confidence |
| Other simple keys (`weight`, `age`…) | Properties |
| `source`, `target` | Link endpoints |
| `graphics` › `fill`, `width` on an edge | Link color and thickness |
| `targetArrow`, `sourceArrow` | Link direction |
| `directed` | Default direction, when the edge does not state its arrows |

Nodes without a position are laid out on a grid. Each node's GML id is kept in the `gml_id` property. For a file exported by Gephi (`Creator "Gephi"`), the Y axis is flipped as for GEXF.

---

### DOT (Graphviz)

**Text format** of Graphviz (`.dot`, `.gv`), also written by NetworkX, Gephi, `terraform graph` and many analysis tools.

Three ways to import:
- **Paste on the canvas** (Ctrl+V): text starting with `graph`, `digraph` or `strict digraph` followed by a brace is recognized automatically
- **Right-click on the canvas → Paste**
- **Import** → `.dot` or `.gv` file (new dossier, or the open dossier with placement on the canvas)

#### Imported data

| DOT data | ZeroNeurone property |
|----------|----------------------|
| `label` (else the node id) | Element label |
| HTML `<...>` or `record` label | Text only, without formatting |
| `shape` | Shape (ellipse → circle, box → rectangle, diamond → diamond, hexagon/octagon → hexagon, square → square) |
| `fillcolor`, `color` (X11 names, `#rrggbb`, HSV) | Color and border |
| `style=dashed` / `dotted` | Dashed or dotted border |
| `tooltip` (or `notes`), `tags` (separated by ;), `confidence`, `source` | Notes, tags, confidence, source |
| `cluster…` subgraph | Tag: its `label`, else its name without `cluster_` |
| `pos` (output of a Graphviz layout) | Position, when every node has one |
| Other attributes (`weight`, `path`…) | Properties, values as written |
| `label`, `color`, `penwidth`, `style` on an edge | Link label, color, width, dashed or dotted |
| `dir`, `arrowhead`, `arrowtail` | Link direction (`digraph`: arrow by default) |

`node [...]` and `edge [...]` defaults apply as in Graphviz, subgraphs included. A chain `a -> b -> c` gives two links, `a -> {b c}` one link to each. In a `strict` graph, duplicate links are merged.

Without positions, the graph is laid out automatically along `rankdir` (top to bottom by default). Each node's DOT id is kept in the `dot_id` property.

Not imported: ports (`a:north`, the link starts from the element), invisible edges (`style=invis`, layout helpers) and links from an element to itself; the import reports how many links were skipped. Only labels and notes read Graphviz codes (`\n` for a line break): a path like `C:\Users\...` keeps its backslashes in properties.

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

**Proprietary binary format** from i2 Analyst's Notebook (.anb), read directly: no need to export to ANX from i2.

#### Imported Data (Elements)

| ANB Data | ZeroNeurone Property |
|----------|---------------------|
| Label | Element label (the text shown in i2) |
| Identity | `i2_identity` property, when it differs from the label (an identity generated by i2, for instance) |
| Description | Notes |
| Source type, source | Source |
| Position | Canvas position (uniform scale) |
| Palette type | Tag; "Anonymous", i2's default type, becomes "Generic" |
| Type icon | Icon |
| Attributes | Properties (typed dates and date-times) |
| Date and time | Timeline event: one-off, or a period when one date-time attribute gives the start and another the end |
| Text block | Annotation |

Icons, boxes, circles, events and theme lines become elements. A theme line's date is not kept.

Times entered in i2 are stored in UTC and shown in the computer's time zone; a date without time stays a calendar day.

#### Imported Data (Links)

| ANB Data | ZeroNeurone Property |
|----------|---------------------|
| Ends | Linked elements |
| Arrows | Direction |
| Label | Link label (empty for an attachment to a theme line) |
| Date and time | One-off timeline period (end = start) |
| Source type, source | Source |
| Line colour | Color (black, i2's default, keeps ZN's) |

#### Limitations

{{< hint warning >}}
ANB import is based on reverse-engineering of i2's binary format. Tested on charts with custom palettes and on a recent chart using the full i2 palette.

- **Cards**: intelligence cards attached to items are not imported.
- **Images**: embedded images are not imported.
- **Icons**: only common i2 icons have an equivalent; others get the default icon.
- If the file structure differs from what is expected, the import reports it in a warning instead of producing wrong links.
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

### draw.io (diagrams.net)

**draw.io diagrams**: `.drawio` file, or `.xml` exported by draw.io (compressed or not). All pages are imported, placed one below the other.

- Shapes → elements (ellipse → circle, rhombus → diamond, hexagon, otherwise rectangle), with position, size and colors
- Connectors attached to two shapes → links, with label, color, width and dashes; no arrowhead → undirected link
- Custom data (*Edit Data*) → properties; the shape's link → `url` property
- Embedded images → attachments
- Free text → element without fill or border

Unattached connectors and empty groups are skipped.

{{< hint info >}}
**Visio**: open the `.vsdx` file in draw.io, save it as `.drawio`, then import it.
{{< /hint >}}

---

### Mermaid

**Mermaid diagrams** of type `flowchart` or `graph`, in any direction (`TD`, `LR`…): pasted text, `.mmd` / `.mermaid` file, or Markdown `.md` file containing a ` ```mermaid ` block.

Handy to structure notes with an AI assistant: ask it for "a Mermaid graph of the people, companies and relationships in this text", then paste the result into ZeroNeurone.

Three ways to import:
- **Paste on the canvas** (Ctrl+V): Mermaid text is detected automatically, even inside a ` ```mermaid ` block surrounded by explanations
- **Right-click on the canvas → Paste**
- **Import** → `.mmd`, `.mermaid` or `.md` file (in Markdown, the first ` ```mermaid ` flowchart block is used)

The diagram is then positioned in **placement mode**, without touching existing content. The layout follows the diagram direction (`TD`, `LR`…).

| Mermaid | ZeroNeurone |
|---------|-------------|
| `A[text]`, `A(text)`, `A([text])`, `A[[text]]` | Rectangle element |
| `A((text))` | Circle element |
| `A{text}` | Diamond element |
| `A{{text}}` | Hexagon element |
| `A --> B`, `A ==> B` (thick) | Directed link |
| `A --- B` | Undirected link |
| `A -.-> B` | Dashed link |
| `A <--> B` | Bidirectional link |
| `A -->\|label\| B`, `A -- label --> B` | Link label |
| `subgraph Title … end` | "Title" tag on the subgraph's elements |
| `classDef`, `class`, `:::`, `style` (`fill`, `stroke`) | Fill and border color |

#### Example

```
flowchart LR
  A((Alice Martin)) -->|manages| B[Alpha Ltd]
  B -.->|suspected| C{Paris}
  subgraph Family
    A --- D((Bob Martin))
  end
```

{{< hint info >}}
**Limits**: only `flowchart` and `graph` are supported (not `sequenceDiagram`, `erDiagram`, `mindmap`…). Unrecognized lines are skipped and counted in a warning. Positions are not read: Mermaid has none.
{{< /hint >}}

{{< hint info >}}
**The other way round**: select several elements, then right-click → **Copy as → Mermaid** to get a block you can paste into a wiki, Obsidian, GitHub or a Markdown report.
{{< /hint >}}

---

### GeoJSON

A `.geojson` (or `.json`) `FeatureCollection` file, exported from QGIS or an open-data portal for instance. Each feature becomes an element placed on the [map]({{< relref "map-view" >}}).

#### Geometries

| Geometry | Import |
|----------|--------|
| `Point` | Element with a position |
| `MultiPoint` | First point kept |
| `Polygon` | Element with a zone (outer ring, holes ignored) |
| `MultiPolygon` | Largest part kept (a summary warning says so) |
| `LineString` | Ignored |

#### Label and Properties

Before importing, from the home page as from inside the dossier, an options step lets you:

- choose the **property used as label** (only filled properties are offered, with a sample value);
- tick the **properties to import** (**All** / **None**): an unticked property is ignored;
- choose a **Tag**: an existing tag or a new name. An existing tag family gives its look (color, shape, icon), unless the file sets a color or shape; a new name creates the tag family. Empty: no tag.

A feature with no value for the chosen label takes a usual name (`name`, `nom`…), else "Feature N" after its position in the file.

#### Projections

Standard GeoJSON is in **WGS 84** (longitude/latitude in degrees).

- A **Lambert 93** file (`EPSG:2154`, common in French open data) declaring its projection in `crs` is **converted automatically**.
- Other projections are refused with a message: reproject the file to `EPSG:4326` first, with QGIS (*Export* → CRS EPSG:4326) or `ogr2ogr -t_srs EPSG:4326 out.geojson in.geojson`.
- A feature with out-of-range coordinates is skipped, with a warning.

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

Two structures are recognized:

- **Current format** (`schemaVersion: 2`): `nodes` each carrying a typed `entity`, and `edges`. Searched selectors and results become elements at their position, result fields become typed properties, OI dates (account creation, Google Maps reviews…) become dated, geolocated events, embedded images become attachments.
- **Legacy format**: `nodes` containing types `textNode`, `moduleNode`, `imageNode`.

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

Remote profile pictures (`pfp_image`) are not downloaded: their address is kept in the `image_url` link property.

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

### FEC (French Accounting Entries File)

**DGFiP-normalized format** (art. A47 A-1 of the French tax procedures code) produced by every French accounting software. `.txt` or `.fec` file, pipe- or tab-separated columns, detected by its `JournalCode` header.

The import does not reproduce the bookkeeping: it builds an **aggregated, investigation-oriented flow graph** (due diligence, financial analysis) — who gets paid, where the money goes, over which period.

#### Resulting model

| FEC data | Result in ZeroNeurone |
|----------|----------------------|
| Auxiliary accounts (CompAuxNum) | One element per third party, tagged **Client** (41x), **Supplier** (40x) or **Third party** |
| General accounts without auxiliary | One element per 3-digit PCG root, tagged **Bank** (51x), **Expense** (class 6), **Revenue** (class 7)… |
| Balanced entries | Aggregated **flow links** per account pair: cumulated amount, entry count, journals, period (visible on the timeline) |

Amounts are distributed pro rata within each entry. **Direction convention: flows go from the credited account to the debited account** (the direction of value: Bank → Supplier = payment). Link thickness reflects the cumulated amount (log scale).

#### Options screen

Before importing, an options screen shows a file summary (lines, entries, third parties, period) and lets you adjust with an **instant preview** of the element and link counts:

- **Third-party cap (top N)** — keeps the N third parties with the largest cumulated flows (default 200)
- **Minimum amount per link** — pre-computed from the amount distribution to target a ~300-link graph
- **Families to include** — clients, suppliers, banks, expenses, revenues…
- **Period** — pre-filled date bounds
- **Flows between general accounts** — unchecked by default (VAT, misc. entries, payroll… mesh the graph without naming anyone)

Each element carries its debit/credit totals, related accounts and payment methods as properties — usable in filters, queries and the matrix view.

---

## Import into Current Dossier

From an open dossier, the **Import** button in the toolbar lets you add data directly into the current dossier.

**All formats** listed above are accepted (ZIP, CSV, JSON, GraphML, GEXF, GML, ANX, Excalidraw, Mermaid, OSINT Industries, OSINTracker, STIX, GEDCOM, GeneWeb, FEC).

From the home page, importing a file into an **existing dossier** opens that dossier and runs the import there: options step (GeoJSON, FEC), then placement on the canvas.

The dossier's comments are kept when importing into it.

During the import, the import window shows **Elements: N · links: M**, for every format.

### Placement Mode

After selecting a file, a **placement mode** activates:

1. A dashed rectangle follows the cursor, showing the estimated import area with element count
2. **Click on the canvas** to choose where imported elements are placed
3. Press **Escape** to cancel

Elements are positioned with the top-left corner at the click location. While writing, the top bar shows **Importing…** with the count.

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
