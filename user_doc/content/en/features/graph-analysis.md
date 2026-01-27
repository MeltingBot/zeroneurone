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

**See also**: [Map view]({{< relref "map-view" >}})
