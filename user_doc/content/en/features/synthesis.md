---
title: "Synthesis"
weight: 10
---

# Synthesis Generation

Generate automatic structured reports from your investigation.

---

## Access synthesis

Toolbar → **Synthesis** button (document icon)

---

## Configure synthesis

### Title

Customize the generated document title. By default, the investigation name is used.

### Content to include

Select sections to include in the synthesis:

| Option | Description |
|--------|-------------|
| Investigation description | Descriptive text of the investigation |
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
| Sort by | Name, Date, or Confidence |

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

### Print

Opens a print window with the formatted HTML document.

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
