---
title: "Attachments"
weight: 7
---

# Attachments

Attach documents, images, and files to your elements, and to your links, to enrich your documentation.


{{< screenshot "files-section.png" "Element Files section" >}}

## Supported Formats

| Category | Formats |
|----------|---------|
| **Images** | PNG, JPG, GIF, WebP, SVG, TIFF |
| **Documents** | PDF, DOCX, XLSX, PPTX |
| **Emails** | EML (RFC 822) |
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


### Paste an Image

1. Copy an image (screenshot, web image…)
2. Select an element
3. **Ctrl+V**: the image is attached to the element

> Any file addition (paste, drag-and-drop, button) can be undone with **Ctrl+Z**; **Ctrl+Y** redoes it.


### Files on a link

A document may prove the relationship itself rather than either party: the deed of a sale, a transfer order, a call record. Select the link: its detail panel also has a **Files** section, with the same drag-and-drop, button and paste (**Ctrl+V** with the link selected).

- On the canvas, a paperclip followed by the number of files shows under the link label (hidden from the **Views** panel, **Links** section, **Show** group).
- Text extracted from a link's files is indexed: search (Ctrl+K) finds the link.
- They appear in the synthesis (links table and attached files list), in the interactive report (clicking a link's paperclip shows its files), in the Obsidian export (the relation line points to their copy in `attachments/`) and on the mobile companion (under the link, on the sheet of each of its two elements).
- A link's files have no canvas thumbnail and no metadata import (that metadata fills an element's properties and position).
- When two elements are merged and two identical links of theirs become one, the kept link keeps the files of both.

{{< hint info >}}
**Link or element?** A relationship between two parties, proven by a document: a file on the link is enough. A transaction with several parties (seller, buyer, notary, property) or several documents is better shown as a "Sale of …" element linked to each of them.
{{< /hint >}}


---

## Preview

### Images

Images display as thumbnails on the canvas. When you zoom in or resize a node beyond 250px on screen, the full-resolution image loads automatically from local storage. Zooming back out reverts to the lightweight thumbnail. Up to 30 HD images are cached simultaneously.

**Hide media on an element** — in the **Files** panel, the "Hide media on node" link shows the element's **label** instead of its image on the canvas. The file stays attached; only the display changes. This setting is per-element (distinct from the global "blur media" toolbar button).

**Blur media on open** — for a sensitive dossier, check **Blur media on open** in the dossier's **Options**: media are blurred each time the dossier is opened, and as soon as the option is turned on (including by a collaborator in a shared session). The toolbar "blur media" button shows them for the session.


**Full-screen preview** — the eye icon on the file row opens the image with zoom controls, from 40% to 300%. It opens fitted to width and the window scrolls around it once enlarged: useful for reading a scanned document or examining a detail on a scene photograph. The same controls apply to the PDF preview.


### PDF

PDFs open in an integrated viewer. Pages scroll continuously; the counter follows the current page and the arrows jump from page to page.

- **Fit** — "Page width" or "Whole page". The chosen mode is kept when the panel is resized; zooming by hand leaves it.
- **Search** — the magnifier next to the page counter, or Ctrl+F in the preview. Search ignores case and accents; matches are highlighted, Enter goes to the next one, Shift+Enter to the previous one, Escape closes the search.
- **Select** — text can be selected and copied as in a document; releasing the mouse over an empty area stops the selection there.


### Other Files

Other formats display an icon and allow download.

---

## File Management

### Available Actions

| Action | Description |
|--------|-------------|
| **Preview** | Open in viewer |
| **Download** | Save to your machine |
| **Extract text** | Run or re-run text content extraction |
| **Clear text** | Remove extracted text from the index |
| **Delete** | Remove file from element or link |


### Shared Files

The same file can be attached to multiple elements and links:

- The file is stored only once (deduplication)
- Removing it from one element or link leaves it on the others
- Once nothing uses it (no element, link, element image or source citing it), removing it **erases** it from the browser: it does not come back on reload and no longer goes into exports
- Exceptions: if a deleted element or link that carried it can still come back with **Ctrl+Z**, or if the dossier is shared (a collaborator's undo may need it), the file stays stored, without going into exports; see **Unused files** below

### Unused files

The files of deleted elements and links stay stored in the browser so that an undo (**Ctrl+Z**) brings them back. They go into no export, but they are not erased on their own, even after a reload.

To restore or erase them: dossier panel, **Retention** section, **Unused files** list (name, size, preview on hover, total at the top). Tick files, or **Select all**, then use the icons at the top of the list:

- **Restore**: creates one element per file at the centre of the view, with the file attached and its name as label; **Ctrl+Z** removes them and puts the files back in the list
- **Erase** (bin), then confirm. An undo will no longer bring them back, yours or a collaborator's in a shared dossier. The list only shows when there are some.

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
| **EML** | Sender, recipients, subject, sent date, Message-ID, mail client, originating IP (last public relay), return-path and reply-to when they differ from the sender, attachments, body links and remote images (tracking pixels) |

### Import Process

When you add a file containing metadata:

1. A window displays the detected metadata
2. Select which ones to import (all checked by default)
3. Click **Import** or **Ignore**

Imported metadata become element properties.

When several files are added at once, tick **Apply to the next files**: the same choice (import these metadata, or ignore) applies to the other files of that addition, including those still loading.

### Re-running extraction

If you clicked **Ignore**, or simply want to revisit it later, the **Extract metadata** button (information icon) on the file row runs the analysis again. It is available on every file type, images included, where it recovers a photograph's GPS coordinates after the fact. When a file holds none, a message says so.

### Automatic Geolocation

If an image contains **GPS coordinates** (EXIF):

- A "GPS Coordinates" option appears in the list
- If imported, the element is automatically geolocated
- The element becomes visible on the map view

{{< hint info >}}
**Tip**: Smartphone photos often contain GPS coordinates. Import them to automatically place your elements on the map.
{{< /hint >}}

---

## Text Extraction

ZeroNeurone automatically extracts text content from PDF, DOCX, ODT and text files (TXT, Markdown, CSV...) when added to an element. This text is indexed for global search (Ctrl+K).

### Supported Formats

| Format | Extraction |
|--------|-----------|
| **PDF** | Selectable text (up to 100 pages) |
| **DOCX** | Text content extracted from Word XML |
| **ODT** | Text content extracted from OpenDocument format |
| **TXT, MD, CSV** | Full content |

### Viewing

Extracted text is indicated below the filename by a character count. Click it to expand a content preview.

### Actions

| Action | Icon | Description |
|--------|------|-------------|
| **Extract / Re-extract** | ScanText | Run extraction on demand (or re-run it) |
| **Clear** | FileX2 | Remove extracted text from the index |

### Search

Extracted text is automatically indexed in the search engine. A Ctrl+K search for a word present in a PDF will find the element the file is attached to.

{{< hint info >}}
**Tip**: If automatic extraction fails (scanned PDF without selectable text), the ScanText button lets you re-run extraction at any time.
{{< /hint >}}

---

## Export with Files

### ZIP Export

The **ZIP** export includes the files attached to elements and links. Files nothing uses anymore (those of a deleted element or link, kept so the deletion can be undone) are left out:

```
dossier.zip
├── dossier.json          # Metadata
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

Files are reassociated to elements and links via their identifier in the JSON.

---

**See also**: [Search]({{< relref "search" >}})
