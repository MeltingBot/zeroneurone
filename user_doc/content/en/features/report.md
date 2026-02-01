---
title: "Report"
weight: 9
---

# Report Panel

Write structured reports with references to elements in your investigation.

---

## Access the report

Side panel → **Report** tab

---

## Create a report

If no report exists, click **Create report**.

A report consists of:
- A **title** (editable at the top of the panel)
- **Sections** containing Markdown text

---

## Manage sections

### Add a section

Click **Add section** at the bottom of the panel.

### Reorder sections

Drag and drop the handle on the left of each section.

### Delete a section

Click the delete icon in the section header.

### Expand/Collapse

Click the arrow to expand or collapse a section's content.

---

## Edit content

### Read / Write mode

Each section has a pencil/check button:

| Icon | Mode | Behavior |
|------|------|----------|
| ✏️ Pencil | Read | Clicking a link navigates to the element |
| ✓ Check | Write | Text is editable |

- **Read mode**: View the Markdown rendering. Links to elements are clickable and take you to the canvas.
- **Write mode**: Edit the content. Click ✓ to validate and sync changes.

### Collaborative editing

When working with others:
- A **lock indicator** appears when another user is editing a section
- The locking user's name and color are displayed below the editor
- Wait for them to finish (click ✓) before you can edit that section
- Changes sync automatically after validation

### Markdown syntax

Content supports full Markdown:

```markdown
## Section title
Normal text with **bold** and *italic*.

- Bullet list
- Another item

1. Numbered list
2. Second point

> Quote

`inline code`

[External link](https://example.com)
```

---

## Reference elements

### Insert a link

1. Switch to write mode (pencil)
2. Type `[[`
3. Select the element from the dropdown
4. The link is inserted in `[[Name|uuid]]` format

### Link format

```
[[Sophie Fontaine|0041b30f-89c6-4d38-9899-be0ebce0ea25]]
```

The label can be customized:
```
[[The director|0041b30f-89c6-4d38-9899-be0ebce0ea25]]
```

### Link behavior

| Mode | Click on link | Result |
|------|---------------|--------|
| Read | Normal click | Navigates to element on canvas |
| Write | Normal click | Reveals `[[...]]` format for editing |

### Deleted elements

If a referenced element is deleted, the link appears strikethrough with "(deleted)".

---

## Export the report

### Export bar

At the top of the panel, use:

| Icon | Function |
|------|----------|
| 🔗 / 🔗̸ | Toggle between export with/without internal links |
| ⬇️ | Download as Markdown |

### With internal links

The `[[Label|uuid]]` format is preserved. Useful if you reimport the report later.

### Without internal links

Links are replaced by the label only. Example:
- Before: `[[Sophie Fontaine|abc123]]`
- After: `Sophie Fontaine`

---

## Copy and paste

### Paste from canvas

Copy elements on the canvas (Ctrl+C) then paste in the report (Ctrl+V). References are automatically inserted as `[[Label|uuid]]` links.

### Copy from report

When you select text in the report and copy (Ctrl+C), element links are preserved in `[[Label|uuid]]` format. You can paste them:
- In another section of the same report
- In a different report
- In an external text editor (the format is preserved)

---

## Best practices

1. **Structure with sections**: Use distinct sections for context, analysis, conclusions
2. **Use references**: Link key elements to facilitate navigation
3. **Custom labels**: Adapt the displayed text to the report context
4. **Regular export**: Save as Markdown for external archiving

---

**See also**: [Elements and links]({{< relref "elements-links" >}})
