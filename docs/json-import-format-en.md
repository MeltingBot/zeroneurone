# Zeroneurone JSON Import Format

Complete reference for the native JSON import format used by Zeroneurone.

## Overview

Zeroneurone can import investigation data from a JSON file (standalone or inside a ZIP archive). The native format is auto-detected by the presence of the three required top-level fields: `version`, `elements`, and `links`.

When importing, **all IDs are regenerated** as new UUIDs. Internal references (element-to-element, link-to-element, tabs, reports) are remapped automatically. Timestamps (`createdAt`, `updatedAt`) are always overwritten with the current date.

---

## Top-Level Structure

```json
{
  "version": "1.1.0",
  "exportedAt": "2026-02-11T10:00:00.000Z",
  "investigation": { ... },
  "elements": [ ... ],
  "links": [ ... ],
  "tabs": [ ... ],
  "report": { ... },
  "assets": [ ... ]
}
```

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `version` | **Yes** | `string` | Format version (e.g. `"1.1.0"`). Must be truthy. |
| `exportedAt` | No | `string` | ISO 8601 timestamp. Informational only, not validated. |
| `investigation` | No | `object` | Investigation metadata. Included in exports for completeness but **not used** on native JSON import. |
| `elements` | **Yes** | `Element[]` | Array of element objects. Can be empty. |
| `links` | **Yes** | `Link[]` | Array of link objects. Can be empty. |
| `tabs` | No | `CanvasTab[]` | Canvas tab definitions. Only imported for new investigations (not merges). |
| `report` | No | `Report` | Report with sections. Skipped if a report already exists for the target investigation. |
| `assets` | No | `ExportedAssetMeta[]` | Asset metadata. Only meaningful in ZIP imports; ignored in standalone JSON. |

If `version`, `elements`, or `links` is missing, the import fails with: `"Format JSON invalide: champs manquants"`.

---

## Element Object

Each element represents a node on the canvas (person, company, location, concept, document, etc.).

```json
{
  "id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  "investigationId": "00000000-0000-0000-0000-000000000001",
  "label": "John Doe",
  "notes": "Free-form text notes",
  "tags": ["person", "suspect"],
  "properties": [
    { "key": "email", "value": "john@example.com", "type": "text" }
  ],
  "confidence": 80,
  "source": "Public records",
  "date": "2025-06-15T00:00:00.000Z",
  "dateRange": {
    "start": "2025-01-01T00:00:00.000Z",
    "end": "2025-12-31T00:00:00.000Z"
  },
  "position": { "x": 100, "y": 200 },
  "isPositionLocked": false,
  "geo": { "lat": 48.8566, "lng": 2.3522 },
  "events": [],
  "visual": {
    "color": "#fcd34d",
    "borderColor": "#a8a29e",
    "borderWidth": 2,
    "borderStyle": "solid",
    "shape": "circle",
    "size": "medium",
    "icon": null,
    "image": null,
    "fontSize": "md"
  },
  "assetIds": [],
  "parentGroupId": null,
  "isGroup": false,
  "isAnnotation": false,
  "childIds": [],
  "createdAt": "2025-06-01T00:00:00.000Z",
  "updatedAt": "2025-06-10T00:00:00.000Z"
}
```

