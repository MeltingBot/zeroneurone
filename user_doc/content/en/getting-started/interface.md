---
title: "The Interface"
weight: 2
---

# Understanding the Interface

ZeroNeurone's interface is organized around the central canvas, with contextual side panels.


## Main Areas

### 1. Top Toolbar


| Icon | Action |
|------|--------|
| ← | Return to dossier list |
| Name | Dossier name (click to rename) |
| 🔍 | Quick search (Ctrl+K) |
| Views | Toggle Canvas / Map / Timeline |
| ⇄ | Cycle panel position (right / bottom / left / detached) |
| ⋯ | Menu: Export, Import, Settings |

### 2. Central Canvas

Main workspace where you create and organize your elements.

- **Zoom**: Mouse wheel or pinch
- **Pan**: Click-drag on the background
- **Selection**: Click on an element or draw a selection rectangle

### 3. Side Panel

The unified panel contains all tabs:

| Tab | Function |
|-----|----------|
| **Detail** | Metadata, tags, properties, files, connections |
| **Filters** | Filter by tags, confidence, properties |
| **Insights** | Graph analysis (clusters, centrality) |
| **Views** | Save/load configurations |
| **Report** | Write and export reports |

#### Panel Position

The ⇄ button in the toolbar cycles through 4 positions:

| Position | Description |
|----------|-------------|
| **Right** | Default position, panel on the right of the canvas |
| **Bottom** | Panel at the bottom, DevTools-style — vertically resizable |
| **Left** | Panel on the left |
| **Detached** | Separate window — ideal for multi-monitor setups |

The choice is remembered across sessions (except detached mode, which resets to right on reload).


## View Modes

ZeroNeurone offers 4 visualization modes:

| Key | Mode | Description |
|-----|------|-------------|
| **1** | Canvas | Default graph view |
| **2** | Map | Geolocated elements on map |
| **3** | Timeline | Chronological view |
| **4** | Matrix | Sortable, filterable spreadsheet |


## Keyboard Navigation

| Shortcut | Action |
|----------|--------|
| Ctrl+K | Quick search |
| Delete | Delete selection |
| Ctrl+Z | Undo |
| Ctrl+Shift+Z | Redo |
| F | Focus mode (neighborhood) |
| Escape | Deselect / Close |
| 1-4 | Change view mode |

---

**Next step**: [Elements and links]({{< relref "../features/elements-links" >}})
