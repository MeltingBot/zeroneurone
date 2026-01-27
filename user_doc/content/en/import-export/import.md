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

## Import Options

### Import Mode

| Mode | Behavior |
|------|----------|
| **New investigation** | Creates a separate investigation |
| **Merge** | Adds to current investigation |

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