### Element Field Reference

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | `string` (UUID v4) | **Yes** | Remapped | Original ID used for cross-references; replaced with a new UUID on import. |
| `investigationId` | `string` (UUID v4) | No | Overwritten | Always set to the target investigation ID. |
| `label` | `string` | Recommended | `""` | Display name shown on the canvas. |
| `notes` | `string` | No | `""` | Free-form text notes (supports Markdown). |
| `tags` | `string[]` | No | `[]` | User-defined tags for filtering and categorization. |
| `properties` | `Property[]` | No | `[]` | Typed key/value metadata pairs. See [Property](#property). |
| `confidence` | `number \| null` | No | `null` | Confidence level. Must be a multiple of 10 from 0 to 100, or `null`. |
| `source` | `string` | No | `""` | Source attribution text. |
| `date` | `string \| null` | No | `null` | ISO 8601 date string for timeline positioning. |
| `dateRange` | `DateRange \| null` | No | `null` | Date range with `start` and `end` fields. See [DateRange](#daterange). |
| `position` | `Position` | Recommended | `{x: 0, y: 0}` | Canvas coordinates `{x, y}`. |
| `isPositionLocked` | `boolean` | No | `false` | When `true`, the element cannot be moved on the canvas. |
| `geo` | `GeoCoordinates \| null` | No | `null` | Geographic coordinates for map view. See [GeoCoordinates](#geocoordinates). |
| `events` | `ElementEvent[]` | No | `[]` | Temporal occurrences attached to this element. See [ElementEvent](#elementevent). |
| `visual` | `ElementVisual` | No | Spread from JSON | Appearance settings. See [ElementVisual](#elementvisual). |
| `assetIds` | `string[]` | No | `[]` | References to attached assets. Non-imported assets are silently dropped. |
| `parentGroupId` | `string \| null` | No | Remapped or `null` | ID of the parent group element. Remapped on import. |
| `isGroup` | `boolean` | No | `false` | Whether this element is a group container. |
| `isAnnotation` | `boolean` | No | `false` | Whether this is an annotation (text/arrow on canvas). |
| `childIds` | `string[]` | No | `[]` | IDs of child elements (for groups). Remapped on import. |
| `createdAt` | `string` | Overwritten | `new Date()` | Always replaced with the import timestamp. |
| `updatedAt` | `string` | Overwritten | `new Date()` | Always replaced with the import timestamp. |

---

## Link Object

Each link represents a relationship between two elements (an edge in the graph).

```json
{
  "id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  "investigationId": "00000000-0000-0000-0000-000000000001",
  "fromId": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  "toId": "cccccccc-cccc-cccc-cccc-cccccccccccc",
  "sourceHandle": null,
  "targetHandle": null,
  "label": "knows",
  "notes": "",
  "tags": [],
  "properties": [],
  "directed": true,
  "direction": "forward",
  "confidence": 70,
  "source": "",
  "date": null,
  "dateRange": null,
  "visual": {
    "color": "#9ca3af",
    "style": "solid",
    "thickness": 2,
    "fontSize": "sm"
  },
  "curveOffset": { "x": 0, "y": 0 },
  "createdAt": "2025-06-01T00:00:00.000Z",
  "updatedAt": "2025-06-01T00:00:00.000Z"
}
```

### Link Field Reference

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | `string` (UUID v4) | **Yes** | Remapped | Replaced with a new UUID on import. |
| `investigationId` | `string` (UUID v4) | No | Overwritten | Always set to the target investigation ID. |
| `fromId` | `string` (UUID v4) | **Yes** | Remapped | Source element ID. Must reference an element in the import. **Links referencing missing elements are skipped.** |
| `toId` | `string` (UUID v4) | **Yes** | Remapped | Target element ID. Must reference an element in the import. **Links referencing missing elements are skipped.** |
| `sourceHandle` | `string \| null` | No | `null` | React Flow source handle identifier. |
| `targetHandle` | `string \| null` | No | `null` | React Flow target handle identifier. |
| `label` | `string` | No | `""` | Display label for the relationship. |
| `notes` | `string` | No | `""` | Free-form text notes. |
| `tags` | `string[]` | No | `[]` | User-defined tags. |
| `properties` | `Property[]` | No | `[]` | Typed key/value pairs. |
| `directed` | `boolean` | No | `false` | **Deprecated.** Used as fallback when `direction` is missing. |
| `direction` | `string` | No | Inferred | `"none"`, `"forward"`, `"backward"`, or `"both"`. If missing, inferred from `directed`: `true` -> `"forward"`, otherwise `"none"`. |
| `confidence` | `number \| null` | No | `null` | Confidence level (0-100, multiples of 10). |
| `source` | `string` | No | `""` | Source attribution. |
| `date` | `string \| null` | No | `null` | ISO 8601 date. |
| `dateRange` | `DateRange \| null` | No | `null` | Date range with `start` and `end`. |
| `visual` | `LinkVisual` | No | Spread from JSON | Appearance settings. See [LinkVisual](#linkvisual). |
| `curveOffset` | `{x, y}` | No | `{x: 0, y: 0}` | Manual curve control point offset. |
| `createdAt` | `string` | Overwritten | `new Date()` | Always replaced with the import timestamp. |
| `updatedAt` | `string` | Overwritten | `new Date()` | Always replaced with the import timestamp. |

**Important**: Links whose `fromId` or `toId` don't match any imported element are **silently skipped** with a warning logged.

---

## Canvas Tab Object

Canvas tabs organize elements into separate views within the same investigation.

```json
{
  "id": "dddddddd-dddd-dddd-dddd-dddddddddddd",
  "investigationId": "00000000-0000-0000-0000-000000000001",
  "name": "Main view",
  "order": 0,
  "memberElementIds": ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"],
  "excludedElementIds": [],
  "createdAt": "2025-06-01T00:00:00.000Z",
  "updatedAt": "2025-06-01T00:00:00.000Z"
}
```

### Tab Field Reference

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | `string` (UUID v4) | **Yes** | Remapped | Replaced with a new UUID. |
| `investigationId` | `string` (UUID v4) | No | Overwritten | Set to target investigation ID. |
| `name` | `string` | No | `""` | Display name of the tab. |
| `order` | `number` | No | `0` | Display order (0-based). |
| `memberElementIds` | `string[]` | No | `[]` | Element IDs belonging to this tab. Remapped; missing elements dropped. |
| `excludedElementIds` | `string[]` | No | `[]` | Element IDs excluded (ghost elements dismissed by user). Remapped. |
| `createdAt` | `string` | Overwritten | `new Date()` | Always replaced. |
| `updatedAt` | `string` | Overwritten | `new Date()` | Always replaced. |

**Notes**:
- Tabs are **only imported for new investigations**. When merging into an existing investigation (with position offset), tabs are ignored and imported elements join the currently active tab.
- The `viewport` field (if present) is always **reset** to `{x: 0, y: 0, zoom: 1}`.

---

## Report Object

Reports are structured documents with sections that can reference elements.

```json
{
  "id": "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
  "investigationId": "00000000-0000-0000-0000-000000000001",
  "title": "Investigation Report",
  "sections": [
    {
      "id": "ffffffff-ffff-ffff-ffff-ffffffffffff",
      "title": "Introduction",
      "order": 0,
      "content": "This report covers [[Person A|aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa]].",
      "elementIds": ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"],
      "graphSnapshot": null
    }
  ],
  "createdAt": "2025-06-01T00:00:00.000Z",
  "updatedAt": "2025-06-01T00:00:00.000Z"
}
```

### Report Field Reference

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | `string` (UUID v4) | **Yes** | Remapped | Replaced with a new UUID. |
| `investigationId` | `string` (UUID v4) | No | Overwritten | Set to target investigation ID. |
| `title` | `string` | No | `"Rapport importé"` | Report title. |
| `sections` | `ReportSection[]` | **Yes** | - | Must contain at least one section for the report to be imported. |
| `createdAt` | `string` | Overwritten | `new Date()` | Always replaced. |
| `updatedAt` | `string` | Overwritten | `new Date()` | Always replaced. |

### ReportSection Fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | `string` (UUID v4) | **Yes** | Remapped | Replaced with a new UUID. |
| `title` | `string` | No | `""` | Section title. |
| `order` | `number` | No | Array index | Display order. |
| `content` | `string` | No | `""` | Markdown content. Element/link references use `[[Label\|UUID]]` syntax; UUIDs are remapped automatically. |
| `elementIds` | `string[]` | No | `[]` | Referenced element IDs. Remapped on import. |
| `graphSnapshot` | `GraphSnapshot \| null` | No | `null` | Canvas snapshot with `imageDataUrl`, `viewport`, and `capturedAt`. |

**Notes**:
- If a report already exists for the target investigation, the imported report is **skipped**.
- The `[[Label|UUID]]` syntax in content is automatically remapped to new UUIDs.

---

## Sub-Object Types

### Property

Typed key/value metadata pair.

```json
{ "key": "email", "value": "john@example.com", "type": "text" }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `key` | `string` | **Yes** | Property name. |
| `value` | `string \| number \| boolean \| Date \| null` | **Yes** | Property value. |
| `type` | `string` | No | One of: `"text"`, `"number"`, `"date"`, `"datetime"`, `"boolean"`, `"choice"`, `"geo"`, `"country"`, `"link"`. Defaults to `"text"` if omitted. |

### Position

```json
{ "x": 100, "y": 200 }
```

Canvas coordinates in pixels. The origin `{0, 0}` is the center of the canvas.

### GeoCoordinates

```json
{ "lat": 48.8566, "lng": 2.3522 }
```

WGS84 coordinates for map view display.

### DateRange

```json
{
  "start": "2025-01-01T00:00:00.000Z",
  "end": "2025-12-31T00:00:00.000Z"
}
```

Both `start` and `end` are individually optional (can be `null`). Dates are ISO 8601 strings.

### ElementEvent

Temporal occurrence attached to an element.

```json
{
  "id": "evt-001",
  "date": "2025-03-15T00:00:00.000Z",
  "dateEnd": "2025-03-16T00:00:00.000Z",
  "label": "Meeting in Paris",
  "description": "Observed at location",
  "geo": { "lat": 48.8566, "lng": 2.3522 },
  "properties": [],
  "source": "Surveillance"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | **Yes** | Unique identifier. |
| `date` | `string` | **Yes** | ISO 8601 date when the event occurred. |
| `dateEnd` | `string` | No | End date for duration events. |
| `label` | `string` | **Yes** | Event label. |
| `description` | `string` | No | Event description. |
| `geo` | `GeoCoordinates` | No | Location of the event. |
| `properties` | `Property[]` | No | Additional typed metadata. |
| `source` | `string` | No | Information source. |

### ElementVisual

Controls the appearance of an element on the canvas.

```json
{
  "color": "#fcd34d",
  "borderColor": "#a8a29e",
  "borderWidth": 2,
  "borderStyle": "solid",
  "shape": "circle",
  "size": "medium",
  "icon": null,
  "image": null,
  "fontSize": "md",
  "customWidth": 120,
  "customHeight": 80
}
```

| Field | Type | Default | Allowed Values |
|-------|------|---------|----------------|
| `color` | `string` | `"#f5f5f4"` | Any CSS color |
| `borderColor` | `string` | `"#a8a29e"` | Any CSS color |
| `borderWidth` | `number` | `2` | Pixels |
| `borderStyle` | `string` | `"solid"` | `"solid"`, `"dashed"`, `"dotted"` |
| `shape` | `string` | `"circle"` | `"circle"`, `"square"`, `"diamond"`, `"rectangle"` |
| `size` | `string \| number` | `"medium"` | `"small"`, `"medium"`, `"large"`, or a number (pixels) |
| `icon` | `string \| null` | `null` | Lucide icon name (e.g. `"user"`, `"building"`, `"map-pin"`) |
| `image` | `string \| null` | `null` | Asset ID used as display image |
| `fontSize` | `string` | - | `"xs"`, `"sm"`, `"md"`, `"lg"`, `"xl"` |
| `customWidth` | `number` | - | Custom width override in pixels |
| `customHeight` | `number` | - | Custom height override in pixels |

### LinkVisual

Controls the appearance of a link on the canvas.

```json
{
  "color": "#9ca3af",
  "style": "solid",
  "thickness": 2,
  "fontSize": "sm"
}
```

| Field | Type | Default | Allowed Values |
|-------|------|---------|----------------|
| `color` | `string` | `"var(--color-text-tertiary)"` | Any CSS color |
| `style` | `string` | `"solid"` | `"solid"`, `"dashed"`, `"dotted"` |
| `thickness` | `number` | `2` | Line thickness in pixels |
| `fontSize` | `string` | - | `"xs"`, `"sm"`, `"md"`, `"lg"`, `"xl"` |

### Confidence

```
type Confidence = 0 | 10 | 20 | 30 | 40 | 50 | 60 | 70 | 80 | 90 | 100
```

Must be a multiple of 10 from 0 to 100, or `null`.

### Link Direction

```
type LinkDirection = "none" | "forward" | "backward" | "both"
```

- `"none"`: undirected link (no arrows)
- `"forward"`: arrow from source to target
- `"backward"`: arrow from target to source
- `"both"`: arrows in both directions

---

## Import Behavior

### ID Remapping

All IDs (`id`, `investigationId`, asset IDs, tab IDs, report/section IDs) are regenerated as new UUID v4 values. An internal mapping (old ID -> new ID) is maintained to remap:
- `fromId` / `toId` in links
- `parentGroupId` / `childIds` in elements
- `assetIds` in elements
- `memberElementIds` / `excludedElementIds` in tabs
- `elementIds` and `[[Label|UUID]]` references in report sections

### Date Handling

- All date fields are expected as ISO 8601 strings (e.g. `"2025-06-15T00:00:00.000Z"`).
- Parsed with `new Date()`.
- `createdAt` and `updatedAt` on elements, links, tabs, and reports are **always overwritten** with the current timestamp.

### Merge vs New Investigation

- **New investigation**: All data is imported, including tabs.
- **Merge** (importing into an existing investigation with a position offset):
  - Tabs are **not imported**; elements join the currently active tab.
  - A position offset `{x, y}` is applied to top-level elements only (not children of groups).

### Orphaned References

- Links referencing elements not in the import are **silently skipped**.
- Asset IDs referencing non-imported assets are **silently dropped**.
- Child/parent group references to missing elements are set to `null` or filtered out.

### Post-Import Settings

When links are imported, the investigation display settings are automatically set to:
- `linkAnchorMode: "auto"`
- `linkCurveMode: "curved"`

---

## Size Limits (ZIP Imports)

| Limit | Value |
|-------|-------|
| Maximum elements | 50,000 |
| Maximum links | 100,000 |
| Maximum assets | 5,000 |
| Maximum JSON size | 50 MB |
| Maximum ZIP size | 500 MB |
| Maximum decompressed size | 2 GB |
| Maximum files in ZIP | 10,000 |
| Maximum single file | 100 MB |
| Maximum compression ratio | 100x |

---

## Allowed Asset MIME Types

Assets are only imported from ZIP files. Standalone JSON imports ignore asset metadata.

| Category | Types |
|----------|-------|
| Images | jpeg, png, gif, webp, svg+xml, bmp, tiff, x-icon |
| Documents | pdf, msword, docx, xls, xlsx, ppt, pptx, odt, ods, odp |
| Text | plain, csv, html, markdown, xml, json |
| Archives | zip |
| Audio | mpeg, mp3, wav, ogg, webm, aac, flac |
| Video | mp4, webm, ogg, quicktime, x-msvideo |

---

## Minimal Working Example

The smallest valid JSON that can be imported:

```json
{
  "version": "1.0.0",
  "elements": [],
  "links": []
}
```

This creates an empty investigation.

## Example with Two Linked Elements

```json
{
  "version": "1.1.0",
  "elements": [
    {
      "id": "elem-001",
      "label": "Alice",
      "position": { "x": 0, "y": 0 },
      "notes": "",
      "tags": [],
      "properties": [],
      "confidence": null,
      "source": "",
      "date": null,
      "dateRange": null,
      "isPositionLocked": false,
      "geo": null,
      "events": [],
      "visual": {
        "color": "#f5f5f4",
        "borderColor": "#a8a29e",
        "borderWidth": 2,
        "borderStyle": "solid",
        "shape": "circle",
        "size": "medium",
        "icon": null,
        "image": null
      },
      "assetIds": [],
      "parentGroupId": null,
      "isGroup": false,
      "isAnnotation": false,
      "childIds": []
    },
    {
      "id": "elem-002",
      "label": "Bob",
      "position": { "x": 300, "y": 0 },
      "notes": "",
      "tags": [],
      "properties": [],
      "confidence": null,
      "source": "",
      "date": null,
      "dateRange": null,
      "isPositionLocked": false,
      "geo": null,
      "events": [],
      "visual": {
        "color": "#f5f5f4",
        "borderColor": "#a8a29e",
        "borderWidth": 2,
        "borderStyle": "solid",
        "shape": "circle",
        "size": "medium",
        "icon": null,
        "image": null
      },
      "assetIds": [],
      "parentGroupId": null,
      "isGroup": false,
      "isAnnotation": false,
      "childIds": []
    }
  ],
  "links": [
    {
      "id": "link-001",
      "fromId": "elem-001",
      "toId": "elem-002",
      "sourceHandle": null,
      "targetHandle": null,
      "label": "knows",
      "notes": "",
      "tags": [],
      "properties": [],
      "direction": "forward",
      "confidence": null,
      "source": "",
      "date": null,
      "dateRange": null,
      "visual": {
        "color": "#9ca3af",
        "style": "solid",
        "thickness": 2
      },
      "curveOffset": { "x": 0, "y": 0 }
    }
  ]
}
```

## Example with Groups and Tabs

```json
{
  "version": "1.1.0",
  "elements": [
    {
      "id": "group-001",
      "label": "Organization",
      "position": { "x": 0, "y": 0 },
      "notes": "",
      "tags": [],
      "properties": [],
      "confidence": null,
      "source": "",
      "date": null,
      "dateRange": null,
      "isPositionLocked": false,
      "geo": null,
      "events": [],
      "visual": {
        "color": "#e0e7ff",
        "borderColor": "#6366f1",
        "borderWidth": 2,
        "borderStyle": "dashed",
        "shape": "rectangle",
        "size": "large",
        "icon": null,
        "image": null
      },
      "assetIds": [],
      "parentGroupId": null,
      "isGroup": true,
      "isAnnotation": false,
      "childIds": ["elem-001", "elem-002"]
    },
    {
      "id": "elem-001",
      "label": "Alice",
      "position": { "x": 50, "y": 50 },
      "notes": "",
      "tags": [],
      "properties": [],
      "confidence": null,
      "source": "",
      "date": null,
      "dateRange": null,
      "isPositionLocked": false,
      "geo": null,
      "events": [],
      "visual": {
        "color": "#f5f5f4",
        "borderColor": "#a8a29e",
        "shape": "circle",
        "size": "medium",
        "icon": "user",
        "image": null
      },
      "assetIds": [],
      "parentGroupId": "group-001",
      "isGroup": false,
      "isAnnotation": false,
      "childIds": []
    },
    {
      "id": "elem-002",
      "label": "Bob",
      "position": { "x": 200, "y": 50 },
      "notes": "",
      "tags": [],
      "properties": [],
      "confidence": null,
      "source": "",
      "date": null,
      "dateRange": null,
      "isPositionLocked": false,
      "geo": null,
      "events": [],
      "visual": {
        "color": "#f5f5f4",
        "borderColor": "#a8a29e",
        "shape": "circle",
        "size": "medium",
        "icon": "user",
        "image": null
      },
      "assetIds": [],
      "parentGroupId": "group-001",
      "isGroup": false,
      "isAnnotation": false,
      "childIds": []
    }
  ],
  "links": [],
  "tabs": [
    {
      "id": "tab-001",
      "name": "All entities",
      "order": 0,
      "memberElementIds": ["group-001", "elem-001", "elem-002"]
    },
    {
      "id": "tab-002",
      "name": "Analysis",
      "order": 1,
      "memberElementIds": ["elem-001"]
    }
  ]
}
```

---

## Other Supported JSON Formats

Zeroneurone also auto-detects and imports these external formats:

| Format | Detection | Description |
|--------|-----------|-------------|
| Excalidraw | `{ type: "excalidraw", elements: [...] }` | Excalidraw whiteboard export |
| STIX 2.1 | `{ type: "bundle", objects: [...] }` | Structured Threat Information eXpression |
| OSINT Industries | Array with `module`, `query`, `status` | OSINT Industries API output |
| OI Graph Palette | `{ nodes }` with `textNode`/`moduleNode`/`imageNode` | OI Graph export |
| PredicaGraph | `{ nodes, edges }` with typed node data | PredicaGraph export |

If no format matches, the import fails with: `"Format JSON non reconnu"`.
