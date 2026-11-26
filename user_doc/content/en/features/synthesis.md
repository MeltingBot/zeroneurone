---
title: "Synthesis"
weight: 10
---

# Synthesis Generation

Generate automatic structured reports from your dossier.

---

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

Select sections to include in the synthesis:

| Option | Description |
|--------|-------------|
| Dossier description | Descriptive text of the dossier |
| Statistical summary | Number of elements, links, tags, etc. |
| Graph analysis | Clusters, centrality, bridges, isolated elements |
| Timeline | Dated events sorted chronologically |
| Element list | All elements with their properties |
| Link list | All relationships between elements |
| Custom properties | Property table per element |
| Attached files | List of attachments |
| Detailed sheets | Complete sheet for each element |

### Screenshot

Check **Include graph** to add a canvas capture.

{{< hint info >}}
The capture is taken full-width in light mode for better readability.
{{< /hint >}}

### Element options

If you include the element list:

| Option | Description |
|--------|-------------|
| Group by tag | Organizes elements by their tags |
| Sort by | Name, Date, or Confidence (Grading with the Europol / Admiralty model) |

---

## Export formats

### HTML

Formatted web document, ready to view in a browser.

- Professional layout
- Embedded images
- Print-optimized styles

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
4. **Appropriate format**: HTML for viewing, Markdown for editing, JSON+ for integration

---

**See also**: [Report]({{< relref "report" >}}) • [Export]({{< relref "/import-export/export" >}})
