---
title: "Matrix View"
weight: 8
---

# Matrix View

Display all investigation elements in a sortable, filterable spreadsheet.

---

## Access

Switch to matrix view using the **view selector** in the top toolbar (table icon) or press **4**.

---

## Table features

### Columns

| Column | Content |
|--------|---------|
| **Label** | Element name (fixed, always visible) |
| **Type** | First tag |
| **Confidence** | Confidence level (0-100%) |
| **Source** | Source attribution |
| *Properties* | One column per custom property used across elements |

### Column management

- **Sort**: Click a column header to sort (ascending/descending)
- **Resize**: Drag the right edge of a column header
- **Reorder**: Drag the grip icon on a column header
- **Show/hide**: Use the columns button in the toolbar to toggle column visibility
- **Filter**: Type in the filter row below headers to filter by column content

---

## Inline editing

**Double-click** a cell to edit its value directly in the table.

| Key | Action |
|-----|--------|
| **Enter** | Save and exit editing |
| **Escape** | Cancel editing |
| **Tab** | Save and move to next column |
| **Shift+Tab** | Save and move to previous column |
| **Arrow Up/Down** | Save and move to adjacent row |

All edits support **undo/redo** (Ctrl+Z / Ctrl+Shift+Z).

{{< hint info >}}
Inline editing is disabled in anonymous mode.
{{< /hint >}}

---

## Row selection

| Action | Result |
|--------|--------|
| **Click** | Select a single row |
| **Ctrl+click** | Toggle row in selection |
| **Shift+click** | Select range from last clicked row |

Selected rows are highlighted. Use **Ctrl+C** to copy selected rows as tab-separated text (headers included).

---

## CSV export

Click the **download icon** in the toolbar to export the current view as CSV.

- Respects active column visibility, sort order, and filters
- File name: `investigation-name_matrice_ddMMyyyyHHmmss.csv`
- UTF-8 encoding with BOM for Excel compatibility

---

## Toolbar

| Control | Function |
|---------|----------|
| Element count | Shows filtered / total elements and property count |
| Columns | Toggle column visibility (show all / hide all) |
| Export | Download CSV |
| Reset | Restore default sort, columns, and filters |
| Undo/Redo | Undo/redo last action |
| Anonymous mode | Redact element names and values |

---

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| **Ctrl+Z** | Undo |
| **Ctrl+Shift+Z** / **Ctrl+Y** | Redo |
| **Ctrl+C** | Copy selected rows |

---

**See also**: [Elements and links]({{< relref "elements-links" >}}) | [Filters and views]({{< relref "filters-views" >}})
