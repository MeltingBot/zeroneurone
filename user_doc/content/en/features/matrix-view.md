---
title: "Matrix View"
weight: 8
---

# Matrix View

Display the dossier's elements, or its links, in a sortable, filterable spreadsheet.

---

## Access

Switch to matrix view using the **view selector** in the top toolbar (table icon) or press **4**.

---

## Elements and links

The **Elements / Links** choice, at the start of the toolbar, switches the rows of the table. Each table keeps its sort, filters and columns when you switch back and forth.

The links table shows the links whose two ends are displayed (active tab, hidden elements). Its columns: **Label**, **From**, **To**, **Start date**, **End date**, **Direction**, then Type, Confidence, Source and one column per link property. A link is dimmed when either end is. Label, type, confidence, source and properties are edited as for elements; the ends, dates and direction are edited on the canvas. Querying from a cell and **All views** apply to elements only.

---

## Table features

### Columns

| Column | Content |
|--------|---------|
| **Label** | Element name (fixed, always visible) |
| **Type** | First tag |
| **Confidence** | Confidence level (0-100%), or grading (`B2`) with the [Europol / Admiralty model]({{< relref "evaluation" >}}) |
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

Links in the **Source** column (web page, attached document, extension) open with a click. It is edited in a multi-line box, one source per line: **Enter** adds a line, **Ctrl+Enter** saves.

Dates are edited as `YYYY-MM-DD HH:mm`, in the source's time zone.

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

## Export

The **export icon** in the toolbar offers:

- **CSV (this table)**: the table shown, elements or links. File name: `dossier-name_matrice_ddMMyyyyHHmmss.csv` (`_matrice-liens_` for links), UTF-8 with BOM for Excel
- **XLSX workbook** (Excel) or **ODS workbook** (LibreOffice / OpenOffice Calc): one file with two sheets, **Elements** and **Links**. Numbers are numbers and dates are dates (hour as shown, no time zone), to sort and compute in the spreadsheet; the header row is frozen and filterable

Each export follows the column visibility, sort and filters of its table. A links table never opened is exported with all its columns, unfiltered.

---

## Toolbar

| Control | Function |
|---------|----------|
| Elements / Links | Choose the rows of the table |
| Count | Shows filtered / total rows and property count |
| Columns | Toggle column visibility (show all / hide all) |
| Export | CSV of the table, or XLSX / ODS workbook of both tables |
| All views | Apply the column filters to the other views (see below) |
| Reset | Restore default sort, columns, and filters |
| Undo/Redo | Undo/redo last action |
| Anonymous mode | Redact element names and values |

### Query from a cell

Right-click a cell ▸ **Query this value**: writes and runs the [ZNQuery query]({{< relref "queries" >}}) `column = "value"` (exact value, case aside), applied to every view, and opens its panel. The entry does not show on columns without an equivalent query (see below) or on an empty cell.

### Apply the filters to the other views

Column filters apply to the matrix only. The **All views** button, shown once a filter is filled in, turns them into a [ZNQuery]({{< relref "queries" >}}) applied as a filter: the canvas, map, timeline and [link suggestions]({{< relref "link-suggestions" >}}) then keep the same elements.

- A "flagra" filter on the *Type d'enquête* column becomes `"Type d'enquête" CONTAINS "flagra"`, case aside.
- If a query already filters the views, the column filters are added to it (`AND`).
- The column filters stay in place; the button is greyed out while the query contains them.
- A column with no equivalent query blocks the button (its tooltip names it): confidence or grading, date or yes/no property, a filter on "—", a property named like a reserved field (`source`, `date`…).
- On the *Type* column, the query looks in all the element's tags, not only the first.

To also keep what is linked to the elements found, edit the query afterwards: `WITHIN 2 HOPS OF ("Type d'enquête" CONTAINS "flagra")`.

---

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| **Ctrl+Z** | Undo |
| **Ctrl+Shift+Z** / **Ctrl+Y** | Redo |
| **Ctrl+C** | Copy selected rows |

---

**See also**: [Elements and links]({{< relref "elements-links" >}}) | [Filters and views]({{< relref "filters-views" >}})
