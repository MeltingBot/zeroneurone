---
title: "Synthesis"
weight: 10
---

# Synthesis Generation

Generate automatic structured reports from your dossier.

---

{{< screenshot "synthesis-dialog.png" "Synthesis generation dialog" >}}

## Access synthesis

Toolbar → **Synthesis** button (document icon)

---

## Configure synthesis

### Title

Customize the generated document title. By default, the dossier name is used.

### Scope

The synthesis covers the **whole dossier**, a **tab**, or the canvas **selection** (offered when there is one).

- The links kept are those between the kept elements. A selected link brings its two elements, a group its children.
- **Linked elements** adds the direct neighbours of these elements and the links to them, like the ghosts of a tab. Two neighbours are not joined to each other in the synthesis.
- Attached files, statistics and graph analysis only cover this scope.

{{< hint warning >}}
The window opens on the current selection when there is one, otherwise on the open tab. Check the scope before generating a synthesis of the whole dossier.
{{< /hint >}}

### Content to include

Check the parts to include. They are written in the order of the list: the arrows on each line move it up or down. The chosen order is kept for the next syntheses; **Default order** restores it.

| Part | Description |
|--------|-------------|
| Dossier description | Descriptive text of the dossier |
| Statistical summary | Number of elements, links, tags, etc. |
| Graph capture | Image of the canvas |
| Map capture | The map in SVG: basemap as an image, the rest as vectors |
| Timeline capture | The timeline in SVG, over the whole period of the elements |
| Graph analysis | Clusters, centrality, bridges, isolated elements |
| Timeline | Dated events sorted chronologically |
| Element list | All elements with their properties |
| Link list | All relationships between elements |
| Attached files | List of attachments |
| Detailed sheets | Complete sheet for each element |

### Captures

Captures are taken in light mode, framed on the content. The map is framed on the places of the scope and every element keeps its own marker: none is gathered in a cluster. When the synthesis covers a tab or a selection, **only the elements of the scope** appear in the captures: the rest of the dossier is hidden while capturing, then the view returns as it was. The selection is not drawn.

Captures are part of the HTML and DOCX exports and of printing, not of Markdown.

{{< hint info >}}
With **Linked elements**, two elements linked to the scope stay joined on the captures when a link connects them in the dossier, while the link list of the synthesis leaves it out.
{{< /hint >}}

### Layout

| Option | Description |
|--------|-------------|
| One part per page | Each part starts on a new page, in DOCX and when printing |
| One sheet per page | With the detailed sheets: each sheet starts on a new page, in DOCX and when printing |
| Links to the sheets | With the detailed sheets: in HTML and DOCX, an element's name (lists, timeline, relations) leads to its sheet |

In a detailed sheet, the attached files come first, with their thumbnail.

While generating, the window is locked and a bar shows the current step.

### Scope first

With **Linked elements**, the elements of the scope come first:
- in the element list, then the others under **Linked elements**;
- in the detailed sheets, then the others under **Linked sheets**.

### Element options

If you include the element list:

| Option | Description |
|--------|-------------|
| Custom properties | Properties column in the element list |
| Group by tag | Organizes elements by their tags |
| Sort by | Name, Date, or Confidence (Grading with the Europol / Admiralty model) |

### Template

In the window header, the floppy disk (**Save as template**) keeps the checked options: parts, captures, layout and element options. They are taken again each time the synthesis opens, in every dossier. The title and the scope stay specific to each synthesis; the order of the parts is kept separately.

The circular arrow (**Default options**) forgets the template and goes back to the original settings. The template is kept in this browser only.

---

## Export formats

### HTML

Formatted web document, ready to view in a browser.

- Professional layout
- Embedded images
- Print-optimized styles

### DOCX

Word document (.docx), editable in Word, LibreOffice or Google Docs: headings, tables, clickable source links, captures as images. The map and the timeline are in SVG, with a fallback image for software that does not read SVG.

### Markdown

Plain text with Markdown syntax.

- Portable and lightweight
- Editable in any text editor
- Compatible with wikis and documentation

### JSON+

Enriched structured export with analysis data.

```json
{
  "investigation": { ... },
  "elements": [ ... ],
  "links": [ ... ],
  "analysis": {
    "clusters": [ ... ],
    "centrality": [ ... ],
    "bridges": [ ... ]
  }
}
```

Useful for:
- Integration with other tools
- Programmatic analysis
- Structured archiving

### Print / PDF

Opens a print window with the formatted HTML document. For a PDF, choose **Save as PDF** as the printer: the text stays selectable and searchable in the PDF.

### Origin notice

Every synthesis ends with the notice "Synthesis generated by ZeroNeurone" and a link to zeroneurone.com. In DOCX, it is in the footer of every page; when printing too, with browsers that support page margins (Chrome, Edge).

---

## Generated content

### Statistical summary

The summary includes:
- Total element count
- Total link count
- Unique tag count
- Attached file count
- Elements with geographic coordinates
- Elements with dates

### Graph analysis

If analysis is included, the synthesis contains:

**Identified clusters**
- Groups of elements strongly connected to each other
- Member count per cluster

**Central elements**
- Elements with the most connections
- Centrality score

**Bridge elements**
- Elements connecting different clusters
- Role in graph structure

**Isolated elements**
- Elements with no connections

### Timeline

Chronological table with:
- Event date
- Related element
- Description

### Detailed sheets

For each element:
- Identity (label)
- Tags
- Notes
- Properties
- Relations (incoming and outgoing links)
- Attached files

---

## Best practices

1. **Select relevant content**: Only include sections useful to your audience
2. **Use captures**: The visual graph helps understand relationships
3. **Group by tag**: Logically organizes elements
4. **Appropriate format**: HTML for viewing, DOCX to rework the document, Markdown for editing, JSON+ for integration

---

**See also**: [Report]({{< relref "report" >}}) • [Export]({{< relref "/import-export/export" >}})
