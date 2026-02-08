---
title: "Attachments"
weight: 7
---

# Attachments

Attach documents, images, and files to your elements to enrich your documentation.


## Supported Formats

| Category | Formats |
|----------|---------|
| **Images** | PNG, JPG, GIF, WebP, SVG, TIFF |
| **Documents** | PDF, DOCX, XLSX, PPTX |
| **Other** | Any file (stored, limited preview) |

---

## Add Files

### Drag and Drop

1. Select an element
2. Drag a file from your file explorer
3. Drop on the detail panel or on the element


### Add Button

1. Select an element
2. Detail panel → **Files** section
3. Click **+ Add file**
4. Select the file


---

## Preview

### Images

Images display as thumbnails on the canvas. When you zoom in or resize a node beyond 250px on screen, the full-resolution image loads automatically from local storage. Zooming back out reverts to the lightweight thumbnail. Up to 30 HD images are cached simultaneously.


### PDF

PDFs open in an integrated viewer.


### Other Files

Other formats display an icon and allow download.

---

## File Management

### Available Actions

| Action | Description |
|--------|-------------|
| **Preview** | Open in viewer |
| **Download** | Save to your machine |
| **Delete** | Remove file from element |


### Shared Files

The same file can be attached to multiple elements:

- The file is stored only once (deduplication)
- Deleting from one element doesn't delete from others

---

## Storage

### Local Storage

Files are stored **locally** in your browser via OPFS (Origin Private File System).

{{< hint info >}}
**100% local**: Your files never leave your machine without explicit action.
{{< /hint >}}

### Deduplication

ZeroNeurone uses SHA-256 hash to avoid duplicates:

- Same file attached 10 times = stored only once
- Saves storage space

### Limits

| Limit | Value |
|-------|-------|
| **Max size per file** | Depends on browser (~2 GB) |
| **Total space** | Browser quota |

---

## Metadata Extraction

ZeroNeurone automatically extracts metadata from attached files and offers to import them as element properties.

### Supported Formats

| Format | Extracted Metadata |
|--------|-------------------|
| **JPEG, TIFF, WebP** | Capture date, camera (make/model), dimensions, exposure, aperture, ISO, focal length, **GPS coordinates** |
| **PDF** | Creator, producer, creation/modification dates, page count |
| **DOCX, XLSX, PPTX** | Author, modified by, creation/modification dates, title, subject, page/word count |

### Import Process

When you add a file containing metadata:

1. A window displays the detected metadata
2. Select which ones to import (all checked by default)
3. Click **Import** or **Ignore**

Imported metadata become element properties.

### Automatic Geolocation

If an image contains **GPS coordinates** (EXIF):

- A "GPS Coordinates" option appears in the list
- If imported, the element is automatically geolocated
- The element becomes visible on the map view

{{< hint info >}}
**Tip**: Smartphone photos often contain GPS coordinates. Import them to automatically place your elements on the map.
{{< /hint >}}

---

## Export with Files

### ZIP Export

The **ZIP** export includes all attached files:

```
investigation.zip
├── investigation.json    # Metadata
└── assets/              # Attached files
    ├── abc123.pdf
    ├── def456.png
    └── ...
```


### Other Formats

JSON, CSV, GraphML exports do **not** include files (metadata only).

---

## Import with Files

### ZIP Import

ZIP import automatically restores attached files.


### Matching

Files are reassociated to elements via their identifier in the JSON.

---

**See also**: [Search]({{< relref "search" >}})
