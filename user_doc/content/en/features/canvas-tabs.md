---
title: "Canvas Tabs"
weight: 4
---

# Canvas Tabs

Organize your dossier into **thematic workspaces**. Each tab contains a subset of elements, letting you split complex cases into focused views (e.g., "Financial flows", "Persons of interest", "Locations").

---

## Tab Bar

The tab bar appears below the toolbar as soon as at least one tab exists. It always includes the **All** view, which shows every element regardless of tab membership.

| Item | Description |
|------|-------------|
| **All** | Shows all elements in the dossier |
| **Named tabs** | User-created tabs, each with its own subset of elements |
| **+** | Creates a new tab |

---

## Managing Tabs

### Create a Tab

Click **+** in the tab bar. A new named tab is added. The maximum is **10** tabs per dossier.

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

Right-click an element or a selection, then the **Tabs** submenu:

| Action | Effect |
|--------|--------|
| **New tab with selection** | Creates a tab holding the selection and opens it. From inside a tab, the selection leaves its original tab |
| **Move to tab...** | The selection joins the chosen tab and leaves the open one (shown inside a tab only) |
| **Add to tab...** | The selection joins the chosen tab and also stays where it was |
| **Remove from tab** | The selection leaves the open tab |

These actions are undone with **Ctrl+Z**.

{{< hint info >}}
**An element may belong to no tab.** An element created in **All**, or removed from its last tab, stays in the dossier and visible in **All**. It is never filed into a tab automatically.
{{< /hint >}}

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

## Queries, Filters and Layout in a Tab

Inside a tab, everything applies to **its elements**:

| Feature | Behavior in a tab |
|---------|-------------------|
| **Queries and filters** | Results, counts, **Select** and **Invert** only cover the tab's elements. The query runs again when you switch tabs |
| **Arrange** | Only the tab's elements move, around their current position. The result is placed clear of the other elements of the dossier, so the **All** view stays readable |
| **Insights** | Clusters, centrality, bridges, isolated nodes, paths and cycles in the Insights panel cover the tab. "Find paths" from the right-click menu searches the whole dossier |
| **Counts** | The canvas toolbar shows the number of elements in the tab and of links between them |
| **Extensions** (OneNeurone...) | Receive the tab's elements |

{{< hint warning >}}
**Shared elements**: an element in several tabs has a single position. Arranging one tab moves it in the others too. The **Arrange** menu says so ("Includes N elements from other tabs").
{{< /hint >}}

In **All**, the **Filters** panel offers a **Tabs** filter: tick one or more tabs to keep only their elements, in every view (canvas, map, timeline, matrix).

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
| **Import new dossier** | Tabs are restored |
| **Import into existing dossier (merge)** | Imported elements go to the active tab; source tabs are not imported |

---

## Tips

- Use tabs to split a complex dossier by theme, hypothesis, or timeline period.
- The **All** view is always available and shows every element, regardless of tab assignment.
- Ghost elements let you see cross-tab connections without switching context.
- Combine tabs with saved views: each view remembers its tab, filters, and viewport.

---

**See also**: [Filters and views]({{< relref "filters-views" >}}), [Elements and links]({{< relref "elements-links" >}})
