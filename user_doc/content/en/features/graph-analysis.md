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
| **Click** | Selects all cluster members |
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
- **Sizing**: option to adjust size based on centrality

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
| **Circular** | Circle arrangement | Balanced overview |
| **Grid** | Regular alignment | Ordered organization |
| **Scatter** | Random distribution | Redistribute elements |

### Tips

- Use **Ctrl+Z** to undo a layout
- **Hierarchy** layout auto-detects roots (elements with no incoming links)
- **Force** layout adapts to graph size (optimized for large networks)

---

**See also**: [Map view]({{< relref "map-view" >}})
