---
title: "Canvas Tabs"
weight: 4
---

# Canvas Tabs

Organize your investigation into **thematic workspaces**. Each tab contains a subset of elements, letting you split complex cases into focused views (e.g., "Financial flows", "Persons of interest", "Locations").

---

## Tab Bar

The tab bar appears below the toolbar as soon as at least one tab exists. It always includes the **All** view, which shows every element regardless of tab membership.

| Item | Description |
|------|-------------|
| **All** | Shows all elements in the investigation |
| **Named tabs** | User-created tabs, each with its own subset of elements |
| **+** | Creates a new tab |

---

## Managing Tabs

### Create a Tab

Click **+** in the tab bar. A new named tab is added. The maximum is **10** tabs per investigation.

### Rename a Tab

**Double-click** on the tab name in the bar to edit it inline.

### Delete a Tab

Right-click on a tab → **Delete tab**.

{{< hint info >}}
**No data loss**: Deleting a tab removes the organizational container only. Elements are never deleted by this action.
{{< /hint >}}

### Reorder Tabs

**Drag** tabs in the bar to change their order.

---

## Working with Elements in Tabs

### Add Elements to a Tab

Right-click an element → **Add to tab...** → select the target tab.

### Remove Elements from a Tab

Right-click an element → **Remove from tab**.

### Navigate Between Tabs

Click a tab name in the bar to switch. Click **All** to see every element.

---

## Ghost Elements

Elements that belong to another tab but are connected to an element in the current tab appear as **ghost elements**.

| Aspect | Behavior |
|--------|----------|
| **Appearance** | Semi-transparent |
| **Badge** | Shows which tab(s) the element belongs to |
| **Navigation** | Right-click → **Go to tab [name]** to switch to the element's tab |

Ghost elements provide continuity: you see the connections across tabs without having to switch.

---

## Interaction with Other Features

### Search

If a search result (**Ctrl+K**) belongs to a different tab, the search automatically switches to that tab before centering on the element.

### Saved Views

Views remember which tab was active. Loading a view restores the corresponding tab.

### Undo / Redo

Tab membership changes (adding or removing elements from a tab) are tracked. **Ctrl+Z** / **Ctrl+Shift+Z** works as expected.

### Focus Mode

Focus mode (**F**) operates within the context of the current tab.

---

## Collaboration

| Aspect | Behavior |
|--------|----------|
| **Tab structure** | Synchronized (names, members, order) |
| **Active tab** | Local per user |
| **Viewport per tab** | Local per user |
| **Real-time updates** | Tab changes appear instantly for all connected users |

Each collaborator navigates tabs independently. Creating, renaming, deleting, or reordering tabs is visible to everyone.

---

## Import / Export

| Scenario | Behavior |
|----------|----------|
| **ZIP / JSON export** | Tabs are included |
| **Import new investigation** | Tabs are restored |
| **Import into existing investigation (merge)** | Imported elements go to the active tab; source tabs are not imported |

---

## Tips

- Use tabs to split a complex investigation by theme, hypothesis, or timeline period.
- The **All** view is always available and shows every element, regardless of tab assignment.
- Ghost elements let you see cross-tab connections without switching context.
- Combine tabs with saved views: each view remembers its tab, filters, and viewport.

---

**See also**: [Filters and views]({{< relref "filters-views" >}}), [Elements and links]({{< relref "elements-links" >}})
