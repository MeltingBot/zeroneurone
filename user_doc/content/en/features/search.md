---
title: "Search"
weight: 8
---

# Search

Quickly find any element or link in your dossier.


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
| **Comments** | Normal |

{{< hint info >}}
**Extracted text**: Text content from PDF, DOCX, ODT and text files attached to elements is automatically indexed. See [Attachments - Text Extraction]({{< relref "attachments#text-extraction" >}}).
{{< /hint >}}

### Broad or Strict

Two buttons next to the search field set how tolerant it is. The choice is remembered.

| Mode | Typos | Several words | Word start |
|------|-------|---------------|------------|
| **Broad** (default) | Allowed: "dupond" finds "Dupont" | Any one is enough | Accepted for every word |
| **Strict** | None | All must be present | Only for the last word typed |

Example: "jean martin" finds every Jean and every Martin in **Broad**, only Jean Martin in **Strict**.

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
- History is per dossier

---

## Performance

The index is rebuilt each time a dossier opens. On a large dossier, it is built in slices: the screen stays usable, and the activity bar shows **Indexing for search** until it ends. A search run meanwhile covers the part already indexed; the search window runs it again once the index is complete.

A word is found in under 20 ms on 10,000 elements with 50 properties. The start of an identifier (number, hash) can take 0.4 s when the dossier holds many unique values. Details in [Limits and performance]({{< relref "../reference/performance" >}}).

---

**See also**: [Filters and views]({{< relref "filters-views" >}})
