---
title: "Search"
weight: 8
---

# Search

Quickly find any element or link in your investigation.


## Quick Search

### Open Search

| Method | Action |
|--------|--------|
| **Ctrl+K** | Keyboard shortcut |
| **🔍** | Button in toolbar |

### Search

1. Type your search
2. Results appear in real-time
3. Navigate with ↑↓
4. Enter to select


---

## Indexed Content

Search covers:

| Field | Weight |
|-------|--------|
| **Label** | High |
| **Notes** | Medium |
| **Tags** | Medium |
| **Properties** | Normal |
| **Extracted text** | Normal |

{{< hint info >}}
**Extracted text**: Text content from PDF and text files attached to elements is automatically indexed. See [Attachments - Text Extraction]({{< relref "attachments#text-extraction" >}}).
{{< /hint >}}

### Fuzzy Search

Search tolerates minor typos:

- "dupond" finds "Dupont"
- "marie" finds "Marie", "Married"

---

## Results

### Display

Each result shows:

- **Icon**: Type (element or link)
- **Label**: Element/link name
- **Context**: Extract of matching text
- **Tags**: First tags


### Actions

| Action | Result |
|--------|--------|
| **Click / Enter** | Selects and centers on canvas |
| **Ctrl+click** | Adds to selection |
| **Escape** | Closes search |

---

## Search Filters

### By Type

Prefix your search to target:

| Prefix | Search |
|--------|--------|
| `e:` | Elements only |
| `l:` | Links only |
| `t:` | By tag |

Examples:
- `e:dupont` → Elements containing "dupont"
- `t:suspect` → Elements with tag "suspect"

### By Property

Search by property:

- `prop:phone` → Elements having a "phone" property
- `prop:phone:555` → Value containing "555"

---

## History

Recent searches are remembered:


- Click on a recent search to relaunch it
- History is per investigation

---

## Performance

Search is optimized to stay fast even on large investigations:

| Size | Performance |
|------|-------------|
| < 1000 elements | Instant |
| 1000-10000 | < 100ms |
| > 10000 | < 500ms |

The index is rebuilt each time an investigation is opened.

---

**See also**: [Filters and views]({{< relref "filters-views" >}})
