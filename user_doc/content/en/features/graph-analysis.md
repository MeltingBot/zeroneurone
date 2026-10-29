---
title: "Graph Analysis"
weight: 4
---

# Graph Analysis

ZeroNeurone uses graph theory algorithms to reveal hidden patterns in your data.


## Insights Panel

Access analyses via the **Insights** panel (graph icon on the left).

### Refresh Analysis

Click **Refresh** to recalculate metrics after modifications.

---

## Clusters (Communities)

The Louvain algorithm automatically detects **communities**: groups of elements more connected to each other than to the rest of the graph.


### Usage

| Action | Result |
|--------|--------|
| **View** | List of clusters with their members |
| **Click** | Highlights the cluster and frames it on screen |
| **Color** | Applies a distinct color to each cluster |

### Interpretation

- A cluster can represent an organization, a network, an interest group
- Elements **between** clusters are often important **bridges**

---

## Centrality

**Centrality** measures the relative importance of each element in the network.

### Degree Centrality

Number of connections of an element.

| Degree | Interpretation |
|--------|----------------|
| High | Hub, main connector |
| Low | Peripheral, poorly connected |


### Betweenness Centrality

Frequency of passage on shortest paths.

| Betweenness | Interpretation |
|-------------|----------------|
| High | Critical intermediary, gatekeeper |
| Low | Not on main paths |


### Display

- **Sorted list** of elements by centrality
- **Click** to select and center on the element
- **Size by links**: turn on **Element size by number of links** in the **Views** tab of the side panel (**Canvas display** section) so that each element grows with its number of links

#### Element size by number of links

With this setting, an element is drawn larger according to its number of links: ×1.25 with 4 links, ×1.5 with 9, ×2 with 25, and at most ×3 from 81 links. An element with a single link keeps its size. The element grows around its center. Every link of the dossier counts, including those hidden by a filter or in another tab.

- The enlargement depends on the element's own links only: adding a link does not change the size of other elements. In a dossier where every element has many links, they all grow.
- The setting does not move elements: after turning it on, run the automatic layout again, which leaves room for the enlarged elements.
- Only the display changes: turning the setting off gives every element its usual size back. Automatic layout and the SVG export take it into account.
- The setting is personal: it is kept for this dossier on this device, and collaborators in a shared session keep their own display.
- An element resized by hand is enlarged from its own size. Resizing it while the setting is on sets its base size: it keeps following its links and returns to that size when the setting is off. Groups and annotations keep their size.

---

## Bridges

**Bridges** are elements that connect otherwise separate clusters.


### Importance

Removing a bridge would fragment the network. These elements are often:

- Key intermediaries
- Vulnerability points
- Multi-hat individuals

---

## Isolated Elements

List of elements **without any connection**.


### Actions

- Identify missing data (links to create)
- Clean up orphan elements
- Filter to focus on the connected network

---

## Potential duplicates

Pairs of elements with close names, which may be the same thing. Clicking the row selects both elements and frames the view on them (a second click deselects); clicking one of the two names selects that element and centres the view on it, the pair staying highlighted. **Merge** joins them.

- **Broad**: close names, typos included ("Jean Dupont" / "Jean Dupond").
- **Strict**: the same name, case and the writing of numbers aside (`06 39 98 33 17` = `0639983317`).

The choice is remembered. In both modes, two different numbers (`0639985018` and `0639985078`) are never offered: they are two lines, not a typo.

---

## Paths

Find the **shortest path** between two elements.


### Usage

1. Select two elements (Ctrl+click)
2. **Insights** → **Path**
3. The path is highlighted on the canvas

### Interpretation

- **Short path**: elements close in the network
- **Long path**: distant elements, few direct links
- **No path**: elements in separate components

### All paths

Enable **All paths** to enumerate **every route** between the two elements, not just the shortest one. Set the **maximum depth** (number of links, 1 to 8) to bound the search and avoid combinatorial explosion on dense networks. Every path found is listed (sorted shortest to longest); the union of all routes is highlighted on the canvas, and clicking a path in the list highlights that one only. Also available via right-click on two elements → **All paths**.

---

## Cycles

Detect **cycles** (closed loops of relationships, with no repeated element) in the network. Useful for spotting **circuits** — circular transaction chains, cross-shareholding structures, looping relationships.

### Usage

1. **Insights** → **Detect cycles**
2. Set the **maximum length** (number of elements in the loop, 3 to 10) to bound the search
3. Cycles found are listed (sorted shortest to longest); the union is highlighted on the canvas, clicking a cycle highlights that one only

On the canvas, only the links forming the cycles glow, with animated dashes. With **Respect link direction**, the dashes run the way the circuit goes, so it can be followed at a glance. Without it, a loop has no sense: the dashes go back and forth, as they do on a link two shown cycles walk in opposite senses. A relation between two elements of a cycle that is not part of it (a chord) stays plain. When the system asks for reduced motion, the dashes stay still.

Clicking an **element** in the list highlights its cycle, centres the view on it and gives it a stronger glow, so you can spot where it sits in the loop at a glance. Clicking elsewhere on the row goes back to the cycle alone.

Each cycle is listed once (equivalent rotations and traversal directions are deduplicated). By default the search is **undirected**: the loop exists regardless of link direction.

Check **Respect link direction** to keep only **directed circuits** — each link must be crossed in its own direction (A→B→C→A following the arrows). This is the relevant mode for financial circuits or flows. A `forward` link is only crossable from source to target, a `backward` link only the other way; **undirected** (or bidirectional) links stay crossable both ways and therefore do not block a circuit.

---

## Global Metrics

| Metric | Description |
|--------|-------------|
| **Nodes** | Total number of elements |
| **Links** | Total number of connections |
| **Density** | Ratio existing links / possible links |
| **Components** | Number of disconnected subgraphs |
| **Diameter** | Longest of shortest paths |


---

## Automatic Layouts

Automatically rearrange elements using different algorithms via the **Arrange** button in the toolbar.

### Layout Types

| Layout | Description | Use case |
|--------|-------------|----------|
| **Force (clusters)** | Physics-based algorithm grouping connected elements | Visualize communities |
| **Hierarchy** | Level-based organization (trees, org charts) | Hierarchical structures |
| **Circular** | Circle arrangement (1,000 elements at most) | Balanced overview |
| **Grid** | Regular alignment | Ordered organization |
| **Scatter** | Random distribution | Redistribute elements |

### Tips

- Use **Ctrl+Z** to undo a layout
- Above 1,000 elements, **Circular** is greyed out: a single circle would be wider than the screen, even at the smallest zoom. Select part of the elements (or work in a tab) to use it
- **Hierarchy** layout auto-detects roots (elements with no incoming links)
- **Force** layout adapts to graph size (optimized for large networks). Elements with a single link are set in rings around the element they hang from, level by level (a group and its items around a hub): a highly linked element stays readable instead of scattering its neighbours
- A **group** moves as one block with its elements, whatever the layout
- Selecting only elements of the same group arranges them **inside** the group

---

**See also**: [Map view]({{< relref "map-view" >}})
